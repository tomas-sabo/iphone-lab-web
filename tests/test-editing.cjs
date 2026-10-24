const fs=require('fs'),vm=require('vm'),assert=require('assert');
(async()=>{
 const nodes={update:{},status:{},version:{}},events={},listeners={};let reloads=0;
 const registration={waiting:null,addEventListener(){}};
 const ctx={document:{getElementById:id=>nodes[id],addEventListener:(k,f)=>events[k]=f},navigator:{onLine:true,serviceWorker:{controller:{},register:async()=>registration,addEventListener:(k,f)=>listeners[k]=f}},window:{addEventListener(){}},location:{reload:()=>reloads++}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/../dist/app.js','utf8'),ctx);await Promise.resolve();await Promise.resolve();
 listeners.controllerchange();assert.equal(reloads,0,'Background controller replacement must not reload an editor');
 registration.waiting={postMessage:()=>{}};await nodes.update.onclick();assert.equal(reloads,0);
 listeners.controllerchange();assert.equal(reloads,1,'Explicit engine update must reload even after click handler finished');
 console.log('Editing: background engine update does not reload; explicit update still activates.');
})().catch(e=>{console.error(e);process.exitCode=1});
