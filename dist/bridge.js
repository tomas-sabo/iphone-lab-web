const REPO='tomas-sabo/bridge',PREFIX='operator/requests';
const SOURCES=[['architekt','Architekt'],['tinder','Tinder'],['rafi','Rafi'],['robota','Robota'],['whatsapp','WhatsApp'],['instagram','Instagram'],['inactive','Neaktívni']];
const API=`https://api.github.com/repos/${REPO}`;
const $=id=>document.getElementById(id);
let token='',items=[],working=false;
let inactiveChats=[],inactiveStatus='Pripoj bridge na načítanie neaktívnych chatov.';
let whatsappNames=[],whatsappUnassigned=[],whatsappManual=[],whatsappListStatus='Pripoj bridge na načítanie kontaktov.';
const REQUEST_DRAFTS_KEY='iphone-lab-request-drafts-v1';
function storedRequestDrafts(){try{const value=JSON.parse(localStorage.getItem(REQUEST_DRAFTS_KEY)||'[]');return Array.isArray(value)?value.filter(row=>Array.isArray(row)&&typeof row[0]==='string'&&typeof row[1]==='string'&&row[1].length<=3000):[]}catch{return []}}
const drafts=new Map(storedRequestDrafts()),groupOpen=new Map();
function saveRequestDrafts(){try{if(drafts.size)localStorage.setItem(REQUEST_DRAFTS_KEY,JSON.stringify([...drafts]));else localStorage.removeItem(REQUEST_DRAFTS_KEY)}catch{}}
function editingPanel(){const active=document.activeElement;return Boolean(active&&(active.tagName==='TEXTAREA'||active.isContentEditable)||$('conversation-dialog').open||$('manual-dialog').open)}
let renderDeferred=false;
function flushDeferredRender(){if(renderDeferred&&!editingPanel())render()}
document.addEventListener('focusout',()=>setTimeout(flushDeferredRender,0));
for(const id of ['conversation-dialog','manual-dialog'])$(id).addEventListener?.('close',flushDeferredRender);

let lastApiCall=0,lastRefresh=0;
let refreshController=null;
const REFRESH_TIMEOUT_MS=30000;
const RATE_KEY='iphone-lab-github-pause-until';
function readPause(){try{const value=Number(localStorage.getItem(RATE_KEY))||0,now=Date.now();if(value<=now||value>now+7200000){localStorage.removeItem(RATE_KEY);return 0}return value}catch{return 0}}
function pauseUntil(t){try{const now=Date.now();localStorage.setItem(RATE_KEY,String(Math.max(now+1000,Math.min(Number(t)||now+60000,now+7200000))))}catch{}}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const PAIRING_KEY='iphone-lab-bridge-pairing-v1';
function forgetPairing(){drafts.clear();saveRequestDrafts();try{localStorage.removeItem(PAIRING_KEY)}catch{}}
function savedPairing(){try{return localStorage.getItem(PAIRING_KEY)||''}catch{return ''}}
function rememberPairing(){try{localStorage.setItem(PAIRING_KEY,token);return true}catch{return false}}
function connected(){ $('connect').hidden=true;$('disconnect').hidden=false; }

const encoder=new TextEncoder();
export function canonical(v){if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}'}
export async function hash(v){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(canonical(v))))).map(v=>v.toString(16).padStart(2,'0')).join('')}
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export async function validate(record,id){const r=record?.request;if(record?.schema_version!==1||!r||!UUID.test(r.id)||r.id!==id||!SOURCES.some(([source])=>source===r.source))throw Error('Neplatná požiadavka.');for(const [k,n] of [['title',160],['body',6000],['proposed_action',3000],['context_ref',200]])if(typeof r[k]!=='string'||!r[k].trim()||r[k].length>n)throw Error('Neplatný obsah požiadavky.');const created=Date.parse(r.created_at),expires=Date.parse(r.expires_at);if(!Number.isFinite(created)||!Number.isFinite(expires)||created>=expires||expires-created>7*86400000||!/^[a-f0-9]{64}$/.test(r.context_sha256)||await hash(r)!==record.request_digest)throw Error('Kontrola požiadavky zlyhala.');if(r.kind==='work_file'){const f=r.file_change;if(!f||!['write','delete'].includes(f.operation)||typeof f.path!=='string'||!f.path.startsWith('/')||f.path.length>2000||!['before_sha256','after_sha256'].every(k=>f[k]===null||/^[a-f0-9]{64}$/.test(f[k]))||f.operation==='write'&&!f.after_sha256||f.operation==='delete'&&(!f.before_sha256||f.after_sha256!==null)||await hash(f)!==r.context_sha256)throw Error('Neplatný rozsah zmeny súboru.')}const d=record.decision;if(d!==null){if(!d||!['approved','rejected','commented'].includes(d.outcome)||d.operator!=='Tomy'||d.request_digest!==record.request_digest||!Number.isFinite(Date.parse(d.decided_at))||Date.parse(d.decided_at)<created||Date.parse(d.decided_at)>expires)throw Error('Neplatné rozhodnutie.');if(d.outcome==='commented'&&(typeof d.comment!=='string'||!d.comment.trim()||d.comment.length>3000))throw Error('Neplatné vyjadrenie.');if(r.kind==='work_file'&&d.outcome==='approved'&&!['once','always'].includes(d.permission))throw Error('Chýba rozsah povolenia.');if(d.permission&&(r.kind!=='work_file'||d.outcome!=='approved'))throw Error('Neplatný rozsah povolenia.');if(d.revoked_at&&(d.permission!=='always'||!Number.isFinite(Date.parse(d.revoked_at))||Date.parse(d.revoked_at)<Date.parse(d.decided_at)))throw Error('Neplatné odvolanie povolenia.')}return record}
function encode(v){let b='';for(const byte of encoder.encode(JSON.stringify(v)))b+=String.fromCharCode(byte);return btoa(b)}
function decode(v){return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(v.replace(/\s/g,'')),c=>c.charCodeAt(0))))}
async function api(path,options={}){
 const authProbe=options.authProbe===true;if(authProbe){options={...options};delete options.authProbe}
 if(refreshController?.signal.aborted)throw Error('Obnovenie bolo prerušené. Zopakuj synchronizáciu.');
 const pause=readPause();if(Date.now()<pause)throw Error(`GitHub má dočasný limit. Ďalší pokus po ${new Date(pause).toLocaleTimeString('sk-SK')}. Párovanie zostáva uložené.`);
 const mutation=options.method&&options.method!=='GET';
 const delay=lastApiCall+(mutation?1000:250)-Date.now();if(delay>0)await wait(delay);lastApiCall=Date.now();
 const response=await fetch(API+path,{...options,redirect:'error',cache:'no-store',headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(options.body?{'Content-Type':'application/json'}:{})},signal:refreshController?.signal||AbortSignal.timeout(20000)});
 const remaining=response.headers?.get('X-RateLimit-Remaining'),reset=Number(response.headers?.get('X-RateLimit-Reset')||0)*1000,retry=Number(response.headers?.get('Retry-After')||0)*1000;
 if(remaining!==null&&remaining!==undefined&&Number(remaining)<20)pauseUntil(Math.max(Date.now()+60000,reset+5000));
 if(!response.ok){
  if(response.status===401){showAutomation(null);forgetPairing();resetConversations(true);token='';$('connect').hidden=false;$('disconnect').hidden=true;items=[];whatsappNames=[];whatsappUnassigned=[];whatsappManual=[];whatsappListStatus='Pripoj bridge na načítanie kontaktov.';render();throw Error('Prístup bol odmietnutý. Pripoj bridge platným tokenom.')}
  if([403,429].includes(response.status)){
   if(authProbe&&response.status===403&&remaining!=='0'&&!retry)throw Error('GitHub odmietol overenie (HTTP 403). Párovanie zostáva uložené; skontroluj dočasný limit alebo oprávnenie tokenu a skús znova.')
   const until=Math.max(Date.now()+Math.max(retry,60000),remaining==='0'?reset+5000:0);pauseUntil(until);
   throw Error(`GitHub dočasne odmietol požiadavku. Ďalší pokus po ${new Date(until).toLocaleTimeString('sk-SK')}. Párovanie zostáva uložené.`);
  }
  if(authProbe&&response.status===404)throw Error('Súkromný bridge teraz nie je dostupný (HTTP 404). Párovanie zostáva uložené; skontroluj prístup a skús znova.')
  if([409,422].includes(response.status))throw Error('Požiadavka sa zmenila alebo už bola vybavená. Obnov zoznam.');
  const error=Error(`Bridge nie je dostupný (HTTP ${response.status}).`);error.status=response.status;throw error;
 }
 return response.json();
}
function message(text){$('bridge-status').textContent=text}
function element(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e}
export function validateTinderChatUrl(value){if(typeof value!=='string'||value.length>320)throw Error('Neplatný odkaz na chat.');const u=new URL(value);if(u.protocol!=='https:'||u.hostname!=='tinder.com'||u.username||u.password||u.port||u.search||u.hash||!/^\/app\/messages\/[A-Za-z0-9_-]{3,160}$/.test(u.pathname))throw Error('Neplatný odkaz na chat.');return u.href}
async function copyDraft(draft){if(typeof draft!=='string'||!draft.trim()||draft.length>1500)throw Error('Návrh nie je aktuálny.');try{await navigator.clipboard.writeText(draft);message('Návrh je skopírovaný. Vlož ho do Tinderu a odoslanie potvrď manuálne.')}catch{message('Návrh sa nepodarilo skopírovať. Skopíruj ho z karty ručne.')}}
function appendTinderActions(parent,url,draft=null){url=validateTinderChatUrl(url);const link=element('a','Otvoriť chat v Tinderi','tinder-chat-open');link.href=url;link.target='_blank';link.rel='noopener noreferrer';parent.append(link);if(draft){const copy=element('button','Skopírovať návrh','secondary tinder-draft-copy');copy.type='button';copy.onclick=()=>copyDraft(draft);parent.append(copy)}}
export function manualContactNames(manual,index){return [...new Set([...manual,...index.map(c=>c.name)])]}
function syncBadge(){const count=[...drafts.values()].filter(v=>v.trim()).length;$('sync-count').textContent=String(count);$('sync-count').hidden=!count}
function render(){
 if(editingPanel()){renderDeferred=true;return}renderDeferred=false;
 syncBadge();$('requests').replaceChildren();
 for(const [source,name] of SOURCES){
  if(source==='inactive')continue;
  const group=element('details',undefined,'request-group');
  const matches=items.filter(item=>item.record.request.source===source);
  const pending=matches.filter(item=>!item.record.decision&&Date.now()<Date.parse(item.record.request.expires_at)).length;
  group.open=groupOpen.has(source)?groupOpen.get(source):(source!=='whatsapp'&&pending>0);
  const heading=element('summary',name,'group-heading');
  heading.onclick=()=>groupOpen.set(source,!group.open);
  heading.append(element('span',`${pending}/${source==='whatsapp'?whatsappNames.filter(name=>!whatsappManual.includes(name)).length:matches.length}`,'group-count'));
  group.append(heading);
  if(source==='whatsapp'){
   group.append(element('h3','Priradené kontakty','contact-heading'));
   const list=element('ul',undefined,'contact-list');
   for(const name of whatsappNames.filter(name=>!whatsappUnassigned.includes(name)&&!whatsappManual.includes(name)))list.append(contactEntry(name));
   group.append(list);
   const unassigned=element('details',undefined,'unassigned-contacts');
   unassigned.open=groupOpen.get('whatsapp-unassigned')||false;
   const toggle=element('summary',`Nepriradení (${whatsappUnassigned.filter(name=>!whatsappManual.includes(name)).length})`);
   toggle.onclick=()=>groupOpen.set('whatsapp-unassigned',!unassigned.open);
   const pendingList=element('ul',undefined,'contact-list');
   for(const name of whatsappUnassigned.filter(name=>!whatsappManual.includes(name)))pendingList.append(contactEntry(name));
   unassigned.append(toggle,pendingList);
   if(!whatsappUnassigned.some(name=>!whatsappManual.includes(name)))unassigned.append(element('p','Žiadne nepriradené kontakty.','group-empty'));
   group.append(unassigned,element('p',whatsappListStatus,'group-empty'));
  }
  if(!matches.length)group.append(element('p','Zatiaľ žiadne požiadavky.','group-empty'));
  $('requests').append(group);
  for(const item of matches){
   const r=item.record.request,d=item.record.decision,expired=Date.now()>=Date.parse(r.expires_at),done=Boolean(d)||expired;
   const card=element(done?'details':'article',undefined,done?'request request-done':'request');
   if(done)card.append(element('summary',r.title,'request-title'));
   card.append(element('span',name,'source'));
   if(!done)card.append(element('h3',r.title,'request-title'));
   card.append(element('p',r.body,'context'),element('h4','Čo schvaľuješ'),element('p',r.proposed_action,'action'));
   if(item.open_url&&(source==='tinder'||source==='rafi'))appendTinderActions(card,item.open_url,item.draft);
   card.append(element('small',`Referencia: ${r.context_ref} · Platí do ${new Date(r.expires_at).toLocaleString('sk-SK')}`));
   if(d){
    card.append(element('p',d.revoked_at?'Trvalé povolenie odvolané':d.permission==='always'?'Povolené trvalo':({approved:'Schválené ✓',rejected:'Zamietnuté',commented:'Vyjadrenie odoslané'})[d.outcome],'decision'));
    if(d.outcome==='commented')card.append(element('p',d.comment,'context'));
    if(d.permission==='always'&&!d.revoked_at){const revoke=element('button','Odvolať trvalé povolenie','secondary');revoke.type='button';revoke.disabled=working;revoke.onclick=()=>revokePermission(item);card.append(revoke)}
   }else if(expired)card.append(element('p','Platnosť vypršala. Vyžiadaj novú požiadavku.'));
   else{
    const controls=element('div',undefined,'decision-buttons');
    for(const [outcome,label,permission] of (r.kind==='work_file'?[['approved','Povoliť raz','once'],['approved','Povoliť trvalo','always'],['rejected','Zakázať']]:[['approved','Schváliť'],['rejected','Zamietnuť']])){const b=element('button',label,outcome==='rejected'?'secondary':'');b.type='button';b.disabled=working;b.onclick=()=>decide(item,outcome,'',permission);controls.append(b)}
    card.append(controls);
    const label=element('label','Tvoje vyjadrenie');label.htmlFor='comment-'+r.id;
    const input=element('textarea');input.id=label.htmlFor;input.rows=3;input.maxLength=3000;input.placeholder='Napíš odpoveď alebo doplnenie…';input.value=drafts.get(r.id)||'';input.disabled=working;input.oninput=()=>{drafts.set(r.id,input.value);saveRequestDrafts();syncBadge()};
    const send=element('button','Odoslať vyjadrenie','secondary');send.type='button';send.disabled=working;send.onclick=()=>decide(item,'commented',input.value);
    const box=element('div',undefined,'comment-box');box.append(label,input,send,element('small','Vyjadrenie odošle odpoveď zdroju. Neznamená schválenie akcie.'));card.append(box);
   }
   group.append(card);
  }
 }

 const manualNames=manualContactNames(whatsappManual,conversationIndex);
 const manual=element('details',undefined,'request-group manual-contacts');manual.open=groupOpen.get('manual-contacts')||false;
 const title=element('summary','Manuálne','group-heading');title.append(element('span',`0/${manualNames.length}`,'group-count'));title.onclick=()=>groupOpen.set('manual-contacts',!manual.open);
 const list=element('ul',undefined,'contact-list');for(const name of manualNames)list.append(contactEntry(name,true));
 manual.append(title,list);if(conversationStatus)manual.append(element('p',conversationStatus,'group-empty'));if(!manualNames.length)manual.append(element('p','Podrž kontakt a vyber Áno.','group-empty'));
 $('requests').append(manual);
 const pendingInactive=items.filter(i=>i.record.request.source==='inactive'&&!i.record.decision&&Date.now()<Date.parse(i.record.request.expires_at));
 const inactive=element('details',undefined,'request-group inactive-contacts');inactive.open=groupOpen.get('inactive-contacts')||pendingInactive.length>0;
 const inactiveTitle=element('summary','Neaktívni','group-heading');inactiveTitle.append(element('span',`${pendingInactive.length}/${inactiveChats.filter(c=>c.state==='inactive').length}`,'group-count'));inactiveTitle.onclick=()=>groupOpen.set('inactive-contacts',!inactive.open);
 inactive.append(inactiveTitle);
 for(const item of pendingInactive){const card=element('article',undefined,'request');card.append(element('h3',item.record.request.title),element('p',item.record.request.body));const controls=element('div',undefined,'decision-buttons');for(const [outcome,label] of [['approved','Áno, zaradiť medzi aktívne'],['rejected','Nie, ponechať neaktívny']]){const button=element('button',label);button.type='button';button.disabled=working;button.onclick=()=>decide(item,outcome);controls.append(button)}card.append(controls);inactive.append(card)}
 const inactiveList=element('ul',undefined,'contact-list');
 for(const chat of inactiveChats){const row=element('li'),link=element('a',chat.name,'contact-name');link.href=chat.open_url;link.target='_blank';link.rel='noopener noreferrer';row.append(link);inactiveList.append(row)}
 inactive.append(inactiveList,element('p',inactiveStatus,'group-empty'));
 $('requests').append(inactive);
}
let progressLoading=null;
let statisticsManifest=null,statisticsData=null,statisticsLoading=false,statisticsMonth='',statisticsMetric='totalMD';
function resetStatistics(){resetOriginalStatistics();statisticsManifest=null;statisticsData=null;$('statistics-body').replaceChildren();$('statistics-status').textContent='Pripoj bridge na načítanie súkromného reportu.';clearWaiting();clearActive()}
const SHA256=/^[a-f0-9]{64}$/;
const WAITING_CASE=/^case-[a-f0-9]{24}$/;
const WAITING_STATES=new Set(['needs_user','uncertain','attempt_started','rejected','transport_blocked','open_pending','stale','prepared','dispatched','awaiting_reply']);
export function validateWaitingDetails(value){
 if(value===undefined)return null;
 if(!Array.isArray(value)||value.length>100)throw Error('Neplatné detaily čakajúcich chatov.');
 return value.map(row=>{
  if(!row||!WAITING_CASE.test(row.case_id)||typeof row.name!=='string'||!row.name.trim()||row.name.length>120||typeof row.reason!=='string'||!row.reason.trim()||row.reason.length>1000||!WAITING_STATES.has(row.state)||typeof row.waiting_since!=='string')throw Error('Neplatný čakajúci chat.');
  const since=Date.parse(row.waiting_since);if(!Number.isFinite(since)||since>Date.now()+300000)throw Error('Neplatný čas čakajúceho chatu.');
  let open_url=null;if(row.open_url!==undefined)open_url=validateTinderChatUrl(row.open_url);
  return {case_id:row.case_id,name:row.name.trim(),reason:row.reason.trim(),state:row.state,waiting_since:row.waiting_since,...(open_url?{open_url}:{})};
 });
}
export function validateActiveDetails(value){
 if(value===undefined)return null;
 if(!Array.isArray(value)||value.length>10000)throw Error('Neplatný zoznam aktívnych chatov.');
 const ids=new Set();return value.map(row=>{
  if(row?.state!=='awaiting_reply'||ids.has(row.case_id)||!row.open_url)throw Error('Neplatný aktívny chat.');
  const checked=validateWaitingDetails([row])[0];ids.add(checked.case_id);return checked;
 });
}
export function chatProjections(p){
 const waiting=validateWaitingDetails(p.awaiting_details),count=Number.isSafeInteger(p.waiting_count)?p.waiting_count:p.awaiting_operator;
 if(waiting&&Number.isSafeInteger(count)&&waiting.length!==count)throw Error('Počet stojacich chatov nesúhlasí so súhrnom.');
 const active=validateActiveDetails(p.active_details);
 if(active&&(!Number.isSafeInteger(p.active_count)||p.active_count!==active.length))throw Error('Počet aktívnych chatov nesúhlasí so súhrnom.');
 const ours=waiting?.filter(row=>row.state!=='awaiting_reply')??null;
 const ids=new Set(ours?.map(row=>row.case_id)||[]);
 if(active?.some(row=>ids.has(row.case_id)))throw Error('Chat nemôže byť v oboch zoznamoch.');
 return {waiting:ours,waitingCount:ours?ours.length:Number.isSafeInteger(count)?count:0,active};
}
export function waitingDuration(value,now=Date.now()){
 const minutes=Math.max(0,Math.floor((now-Date.parse(value))/60000));
 if(minutes<1)return 'práve teraz';if(minutes<60)return `${minutes} min`;
 const hours=Math.floor(minutes/60);if(hours<24)return `${hours} h ${minutes%60} min`;
 const days=Math.floor(hours/24);return `${days} d ${hours%24} h`;
}
let waitingTimeElements=[];
function refreshWaitingDurations(){for(const [node,since] of [...waitingTimeElements,...activeTimeElements])node.textContent=waitingDuration(since)}
function clearWaiting(messageText='Pripoj bridge na načítanie čakajúcich chatov.'){
 waitingTimeElements=[];$('tinder-waiting-count').textContent='0';$('tinder-waiting-list').replaceChildren();$('tinder-waiting-status').textContent=messageText;
}
function renderWaiting(details,aggregate){
 const count=$('tinder-waiting-count'),status=$('tinder-waiting-status'),list=$('tinder-waiting-list');waitingTimeElements=[];list.replaceChildren();
 if(details===null){count.textContent=String(aggregate||0);status.textContent=aggregate?'Podrobnosti čakajúcich chatov ešte nie sú v súhrne bridge. Obnov synchronizáciu po aktualizácii MacBooku.':'Žiadny chat nečaká na tvoju odpoveď.';return}
 count.textContent=String(details.length);status.textContent=details.length?`${details.length} ${details.length===1?'chat stojí alebo čaká':'chatov stojí alebo čaká'} na ďalší krok.`:'Žiadny chat nečaká na tvoju odpoveď.';
 for(const row of details){const card=element('article',undefined,'waiting-chat'),head=element('div',undefined,'waiting-chat-header'),clock=element('time',waitingDuration(row.waiting_since),'waiting-chat-time');clock.dateTime=row.waiting_since;waitingTimeElements.push([clock,row.waiting_since]);head.append(element('span',row.name,'waiting-chat-name'),clock);card.append(head,element('p',row.reason,'waiting-chat-reason'));if(row.open_url)appendTinderActions(card,row.open_url);list.append(card)}
}

let activeChatRows=null,activeVisible=100,activeTimeElements=[],activeSignature='';
function clearActive(){activeChatRows=null;activeSignature='';activeTimeElements=[];activeVisible=100;$('tinder-active-list').replaceChildren();$('tinder-active-count').textContent='0';$('tinder-active-status').textContent='Pripoj bridge na načítanie aktívnych chatov.'}
function renderActive(rows){
 const signature=JSON.stringify(rows);if(signature===activeSignature)return;
 activeSignature=signature;activeChatRows=rows;drawActive();
}
function drawActive(){
 const rows=activeChatRows,list=$('tinder-active-list');list.replaceChildren();activeTimeElements=[];
 $('tinder-active-count').textContent=String(rows?.length||0);
 if(rows===null){$('tinder-active-status').textContent='Aktívne chaty zatiaľ nie sú v súhrne bridge. Zopakuj synchronizáciu po obnovení dát na MacBooku.';return}
 const shown=Math.min(activeVisible,rows.length);
 $('tinder-active-status').textContent=rows.length?`Čakáme na odpoveď druhej strany: ${rows.length}${shown<rows.length?' · Zobrazené '+shown+' z '+rows.length:''}.`:'Žiadny aktívny chat nečaká na odpoveď druhej strany.';
 for(const row of rows.slice(0,shown)){
  const card=element('article',undefined,'waiting-chat'),head=element('div',undefined,'waiting-chat-header'),clock=element('time',waitingDuration(row.waiting_since),'waiting-chat-time');clock.dateTime=row.waiting_since;activeTimeElements.push([clock,row.waiting_since]);
  head.append(element('span',row.name,'waiting-chat-name'),clock);card.append(head,element('p',row.reason,'waiting-chat-reason'));appendTinderActions(card,row.open_url);list.append(card);
 }
 if(shown<rows.length){const more=element('button','Zobraziť ďalších '+Math.min(100,rows.length-shown),'secondary');more.type='button';more.onclick=()=>{activeVisible+=100;drawActive()};list.append(more)}
}

function statisticsPointer(data){
 if(data.schema_version!==1||!SHA256.test(data.source_sha256)||!/^\d{4}-\d{2}-\d{2}$/.test(data.start)||!/^\d{4}-\d{2}-\d{2}$/.test(data.end)||data.start>data.end||!Number.isFinite(Date.parse(data.fetched_at))||!data.files||!data.files['overview.json']||Object.keys(data.files).length>64)throw Error('Neplatný manifest štatistiky.');
 for(const [name,file] of Object.entries(data.files))if(!/^(overview|p\d{2})\.json$/.test(name)||!SHA256.test(file.sha256)||!Number.isSafeInteger(file.bytes)||file.bytes<=0||file.bytes>900000)throw Error('Neplatná časť štatistiky.');
 return data;
}
async function readStatisticsPart(manifest,name){
 const expected=manifest.files[name];if(!expected)throw Error('Chýba časť reportu.');
 const file=await api(`/contents/operator/statistics/reports/${manifest.source_sha256}/${name}?ref=main`);
 if(typeof file.content!=='string'||file.content.length>1300000||file.size!==undefined&&file.size!==expected.bytes)throw Error('Neplatná veľkosť reportu.');
 const bytes=Uint8Array.from(atob(file.content.replace(/\s/g,'')),c=>c.charCodeAt(0));
 const actual=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
 if(bytes.length!==expected.bytes||actual!==expected.sha256)throw Error('Kontrola integrity reportu zlyhala.');
 const data=JSON.parse(new TextDecoder().decode(bytes));if(data.schema_version!==1||data.source_sha256!==manifest.source_sha256)throw Error('Nesprávna verzia reportu.');return data;
}
function validateStatistics(data){
 const numeric=v=>Number.isFinite(v)&&v>=0&&v<=100000000;
 if(!Array.isArray(data.people)||!data.people.length||data.people.length>50||!data.counts||data.counts.people!==data.people.length||!Number.isSafeInteger(data.counts.humanPRs)||data.counts.humanPRs<0)throw Error('Neplatné súhrnné dáta.');
 if(new Set(data.people.map(p=>p.id)).size!==data.people.length)throw Error('Duplicitná identita v reporte.');
 for(const p of data.people){
  if(!/^p\d{2}$/.test(p.id)||typeof p.name!=='string'||!p.name.trim()||p.name.length>160||p.jiraIdentityMatched!==true||!['totalMD','prMD','jiraOnlyMD','lowerMD','upperMD'].every(k=>numeric(p[k]))||p.lowerMD>p.totalMD||p.totalMD>p.upperMD||!p.counts||!Number.isSafeInteger(p.counts.prs)||p.counts.prs<0||!Array.isArray(p.months)||p.months.length>24)throw Error('Neplatný riadok reportu.');
  for(const m of p.months)if(!/^\d{4}-\d{2}$/.test(m.month)||!['totalMD','prMD','jiraOnlyMD','lowerMD','upperMD'].every(k=>numeric(m[k])))throw Error('Neplatný mesačný údaj.');
 }
 if(data.people.reduce((sum,p)=>sum+p.counts.prs,0)!==data.counts.humanPRs)throw Error('Počet PR nesúhlasí so súhrnom.');
 return data;
}
function md(value){return Number(value).toLocaleString('sk-SK',{maximumFractionDigits:2})}
function dateOnly(value){return new Date(value+'T12:00:00Z').toLocaleDateString('sk-SK')}
function statisticsTable(headings,rows){const wrap=element('div',undefined,'statistics-table');const table=element('table'),head=element('thead'),tr=element('tr');for(const h of headings)tr.append(element('th',h));head.append(tr);table.append(head);const body=element('tbody');for(const values of rows){const row=element('tr');for(const value of values)row.append(element('td',String(value??'—')));body.append(row)}table.append(body);wrap.append(table);return wrap}
function renderStatistics(){
 if(!statisticsData)return;const data=statisticsData,body=$('statistics-body');body.replaceChildren();
 body.append(element('p',`${dateOnly(data.start)} – ${dateOnly(data.end)} · ${data.counts.people} ľudí · ${data.counts.humanPRs} PR`,'statistics-summary'),element('p',`Dáta získané ${new Date(data.fetched_at).toLocaleString('sk-SK')}. Všetky Jira identity sú spárované.`,'hint'),element('p','Odhad pracnosti v MD, nie výkaz odpracovaných hodín. 1 MD = 8 hodín. Rozpätie je scenárový odhad, nie štatistický interval spoľahlivosti.','hint'));
 const controls=element('div',undefined,'statistics-controls'),monthLabel=element('label','Obdobie odhadu'),month=element('select');month.id='statistics-month';const all=element('option','Celé obdobie');all.value='';month.append(all);
 const months=[...new Set(data.people.flatMap(p=>p.months.map(m=>m.month)))].sort();for(const name of months){const option=element('option',name);option.value=name;month.append(option)}month.value=months.includes(statisticsMonth)?statisticsMonth:'';statisticsMonth=month.value;month.onchange=()=>{statisticsMonth=month.value;renderStatistics()};monthLabel.append(month);controls.append(monthLabel);
 const metricLabel=element('label','Porovnanie'),metric=element('select');metric.id='statistics-metric';for(const [key,name] of [['totalMD','Spolu MD'],['prMD','PR MD'],['jiraOnlyMD','Jira bez PR MD']]){const option=element('option',name);option.value=key;metric.append(option)}metric.value=statisticsMetric;metric.onchange=()=>{statisticsMetric=metric.value;renderStatistics()};metricLabel.append(metric);controls.append(metricLabel);body.append(controls);
 const value=p=>statisticsMonth?p.months.find(m=>m.month===statisticsMonth)?.[statisticsMetric]||0:p[statisticsMetric];const people=[...data.people].sort((a,b)=>value(b)-value(a)||a.name.localeCompare(b.name));const max=Math.max(1,...people.map(value));
 for(const person of people){
  const card=element('details',undefined,'statistics-person');card.append(element('summary',`${person.name} · ${md(value(person))} MD`));const meter=element('progress');meter.max=max;meter.value=value(person);meter.setAttribute?.('aria-label',`${person.name}: ${md(value(person))} MD`);card.append(meter,element('p',`Celé obdobie: ${person.counts.prs} PR · ${person.counts.merged??0} merged · ${person.counts.open??0} open · ${person.counts.jira??0} Jira.`, 'hint'),element('p',`Spolu ${md(person.totalMD)} MD · rozpätie ${md(person.lowerMD)} – ${md(person.upperMD)} MD. PR ${md(person.prMD)} MD + Jira bez PR ${md(person.jiraOnlyMD)} MD.`));
  card.append(statisticsTable(['Mesiac','Spolu MD','PR MD','Jira bez PR MD','Rozpätie MD'],person.months.map(m=>[m.month,md(m.totalMD),md(m.prMD),md(m.jiraOnlyMD),`${md(m.lowerMD)} – ${md(m.upperMD)}`])));
  const details=element('div'),button=element('button','Načítať detail PR / Jira','secondary');button.type='button';button.onclick=()=>loadStatisticsPerson(person,button,details);card.append(button,details);body.append(card);
 }
 const method=element('details',undefined,'statistics-method');method.append(element('summary','Metodika a obmedzenia'));
 for(const [key,value] of Object.entries(data.methodology||{}))if(typeof value==='string')method.append(element('h4',({unit:'Jednotka',scenario:'Scenár',date:'Priradenie dátumu',inclusion:'Zahrnutie',deduplication:'Odstránenie duplicít',sizing:'Odhad veľkosti',uncertainty:'Neistota',limitations:'Obmedzenia'})[key]||key),element('p',value,'context'));
 body.append(method);
}
async function loadStatisticsPerson(person,button,target){
 if(!token||!statisticsManifest)return;const manifest=statisticsManifest;button.disabled=true;target.replaceChildren(element('p','Načítavam súkromný detail…'));
 try{
  const data=await readStatisticsPart(manifest,person.id+'.json');
  if(data.id!==person.id||data.name!==person.name||!Array.isArray(data.prs)||!Array.isArray(data.jira)||data.prs.length>5000||data.jira.length>5000)throw Error('Neplatný detail štatistiky.');
  if(statisticsManifest!==manifest||!token)return;
  target.replaceChildren();const prs=element('details'),jira=element('details');prs.append(element('summary',`PR (${data.prs.length})`),statisticsTable(['PR','Názov','Dátum','Stav','MD','Zahrnuté'],data.prs.map(p=>[`#${p.number}`,p.title,p.date,p.state,md(p.md||0),p.included?'Áno':'Nie'])));jira.append(element('summary',`Jira (${data.jira.length})`),statisticsTable(['Kľúč','Názov','Stav','Vyriešené','Jira bez PR MD','Zaradenie'],data.jira.map(j=>[j.key,j.title,j.status,j.resolved,md(j.jiraOnlyMD||0),j.decision])));target.append(prs,jira);
 }catch(e){target.replaceChildren(element('p',e.message||'Detail sa nepodarilo načítať.'))}
 finally{button.disabled=false}
}
async function loadStatistics(){
 if(statisticsLoading)return;if(!token){$('statistics-status').textContent='Najprv pripoj súkromný bridge.';return}
 statisticsLoading=true;$('statistics-load').disabled=true;$('statistics-status').textContent='Načítavam súkromnú štatistiku…';
 try{
  const file=await api('/contents/operator/statistics/index.json?ref=main');if(typeof file.content!=='string'||file.content.length>64000)throw Error('Neplatná veľkosť manifestu.');
  const manifest=statisticsPointer(decode(file.content)),data=validateStatistics(await readStatisticsPart(manifest,'overview.json'));
  if(data.start!==manifest.start||data.end!==manifest.end||data.fetched_at!==manifest.fetched_at)throw Error('Verzie reportu nesúhlasia.');
  statisticsManifest=manifest;statisticsData=data;renderStatistics();$('statistics-status').textContent=`Súkromný report · načítané ${new Date().toLocaleTimeString('sk-SK')}.`;
 }catch(e){$('statistics-status').textContent=e.status===404?'Štatistika zatiaľ nie je v súkromnom bridge.':`${e.message||'Report sa nepodarilo načítať.'}${statisticsData?' Zobrazený report je predchádzajúci snapshot.':''}`}
 finally{statisticsLoading=false;$('statistics-load').disabled=false}
}
$('statistics-load').onclick=loadStatistics;

// Private conversation details are fetched only after an explicit contact tap.
const CONVERSATION_DRAFTS_KEY='iphone-lab-conversation-work-v1';
let conversationIndex=[],conversationStatus='',activeConversation=null,conversationBusy=false;
function conversationWork(){try{return JSON.parse(localStorage.getItem(CONVERSATION_DRAFTS_KEY)||'{}')}catch{return {}}}
function rememberConversationWork(){
 if(!activeConversation)return;
 const data=conversationWork();data[activeConversation.record.id]={text:$('conversation-text').value,notes:$('conversation-notes').value,snapshot_sha256:activeConversation.record.snapshot_sha256};
 try{localStorage.setItem(CONVERSATION_DRAFTS_KEY,JSON.stringify(data))}catch{$('conversation-feedback').textContent='Zariadenie neuložilo pracovný text. Použi Uložiť pracovný text.'}
}
function resetConversations(forget=false){resetStatistics();conversationIndex=[];activeConversation=null;$('conversation-dialog').close?.();$('conversation-body').replaceChildren();if(forget)try{localStorage.removeItem(CONVERSATION_DRAFTS_KEY)}catch{}}
async function loadConversationIndex(){
 try{
  const file=await api('/contents/operator/conversations/index.json?ref=main'),data=decode(file.content);
  if(data.schema_version!==1||!Array.isArray(data.contacts)||data.contacts.length>20||!data.contacts.every(c=>UUID.test(c.id)&&typeof c.name==='string'&&c.name.length<=160&&['user','rafi'].includes(c.owner)))throw Error('Invalid private index');
  conversationIndex=data.contacts.map(c=>{const open_url=c.open_url===undefined?null:validateTinderChatUrl(c.open_url);if(c.draft!==undefined&&(!open_url||typeof c.draft!=='string'||!c.draft.trim()||c.draft.length>1500))throw Error('Invalid private index');return {...c,open_url,draft:c.draft??null}});conversationStatus='';
 }catch(e){if(e.status===404)conversationIndex=[];else conversationStatus='Detail manuálnych komunikácií sa neobnovil. Zopakuj synchronizáciu.'}
 render();
}
async function validateConversation(record,id){
 if(record.schema_version!==1||record.id!==id||!UUID.test(id)||!UUID.test(record.revision)||typeof record.name!=='string'||record.name.length>160||!['user','rafi'].includes(record.owner))throw Error('Neplatný detail komunikácie.');
 const s=record.snapshot;
 if(!s||!s.profile||typeof s.profile!=='object'||!Array.isArray(s.history)||!s.history.length||s.history.length>10000||!s.history.every(m=>['user','other'].includes(m.sender)&&typeof m.text==='string'&&m.text.length<=20000&&Number.isFinite(Date.parse(m.sent_at)))||await hash(s)!==record.snapshot_sha256)throw Error('Prázdny alebo neplatný snapshot.');
 if(typeof record.rafi_draft?.text!=='string'||record.rafi_draft.text.length>10000||typeof record.operator_text!=='string'||record.operator_text.length>10000||typeof record.operator_notes!=='string'||record.operator_notes.length>20000)throw Error('Neplatný pracovný text.');
 if(record.rafi_draft.snapshot_sha256!==record.snapshot_sha256&&record.rafi_draft.status!=='stale')throw Error('Návrh nepatrí k snapshotu.');
 const h=record.handoff;
 if(h){if(!UUID.test(h.id)||!['pending','accepted','stale'].includes(h.status)||h.snapshot_sha256!==record.snapshot_sha256||await hash({snapshot_sha256:record.snapshot_sha256,operator_text:record.operator_text,operator_notes:record.operator_notes,handoff_id:h.id})!==h.context_sha256)throw Error('Neplatné odovzdanie.');}
 return record;
}
function ownerText(record){return record.handoff?.status==='pending'?'Tomy → Rafi: čaká na spracovanie':record.handoff?.status==='stale'?'Tomy: konflikt snapshotu, návrat je zablokovaný':record.owner==='user'?'Komunikáciu riadi Tomy':'Rafi: iba príprava nového návrhu'}
function profileText(value){if(value===null)return '';if(Array.isArray(value))return value.map(profileText).filter(Boolean).join('\n');if(typeof value==='object')return Object.entries(value).map(([key,v])=>{const t=profileText(v);return t?`${({name:'Názov',title:'Pozícia',company:'Firma'})[key]||key}: ${t}`:''}).filter(Boolean).join('\n');return String(value)}
function showConversation(record,sha){
 activeConversation={record,sha};const body=$('conversation-body');body.replaceChildren();
 body.append(element('h2',record.name),element('p',ownerText(record),'conversation-owner'),element('p',`Historický Tinder snapshot · ${record.snapshot.history.length} správ · posledná správa ${new Date(record.snapshot.history.at(-1).sent_at).toLocaleString('sk-SK')}. Nové, zmazané ani WhatsApp správy nemusia byť zahrnuté.`,'hint'));
 const profile=element('details',undefined,'conversation-profile');profile.append(element('summary','Profil'));
 for(const [key,value] of Object.entries(record.snapshot.profile)){const t=profileText(value);if(t)profile.append(element('h4',({name:'Meno',bio:'O nej',jobs:'Práca',schools:'Školy',selected_descriptors:'Charakteristiky',relationship_intent:'Zámer'})[key]||key),element('p',t,'context'))}
 body.append(profile);
 const history=element('details',undefined,'conversation-history');history.append(element('summary','Celá dostupná história'));
 const list=element('ol');for(const m of [...record.snapshot.history].sort((a,b)=>Date.parse(a.sent_at)-Date.parse(b.sent_at))){const row=element('li');row.append(element('strong',m.sender==='user'?'Tomy':record.snapshot.profile.name||'Kontakt'),element('small',new Date(m.sent_at).toLocaleString('sk-SK')),element('p',m.text,'context'));list.append(row)}history.append(list);body.append(history);
 const proposal=element('details',undefined,'conversation-proposal');proposal.append(element('summary',record.rafi_draft.status==='stale'?'Predošlý návrh — vyžaduje prepracovanie':'Návrh Rafiho — neodoslaný'),element('p',record.rafi_draft.text,'context'),element('small','Návrh na tvoju úpravu. Osobné tvrdenia treba overiť; text nie je schválená správa ani záväzok stretnutia.'));body.append(proposal);
 const mapped=conversationIndex.find(c=>c.id===record.id&&c.open_url);if(mapped)appendTinderActions(body,mapped.open_url,mapped.draft);
 const work=conversationWork()[record.id];
 const label=element('label','Tvoj pracovný text — neodoslaný');label.htmlFor='conversation-text';const input=element('textarea');input.id=label.htmlFor;input.rows=6;input.maxLength=10000;input.value=work?.text??record.operator_text;input.oninput=rememberConversationWork;
 const noteLabel=element('label','Nové informácie alebo poznámky pre Rafiho');noteLabel.htmlFor='conversation-notes';const notes=element('textarea');notes.id=noteLabel.htmlFor;notes.rows=4;notes.maxLength=20000;notes.value=work?.notes??record.operator_notes;notes.oninput=rememberConversationWork;
 const locked=record.owner!=='user'||Boolean(record.handoff);input.disabled=locked;notes.disabled=locked;
 const save=element('button','Uložiť pracovný text');save.type='button';save.disabled=locked;save.onclick=()=>saveConversation(false);
 const back=element('button','Vrátiť Rafimu','secondary');back.type='button';back.disabled=locked;back.onclick=()=>saveConversation(true);
 const feedback=element('p','','hint');feedback.id='conversation-feedback';feedback.setAttribute?.('role','status');
 if(work&&work.snapshot_sha256!==record.snapshot_sha256){feedback.textContent='Snapshot sa zmenil. Tvoj text zostal zachovaný; pred odovzdaním vyrieš konflikt.';save.disabled=true;back.disabled=true;}
 body.append(label,input,noteLabel,notes,element('small','Uloženie ani návrat Rafimu správu neodošle. Poznámky sa nezapisujú do histórie ako odoslané správy.'),save,back,feedback);
}
async function openConversation(id){
 if(!token||working||conversationBusy||$('manual-dialog').open||!conversationIndex.some(c=>c.id===id))return;
 conversationBusy=true;message('Načítavam súkromný detail…');
 try{const file=await api(`/contents/operator/conversations/${id}.json?ref=main`),record=await validateConversation(decode(file.content),id);showConversation(record,file.sha);$('conversation-dialog').showModal();message('Súkromný detail bol načítaný.')}
 catch(e){message(e.message||'Detail sa nepodarilo načítať.')}
 finally{conversationBusy=false}
}
async function saveConversation(returnToRafi){
 if(!activeConversation||!token||conversationBusy||activeConversation.record.owner!=='user'||activeConversation.record.handoff)return;
 const text=$('conversation-text').value,notes=$('conversation-notes').value;rememberConversationWork();
 if(returnToRafi&&!confirm('Vrátiť komunikáciu Rafimu na prípravu NOVÉHO návrhu?\n\nPracovný text a poznámky sa zachovajú. Nič sa neodošle a odosielanie zostane pozastavené.'))return;
 conversationBusy=true;
 try{
  const id=activeConversation.record.id,file=await api(`/contents/operator/conversations/${id}.json?ref=main`),record=await validateConversation(decode(file.content),id);
  if(file.sha!==activeConversation.sha||record.revision!==activeConversation.record.revision||record.snapshot_sha256!==activeConversation.record.snapshot_sha256||record.owner!=='user'||record.handoff)throw Error('Detail sa zmenil. Tvoj text zostal lokálne uložený; zavri detail a znovu ho otvor.');
  record.operator_text=text;record.operator_notes=notes;record.revision=crypto.randomUUID();record.updated_at=new Date().toISOString();
  if(returnToRafi){const hid=crypto.randomUUID();record.owner='rafi';record.sync_status='return_pending';record.handoff={id:hid,status:'pending',created_at:record.updated_at,snapshot_sha256:record.snapshot_sha256,context_sha256:await hash({snapshot_sha256:record.snapshot_sha256,operator_text:text,operator_notes:notes,handoff_id:hid})};}
  const saved=await api(`/contents/operator/conversations/${id}.json`,{method:'PUT',body:JSON.stringify({branch:'main',sha:file.sha,message:returnToRafi?'Request private conversation handoff':'Save private operator work text',content:encode(record)})});
  const local=conversationWork();delete local[id];try{localStorage.setItem(CONVERSATION_DRAFTS_KEY,JSON.stringify(local))}catch{}
  showConversation(record,saved.content?.sha||file.sha);$('conversation-feedback').textContent=returnToRafi?'Žiadosť je uložená. Čaká na lokálne spracovanie; nič sa neodoslalo.':'Pracovný text je súkromne uložený. Nič sa neodoslalo.';
 }catch(e){$('conversation-feedback').textContent=e.message||'Uloženie zlyhalo. Pracovný text zostal v tomto zariadení.'}
 finally{conversationBusy=false}
}
$('conversation-close').onclick=()=>{rememberConversationWork();$('conversation-dialog').close();activeConversation=null};
$('conversation-dialog').oncancel=()=>{rememberConversationWork();activeConversation=null};

function validateContacts(data){
 if(data.schema_version!==1||!Array.isArray(data.names)||data.names.length>2000||!data.names.every(name=>typeof name==='string'&&name.length<=160&&name.trim().length>0&&!/[\u0000-\u001f]/.test(name))||new Set(data.names).size!==data.names.length)throw Error('Invalid contact list');
 const assigned=data.paired_names,unassigned=data.unpaired_names;
 if(assigned!==undefined||unassigned!==undefined){
  if(!Array.isArray(assigned)||!Array.isArray(unassigned))throw Error('Invalid contact groups');
  const combined=[...assigned,...unassigned];
  if(combined.length!==data.names.length||new Set(combined).size!==combined.length||!combined.every(name=>data.names.includes(name)))throw Error('Invalid contact groups');
 }
 const manual=data.manual_names||[];
 if(!Array.isArray(manual)||new Set(manual).size!==manual.length||!manual.every(name=>data.names.includes(name)))throw Error('Invalid manual contacts');
 return data;
}
function applyContacts(data){whatsappNames=data.names;whatsappUnassigned=data.unpaired_names===undefined?[...data.names]:data.unpaired_names;whatsappManual=data.manual_names||[];whatsappListStatus='Uložené WhatsApp kontakty.'}
async function loadWhatsAppNames(){
 try{const file=await api('/contents/operator/whatsapp-contacts.json?ref=main');applyContacts(validateContacts(decode(file.content)))}
 catch(e){whatsappListStatus=e.status===404?'Zoznam kontaktov zatiaľ nie je pripravený.':'Kontakty sa neobnovili; zobrazený zoznam môže byť starší.'}
 render();
}
export function validateInactiveChats(data){
 if(data?.schema_version!==1||!Array.isArray(data.chats)||data.chats.length>10000||data.total!==data.chats.length||!Number.isSafeInteger(data.pending)||data.pending!==data.chats.filter(c=>c?.state==='reactivation_pending').length)throw Error('Neplatný zoznam neaktívnych chatov.');
 const ids=new Set();return data.chats.map(c=>{if(!c||typeof c.match_id!=='string'||!/^[A-Za-z0-9_-]{3,160}$/.test(c.match_id)||ids.has(c.match_id)||typeof c.name!=='string'||!c.name.trim()||c.name.length>160||!['inactive','reactivation_pending'].includes(c.state))throw Error('Neplatný neaktívny chat.');ids.add(c.match_id);const open_url=validateTinderChatUrl(c.open_url);if(new URL(open_url).pathname!=='/app/messages/'+c.match_id)throw Error('Nesúhlasí odkaz na chat.');return {...c,name:c.name.trim(),open_url}});
}
async function loadInactiveChats(){
 try{const file=await api('/contents/operator/tinder-inactive.json?ref=main');const rows=validateInactiveChats(decode(file.content));if(!token)return;inactiveChats=rows;inactiveStatus=rows.length?'Bez potvrdenia sa tieto chaty automaticky nespracujú.':'Žiadne neaktívne chaty.'}
 catch{inactiveStatus='Neaktívne chaty sa nepodarilo načítať. Skús synchronizáciu znova.'}
 render();
}
let selectedManualContact=null;
function showManualChoice(name){
 const detail=conversationIndex.find(c=>c.name===name);if(detail)return openConversation(detail.id);
 if(working||!token||!whatsappNames.includes(name)||$('manual-dialog').open)return;
 selectedManualContact=name;$('manual-contact-name').textContent=name;$('manual-dialog').showModal();
}
function contactEntry(name,manual=false){
 const row=element('li'),button=element('button',name,'contact-name');const detail=conversationIndex.find(c=>c.name===name);if(detail)button.onclick=()=>openConversation(detail.id);button.type='button';button.disabled=working;
 button.setAttribute?.('aria-label',`${name} — podržať pre voľbu Manuálne`);
 let hold=null,start=null;
 const cancel=()=>{if(hold!==null)clearTimeout(hold);hold=null;start=null};
 button.onpointerdown=e=>{if(e.button!==undefined&&e.button!==0)return;cancel();start=[e.clientX,e.clientY];hold=setTimeout(()=>{hold=null;showManualChoice(name)},600)};
 button.onpointermove=e=>{if(start&&Math.hypot(e.clientX-start[0],e.clientY-start[1])>10)cancel()};
 button.onpointerup=cancel;button.onpointercancel=cancel;button.onpointerleave=cancel;
 button.oncontextmenu=e=>{e.preventDefault();cancel();showManualChoice(name)};
 button.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();detail?openConversation(detail.id):showManualChoice(name)}};
 row.append(button);
 if(manual){const mapped=conversationIndex.filter(c=>c.name===name&&c.open_url);if(mapped.length===1)appendTinderActions(row,mapped[0].open_url,mapped[0].draft)}
 return row;
}
async function saveManualChoice(manual){
 const name=selectedManualContact;$('manual-dialog').close();selectedManualContact=null;
 if(working||!token||!name)return;
 working=true;render();
 try{
  const file=await api('/contents/operator/whatsapp-contacts.json?ref=main'),data=validateContacts(decode(file.content));
  if(!data.names.includes(name))throw Error('Kontakt sa zmenil. Obnov zoznam.');
  const names=new Set(data.manual_names||[]);const before=names.has(name);manual?names.add(name):names.delete(name);
  if(before!==manual){data.manual_names=data.names.filter(n=>names.has(n));await api('/contents/operator/whatsapp-contacts.json',{method:'PUT',body:JSON.stringify({branch:'main',sha:file.sha,message:'Set operator manual contact preference',content:encode(data)})})}
  applyContacts(data);message(manual?'Kontakt je v menu Manuálne.':'Kontakt sa vrátil do pôvodného zoznamu.');
 }catch(e){message(e.message||'Voľbu sa nepodarilo uložiť. Zopakuj synchronizáciu.')}
 finally{working=false;render()}
}
$('manual-yes').onclick=()=>saveManualChoice(true);
$('manual-no').onclick=()=>saveManualChoice(false);
$('manual-close').onclick=()=>{$('manual-dialog').close();selectedManualContact=null};
$('manual-dialog').oncancel=()=>{selectedManualContact=null};

const AUTOMATION_PATH='/contents/operator/tinder-automation.json';
const AUTOMATION_PENDING_KEY='iphone-lab-automation-pending-v1';
let automationState=null,automationSaving=false,automationPending=null;
try{automationPending=JSON.parse(localStorage.getItem(AUTOMATION_PENDING_KEY)||'null')}catch{}
function saveAutomationPending(value){automationPending=value;try{if(value)localStorage.setItem(AUTOMATION_PENDING_KEY,JSON.stringify(value));else localStorage.removeItem(AUTOMATION_PENDING_KEY)}catch{}}
function freshAutomation(s){return s&&typeof s.enabled==='boolean'&&/^[a-f0-9]{64}$/.test(s.revision)&&Number.isFinite(Date.parse(s.checked_at))&&Date.parse(s.checked_at)<=Date.now()+30000}
function showAutomation(s,error=''){
 automationState=freshAutomation(s)?s:null;
 const button=$('tinder-automation-toggle');
 button.setAttribute?.('aria-checked',String(automationState?.enabled===true));
 button.disabled=!token||!automationState||automationSaving||!!automationPending;
 button.textContent=automationState?(automationState.enabled?'Zapnuté':'Vypnuté'):'Stav neznámy';
 let notice=error;
 if(automationPending&&s?.receipt?.id===automationPending.id){
  notice=s.receipt.result==='applied'?'Zmena potvrdená MacBookom.':s.receipt.result==='expired'?'Požiadavka vypršala. Zopakuj zmenu.':'Stav sa medzitým zmenil. Skontroluj ho a zopakuj zmenu.';
  saveAutomationPending(null);button.disabled=!token||!automationState||automationSaving;
 }else if(automationPending&&automationState&&Date.parse(s.checked_at)>Date.parse(automationPending.expires_at)){
  saveAutomationPending(null);notice='Potvrdenie zmeny neprišlo včas. Skontroluj stav a zopakuj zmenu.';button.disabled=!token||automationSaving;
 }
 $('tinder-automation-status').textContent=automationPending?'Čakám na potvrdenie z MacBooku… Zobrazený prepínač je posledný potvrdený stav.':notice||(automationState?`Potvrdené na MacBooku: ${new Date(s.checked_at).toLocaleTimeString('sk-SK')}.`:'Aktuálny stav sa nepodarilo overiť. Skontroluj pripojenie MacBooku.');
}
$('tinder-automation-toggle').onclick=async()=>{
 if(!token||automationSaving||automationPending||!freshAutomation(automationState))return;
 const enabled=!automationState.enabled;
 if(!confirm(enabled?'Zapnúť automatické odpovedanie Tinder + Rafi podľa existujúcich pravidiel?':'Vypnúť nové automatické spracovanie a odosielanie Tinder + Rafi? Už odoslanú správu nemožno vrátiť.'))return;
 automationSaving=true;let failure='';showAutomation(automationState,'Odosielam požiadavku…');
 try{
  const file=await api(AUTOMATION_PATH+'?ref=main'),data=decode(file.content);
  if(data.schema_version!==1||!freshAutomation(data.status)||data.status.revision!==automationState?.revision)throw Error('Stav sa zmenil. Obnov panel a skús znova.');
  if(data.request&&data.request.id!==data.status.receipt?.id&&Date.parse(data.request.expires_at)>Date.now())throw Error('Predchádzajúca zmena ešte čaká na potvrdenie.');
  const request={id:crypto.randomUUID(),operator:'Tomy',enabled,expected_revision:data.status.revision,created_at:new Date().toISOString(),expires_at:new Date(Date.now()+120000).toISOString()};
  data.request=request;
  // Keep the ID even on an uncertain HTTP response; never blindly retry a write.
  saveAutomationPending({id:request.id,expires_at:request.expires_at});
  await api(AUTOMATION_PATH,{method:'PUT',body:JSON.stringify({branch:'main',sha:file.sha,message:'Request Tinder automation change',content:encode(data)})});
  showAutomation(automationState);
 }catch(e){failure=e.message||'Zmenu sa nepodarilo potvrdiť.'}
 finally{automationSaving=false;await loadProgress();showAutomation(automationState,failure)}
};
function loadProgress(){if(!progressLoading)progressLoading=readProgress().finally(()=>{progressLoading=null});return progressLoading}
async function readProgress(){
 try{
  const file=await api('/contents/operator/tinder-progress.json?ref=main');if(!token)return;const p=decode(file.content);
  if(p.schema_version!==1||p.scope!=='initial_round'||!['sent','total','blocked','ready','uncertain','stale'].every(k=>Number.isSafeInteger(p[k])&&p[k]>=0&&p[k]<=100000)||p.sent>p.total||!Number.isFinite(Date.parse(p.updated_at)))throw Error('Invalid progress');const chats=chatProjections(p);renderWaiting(chats.waiting,chats.waitingCount);renderActive(chats.active);
  showAutomation(p.automation);
  $('tinder-blocked').textContent=`Čaká na tvoje vyjadrenie: ${Number.isSafeInteger(p.awaiting_operator)?p.awaiting_operator:0} · Potrebuje overenie: ${Number.isSafeInteger(p.requires_verification)?p.requires_verification:0}. Tieto prípady sa automaticky nespracúvajú.`;
  if(Number.isSafeInteger(p.messages_sent_overall)&&p.messages_sent_overall>=0&&Number.isSafeInteger(p.messages_in_resolution)&&p.messages_in_resolution>=0){
   const tracked=Number.isSafeInteger(p.messages_tracked_for_chart)&&p.messages_tracked_for_chart>=p.messages_sent_overall?p.messages_tracked_for_chart:p.messages_sent_overall+p.messages_in_resolution;
   $('tinder-overall-count').textContent=`Odoslané celkovo: ${p.messages_sent_overall} · V riešení: ${p.messages_in_resolution}`;
   $('tinder-overall-meter').max=tracked||1;$('tinder-overall-meter').value=p.messages_sent_overall;
  }else $('tinder-overall-count').textContent='Celkový údaj zatiaľ nie je dostupný.';
  const finish=Date.parse(p.overall_eta_at),remaining=Math.max(0,Math.ceil((finish-Date.now())/60000));
  const duration=remaining>=60?`${Math.floor(remaining/60)} h ${remaining%60} min`:`${Math.max(1,remaining)} min`;
  $('tinder-overall-eta').textContent=p.overall_eta_state==='complete'?'Všetky evidované zhody dostali správu.':p.overall_eta_state==='paused'?'Celkový odhad: odosielanie je pozastavené.':p.overall_eta_state==='awaiting_operator'?'Celkový odhad: čaká na tvoje odpovede.':p.overall_eta_state==='attention'?'Celkový odhad: pokračovanie potrebuje kontrolu.':p.overall_eta_state==='estimated'&&Number.isFinite(finish)&&finish>Date.now()?`Pri aktuálnom tempe približne ${duration} · dokončenie ${new Date(finish).toLocaleString('sk-SK',{day:'numeric',month:'numeric',hour:'2-digit',minute:'2-digit'})}.${p.blocked?' Predpokladá vybavenie čakajúcich otázok.':''}`:p.overall_eta_state==='stalled'?'Celkový odhad: čaká na obnovenie tempa odosielania.':'Celkový odhad sa zobrazí po získaní aktuálneho tempa odosielania.';
  const batchOk=['current_batch_total','current_batch_sent','current_batch_resolved','current_batch_in_resolution'].every(k=>Number.isSafeInteger(p[k])&&p[k]>=0)&&p.current_batch_resolved<=p.current_batch_total;
  $('tinder-count').textContent=batchOk?`Aktuálna várka: ${p.current_batch_resolved} / ${p.current_batch_total} vybavených`:'Údaj o aktuálnej várke zatiaľ nie je dostupný.';
  $('tinder-meter').max=batchOk?(p.current_batch_total||1):1;$('tinder-meter').value=batchOk?p.current_batch_resolved:0;
  $('tinder-detail').textContent=batchOk?`Aktuálne v riešení: ${p.current_batch_in_resolution} · Z várky odoslané: ${p.current_batch_sent} · Posledná zmena: ${new Date(p.updated_at).toLocaleString('sk-SK')} · Načítané: ${new Date().toLocaleTimeString('sk-SK')}`:'Obnovenie aktuálnej várky zlyhalo.';
  $('tinder-eta').textContent=p.phase==='complete'?'Séria je dokončená.':p.phase==='paused'?'Odosielanie je pozastavené.':p.phase==='awaiting_operator'?'Odhad dokončenia: čaká na tvoje odpovede.':p.phase==='attention'?'Pokračovanie potrebuje kontrolu.':Number.isFinite(p.eta_seconds)&&p.eta_seconds>=0?`Odhad zostávajúceho času: približne ${Math.max(1,Math.ceil(p.eta_seconds/60))} min.`:'Odhad sa zobrazí po získaní aktuálneho tempa odosielania.';
 }catch{showAutomation(null);clearWaiting('Čakajúce chaty sa nepodarilo bezpečne overiť. Zopakuj synchronizáciu.');$('tinder-overall-count').textContent='Aktuálny počet nie je overený.';$('tinder-count').textContent='Aktuálny stav nie je overený.';$('tinder-overall-meter').value=0;$('tinder-meter').value=0;$('tinder-blocked').textContent='';$('tinder-overall-eta').textContent='Celkový odhad nie je dostupný — údaje sa neobnovili.';$('tinder-detail').textContent='Obnovenie priebehu zlyhalo alebo sú údaje staršie než 2 minúty.';$('tinder-eta').textContent='Skontroluj pripojenie MacBooku a zopakuj synchronizáciu.'}
}
export function validateRequestStatus(data){const chat_links=data?.chat_links===undefined?{}:data.chat_links,chat_actions=data?.chat_actions===undefined?{}:data.chat_actions;if(data?.schema_version!==1||!Array.isArray(data.inactive_ids)||data.inactive_ids.length>10000||!data.inactive_ids.every(id=>UUID.test(id))||!chat_links||typeof chat_links!=='object'||Array.isArray(chat_links)||Object.keys(chat_links).length>100||!chat_actions||typeof chat_actions!=='object'||Array.isArray(chat_actions)||Object.keys(chat_actions).length>100)throw Error('Stav aktívnych dotazov má neplatný formát.');const links=new Map(),actions=new Map();for(const [id,url] of Object.entries(chat_links)){if(!UUID.test(id))throw Error('Stav aktívnych dotazov má neplatný formát.');links.set(id,validateTinderChatUrl(url))}for(const [id,action] of Object.entries(chat_actions)){if(!UUID.test(id)||!action||typeof action!=='object'||Object.keys(action).some(k=>!['open_url','draft'].includes(k))||typeof action.draft!=='string'||!action.draft.trim()||action.draft.length>1500)throw Error('Stav aktívnych dotazov má neplatný formát.');const open_url=validateTinderChatUrl(action.open_url);if(links.get(id)!==open_url)throw Error('Stav aktívnych dotazov má neplatný formát.');actions.set(id,{open_url,draft:action.draft})}return {inactive:new Set(data.inactive_ids),links,actions}}
async function requestStatus(){const file=await api('/contents/operator/request-status.json?ref=main');return validateRequestStatus(decode(file.content))}
async function refresh(){
 const controller=new AbortController();refreshController=controller;
 const timer=setTimeout(()=>controller.abort(),REFRESH_TIMEOUT_MS);
 try{return await refreshContents()}catch(e){if(controller.signal.aborted)throw Error('Obnovenie trvalo príliš dlho. Skontroluj spojenie a zopakuj synchronizáciu.');throw e}
 finally{clearTimeout(timer);if(refreshController===controller)refreshController=null}
}
async function refreshContents(){try{await loadProgress();const status=await requestStatus(),inactive=status.inactive;const list=await api(`/contents/${PREFIX}?ref=main`);if(!Array.isArray(list)||list.length>=1000)throw Error('Fronta má neplatný formát alebo prekročila limit.');const files=list.filter(f=>f.type==='file'&&UUID.test(f.name.replace(/\.json$/,''))&&f.name.endsWith('.json')&&!inactive.has(f.name.slice(0,-5)));if(files.length>100)throw Error('Fronta prekročila 100 záznamov. Najprv archivuj vybavené požiadavky.');const next=[];for(const f of files){const id=f.name.slice(0,-5),open_url=status.links.get(id),action=status.actions.get(id);const previous=items.find(i=>i.record.request.id===id&&i.sha===f.sha);if(previous){next.push({...previous,...(open_url?{open_url}:{open_url:null}),...(action?{draft:action.draft}:{draft:null})});continue}const file=await api(`/contents/${PREFIX}/${id}.json?ref=main`),record=await validate(decode(file.content),id);next.push({sha:file.sha,record,...(open_url&&['tinder','rafi'].includes(record.request.source)?{open_url,draft:action?.draft??null}:{})})}lastRefresh=Date.now();items=next.sort((a,b)=>Date.parse(b.record.request.created_at)-Date.parse(a.record.request.created_at)||b.record.request.id.localeCompare(a.record.request.id));render();const pending=items.filter(i=>!i.record.decision&&Date.now()<Date.parse(i.record.request.expires_at)).length;message(`Čakajúce požiadavky: ${pending} · Spolu: ${items.length} · Načítané ${new Date().toLocaleTimeString('sk-SK')}.`);}catch(e){items=[];render();message('Aktívne dotazy sa nepodarilo bezpečne overiť. Skús synchronizáciu znova.');throw e}finally{if(token&&!refreshController?.signal.aborted){await loadInactiveChats();await loadWhatsAppNames();await loadConversationIndex();}}}
async function decide(item,outcome,comment='',permission=null,confirmed=false){if(working||!token)return;comment=comment.trim();if(outcome==='commented'&&(!comment||comment.length>3000)){message('Napíš vyjadrenie od 1 do 3000 znakov.');return}const prompt=item.record.request.kind==='work_file'&&outcome==='approved'?`${permission==='always'?'Povoliť trvalo pre tento presný súbor a túto operáciu, aj pre budúce zmeny':'Povoliť iba túto jednu presnú zmenu'}?\n\n${item.record.request.file_change.path}\nOperácia: ${item.record.request.file_change.operation}\n\n${item.record.request.proposed_action}`:outcome==='commented'?`Odoslať tvoje vyjadrenie?\n\n${item.record.request.title}\n\n${comment}`:`${outcome==='approved'?'Schváliť':'Zamietnuť'} túto presnú požiadavku?\n\n${item.record.request.title}\n\n${item.record.request.proposed_action}`;if(!confirmed&&!confirm(prompt))return;working=true;render();try{const id=item.record.request.id;const file=await api(`/contents/${PREFIX}/${id}.json?ref=main`),record=await validate(decode(file.content),id);if(file.sha!==item.sha||record.request_digest!==item.record.request_digest||record.decision!==null||Date.now()<Date.parse(record.request.created_at)||Date.now()>=Date.parse(record.request.expires_at))throw Error('Požiadavka sa zmenila, bola vybavená alebo vypršala. Obnov zoznam.');record.decision={outcome,operator:'Tomy',decided_at:new Date().toISOString(),request_digest:record.request_digest,...(outcome==='commented'?{comment}:{}),...(permission?{permission}:{})};const saved=await api(`/contents/${PREFIX}/${id}.json`,{method:'PUT',body:JSON.stringify({branch:'main',sha:file.sha,message:`Tomy ${outcome} ${id}`,content:encode(record)})});item.record=record;item.sha=saved.content?.sha||item.sha;drafts.delete(id);saveRequestDrafts();render();message(outcome==='commented'?'Vyjadrenie je uložené v bridge a pripravené pre zdrojovú aplikáciu.':'Rozhodnutie je uložené v bridge. Vykonanie akcie zostáva na zdrojovej aplikácii.');return true}catch(e){message(e.message||'Rozhodnutie sa nepodarilo uložiť. Obnov zoznam pred ďalším pokusom.')}finally{working=false;render()}}
async function revokePermission(item){
 if(working||!token)return;
 if(!confirm(`Odvolať trvalé povolenie pre tento súbor?\n\n${item.record.request.file_change.path}\n${item.record.request.file_change.operation}\nBudúce zmeny budú opäť potrebovať schválenie.`))return;
 working=true;render();
 try{
  const id=item.record.request.id,file=await api(`/contents/${PREFIX}/${id}.json?ref=main`),record=await validate(decode(file.content),id);
  if(file.sha!==item.sha||record.request_digest!==item.record.request_digest||record.decision?.permission!=='always'||record.decision.revoked_at)throw Error('Povolenie sa zmenilo. Obnov zoznam.');
  record.decision.revoked_at=new Date().toISOString();
  const saved=await api(`/contents/${PREFIX}/${id}.json`,{method:'PUT',body:JSON.stringify({branch:'main',sha:file.sha,message:`Revoke work-file permission ${id}`,content:encode(record)})});
  item.record=record;item.sha=saved.content?.sha||item.sha;message('Trvalé povolenie bolo odvolané.');
 }catch(e){message(e.message||'Odvolanie sa nepodarilo.')}
 finally{working=false;render()}
}
async function connectBridge(candidate){
 if(working||!candidate)return;
 working=true;token=candidate;$('connect-button').disabled=true;
 let verified=false;
 try{
  const repo=await api('',{authProbe:true});
  if(repo.private!==true||repo.full_name!==REPO){forgetPairing();throw Error('Bridge musí byť súkromný repozitár.')}
  verified=true;const remembered=rememberPairing();connected();
  await refresh();
  if(!remembered)message('Pripojené, ale zariadenie nedovolilo uložiť párovanie. Po zatvorení sa bude treba pripojiť znova.');
 }catch(e){
  if(!verified){token='';items=[];$('connect').hidden=false;$('disconnect').hidden=true;render()}
  message((!verified&&savedPairing()?'Párovanie je uložené. Spojenie teraz nie je dostupné; skús tlačidlo synchronizácie. ':'')+(e.message||'Pripojenie zlyhalo.'));
 }finally{working=false;$('connect-button').disabled=false;render()}
}
$('connect').onsubmit=async e=>{e.preventDefault();const candidate=$('bridge-token').value.trim();$('bridge-token').value='';await connectBridge(candidate)};
$('refresh').onclick=async()=>{
 if(working)return;
 if(!token){if(savedPairing()){await restorePairing();return}message('Najprv pripoj súkromný bridge.');return}
 const button=$('refresh');button.disabled=true;let submitted=false;
 try{
  // Only explicit synchronization sends unsent text, using the same per-request confirmation and SHA validation.
  const pendingDrafts=[...items].filter(item=>(drafts.get(item.record.request.id)||'').trim()&&item.record.decision===null);
  if(pendingDrafts.length&&!confirm(`Odoslať všetky vyplnené vyjadrenia (${pendingDrafts.length}) a potom načítať nový stav?`))return;
  if(pendingDrafts.length)message(`Odosielam vyjadrenia: 0 / ${pendingDrafts.length}…`);
  let sentDrafts=0;
  for(const item of pendingDrafts){
   const sent=await decide(item,'commented',drafts.get(item.record.request.id)||'',null,true);if(!sent)return;submitted=true;
   sentDrafts++;message(`Odosielam vyjadrenia: ${sentDrafts} / ${pendingDrafts.length}…`);
  }
  working=true;render();message('Načítavam požiadavky…');await refresh();
 }catch(e){message(e.message||'Synchronizácia sa nepodarila.')}
 finally{working=false;button.disabled=false;render()}
};
$('disconnect').onclick=()=>{showAutomation(null);forgetPairing();resetConversations(true);token='';items=[];inactiveChats=[];inactiveStatus='Pripoj bridge na načítanie neaktívnych chatov.';whatsappNames=[];whatsappUnassigned=[];whatsappManual=[];whatsappListStatus='Pripoj bridge na načítanie kontaktov.';lastRefresh=0;render();$('connect').hidden=false;$('disconnect').hidden=true;$('tinder-overall-count').textContent='Pripoj bridge na načítanie priebehu.';$('tinder-overall-meter').value=0;$('tinder-overall-eta').textContent='Pripoj bridge na načítanie odhadu.';$('tinder-count').textContent='Pripoj bridge na načítanie priebehu.';$('tinder-meter').value=0;$('tinder-detail').textContent='';$('tinder-eta').textContent='Odhad dokončenia zatiaľ nie je dostupný.';message('Párovanie je odstránené z tohto zariadenia.')};
window.addEventListener('pagehide',()=>{refreshController?.abort();rememberConversationWork();saveRequestDrafts();$('bridge-token').value=''});

function restorePairing(){if(!token&&!working){const saved=savedPairing();if(saved){message('Obnovujem uložené pripojenie…');return connectBridge(saved)}}}
window.addEventListener('pageshow',restorePairing);
window.addEventListener('online',()=>{if(!token&&document.visibilityState!=='hidden')restorePairing()});
showAutomation(null);render();restorePairing();

// Keep all read-only private projections current while the app is visible.
// User drafts and decisions remain manual and are never submitted by this timer.
async function pollBridge(){
 if(editingPanel()||working||document.visibilityState==='hidden'||navigator.onLine===false||Date.now()<readPause())return;
 if(!token)return restorePairing();
 working=true;render();
 try{await refresh()}catch(e){message(e.message||'Synchronizácia sa nepodarila.')}
 finally{working=false;render()}
}
setInterval(pollBridge,60000);setInterval(refreshWaitingDurations,30000);
document.addEventListener('visibilitychange',async()=>{
 if(document.visibilityState==='hidden'||working||editingPanel())return;
 if(!token){await restorePairing();return}
 working=true;render();
 try{await refresh()}catch(e){message(e.message||'Požiadavky sa nepodarilo obnoviť.')}
 finally{working=false;render()}
});

// Original report is fetched only from the paired private repository. It runs
// in an opaque sandbox with no network, storage, navigation or token access.
const PAGE_FILES=['index.html','chart.umd.js','people.csv','events.csv','pull-requests.csv','jira.csv','estimates.json'];
let pageGeneration=0,pageFrame=null,pageURL=null,pageDownloadURL=null,pageManifest=null,pageNonce='';
async function byteHash(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('')}
async function pagePointer(m){
 if(m?.schema_version!==1||!SHA256.test(m.report_sha256)||!/^\d{4}-\d{2}-\d{2}$/.test(m.start)||!/^\d{4}-\d{2}-\d{2}$/.test(m.end)||m.start>m.end||!Number.isFinite(Date.parse(m.fetched_at))||!m.files||Object.keys(m.files).length!==PAGE_FILES.length)throw Error('Neplatný manifest stránky.');
 let total=0,chunks=0;const hashes={};
 for(const name of PAGE_FILES){const f=m.files[name];if(!f||!SHA256.test(f.sha256)||!Number.isSafeInteger(f.bytes)||f.bytes<=0||f.bytes>10000000||!Array.isArray(f.chunks)||!f.chunks.length||f.chunks.length>40)throw Error('Neplatný súbor stránky.');let size=0;for(const c of f.chunks){if(!Number.isSafeInteger(c.bytes)||c.bytes<1||c.bytes>500000||!SHA256.test(c.sha256))throw Error('Neplatná časť stránky.');size+=c.bytes;chunks++}if(size!==f.bytes)throw Error('Neplatná veľkosť stránky.');total+=size;hashes[name]=f.sha256}
 if(total>20000000||chunks>80||await hash(hashes)!==m.report_sha256)throw Error('Kontrola manifestu stránky zlyhala.');return m;
}
async function readPageAsset(m,name){
 if(!PAGE_FILES.includes(name))throw Error('Nepovolený export.');const f=m.files[name],out=new Uint8Array(f.bytes);let offset=0;
 for(let i=0;i<f.chunks.length;i++){const c=f.chunks[i],v=await api(`/contents/operator/statistics-page/reports/${m.report_sha256}/${name}.${i}.bin?ref=main`);if(typeof v.content!=='string'||v.content.length>700000||v.size!==undefined&&v.size!==c.bytes)throw Error('Nesprávna veľkosť časti stránky.');const bytes=Uint8Array.from(atob(v.content.replace(/\s/g,'')),x=>x.charCodeAt(0));if(bytes.length!==c.bytes||await byteHash(bytes)!==c.sha256)throw Error('Kontrola integrity stránky zlyhala.');out.set(bytes,offset);offset+=bytes.length}
 if(await byteHash(out)!==f.sha256)throw Error('Kontrola súboru stránky zlyhala.');return out;
}
function resetOriginalStatistics(){
 pageGeneration++;pageFrame=null;pageManifest=null;pageNonce='';
 $('statistics-page-frame').replaceChildren();$('statistics-page-dialog').close?.();
 if(pageURL)URL.revokeObjectURL(pageURL);if(pageDownloadURL)URL.revokeObjectURL(pageDownloadURL);pageURL=pageDownloadURL=null;
 $('statistics-page-download').hidden=true;$('statistics-open').disabled=false;
}
function isolatedReport(html,chart,nonce){
 const doc=new DOMParser().parseFromString(html,'text/html');let libraries=0;
 for(const script of doc.querySelectorAll('script:not([src])'))if(/const report\s*=/.test(script.textContent))script.textContent=enhanceOriginalScript(script.textContent,nonce);
 for(const n of doc.querySelectorAll('base,iframe,object,embed,form,meta[http-equiv]'))n.remove();
 for(const n of doc.querySelectorAll('*'))for(const a of [...n.attributes])if(/^on/i.test(a.name)||['srcset','action','formaction'].includes(a.name))n.removeAttribute(a.name);
 for(const n of doc.querySelectorAll('[src]')){if(n.tagName==='SCRIPT'&&/^([.]\/)?chart[.]umd[.]js$/.test(n.getAttribute('src'))){n.removeAttribute('src');n.textContent=chart.replace(/<\/script/gi,'<\\/script');libraries++}else n.remove()}
 if(libraries!==1)throw Error('Report neobsahuje očakávanú knižnicu grafov.');
 for(const a of doc.querySelectorAll('[href]')){const name=a.getAttribute('href').replace(/^\.\//,'');a.removeAttribute('href');if(PAGE_FILES.slice(2).includes(name)){a.setAttribute('href','#');a.setAttribute('data-private-export',name)}}
 for(const style of doc.querySelectorAll('style'))style.textContent=style.textContent.replace(/@media\s*\(max-width:\s*700px\)/g,'@media(max-width:0px)');
 const periodStyle=doc.createElement('style');periodStyle.textContent='.end-label b{font-size:14px}.end-label{gap:8px}#report-period{display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding:18px 0;font:15px system-ui}#report-period label{display:flex;align-items:center;gap:8px}#report-period input,#report-period button{font:inherit;padding:8px}#report-period-status{width:100%;font-size:13px;color:#53665e}';doc.head.append(periodStyle);
 const csp=doc.createElement('meta');csp.httpEquiv='Content-Security-Policy';csp.content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'; worker-src 'none'; frame-src 'none'; child-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'";doc.head.prepend(csp);
 const bridge=doc.createElement('script');bridge.textContent=`document.addEventListener('click',e=>{const a=e.target.closest('a');if(!a)return;e.preventDefault();e.stopImmediatePropagation();const name=a.getAttribute('data-private-export');if(name)parent.postMessage({type:'PRIVATE_REPORT_EXPORT',request_id:${JSON.stringify(nonce)},name},'*')},true);`;doc.head.append(bridge);
 return '<!doctype html>'+doc.documentElement.outerHTML;
}
async function openOriginalStatistics(){
 if(!token){$('statistics-page-status').textContent='Najprv pripoj bridge.';return}
 resetOriginalStatistics();const generation=pageGeneration;$('statistics-open').disabled=true;$('statistics-page-status').textContent='Načítavam a overujem pôvodnú stránku…';
 try{const m=await pagePointer(decode((await api('/contents/operator/statistics-page/index.json?ref=main')).content));const html=await readPageAsset(m,'index.html'),chart=await readPageAsset(m,'chart.umd.js');if(generation!==pageGeneration||!token)return;
 const nonce=crypto.randomUUID(),safe=isolatedReport(new TextDecoder('utf-8',{fatal:true}).decode(html),new TextDecoder('utf-8',{fatal:true}).decode(chart),nonce);const frame=document.createElement('iframe');frame.setAttribute('sandbox','allow-scripts');frame.referrerPolicy='no-referrer';frame.title='Pôvodná štatistika';frame.setAttribute('allow',"camera 'none'; microphone 'none'; geolocation 'none'");frame.srcdoc=safe;pageFrame=frame;pageNonce=nonce;pageManifest=m;$('statistics-page-frame').replaceChildren(frame);fitOriginalReport();$('statistics-page-info').textContent=`Obdobie ${m.start} – ${m.end}`;$('statistics-page-dialog').showModal();fitOriginalReport();$('statistics-page-status').textContent='Pôvodná stránka otvorená. Ide o posledný prenesený report.';
 }catch(e){if(generation===pageGeneration)$('statistics-page-status').textContent=e.status===404?'Report sa ešte prenáša. Skús otvoriť znova.':e.message}
 finally{if(generation===pageGeneration)$('statistics-open').disabled=false}
}
$('statistics-open').onclick=openOriginalStatistics;
$('statistics-page-close').onclick=resetOriginalStatistics;
$('statistics-page-dialog').addEventListener?.('cancel',e=>{e.preventDefault();resetOriginalStatistics()});
window.addEventListener('message',async e=>{
 const v=e.data;if(!pageFrame||e.source!==pageFrame.contentWindow||v?.type!=='PRIVATE_REPORT_EXPORT'||v.request_id!==pageNonce||!PAGE_FILES.slice(2).includes(v.name)||!token)return;
 const generation=pageGeneration;$('statistics-page-info').textContent='Pripravujem export…';
 try{const bytes=await readPageAsset(pageManifest,v.name);if(generation!==pageGeneration||!token)return;if(pageDownloadURL)URL.revokeObjectURL(pageDownloadURL);pageDownloadURL=URL.createObjectURL(new Blob([bytes],{type:v.name.endsWith('.json')?'application/json':'text/csv;charset=utf-8'}));const a=$('statistics-page-download');a.href=pageDownloadURL;a.download=v.name;a.textContent='Stiahnuť '+v.name;a.hidden=false;$('statistics-page-info').textContent='Export je pripravený v hornej lište.'}catch(err){if(generation===pageGeneration)$('statistics-page-info').textContent=err.message}
});

function fitOriginalReport(){
 if(!pageFrame)return;
 pageFrame.style.width='100%';pageFrame.style.height='100%';pageFrame.style.transform='none';
}
// Date arithmetic is independent of rendering and never modifies the saved snapshot.
function filterReportPeriod(full,start,end){
 const valid=v=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
 if(!valid(start)||!valid(end)||start>end||start<full.start||end>full.end)throw Error('Vyber platné obdobie v dostupných dátach. Dátum Od musí byť najneskôr Do.');
 const inside=v=>typeof v==='string'&&v>=start&&v<=end;
 const people=full.people.map(p=>{const prs=p.prs.filter(x=>inside(x.date)),jira=p.jira.filter(x=>inside(x.created));if(jira.some(x=>typeof x.key!=='string'||!x.key))throw Error('Report ešte nemá údaje pre dátumový filter. Skús ho otvoriť znova po synchronizácii.');return {...p,events:p.events.filter(x=>inside(x.date)),prs,jira,counts:{...p.counts,prs:prs.length,merged:prs.filter(x=>x.state==='merged').length,open:prs.filter(x=>x.state==='open').length,jira:jira.length}}});
 return {...full,start,end,days:full.days.filter(inside),people,counts:{...full.counts,people:people.length,humanPRs:people.reduce((n,p)=>n+p.prs.length,0),uniqueJira:new Set(people.flatMap(p=>p.jira.map(x=>x.key))).size}};
}
function originalPeriodRuntime(){
 const full={...report,people:report.people,days:report.days,counts:report.counts};
 const form=document.createElement('form');form.id='report-period';form.innerHTML='<label>Od <input id="report-from" type="date" required></label><label>Do <input id="report-to" type="date" required></label><button type="button" id="report-apply">Zobraziť obdobie</button><button type="button" id="report-all">Celé obdobie</button><span id="report-period-status" role="status"></span>';
 document.querySelector('header').after(form);
 for(const warning of document.querySelectorAll('p.warning'))if(warning.textContent.includes('Pocet PR je kumulovany'))warning.textContent='PR sa počítajú podľa vytvorenia, Jira podľa vytvorenia tiketu, MD podľa odovzdania alebo uzavretia. Započítané sú iba dátumy Od–Do vrátane, bez staršieho počiatočného stavu. Merged a Open sú stavy pri exporte. Jira bez PR / Iba merged PR upravujú odhady MD, nie inventárne počty. Exporty zostávajú za celé pôvodné obdobie.';
 const from=document.getElementById('report-from'),to=document.getElementById('report-to'),status=document.getElementById('report-period-status');
 for(const input of [from,to]){input.min=full.start;input.max=full.end}from.value=full.start;to.value=full.end;
 function apply(){
  try{const next=filterReportPeriod(full,from.value,to.value);Object.assign(report,next);chart.options.scales.x.min=timestamp(next.start);chart.options.scales.x.max=timestamp(next.end)+(next.start===next.end?86400000:0);chart.options.scales.x.title.text='Dátum ('+next.start+' – '+next.end+')';
   const stats=document.querySelectorAll('.stats strong'),labels=document.querySelectorAll('.stats span');stats[0].textContent=next.people.length;stats[1].textContent=next.counts.humanPRs;stats[2].textContent=next.counts.uniqueJira;labels[2].textContent='jedinečné Jira vytvorené vo vybranom období';
   const time=document.querySelector('header time');if(time)time.textContent=next.start+' — '+next.end;
   const coverage=[...document.querySelectorAll('.notes p')].find(p=>p.textContent.startsWith('Pokrytie:'));if(coverage){const text=coverage.textContent,at=text.indexOf(' v rovnakych');if(at>=0)coverage.textContent='Pokrytie: ľudské PR vytvorené od '+next.start+' do '+next.end+text.slice(at)}
   const intro=document.querySelector('header p');if(intro)intro.textContent='Kumulatívne MD za vybrané obdobie / rovnaký model pre každého / 1 MD = 8 h';
   update();status.textContent='Zobrazené '+next.start+' – '+next.end+'. Exporty obsahujú pôvodný úplný report.';
   document.body.dataset.periodStart=next.start;document.body.dataset.periodEnd=next.end;
  }catch(e){status.textContent=e.message}
 }
 document.getElementById('report-apply').onclick=apply;form.addEventListener('submit',e=>e.preventDefault());form.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();apply()}});document.getElementById('report-all').onclick=()=>{from.value=full.start;to.value=full.end;apply()};
 // Release GPU backing storage when leaving the private report.
 window.addEventListener('pagehide',()=>chart.destroy(),{once:true});
 apply();
}
function enhanceOriginalScript(source,nonce){
 if(!source.includes('const chart=new Chart(')||!source.includes('function update(){'))throw Error('Neznámy formát štatistiky.');
 const legendStart=source.indexOf('function positionEndLegend(instance) {'),legendEnd=source.indexOf('\nconst chart=new Chart(',legendStart);
 if(legendStart<0||legendEnd<0)throw Error('Neznámy formát legendy.');
 source=source.slice(0,legendStart)+readableEndLegend.toString().replace('function readableEndLegend','function positionEndLegend')+'\n'+source.slice(legendEnd);
 source=source.replace('const chart=new Chart(',"const reportViewport=("+reportViewportRuntime.toString()+")("+JSON.stringify(nonce)+");Chart.defaults.devicePixelRatio=1;const canvas=document.getElementById('chart');canvas.width=1256;canvas.height=650;\nconst chart=new Chart(");
 source=source.replace('responsive:true,maintainAspectRatio:false','responsive:false,maintainAspectRatio:false');
 source=source.replace('options:{layout:{padding:{right:300}}',"options:{devicePixelRatio:1,resizeDelay:150,layout:{padding:{right:420}}");
 source=source.replace('data:smoothSeries(data,smoothDays),borderColor:',"data:[{x:timestamp(report.start),y:0},...smoothSeries(data,smoothDays).map(point=>report.days.length===1?{x:point.x+86399999,y:point.y}:point)],borderColor:");
 return source+'\n'+filterReportPeriod.toString()+'\n('+originalPeriodRuntime.toString()+')();';
}

function reportViewportRuntime(nonce){
 const body=document.body,scroll=document.createElement('div'),space=document.createElement('div'),content=document.createElement('div');
 scroll.id='report-scroll';scroll.tabIndex=0;scroll.setAttribute('aria-label','Posúvanie celého reportu');space.id='report-space';content.id='report-content';
 while(body.firstChild)content.append(body.firstChild);
 space.append(content);scroll.append(space);body.append(scroll);
 Object.assign(document.documentElement.style,{height:'100%',overflow:'hidden'});Object.assign(body.style,{margin:'0',width:'100%',height:'100%',overflow:'hidden'});
 Object.assign(scroll.style,{position:'fixed',inset:'0',overflow:'auto',overscrollBehavior:'contain',touchAction:'pan-x pan-y',WebkitOverflowScrolling:'touch'});
 Object.assign(space.style,{position:'relative',overflow:'hidden'});Object.assign(content.style,{position:'absolute',left:'0',top:'0',width:'1320px',transformOrigin:'top left'});
 let scale=1,fit=true,pinch=null;
 function fittedScale(){return Math.min(1,scroll.clientWidth/1320,scroll.clientHeight/Math.max(1,content.scrollHeight))}
 space.style.marginInline='auto';
 function size(){space.style.width=(1320*scale)+'px';space.style.height=(content.scrollHeight*scale)+'px';content.style.transform='scale('+scale+')'}
 function zoom(value,x=scroll.clientWidth/2,y=scroll.clientHeight/2){const old=scale,ax=(scroll.scrollLeft+x)/old,ay=(scroll.scrollTop+y)/old;scale=Math.max(fittedScale(),Math.min(2,value));size();scroll.scrollLeft=ax*scale-x;scroll.scrollTop=ay*scale-y;scroll.dataset.scale=String(scale)}
 function fitAll(){fit=true;scale=fittedScale();size();scroll.scrollLeft=0;scroll.scrollTop=0;scroll.dataset.scale=String(scale)}
 fitAll();new ResizeObserver(()=>{if(fit)fitAll();else size()}).observe(content);
 window.addEventListener('resize',()=>{if(fit)fitAll();else size()});
 window.addEventListener('message',e=>{const v=e.data;if(e.source!==parent||v?.type!=='PRIVATE_REPORT_ZOOM'||v.request_id!==nonce)return;if(v.action==='fit')fitAll();else if(['in','out'].includes(v.action)){fit=false;zoom(scale*(v.action==='in'?1.4:1/1.4))}});
 const midpoint=touches=>({x:(touches[0].clientX+touches[1].clientX)/2,y:(touches[0].clientY+touches[1].clientY)/2,d:Math.hypot(touches[0].clientX-touches[1].clientX,touches[0].clientY-touches[1].clientY)});
 scroll.addEventListener('touchstart',e=>{if(e.touches.length===2){const m=midpoint(e.touches);pinch={...m,scale,ax:(scroll.scrollLeft+m.x)/scale,ay:(scroll.scrollTop+m.y)/scale};e.preventDefault()}},{passive:false});
 scroll.addEventListener('touchmove',e=>{if(pinch&&e.touches.length===2){e.preventDefault();fit=false;const m=midpoint(e.touches);scale=Math.max(fittedScale(),Math.min(2,pinch.scale*m.d/Math.max(1,pinch.d)));size();scroll.scrollLeft=pinch.ax*scale-m.x;scroll.scrollTop=pinch.ay*scale-m.y;scroll.dataset.scale=String(scale)}},{passive:false});
 const end=()=>{pinch=null};scroll.addEventListener('touchend',end);scroll.addEventListener('touchcancel',end);
 return {fitAll};
}
for(const [id,action] of [['statistics-zoom-in','in'],['statistics-zoom-out','out'],['statistics-zoom-fit','fit']])$(id).onclick=()=>{if(pageFrame)pageFrame.contentWindow.postMessage({type:'PRIVATE_REPORT_ZOOM',request_id:pageNonce,action},'*')};

function readableEndLegend(instance){
 if(!endLegendRows.length||!instance.chartArea)return;
 const area=instance.chartArea,top=area.top+17,bottom=area.bottom-17,legend=document.getElementById('end-legend'),svg=document.getElementById('end-connectors');
 const datasets=new Map(instance.data.datasets.map(d=>[d.login,d]));
 const items=endLegendRows.map((row,order)=>{const d=datasets.get(row.login),last=d&&d.data.at(-1);return {row,order,anchorY:last?instance.scales.y.getPixelForValue(last.y):top+(bottom-top)*order/Math.max(1,endLegendRows.length-1),anchorX:last?instance.scales.x.getPixelForValue(last.x):area.right,hasLine:!!last}});
 const labelX=legend.offsetLeft,gap=labelX-area.right,paths=[];svg.setAttribute('viewBox','0 0 '+instance.width+' '+instance.height);
 for(const item of layoutEndLabels(items,top,bottom,32)){
  const row=item.row,visible=visibility.get(row.login);row.label.style.top=(item.labelY-16)+'px';row.label.classList.toggle('is-hidden',!visible);row.input.checked=visible;
  if(!visible||!item.hasLine)continue;
  const color=row.color,id='arrow-'+row.login,y=Math.max(area.top,Math.min(area.bottom,item.anchorY));
  const path='M'+(labelX-8)+' '+item.labelY+' C'+(labelX-gap*.42)+' '+item.labelY+' '+(area.right+gap*.38)+' '+y+' '+(area.right+12)+' '+y+' L'+item.anchorX+' '+y;
  paths.push('<defs><marker id="'+id+'" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="11" markerHeight="11" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0L10 5L0 10Z" fill="'+color+'"/></marker></defs><path d="'+path+'" style="fill:none;stroke:white;stroke-width:6;stroke-linecap:round"/><path class="end-connector" data-login="'+escape(row.login)+'" d="'+path+'" style="stroke:'+color+';stroke-width:2.6" marker-end="url(#'+id+')"/><circle cx="'+item.anchorX+'" cy="'+y+'" r="3" fill="'+color+'"/>');
 }
 svg.innerHTML=paths.join('');
}
