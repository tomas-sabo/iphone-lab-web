const REPO='tomas-sabo/bridge',PREFIX='operator/requests';
const SOURCES=[['architekt','Architekt'],['tinder','Tinder'],['rafi','Rafi'],['robota','Robota'],['whatsapp','WhatsApp'],['instagram','Instagram']];
const API=`https://api.github.com/repos/${REPO}`;
const $=id=>document.getElementById(id);
let token='',items=[],working=false;
let whatsappNames=[],whatsappUnassigned=[],whatsappListStatus='Pripoj bridge na načítanie kontaktov.';
const drafts=new Map(),groupOpen=new Map();
let lastApiCall=0,lastRefresh=0;
const RATE_KEY='iphone-lab-github-pause-until';
function readPause(){try{return Number(localStorage.getItem(RATE_KEY))||0}catch{return 0}}
function pauseUntil(t){try{localStorage.setItem(RATE_KEY,String(t))}catch{}}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const PAIRING_KEY='iphone-lab-bridge-pairing-v1';
function forgetPairing(){try{localStorage.removeItem(PAIRING_KEY)}catch{}}
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
 const pause=readPause();if(Date.now()<pause)throw Error(`GitHub má dočasný limit. Ďalší pokus po ${new Date(pause).toLocaleTimeString('sk-SK')}. Párovanie zostáva uložené.`);
 const mutation=options.method&&options.method!=='GET';
 const delay=lastApiCall+(mutation?1000:250)-Date.now();if(delay>0)await wait(delay);lastApiCall=Date.now();
 const response=await fetch(API+path,{...options,redirect:'error',cache:'no-store',headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(options.body?{'Content-Type':'application/json'}:{})},signal:AbortSignal.timeout(20000)});
 const remaining=response.headers?.get('X-RateLimit-Remaining'),reset=Number(response.headers?.get('X-RateLimit-Reset')||0)*1000,retry=Number(response.headers?.get('Retry-After')||0)*1000;
 if(remaining!==null&&remaining!==undefined&&Number(remaining)<20)pauseUntil(Math.max(Date.now()+60000,reset+5000));
 if(!response.ok){
  if(response.status===401){forgetPairing();token='';$('connect').hidden=false;$('disconnect').hidden=true;items=[];whatsappNames=[];whatsappUnassigned=[];whatsappListStatus='Pripoj bridge na načítanie kontaktov.';render();throw Error('Prístup bol odmietnutý. Pripoj bridge platným tokenom.')}
  if([403,429].includes(response.status)){
   const until=Math.max(Date.now()+Math.max(retry,60000),remaining==='0'?reset+5000:0);pauseUntil(until);
   throw Error(`GitHub dočasne odmietol požiadavku. Ďalší pokus po ${new Date(until).toLocaleTimeString('sk-SK')}. Párovanie zostáva uložené.`);
  }
  if([409,422].includes(response.status))throw Error('Požiadavka sa zmenila alebo už bola vybavená. Obnov zoznam.');
  const error=Error(`Bridge nie je dostupný (HTTP ${response.status}).`);error.status=response.status;throw error;
 }
 return response.json();
}
function message(text){$('bridge-status').textContent=text}
function element(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e}
function syncBadge(){const count=[...drafts.values()].filter(v=>v.trim()).length;$('sync-count').textContent=String(count);$('sync-count').hidden=!count}
function render(){
 syncBadge();$('requests').replaceChildren();
 for(const [source,name] of SOURCES){
  const group=element('details',undefined,'request-group');
  const matches=items.filter(item=>item.record.request.source===source);
  const pending=matches.filter(item=>!item.record.decision&&Date.now()<Date.parse(item.record.request.expires_at)).length;
  group.open=groupOpen.has(source)?groupOpen.get(source):pending>0||(source==='whatsapp'&&whatsappNames.length>0);
  const heading=element('summary',name,'group-heading');
  heading.onclick=()=>groupOpen.set(source,!group.open);
  heading.append(element('span',`${pending}/${matches.length}${source==='whatsapp'&&whatsappNames.length?' · '+whatsappNames.length+' kontaktov':''}`,'group-count'));
  group.append(heading);
  if(source==='whatsapp'){
   group.append(element('h3','Priradené kontakty','contact-heading'));
   const list=element('ul',undefined,'contact-list');
   for(const name of whatsappNames.filter(name=>!whatsappUnassigned.includes(name)))list.append(element('li',name));
   group.append(list);
   const unassigned=element('details',undefined,'unassigned-contacts');
   unassigned.open=groupOpen.get('whatsapp-unassigned')||false;
   const toggle=element('summary',`Nepriradení (${whatsappUnassigned.length})`);
   toggle.onclick=()=>groupOpen.set('whatsapp-unassigned',!unassigned.open);
   const pendingList=element('ul',undefined,'contact-list');
   for(const name of whatsappUnassigned)pendingList.append(element('li',name));
   unassigned.append(toggle,pendingList);
   if(!whatsappUnassigned.length)unassigned.append(element('p','Žiadne nepriradené kontakty.','group-empty'));
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
   card.append(element('p',r.body,'context'),element('h4','Čo schvaľuješ'),element('p',r.proposed_action,'action'),element('small',`Referencia: ${r.context_ref} · Platí do ${new Date(r.expires_at).toLocaleString('sk-SK')}`));
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
    const input=element('textarea');input.id=label.htmlFor;input.rows=3;input.maxLength=3000;input.placeholder='Napíš odpoveď alebo doplnenie…';input.value=drafts.get(r.id)||'';input.disabled=working;input.oninput=()=>{drafts.set(r.id,input.value);syncBadge()};
    const send=element('button','Odoslať vyjadrenie','secondary');send.type='button';send.disabled=working;send.onclick=()=>decide(item,'commented',input.value);
    const box=element('div',undefined,'comment-box');box.append(label,input,send,element('small','Vyjadrenie odošle odpoveď zdroju. Neznamená schválenie akcie.'));card.append(box);
   }
   group.append(card);
  }
 }
}
let progressLoading=null;
async function loadWhatsAppNames(){
 try{
  const file=await api('/contents/operator/whatsapp-contacts.json?ref=main'),data=decode(file.content);
  if(data.schema_version!==1||!Array.isArray(data.names)||data.names.length>2000||!data.names.every(name=>typeof name==='string'&&name.length<=160&&name.trim().length>0&&!/[\u0000-\u001f]/.test(name))||new Set(data.names).size!==data.names.length)throw Error('Invalid contact list');
  const assigned=data.paired_names,unassigned=data.unpaired_names;
  if(assigned!==undefined||unassigned!==undefined){
   if(!Array.isArray(assigned)||!Array.isArray(unassigned))throw Error('Invalid contact groups');
   const combined=[...assigned,...unassigned];
   if(combined.length!==data.names.length||new Set(combined).size!==combined.length||!combined.every(name=>data.names.includes(name)))throw Error('Invalid contact groups');
  }
  whatsappUnassigned=unassigned===undefined?[...data.names]:unassigned;
  whatsappNames=data.names;whatsappListStatus='Uložené WhatsApp kontakty.';
 }catch(e){whatsappListStatus=e.status===404?'Zoznam kontaktov zatiaľ nie je pripravený.':'Kontakty sa neobnovili; zobrazený zoznam môže byť starší.'}
 render();
}
function loadProgress(){if(!progressLoading)progressLoading=readProgress().finally(()=>{progressLoading=null});return progressLoading}
async function readProgress(){
 try{
  const file=await api('/contents/operator/tinder-progress.json?ref=main');const p=decode(file.content);
  if(p.schema_version!==1||p.scope!=='initial_round'||!['sent','total','blocked','ready','uncertain','stale'].every(k=>Number.isSafeInteger(p[k])&&p[k]>=0&&p[k]<=100000)||p.sent>p.total||!Number.isFinite(Date.parse(p.updated_at)))throw Error('Invalid progress');
  if(Number.isSafeInteger(p.overall_total)&&Number.isSafeInteger(p.overall_sent)&&p.overall_sent>=0&&p.overall_sent<=p.overall_total&&p.overall_total<=100000){
   $('tinder-overall-count').textContent=`Tinder odoslal ${Number.isSafeInteger(p.messages_sent_overall)&&p.messages_sent_overall>=p.overall_sent?p.messages_sent_overall:p.overall_sent} správ · ${p.overall_sent} / ${p.overall_total} zhôd`;
   $('tinder-overall-meter').max=p.overall_total||1;$('tinder-overall-meter').value=p.overall_sent;
  }else $('tinder-overall-count').textContent='Celkový údaj zatiaľ nie je dostupný.';
  const finish=Date.parse(p.overall_eta_at),remaining=Math.max(0,Math.ceil((finish-Date.now())/60000));
  const duration=remaining>=60?`${Math.floor(remaining/60)} h ${remaining%60} min`:`${Math.max(1,remaining)} min`;
  $('tinder-overall-eta').textContent=p.overall_eta_state==='complete'?'Všetky evidované zhody dostali správu.':p.overall_eta_state==='paused'?'Celkový odhad: odosielanie je pozastavené.':p.overall_eta_state==='awaiting_operator'?'Celkový odhad: čaká na tvoje odpovede.':p.overall_eta_state==='attention'?'Celkový odhad: pokračovanie potrebuje kontrolu.':p.overall_eta_state==='estimated'&&Number.isFinite(finish)&&finish>Date.now()?`Pri aktuálnom tempe približne ${duration} · dokončenie ${new Date(finish).toLocaleString('sk-SK',{day:'numeric',month:'numeric',hour:'2-digit',minute:'2-digit'})}.${p.blocked?' Predpokladá vybavenie čakajúcich otázok.':''}`:p.overall_eta_state==='stalled'?'Celkový odhad: čaká na obnovenie tempa odosielania.':'Celkový odhad sa zobrazí po získaní aktuálneho tempa odosielania.';
  const prepared=Number.isSafeInteger(p.rafi_prepared)&&p.rafi_prepared>=0&&p.rafi_prepared<=p.total?p.rafi_prepared:null;
  $('tinder-count').textContent=prepared===null?'Údaj o pripravených odpovediach zatiaľ nie je dostupný.':`Rafi pripravil ${prepared} / ${p.total} odpovedí`;
  $('tinder-meter').max=p.total||1;$('tinder-meter').value=prepared||0;
  $('tinder-detail').textContent=`Tinder odoslal v sérii: ${p.sent} · Čaká na tvoje vyjadrenie: ${p.blocked} · Posledná zmena: ${new Date(p.updated_at).toLocaleString('sk-SK')} · Načítané: ${new Date().toLocaleTimeString('sk-SK')}`;
  $('tinder-eta').textContent=p.phase==='complete'?'Séria je dokončená.':p.phase==='paused'?'Odosielanie je pozastavené.':p.phase==='awaiting_operator'?'Odhad dokončenia: čaká na tvoje odpovede.':p.phase==='attention'?'Pokračovanie potrebuje kontrolu.':Number.isFinite(p.eta_seconds)&&p.eta_seconds>=0?`Odhad zostávajúceho času: približne ${Math.max(1,Math.ceil(p.eta_seconds/60))} min.`:'Odhad sa zobrazí po získaní aktuálneho tempa odosielania.';
 }catch{$('tinder-overall-eta').textContent='Celkový odhad nie je dostupný — údaje sa neobnovili.';$('tinder-detail').textContent='Obnovenie priebehu zlyhalo. Zobrazené počty môžu byť staršie.';$('tinder-eta').textContent='Skontroluj pripojenie a zopakuj synchronizáciu.'}
}
async function refresh(){try{const list=await api(`/contents/${PREFIX}?ref=main`);if(!Array.isArray(list)||list.length>=1000)throw Error('Fronta má neplatný formát alebo prekročila limit.');const files=list.filter(f=>f.type==='file'&&UUID.test(f.name.replace(/\.json$/,''))&&f.name.endsWith('.json'));if(files.length>100)throw Error('Fronta prekročila 100 záznamov. Najprv archivuj vybavené požiadavky.');const next=[];for(const f of files){const id=f.name.slice(0,-5);const previous=items.find(i=>i.record.request.id===id&&i.sha===f.sha);if(previous){next.push(previous);continue}const file=await api(`/contents/${PREFIX}/${id}.json?ref=main`);next.push({sha:file.sha,record:await validate(decode(file.content),id)})}lastRefresh=Date.now();items=next.sort((a,b)=>Date.parse(b.record.request.created_at)-Date.parse(a.record.request.created_at)||b.record.request.id.localeCompare(a.record.request.id));render();const pending=items.filter(i=>!i.record.decision&&Date.now()<Date.parse(i.record.request.expires_at)).length;message(`Čakajúce požiadavky: ${pending} · Spolu: ${items.length} · Načítané ${new Date().toLocaleTimeString('sk-SK')}.`);}finally{if(token){await loadProgress();if(token)await loadWhatsAppNames();}}}
async function decide(item,outcome,comment='',permission=null){if(working||!token)return;comment=comment.trim();if(outcome==='commented'&&(!comment||comment.length>3000)){message('Napíš vyjadrenie od 1 do 3000 znakov.');return}const prompt=item.record.request.kind==='work_file'&&outcome==='approved'?`${permission==='always'?'Povoliť trvalo pre tento presný súbor a túto operáciu, aj pre budúce zmeny':'Povoliť iba túto jednu presnú zmenu'}?\n\n${item.record.request.file_change.path}\nOperácia: ${item.record.request.file_change.operation}\n\n${item.record.request.proposed_action}`:outcome==='commented'?`Odoslať tvoje vyjadrenie?\n\n${item.record.request.title}\n\n${comment}`:`${outcome==='approved'?'Schváliť':'Zamietnuť'} túto presnú požiadavku?\n\n${item.record.request.title}\n\n${item.record.request.proposed_action}`;if(!confirm(prompt))return;working=true;render();try{const id=item.record.request.id;const file=await api(`/contents/${PREFIX}/${id}.json?ref=main`),record=await validate(decode(file.content),id);if(file.sha!==item.sha||record.request_digest!==item.record.request_digest||record.decision!==null||Date.now()<Date.parse(record.request.created_at)||Date.now()>=Date.parse(record.request.expires_at))throw Error('Požiadavka sa zmenila, bola vybavená alebo vypršala. Obnov zoznam.');record.decision={outcome,operator:'Tomy',decided_at:new Date().toISOString(),request_digest:record.request_digest,...(outcome==='commented'?{comment}:{}),...(permission?{permission}:{})};const saved=await api(`/contents/${PREFIX}/${id}.json`,{method:'PUT',body:JSON.stringify({branch:'main',sha:file.sha,message:`Tomy ${outcome} ${id}`,content:encode(record)})});item.record=record;item.sha=saved.content?.sha||item.sha;drafts.delete(id);render();message(outcome==='commented'?'Vyjadrenie je uložené v bridge a pripravené pre zdrojovú aplikáciu.':'Rozhodnutie je uložené v bridge. Vykonanie akcie zostáva na zdrojovej aplikácii.');return true}catch(e){message(e.message||'Rozhodnutie sa nepodarilo uložiť. Obnov zoznam pred ďalším pokusom.')}finally{working=false;render()}}
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
  const repo=await api('');
  if(repo.private!==true||repo.full_name!==REPO){forgetPairing();throw Error('Bridge musí byť súkromný repozitár.')}
  verified=true;const remembered=rememberPairing();connected();
  await refresh();
  if(!remembered)message('Pripojené, ale zariadenie nedovolilo uložiť párovanie. Po zatvorení sa bude treba pripojiť znova.');
 }catch(e){
  if(!verified){token='';items=[];$('connect').hidden=false;$('disconnect').hidden=true;render()}
  message(e.message||'Pripojenie zlyhalo.');
 }finally{working=false;$('connect-button').disabled=false;render()}
}
$('connect').onsubmit=async e=>{e.preventDefault();const candidate=$('bridge-token').value.trim();$('bridge-token').value='';await connectBridge(candidate)};
$('refresh').onclick=async()=>{
 if(working)return;
 if(!token){message('Najprv pripoj súkromný bridge.');return}
 const button=$('refresh');button.disabled=true;let submitted=false;
 try{
  // Only explicit synchronization sends unsent text, using the same per-request confirmation and SHA validation.
  for(const item of [...items]){
   const draft=drafts.get(item.record.request.id)||'';
   if(draft.trim()&&item.record.decision===null){const sent=await decide(item,'commented',draft);if(!sent)return;submitted=true}
  }
  working=true;render();message('Načítavam požiadavky…');await refresh();
 }catch(e){message(e.message||'Synchronizácia sa nepodarila.')}
 finally{working=false;button.disabled=false;render()}
};
$('disconnect').onclick=()=>{forgetPairing();token='';items=[];whatsappNames=[];whatsappUnassigned=[];whatsappListStatus='Pripoj bridge na načítanie kontaktov.';lastRefresh=0;render();$('connect').hidden=false;$('disconnect').hidden=true;$('tinder-overall-count').textContent='Pripoj bridge na načítanie priebehu.';$('tinder-overall-meter').value=0;$('tinder-overall-eta').textContent='Pripoj bridge na načítanie odhadu.';$('tinder-count').textContent='Pripoj bridge na načítanie priebehu.';$('tinder-meter').value=0;$('tinder-detail').textContent='';$('tinder-eta').textContent='Odhad dokončenia zatiaľ nie je dostupný.';message('Párovanie je odstránené z tohto zariadenia.')};
window.addEventListener('pagehide',()=>{token='';items=[];whatsappNames=[];whatsappUnassigned=[];whatsappListStatus='Pripoj bridge na načítanie kontaktov.';lastRefresh=0;render();$('bridge-token').value='';$('connect').hidden=false;$('disconnect').hidden=true});

function restorePairing(){if(!token&&!working){const saved=savedPairing();if(saved){message('Obnovujem uložené pripojenie…');return connectBridge(saved)}}}
window.addEventListener('pageshow',restorePairing);
render();restorePairing();

// Only aggregate progress polls automatically. Requests and decisions stay manual.
function pollProgress(){if(token&&!working&&document.visibilityState!=='hidden'&&Date.now()>=readPause())return loadProgress()}
setInterval(pollProgress,15000);
document.addEventListener('visibilitychange',async()=>{
 if(document.visibilityState==='hidden'||working)return;
 if(!token){await restorePairing();return}
 working=true;render();
 try{await refresh()}catch(e){message(e.message||'Požiadavky sa nepodarilo obnoviť.')}
 finally{working=false;render()}
});
