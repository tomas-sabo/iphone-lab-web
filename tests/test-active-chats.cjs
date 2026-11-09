const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(__dirname+'/../dist/bridge.js','utf8'),nodes={};
const node=(tag,text,className='')=>({tag,textContent:text,className,children:[],append(...v){this.children.push(...v)},replaceChildren(...v){this.children=v}}),$=id=>nodes[id]??(nodes[id]=node());
const ctx={Date,Error,Number,Array,String,Math,URL,Set,JSON,$,element:node,appendTinderActions:(target,url)=>target.append(node('a',url))};vm.createContext(ctx);
const helper=source.match(/export function validateTinderChatUrl\(.*\n/)[0];vm.runInContext((helper+source.slice(source.indexOf('const WAITING_CASE='),source.indexOf('function statisticsPointer'))).replaceAll('export function','function'),ctx);
const row=(i,state='awaiting_reply')=>({case_id:'case-'+i.toString(16).padStart(24,'0'),name:'Fixture '+i,reason:'Čakáme na odpoveď',state,waiting_since:new Date(Date.now()-60000).toISOString(),open_url:'https://tinder.com/app/messages/match_'+i});
const active=Array.from({length:250},(_,i)=>row(i+1));assert.equal(ctx.validateActiveDetails(active).length,250);
assert.throws(()=>ctx.validateActiveDetails(Array.from({length:10001},(_,i)=>row(i))));assert.throws(()=>ctx.validateActiveDetails([row(1,'inactive')]));assert.throws(()=>ctx.validateActiveDetails([row(1),row(1)]));assert.throws(()=>ctx.validateActiveDetails([{...row(1),open_url:'https://evil.test/chat'}]));
const p={awaiting_details:[row(500,'prepared')],waiting_count:1,active_details:active,active_count:250};const result=ctx.chatProjections(p);assert.equal(result.waiting.length,0);assert.equal(result.active.length,250);
assert.equal(ctx.projectionFresh(new Date().toISOString()),true);assert.equal(ctx.projectionFresh(new Date(Date.now()-300001).toISOString()),false);assert.equal(ctx.projectionFresh(new Date(Date.now()+30001).toISOString()),false);
assert.throws(()=>ctx.chatProjections({...p,active_count:249}));assert.equal(ctx.chatProjections({...p,awaiting_details:[row(1,'stale')]}).waitingCount,0);
const legacy=ctx.chatProjections({awaiting_details:[row(1),row(2,'needs_user')],waiting_count:2});assert.equal(legacy.waiting.length,0);assert.equal(legacy.active,null);
ctx.renderActive(active);assert.equal($('tinder-active-count').textContent,'250');assert.equal($('tinder-active-list').children.length,101);$('tinder-active-list').children.at(-1).onclick();assert.equal($('tinder-active-list').children.length,201);$('tinder-active-list').children.at(-1).onclick();assert.equal($('tinder-active-list').children.length,250);assert.equal($('tinder-active-list').children[0].children[2].textContent,active[0].open_url);
const html=fs.readFileSync(__dirname+'/../dist/index.html','utf8');assert(html.indexOf('id="tinder-waiting"')<html.indexOf('id="tinder-active"'));assert(html.indexOf('id="tinder-active"')<html.indexOf('<h1>Pre Tomyho</h1>'));assert(!html.includes('id="tinder-active" open'));
const waiting=Array.from({length:250},(_,i)=>({...row(i+1000,'dispatched'),stalled:i===0}));
assert.equal(ctx.validateWaitingDetails(waiting).length,250);ctx.renderWaiting(waiting,250);
assert.equal($('tinder-waiting-count').textContent,'250');assert.equal($('tinder-waiting-list').children.length,101);
assert(!$('tinder-waiting-list').children[0].className.includes('is-stalled'),'legacy stalled flag alone is delayed_unknown, not truly stuck');
assert(!$('tinder-waiting-list').children[1].className.includes('is-stalled'));
$('tinder-waiting-list').children.at(-1).onclick();assert.equal($('tinder-waiting-list').children.length,201);
assert.equal(ctx.validateWaitingDetails([row(9000,'queued')])[0].stalled,false);
assert.throws(()=>ctx.validateWaitingDetails([{...row(9001,'prepared'),stalled:'yes'}]));
console.log('Active chats: distinct projections, count consistency, safe URLs, >100 complete rows, incremental rendering and section order passed.');

for(const stage of ['loaded','waiting_rafi','waiting_send','held']){const r={...row(9001,'dispatched'),pipeline_stage:stage,stalled:false};assert.equal(ctx.waitingStageLabel(ctx.validateWaitingDetails([r])[0]),'Stav sa overuje T')}
for(const owner of ['Rafi','Tinder']){ctx.UUID=/^[a-f0-9-]{36}$/;const r={...row(9002,'needs_user'),pipeline_stage:owner==='Rafi'?'rafi_question':'tinder_question',stalled:true,unblock:{id:'11111111-1111-4111-8111-111111111111',owner,route:'operator',status:'published',question:'One exact question?'}};assert.equal(ctx.waitingStageLabel(ctx.validateWaitingDetails([r])[0]),owner+' čaká na dotaz T');assert.throws(()=>ctx.validateWaitingDetails([{...r,unblock:undefined}]))}
assert.throws(()=>ctx.validateWaitingDetails([{...row(9003,'prepared'),pipeline_stage:'imaginary'}]));

const now=Date.now(),sent={...row(9500,'sent'),channel:'tinder',stable_chat_id:'tinder:'+'a'.repeat(24),pipeline_stage:'sent',stalled:false,waiting_since:new Date(now-40000).toISOString(),completed_at:new Date(now-20000).toISOString(),confirmed_at:new Date(now-20000).toISOString(),expires_at:new Date(now+280000).toISOString()};
const checked=ctx.validatePipelineDetails([sent])[0];assert.equal(ctx.waitingStageLabel(checked),'Odoslané T');assert.equal(ctx.pipelineDuration(checked,now),ctx.pipelineDuration(checked,now+90000));assert.equal(ctx.visiblePipelineRows([checked],now+279999).length,1);assert.equal(ctx.visiblePipelineRows([checked],now+280000).length,0);
assert.throws(()=>ctx.validatePipelineDetails([{...sent,expires_at:new Date(now+280001).toISOString()}]));assert.throws(()=>ctx.validatePipelineDetails([{...sent,state:'prepared'}]));
const ig={...row(9501,'dispatched'),channel:'instagram',stable_chat_id:'instagram:'+'f'.repeat(24),case_id:'ig-'+'f'.repeat(24),pipeline_stage:'waiting_rafi',stalled:false,open_url:'https://www.instagram.com/direct/t/123456789/'};assert.equal(ctx.waitingStageLabel(ctx.validatePipelineDetails([ig])[0]),'Stav sa overuje I');assert.throws(()=>ctx.validatePipelineDetails([{...ig,open_url:'https://evil.example/direct/t/123456789/'}]));assert.throws(()=>ctx.validatePipelineDetails([{...ig,case_id:'case-'+'f'.repeat(24)}]));
const pipeline=ctx.chatProjections({...p,pipeline_details:[ig,sent]});assert.equal(pipeline.waitingCount,2);assert.equal(pipeline.active.length,250);
assert.deepEqual(JSON.parse(JSON.stringify(ctx.pipelineBucketCounts([ig,sent]))),{queued:0,processing:0,delayed_unknown:1,needs_user:0,safety_hold:0,verification_required:0,truly_stuck:0,sent:1});
const igQuestion={...ig,stable_chat_id:'instagram:'+'a'.repeat(24),case_id:'ig-'+'a'.repeat(24),pipeline_stage:'held',stalled:true,unblock:{id:'11111111-1111-4111-8111-111111111111',owner:'Instagram',route:'operator',status:'published',question:'One exact question?'}};
const withoutQuestions=ctx.chatProjections({...p,pipeline_details:[ig,igQuestion,sent]});assert.equal(withoutQuestions.waitingCount,2);assert(!withoutQuestions.waiting.some(item=>item.unblock?.route==='operator'));
ctx.renderWaiting([sent],1);assert.equal($('tinder-waiting-list').children.length,1);ctx.renderWaiting([{...sent,expires_at:new Date(now-1).toISOString()}],1);assert.equal($('tinder-waiting-list').children.length,0);
const ready={...ig,stable_chat_id:'instagram:'+'b'.repeat(24),case_id:'ig-'+'b'.repeat(24),pipeline_stage:'waiting_send',progress_state:'queued'};
const held={...ig,stable_chat_id:'instagram:'+'c'.repeat(24),case_id:'ig-'+'c'.repeat(24),pipeline_stage:'held',automatic_resolution:true,progress_state:'safety_hold'};
ctx.renderWaiting([ready,held,sent],3);assert.equal($('tinder-waiting-count').textContent,'2');assert.equal($('tinder-waiting-buckets').children.length,3);assert.equal($('tinder-waiting-buckets').children[0].children[0].textContent,'1');
$('tinder-waiting-buckets').children[0].onclick();assert.equal($('tinder-waiting-list').children.length,1,'bucket click filters the rendered rows');
$('tinder-waiting-buckets').children[0].onclick();assert.equal($('tinder-waiting-list').children.length,3,'second click restores the complete authoritative list');
const evidenceAt=new Date(now-5000).toISOString(),stageSince=new Date(now-10000).toISOString();
const processing=ctx.validatePipelineDetails([{...ready,progress_contract_version:1,progress_state:'processing',stage_since:stageSince,evidence_at:evidenceAt,evidence_code:'lease_active'}])[0];assert.equal(ctx.waitingStageLabel(processing),'Spracúva sa I');assert.equal(processing.progress_contract_version,1);
const stuck=ctx.validatePipelineDetails([{...ready,progress_state:'truly_stuck',stage_since:stageSince,evidence_at:evidenceAt,evidence_code:'lease_expired'}])[0];assert.equal(ctx.waitingStageLabel(stuck),'Technicky zaseknuté I');
assert.throws(()=>ctx.validatePipelineDetails([{...ready,progress_state:'truly_stuck'}]));
assert.throws(()=>ctx.validatePipelineDetails([{...ready,progress_contract_version:2,progress_state:'queued'}]));
assert.equal(ctx.validatePipelineDetails([ready])[0].progress_state,'queued');
console.log('Unified T/I stages, frozen confirmed timer, exact300s expiry, channel identity/URL rejection passed.');


// Expiry is absolute from confirmed send; refresh never adds phone time.
const late={...sent,case_id:'case-'+'e'.repeat(24),waiting_since:new Date(now-700000).toISOString(),completed_at:new Date(now-600000).toISOString(),confirmed_at:new Date(now-600000).toISOString(),expires_at:new Date(now-300000).toISOString()};
assert.equal(ctx.visiblePipelineRows(ctx.validatePipelineDetails([late]),now).length,0);
ctx.progressUpdatedAt=new Date().toISOString();ctx.renderWaiting([sent],1);assert.equal(ctx.preserveProgressOnFailure(),true);assert.equal($('tinder-waiting-list').children.length,1);
ctx.progressUpdatedAt=new Date(Date.now()-300001).toISOString();assert.equal(ctx.preserveProgressOnFailure(),false);assert.equal($('tinder-waiting-list').children.length,0);assert.equal($('tinder-active-list').children.length,0);
ctx.renderWaiting([late],1);assert(!$('tinder-waiting-list').children.some(n=>n.children?.some(c=>c.textContent===late.name)));
assert.equal(source.includes('sent-first-visible'),false);assert.equal(source.includes('setInterval(pollProgress,60000)'),true);
console.log('Confirmed-send absolute expiry and no first-view reset; prior verified view retained on failure.');

const delayed={...sent,incoming_received_at:new Date(now-105000).toISOString()};
const delayedChecked=ctx.validatePipelineDetails([delayed])[0];assert.equal(ctx.preloadWaitText(delayedChecked),'1 min 5 s');
assert.equal(ctx.preloadWaitText(ig),'—');
assert.throws(()=>ctx.validatePipelineDetails([{...sent,incoming_received_at:new Date(now).toISOString()}]));
ctx.renderWaiting([delayedChecked],1);const times=$('tinder-waiting-list').children[0].children[0].children[1];
assert.equal(times.children[1].textContent,'1 min 5 s');
assert.equal(ctx.validatePipelineDetails([{...ig,open_url:'https://ig.me/m/fixture'}])[0].open_url,'https://ig.me/m/fixture');
assert.throws(()=>ctx.validatePipelineDetails([{...ig,open_url:'https://ig.me/m/fixture?redirect=evil'}]));

ctx.renderWaiting([sent],1);ctx.renderWaiting([],0);assert.equal($('tinder-waiting-list').children.length,0,'A fresh empty pipeline never restores a previously sent card');

const incident={...ig,stable_chat_id:'instagram-incident:'+'d'.repeat(24),incident_id:'ig-delivery-'+'e'.repeat(24),state:'transport_blocked',pipeline_stage:'held',display_category:'technical',automatic_resolution:true,operator_actionable:false,stalled:false,open_url:undefined};
assert.equal(ctx.validatePipelineDetails([incident])[0].stable_chat_id,incident.stable_chat_id);
assert.throws(()=>ctx.validatePipelineDetails([{...incident,operator_actionable:true}]));
assert.throws(()=>ctx.validatePipelineDetails([{...incident,incident_id:'invalid'}]));
assert.throws(()=>ctx.validatePipelineDetails([{...incident,open_url:'https://evil.test/'}]));
console.log('Technical Instagram incidents cannot invalidate the complete chat projection and remain non-actionable.');
