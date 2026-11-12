/* ProudNerdFlugfinder – Oberfläche. Nutzt engine.js (Tarifmodell, Pass-Prüfung) und den eigenen Server (/api/*). */

/* ========== STATE ========== */
const today=(()=>{const d=new Date();d.setHours(0,0,0,0);return d})();
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function iso(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
const dOf=s=>new Date(s+'T00:00:00');
const S={
  trip:{
    legs:[
      {o:'MUC',d:'JFK',date:iso(addDays(today,34)),flex:1},
      {o:'JFK',d:'LAX',date:iso(addDays(today,38)),flex:1},
      {o:'LAX',d:'HND',date:iso(addDays(today,42)),flex:1},
      {o:'HND',d:'SIN',date:iso(addDays(today,46)),flex:1},
      {o:'SIN',d:'DXB',date:iso(addDays(today,50)),flex:1},
      {o:'DXB',d:'LHR',date:iso(addDays(today,53)),flex:0},
    ],
    adt:4,chd:0,inf:0,cabin:'bus',maxStops:1,bCabin:1,bChecked:2,bSpecial:1,budget:75000,stab:0.5,flex:false,oneTicket:false,
  },
  example:true,
  rules:[],pax:[{id:'p1',name:'Beispiel-Artist',role:'Artist'},{id:'p2',name:'Beispiel-Manager',role:'Management'}],
  passports:[],history:[],chat:[],consent:{},
  sel:{},plan:'best',live:{},open:{},
};
let RESULTS=null,curTab='plan';

/* ========== API & STORAGE ========== */
let STATUS={claude:false,duffel:false},TOKEN='',saveT=null;
try{TOKEN=localStorage.getItem('pnf-token')||''}catch{}
async function api(path,body,method){
  const r=await fetch(path.replace(/^\//,''),{method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json',...(TOKEN?{Authorization:'Bearer '+TOKEN}:{})},body:body?JSON.stringify(body):undefined});
  const j=await r.json().catch(()=>({}));
  if(r.status===401&&STATUS.auth){setTab('set');throw new Error('Zugangscode nötig (Einstellungen).')}
  if(!r.ok)throw new Error(j.error||('Serverfehler '+r.status));
  return j;
}
async function apiJson(prompt,image){const j=await api('api/json',{prompt,image});if(j.error)throw new Error(j.error);return j.data}
function snapState(){return {trip:S.trip,example:S.example,rules:S.rules,pax:S.pax,passports:S.passports,history:S.history,consent:S.consent,chat:S.chat.map(c=>({r:c.r,t:c.t,sugg:c.sugg}))}}
// Alle Daten bleiben im Browser dieses Geräts (kostenlos, kein Server-Speicher nötig).
const STORE_KEY='pnf-state-v1';
function save(){clearTimeout(saveT);saveT=setTimeout(()=>{
  try{localStorage.setItem('pnf-ui',JSON.stringify({tab:curTab}))}catch{}
  try{localStorage.setItem(STORE_KEY,JSON.stringify(snapState()));$('#hs-store').textContent='auf Gerät'}
  catch{$('#hs-store').textContent='nicht gesichert'}
},400)}
function applyState(state){for(const k of Object.keys(snapState()))if(state&&state[k]!=null)S[k]=state[k]}
async function load(){
  let stored=null;try{stored=JSON.parse(localStorage.getItem(STORE_KEY)||'null')}catch{}
  if(stored){applyState(stored);$('#hs-store').textContent='auf Gerät'}else $('#hs-store').textContent='neu';
  // server is optional: on a static host (GitHub Pages) there is none
  try{const c=new AbortController();setTimeout(()=>c.abort(),6000);const r=await fetch('api/status',{signal:c.signal});STATUS=r.ok?await r.json():{claude:false,duffel:false,static:true}}catch{STATUS={claude:false,duffel:false,static:true}}
  // one-time import of data saved by an older server version
  if(!stored&&!STATUS.static){try{const {state}=await api('api/state');if(state){applyState(state);save()}}catch{}}
  $('#chat-state').textContent=STATUS.claude?'CLAUDE AKTIV':'ASSISTENT';
  bindTrip();renderLegs();search();renderChat();renderPerms();
}
function exportData(withPassports){
  const data={app:'ProudNerdFlugfinder',version:1,exportedAt:new Date().toISOString(),...snapState()};
  if(!withPassports)data.passports=[];
  data.consent={};
  const blob=new Blob([JSON.stringify(data,null,1)],{type:'application/json'});
  const name=`Tour_${S.trip.legs[0]?.o||''}-${S.trip.legs.at(-1)?.d||''}_${iso(new Date())}.json`;
  const url=URL.createObjectURL(blob),a=el('a',{href:url,download:name});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);
  toast('Gespeichert: '+name+(withPassports?' (mit Passdaten, vertraulich behandeln)':''),4000);
}
async function importData(file){
  try{const d=JSON.parse(await file.text());if(d.app!=='ProudNerdFlugfinder'||!d.trip)throw new Error('Keine ProudNerdFlugfinder-Datei.');
    const keepConsent=S.consent;applyState(d);S.consent=keepConsent;S.live={};S.sel={};save();bindTrip();renderLegs();search();renderChat();renderPerms();setTab('plan');toast('Tour importiert.')}
  catch(e){toast('Import fehlgeschlagen: '+e.message,4000)}
}

/* ========== CONSENT ========== */
const PERMS=[
  ['claude','Claude (Anthropic API)','Chat-Anfragen, gelernte Vorlieben und Pass-Scan. Läuft über deinen eigenen API-Key auf dem Server.'],
  ['duffel','Duffel (Live-Flugpreise)','Holt echte, buchbare Angebote je Flug und als Multi-City-Gesamtticket.'],
  ['camera','Kamera','Passfoto direkt mit dem Handy aufnehmen. Alternativ Foto hochladen.'],
];
function consent(k){
  if(S.consent[k]==='granted')return Promise.resolve(true);
  const p=PERMS.find(x=>x[0]===k);
  return new Promise(res=>{
    const close=v=>{dlg.remove();S.consent[k]=v?'granted':'denied';save();renderPerms();res(v)};
    const dlg=el('div',{class:'modal',role:'dialog','aria-modal':'true','aria-labelledby':'mdl-h'},el('div',{class:'card'},
      el('h2',{id:'mdl-h'},'Zugriff erlauben?'),el('p',{},el('strong',{},p[1])),el('p',{class:'note'},p[2]),
      el('div',{class:'row',style:'margin-top:14px'},el('button',{onclick:()=>close(false)},'Nicht erlauben'),el('button',{class:'primary',onclick:()=>close(true)},'Erlauben'))));
    document.body.append(dlg);dlg.querySelector('.primary').focus();
  });
}

/* ========== TOUR EDITOR ========== */
function setLegCount(n){
  n=Math.max(1,Math.min(12,n));const L=S.trip.legs;
  while(L.length<n){const last=L.at(-1);L.push({o:last?last.d:'',d:'',date:last?iso(addDays(dOf(last.date),3)):iso(addDays(today,30)),flex:1})}
  L.length=n;S.example=false;save();renderLegs();search();
}
function renderLegs(){
  const t=$('#legs');t.innerHTML='';
  t.append(el('thead',{},el('tr',{},...['#','Von','Nach','Datum','Flex',''].map(h=>el('th',{},h)))));
  const tb=el('tbody');
  S.trip.legs.forEach((l,i)=>{
    const code=(k)=>{const inp=el('input',{class:'code',value:l[k],list:'airports',maxlength:3,'aria-label':(k==='o'?'Von':'Nach')+', Flug '+(i+1),placeholder:'IATA'});
      inp.addEventListener('change',()=>{l[k]=inp.value.trim().toUpperCase().slice(0,3);if(k==='d'&&S.trip.legs[i+1]&&!S.trip.legs[i+1].o)S.trip.legs[i+1].o=l[k];S.example=false;save();renderLegs();search()});
      return el('div',{},inp,el('span',{class:'city'},APM[l[k]]?.city||(l[k]?'nur Live-Preise':'')))};
    const date=el('input',{type:'date',value:l.date,'aria-label':'Datum Flug '+(i+1)});date.addEventListener('change',()=>{l.date=date.value;save();search()});
    const flex=el('select',{'aria-label':'Flexibilität Flug '+(i+1)},...[0,1,2,3].map(n=>el('option',{value:n,selected:l.flex==n},'±'+n)));flex.addEventListener('change',()=>{l.flex=+flex.value;save();search()});
    tb.append(el('tr',{},el('td',{class:'n'},String(i+1).padStart(2,'0')),el('td',{},code('o')),el('td',{},code('d')),el('td',{},date),el('td',{},flex),
      el('td',{},el('button',{class:'x',title:'Flug entfernen','aria-label':'Flug '+(i+1)+' entfernen',onclick:()=>{if(S.trip.legs.length>1){S.trip.legs.splice(i,1);save();renderLegs();search()}}},'×'))));
  });
  t.append(tb);
  $('#cnt').textContent=S.trip.legs.length;
  renderSummary();
}
function renderSummary(){
  const T=S.trip,pax=T.adt+T.chd+T.inf;
  $('#summary').innerHTML='';
  $('#summary').append(el('span',{class:'chip acc'},pax+' Pers.'),el('span',{class:'chip acc'},CABIN[T.cabin]),el('span',{class:'chip'},T.bChecked+'× 23 kg'+(T.bSpecial?' + '+T.bSpecial+' Sonder':'')),el('span',{class:'chip'},T.maxStops?'≤ '+T.maxStops+' Stopp':'nur direkt'));
  $('#hs-legs').textContent=T.legs.length;$('#hs-pax').textContent=pax;
  const first=T.legs[0],last=T.legs.at(-1);
  $('#tour-meta').textContent=first&&last?`${fmtD(first.date)} – ${fmtD(last.date)}${S.example?' · BEISPIEL':''}`:'';
}
function bindTrip(){
  const T=S.trip,num={'#p-adt':'adt','#p-chd':'chd','#p-inf':'inf','#b-cabin':'bCabin','#b-checked':'bChecked','#b-special':'bSpecial','#p-budget':'budget'};
  for(const[s,k]of Object.entries(num)){const e=$(s);e.value=T[k];e.onchange=()=>{T[k]=Math.max(0,+e.value||0);if(k==='adt')T.adt=Math.max(1,T.adt);save();renderSummary();search()}}
  const sel={'#p-cabin':['cabin',String],'#p-stops':['maxStops',Number],'#p-stab':['stab',Number]};
  for(const[s,[k,f]]of Object.entries(sel)){const e=$(s);e.value=T[k];e.onchange=()=>{T[k]=f(e.value);save();renderSummary();search()}}
  for(const[s,k]of [['#p-flex','flex'],['#p-oneticket','oneTicket']]){const e=$(s);e.checked=T[k];e.onchange=()=>{T[k]=e.checked;save();search()}}
}

/* ========== RESULTS ========== */
function search(){
  RESULTS=S.trip.legs.map((l,i)=>(S.live[i]||[]).filter(x=>x.price).concat(legOptions(l,i)));
  buildPlans();render();
}
function stabBadge(v){const pct=Math.round((1-v)*100),c=v<.35?'var(--good)':v<.6?'var(--warn)':'var(--bad)';return el('span',{class:'stab',title:'Preisstabilität '+pct+' von 100'},el('i',{style:`--w:${pct}%;--c:${c}`}),pct)}
function deepLinks(l){
  const T=S.trip,cab={eco:'economy',pe:'premiumeconomy',bus:'business',first:'first'}[T.cabin];
  return {
    gf:`https://www.google.com/travel/flights?hl=de&curr=EUR&q=${encodeURIComponent(`Flights from ${l.o} to ${l.d} on ${l.date} one way ${CABIN[T.cabin]} ${T.adt} adults`)}`,
    sk:`https://www.skyscanner.de/transport/fluge/${l.o.toLowerCase()}/${l.d.toLowerCase()}/${l.date.slice(2).replace(/-/g,'')}/?adultsv2=${T.adt}&cabinclass=${cab}&rtn=0`,
    ky:`https://www.kayak.de/flights/${l.o}-${l.d}/${l.date}/${cab}/${T.adt}adults`,
  };
}
function multiLinks(){
  const T=S.trip,L=T.legs.filter(l=>l.o&&l.d&&l.date),cab={eco:'economy',pe:'premium',bus:'business',first:'first'}[T.cabin];
  return {ky:'https://www.kayak.de/flights/'+L.map(l=>`${l.o}-${l.d}/${l.date}`).join('/')+`/${cab}/${T.adt}adults`,
    gf:'https://www.google.com/travel/flights?hl=de&curr=EUR&q='+encodeURIComponent('Multi-city '+L.map(l=>`${l.o} to ${l.d} on ${l.date}`).join(', ')+` ${CABIN[T.cabin]} ${T.adt} adults`)};
}
function optChips(x){
  return el('div',{class:'chips'},
    x.src==='live'?el('span',{class:'chip live'},(x.share?'Anteil Gesamtticket':'Live')+' · '+new Date(x.at).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})+(x.currency&&x.currency!=='EUR'?' · '+x.currency:'')):el('span',{class:'chip'},'Schätzung'),
    x.incl!=null?el('span',{class:'chip '+(x.extraBags?'warn':'good')},x.incl+'× 23 kg inkl.'+(x.extraBags?` · +${x.extraBags} extra`:'')):null,
    x.flex?el('span',{class:'chip good'},'umbuchbar'):null,
    x.stops&&x.minLay<1.5?el('span',{class:'chip warn'},'knapper Umstieg'):null,
    stabBadge(x.vol));
}
const optLine=x=>`${fmtD(x.date)} · ${tm(x.depH)}–${tm(x.arrH)}${x.arrDay>0?' +'+x.arrDay:''} · ${hm(x.dur)}`;
const optTitle=x=>x.air.n+' · '+(x.stops?x.stops+' Stopp'+(x.stops>1?'s':'')+' via '+x.via.join(', '):'Direkt');
function render(){
  const T=S.trip;
  // plans
  const pb=$('#plans');pb.innerHTML='';
  if(S.plans)for(const[k,p]of Object.entries(S.plans))pb.append(el('button',{class:'plan','aria-pressed':S.plan===k,onclick:()=>applyPlan(k)},el('span',{class:'t'},p.t),el('span',{class:'p num'},eur(planTotal(p.keys,p.disc||1))),el('span',{class:'s'},p.s)));
  const ch=chosen(),warns=[],box=$('#results');box.innerHTML='';
  T.legs.forEach((l,i)=>{
    const opts=RESULTS[i]||[],x=ch[i],o=APM[l.o],d=APM[l.d];
    const head=el('div',{class:'leg-head'},el('span',{class:'leg-no'},String(i+1).padStart(2,'0')),
      el('div',{class:'leg-route'},el('div',{class:'r'},l.o||'???',el('span',{},'→'),l.d||'???'),el('div',{class:'m'},[o?.city,d?.city].filter(Boolean).join(' → ')+(o&&d?' · '+Math.round(km(o,d)).toLocaleString('de-DE')+' km':'')+' · '+(l.date?fmtD(l.date):'Datum fehlt'))),
      el('div',{class:'leg-price num'},x?eur(x.price):'–',el('small',{},x?(x.bags?'inkl. '+eur(x.bags)+' Gepäck':'alle Reisenden'):'')));
    const card=el('article',{class:'leg'},head);
    if(!l.o||!l.d)card.append(el('div',{class:'leg-pick'},el('div',{class:'callout warn'},'Start und Ziel eintragen, oder im Chat beschreiben.')));
    else if(!x)card.append(el('div',{class:'leg-pick'},el('div',{class:'callout warn'},o&&d?'Keine passende Verbindung im Modell. Mehr Stopps erlauben oder Live-Preise prüfen.':'Flughafen nicht im Schätzmodell. Live-Preise liefern echte Angebote.')));
    else card.append(el('div',{class:'leg-pick'},el('div',{class:'pick-line'},el('span',{class:'al'},x.air.c),el('span',{class:'t'},optTitle(x)),el('span',{class:'d'},optLine(x))),optChips(x)));
    const dl=l.o&&l.d&&l.date?deepLinks(l):null;
    card.append(el('div',{class:'leg-actions'},
      opts.length>1?el('button',{class:'small','aria-expanded':!!S.open[i],onclick:()=>{S.open[i]=!S.open[i];render()}},S.open[i]?'Alternativen ausblenden':`${opts.length-1} Alternativen`):null,
      dl?el('button',{class:'small',onclick:()=>liveCheck([i])},'Live prüfen'):null,
      dl?el('a',{href:dl.gf,target:'_blank',rel:'noopener'},'Google Flights'):null,
      dl?el('a',{href:dl.sk,target:'_blank',rel:'noopener'},'Skyscanner'):null,
      dl?el('a',{href:dl.ky,target:'_blank',rel:'noopener'},'Kayak'):null,
      x?el('a',{href:x.air.url,target:'_blank',rel:'noopener'},x.air.n):null));
    if(S.open[i]){const alts=el('div',{class:'alts'});opts.forEach(y=>{const sel=y===x;
      alts.append(el('label',{class:'opt'+(sel?' sel':'')},el('input',{type:'radio',name:'leg'+i,checked:sel,onchange:()=>{S.sel[i]=y.key;S.plan='custom';render()}}),el('span',{class:'al'},y.air.c),
        el('div',{style:'min-width:0'},el('div',{class:'l1'},optTitle(y)),el('div',{class:'l2'},optLine(y)),optChips(y)),el('span',{class:'pr num'},eur(y.price))))});card.append(alts)}
    box.append(card);
    // checks between flights
    const nx=T.legs[i+1];
    if(nx&&l.d&&nx.o&&l.d!==nx.o){const near=APM[l.d]&&APM[nx.o]&&km(APM[l.d],APM[nx.o])<80;warns.push(['warn',`Flug ${i+1} landet in ${l.d}, Flug ${i+2} startet in ${nx.o}. ${near?'Flughafenwechsel einplanen.':'Bodentransfer nötig.'}`])}
    if(nx&&x&&ch[i+1]){const a=dOf(x.date).getTime()/864e5+x.arrH/24,b=dOf(ch[i+1].date).getTime()/864e5+ch[i+1].depH/24;if(b-a<0.125)warns.push(['bad',`Flug ${i+2} startet vor oder kurz nach der Landung von Flug ${i+1}. Datum anpassen.`])}
  });
  const last=T.legs.map(l=>l.date).filter(Boolean).sort().at(-1);
  S.passports.forEach(pp=>{if(pp.expiry&&last&&dOf(pp.expiry)<addDays(dOf(last),183))warns.push(['bad',`Pass von ${pp.given} ${pp.surname} läuft am ${fmtD(pp.expiry)} ab. Viele Länder verlangen 6 Monate über das Reiseende hinaus.`])});
  const total=ch.reduce((s,x)=>s+(x?x.price:0),0)*currentDisc();
  if(T.budget&&total>T.budget)warns.push(['warn',`${eur(total-T.budget)} über dem Budget von ${eur(T.budget)}. Plan „Günstigste“ wählen oder Flex auf ±2 Tage stellen.`]);
  const wb=$('#warnings');wb.innerHTML='';warns.forEach(([k,t])=>wb.append(el('div',{class:'callout '+k},t)));
  const found=ch.filter(Boolean).length,bags=ch.reduce((s,x)=>s+(x?x.bags:0),0),vol=ch.filter(Boolean).reduce((s,x)=>s+x.vol,0)/Math.max(1,found);
  $('#tot').textContent=found?eur(total):'–';
  $('#tot-sub').textContent=found?`${found} von ${T.legs.length} Flügen · ${T.adt+T.chd+T.inf} Pers. · ${CABIN[T.cabin]} · Gepäck ${eur(bags)}${currentDisc()<1?' · Allianz-Rabatt':''} · Stabilität ${Math.round((1-vol)*100)}/100`:'Noch keine Route berechnet';
  $('#res-meta').textContent=S.plans&&S.plans[S.plan]?S.plans[S.plan].t.toUpperCase():S.plan==='custom'?'EIGENE AUSWAHL':'';
  renderRules();renderPax();
}

/* ========== RULES ========== */
function renderRules(){
  const b=$('#rules');b.innerHTML='';
  if(!S.rules.length)b.append(el('p',{class:'note'},'Noch nichts gelernt. Schreib im Chat z. B. „Wir fliegen nie mit Ryanair“.'));
  S.rules.forEach((r,i)=>{const cb=el('input',{type:'checkbox',checked:r.on,'aria-label':'Regel aktiv',onchange:()=>{r.on=cb.checked;save();search()}});
    b.append(el('div',{class:'rule'+(r.on?'':' off')},cb,el('div',{},el('div',{},r.text),el('div',{class:'src'},r.src+' · '+r.effect.type)),el('button',{class:'small','aria-label':'Regel löschen',onclick:()=>{S.rules.splice(i,1);save();search()}},'×')))});
  $('#rule-count').textContent=S.rules.filter(r=>r.on).length+' AKTIV';
  const lb=$('#learned');lb.innerHTML='';const on=S.rules.filter(r=>r.on);
  if(on.length){lb.append(el('span',{class:'eyebrow'},'Gelernt:'),...on.slice(0,4).map(r=>el('span',{class:'chip acc'},r.text)),on.length>4?el('span',{class:'chip'},'+'+(on.length-4)):null,el('button',{class:'link',onclick:()=>setTab('set')},'verwalten'))}
}

/* ========== PASSPORTS ========== */
function renderPax(){
  const pl=$('#pax-list');pl.innerHTML='';
  S.pax.forEach((p,i)=>{const pp=S.passports.find(x=>x.paxId===p.id),ev=pp?evalPassport(pp):null,bad=ev&&ev.some(c=>c.k==='no'),wa=ev&&ev.some(c=>c.k==='wa');
    pl.append(el('div',{class:'pax'},el('strong',{},p.name),el('span',{class:'chip'},p.role),pp?el('span',{class:'chip '+(bad?'bad':wa?'warn':'good')},bad?'Pass fehlerhaft':wa?'Pass prüfen':'Pass ok'):el('span',{class:'chip warn'},'kein Pass'),
      el('button',{class:'small',onclick:()=>{S.pax.splice(i,1);S.passports=S.passports.filter(x=>x.paxId!==p.id);save();render()}},'Entfernen')))});
  const sf=$('#scan-for'),v=sf.value;sf.innerHTML='';S.pax.forEach(p=>sf.append(el('option',{value:p.id},'für '+p.name)));if(v)sf.value=v;
  const box=$('#pp-list');box.innerHTML='';
  S.passports.forEach((pp,i)=>{const ev=evalPassport(pp),pax=S.pax.find(p=>p.id===pp.paxId);
    box.append(el('div',{class:'pp-card'},
      el('div',{class:'pp-head'},el('b',{},pp.given+' '+pp.surname),el('span',{class:'chip'},pax?pax.name:'nicht zugeordnet'),el('button',{class:'small',style:'margin-left:auto',onclick:()=>{S.passports.splice(i,1);save();render()}},'Löschen')),
      el('div',{class:'pp-grid'},...[['Passnr.',pp.docNo],['Aussteller',pp.issuer],['Nationalität',pp.nat],['Geboren',pp.dob&&fmtD(pp.dob)],['Geschlecht',pp.sex],['Gültig bis',pp.expiry&&fmtD(pp.expiry)]].map(([k,v])=>el('div',{},el('span',{},k),el('strong',{class:'mono'},v||'–')))),
      pp.line1?el('div',{class:'mrz'},pp.line1+'\n'+pp.line2):null,
      el('div',{class:'checks'},...ev.map(c=>el('div',{class:'ck '+c.k},el('span',{class:'ic'},c.k==='ok'?'✓':c.k==='no'?'✕':'!'),el('span',{},c.t))))));
  });
  if(!S.passports.length)box.append(el('p',{class:'note'},'Noch kein Pass erfasst.'));
}
async function imgPayload(file){
  const bmp=await createImageBitmap(file),sc=Math.min(1,1600/Math.max(bmp.width,bmp.height));
  const c=document.createElement('canvas');c.width=Math.round(bmp.width*sc);c.height=Math.round(bmp.height*sc);c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);
  return {media_type:'image/jpeg',data:c.toDataURL('image/jpeg',0.9).split(',')[1]};
}
async function scanPassport(file){
  const st=$('#pp-status');
  if(!STATUS.claude){st.textContent='Foto-Scan braucht einen Anthropic-Key auf dem Server. Bis dahin die zwei MRZ-Zeilen unten im Pass von Hand abtippen, die Prüfung läuft trotzdem.';return}
  if(!(await consent('claude')))return;
  st.innerHTML='<span class="spin"></span> Claude liest den Pass …';
  try{
    const r=await apiJson(`Du liest die Datenseite eines Reisepasses aus dem Bild. Antworte NUR mit JSON:
{"mrz1":"erste MRZ-Zeile exakt, 44 Zeichen mit <","mrz2":"zweite MRZ-Zeile exakt, 44 Zeichen","viz":{"surname":"","given":"","docNo":"","dob":"YYYY-MM-DD","expiry":"YYYY-MM-DD","nat":"3-Letter"},"quality":"gut|mittel|schlecht","notes":"Auffälligkeiten (Spiegelung, abgeschnitten, Verdacht auf Manipulation) oder leer"}
Wenn kein Pass erkennbar ist: {"error":"Grund"}. Erfinde keine Zeichen; unlesbare Zeichen als ? markieren.`,await imgPayload(file));
    if(r.error){st.textContent='Kein Pass erkannt: '+r.error;return}
    const m=parseMRZ((r.mrz1||'')+'\n'+(r.mrz2||''));if(m.error){st.textContent=m.error;return}
    const v=r.viz||{},mism=[];
    if(v.docNo&&v.docNo.replace(/\s/g,'')!==m.docNo)mism.push(`Passnr. ${v.docNo} vs. ${m.docNo}`);
    if(v.dob&&v.dob!==m.dob)mism.push(`Geburtsdatum ${v.dob} vs. ${m.dob}`);
    if(v.expiry&&v.expiry!==m.expiry)mism.push(`Ablauf ${v.expiry} vs. ${m.expiry}`);
    addPassport({...m,vizMismatch:mism,ocrNotes:[r.quality&&r.quality!=='gut'?'Bildqualität '+r.quality:'',r.notes||''].filter(Boolean).join('. ')});
    st.textContent='Pass eingelesen und geprüft.';
  }catch(e){st.textContent='Scan fehlgeschlagen: '+e.message}
}
function addPassport(m){const paxId=$('#scan-for').value;S.passports=S.passports.filter(p=>p.paxId!==paxId);S.passports.push({...m,paxId,checks:m.checks.map(c=>({ok:c.ok,t:c.t}))});save();render()}

/* ========== HISTORY ========== */
function snapshot(src){
  const ch=chosen();if(!ch.some(Boolean))return;
  S.history.push({at:Date.now(),src,legs:ch.map((x,i)=>x?{i,a:x.air.c,p:Math.round(x.price)}:null),total:Math.round(ch.reduce((s,x)=>s+(x?x.price:0),0)*currentDisc())});
  S.history=S.history.slice(-60);save();if(curTab==='hist')renderHist();
}
function renderHist(){
  const H=S.history,box=$('#hist-chart'),t=$('#hist-table');box.innerHTML='';t.innerHTML='';
  if(!H.length){box.append(el('div',{class:'callout'},'Noch keine Messpunkte. „Beste Route berechnen“ oder „Live-Preise“ legt den ersten an.'));return}
  const w=640,h=200,pl=70,pr=16,pt=14,pb=28,vals=H.map(x=>x.total);let mn=Math.min(...vals),mx=Math.max(...vals);if(mx===mn){mx+=500;mn-=500}
  const X=i=>pl+(H.length===1?(w-pl-pr)/2:i*(w-pl-pr)/(H.length-1)),Y=v=>pt+(1-(v-mn)/(mx-mn))*(h-pt-pb);
  let g='';for(let k=0;k<=3;k++){const v=mn+(mx-mn)*k/3;g+=`<line x1="${pl}" x2="${w-pr}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${pl-6}" y="${Y(v)+3}" text-anchor="end">${esc(eur(v))}</text>`}
  const d=H.map((x,i)=>(i?'L':'M')+X(i)+' '+Y(x.total)).join(' ');
  const f=x=>esc(new Date(x.at).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}));
  box.innerHTML=`<svg class="hist" viewBox="0 0 ${w} ${h}" role="img" aria-label="Preisverlauf der Gesamtroute">${g}<path d="${d} L${X(H.length-1)} ${h-pb} L${X(0)} ${h-pb} Z" fill="var(--accent-soft)"/><path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2"/>${H.map((x,i)=>`<circle cx="${X(i)}" cy="${Y(x.total)}" r="${i===H.length-1?4.5:2.5}" fill="${x.src==='Live'?'var(--live)':'var(--accent)'}"/>`).join('')}<text x="${pl}" y="${h-8}">${f(H[0])}</text><text x="${w-pr}" y="${h-8}" text-anchor="end">${f(H.at(-1))}</text></svg>
  <div class="chips" style="margin:6px 0 12px"><span class="chip acc">● Schätzung</span><span class="chip live">● Live</span><span class="chip">Δ seit Beginn ${esc(eur(H.at(-1).total-H[0].total))}</span></div>`;
  const n=Math.max(...H.map(r=>r.legs.length));
  t.innerHTML='<thead><tr><th>Zeit</th><th>Quelle</th>'+Array.from({length:n},(_,i)=>`<th>Flug ${i+1}</th>`).join('')+'<th>Gesamt</th></tr></thead><tbody>'+H.slice(-12).reverse().map(r=>`<tr><td class="mono">${f(r)}</td><td>${esc(r.src)}</td>${Array.from({length:n},(_,i)=>{const l=r.legs[i];return `<td class="mono num">${l?esc(l.a+' '+eur(l.p)):'–'}</td>`}).join('')}<td class="mono num"><strong>${esc(eur(r.total))}</strong></td></tr>`).join('')+'</tbody>';
}

/* ========== LIVE PRICES (Duffel) ========== */
let liveBusy=false,autoT=null;
const hOf=s=>{const m=/T(\d\d):(\d\d)/.exec(s);return m?+m[1]+m[2]/60:12};
const dayDiff=(a,b)=>Math.round((dOf(b.slice(0,10))-dOf(a.slice(0,10)))/864e5);
function liveOpt(i,sl,o,key,price,share){
  const segs=sl.segments,first=segs[0],last=segs.at(-1);
  const a=ALM[o.carrier]||{c:o.carrier||'??',n:o.carrierName||'Airline',al:'live',url:'https://www.google.com/search?q='+encodeURIComponent((o.carrierName||'')+' Airline'),incl:[0,1,2,3],vol:.4,lcc:false,fee:70};
  const T=S.trip,checked=Math.min(...segs.map(s=>s.checkedBags)),extra=Math.max(0,T.bChecked-checked),bagCost=(extra*(a.fee||70)+T.bSpecial*110)*(T.adt+T.chd);
  return {air:a,path:[first.o,...segs.map(s=>s.d)],via:segs.slice(0,-1).map(s=>s.d),stops:segs.length-1,date:first.dep.slice(0,10),depH:hOf(first.dep),arrH:hOf(last.arr)+24*dayDiff(first.dep,last.arr),arrDay:dayDiff(first.dep,last.arr),dur:sl.durationMin/60,lay:0,
    minLay:segs.length>1?Math.min(...segs.slice(1).map((s,k)=>(new Date(s.dep)-new Date(segs[k].arr))/36e5)):0,segs:segs.map(s=>({fn:s.fn})),fare:price,bags:bagCost,price:price+bagCost,vol:o.changeable?.15:.35,incl:checked,extraBags:extra,flex:o.changeable,leg:i,src:'live',at:Date.now(),key,score:-5,currency:o.currency,share,offerId:o.id};
}
async function liveCheck(idxs){
  if(liveBusy)return toast('Live-Prüfung läuft bereits …');
  if(!STATUS.duffel){toast(STATUS.static?'Live-Preise gibt es nur mit eigenem Server (siehe Anleitung). Bis dahin helfen die Links je Flug.':'Für echte Preise DUFFEL_TOKEN beim Server hinterlegen. Bis dahin helfen die Links je Flug.',4500);return}
  if(!(await consent('duffel')))return;
  liveBusy=true;const btn=$('#live-all');btn.disabled=true;btn.innerHTML='<span class="spin"></span> Suche …';
  const all=idxs.length===S.trip.legs.length;
  try{
    const r=await api('api/flights',{legs:S.trip.legs,pax:{adt:S.trip.adt,chd:S.trip.chd,inf:S.trip.inf},cabin:S.trip.cabin,maxStops:S.trip.maxStops,only:all?undefined:idxs});
    let ok=0;const errs=[];
    for(const[i,res]of Object.entries(r.perLeg||{})){if(res.error){errs.push(`Flug ${+i+1}: ${res.error}`);continue}
      S.live[i]=res.offers.map((o,j)=>liveOpt(+i,o.slices[0],o,`LIVE-${i}-${j}`,o.price,false));if(S.live[i].length)ok++}
    if(r.trip&&r.trip.offers&&r.trip.offers.length){const o=r.trip.offers[0],n=o.slices.length;S.tripOffer={price:o.price,currency:o.currency,carrierName:o.carrierName};
      o.slices.forEach((sl,i)=>{S.live[i]=(S.live[i]||[]).filter(x=>!x.share);S.live[i].push(liveOpt(i,sl,o,`TRIP-${i}`,o.price/n,true))})}
    RESULTS=S.trip.legs.map((l,i)=>(S.live[i]||[]).concat(legOptions(l,i)));buildPlans();
    for(const i of idxs){if(S.live[i]&&S.live[i].length)S.sel[i]=[...S.live[i]].sort((a,b)=>a.price-b.price)[0].key}
    S.plan='custom';render();
    if(ok){snapshot('Live');toast(`${ok} Flug/Flüge mit echten Preisen aktualisiert.`)}else toast(errs[0]||'Keine Live-Angebote gefunden.',4500);
  }catch(e){toast(e.message,4500)}
  liveBusy=false;btn.disabled=false;btn.textContent='Live-Preise';
}
function setAuto(min){clearInterval(autoT);autoT=null;if(+min>0)autoT=setInterval(()=>liveCheck(S.trip.legs.map((_,i)=>i)),min*60000)}

/* ========== PDF ========== */
function makePDF(){
  if(!window.jspdf){toast('PDF-Bibliothek konnte nicht geladen werden (Internet nötig).');return}
  const doc=new window.jspdf.jsPDF({unit:'mm',format:'a4'}),T=S.trip,ch=chosen(),money=n=>eur(n).replace(/ /g,' ');let y;
  doc.setFillColor(19,33,63);doc.rect(0,0,210,34,'F');
  doc.setTextColor(232,169,51);doc.setFont('helvetica','bold');doc.setFontSize(20);doc.text('ProudNerdFlugfinder',14,15);
  doc.setTextColor(243,230,196);doc.setFont('helvetica','normal');doc.setFontSize(10);
  doc.text(`Tour-Routing · ${T.legs.length} Flüge · ${CABIN[T.cabin]} · erstellt ${new Date().toLocaleDateString('de-DE')}`,14,23);
  doc.text('Route: '+T.legs.map(l=>l.o).concat(T.legs.at(-1)?.d||'').join(' - '),14,29);
  y=44;doc.setTextColor(15,27,51);doc.setFont('helvetica','bold');doc.setFontSize(11);doc.text('Reisende',14,y);y+=6;doc.setFont('helvetica','normal');doc.setFontSize(9.5);
  S.pax.forEach(p=>{const pp=S.passports.find(x=>x.paxId===p.id),ev=pp?evalPassport(pp):null;doc.text(`${p.name} (${p.role})`,14,y);doc.text(pp?`Pass ${pp.nat} · gültig bis ${fmtD(pp.expiry)} · ${ev.some(c=>c.k==='no')?'PRÜFEN':'geprüft'}`:'Passdaten ausstehend',95,y);y+=5});
  doc.text(`${T.adt} Erw.${T.chd?`, ${T.chd} Kinder`:''}${T.inf?`, ${T.inf} Babys`:''} · Gepäck p. P.: ${T.bCabin} Hand, ${T.bChecked} x 23 kg, ${T.bSpecial} Sondergepäck`,14,y);y+=9;
  doc.setFont('helvetica','bold');doc.setFontSize(11);doc.text('Flugplan',14,y);y+=4;
  const cols=[14,24,48,84,128,164];doc.setFillColor(238,241,246);doc.rect(12,y,186,7,'F');doc.setFontSize(8.5);
  ['Flug','Datum','Strecke','Airline / Flugnr.','Zeiten'].forEach((h,i)=>doc.text(h,cols[i],y+5));doc.text('Preis',196,y+5,{align:'right'});y+=11;doc.setFont('helvetica','normal');
  ch.forEach((x,i)=>{const l=T.legs[i];if(y>262){doc.addPage();y=20}
    doc.setFontSize(9);doc.setFont('helvetica','bold');doc.text(String(i+1).padStart(2,'0'),cols[0],y);doc.setFont('helvetica','normal');
    doc.text(fmtD(x?x.date:l.date),cols[1],y);doc.text(`${l.o} - ${l.d}`,cols[2],y);doc.setFontSize(7.5);doc.text(`${APM[l.o]?.city||''} - ${APM[l.d]?.city||''}`,cols[2],y+4);doc.setFontSize(9);
    if(x){doc.text(x.air.n,cols[3],y);doc.setFontSize(7.5);doc.text((x.segs?x.segs.map(s=>s.fn).join(' / '):'')+(x.stops?' · via '+x.via.join(', '):' · Direkt'),cols[3],y+4);doc.setFontSize(9);
      doc.text(`${tm(x.depH)} - ${tm(x.arrH)}${x.arrDay?' +'+x.arrDay:''}`,cols[4],y);doc.setFontSize(7.5);doc.text(hm(x.dur)+(x.src==='live'?' · live geprüft':' · Schätzung'),cols[4],y+4);doc.setFontSize(9);doc.text(money(x.price),196,y,{align:'right'})}
    else doc.text('keine Option',cols[3],y);
    doc.setDrawColor(214,220,232);doc.line(12,y+7,198,y+7);y+=12});
  const total=ch.reduce((s,x)=>s+(x?x.price:0),0)*currentDisc();
  y+=2;doc.setFillColor(19,33,63);doc.rect(12,y,186,14,'F');doc.setTextColor(243,230,196);doc.setFontSize(10);doc.text('Gesamtpreis alle Reisenden inkl. Gepäck'+(currentDisc()<1?' (Allianz-Ticket)':''),16,y+9);
  doc.setTextColor(232,169,51);doc.setFont('helvetica','bold');doc.setFontSize(14);doc.text(money(total),194,y+9.5,{align:'right'});y+=22;
  doc.setTextColor(91,103,130);doc.setFont('helvetica','normal');doc.setFontSize(8);
  const rules=activeRules().map(r=>'- '+r.text);if(rules.length){doc.text('Berücksichtigte Vorgaben:',14,y);y+=4;rules.slice(0,8).forEach(r=>{doc.text(doc.splitTextToSize(r,180),14,y);y+=4})}
  y+=3;doc.text(doc.splitTextToSize('Hinweis: Preise ohne Live-Kennzeichnung sind Schätzungen und unverbindlich. Verfügbarkeit, Tarifbedingungen und Einreisebestimmungen vor Buchung bestätigen.',182),14,y);
  const name=`Tour_${T.legs[0]?.o||''}-${T.legs.at(-1)?.d||''}_${iso(new Date())}.pdf`;
  const url=URL.createObjectURL(doc.output('blob')),a=el('a',{href:url,download:name});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);toast('PDF gespeichert: '+name);
}

/* ========== CHAT ========== */
function renderChat(){
  const m=$('#msgs');m.innerHTML='';
  if(!S.chat.length)m.append(el('div',{class:'msg a'},'Hallo! Beschreib einfach, was ihr braucht: wie viele Flüge, welche Städte in welcher Reihenfolge, Daten, Personen, Business oder Economy, Gepäck und Sonderwünsche. Daneben (am Handy darunter) siehst du eine Beispiel-Tour.'));
  S.chat.forEach(c=>{
    const b=el('div',{class:'msg '+(c.r==='user'?'u':c.r==='sys'?'sys':'a')},c.t);
    if(c.sugg&&c.sugg.length){const sg=el('div',{class:'sugg'});c.sugg.forEach((s,si)=>sg.append(el('div',{class:'sugg-item'},el('span',{},s.text),
      s.taken?el('span',{class:'chip good',style:'flex:0'},'gemerkt'):el('button',{class:'small primary',onclick:()=>{S.rules.push({id:'r'+Date.now()+si,text:s.text,on:true,src:'Chat',effect:s.effect||{type:'note',value:''}});s.taken=true;save();search();renderChat();toast('Vorliebe gemerkt und angewendet.')}},'Merken'))));b.append(sg)}
    m.append(b)});
  $('#examples').hidden=S.chat.some(c=>c.r==='user');
  m.scrollTop=m.scrollHeight;
}
function tripSummary(){
  const ch=chosen();
  return {today:iso(today),legCount:S.trip.legs.length,isExample:S.example,
    legs:S.trip.legs.map((l,i)=>({...l,chosen:ch[i]?{airline:ch[i].air.n,code:ch[i].air.c,stops:ch[i].stops,via:ch[i].via,dep:tm(ch[i].depH),dur_h:+ch[i].dur.toFixed(1),price_eur:Math.round(ch[i].price),stability:Math.round((1-ch[i].vol)*100),source:ch[i].src}:null,
      alternatives:(RESULTS?.[i]||[]).slice(0,4).map(x=>({airline:x.air.c,price:Math.round(x.price),stops:x.stops,stability:Math.round((1-x.vol)*100)}))})),
    pax:{adt:S.trip.adt,chd:S.trip.chd,inf:S.trip.inf,names:S.pax.map(p=>p.name+' ('+p.role+')')},cabin:S.trip.cabin,maxStops:S.trip.maxStops,bags:{cabin:S.trip.bCabin,checked:S.trip.bChecked,special:S.trip.bSpecial},
    budget:S.trip.budget,flex:S.trip.flex,oneTicket:S.trip.oneTicket,plan:S.plan,plans:S.plans?Object.fromEntries(Object.entries(S.plans).map(([k,p])=>[k,Math.round(planTotal(p.keys,p.disc||1))])):{},
    total_eur:Math.round(chosen().reduce((s,x)=>s+(x?x.price:0),0)*currentDisc()),rules:S.rules.filter(r=>r.on).map(r=>r.text)};
}
const CHAT_TOOLS=[
  {name:'set_trip',description:'Setzt die Tour. legs ersetzt die komplette Flugliste (Reihenfolge = Reiseverlauf, Gabelflüge erlaubt). Alle anderen Felder optional. Danach wird automatisch neu gerechnet. Gibt den neuen Stand zurück.',
   input_schema:{type:'object',properties:{
     legs:{type:'array',items:{type:'object',properties:{o:{type:'string',description:'IATA-Code Abflug'},d:{type:'string',description:'IATA-Code Ziel'},date:{type:'string',description:'YYYY-MM-DD'},flex:{type:'integer',description:'0-3 Tage Flexibilität'}},required:['o','d','date']}},
     adt:{type:'integer'},chd:{type:'integer'},inf:{type:'integer'},cabin:{type:'string',enum:['eco','pe','bus','first']},maxStops:{type:'integer',enum:[0,1,2]},
     bCabin:{type:'integer'},bChecked:{type:'integer',description:'Koffer 23 kg pro Person'},bSpecial:{type:'integer',description:'Sondergepäck pro Person (Instrumente, Equipment)'},
     budget:{type:'number'},stab:{type:'number',enum:[0,0.5,1]},flex:{type:'boolean'},oneTicket:{type:'boolean'},
     travelers:{type:'array',description:'Namen und Rollen, nur wenn genannt',items:{type:'object',properties:{name:{type:'string'},role:{type:'string'}},required:['name']}}}}},
  {name:'set_flight_count',description:'Setzt nur die Anzahl der Flüge (1-12), wenn Städte noch fehlen. Neue Flüge starten am letzten Ziel.',input_schema:{type:'object',properties:{count:{type:'integer'}},required:['count']}},
  {name:'choose_plan',description:'Wählt einen berechneten Plan: best, cheap, stable, fast, alliance, liveTrip',input_schema:{type:'object',properties:{plan:{type:'string'}},required:['plan']}},
  {name:'get_trip',description:'Aktueller Stand: Flüge, gewählte Optionen, Alternativen, Pläne, Preise',input_schema:{type:'object',properties:{}}},
];
const TOOL_IMPL={
  set_trip(a){
    const T=S.trip;
    if(Array.isArray(a.legs)&&a.legs.length){T.legs=a.legs.slice(0,12).map(l=>({o:String(l.o||'').toUpperCase().slice(0,3),d:String(l.d||'').toUpperCase().slice(0,3),date:/^\d{4}-\d{2}-\d{2}$/.test(l.date)?l.date:iso(addDays(today,30)),flex:Math.max(0,Math.min(3,+l.flex||0))}));S.live={};S.sel={}}
    for(const k of ['adt','chd','inf','cabin','maxStops','bCabin','bChecked','bSpecial','budget','stab','flex','oneTicket'])if(a[k]!=null)T[k]=a[k];
    T.adt=Math.max(1,+T.adt||1);
    if(Array.isArray(a.travelers)&&a.travelers.length){S.pax=a.travelers.slice(0,20).map((p,i)=>({id:'p'+Date.now()+i,name:String(p.name),role:p.role||'Reisende'}))}
    S.example=false;bindTrip();renderLegs();search();snapshot('Schätzung');save();
    const unknown=[...new Set(T.legs.flatMap(l=>[l.o,l.d]).filter(c=>c&&!APM[c]))];
    return {...tripSummary(),note:unknown.length?`Nicht im Schätzmodell (nur Live-Preise): ${unknown.join(', ')}`:undefined};
  },
  set_flight_count(a){setLegCount(+a.count||1);return tripSummary()},
  choose_plan(a){if(!S.plans[a.plan])return {error:'Plan nicht verfügbar',available:Object.keys(S.plans)};applyPlan(a.plan);return tripSummary()},
  get_trip(){return tripSummary()},
};
function systemPrompt(){
  return `Du bist der Flug-Copilot von ProudNerdFlugfinder, einem Planer für Künstler-Touren mit mehreren Flügen hintereinander (Gabelflüge, oft 5-6 Flüge, selten ein klassischer Hin- und Rückflug). Heute ist ${iso(today)}.

So arbeitest du:
- Wenn der Nutzer beschreibt, was er braucht, rufe set_trip mit allen erkennbaren Angaben auf (Städte als IATA-Codes, Daten als YYYY-MM-DD, Personen, Kabine, Gepäck). Ohne Jahr: nächstes passendes Datum ab heute. Fehlen Daten für Folgeflüge, plane 3 Tage Abstand und sag das.
- Nennt der Nutzer nur eine Anzahl Flüge ohne Städte, rufe set_flight_count auf und frag nach den Städten.
- Fehlt etwas Wichtiges (z. B. Startort), frag in einem Satz nach, statt zu raten.
- Nach jeder Änderung: fasse in höchstens 5 kurzen Zeilen zusammen (Route, Gesamtpreis, Empfehlung, Warnungen). Preise sind Schätzungen, außer source=live. Erwähne bei Bedarf den Button „Live-Preise“.
- Antworte auf Deutsch, sachlich, ohne Markdown-Überschriften.

Flughäfen im Schätzmodell: ${AP.map(a=>a.c+'='+a.city).join(', ')}. Andere IATA-Codes sind erlaubt, haben aber nur Live-Preise.
Airline-Codes: ${AL.map(a=>a.c+'='+a.n).join(', ')}.

Ganz am Ende deiner Antwort IMMER eine Zeile: ###RULES### gefolgt von einem JSON-Array mit dauerhaften Vorlieben, die der Nutzer in seiner letzten Nachricht geäußert hat (sonst []):
###RULES### [{"text":"kurze Regel","effect":{"type":"preferAirline|avoidAirline|preferAlliance|maxStops|maxLayoverH|minLayoverH|departAfter|departBefore|noRedEye|avoidAirport|note","value":"z.B. LH, Star Alliance, 1, 3, 9, MUC"}}]
Einmalige Angaben zur aktuellen Tour (Städte, Daten, Personenzahl) sind keine Vorlieben.`;
}
async function claudeLoop(messages){
  for(let step=0;step<8;step++){
    const r=await api('api/claude',{system:systemPrompt(),messages,tools:CHAT_TOOLS});
    messages.push({role:'assistant',content:r.content});
    if(r.stop_reason==='refusal')return 'Diese Anfrage kann ich nicht bearbeiten.';
    if(r.stop_reason==='pause_turn')continue;
    const uses=r.content.filter(b=>b.type==='tool_use');
    if(r.stop_reason!=='tool_use'||!uses.length)return r.content.filter(b=>b.type==='text').map(b=>b.text).join('');
    const results=[];
    for(const u of uses){let out,err=false;try{const f=TOOL_IMPL[u.name];out=f?f(u.input||{}):{error:'Unbekanntes Tool'}}catch(e){out={error:e.message};err=true}
      results.push({type:'tool_result',tool_use_id:u.id,content:JSON.stringify(out).slice(0,20000),...(err?{is_error:true}:{})})}
    messages.push({role:'user',content:results});
  }
  return 'Ich habe die Tour angepasst.';
}
/* ========== EINGEBAUTER ASSISTENT (ohne KI-Schlüssel) ========== */
function localAssistant(text){
  const P=parseRequest(text,today,APM),T=S.trip,done=[];
  const fmt=d=>iso(d);
  if(P.cities.length>=2){
    let prev=P.dates[0]?.date||(T.legs[0]?.date?dOf(T.legs[0].date):addDays(today,30));
    T.legs=P.cities.slice(0,13).slice(1).map((d,i)=>{const dt=P.dates[i]?.date||(i?addDays(prev,3):prev);prev=dt;return {o:P.cities[i],d,date:fmt(dt),flex:1}});
    S.live={};S.sel={};done.push(`${T.legs.length} Flüge eingetragen: ${T.legs.map(l=>l.o+'→'+l.d).join(', ')}`);
    if(P.dates.length<T.legs.length)done.push(P.dates.length?'Fehlende Daten habe ich mit 3 Tagen Abstand ergänzt':'Ohne Datum habe ich in 30 Tagen begonnen, mit 3 Tagen Abstand');
  }else if(P.cities.length===1&&(P.flightCount||/start|ab |von /.test(text.toLowerCase()))){
    T.legs[0]=T.legs[0]||{o:'',d:'',date:iso(addDays(today,30)),flex:1};T.legs[0].o=P.cities[0];if(P.dates[0])T.legs[0].date=fmt(P.dates[0].date);done.push('Start: '+P.cities[0]);
  }else if(!P.cities.length&&P.dates.length){P.dates.forEach((d,i)=>{if(T.legs[i])T.legs[i].date=fmt(d.date)});done.push('Daten angepasst')}
  if(P.flightCount&&P.flightCount!==T.legs.length){setLegCountQuiet(P.flightCount);done.push(`Anzahl Flüge: ${P.flightCount}`)}
  const o=P.opts,lab={adt:v=>v+' Erwachsene',chd:v=>v+' Kinder',inf:v=>v+' Babys',cabin:v=>CABIN[v],bChecked:v=>v+' Koffer p. P.',bSpecial:v=>v+' Sondergepäck p. P.',maxStops:v=>v?'max. '+v+' Stopp':'nur Direktflüge',flex:()=>'Flex-Tarife',stab:()=>'stabile Preise bevorzugt',oneTicket:()=>'eine Allianz bevorzugt',budget:v=>'Budget '+eur(v)};
  for(const[k,v]of Object.entries(o)){T[k]=v;done.push(lab[k]?lab[k](v):k)}
  const touched=done.length>0;
  if(touched){S.example=false;bindTrip();renderLegs();search();snapshot('Schätzung')}
  if(P.plan&&S.plans[P.plan]){applyPlan(P.plan);done.push('Plan „'+S.plans[P.plan].t+'“ gewählt')}
  save();
  const missing=T.legs.map((l,i)=>(!l.o||!l.d)?i+1:null).filter(Boolean);
  const unknown=[...new Set(T.legs.flatMap(l=>[l.o,l.d]).filter(c=>c&&!APM[c]))];
  let reply='';
  if(!touched&&!P.rules.length&&!P.plan)reply='Das habe ich nicht verstanden. Schreib z. B.: „4 Flüge, 2 Personen Business, Berlin → London am 3.3., dann New York, Miami, zurück. 2 Koffer und eine Gitarre.“ Du kannst die Tour auch rechts direkt bearbeiten.';
  else{
    reply=done.length?'Erledigt:\n• '+done.join('\n• '):'';
    const ch=chosen(),tot=ch.reduce((s,x)=>s+(x?x.price:0),0)*currentDisc();
    if(ch.some(Boolean))reply+=`\n\nGeschätzter Gesamtpreis (${S.plans[S.plan]?.t||'eigene Auswahl'}): ${eur(tot)}. Für echte Preise „Live-Preise“ drücken.`;
    if(missing.length)reply+=`\n\nBei Flug ${missing.join(', ')} fehlen noch Start oder Ziel. Schreib die Städte dazu oder trag sie rechts ein.`;
    if(unknown.length)reply+=`\n\nDiese Codes kenne ich nicht aus dem Schätzmodell: ${unknown.join(', ')}. Dafür gibt es nur Live-Preise.`;
  }
  return {t:reply.trim(),sugg:P.rules};
}
function setLegCountQuiet(n){n=Math.max(1,Math.min(12,n));const L=S.trip.legs;while(L.length<n){const last=L.at(-1);L.push({o:last?last.d:'',d:'',date:last?iso(addDays(dOf(last.date),3)):iso(addDays(today,30)),flex:1})}L.length=n}

let chatBusy=false;
async function sendChat(text){
  text=text.trim();if(!text||chatBusy)return;
  S.chat.push({r:'user',t:text});renderChat();
  if(!STATUS.claude||S.consent.claude==='denied'||!(await consent('claude'))){const r=localAssistant(text);S.chat.push({r:'assistant',t:r.t,sugg:r.sugg});S.chat=S.chat.slice(-40);save();renderChat();return}
  chatBusy=true;const ans={r:'assistant',t:'…'};S.chat.push(ans);renderChat();$('#chat-state').innerHTML='<span class="spin"></span> DENKT';
  // last turns as plain text, current state goes along with the new message
  const prior=S.chat.slice(0,-2).filter(c=>(c.r==='user'||c.r==='assistant')&&c.t&&c.t!=='…').slice(-10).map(c=>({role:c.r,content:c.t}));
  while(prior.length&&prior[0].role!=='user')prior.shift();
  const msgs=[];for(const m of [...prior,{role:'user',content:`${text}\n\n[Aktueller Stand der App: ${JSON.stringify(tripSummary())}]`}]){if(msgs.length&&msgs.at(-1).role===m.role)msgs.at(-1).content+='\n'+m.content;else msgs.push({...m})}
  try{
    const out=await claudeLoop(msgs);const [body,rj]=out.split('###RULES###');ans.t=body.trim()||'Erledigt.';
    try{const arr=JSON.parse((rj||'[]').trim().replace(/^```(json)?|```$/g,''));ans.sugg=(Array.isArray(arr)?arr:[]).filter(x=>x&&x.text).slice(0,4)}catch{ans.sugg=[]}
  }catch(e){ans.t='Das hat nicht geklappt: '+e.message}
  chatBusy=false;$('#chat-state').textContent=STATUS.claude?'CLAUDE AKTIV':'ASSISTENT';S.chat=S.chat.slice(-40);save();renderChat();
}

/* ========== SETTINGS ========== */
function renderPerms(){
  const b=$('#perms');b.innerHTML='';const avail={claude:STATUS.claude,duffel:STATUS.duffel,camera:true};
  PERMS.forEach(([k,n,d])=>{const c=S.consent[k]||'prompt';
    const chip=!avail[k]?['bad','nicht eingerichtet']:c==='granted'?['good','erlaubt']:c==='denied'?['warn','abgelehnt']:['','fragt bei Nutzung'];
    const btn=!avail[k]?null:c==='granted'?el('button',{class:'small',onclick:()=>{S.consent[k]='denied';save();renderPerms()}},'Entziehen'):el('button',{class:'small',onclick:()=>{S.consent[k]='granted';save();renderPerms()}},'Erlauben');
    b.append(el('div',{class:'perm'},el('div',{},el('strong',{},n),' ',el('span',{class:'chip '+chip[0]},chip[1]),k==='duffel'&&STATUS.duffelMode==='test'?el('span',{class:'chip warn'},'Testmodus'):null,el('p',{},d)),btn||el('span')))});
  b.append(el('div',{class:'perm'},el('div',{},el('strong',{},'Server'),' ',el('span',{class:'chip'},STATUS.static?'nicht verbunden':STATUS.model||'–'),el('p',{},STATUS.static?'Ohne Server (z. B. GitHub Pages): eingebauter Assistent, Schätzpreise, MRZ-Prüfung und PDF.':STATUS.auth?'Zugangscode aktiv. Schützt deinen API-Key vor fremder Nutzung.':'Kein Zugangscode gesetzt. Für einen öffentlichen Server APP_TOKEN setzen.')),el('span')));
  if(STATUS.auth)b.append(el('div',{class:'row',style:'margin-top:10px'},el('input',{id:'tok',type:'password',placeholder:'Zugangscode','aria-label':'Zugangscode'}),el('button',{style:'flex:0 0 auto',onclick:()=>{const v=$('#tok').value.trim();if(v){TOKEN=v;try{localStorage.setItem('pnf-token',v)}catch{}load();toast('Zugangscode gespeichert.')}}},'Speichern')));
  const L=multiLinks(),grp=(t,a)=>el('div',{style:'margin-bottom:12px'},el('div',{class:'note',style:'margin-bottom:5px'},t),el('div',{class:'links'},...a.map(([n,u])=>el('a',{href:u,target:'_blank',rel:'noopener'},n))));
  const ex=$('#ext-links');ex.innerHTML='';
  ex.append(grp('Ganze Tour als Multi-City',[['Kayak',L.ky],['Google Flights',L.gf],['Skyscanner','https://www.skyscanner.de/transport/flugsuche-mehrere-staedte']]),
    grp('Rundreise-Tickets der Allianzen',[['Star Alliance','https://www.staralliance.com/de/round-the-world'],['oneworld Explorer','https://www.oneworld.com/round-the-world'],['SkyTeam','https://www.skyteam.com']]),
    grp('Airlines der aktuellen Auswahl',[...new Map(chosen().filter(Boolean).map(x=>[x.air.c,[x.air.n,x.air.url]])).values()]),
    grp('Einreise & Dokumente',[['IATA Travel Centre','https://www.iatatravelcentre.com/'],['Auswärtiges Amt','https://www.auswaertiges-amt.de/de/ReiseUndSicherheit/reise-und-sicherheitshinweise'],['ESTA (USA)','https://esta.cbp.dhs.gov/'],['Visit Japan Web','https://www.vjw.digital.go.jp/'],['UK ETA','https://www.gov.uk/guidance/apply-for-an-electronic-travel-authorisation-eta']]),
    grp('Sondergepäck & Charter',[['Lufthansa Musikinstrumente','https://www.lufthansa.com/de/de/musikinstrumente'],['Emirates Sondergepäck','https://www.emirates.com/de/german/before-you-fly/baggage/special-baggage/'],['Air Charter Service','https://www.aircharterservice.com/']]));
}

/* ========== WIRING ========== */
function setTab(t){curTab=t;document.querySelectorAll('nav.tabs button').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===t)));['plan','pax','hist','set'].forEach(x=>$('#tab-'+x).hidden=x!==t);if(t==='hist')renderHist();if(t==='set')renderPerms();window.scrollTo(0,0)}
document.querySelectorAll('nav.tabs button').forEach(b=>b.onclick=()=>{setTab(b.dataset.tab);save()});
$('#airports').innerHTML=AP.map(a=>`<option value="${a.c}">${esc(a.city)} (${a.cc})</option>`).join('');
$('#cnt-minus').onclick=()=>setLegCount(S.trip.legs.length-1);
$('#cnt-plus').onclick=()=>setLegCount(S.trip.legs.length+1);
$('#toggle-details').onclick=e=>{const d=$('#details');d.hidden=!d.hidden;e.target.setAttribute('aria-expanded',String(!d.hidden))};
$('#search').onclick=()=>{search();snapshot('Schätzung');toast('Route berechnet.')};
$('#live-all').onclick=()=>liveCheck(S.trip.legs.map((_,i)=>i));
$('#pdf').onclick=makePDF;
$('#add-pax').onclick=()=>{const n=$('#new-pax').value.trim();if(!n)return;S.pax.push({id:'p'+Date.now(),name:n,role:$('#new-role').value});$('#new-pax').value='';save();render()};
$('#scan-btn').onclick=async()=>{if(await consent('camera'))$('#scan-file').click()};
$('#scan-file').onchange=e=>{const f=e.target.files[0];if(f)scanPassport(f);e.target.value=''};
const drop=$('#drop');['dragover','dragenter'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('over')}));['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('over')}));
drop.addEventListener('drop',e=>{const f=e.dataTransfer.files[0];if(f&&f.type.startsWith('image/'))scanPassport(f)});
$('#mrz-check').onclick=()=>{const m=parseMRZ($('#mrz-in').value);if(m.error){$('#pp-status').textContent=m.error;return}addPassport(m);$('#mrz-in').value='';$('#pp-status').textContent='MRZ geprüft.'};
$('#chat-form').onsubmit=e=>{e.preventDefault();const v=$('#chat-in').value;$('#chat-in').value='';sendChat(v)};
$('#chat-in').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('#chat-form').requestSubmit()}});
$('#examples').querySelectorAll('button').forEach(b=>b.onclick=()=>sendChat(b.textContent));
$('#perm-reset').onclick=()=>{S.consent={};save();renderPerms();toast('Freigaben zurückgesetzt. Die App fragt beim nächsten Zugriff wieder.')};
$('#auto-int').onchange=e=>setAuto(+e.target.value);
$('#exp').onclick=()=>exportData(false);
$('#exp-pp').onclick=()=>exportData(true);
$('#imp-btn').onclick=()=>$('#imp').click();
$('#imp').onchange=e=>{const f=e.target.files[0];if(f)importData(f);e.target.value=''};
$('#wipe').onclick=()=>{if($('#wipe').dataset.armed){try{localStorage.removeItem(STORE_KEY)}catch{}location.reload()}else{$('#wipe').dataset.armed='1';$('#wipe').textContent='Wirklich alles löschen?';setTimeout(()=>{delete $('#wipe').dataset.armed;$('#wipe').textContent='Alle Daten auf diesem Gerät löschen'},4000)}};
try{const ui=JSON.parse(localStorage.getItem('pnf-ui')||'null');if(ui&&ui.tab)curTab=ui.tab}catch{}
bindTrip();renderLegs();search();renderChat();setTab(curTab);
load();
