/* Eingebauter Assistent: versteht Flug-Anfragen auf Deutsch (und einfache englische) ohne KI-Schlüssel.
   parseRequest(text, today) liefert eine Beschreibung; ui.js wendet sie auf die Tour an. */

const NORM=s=>s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/ß/g,'ss');
const CITY_ALIASES={
  'new york':'JFK','nyc':'JFK','newark':'EWR','los angeles':'LAX','san francisco':'SFO','las vegas':'LAS','vegas':'LAS',
  'london':'LHR','heathrow':'LHR','gatwick':'LGW','paris':'CDG','tokio':'HND','tokyo':'HND','narita':'NRT','haneda':'HND',
  'rom':'FCO','rome':'FCO','mailand':'MXP','milan':'MXP','milano':'MXP','wien':'VIE','vienna':'VIE','zurich':'ZRH','zuerich':'ZRH',
  'munchen':'MUC','muenchen':'MUC','munich':'MUC','frankfurt':'FRA','berlin':'BER','hamburg':'HAM','dusseldorf':'DUS','duesseldorf':'DUS',
  'peking':'PEK','beijing':'PEK','shanghai':'PVG','schanghai':'PVG','singapur':'SIN','singapore':'SIN','hongkong':'HKG','hong kong':'HKG',
  'seoul':'ICN','bangkok':'BKK','kuala lumpur':'KUL','jakarta':'CGK','bali':'DPS','manila':'MNL','delhi':'DEL','new delhi':'DEL','mumbai':'BOM','bombay':'BOM',
  'dubai':'DXB','abu dhabi':'AUH','doha':'DOH','riad':'RUH','riyadh':'RUH','tel aviv':'TLV','kairo':'CAI','cairo':'CAI',
  'johannesburg':'JNB','kapstadt':'CPT','cape town':'CPT','nairobi':'NBO','lagos':'LOS','casablanca':'CMN',
  'sydney':'SYD','melbourne':'MEL','auckland':'AKL','malediven':'MLE','maldives':'MLE','male':'MLE','seychellen':'SEZ','seychelles':'SEZ','mauritius':'MRU',
  'toronto':'YYZ','vancouver':'YVR','chicago':'ORD','miami':'MIA','atlanta':'ATL','seattle':'SEA','boston':'BOS',
  'mexiko-stadt':'MEX','mexiko stadt':'MEX','mexico city':'MEX','cancun':'CUN','sao paulo':'GRU','rio de janeiro':'GIG','rio':'GIG',
  'buenos aires':'EZE','bogota':'BOG','lima':'LIM',
  'lissabon':'LIS','lisbon':'LIS','madrid':'MAD','barcelona':'BCN','amsterdam':'AMS','kopenhagen':'CPH','copenhagen':'CPH',
  'stockholm':'ARN','oslo':'OSL','helsinki':'HEL','athen':'ATH','athens':'ATH','dublin':'DUB','brussel':'BRU','bruessel':'BRU','brussels':'BRU',
  'prag':'PRG','prague':'PRG','warschau':'WAW','warsaw':'WAW','istanbul':'IST',
};
const NUMW={ein:1,eine:1,einen:1,einem:1,one:1,zwei:2,two:2,drei:3,three:3,vier:4,four:4,funf:5,fuenf:5,five:5,sechs:6,six:6,sieben:7,seven:7,acht:8,eight:8,neun:9,nine:9,zehn:10,ten:10,elf:11,zwolf:12,zwoelf:12};
const NUM='(?<![a-z\\d])(\\d{1,2}|'+Object.keys(NUMW).join('|')+')';
const toN=s=>/^\d+$/.test(s)?+s:NUMW[s];
const MONTHS={jan:1,januar:1,january:1,feb:2,februar:2,february:2,mar:3,marz:3,maerz:3,march:3,apr:4,april:4,mai:5,may:5,jun:6,juni:6,june:6,jul:7,juli:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,okt:10,oktober:10,oct:10,october:10,nov:11,november:11,dez:12,dezember:12,dec:12,december:12};

function parseRequest(text,today,known){
  const t=NORM(text),out={cities:[],dates:[],opts:{},rules:[],notes:[],unknown:[]};
  // ---- cities in order of appearance ----
  const hits=[];
  const aliases=Object.keys(CITY_ALIASES).sort((a,b)=>b.length-a.length);
  const taken=new Array(t.length).fill(false);
  for(const a of aliases){
    const re=new RegExp('(^|[^a-z])('+a.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')(?![a-z])','g');let m;
    while((m=re.exec(t))){const s=m.index+m[1].length;if(taken.slice(s,s+a.length).some(Boolean))continue;for(let k=s;k<s+a.length;k++)taken[k]=true;hits.push({pos:s,code:CITY_ALIASES[a]})}
  }
  // IATA codes written in capitals in the original text
  const reCode=/\b([A-Z]{3})\b/g;let m;
  while((m=reCode.exec(text))){const c=m[1];if(['EUR','USD','PDF','VIP','CEO'].includes(c))continue;if(!taken[m.index]&&(known[c]||/(→|->|nach|von|ab|bis|to|from)/i.test(text.slice(Math.max(0,m.index-8),m.index+12))))hits.push({pos:m.index,code:c})}
  hits.sort((a,b)=>a.pos-b.pos);
  for(const h of hits){if(out.cities.at(-1)!==h.code)out.cities.push(h.code)}
  // "zurück nach Hause/zum Start" -> back to first city
  if(/(zuruck|zurueck|retour|heim|back home|return)/.test(t)&&out.cities.length>1&&out.cities.at(-1)!==out.cities[0]&&!/(zuruck|zurueck) nach [a-z]/.test(t))out.cities.push(out.cities[0]);
  // ---- dates ----
  const pushDate=(d,mo,y,pos)=>{if(!d||!mo||mo>12||d>31)return;let yr=y?(y<100?2000+y:y):today.getFullYear();let dt=new Date(yr,mo-1,d);if(!y&&dt<today)dt=new Date(yr+1,mo-1,d);out.dates.push({pos,date:dt})};
  const reD=/(\d{1,2})\.\s?(\d{1,2})\.?(?:\s?(\d{2,4}))?(?![\d])/g;
  while((m=reD.exec(t))){pushDate(+m[1],+m[2],m[3]?+m[3]:0,m.index)}
  const reM=new RegExp('(\\d{1,2})\\.?\\s*('+Object.keys(MONTHS).sort((a,b)=>b.length-a.length).join('|')+')\\b\\.?(?:\\s*(\\d{4}))?','g');
  while((m=reM.exec(t))){pushDate(+m[1],MONTHS[m[2]],m[3]?+m[3]:0,m.index)}
  const reISO=/(\d{4})-(\d{2})-(\d{2})/g;while((m=reISO.exec(t)))pushDate(+m[3],+m[2],+m[1],m.index);
  out.dates.sort((a,b)=>a.pos-b.pos);
  // ---- counts ----
  if((m=new RegExp(NUM+'\\s*(fluge|fluege|flights|legs|flugstrecken|strecken|etappen)').exec(t)))out.flightCount=toN(m[1]);
  if((m=new RegExp(NUM+'\\s*(personen|leute|pers\\b|pax|reisende|erwachsene|people|passengers|adults)').exec(t)))out.opts.adt=toN(m[1]);
  if((m=new RegExp(NUM+'\\s*(kinder|kind|children|kids)').exec(t)))out.opts.chd=toN(m[1]);
  if((m=new RegExp(NUM+'\\s*(babys|baby|kleinkind|infants?)').exec(t)))out.opts.inf=toN(m[1]);
  if(!out.opts.adt){const roles=(t.match(/\b(artist|kunstler|kuenstler|manager|managerin|security|bodyguard|fotograf|tontechniker|crew|stylist|assistent|assistentin|tourmanager)\b/g)||[]);if(roles.length>=2)out.opts.adt=roles.length}
  // ---- cabin ----
  if(/\bfirst\b|erste klasse/.test(t))out.opts.cabin='first';
  else if(/premium/.test(t))out.opts.cabin='pe';
  else if(/business/.test(t))out.opts.cabin='bus';
  else if(/economy|\beco\b|holzklasse|touristenklasse/.test(t))out.opts.cabin='eco';
  // ---- baggage ----
  if(/nur handgepack|nur handgepaeck|hand ?luggage only|ohne koffer/.test(t))out.opts.bChecked=0;
  else if((m=new RegExp(NUM+'\\s*(koffer|gepackstucke|gepaeckstuecke|aufgabegepack|aufgabegepaeck|bags|suitcases)').exec(t)))out.opts.bChecked=Math.min(6,toN(m[1]));
  const sp=new RegExp('(?:'+NUM+'\\s*)?(gitarren?|instrumente?|equipment|keyboards?|schlagzeug|drums|kameras?|cases?|sondergepack|sondergepaeck|bass|geigen?|violins?)').exec(t);
  if(sp)out.opts.bSpecial=Math.min(6,sp[1]?toN(sp[1]):1);
  // ---- stops, flex, budget ----
  if(/direkt|nonstop|non-stop|ohne umsteigen|ohne stopp/.test(t))out.opts.maxStops=0;
  else if(/(max(imal)?|hochstens|hoechstens)\s*(1|ein|einen|einem)\s*(stopp|umstieg|zwischenstopp)/.test(t))out.opts.maxStops=1;
  else if(/(2|zwei)\s*(stopps|umstiege)/.test(t))out.opts.maxStops=2;
  if(/umbuchbar|flexib|flex-tarif|flextarif/.test(t))out.opts.flex=true;
  if(/stabil|nicht schwank|schwankung/.test(t))out.opts.stab=1;
  if(/allianz|ein ticket|ein einziges ticket|durchgecheckt/.test(t))out.opts.oneTicket=true;
  if((m=/budget[^\d]{0,15}(\d[\d.]*)\s*(k|tsd|tausend)?/.exec(t))){let v=+m[1].replace(/\./g,'');if(m[2])v*=1000;out.opts.budget=v}
  if(/gunstig|guenstig|billig|cheap|sparen|preiswert/.test(t))out.plan='cheap';
  else if(/schnell|kurzeste|kuerzeste|fastest/.test(t))out.plan='fast';
  // ---- learned preferences ----
  if(/(keine|ohne|no)\s*(nachtfluge|nachtfluege|red-?eye|nachtflug)/.test(t))out.rules.push({text:'Keine Nachtflüge',effect:{type:'noRedEye',value:'1'}});
  for(const a of AL){const n=NORM(a.n);
    if(new RegExp('(nie|nicht|keine?n?|ohne|never|no)\\s+(mit\\s+|mehr\\s+mit\\s+)?'+n).test(t))out.rules.push({text:'Nie mit '+a.n,effect:{type:'avoidAirline',value:a.c}});
    else if(new RegExp('(lieber|bevorzugt|bevorzuge|am liebsten|prefer|nur)\\s+(mit\\s+)?'+n).test(t))out.rules.push({text:a.n+' bevorzugen',effect:{type:'preferAirline',value:a.c}});}
  for(const al of ['star alliance','oneworld','skyteam'])if(new RegExp('(lieber|bevorzugt|bevorzuge|prefer|nur)\\s+(mit\\s+)?'+al).test(t))out.rules.push({text:al.replace(/\b\w/g,c=>c.toUpperCase())+' bevorzugen',effect:{type:'preferAlliance',value:al==='star alliance'?'Star Alliance':al==='oneworld'?'oneworld':'SkyTeam'}});
  if((m=/(nicht vor|fruhestens|fruehestens|ab)\s*(\d{1,2})\s*uhr/.exec(t)))out.rules.push({text:`Abflug nicht vor ${m[2]} Uhr`,effect:{type:'departAfter',value:m[2]}});
  if((m=/(umstieg|layover)[^.]{0,20}(max(imal)?|hochstens|hoechstens)\s*(\d{1,2})\s*(std|stunden|h)/.exec(t)))out.rules.push({text:`Umstieg höchstens ${m[4]} Stunden`,effect:{type:'maxLayoverH',value:m[4]}});
  return out;
}
if(typeof module!=='undefined')module.exports={parseRequest};
