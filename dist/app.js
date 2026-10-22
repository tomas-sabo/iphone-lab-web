const VERSION='1.2.0';
const button=document.getElementById('update');
const status=document.getElementById('status');
document.getElementById('version').textContent=`Verzia ${VERSION}`;
let registration,busy=false,reloading=false;
function applyWaiting(){if(!registration?.waiting)return false;status.textContent='Aktualizujem…';registration.waiting.postMessage({type:'SKIP_WAITING'});return true}
const ready='serviceWorker' in navigator?navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(r=>{registration=r;r.addEventListener('updatefound',()=>{const worker=r.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller){if(busy)applyWaiting();else status.textContent='Nová verzia je pripravená.'}})});if(r.waiting)status.textContent='Nová verzia je pripravená.';return r}):Promise.reject(new Error('unsupported'));
ready.catch(()=>{status.textContent='Aktualizácie sa nepodarilo pripraviť. Otvor aplikáciu cez Safari.'});
if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('controllerchange',()=>{if(reloading)return;reloading=true;location.reload()});
button.onclick=async()=>{if(busy)return;busy=true;button.disabled=true;status.textContent='Kontrolujem aktualizáciu…';try{await ready;if(applyWaiting())return;if(!navigator.onLine)throw new Error('offline');await registration.update();if(applyWaiting())return;const worker=registration.installing;if(worker){await new Promise((resolve,reject)=>{const changed=()=>{if(worker.state==='installed')resolve();else if(worker.state==='redundant')reject(new Error('install failed'))};worker.addEventListener('statechange',changed);changed()});if(applyWaiting())return}status.textContent='Máš najnovšiu verziu.'}catch{status.textContent='Aktualizácia sa nepodarila. Skontroluj internet a skús znova.'}finally{busy=false;button.disabled=false}};
document.addEventListener('visibilitychange',()=>{if(!document.hidden)registration?.update().catch(()=>{})});
window.addEventListener('online',()=>registration?.update().catch(()=>{}));
