const fs=require('fs'),vm=require('vm'),assert=require('assert'),{webcrypto}=require('crypto');
const events={},shown=[],opened=[];
const worker={URL,Number,Math,Promise,ROOT:new URL('https://example.test/app/'),self:{navigator:{setAppBadge:async()=>{}},registration:{showNotification:async(...args)=>shown.push(args)},clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url)},addEventListener:(name,handler)=>events[name]=handler}};
vm.createContext(worker);
const sw=fs.readFileSync(__dirname+'/../dist/sw.js','utf8');vm.runInContext(sw.slice(sw.indexOf('// Visible system notifications')),worker);
(async()=>{
 let wait;events.push({data:{json:()=>({test:false,count:3,body:'PRIVATE TEXT',url:'https://evil.test'})},waitUntil:p=>wait=p});await wait;
 assert.equal(shown[0][0],'Nový dotaz pre Tomyho');assert(!JSON.stringify(shown).includes('PRIVATE'));assert.equal(shown[0][1].silent,false);
 events.notificationclick({notification:{close(){}},waitUntil:p=>wait=p});await wait;assert.deepEqual(opened,['https://example.test/app/']);
 const nodes={'push-enable':{disabled:false},'push-status':{}},stored=new Map(),calls=[];
 const context={Uint8Array,Promise,URL,crypto:webcrypto,UUID:/^[a-f0-9-]{36}$/,token:'PRIVATE-TOKEN',Notification:{permission:'granted'},localStorage:{getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v)},$:id=>nodes[id],window:{},navigator:{},atob:s=>Buffer.from(s,'base64').toString('binary'),encode:JSON.stringify,decode:JSON.parse,api:async(path,options)=>{calls.push([path,options]);if(!options){const e=Error();e.status=404;throw e}return {}}};
 vm.createContext(context);let js=fs.readFileSync(__dirname+'/../dist/bridge.js','utf8').split('// The public VAPID key')[1];js='// The public VAPID key'+js;js=js.slice(0,js.indexOf("$('push-enable')?.addEventListener"));vm.runInContext(js,context);
 let subscribed=false;context.mockRegistration={pushManager:{subscribe:()=>{subscribed=true;return Promise.resolve({toJSON:()=>({endpoint:'https://web.push.apple.com/test',keys:{auth:'A',p256dh:'B'}})})}}};vm.runInContext('pushRegistration=mockRegistration;pushReady=true',context);
 const result=vm.runInContext('enablePush()',context);assert(subscribed,'Subscribe must run before first async wait, within user gesture');await result;assert.equal(calls.length,2);assert(!JSON.stringify(calls).includes('PRIVATE-TOKEN'));assert.equal(nodes['push-enable'].disabled,false);
 console.log('Notifications: direct consent gesture, private subscription storage, generic payload and fixed click destination passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
