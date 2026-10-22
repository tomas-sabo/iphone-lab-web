const VERSION='1.9.0';
const button=document.getElementById('update'),status=document.getElementById('status');
document.getElementById('version').textContent=`Verzia ${VERSION}`;
let registration,busy=false,reloading=false;
function reload(){if(!reloading){reloading=true;location.reload()}}
function applyWaiting(){if(!registration?.waiting)return false;status.textContent='Aktualizujem základ aplikácie…';registration.waiting.postMessage({type:'SKIP_WAITING'});return true}
const ready='serviceWorker' in navigator?navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(r=>{registration=r;r.addEventListener('updatefound',()=>{const worker=r.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller){if(busy)applyWaiting();else status.textContent='Nový základ aplikácie je pripravený.'}})});if(r.waiting)status.textContent='Nový základ aplikácie je pripravený.';return r}):Promise.reject(Error('unsupported'));
ready.catch(()=>{status.textContent='Aktualizácie sa nepodarilo pripraviť. Otvor aplikáciu cez Safari.'});
if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('controllerchange',reload);
async function fromGit(worker){return new Promise((resolve,reject)=>{const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();reject(Error('Zdroj vydania neodpovedá.'))},60000);channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();event.data?.ok?resolve(event.data):reject(Error(event.data?.error||'Aktualizácia zlyhala.'))};worker.postMessage({type:'GIT_UPDATE'},[channel.port2])})}
button.onclick=async()=>{
 if(busy)return;busy=true;button.disabled=true;status.textContent='Kontrolujem vydanie priamo na GitHube…';
 try{await ready;if(applyWaiting())return;if(!navigator.onLine)throw Error('Zariadenie je offline.');const worker=navigator.serviceWorker.controller;if(!worker){status.textContent='Pripravujem aplikáciu. Po opätovnom otvorení skús aktualizáciu.';return}const result=await fromGit(worker);if(result.changed){status.textContent=`Aktualizujem na ${result.version}…`;reload()}else status.textContent=`Máš najnovšiu verziu ${result.version}.`}
 catch(e){status.textContent=`${e.message} Posledná uložená verzia zostáva k dispozícii.`}
 finally{busy=false;button.disabled=false}
};
// Engine updates still use the original origin; application updates use Git directly.
document.addEventListener('visibilitychange',()=>{if(!document.hidden)registration?.update().catch(()=>{})});
window.addEventListener('online',()=>registration?.update().catch(()=>{}));
