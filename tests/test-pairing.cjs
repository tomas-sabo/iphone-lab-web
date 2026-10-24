const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(__dirname+'/../dist/bridge.js','utf8');
function block(from,to){const start=source.indexOf(from),end=source.indexOf(to,start);assert(start>=0&&end>start,`${from} implementation exists`);return source.slice(start,end)}
const implementation=`
const REPO='tomas-sabo/bridge',API='https://api.github.com/repos/'+REPO,RATE_KEY='iphone-lab-github-pause-until';
let token='',items=[],working=false,whatsappNames=[],whatsappUnassigned=[],whatsappManual=[],whatsappListStatus='',lastApiCall=0;
const $=id=>elements[id],wait=async()=>{},PAIRING_KEY='iphone-lab-bridge-pairing-v1';
function readPause(){try{const value=Number(localStorage.getItem(RATE_KEY))||0,now=Date.now();if(value<=now||value>now+7200000){localStorage.removeItem(RATE_KEY);return 0}return value}catch{return 0}}
function pauseUntil(t){try{const now=Date.now();localStorage.setItem(RATE_KEY,String(Math.max(now+1000,Math.min(Number(t)||now+60000,now+7200000))))}catch{}}
function forgetPairing(){localStorage.removeItem(PAIRING_KEY)}
function savedPairing(){return localStorage.getItem(PAIRING_KEY)||''}
function rememberPairing(){localStorage.setItem(PAIRING_KEY,token);return true}
function connected(){elements.connect.hidden=true;elements.disconnect.hidden=false}
function showAutomation(){} function resetConversations(){} function render(){renderCalls++} function message(v){messages.push(v)}
${block('async function api(', '\nfunction message(')}
${block('async function connectBridge(', "\n$('connect').onsubmit")}
this.api=api;this.connectBridge=connectBridge;this.state=()=>({token,working});
`;
function harness(response){
 let now=1_800_000_000_000;class Clock extends Date{static now(){return now}}const stored=new Map(),elements={connect:{hidden:true},disconnect:{hidden:false},'connect-button':{disabled:false}};
 const context={Date:Clock,Number,Math,String,Error,AbortSignal:{timeout:()=>null},elements,renderCalls:0,messages:[],localStorage:{getItem:k=>stored.get(k)??null,setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)},fetch:async()=>response,refresh:async()=>{},console};
 vm.createContext(context);vm.runInContext(implementation,context);return {context,stored,elements};
}
function reply(status,headers={}){return {ok:status>=200&&status<300,status,headers:{get:name=>headers[name]??null},json:async()=>({private:true,full_name:'tomas-sabo/bridge'})}}
(async()=>{
 let h=harness(reply(403));h.stored.set('iphone-lab-bridge-pairing-v1','saved');
 await assert.rejects(()=>h.context.api('',{authProbe:true}),/HTTP 403/);
 assert.equal(h.stored.get('iphone-lab-bridge-pairing-v1'),'saved','ambiguous secondary-limit 403 preserves pairing');
 assert(!h.stored.has('iphone-lab-github-pause-until'),'403 without rate evidence is not mislabeled as a primary rate limit');

 h=harness(reply(403,{'X-RateLimit-Remaining':'0','X-RateLimit-Reset':String(1_800_000_100)}));h.stored.set('iphone-lab-bridge-pairing-v1','saved');
 await assert.rejects(()=>h.context.api('',{authProbe:true}),/dočasne odmietol/);
 assert.equal(h.stored.get('iphone-lab-bridge-pairing-v1'),'saved','real rate limit preserves pairing');
 assert(Number(h.stored.get('iphone-lab-github-pause-until'))>1_800_000_000_000,'real rate limit stores bounded retry time');

 h=harness(reply(200));h.stored.set('iphone-lab-bridge-pairing-v1','saved');h.stored.set('iphone-lab-github-pause-until','1800000060000');
 await h.context.connectBridge('saved');
 assert.equal(h.context.state().token,'','failed restore releases in-memory credential');
 assert.equal(h.elements.connect.hidden,false,'failed restore keeps reconnect form visible');
 assert.equal(h.elements.disconnect.hidden,true,'failed restore does not claim an active connection');
 assert.match(h.context.messages.at(-1),/Párovanie je uložené.*dočasný limit/,'temporary failure explains preserved pairing');

 h=harness(reply(200));await h.context.connectBridge('valid');
 assert.equal(h.stored.get('iphone-lab-bridge-pairing-v1'),'valid','verified private repository pairing is saved');
 assert.equal(h.elements.connect.hidden,true,'verified pairing hides connect form');
 assert.equal(h.elements.disconnect.hidden,false,'verified pairing offers disconnect');
 console.log('Pairing preserves ambiguous 403 failures, records proven rate limits, and never claims a failed restore is connected.');
})().catch(error=>{console.error(error);process.exitCode=1});
