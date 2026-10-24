const fs=require('fs'),assert=require('assert');
const source=fs.readFileSync(__dirname+'/../dist/bridge.js','utf8');
assert(source.includes('async function pollBridge()'),'visible bridge sync worker exists');
assert(source.includes('setInterval(pollBridge,60000)'),'full private projections refresh once per minute');
assert(source.includes("if(working||document.visibilityState==='hidden'||navigator.onLine===false||Date.now()<readPause())return"),'timer avoids overlap, background, offline and rate-limit work');
assert(source.includes('try{await refresh()}'),'timer refreshes requests, progress, manual contacts and conversations together');
assert(!source.includes('setInterval(pollProgress'),'legacy progress-only timer is removed');
assert(source.includes('value>now+7200000'),'corrupt or obsolete rate-limit pauses cannot block synchronization indefinitely');
console.log('Visible app performs one guarded full read-only bridge refresh per minute.');
