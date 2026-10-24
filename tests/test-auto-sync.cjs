const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(__dirname+'/../dist/bridge.js','utf8');

function realFunction(name){
 const match=source.match(new RegExp(`function ${name}\\([^\\n]*\\)\\{[^\\n]*\\}\\n`));
 assert(match,`real ${name} implementation is present`);
 return match[0];
}

const start=source.indexOf('async function pollBridge()');
const end=source.indexOf('\nsetInterval(pollBridge,60000)',start);
assert(start>=0&&end>start,'real pollBridge implementation is present');
assert(!source.includes('setInterval(pollProgress'),'legacy progress-only timer is removed');

const implementation=`
const RATE_KEY='iphone-lab-github-pause-until';
${realFunction('readPause')}
${realFunction('pauseUntil')}
${source.slice(start,end)}
this.readPause=readPause;
this.pauseUntil=pauseUntil;
this.pollBridge=pollBridge;
`;

let now=1_800_000_000_000;
const stored=new Map();
const context={
 Date:{now:()=>now},Number,Math,String,Error,
 localStorage:{
  getItem:key=>stored.get(key)??null,
  setItem:(key,value)=>stored.set(key,value),
  removeItem:key=>stored.delete(key),
 },
 working:false,
 document:{visibilityState:'visible'},
 navigator:{onLine:true},
 token:'paired',
 refreshCalls:0,renderCalls:0,restoreCalls:0,decideCalls:0,messages:[],
 refresh:async()=>{context.refreshCalls++},
 render:()=>context.renderCalls++,
 restorePairing:()=>context.restoreCalls++,
 message:value=>context.messages.push(value),
 decide:()=>{context.decideCalls++;throw Error('background must never decide')},
};
vm.createContext(context);
vm.runInContext(implementation,context);

(async()=>{
 await context.pollBridge();
 assert.equal(context.refreshCalls,1,'one timer tick performs one full refresh');
 assert.equal(context.renderCalls,2,'working state renders before and after refresh');
 assert.equal(context.working,false,'successful refresh releases working state');
 assert.equal(context.decideCalls,0,'background refresh never submits decisions');

 const skipped=[
  ()=>{context.working=true},
  ()=>{context.document.visibilityState='hidden'},
  ()=>{context.navigator.onLine=false},
  ()=>{stored.set('iphone-lab-github-pause-until',String(now+60_000))},
 ];
 for(const setup of skipped){
  context.working=false;
  context.document.visibilityState='visible';
  context.navigator.onLine=true;
  stored.clear();
  setup();
  const before=context.refreshCalls;
  await context.pollBridge();
  assert.equal(context.refreshCalls,before,'guarded timer skips blocked refresh');
 }

 context.working=false;
 context.document.visibilityState='visible';
 context.navigator.onLine=true;
 stored.clear();
 context.refresh=async()=>{context.refreshCalls++;throw Error('synthetic GET failure')};
 await context.pollBridge();
 assert.equal(context.working,false,'failed refresh releases working state');
 assert.match(context.messages.at(-1),/synthetic GET failure/,'failed refresh reports its error');
 assert.equal(context.decideCalls,0,'failed background refresh never submits decisions');

 stored.set('iphone-lab-github-pause-until',String(now-1));
 assert.equal(context.readPause(),0,'expired pause is ignored');
 assert(!stored.has('iphone-lab-github-pause-until'),'expired pause is removed');

 stored.set('iphone-lab-github-pause-until',String(now+7_200_001));
 assert.equal(context.readPause(),0,'far-future pause is ignored');
 assert(!stored.has('iphone-lab-github-pause-until'),'far-future pause is removed');

 stored.set('iphone-lab-github-pause-until',String(now+30_000));
 assert.equal(context.readPause(),now+30_000,'valid pause is preserved');
 context.pauseUntil(now+99_999_999);
 assert.equal(Number(stored.get('iphone-lab-github-pause-until')),now+7_200_000,'new pause is bounded to two hours');

 console.log('Visible app behavior performs one guarded full read-only bridge refresh per minute.');
})().catch(error=>{console.error(error);process.exitCode=1});
