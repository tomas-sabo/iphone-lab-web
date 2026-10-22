const fs=require('fs'),vm=require('vm'),assert=require('assert'),{webcrypto,createHash}=require('crypto');
const ROOT='https://example.test/iphone-lab-web/',REMOTE='https://raw.githubusercontent.com/tomas-sabo/iphone-lab-web/main/';
const types=['index.html','style.css','app.js','bridge.js','remote.js','manifest.webmanifest','icon.svg','icon-192.png','icon-512.png'];
const hash=x=>createHash('sha256').update(x).digest('hex');
function release(version){const files=types.map(path=>{const b=Buffer.from(path==='index.html'?`<h1>${version}</h1>`:path+' '+version);return {path,content:b.toString('base64'),sha256:hash(b)}});const bytes=Buffer.from(JSON.stringify({protocol:1,version,files}));return {bytes,manifest:{protocol:1,version,bundle:`releases/${version}.json`,sha256:hash(bytes)}}}
function memory(){const maps=new Map();let failPath='';return {fail: p=>failPath=p,keys:async()=>[...maps.keys()],delete:async name=>maps.delete(name),open:async name=>{if(!maps.has(name))maps.set(name,new Map());const data=maps.get(name);return {put:async(url,response)=>{if(failPath&&String(url).endsWith(failPath))throw Error('Quota exceeded');data.set(String(url),response.clone())},match:async url=>data.get(String(url))?.clone()}}}}
function boot(caches){const events={};let candidate=release('1.9.1'),offline=false,corrupt=false,requests=[];
const context={URL,Response,TextEncoder,TextDecoder,Uint8Array,Set,Promise,Object,JSON,Error,Date,AbortSignal,atob:s=>Buffer.from(s,'base64').toString('binary'),crypto:webcrypto,caches,self:{location:{href:ROOT+'sw.js'},clients:{claim:async()=>{}},skipWaiting(){},addEventListener:(type,fn)=>events[type]=fn},fetch:async(url,options)=>{url=String(url);requests.push(url);if(url.startsWith(REMOTE)){assert.equal(options.credentials,'omit');assert.equal(options.referrerPolicy,'no-referrer');assert.equal(options.redirect,'error');assert(!options.headers);if(offline)throw Error('offline');if(url.includes('release.json?'))return new Response(JSON.stringify(candidate.manifest));return new Response(corrupt?Buffer.from('corrupt'):candidate.bytes)}return new Response('bootstrap '+url)}};
vm.createContext(context);vm.runInContext(fs.readFileSync(__dirname+'/../dist/sw.js','utf8'),context);
return {set:r=>candidate=r,offline:v=>offline=v,corrupt:v=>corrupt=v,requests,async lifecycle(type){let pending;events[type]({waitUntil:p=>pending=p});await pending},async update(source=ROOT){let pending,result;events.message({data:{type:'GIT_UPDATE'},source:{url:source},ports:[{postMessage:r=>result=r}],waitUntil:p=>pending=p});await pending;return result},async page(){let result;events.fetch({request:{url:ROOT,mode:'navigate',method:'GET'},respondWith:p=>result=p});return (await result).text()}}}
(async()=>{
const caches=memory(),first=boot(caches);await first.lifecycle('install');await first.lifecycle('activate');assert.match(await first.page(),/bootstrap/);
first.corrupt(true);assert.equal((await first.update()).ok,false);assert.match(await first.page(),/bootstrap/);
first.corrupt(false);caches.fail('bridge.js');assert.equal((await first.update()).ok,false);assert.match(await first.page(),/bootstrap/);caches.fail('');
assert.equal((await first.update()).changed,true);assert.match(await first.page(),/1.9.1/);assert.equal((await first.update()).changed,false);
// Restart + stale Pages bootstrap must not downgrade a directly installed release.
const restarted=boot(caches);await restarted.lifecycle('install');assert.match(await restarted.page(),/1.9.1/);restarted.offline(true);assert.equal((await restarted.update()).ok,false);assert.match(await restarted.page(),/1.9.1/);
restarted.offline(false);restarted.set(release('1.8.9'));assert.equal((await restarted.update()).changed,false);assert.match(await restarted.page(),/1.9.1/);
const future=release('1.9.2');future.manifest.bundle='https://evil.test/steal';restarted.set(future);assert.equal((await restarted.update()).ok,false);
const missing=release('1.9.2');const payload=JSON.parse(missing.bytes);payload.files.pop();missing.bytes=Buffer.from(JSON.stringify(payload));missing.manifest.sha256=hash(missing.bytes);restarted.set(missing);assert.equal((await restarted.update()).ok,false);
const invalid=release('1.9.2');const data=JSON.parse(invalid.bytes);data.files[0].sha256='0'.repeat(64);invalid.bytes=Buffer.from(JSON.stringify(data));invalid.manifest.sha256=hash(invalid.bytes);restarted.set(invalid);assert.equal((await restarted.update()).ok,false);
assert.equal(await restarted.update('https://evil.test/'),undefined);assert.match(await restarted.page(),/1.9.1/);assert(!(await caches.keys()).some(k=>k.includes('1.9.2')));
restarted.set(release('1.9.2'));assert.equal((await restarted.update()).changed,true);assert.match(await restarted.page(),/1.9.2/);
console.log('Git updater: atomic activation, corrupted/missing files, failed storage, offline restart, downgrade prevention, fixed source and origin checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
