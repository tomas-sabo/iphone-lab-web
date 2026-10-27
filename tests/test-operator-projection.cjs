const fs=require('fs'),vm=require('vm'),assert=require('assert'),{webcrypto,createHash}=require('crypto');
const source=fs.readFileSync(__dirname+'/../dist/bridge.js','utf8');
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
const hash=v=>createHash('sha256').update(canonical(v)).digest('hex');
const id=n=>n.toString(16).padStart(8,'0')+'-1111-4111-8111-111111111111';
function fixture(n,source,kind){const request={id:id(n),source,title:'Synthetic '+n,body:'Synthetic context',proposed_action:'Synthetic question?',context_ref:source==='instagram'?'instagram-operator-'+n:'synthetic-'+n,context_sha256:'a'.repeat(64),created_at:new Date(Date.now()-60000).toISOString(),expires_at:new Date(Date.now()+86400000).toISOString(),...(kind?{kind}:{})};return {schema_version:1,request,request_digest:hash(request),decision:null}}
const records=[fixture(1,'rafi'),fixture(2,'instagram','operator_question'),fixture(3,'instagram')];
const registration=fixture(4,'instagram');registration.request.context_ref=id(20);registration.request_digest=hash(registration.request);
const encoded=x=>Buffer.from(JSON.stringify(x)).toString('base64');
function harness(){
 const nodes={},timers=[];
 function node(tag='div'){return {tagName:tag.toUpperCase(),children:[],value:'',textContent:'',open:false,attrs:{},style:{},append(...xs){for(const x of xs){if(x&&typeof x==='object')x.parent=this;this.children.push(x)}},replaceChildren(...xs){this.children=[];this.append(...xs)},setAttribute(k,v){this.attrs[k]=v},addEventListener(){},closest(){return null}}}
 const $=key=>nodes[key]??(nodes[key]=node());
 const c={navigator:{onLine:true},setTimeout(fn){timers.push(fn);return timers.length},clearTimeout(){},setInterval(){},requestAnimationFrame(fn){fn()},TextEncoder,TextDecoder,Uint8Array,Date,JSON,Error,Number,Array,Object,RegExp,Promise,Math,URL,crypto:webcrypto,AbortSignal,AbortController,btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),document:{visibilityState:'visible',activeElement:null,addEventListener(){},getElementById:$,createElement:node},window:{scrollY:0,scrollTo(){},addEventListener(){}},confirm:()=>true};
 vm.createContext(c);vm.runInContext(source.replace(/^export /gm,''),c);
 vm.runInContext('token="fixture";loadProgress=loadInactiveChats=loadWhatsAppNames=loadInstagramContacts=loadConversationIndex=async()=>{}',c);
 let failDirectory=false,emptyDirectory=false,hold;
 c.api=async path=>{
  if(path.startsWith('/contents/operator/request-status.json'))return {content:encoded({schema_version:1,inactive_ids:[],operator_questions:[]})};
  if(path==='/contents/operator/requests?ref=main'){
   if(failDirectory)throw Error('Temporary directory outage');
   if(hold)await hold;
   if(emptyDirectory)return [];
   return [...records,registration].map(r=>({type:'file',name:r.request.id+'.json',sha:'b'.repeat(40)}));
  }
  const r=[...records,registration].find(r=>path.includes(r.request.id));
  if(!r)throw Error('Unexpected route');
  return {sha:'b'.repeat(40),content:encoded(r)};
 };
 return {c,$,setEmpty:v=>emptyDirectory=v,setFail:v=>failDirectory=v,setHold:p=>hold=p};
}
const walk=n=>[n,...(n.children||[]).flatMap(walk)];
function cards(h){return walk(h.$('requests')).filter(n=>n.id?.startsWith('operator-request-'))}
function group(h,name){return h.$('requests').children.find(g=>g.children?.[0]?.textContent===name)}
function assertThree(h){
 assert.equal(h.$('operator-summary').textContent,'Čakajúce požiadavky: 3 · Spolu: 3');
 const found=cards(h);assert.equal(found.length,3,'Every counted question has one actual card');
 for(const [name,n] of [['Rafi',1],['Instagram',2]]){
  const g=group(h,name);assert(g?.open,'Pending section is expanded');assert.equal(g.children[0].children[0].textContent,n+'/'+n);
  assert.equal(g.children.filter(c=>c.id?.startsWith('operator-request-')).length,n);
 }
 for(const card of found){assert.equal(card.tagName,'ARTICLE');assert(card.parent.open);assert(walk(card).some(n=>n.tagName==='TEXTAREA'));const buttons=walk(card).filter(n=>n.tagName==='BUTTON');for(const text of ['Schváliť','Zamietnuť','Odoslať vyjadrenie'])assert(buttons.some(n=>n.textContent===text&&!n.disabled));}
 assert.equal(walk(h.$('tinder-waiting-list')).filter(n=>n.id?.startsWith('operator-request-')).length,0);
 assert(!found.some(n=>n.id==='operator-request-'+registration.request.id));
}
(async()=>{
 const h=harness();await vm.runInContext('refreshContents()',h.c);assertThree(h);
 // A new PWA realm rebuilds the same cards from canonical records, not prior JS state.
 const restarted=harness();await vm.runInContext('refreshContents()',restarted.c);assertThree(restarted);
 // Empty progress / independent snapshots never retire validated canonical cards.
 h.c.empty={operator_questions:[],instagram_operator_questions:[],operator_inactive_ids:[]};
 await vm.runInContext('applyOperatorInbox(empty,true);applyOperatorInbox(empty)',h.c);assertThree(h);
 h.setEmpty(true);await vm.runInContext('refreshContents()',h.c);assertThree(h);h.setEmpty(false);
 // Preserve the visible model while an asynchronous refresh is incomplete or fails.
 let release;h.setHold(new Promise(r=>release=r));const refreshing=vm.runInContext('refreshContents()',h.c);await new Promise(r=>setImmediate(r));assertThree(h);release();await refreshing;assertThree(h);
 h.setHold(null);h.setFail(true);await assert.rejects(vm.runInContext('refreshContents()',h.c));assertThree(h);assert.match(h.$('bridge-status').textContent,/zostávajú zobrazené/);h.setFail(false);
 // A signed but malformed inbox is rejected atomically without erasing any visible card.
 h.c.bad={operator_questions:[{record:{...records[0],request_digest:'0'.repeat(64)},sha:'b'.repeat(40)}],operator_inactive_ids:[records[1].request.id]};
 await assert.rejects(vm.runInContext('applyOperatorInbox(bad,true)',h.c));assertThree(h);
 // Canonical completed decisions survive a delayed pending snapshot, including the count.
 h.c.resolved=JSON.parse(JSON.stringify(records[0]));h.c.resolved.decision={outcome:'approved',operator:'Tomy',decided_at:new Date().toISOString(),request_digest:records[0].request_digest};
 h.c.late={operator_questions:[{record:records[0],sha:'b'.repeat(40)}]};
 vm.runInContext('items[0].record=resolved',h.c);await vm.runInContext('applyOperatorInbox(late)',h.c);
 assert.equal(h.$('operator-summary').textContent,'Čakajúce požiadavky: 2 · Spolu: 3');
 // Explicit retirement removes the card and count together and prevents resurrection.
 h.c.retired={operator_questions:[],operator_inactive_ids:[records[1].request.id]};await vm.runInContext('applyOperatorInbox(retired,true)',h.c);
 assert.equal(h.$('operator-summary').textContent,'Čakajúce požiadavky: 1 · Spolu: 2');
 h.c.late={operator_questions:[{record:records[1],sha:'b'.repeat(40)}]};await vm.runInContext('applyOperatorInbox(late)',h.c);assert.equal(cards(h).length,2);
 // Three registration records cannot generate a phantom global count or hidden section.
 vm.runInContext('items=[{record:registration,sha:"b".repeat(40)}];render()',Object.assign(h.c,{registration}));
 assert.equal(h.$('operator-summary').textContent,'Čakajúce požiadavky: 0 · Spolu: 0');assert.equal(cards(h).length,0);
 // Exercise the actual card handlers against a synthetic CAS transport, never a service.
 const actions=harness();await vm.runInContext('refreshContents()',actions.c);assertThree(actions);
 const read=actions.c.api,writes=[];actions.c.api=async(path,options={})=>{if(options.method==='PUT'){const body=JSON.parse(options.body);assert.equal(body.sha,'b'.repeat(40));const saved=JSON.parse(Buffer.from(body.content,'base64'));writes.push(saved);return {content:{sha:'c'.repeat(40)}}}return read(path,options)};
 const cardFor=n=>cards(actions).find(c=>c.id==='operator-request-'+id(n));
 const button=(card,text)=>walk(card).find(n=>n.tagName==='BUTTON'&&n.textContent===text);
 await button(cardFor(1),'Schváliť').onclick();assert.equal(writes.at(-1).decision.outcome,'approved');
 await button(cardFor(2),'Zamietnuť').onclick();assert.equal(writes.at(-1).decision.outcome,'rejected');
 const last=cardFor(3),input=walk(last).find(n=>n.tagName==='TEXTAREA');input.value='Synthetic operator response';input.oninput();
 await button(last,'Odoslať vyjadrenie').onclick();assert.equal(writes.at(-1).decision.comment,'Synthetic operator response');assert.equal(writes.length,3);
 assert.equal(actions.$('operator-summary').textContent,'Čakajúce požiadavky: 0 · Spolu: 3');
 console.log('Operator projection: actual DOM 1 Rafi + 2 Instagram, standard controls, PWA restart, empty snapshots, in-flight/failed refresh, atomic validation, sticky decisions, retirement and no phantom counts passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
