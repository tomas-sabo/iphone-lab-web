const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(__dirname+'/../dist/bridge.js','utf8');
const start=source.indexOf('async function refresh(){'),end=source.indexOf('async function refreshContents(){',start);
assert(start>=0&&end>start);
let controller;
const ctx={AbortController,Error,clearTimeout,setTimeout,REFRESH_TIMEOUT_MS:10,refreshController:null,
 refreshContents:async()=>{controller=ctx.refreshController;await new Promise((resolve,reject)=>controller.signal.addEventListener('abort',()=>reject(Error('aborted'))));}};
vm.createContext(ctx);vm.runInContext(source.slice(start,end)+'this.refresh=refresh;',ctx);
(async()=>{
 await assert.rejects(()=>ctx.refresh(),/príliš dlho/);
 assert(controller.signal.aborted);assert.equal(ctx.refreshController,null,'deadline releases controller');
 ctx.refreshContents=async()=>42;assert.equal(await ctx.refresh(),42);assert.equal(ctx.refreshController,null);
 const body=source.slice(end,source.indexOf('async function decide(',end));
 assert(body.indexOf('await loadProgress()')<body.indexOf('await requestStatus()'),'automation status loads before request queue');
 assert(source.includes('showAutomation(null);render();restorePairing();'),'unpaired startup cannot leave loading label');
 console.log('Refresh deadline, recovery, progress priority and initial state passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
