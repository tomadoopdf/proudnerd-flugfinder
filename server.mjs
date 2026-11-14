// ProudNerdFlugfinder – lokaler Server.
// KI: ChatGPT über "Sign in with ChatGPT" (nutzt das ChatGPT-Plus/Pro-Abo der angemeldeten Person).
// OpenAI erlaubt dafür nur eine Rücksprungadresse auf 127.0.0.1, deshalb läuft die Anmeldung nur lokal.
// Optional: Duffel für echte, buchbare Flugpreise.
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";
const DUFFEL_TOKEN = process.env.DUFFEL_TOKEN || "";
const DATA_DIR = path.join(here, "data");
const AUTH_FILE = path.join(DATA_DIR, "chatgpt-auth.json");
const LEGACY_STATE = path.join(DATA_DIR, "state.json");

// ---------- Sign in with ChatGPT (OpenID Connect + PKCE, Open-Source-Direktfluss) ----------
const OAI = {
  authorize: "https://auth.openai.com/api/accounts/authorize",
  token: "https://auth.openai.com/api/accounts/oauth/token",
  resource: "https://api.openai.com/v1",
  scope: "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
  appName: "ProudNerdFlugfinder",
};
const REDIRECT = `http://127.0.0.1:${PORT}/auth/callback`;
const pending = new Map(); // state -> { verifier, nonce, created }

async function readAuth() { try { return JSON.parse(await fs.readFile(AUTH_FILE, "utf8")); } catch { return {}; } }
async function writeAuth(a) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = AUTH_FILE + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(a, null, 1), { mode: 0o600 });
  await fs.rename(tmp, AUTH_FILE);
  await fs.chmod(AUTH_FILE, 0o600).catch(() => {});
}
const b64url = (buf) => Buffer.from(buf).toString("base64url");
function jwtPayload(jwt) { try { return JSON.parse(Buffer.from(String(jwt).split(".")[1], "base64url").toString("utf8")); } catch { return {}; } }

async function loginUrl() {
  const auth = await readAuth();
  if (!auth.hostId) { auth.hostId = "urn:uuid:" + crypto.randomUUID(); await writeAuth(auth); }
  const state = b64url(crypto.randomBytes(24)), nonce = b64url(crypto.randomBytes(24)), verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  pending.set(state, { verifier, nonce, created: Date.now() });
  for (const [k, v] of pending) if (Date.now() - v.created > 15 * 60e3) pending.delete(k);
  const p = new URLSearchParams({
    response_type: "code", redirect_uri: REDIRECT, scope: OAI.scope, resource: OAI.resource,
    state, nonce, code_challenge_method: "S256", code_challenge: challenge, ext_agent_host_id: auth.hostId,
  });
  if (auth.clientId) { p.set("client_id", auth.clientId); if (auth.idToken) p.set("id_token_hint", auth.idToken); }
  else { p.set("client_id", "dynamic_agent_client"); p.set("agent_name_hint", OAI.appName); }
  return `${OAI.authorize}?${p}`;
}

async function tokenRequest(fields) {
  const r = await fetch(OAI.token, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: new URLSearchParams(fields) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error_description || j.error || `Anmeldung fehlgeschlagen (${r.status})`), { status: 401 });
  return j;
}
function saveTokens(auth, t) {
  auth.accessToken = t.access_token;
  if (t.refresh_token) auth.refreshToken = t.refresh_token;
  if (t.id_token) auth.idToken = t.id_token;
  auth.scope = t.scope || auth.scope || "";
  auth.expiresAt = Date.now() + (Number(t.expires_in) || 3600) * 1000;
  const claims = jwtPayload(auth.idToken);
  auth.email = claims.email || auth.email || "";
  auth.name = claims.name || auth.name || "";
}

async function handleCallback(url) {
  const q = url.searchParams;
  if (q.get("error")) throw Object.assign(new Error(q.get("error_description") || q.get("error")), { status: 400 });
  const st = pending.get(q.get("state") || "");
  if (!st) throw Object.assign(new Error("Anmeldung abgelaufen oder ungültig. Bitte erneut anmelden."), { status: 400 });
  pending.delete(q.get("state"));
  const auth = await readAuth();
  if (q.get("client_id")) auth.clientId = q.get("client_id");
  if (!auth.clientId) throw Object.assign(new Error("OpenAI hat keine Client-ID geliefert."), { status: 400 });
  const t = await tokenRequest({ grant_type: "authorization_code", client_id: auth.clientId, code: q.get("code") || "", code_verifier: st.verifier, redirect_uri: REDIRECT, resource: OAI.resource });
  const claims = jwtPayload(t.id_token);
  if (claims.nonce && claims.nonce !== st.nonce) throw Object.assign(new Error("Sicherheitsprüfung (nonce) fehlgeschlagen."), { status: 400 });
  if (claims.iss && !String(claims.iss).startsWith("https://auth.openai.com")) throw Object.assign(new Error("Unerwarteter Aussteller des Tokens."), { status: 400 });
  saveTokens(auth, t);
  await writeAuth(auth);
  return auth;
}

async function accessToken() {
  const auth = await readAuth();
  if (!auth.accessToken) throw Object.assign(new Error("Nicht mit ChatGPT angemeldet."), { status: 401, code: "not_signed_in" });
  if (Date.now() > (auth.expiresAt || 0) - 120e3) {
    if (!auth.refreshToken) throw Object.assign(new Error("Anmeldung abgelaufen. Bitte erneut mit ChatGPT anmelden."), { status: 401, code: "not_signed_in" });
    try { saveTokens(auth, await tokenRequest({ grant_type: "refresh_token", client_id: auth.clientId, refresh_token: auth.refreshToken, resource: OAI.resource })); await writeAuth(auth); }
    catch { delete auth.accessToken; delete auth.refreshToken; await writeAuth(auth); throw Object.assign(new Error("Anmeldung abgelaufen. Bitte erneut mit ChatGPT anmelden."), { status: 401, code: "not_signed_in" }); }
  }
  return auth;
}
const planOk = (auth) => String(auth.scope || "").split(/[\s+]+/).includes("chatgpt.tokens.use.direct");

// ---------- ChatGPT: models + one Responses-API request (store=false, stream=true) ----------
async function listModels() {
  const auth = await accessToken();
  const r = await fetch(`${OAI.resource}/models`, { headers: { Authorization: `Bearer ${auth.accessToken}` } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error?.message || `Modelle nicht abrufbar (${r.status})`), { status: 502 });
  const models = (j.data || []).filter((m) => !m.visibility || m.visibility === "list").map((m) => ({ id: m.id, name: m.display_name || m.id }));
  return { models, selected: auth.model && models.some((m) => m.id === auth.model) ? auth.model : models[0]?.id || null };
}
const USAGE_ERRORS = {
  subscription_sharing_usage_limit_exceeded: "Das Kontingent deines ChatGPT-Abos für Apps ist für diesen Zeitraum aufgebraucht. Später erneut versuchen oder das Limit in den ChatGPT-Einstellungen prüfen.",
  subscription_sharing_usage_unavailable: "Dein ChatGPT-Abo kann gerade nicht für Apps genutzt werden. Prüfe, ob du Plus oder Pro hast und die Freigabe für diese App erteilt ist.",
};
async function ask({ instructions, text, image }) {
  const auth = await accessToken();
  if (!planOk(auth)) throw Object.assign(new Error("Bei der Anmeldung wurde die Nutzung deines ChatGPT-Abos nicht freigegeben. Bitte abmelden und erneut anmelden und die Freigabe erlauben."), { status: 403 });
  let model = auth.model;
  if (!model) { const m = await listModels(); model = m.selected; }
  if (!model) throw Object.assign(new Error("Für dein Konto ist kein Modell verfügbar."), { status: 502 });
  const content = [{ type: "input_text", text: String(text || "").slice(0, 200000) }];
  if (image?.data) content.unshift({ type: "input_image", image_url: `data:${image.media_type || "image/jpeg"};base64,${image.data}` });
  const r = await fetch(`${OAI.resource}/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${auth.accessToken}`, "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ model, instructions: String(instructions || "").slice(0, 60000), input: [{ role: "user", content }], store: false, stream: true }),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    const code = j.error?.code || j.error?.type || "";
    throw Object.assign(new Error(USAGE_ERRORS[code] || j.error?.message || `ChatGPT-Fehler ${r.status}`), { status: r.status === 401 ? 401 : r.status === 429 ? 429 : 502 });
  }
  // read the server-sent events until response.completed
  let text_ = "", done = false, buf = "";
  const dec = new TextDecoder();
  for await (const chunk of r.body) {
    buf += dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, i); buf = buf.slice(i + 2);
      const data = block.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
      if (!data || data === "[DONE]") continue;
      let ev; try { ev = JSON.parse(data); } catch { continue; }
      if (ev.type === "response.output_text.delta") text_ += ev.delta || "";
      else if (ev.type === "response.completed") { done = true; if (!text_) text_ = (ev.response?.output || []).flatMap((o) => o.content || []).filter((c) => c.type === "output_text").map((c) => c.text).join(""); }
      else if (ev.type === "response.failed" || ev.type === "error") {
        const e = ev.response?.error || ev.error || ev;
        throw Object.assign(new Error(USAGE_ERRORS[e.code] || e.message || "ChatGPT-Anfrage fehlgeschlagen."), { status: 502 });
      }
    }
  }
  if (!done) throw Object.assign(new Error("ChatGPT-Antwort wurde nicht vollständig übertragen. Bitte erneut versuchen."), { status: 502 });
  return { text: text_, model };
}

// ---------- Duffel: real flight offers ----------
const isoMin = (s) => { const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/.exec(s || ""); return m ? (+(m[1] || 0)) * 1440 + (+(m[2] || 0)) * 60 + (+(m[3] || 0)) : 0; };
function passengers({ adt = 1, chd = 0, inf = 0 }) {
  const p = [];
  for (let i = 0; i < adt; i++) p.push({ type: "adult" });
  for (let i = 0; i < chd; i++) p.push({ age: 8 });
  for (let i = 0; i < inf; i++) p.push({ age: 1 });
  return p;
}
const CABIN = { eco: "economy", pe: "premium_economy", bus: "business", first: "first" };
function mapSlice(sl) {
  return {
    o: sl.origin?.iata_code, d: sl.destination?.iata_code, durationMin: isoMin(sl.duration),
    segments: (sl.segments || []).map((s) => ({
      o: s.origin?.iata_code, d: s.destination?.iata_code, dep: s.departing_at, arr: s.arriving_at,
      fn: (s.marketing_carrier?.iata_code || "") + (s.marketing_carrier_flight_number || ""),
      carrier: s.marketing_carrier?.iata_code, carrierName: s.marketing_carrier?.name,
      checkedBags: (s.passengers?.[0]?.baggages || []).filter((b) => b.type === "checked").reduce((a, b) => a + (b.quantity || 0), 0),
    })),
  };
}
function mapOffer(o) {
  return {
    id: o.id, expiresAt: o.expires_at, price: Number(o.total_amount), currency: o.total_currency,
    carrier: o.owner?.iata_code, carrierName: o.owner?.name,
    changeable: Boolean(o.conditions?.change_before_departure?.allowed), refundable: Boolean(o.conditions?.refund_before_departure?.allowed),
    slices: (o.slices || []).map(mapSlice),
  };
}
async function duffelSearch(slices, pax, cabin, maxConnections) {
  const r = await fetch("https://api.duffel.com/air/offer_requests?return_offers=true&supplier_timeout=20000", {
    method: "POST",
    headers: { Authorization: `Bearer ${DUFFEL_TOKEN}`, "Duffel-Version": "v2", "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ data: { slices: slices.map((l) => ({ origin: l.o, destination: l.d, departure_date: l.date })), passengers: passengers(pax), cabin_class: CABIN[cabin] || "economy", max_connections: Math.max(0, Math.min(2, maxConnections ?? 1)) } }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.errors?.[0]?.message || `Duffel-Fehler ${r.status}`), { status: r.status === 401 ? 401 : 502 });
  return (j.data?.offers || []).map(mapOffer).sort((a, b) => a.price - b.price);
}
async function flights(body) {
  const { legs = [], pax = {}, cabin = "eco", maxStops = 1, wholeTrip = true, only } = body;
  const valid = legs.map((l, i) => ({ ...l, i })).filter((l) => /^[A-Z]{3}$/.test(l.o) && /^[A-Z]{3}$/.test(l.d) && /^\d{4}-\d{2}-\d{2}$/.test(l.date));
  const pick = Array.isArray(only) ? valid.filter((l) => only.includes(l.i)) : valid;
  const perLeg = {};
  await Promise.all(pick.map(async (l) => {
    try { perLeg[l.i] = { offers: (await duffelSearch([l], pax, cabin, maxStops)).slice(0, 8) }; }
    catch (e) { perLeg[l.i] = { error: e.message }; }
  }));
  let trip = null;
  if (wholeTrip && !only && valid.length >= 2 && valid.length === legs.length) {
    try { trip = { offers: (await duffelSearch(valid, pax, cabin, maxStops)).slice(0, 5) }; }
    catch (e) { trip = { error: e.message }; }
  }
  return { at: Date.now(), perLeg, trip };
}

// ---------- server ----------
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
function send(res, status, body, type = "application/json; charset=utf-8", extra = {}) {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
async function readJson(req, limit = 15 * 1024 * 1024) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > limit) throw Object.assign(new Error("Anfrage zu groß"), { status: 413 }); chunks.push(c); }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}
// Only this computer may use the signed-in ChatGPT account: reject requests from other origins.
function sameOrigin(req) {
  const o = req.headers.origin;
  return !o || o === `http://127.0.0.1:${PORT}` || o === `http://localhost:${PORT}`;
}
const page = (title, msg) => `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font-family:system-ui;padding:40px;background:#0b1222;color:#e7ecf6"><h2>${title}</h2><p>${msg}</p><p><a style="color:#e8a933" href="/">Zurück zum ProudNerdFlugfinder</a></p>`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  try {
    if (url.pathname === "/auth/login") {
      if (req.headers.host && !req.headers.host.startsWith("127.0.0.1")) return send(res, 302, "", "text/plain", { Location: `http://127.0.0.1:${PORT}/auth/login` });
      return send(res, 302, "", "text/plain", { Location: await loginUrl() });
    }
    if (url.pathname === "/auth/callback") {
      try { await handleCallback(url); return send(res, 302, "", "text/plain", { Location: "/#chatgpt-ok" }); }
      catch (e) { return send(res, e.status || 400, page("Anmeldung nicht abgeschlossen", String(e.message).replace(/</g, "&lt;")), "text/html; charset=utf-8"); }
    }
    if (url.pathname.startsWith("/api/")) {
      if (!sameOrigin(req)) return send(res, 403, { error: "Nur von diesem Rechner aus erlaubt." });
      if (url.pathname === "/api/status") {
        const a = await readAuth();
        return send(res, 200, { local: true, chatgpt: { signedIn: Boolean(a.accessToken || a.refreshToken), email: a.email || "", name: a.name || "", plan: planOk(a), model: a.model || null }, duffel: Boolean(DUFFEL_TOKEN), duffelMode: DUFFEL_TOKEN.startsWith("duffel_test") ? "test" : DUFFEL_TOKEN ? "live" : null, loginUrl: `http://127.0.0.1:${PORT}/auth/login` });
      }
      if (url.pathname === "/api/state" && req.method === "GET") { try { return send(res, 200, { state: JSON.parse(await fs.readFile(LEGACY_STATE, "utf8")) }); } catch { return send(res, 200, { state: null }); } }
      if (req.method !== "POST" && url.pathname !== "/api/models") return send(res, 405, { error: "Methode nicht erlaubt" });
      if (url.pathname === "/api/models") return send(res, 200, await listModels());
      if (url.pathname === "/api/model") { const b = await readJson(req); const a = await readAuth(); a.model = String(b.model || "") || null; await writeAuth(a); return send(res, 200, { ok: true }); }
      if (url.pathname === "/api/logout") { const a = await readAuth(); await writeAuth({ hostId: a.hostId, clientId: a.clientId }); return send(res, 200, { ok: true }); }
      if (url.pathname === "/api/ai") return send(res, 200, await ask(await readJson(req)));
      if (url.pathname === "/api/flights") {
        if (!DUFFEL_TOKEN) return send(res, 503, { error: "Kein Duffel-Token konfiguriert (DUFFEL_TOKEN in .env)." });
        return send(res, 200, await flights(await readJson(req)));
      }
      return send(res, 404, { error: "Unbekannter Endpunkt" });
    }
    const rel = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const file = path.resolve(here, "public", rel);
    if (!file.startsWith(path.resolve(here, "public") + path.sep)) return send(res, 403, "Verboten", "text/plain");
    const data = await fs.readFile(file).catch(() => null);
    if (!data) return send(res, 404, "Nicht gefunden", "text/plain");
    return send(res, 200, data, MIME[path.extname(file)] || "application/octet-stream");
  } catch (e) {
    if (!e.status) console.error(e);
    return send(res, e.status || 500, { error: e.message || "Serverfehler", code: e.code });
  }
});
server.listen(PORT, HOST, () => {
  console.log(`ProudNerdFlugfinder läuft: http://127.0.0.1:${PORT}`);
  console.log(`  ChatGPT: Anmeldung in der App unter Einstellungen → „Mit ChatGPT anmelden“`);
  console.log(`  Duffel:  ${DUFFEL_TOKEN ? "aktiv" : "aus – nur Schätzpreise"}`);
  if (HOST !== "127.0.0.1" && HOST !== "localhost") console.warn("  WARNUNG: Die ChatGPT-Anmeldung funktioniert nur lokal. Server nicht öffentlich betreiben.");
});
