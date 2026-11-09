const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(__dirname+'/../dist/bridge.js','utf8');
function block(from,to){return source.slice(source.indexOf(from),source.indexOf(to,source.indexOf(from)))}
const stored=new Map([['iphone-lab-bridge-pairing-v1','original-private-token']]);
const nodes={connect:{},disconnect:{},'connect-button':{}};
const requests=[];
const context={URL,Date,Error,TypeError,AbortSignal,structuredClone,
 localStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)},
 fetch:async(url,options)=>{requests.push({url,options});return {ok:true,status:200,json:async()=>({private:true,full_name:'tomas-sabo/bridge',transport:'vpn'})}},
 refresh:async()=>{},render(){},message(){},console};
vm.createContext(context);
vm.runInContext(`const VPN_BASE='https://tomass-macbook-pro.tail0f292f.ts.net',REPO='tomas-sabo/bridge',PAIRING_KEY='iphone-lab-bridge-pairing-v1',VPN_PAIRING_KEY='iphone-lab-vpn-pairing-v1';
let token='',working=false,vpnSnapshot=null,refreshController=null;const $=id=>nodes[id];`,Object.assign(context,{nodes}));
for(const name of ['savedPairing','rememberPairing','connected']){const match=source.match(new RegExp(`function ${name}\\([^\\n]*\\)\\{[^\\n]*\\}\\n`));vm.runInContext(match[0],context)}
vm.runInContext(block('async function vpnFetch(', '\nfunction message(')+block('async function connectBridge(',"\n$('connect').onsubmit"),context);
(async()=>{
 await vm.runInContext('connectBridge(savedPairing())',context);
 assert.equal(stored.get('iphone-lab-bridge-pairing-v1'),'original-private-token');
 assert.equal(stored.get('iphone-lab-vpn-pairing-v1'),'on');
 assert.equal(nodes.connect.hidden,true);
 assert.equal(requests.length,1);
 assert(requests[0].url.startsWith('https://tomass-macbook-pro.tail0f292f.ts.net/api'));
 assert.equal(requests[0].options.headers.Authorization,undefined);
 assert.equal(requests[0].options.credentials,'omit');
 assert.equal(requests[0].options.redirect,'error');
 assert.equal(requests[0].options.headers['X-Dashboard-Client'],'1');
 context.fetch=async()=>({ok:false,status:401});
 await assert.rejects(vm.runInContext("api('/contents/operator/test.json')",context),/VPN/);
 assert.equal(stored.get('iphone-lab-bridge-pairing-v1'),'original-private-token');
 context.fetch=async()=>{throw Error('Snapshot should avoid per-file network')};
 vm.runInContext("vpnSnapshot={files:{'operator/a.json':{sha:'abc',content:'e30='}},directories:{}}",context);
 assert.equal((await vm.runInContext("api('/contents/operator/a.json?ref=main')",context)).sha,'abc');
 console.log('VPN pairing preserves existing credentials, uses fixed HTTPS identity endpoint without tokens and serves atomic snapshot reads.');
})().catch(e=>{console.error(e);process.exitCode=1});
