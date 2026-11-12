// ProudNerdFlugfinder – eigenständiger Server.
// Läuft mit deinem eigenen Anthropic-API-Key (kein Claude-Abo nötig)
// und optional mit Duffel für echte, buchbare Flugpreise.
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";
const APP_TOKEN = process.env.APP_TOKEN || "";
const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
const DUFFEL_TOKEN = process.env.DUFFEL_TOKEN || "";
const DATA_FILE = path.join(here, "data", "state.json");

const hasClaude = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
const client = hasClaude ? new Anthropic() : null;

// ---------- helpers ----------
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
async function readJson(req, limit = 15 * 1024 * 1024) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > limit) throw Object.assign(new Error("Anfrage zu groß"), { status: 413 }); chunks.push(c); }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}
function authorized(req) {
  if (!APP_TOKEN) return true;
  return (req.headers.authorization || "") === `Bearer ${APP_TOKEN}`;
}
function parseJsonText(text) {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const start = t.search(/[[{]/);
  return JSON.parse(start > 0 ? t.slice(start) : t);
}
function claudeError(e) {
  if (e instanceof Anthropic.AuthenticationError) return { status: 401, error: "Anthropic-API-Key ungültig. Prüfe ANTHROPIC_API_KEY in .env." };
  if (e instanceof Anthropic.RateLimitError) return { status: 429, error: "Rate-Limit bei Anthropic erreicht. Kurz warten." };
  if (e instanceof Anthropic.BadRequestError) return { status: 400, error: "Anfrage abgelehnt: " + e.message };
  if (e instanceof Anthropic.APIStatusError) return { status: 502, error: `Anthropic-Fehler ${e.status}: ${e.message}` };
  if (e instanceof Anthropic.APIConnectionError) return { status: 502, error: "Keine Verbindung zu Anthropic." };
  return { status: 500, error: e.message || "Unbekannter Fehler" };
}
// Common request options: refusal fallbacks enabled by default.
const baseParams = () => ({
  model: MODEL,
  max_tokens: 16000,
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
});

// ---------- Claude: one step of the chat tool loop (tools run in the browser) ----------
async function claudeStep(body) {
  const { system, messages, tools } = body;
  if (!Array.isArray(messages) || !messages.length) throw Object.assign(new Error("messages fehlt"), { status: 400 });
  const response = await client.beta.messages.create({
    ...baseParams(),
    system: [{ type: "text", text: String(system || "").slice(0, 60000), cache_control: { type: "ephemeral" } }],
    messages,
    tools: Array.isArray(tools) ? tools.slice(0, 12) : undefined,
    output_config: { effort: "medium" },
  });
  return { content: response.content, stop_reason: response.stop_reason, stop_details: response.stop_details ?? null, model: response.model };
}

// ---------- Claude: structured extraction (passport scan, text parsing) ----------
async function claudeJson(body) {
  const { prompt, image } = body;
  const content = [];
  if (image && image.data) {
    const mt = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(image.media_type) ? image.media_type : "image/jpeg";
    content.push({ type: "image", source: { type: "base64", media_type: mt, data: image.data } });
  }
  content.push({ type: "text", text: String(prompt || "").slice(0, 200000) });
  const response = await client.beta.messages.create({
    ...baseParams(),
    messages: [{ role: "user", content }],
    output_config: { effort: image ? "high" : "low" },
  });
  if (response.stop_reason === "refusal") return { error: "Die Anfrage wurde abgelehnt." };
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  try { return { data: parseJsonText(text) }; } catch { return { error: "Antwort war kein gültiges JSON.", raw: text.slice(0, 2000) }; }
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
  const segs = sl.segments || [];
  return {
    o: sl.origin?.iata_code, d: sl.destination?.iata_code,
    durationMin: isoMin(sl.duration),
    segments: segs.map((s) => ({
      o: s.origin?.iata_code, d: s.destination?.iata_code, dep: s.departing_at, arr: s.arriving_at,
      fn: (s.marketing_carrier?.iata_code || "") + (s.marketing_carrier_flight_number || ""),
      carrier: s.marketing_carrier?.iata_code, carrierName: s.marketing_carrier?.name,
      checkedBags: (s.passengers?.[0]?.baggages || []).filter((b) => b.type === "checked").reduce((a, b) => a + (b.quantity || 0), 0),
    })),
  };
}
function mapOffer(o) {
  return {
    id: o.id, expiresAt: o.expires_at,
    price: Number(o.total_amount), currency: o.total_currency,
    carrier: o.owner?.iata_code, carrierName: o.owner?.name,
    changeable: Boolean(o.conditions?.change_before_departure?.allowed),
    refundable: Boolean(o.conditions?.refund_before_departure?.allowed),
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
  // one-way offers per leg (mix & match)
  await Promise.all(pick.map(async (l) => {
    try { perLeg[l.i] = { offers: (await duffelSearch([l], pax, cabin, maxStops)).slice(0, 8) }; }
    catch (e) { perLeg[l.i] = { error: e.message }; }
  }));
  // one multi-city ticket for the whole route
  let trip = null;
  if (wholeTrip && !only && valid.length >= 2 && valid.length === legs.length) {
    try { trip = { offers: (await duffelSearch(valid, pax, cabin, maxStops)).slice(0, 5) }; }
    catch (e) { trip = { error: e.message }; }
  }
  return { at: Date.now(), perLeg, trip };
}

// ---------- state: read-only import of data saved by older versions (data now lives in the browser) ----------
async function getState() { try { return JSON.parse(await fs.readFile(DATA_FILE, "utf8")); } catch { return null; } }

// ---------- server ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (url.pathname.startsWith("/api/")) {
      if (url.pathname === "/api/status") return send(res, 200, { claude: hasClaude, model: MODEL, duffel: Boolean(DUFFEL_TOKEN), duffelMode: DUFFEL_TOKEN.startsWith("duffel_test") ? "test" : DUFFEL_TOKEN ? "live" : null, auth: Boolean(APP_TOKEN) });
      if (!authorized(req)) return send(res, 401, { error: "Zugangscode fehlt oder ist falsch." });
      if (url.pathname === "/api/state" && req.method === "GET") return send(res, 200, { state: await getState() });
      if (req.method !== "POST") return send(res, 405, { error: "Methode nicht erlaubt" });
      if (url.pathname === "/api/claude" || url.pathname === "/api/json") {
        if (!client) return send(res, 503, { error: "Kein Anthropic-API-Key konfiguriert (ANTHROPIC_API_KEY in .env)." });
        const b = await readJson(req);
        try { return send(res, 200, url.pathname === "/api/claude" ? await claudeStep(b) : await claudeJson(b)); }
        catch (e) { const { status, error } = claudeError(e); return send(res, e.status || status, { error }); }
      }
      if (url.pathname === "/api/flights") {
        if (!DUFFEL_TOKEN) return send(res, 503, { error: "Kein Duffel-Token konfiguriert (DUFFEL_TOKEN in .env)." });
        return send(res, 200, await flights(await readJson(req)));
      }
      return send(res, 404, { error: "Unbekannter Endpunkt" });
    }
    // static files
    const rel = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const file = path.resolve(here, "public", rel);
    if (!file.startsWith(path.resolve(here, "public") + path.sep)) return send(res, 403, "Verboten", "text/plain");
    const data = await fs.readFile(file).catch(() => null);
    if (!data) return send(res, 404, "Nicht gefunden", "text/plain");
    return send(res, 200, data, MIME[path.extname(file)] || "application/octet-stream");
  } catch (e) {
    console.error(e);
    return send(res, e.status || 500, { error: e.message || "Serverfehler" });
  }
});
server.listen(PORT, HOST, () => {
  console.log(`ProudNerdFlugfinder läuft auf http://${HOST}:${PORT}`);
  console.log(`  Claude: ${hasClaude ? "aktiv (" + MODEL + ")" : "AUS – ANTHROPIC_API_KEY fehlt"}`);
  console.log(`  Duffel: ${DUFFEL_TOKEN ? "aktiv" : "AUS – nur Tarifmodell"}`);
  if (!APP_TOKEN && HOST !== "127.0.0.1" && HOST !== "localhost") console.warn("  WARNUNG: Server ist von außen erreichbar, aber APP_TOKEN ist nicht gesetzt.");
});
