// Stable update engine. Application releases are published separately in release.json.
const BOOTSTRAP_VERSION='1.9.0',ENGINE_PROTOCOL=1;
const ROOT=new URL('./',self.location.href);
const REMOTE='https://raw.githubusercontent.com/tomas-sabo/iphone-lab-web/main/';
const META='iphone-lab-update-meta-v1',POINTER=new URL('__active_release__',ROOT).href;
const TYPES={'index.html':'text/html; charset=utf-8','style.css':'text/css; charset=utf-8','app.js':'text/javascript; charset=utf-8','bridge.js':'text/javascript; charset=utf-8','remote.js':'text/javascript; charset=utf-8','manifest.webmanifest':'application/manifest+json','icon.svg':'image/svg+xml','icon-192.png':'image/png','icon-512.png':'image/png'};
const VERSION=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/,HEX=/^[a-f0-9]{64}$/;
let updating;
const newer=(a,b)=>{const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i];return false};
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
async function active(){try{const r=await (await caches.open(META)).match(POINTER);if(r){const v=await r.json();if(typeof v.cache==='string'&&v.cache.startsWith('iphone-lab-')&&VERSION.test(v.version)&&(await caches.keys()).includes(v.cache))return v}}catch{}return null}
async function point(value){await (await caches.open(META)).put(POINTER,new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}}))}
async function remote(path,maxBytes){const response=await fetch(REMOTE+path,{cache:'no-store',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('Zdroj vydania nie je dostupný.');const reader=response.body.getReader(),chunks=[];let size=0;try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes)throw Error('Vydanie prekročilo povolenú veľkosť.');chunks.push(value)}}catch(e){await reader.cancel();throw e}const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}return bytes}
async function directUpdate(){
 const manifest=JSON.parse(new TextDecoder().decode(await remote('release.json?check='+Date.now(),4096)));
 if(manifest.protocol!==ENGINE_PROTOCOL||!VERSION.test(manifest.version)||!HEX.test(manifest.sha256)||manifest.bundle!==`releases/${manifest.version}.json`)throw Error('Vydanie potrebuje novší aktualizátor alebo má neplatný formát.');
 const previous=await active();if(previous&&!newer(manifest.version,previous.version))return {changed:false,version:previous.version};
 const bytes=await remote(manifest.bundle,2*1024*1024);if(await digest(bytes)!==manifest.sha256)throw Error('Kontrola balíka zlyhala.');
 const bundle=JSON.parse(new TextDecoder().decode(bytes));if(bundle.protocol!==ENGINE_PROTOCOL||bundle.version!==manifest.version||!Array.isArray(bundle.files)||bundle.files.length!==Object.keys(TYPES).length)throw Error('Neúplné vydanie.');
 const seen=new Set(),verified=[];
 for(const file of bundle.files){if(!Object.hasOwn(TYPES,file.path)||seen.has(file.path)||!HEX.test(file.sha256)||typeof file.content!=='string'||file.content.length>1500000)throw Error('Neplatný súbor vydania.');seen.add(file.path);const data=Uint8Array.from(atob(file.content),c=>c.charCodeAt(0));if(await digest(data)!==file.sha256)throw Error('Kontrola súboru zlyhala.');verified.push([file.path,data])}
 const name='iphone-lab-git-'+bundle.version+'-'+manifest.sha256;
 try{const cache=await caches.open(name);for(const [path,data] of verified)await cache.put(new URL(path,ROOT).href,new Response(data,{headers:{'Content-Type':TYPES[path]}}));await point({cache:name,version:bundle.version,previous:previous?.cache||null})}catch(e){await caches.delete(name);throw e}
 // Keep the previous snapshot for recovery. Never touch pairing or private bridge data.
 return {changed:true,version:bundle.version};
}
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const name='iphone-lab-bootstrap-'+BOOTSTRAP_VERSION,cache=await caches.open(name);
 try{for(const path of Object.keys(TYPES)){const url=new URL(path,ROOT),fresh=new URL(url);fresh.searchParams.set('release',BOOTSTRAP_VERSION);const r=await fetch(fresh.href,{cache:'reload'});if(!r.ok)throw Error('Incomplete bootstrap');await cache.put(url.href,r)}}catch(e){await caches.delete(name);throw e}
 const previous=await active();if(!previous||newer(BOOTSTRAP_VERSION,previous.version))await point({cache:name,version:BOOTSTRAP_VERSION,previous:previous?.cache||null});
})()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{
 if(event.data?.type==='PUSH_STATUS'){const u=event.source?.url?new URL(event.source.url):null;if(u&&u.origin===ROOT.origin&&u.pathname.startsWith(ROOT.pathname))event.ports?.[0]?.postMessage({push:true});return}
 if(event.data?.type==='SKIP_WAITING'){self.skipWaiting();return}
 if(event.data?.type!=='GIT_UPDATE'||!event.ports?.[0]||!event.source?.url)return;
 const source=new URL(event.source.url);if(source.origin!==ROOT.origin||!source.pathname.startsWith(ROOT.pathname))return;
 event.waitUntil((async()=>{try{if(!updating)updating=directUpdate().finally(()=>{updating=null});event.ports[0].postMessage({ok:true,...await updating})}catch(e){event.ports[0].postMessage({ok:false,error:e.message||'Aktualizácia zlyhala.'})}})());
});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==ROOT.origin||!url.pathname.startsWith(ROOT.pathname))return;
 const path=event.request.mode==='navigate'?'index.html':url.pathname.slice(ROOT.pathname.length);
 if(!Object.hasOwn(TYPES,path))return;
 event.respondWith((async()=>{const current=await active();if(current){const hit=await (await caches.open(current.cache)).match(new URL(path,ROOT).href);if(hit)return hit}return fetch(event.request)})());
});

// Visible system notifications only; never carry operator text or credentials.
self.addEventListener('push',event=>{
 let data={};try{data=event.data?.json()||{}}catch{}
 const count=Number.isSafeInteger(data.count)&&data.count>=0?Math.min(data.count,10000):1;
 event.waitUntil((async()=>{
  await self.registration.showNotification(data.test===true?'Skúšobné upozornenie':'Nový dotaz pre Tomyho',{
   body:data.test===true?'Upozornenia sú pripravené.':'Otvor aplikáciu a pozri si nový dotaz.',
   icon:new URL('icon-192.png',ROOT).href,badge:new URL('icon-192.png',ROOT).href,
   tag:'operator-questions',renotify:true,silent:false,data:{kind:'operator'}
  });
  try{if(self.navigator?.setAppBadge)await self.navigator.setAppBadge(count)}catch{}
 })());
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of clients){const u=new URL(client.url);if(u.origin===ROOT.origin&&u.pathname.startsWith(ROOT.pathname))return client.focus()}
  return self.clients.openWindow(ROOT.href);
 })());
});
