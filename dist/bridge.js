const REPO='tomas-sabo/bridge',PREFIX='operator/requests';
const API=`https://api.github.com/repos/${REPO}`;
const $=id=>document.getElementById(id);
let token='',items=[],working=false;
const drafts=new Map();
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
export async function validate(record,id){const r=record?.request;if(record?.schema_version!==1||!r||!UUID.test(r.id)||r.id!==id||!['rafi','tinder','robota'].includes(r.source))throw Error('Neplatná požiadavka.');for(const [k,n] of [['title',160],['body',6000],['proposed_action',3000],['context_ref',200]])if(typeof r[k]!=='string'||!r[k].trim()||r[k].length>n)throw Error('Neplatný obsah požiadavky.');const created=Date.parse(r.created_at),expires=Date.parse(r.expires_at);if(!Number.isFinite(created)||!Number.isFinite(expires)||created>=expires||expires-created>7*86400000||!/^[a-f0-9]{64}$/.test(r.context_sha256)||await hash(r)!==record.request_digest)throw Error('Kontrola požiadavky zlyhala.');const d=record.decision;if(d!==null){if(!d||!['approved','rejected','commented'].includes(d.outcome)||d.operator!=='Tomy'||d.request_digest!==record.request_digest||!Number.isFinite(Date.parse(d.decided_at))||Date.parse(d.decided_at)<created||Date.parse(d.decided_at)>expires)throw Error('Neplatné rozhodnutie.');if(d.outcome==='commented'&&(typeof d.comment!=='string'||!d.comment.trim()||d.comment.length>3000))throw Error('Neplatné vyjadrenie.')}return record}
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
  if(response.status===401){forgetPairing();token='';$('connect').hidden=false;$('disconnect').hidden=true;items=[];render();throw Error('Prístup bol odmietnutý. Pripoj bridge platným tokenom.')}
  if([403,429].includes(response.status)){
   const until=Math.max(Date.now()+Math.max(retry,60000),remaining==='0'?reset+5000:0);pauseUntil(until);
   throw Error(`GitHub dočasne odmietol požiadavku. Ďalší pokus po ${new Date(until).toLocaleTimeString('sk-SK')}. Párovanie zostáva uložené.`);
  }
  if([409,422].includes(response.status))throw Error('Požiadavka sa zmenila alebo už bola vybavená. Obnov zoznam.');
  throw Error(`Bridge nie je dostupný (HTTP ${response.status}).`);
 }
 return response.json();
}
function message(text){$('bridge-status').textContent=text}
function element(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e}
function syncBadge(){const count=[...drafts.values()].filter(v=>v.trim()).length;$('sync-count').textContent=String(count);$('sync-count').hidden=!count}
function render(){syncBadge();$('requests').replaceChildren();for(const item of items){const r=item.record.request,d=item.record.decision,expired=Date.now()>=Date.parse(r.expires_at);const card=element('article',undefined,'request');card.append(element('span',({rafi:'Rafi',tinder:'Tinder',robota:'Robota'})[r.source],'source'),element('h2',r.title),element('p',r.body,'context'),element('h3','Čo schvaľuješ'),element('p',r.proposed_action,'action'),element('small',`Referencia: ${r.context_ref} · Platí do ${new Date(r.expires_at).toLocaleString('sk-SK')}`));if(d){card.append(element('p',({approved:'Schválené ✓',rejected:'Zamietnuté',commented:'Vyjadrenie odoslané'})[d.outcome],'decision'));if(d.outcome==='commented')card.append(element('p',d.comment,'context'));}else if(expired)card.append(element('p','Platnosť vypršala. Vyžiadaj novú požiadavku.'));else{const controls=element('div',undefined,'decision-buttons');for(const [outcome,label] of [['approved','Schváliť'],['rejected','Zamietnuť']]){const b=element('button',label,outcome==='rejected'?'secondary':'');b.type='button';b.disabled=working;b.onclick=()=>decide(item,outcome);controls.append(b)}card.append(controls);
 const label=element('label','Tvoje vyjadrenie');label.htmlFor='comment-'+r.id;
 const input=element('textarea');input.id=label.htmlFor;input.rows=3;input.maxLength=3000;input.placeholder='Napíš odpoveď alebo doplnenie…';input.value=drafts.get(r.id)||'';input.disabled=working;input.oninput=()=>{drafts.set(r.id,input.value);syncBadge()};
 const send=element('button','Odoslať vyjadrenie','secondary');send.type='button';send.disabled=working;send.onclick=()=>decide(item,'commented',input.value);
 const box=element('div',undefined,'comment-box');box.append(label,input,send,element('small','Vyjadrenie odošle odpoveď zdroju. Neznamená schválenie akcie.'));card.append(box);
 }$('requests').append(card)}}
async function loadProgress(){
 try{
  const file=await api('/contents/operator/tinder-progress.json?ref=main');const p=decode(file.content);
  if(p.schema_version!==1||p.scope!=='initial_round'||!['sent','total','blocked','ready','uncertain','stale'].every(k=>Number.isSafeInteger(p[k])&&p[k]>=0&&p[k]<=100000)||p.sent>p.total||!Number.isFinite(Date.parse(p.updated_at)))throw Error('Invalid progress');
  if(Number.isSafeInteger(p.overall_total)&&Number.isSafeInteger(p.overall_sent)&&p.overall_sent>=0&&p.overall_sent<=p.overall_total&&p.overall_total<=100000){
   $('tinder-overall-count').textContent=`${p.overall_sent} / ${p.overall_total} zhôd dostalo aspoň 1 správu od Rafiho`;
   $('tinder-overall-meter').max=p.overall_total||1;$('tinder-overall-meter').value=p.overall_sent;
  }else $('tinder-overall-count').textContent='Celkový údaj zatiaľ nie je dostupný.';
  $('tinder-count').textContent=`Odoslané ${p.sent} / ${p.total} kontaktov`;
  $('tinder-meter').max=p.total||1;$('tinder-meter').value=p.sent;
  $('tinder-detail').textContent=`Čaká na tvoje vyjadrenie: ${p.blocked} · Pripravené: ${p.ready} · Posledná zmena: ${new Date(p.updated_at).toLocaleString('sk-SK')}`;
  $('tinder-eta').textContent=p.phase==='complete'?'Séria je dokončená.':p.phase==='paused'?'Odosielanie je pozastavené.':p.phase==='awaiting_operator'?'Odhad dokončenia: čaká na tvoje odpovede.':p.phase==='attention'?'Pokračovanie potrebuje kontrolu.':Number.isFinite(p.eta_seconds)&&p.eta_seconds>=0?`Odhad zostávajúceho času: približne ${Math.max(1,Math.ceil(p.eta_seconds/60))} min.`:'Odhad sa zobrazí po získaní aktuálneho tempa odosielania.';
 }catch{$('tinder-eta').textContent='Priebeh sa nepodarilo načítať. Skús ďalšiu synchronizáciu.'}
}
async function refresh(force=false){if(!force&&lastRefresh&&Date.now()-lastRefresh<60000){message('Zoznam je aktuálny. Ďalšia kontrola je možná po jednej minúte.');return}const list=await api(`/contents/${PREFIX}?ref=main`);if(!Array.isArray(list)||list.length>=1000)throw Error('Fronta má neplatný formát alebo prekročila limit.');const files=list.filter(f=>f.type==='file'&&UUID.test(f.name.replace(/\.json$/,''))&&f.name.endsWith('.json'));if(files.length>100)throw Error('Fronta prekročila 100 záznamov. Najprv archivuj vybavené požiadavky.');const next=[];for(const f of files){const id=f.name.slice(0,-5);const previous=items.find(i=>i.record.request.id===id&&i.sha===f.sha);if(previous){next.push(previous);continue}const file=await api(`/contents/${PREFIX}/${id}.json?ref=main`);next.push({sha:file.sha,record:await validate(decode(file.content),id)})}lastRefresh=Date.now();items=next.sort((a,b)=>a.record.request.created_at.localeCompare(b.record.request.created_at));render();message(items.length?`Načítané požiadavky: ${items.length}.`:'Žiadne požiadavky.');await loadProgress();}
async function decide(item,outcome,comment=''){if(working||!token)return;comment=comment.trim();if(outcome==='commented'&&(!comment||comment.length>3000)){message('Napíš vyjadrenie od 1 do 3000 znakov.');return}const prompt=outcome==='commented'?`Odoslať tvoje vyjadrenie?\n\n${item.record.request.title}\n\n${comment}`:`${outcome==='approved'?'Schváliť':'Zamietnuť'} túto presnú požiadavku?\n\n${item.record.request.title}\n\n${item.record.request.proposed_action}`;if(!confirm(prompt))return;working=true;render();try{const id=item.record.request.id;const file=await api(`/contents/${PREFIX}/${id}.json?ref=main`),record=await validate(decode(file.content),id);if(file.sha!==item.sha||record.request_digest!==item.record.request_digest||record.decision!==null||Date.now()<Date.parse(record.request.created_at)||Date.now()>=Date.parse(record.request.expires_at))throw Error('Požiadavka sa zmenila, bola vybavená alebo vypršala. Obnov zoznam.');record.decision={outcome,operator:'Tomy',decided_at:new Date().toISOString(),request_digest:record.request_digest,...(outcome==='commented'?{comment}:{})};await api(`/contents/${PREFIX}/${id}.json`,{method:'PUT',body:JSON.stringify({branch:'main',sha:file.sha,message:`Tomy ${outcome} ${id}`,content:encode(record)})});item.record=record;drafts.delete(id);render();message(outcome==='commented'?'Vyjadrenie je uložené v bridge a pripravené pre zdrojovú aplikáciu.':'Rozhodnutie je uložené v bridge. Vykonanie akcie zostáva na zdrojovej aplikácii.');return true}catch(e){message(e.message||'Rozhodnutie sa nepodarilo uložiť. Obnov zoznam pred ďalším pokusom.')}finally{working=false;render()}}
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
  working=true;render();message('Načítavam požiadavky…');await refresh(submitted);
 }catch(e){message(e.message||'Synchronizácia sa nepodarila.')}
 finally{working=false;button.disabled=false;render()}
};
$('disconnect').onclick=()=>{forgetPairing();token='';items=[];lastRefresh=0;render();$('connect').hidden=false;$('disconnect').hidden=true;$('tinder-overall-count').textContent='Pripoj bridge na načítanie priebehu.';$('tinder-overall-meter').value=0;$('tinder-count').textContent='Pripoj bridge na načítanie priebehu.';$('tinder-meter').value=0;$('tinder-detail').textContent='';$('tinder-eta').textContent='Odhad dokončenia zatiaľ nie je dostupný.';message('Párovanie je odstránené z tohto zariadenia.')};
window.addEventListener('pagehide',()=>{token='';items=[];lastRefresh=0;render();$('bridge-token').value='';$('connect').hidden=false;$('disconnect').hidden=true});

function restorePairing(){if(!token&&!working){const saved=savedPairing();if(saved){message('Obnovujem uložené pripojenie…');return connectBridge(saved)}}}
window.addEventListener('pageshow',restorePairing);
restorePairing();
