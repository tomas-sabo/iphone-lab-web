const VERSION='1.0.1';
const $=id=>document.getElementById(id);
const storage={get(k,fallback){try{return localStorage.getItem(k)??fallback}catch{return fallback}},set(k,v){try{localStorage.setItem(k,v);return true}catch{return false}}};
let count=Number(storage.get('lab.count','0'));if(!Number.isSafeInteger(count)||count<0)count=0;
function renderCount(){ $('count').textContent=count; }
function saveCount(){renderCount();if(!storage.set('lab.count',String(count)))$('counter-status').textContent='Úložisko nie je dostupné. Hodnota zostane iba počas otvorenia.'}
renderCount();$('increment').onclick=()=>{if(count<999999999){count++;saveCount()}};
$('reset').onclick=()=>{if(count===0)return;if(confirm('Vynulovať počítadlo?')){count=0;saveCount()}};
$('note').value=storage.get('lab.note','');
function noteLength(){$('note-length').textContent=`${$('note').value.length} / 5000`};noteLength();
$('note').addEventListener('input',()=>{noteLength();$('save-status').textContent=storage.set('lab.note',$('note').value)?'Uložené v tomto zariadení ✓':'Nepodarilo sa uložiť. Skopíruj si poznámku.'});
function connection(){$('connection').textContent=navigator.onLine?'Online':'Bez internetu';$('connection').classList.toggle('offline',!navigator.onLine)}
connection();window.addEventListener('online',connection);window.addEventListener('offline',connection);
$('version').textContent=`v${VERSION}`;
$('install-help').onclick=()=>$('help').showModal();$('close-help').onclick=()=>$('help').close();
if(matchMedia('(display-mode: standalone)').matches||navigator.standalone){$('install-copy').textContent='Lab už máš otvorený ako aplikáciu. Aktualizácie si skontroluje pri otvorení a po návrate na internet.';$('install-help').hidden=true}
let installPrompt;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('install-native').hidden=false});
$('install-native').onclick=async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;$('install-native').hidden=true}};
let registration,reloading=false;
function waiting(){if(registration?.waiting)$('update').hidden=false}
if('serviceWorker' in navigator){
 navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(r=>{registration=r;waiting();r.addEventListener('updatefound',()=>{const w=r.installing;w?.addEventListener('statechange',()=>{if(w.state==='installed'&&navigator.serviceWorker.controller)waiting()})});r.update().catch(()=>{})}).catch(()=>{$('update-status').textContent='Offline režim sa nepodarilo pripraviť.'});
 navigator.serviceWorker.addEventListener('controllerchange',()=>{if(reloading)return;reloading=true;location.reload()});
}
$('apply-update').onclick=()=>registration?.waiting?.postMessage({type:'SKIP_WAITING'});
$('check-update').onclick=async()=>{const b=$('check-update');b.disabled=true;$('update-status').textContent='Kontrolujem…';try{if(!navigator.onLine)throw Error('offline');await registration?.update();waiting();$('update-status').textContent=registration?.waiting?'Nová verzia je pripravená.':'Kontrola dokončená. Ak je nová verzia, zobrazí sa oznámenie.'}catch{$('update-status').textContent='Teraz sa nedá pripojiť. Skús to po pripojení na internet.'}finally{b.disabled=false}};
document.addEventListener('visibilitychange',()=>{if(!document.hidden)registration?.update().catch(()=>{})});
window.addEventListener('online',()=>registration?.update().catch(()=>{}));
