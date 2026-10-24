const fs=require('fs'),assert=require('assert');
const source=fs.readFileSync(__dirname+'/../dist/bridge.js','utf8');
assert(source.includes("if(data.schema_version!==1||!Array.isArray(data.inactive_ids)"),'request status is strictly validated');
assert(!source.includes("catch{}return new Set()"),'request-status failure may not expose all historical requests');
assert(source.includes("catch(e){items=[];render();message('Aktívne dotazy sa nepodarilo bezpečne overiť."),'refresh clears stale cards when active status cannot be verified');
console.log('Operator requests fail closed when request-status is missing or invalid.');
