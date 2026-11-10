const fs=require('fs'),vm=require('vm'),assert=require('assert');
const setup=fs.readFileSync(__dirname+'/test-operator-projection.cjs','utf8').split('const walk=')[0];
const outer={require,__dirname,Buffer,console,TextEncoder,TextDecoder,URL,AbortSignal,AbortController};vm.createContext(outer);vm.runInContext(setup+';globalThis.h=harness();',outer);const h=outer.h;
const rows=Array.from({length:25},(_,n)=>({case_id:'case-'+n.toString(16).padStart(24,'0'),name:'Fixture '+n,state:'awaiting_reply',waiting_since:new Date().toISOString(),open_url:'https://tinder.com/app/messages/match_'+n}));
h.c.rows=rows;vm.runInContext('activeChatRows=rows;noActionRefreshPending=null;noActionRefreshMessage=""',h.c);
const writes=[];h.c.api=async(path,opt={})=>{if(opt.method==='PUT'){writes.push(JSON.parse(opt.body));return {content:{sha:'b'.repeat(40)}}}return {sha:'a'.repeat(40),content:Buffer.from(JSON.stringify({schema_version:1,request:null,status:null})).toString('base64')}};
(async()=>{
 await vm.runInContext("requestChatRefresh('active',rows.map(matchFromChat))",h.c);
 assert.equal(writes.length,1);const document=JSON.parse(Buffer.from(writes[0].content,'base64'));assert.equal(document.request.match_ids.length,25);assert.equal(document.request.scope,'active');
 assert.equal(new Date(document.request.expires_at)-new Date(document.request.created_at),86400000);
 h.c.doc=document;assert.equal(vm.runInContext('validateNoActionRefreshDocument(doc).request.match_ids.length',h.c),25);
 document.status={state:'processing',request_id:document.request.id,completed:3,total:25,prepared:2};assert(vm.runInContext('validateNoActionRefreshDocument(doc)',h.c));
 const source=fs.readFileSync(__dirname+'/../dist/bridge.js','utf8');assert(source.includes("refreshChatButton('inactive'"));assert(source.includes("refreshChatButton('active',rows,true)"));
 const now=Date.now();h.c.testRows=[{case_id:'case-'+'f'.repeat(24),name:'Fixture',reason:'Closed',state:'no_action',waiting_since:new Date(now-3*86400000-1000).toISOString(),open_url:'https://tinder.com/app/messages/fixture'}];
 assert.equal(vm.runInContext('validateNoActionDetails(testRows).length',h.c),0);h.c.testRows[0].waiting_since=new Date(now-60000).toISOString();assert.equal(vm.runInContext('validateNoActionDetails(testRows).length',h.c),1);
 console.log('Whole-section refresh queues every selected ID, bounded receipt validation, per-contact controls and three-day closure filter passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
