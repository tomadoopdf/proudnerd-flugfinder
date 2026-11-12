// Tarifmodell, Flughafen-/Airline-Daten und Pass-Prüfung (übernommen aus der Artifact-Version)
/* ========== DATA ========== */
// code, city, country, lat, lon, region, utc offset (winter)
const AP = `FRA Frankfurt DE 50.03 8.57 EU 1|MUC München DE 48.35 11.79 EU 1|BER Berlin DE 52.36 13.50 EU 1|HAM Hamburg DE 53.63 9.99 EU 1|DUS Düsseldorf DE 51.29 6.77 EU 1|ZRH Zürich CH 47.46 8.55 EU 1|VIE Wien AT 48.11 16.57 EU 1|LHR London-Heathrow GB 51.47 -0.45 EU 0|LGW London-Gatwick GB 51.15 -0.19 EU 0|CDG Paris FR 49.01 2.55 EU 1|AMS Amsterdam NL 52.31 4.76 EU 1|MAD Madrid ES 40.49 -3.57 EU 1|BCN Barcelona ES 41.30 2.08 EU 1|FCO Rom IT 41.80 12.25 EU 1|MXP Mailand IT 45.63 8.72 EU 1|IST Istanbul TR 41.26 28.74 EU 3|CPH Kopenhagen DK 55.62 12.65 EU 1|ARN Stockholm SE 59.65 17.92 EU 1|OSL Oslo NO 60.19 11.10 EU 1|HEL Helsinki FI 60.32 24.95 EU 2|LIS Lissabon PT 38.77 -9.13 EU 0|ATH Athen GR 37.94 23.94 EU 2|DUB Dublin IE 53.42 -6.27 EU 0|BRU Brüssel BE 50.90 4.48 EU 1|PRG Prag CZ 50.10 14.26 EU 1|WAW Warschau PL 52.17 20.97 EU 1|JFK New_York-JFK US 40.64 -73.78 NA -5|EWR Newark US 40.69 -74.17 NA -5|LAX Los_Angeles US 33.94 -118.41 NA -8|SFO San_Francisco US 37.62 -122.38 NA -8|MIA Miami US 25.79 -80.29 NA -5|ORD Chicago US 41.97 -87.91 NA -6|ATL Atlanta US 33.64 -84.43 NA -5|LAS Las_Vegas US 36.08 -115.15 NA -8|SEA Seattle US 47.45 -122.31 NA -8|BOS Boston US 42.36 -71.01 NA -5|YYZ Toronto CA 43.68 -79.63 NA -5|YVR Vancouver CA 49.19 -123.18 NA -8|MEX Mexiko-Stadt MX 19.44 -99.07 LA -6|CUN Cancún MX 21.04 -86.87 LA -5|GRU São_Paulo BR -23.43 -46.47 LA -3|GIG Rio_de_Janeiro BR -22.81 -43.25 LA -3|EZE Buenos_Aires AR -34.82 -58.54 LA -3|BOG Bogotá CO 4.70 -74.15 LA -5|LIM Lima PE -12.02 -77.11 LA -5|DXB Dubai AE 25.25 55.36 ME 4|DOH Doha QA 25.27 51.61 ME 3|AUH Abu_Dhabi AE 24.43 54.65 ME 4|RUH Riad SA 24.96 46.70 ME 3|TLV Tel_Aviv IL 32.01 34.89 ME 2|CAI Kairo EG 30.12 31.41 AF 2|JNB Johannesburg ZA -26.14 28.25 AF 2|CPT Kapstadt ZA -33.97 18.60 AF 2|NBO Nairobi KE -1.32 36.93 AF 3|LOS Lagos NG 6.58 3.32 AF 1|CMN Casablanca MA 33.37 -7.59 AF 1|DEL Delhi IN 28.56 77.10 AS 5.5|BOM Mumbai IN 19.09 72.87 AS 5.5|BKK Bangkok TH 13.69 100.75 AS 7|SIN Singapur SG 1.36 103.99 AS 8|HKG Hongkong HK 22.31 113.92 AS 8|HND Tokio-Haneda JP 35.55 139.78 AS 9|NRT Tokio-Narita JP 35.77 140.39 AS 9|ICN Seoul KR 37.46 126.44 AS 9|PEK Peking CN 40.08 116.58 AS 8|PVG Shanghai CN 31.14 121.81 AS 8|KUL Kuala_Lumpur MY 2.75 101.71 AS 8|CGK Jakarta ID -6.13 106.66 AS 7|DPS Bali ID -8.75 115.17 AS 8|MNL Manila PH 14.51 121.02 AS 8|SYD Sydney AU -33.94 151.18 OC 11|MEL Melbourne AU -37.67 144.84 OC 11|AKL Auckland NZ -37.01 174.79 OC 13|MLE Malé MV 4.19 73.53 AS 5|SEZ Seychellen SC -4.67 55.52 AF 4|MRU Mauritius MU -20.43 57.68 AF 4`
  .split('|').map(s=>{const [c,city,cc,la,lo,r,tz]=s.split(' ');return {c,city:city.replace(/_/g,' '),cc,lat:+la,lon:+lo,r,tz:+tz}});
const APM = Object.fromEntries(AP.map(a=>[a.c,a]));
const ALL=['EU','NA','LA','ME','AF','AS','OC'];
// code,name,alliance,hubs,regions,factor,lcc,bagsIncl[eco,pe,bus,first],bagFee,url,vol
const AL = [
 ['LH','Lufthansa','Star Alliance',['FRA','MUC'],ALL,1.08,0,[0,2,2,3],70,'https://www.lufthansa.com',.45],
 ['LX','SWISS','Star Alliance',['ZRH'],ALL,1.12,0,[0,2,2,3],70,'https://www.swiss.com',.4],
 ['OS','Austrian','Star Alliance',['VIE'],['EU','NA','ME','AS','AF'],1.0,0,[0,2,2,3],65,'https://www.austrian.com',.45],
 ['UA','United','Star Alliance',['EWR','SFO','ORD'],ALL,1.0,0,[0,2,2,3],75,'https://www.united.com',.55],
 ['AC','Air Canada','Star Alliance',['YYZ','YVR'],['EU','NA','LA','AS','OC'],0.98,0,[0,2,2,3],70,'https://www.aircanada.com',.5],
 ['SQ','Singapore Airlines','Star Alliance',['SIN'],ALL,1.12,0,[1,1,2,3],90,'https://www.singaporeair.com',.35],
 ['NH','ANA','Star Alliance',['HND','NRT'],['AS','NA','EU','OC'],1.06,0,[2,2,2,3],0,'https://www.ana.co.jp',.35],
 ['TK','Turkish Airlines','Star Alliance',['IST'],ALL,0.9,0,[1,1,2,3],60,'https://www.turkishairlines.com',.5],
 ['TP','TAP Air Portugal','Star Alliance',['LIS'],['EU','NA','LA','AF'],0.92,0,[0,1,2,2],60,'https://www.flytap.com',.55],
 ['BA','British Airways','oneworld',['LHR'],ALL,1.1,0,[0,2,2,3],75,'https://www.britishairways.com',.5],
 ['AA','American Airlines','oneworld',['JFK','MIA','ORD'],ALL,1.0,0,[0,2,2,3],75,'https://www.aa.com',.55],
 ['QR','Qatar Airways','oneworld',['DOH'],ALL,1.02,0,[1,1,2,3],80,'https://www.qatarairways.com',.4],
 ['CX','Cathay Pacific','oneworld',['HKG'],ALL,1.06,0,[1,1,2,3],80,'https://www.cathaypacific.com',.4],
 ['JL','Japan Airlines','oneworld',['HND','NRT'],['AS','NA','EU','OC'],1.05,0,[2,2,2,3],0,'https://www.jal.co.jp',.35],
 ['QF','Qantas','oneworld',['SYD','MEL'],['OC','AS','NA','EU'],1.1,0,[1,1,2,3],80,'https://www.qantas.com',.45],
 ['IB','Iberia','oneworld',['MAD'],['EU','LA','NA'],0.95,0,[0,1,2,2],60,'https://www.iberia.com',.5],
 ['AF','Air France','SkyTeam',['CDG'],ALL,1.06,0,[0,2,2,3],70,'https://www.airfrance.com',.5],
 ['KL','KLM','SkyTeam',['AMS'],ALL,1.03,0,[0,2,2,3],70,'https://www.klm.com',.5],
 ['DL','Delta','SkyTeam',['ATL','JFK','LAX','SEA'],ALL,1.02,0,[0,2,2,3],75,'https://www.delta.com',.5],
 ['KE','Korean Air','SkyTeam',['ICN'],['AS','NA','EU','OC'],1.0,0,[1,2,2,3],80,'https://www.koreanair.com',.4],
 ['EK','Emirates','keine',['DXB'],ALL,1.05,0,[1,1,2,3],90,'https://www.emirates.com',.4],
 ['EY','Etihad','keine',['AUH'],ALL,0.96,0,[1,1,2,3],85,'https://www.etihad.com',.45],
 ['FR','Ryanair','Low-Cost',['DUB','MAD','BCN','FCO','BER'],['EU','AF'],0.45,1,[0,0,0,0],45,'https://www.ryanair.com',.9],
 ['U2','easyJet','Low-Cost',['LGW','MXP','BER','AMS'],['EU','AF'],0.5,1,[0,0,0,0],45,'https://www.easyjet.com',.85],
].map(a=>({c:a[0],n:a[1],al:a[2],hubs:a[3],reg:a[4],f:a[5],lcc:!!a[6],incl:a[7],fee:a[8],url:a[9],vol:a[10]}));
const ALM = Object.fromEntries(AL.map(a=>[a.c,a]));
const CABIN={eco:'Economy',pe:'Premium Economy',bus:'Business',first:'First'};
const CABIDX={eco:0,pe:1,bus:2,first:3};

/* ========== HELPERS ========== */
const $=s=>document.querySelector(s);
const el=(t,a={},...k)=>{const e=document.createElement(t);for(const[x,v]of Object.entries(a)){if(x==='class')e.className=v;else if(x==='html')e.innerHTML=v;else if(x.startsWith('on'))e.addEventListener(x.slice(2),v);else if(v!==false&&v!=null)e.setAttribute(x,v)}k.flat().forEach(c=>c!=null&&e.append(c.nodeType?c:document.createTextNode(c)));return e};
const eur=n=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Math.round(n));
const fmtD=s=>new Date(s+'T00:00:00').toLocaleDateString('de-DE',{weekday:'short',day:'2-digit',month:'2-digit',year:'2-digit'});
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function toast(t,ms=2600){const x=$('#toast');x.textContent=t;x.hidden=false;clearTimeout(toast._t);toast._t=setTimeout(()=>x.hidden=true,ms)}
function hash(s){let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return (h>>>0)/4294967295}
function km(a,b){const R=6371,r=Math.PI/180,dl=(b.lat-a.lat)*r,dn=(b.lon-a.lon)*r;const x=Math.sin(dl/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(x))}
const hm=h=>{const H=Math.floor(h),M=Math.round((h-H)*60);return `${H}h ${String(M).padStart(2,'0')}m`};
const tm=h=>{h=((h%24)+24)%24;const H=Math.floor(h),M=Math.round((h-H)*60/5)*5;return `${String(H+(M===60?1:0)).padStart(2,'0')}:${String(M%60).padStart(2,'0')}`};

/* ========== ENGINE ========== */
function activeRules(){return S.rules.filter(r=>r.on&&r.effect)}
function segPrice(o,d,air,cab,date){
  const D=km(o,d);
  let base=(D<1500?45+D*0.11:D<4000?80+D*0.075:140+D*0.058);
  const mult={eco:1,pe:1.7,bus:D<1500?2.4:4.6,first:D<1500?3.2:8}[cab];
  return {D,p:base*mult*air.f};
}
function legOptions(leg,i){
  const o=APM[leg.o],d=APM[leg.d];if(!o||!d||o===d)return [];
  const T=S.trip,cab=T.cabin,rules=activeRules();
  const maxStops=Math.min(T.maxStops,...rules.filter(r=>r.effect.type==='maxStops').map(r=>+r.effect.value));
  const avoid=new Set(rules.filter(r=>r.effect.type==='avoidAirline').map(r=>String(r.effect.value).toUpperCase()));
  const out=[];
  for(const a of AL){
    if(avoid.has(a.c))continue;
    if(!a.reg.includes(o.r)||!a.reg.includes(d.r))continue;
    const direct=km(o,d);
    if(a.lcc&&direct>3500)continue;
    if(a.lcc&&(cab==='bus'||cab==='first'))continue;
    const paths=[];
    if(a.hubs.includes(o.c)||a.hubs.includes(d.c)||(a.lcc&&(a.hubs.includes(o.c)||a.hubs.includes(d.c)||hash(o.c+d.c+a.c)>.55)))paths.push([o,d]);
    if(maxStops>=1&&!a.lcc)for(const h of a.hubs){const H=APM[h];if(!H||h===o.c||h===d.c||km(o,H)<150||km(H,d)<150)continue;const via=km(o,H)+km(H,d);if(via<direct*1.38)paths.push([o,H,d])}
    if(maxStops>=2&&!a.lcc&&a.hubs.length>=2){const[h1,h2]=a.hubs.map(x=>APM[x]);if(h1&&h2&&![o.c,d.c].includes(h1.c)&&![o.c,d.c].includes(h2.c)){const via=km(o,h1)+km(h1,h2)+km(h2,d);if(via<direct*1.5)paths.push([o,h1,h2,d])}}
    for(const p of paths){
      // try flexible dates
      let best=null;
      for(let k=-leg.flex;k<=leg.flex;k++){
        const dt=addDays(new Date(leg.date+'T00:00:00'),k);
        const r=quote(p,a,cab,dt,i);
        if(!best||r.price<best.price)best=r;
      }
      if(best)out.push(best);
    }
  }
  // scoring
  const minP=Math.min(...out.map(x=>x.price)),minDur=Math.min(...out.map(x=>x.dur));
  for(const x of out){
    let s=(x.price/minP-1)*100*1+(x.dur/minDur-1)*40+x.stops*6+x.vol*25*(0.4+T.stab);
    for(const r of rules){const e=r.effect,v=String(e.value);
      if(e.type==='preferAirline'&&x.air.c===v.toUpperCase())s-=18;
      if(e.type==='preferAlliance'&&x.air.al.toLowerCase()===v.toLowerCase())s-=12;
      if(e.type==='maxLayoverH'&&x.lay>+e.value)s+=60;
      if(e.type==='minLayoverH'&&x.stops&&x.minLay<+e.value)s+=40;
      if(e.type==='departAfter'&&x.depH<+e.value)s+=30;
      if(e.type==='departBefore'&&x.depH>+e.value)s+=30;
      if(e.type==='noRedEye'&&(x.depH>=22||x.depH<5))s+=35;
      if(e.type==='avoidAirport'&&x.via.includes(v.toUpperCase()))s+=80;
    }
    x.score=s;
  }
  out.sort((a,b)=>a.score-b.score);
  // dedupe identical airline+via
  const seen=new Set();return out.filter(x=>{const k=x.air.c+x.via.join();if(seen.has(k))return false;seen.add(k);return true}).slice(0,10);
}
function quote(path,a,cab,dt,i){
  const T=S.trip;let price=0,dur=0,lay=0,minLay=99;const segs=[];
  const seed=path.map(p=>p.c).join('')+a.c+iso(dt);
  let depH=6+Math.floor(hash(seed+'h')*17)+(hash(seed+'m')>.5?.5:0);
  let t=depH;
  for(let s=0;s<path.length-1;s++){
    const{D,p}=segPrice(path[s],path[s+1],a,cab,dt);
    const fh=D/820+0.55;price+=p;
    segs.push({o:path[s].c,d:path[s+1].c,dep:t,fh,fn:a.c+(100+Math.floor(hash(seed+s)*8800))});
    t+=fh;dur+=fh;
    if(s<path.length-2){const l=1.2+hash(seed+'l'+s)*2.6;lay+=l;minLay=Math.min(minLay,l);t+=l;dur+=l}
  }
  const stops=path.length-2;
  if(stops===0)price*=1.12; else price*=stops===1?0.97:0.9;
  const lead=(dt-today)/864e5;
  const leadF=lead<7?1.65:lead<21?1.28:lead<45?1.08:lead<120?1:0.95;
  const dow=dt.getDay();const dowF=(dow===5||dow===0)?1.08:(dow===2||dow===3)?0.95:1;
  const mo=dt.getMonth();const seasonF=(mo===11&&dt.getDate()>15)||mo===6||mo===7?1.15:1;
  const jitter=0.9+hash(seed+'j')*0.2;
  let fare=price*leadF*dowF*seasonF*jitter;
  let vol=Math.min(1,a.vol*(lead<21?1.5:lead<60?1.1:0.85)*(seasonF>1?1.2:1));
  const flexOn=S.trip.flex;if(flexOn){fare*=a.lcc?1.35:1.18;vol*=0.35}
  // pax
  const paxN=T.adt+T.chd,perAdult=fare,total=fare*T.adt+fare*0.75*T.chd+fare*0.1*T.inf;
  // bags
  const incl=a.incl[CABIDX[cab]];const extraBags=Math.max(0,T.bChecked-incl);
  const cabinFee=a.lcc&&T.bCabin>0?25:0;
  const bagCost=(extraBags*a.fee*(a.lcc?1.1:1)+cabinFee+T.bSpecial*(a.lcc?75:110))*paxN;
  const arrH=t+(APM[path.at(-1).c].tz-APM[path[0].c].tz);
  return {air:a,path:path.map(p=>p.c),via:path.slice(1,-1).map(p=>p.c),stops,date:iso(dt),depH,arrH,arrDay:Math.floor(arrH/24),dur,lay,minLay:minLay===99?0:minLay,segs,perAdult,fare:total,bags:bagCost,price:total+bagCost,vol,incl,extraBags,leg:i,flex:flexOn,src:'model',
    key:a.c+'-'+path.map(p=>p.c).join('-')};
}
function search(){
  const legs=S.trip.legs;RESULTS=legs.map((l,i)=>{
    const opts=legOptions(l,i);
    const live=(S.live[i]||[]).filter(x=>x.price);
    return live.concat(opts);
  });
  buildPlans();render();
}
function buildPlans(){
  if(!RESULTS)return;
  const pick=f=>RESULTS.map(opts=>opts.length?[...opts].sort((a,b)=>f(a)-f(b))[0].key:null);
  const plans={
    best:{t:'Empfohlen',s:'Preis, Dauer, Stabilität & deine Regeln',keys:pick(x=>x.score)},
    cheap:{t:'Günstigste',s:'reiner Preis inkl. Gepäck',keys:pick(x=>x.price)},
    stable:{t:'Preisstabil',s:'geringste Schwankung',keys:pick(x=>x.price*(1+x.vol*0.9))},
    fast:{t:'Schnellste',s:'kürzeste Reisezeit',keys:pick(x=>x.dur*1000+x.price/1000)},
  };
  // alliance one-ticket
  let bestAll=null;
  for(const al of ['Star Alliance','oneworld','SkyTeam']){
    const keys=[];let tot=0,ok=true;
    for(const opts of RESULTS){const c=opts.filter(x=>x.air.al===al).sort((a,b)=>a.price-b.price)[0];if(!c){ok=false;break}keys.push(c.key);tot+=c.price}
    if(ok&&(!bestAll||tot<bestAll.tot))bestAll={al,keys,tot};
  }
  if(bestAll)plans.alliance={t:'Ein Ticket',s:bestAll.al+', ~7 % Multi-City-Rabatt',keys:bestAll.keys,disc:0.93};
  if(RESULTS.length&&RESULTS.every((o,i)=>o.some(x=>x.key==='TRIP-'+i)))plans.liveTrip={t:'Live-Gesamtticket',s:(S.tripOffer?.carrierName||'')+' · ein Ticket',keys:RESULTS.map((_,i)=>'TRIP-'+i)};
  S.plans=plans;
  if(S.trip.oneTicket&&plans.alliance)S.plan='alliance';
  if(!plans[S.plan])S.plan='best';
  applyPlan(S.plan,false);
}
function applyPlan(p,r=true){S.plan=p;const pl=S.plans[p];S.sel={};pl.keys.forEach((k,i)=>{if(k)S.sel[i]=k});if(r)render()}
function chosen(){return (RESULTS||[]).map((opts,i)=>opts.find(x=>x.key===S.sel[i])||opts[0]||null)}
function planTotal(keys,disc=1){let t=0;(RESULTS||[]).forEach((opts,i)=>{const x=opts.find(o=>o.key===keys[i]);if(x)t+=x.price});return t*disc}
function currentDisc(){const c=chosen().filter(Boolean);if(c.length<2)return 1;const al=c[0].air.al;return ['Star Alliance','oneworld','SkyTeam'].includes(al)&&c.every(x=>x.air.al===al)?0.93:1}

/* ========== PASSPORTS ========== */
const W=[7,3,1];
function cd(s){let t=0;for(let i=0;i<s.length;i++){const c=s[i];const v=c==='<'?0:/\d/.test(c)?+c:c.charCodeAt(0)-55;t+=v*W[i%3]}return String(t%10)}
function mrzDate(s,future){const yy=+s.slice(0,2),mm=s.slice(2,4),dd=s.slice(4,6);let y=2000+yy;if(!future&&y>today.getFullYear())y-=100;if(future&&y<today.getFullYear()-20)y+=100;return `${y}-${mm}-${dd}`}
function parseMRZ(raw){
  const lines=raw.toUpperCase().replace(/[ \t]/g,'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  if(lines.length<2)return {error:'Zwei MRZ-Zeilen nötig (Reisepass, je 44 Zeichen).'};
  let[l1,l2]=lines.slice(-2);l1=l1.padEnd(44,'<').slice(0,44);l2=l2.padEnd(44,'<').slice(0,44);
  const names=l1.slice(5).split('<<');const sur=names[0].replace(/</g,' ').trim();const giv=(names.slice(1).join(' ')).replace(/</g,' ').trim();
  const r={type:l1[0],issuer:l1.slice(2,5).replace(/</g,''),surname:sur,given:giv,docNo:l2.slice(0,9).replace(/</g,''),nat:l2.slice(10,13).replace(/</g,''),dob:mrzDate(l2.slice(13,19),false),sex:l2[20],expiry:mrzDate(l2.slice(21,27),true),line1:l1,line2:l2};
  r.checks=[
    {ok:l1[0]==='P',t:'Dokumenttyp Reisepass (P)'},
    {ok:cd(l2.slice(0,9))===l2[9],t:'Prüfziffer Passnummer'},
    {ok:cd(l2.slice(13,19))===l2[19],t:'Prüfziffer Geburtsdatum'},
    {ok:cd(l2.slice(21,27))===l2[27],t:'Prüfziffer Ablaufdatum'},
    {ok:l2[42]==='<'&&l2.slice(28,42).replace(/</g,'')===''||cd(l2.slice(28,42))===l2[42],t:'Prüfziffer persönliche Nummer'},
    {ok:cd(l2.slice(0,10)+l2.slice(13,20)+l2.slice(21,43))===l2[43],t:'Gesamtprüfziffer'},
  ];
  return r;
}
function evalPassport(pp){
  const res=[...(pp.checks||[]).map(c=>({k:c.ok?'ok':'no',t:c.t}))];
  const last=S.trip.legs.map(l=>l.date).sort().at(-1);
  if(pp.expiry){const e=new Date(pp.expiry+'T00:00:00');
    if(e<today)res.push({k:'no',t:'Pass ist abgelaufen'});
    else if(last&&e<addDays(new Date(last+'T00:00:00'),183))res.push({k:'wa',t:`Gültig bis ${fmtD(pp.expiry)}, weniger als 6 Monate nach Reiseende (${fmtD(last)})`});
    else res.push({k:'ok',t:`Gültig bis ${fmtD(pp.expiry)}, deckt die Tour + 6 Monate`});}
  const pax=S.pax.find(p=>p.id===pp.paxId);
  if(pax){const norm=s=>s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/Ä/g,'AE').replace(/[^A-Z ]/g,' ').split(/\s+/).filter(Boolean);
    const a=new Set(norm(pax.name.replace(/ä/gi,'ae').replace(/ö/gi,'oe').replace(/ü/gi,'ue').replace(/ß/g,'ss'))),b=norm(pp.surname+' '+pp.given);
    const hit=b.filter(x=>a.has(x)).length;res.push(hit>=2?{k:'ok',t:'Name stimmt mit Buchungsname überein'}:{k:'wa',t:`Name im Pass (${pp.given} ${pp.surname}) weicht vom Reisenden „${pax.name}“ ab. Ticketname muss exakt dem Pass entsprechen.`})}
  if(pp.vizMismatch&&pp.vizMismatch.length)pp.vizMismatch.forEach(m=>res.push({k:'no',t:'Sichtzone ≠ MRZ: '+m}));
  if(pp.ocrNotes)res.push({k:'wa',t:'Scan-Hinweis: '+pp.ocrNotes});
  return res;
}
