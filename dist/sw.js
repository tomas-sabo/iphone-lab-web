// Bump RELEASE with every deployment that changes application files.
const RELEASE='1.7.0';
const CACHE='iphone-lab-'+RELEASE;
const ROOT=new URL('./',self.location.href);
const FILES=['./','./index.html','./style.css','./app.js','./bridge.js','./remote.js','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png'].map(p=>new URL(p,ROOT).href);
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>Promise.all(FILES.map(async url=>{const fresh=new URL(url);fresh.searchParams.set('release',RELEASE);const response=await fetch(fresh.href,{cache:'reload'});if(!response.ok)throw new Error('Incomplete release');await c.put(url,response)})))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('iphone-lab-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('message',e=>{if(e.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',event=>{const u=new URL(event.request.url);if(event.request.method!=='GET'||u.origin!==ROOT.origin||!u.pathname.startsWith(ROOT.pathname))return;
 if(event.request.mode==='navigate'){event.respondWith(caches.open(CACHE).then(async c=>(await c.match(new URL('./index.html',ROOT).href))||fetch(event.request)));return}
 if(FILES.includes(u.href))event.respondWith(caches.open(CACHE).then(async c=>(await c.match(event.request))||fetch(event.request)));
});
