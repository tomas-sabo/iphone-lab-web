const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(__dirname+'/../dist/bridge.js','utf8'),nodes={};
const node=(tag,text)=>({tag,textContent:text,children:[],append(...v){this.children.push(...v)},replaceChildren(...v){this.children=v}}),$=id=>nodes[id]??(nodes[id]=node());
const ctx={Date,Error,Number,Array,String,Math,URL,Set,JSON,$,element:node,appendTinderActions:(target,url)=>target.append(node('a',url))};vm.createContext(ctx);
const helper=source.match(/export function validateTinderChatUrl\(.*\n/)[0];vm.runInContext((helper+source.slice(source.indexOf('const WAITING_CASE='),source.indexOf('function statisticsPointer'))).replaceAll('export function','function'),ctx);
const row=(i,state='awaiting_reply')=>({case_id:'case-'+i.toString(16).padStart(24,'0'),name:'Fixture '+i,reason:'Čakáme na odpoveď',state,waiting_since:new Date(Date.now()-60000).toISOString(),open_url:'https://tinder.com/app/messages/match_'+i});
const active=Array.from({length:250},(_,i)=>row(i+1));assert.equal(ctx.validateActiveDetails(active).length,250);
assert.throws(()=>ctx.validateActiveDetails(Array.from({length:10001},(_,i)=>row(i))));assert.throws(()=>ctx.validateActiveDetails([row(1,'inactive')]));assert.throws(()=>ctx.validateActiveDetails([row(1),row(1)]));assert.throws(()=>ctx.validateActiveDetails([{...row(1),open_url:'https://evil.test/chat'}]));
const p={awaiting_details:[row(500,'prepared')],waiting_count:1,active_details:active,active_count:250};const result=ctx.chatProjections(p);assert.equal(result.waiting.length,1);assert.equal(result.active.length,250);
assert.throws(()=>ctx.chatProjections({...p,active_count:249}));assert.throws(()=>ctx.chatProjections({...p,awaiting_details:[row(1,'stale')]}));
const legacy=ctx.chatProjections({awaiting_details:[row(1),row(2,'needs_user')],waiting_count:2});assert.equal(legacy.waiting.length,1);assert.equal(legacy.active,null);
ctx.renderActive(active);assert.equal($('tinder-active-count').textContent,'250');assert.equal($('tinder-active-list').children.length,101);$('tinder-active-list').children.at(-1).onclick();assert.equal($('tinder-active-list').children.length,201);$('tinder-active-list').children.at(-1).onclick();assert.equal($('tinder-active-list').children.length,250);assert.equal($('tinder-active-list').children[0].children[2].textContent,active[0].open_url);
const html=fs.readFileSync(__dirname+'/../dist/index.html','utf8');assert(html.indexOf('id="tinder-waiting"')<html.indexOf('id="tinder-active"'));assert(html.indexOf('id="tinder-active"')<html.indexOf('<h1>Pre Tomyho</h1>'));assert(!html.includes('id="tinder-active" open'));
const waiting=Array.from({length:250},(_,i)=>({...row(i+1000,'dispatched'),stalled:i===0}));
assert.equal(ctx.validateWaitingDetails(waiting).length,250);ctx.renderWaiting(waiting,250);
assert.equal($('tinder-waiting-count').textContent,'250');assert.equal($('tinder-waiting-list').children.length,101);
assert($('tinder-waiting-list').children[0].children.some(x=>x.textContent==='Zaseknuté'));
assert(!$('tinder-waiting-list').children[1].children.some(x=>x.textContent==='Zaseknuté'));
$('tinder-waiting-list').children.at(-1).onclick();assert.equal($('tinder-waiting-list').children.length,201);
assert.equal(ctx.validateWaitingDetails([row(9000,'queued')])[0].stalled,false);
assert.throws(()=>ctx.validateWaitingDetails([{...row(9001,'prepared'),stalled:'yes'}]));
console.log('Active chats: distinct projections, count consistency, safe URLs, >100 complete rows, incremental rendering and section order passed.');

for(const [stage,label] of [['loaded','Načítané T'],['waiting_rafi','Rafi T'],['waiting_send','Odosielané T']]){const r={...row(9001,'dispatched'),pipeline_stage:stage,stalled:false};assert.equal(ctx.waitingStageLabel(ctx.validateWaitingDetails([r])[0]),label)}
for(const owner of ['Rafi','Tinder']){ctx.UUID=/^[a-f0-9-]{36}$/;const r={...row(9002,'needs_user'),pipeline_stage:owner==='Rafi'?'rafi_question':'tinder_question',stalled:true,unblock:{id:'11111111-1111-4111-8111-111111111111',owner,route:'operator',status:'published',question:'One exact question?'}};assert.equal(ctx.waitingStageLabel(ctx.validateWaitingDetails([r])[0]),owner+' čaká na dotaz T');assert.throws(()=>ctx.validateWaitingDetails([{...r,unblock:undefined}]))}
assert.throws(()=>ctx.validateWaitingDetails([{...row(9003,'prepared'),pipeline_stage:'imaginary'}]));

const now=Date.now(),sent={...row(9500,'sent'),channel:'tinder',pipeline_stage:'sent',stalled:false,waiting_since:new Date(now-40000).toISOString(),completed_at:new Date(now-20000).toISOString(),expires_at:new Date(now+100000).toISOString()};
const checked=ctx.validatePipelineDetails([sent])[0];assert.equal(ctx.waitingStageLabel(checked),'Odoslané T');assert.equal(ctx.pipelineDuration(checked,now),ctx.pipelineDuration(checked,now+90000));assert.equal(ctx.visiblePipelineRows([checked],now+99999).length,1);assert.equal(ctx.visiblePipelineRows([checked],now+100000).length,0);
assert.throws(()=>ctx.validatePipelineDetails([{...sent,expires_at:new Date(now+100001).toISOString()}]));assert.throws(()=>ctx.validatePipelineDetails([{...sent,state:'prepared'}]));
const ig={...row(9501,'dispatched'),channel:'instagram',case_id:'ig-'+'f'.repeat(24),pipeline_stage:'waiting_rafi',stalled:false,open_url:'https://www.instagram.com/direct/t/123456789/'};assert.equal(ctx.waitingStageLabel(ctx.validatePipelineDetails([ig])[0]),'Rafi I');assert.throws(()=>ctx.validatePipelineDetails([{...ig,open_url:'https://evil.example/direct/t/123456789/'}]));assert.throws(()=>ctx.validatePipelineDetails([{...ig,case_id:'case-'+'f'.repeat(24)}]));
const pipeline=ctx.chatProjections({...p,pipeline_details:[ig,sent]});assert.equal(pipeline.waitingCount,2);assert.equal(pipeline.active.length,250);
ctx.renderWaiting([sent],1);assert.equal($('tinder-waiting-list').children.length,1);ctx.renderWaiting([{...sent,expires_at:new Date(now-1).toISOString()}],1);assert.equal($('tinder-waiting-list').children.length,0);
console.log('Unified T/I stages, frozen confirmed timer, exact120s expiry, channel identity/URL rejection passed.');


// Expiry is absolute from confirmed send; refresh never adds phone time.
const late={...sent,case_id:'case-'+'e'.repeat(24),waiting_since:new Date(now-700000).toISOString(),completed_at:new Date(now-600000).toISOString(),expires_at:new Date(now-480000).toISOString()};
assert.equal(ctx.visiblePipelineRows(ctx.validatePipelineDetails([late]),now).length,0);
ctx.renderWaiting([sent],1);assert.equal(ctx.preserveProgressOnFailure(),true);assert.equal($('tinder-waiting-list').children.length,1);
ctx.renderWaiting([late],1);assert(!$('tinder-waiting-list').children.some(n=>n.children?.some(c=>c.textContent===late.name)));
assert.equal(source.includes('sent-first-visible'),false);assert.equal(source.includes('setInterval(pollProgress,15000)'),true);
console.log('Confirmed-send absolute expiry and no first-view reset; prior verified view retained on failure.');

const delayed={...sent,incoming_received_at:new Date(now-105000).toISOString()};
const delayedChecked=ctx.validatePipelineDetails([delayed])[0];assert.equal(ctx.preloadWaitText(delayedChecked),'1 min 5 s');
assert.equal(ctx.preloadWaitText(ig),'—');
assert.throws(()=>ctx.validatePipelineDetails([{...sent,incoming_received_at:new Date(now).toISOString()}]));
ctx.renderWaiting([delayedChecked],1);const times=$('tinder-waiting-list').children[0].children[0].children[1];
assert.equal(times.children[1].textContent,'1 min 5 s');
