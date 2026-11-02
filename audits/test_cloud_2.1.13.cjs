const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');let uploaded,saved=0,succeeded=0;
function rejectUndefined(v){if(v===undefined)throw new Error('Unsupported field value: undefined');if(v&&typeof v==='object')Object.values(v).forEach(rejectUndefined);}
const ref={collection(){return this},doc(){return this},async set(v){rejectUndefined(v);uploaded=v;}};
const ctx={currentUser:{uid:'test'},db:ref,firebase:{auth:()=>({currentUser:{uid:'test'}}),firestore:()=>ref},setSyncDot:s=>{if(s==='ok')succeeded++},setLastSync(){},saveDB(){saved++},refreshUmSyncInfo(){},showToast(){},confirm:()=>true,console};ctx.window=ctx;vm.createContext(ctx);
vm.runInContext(src.slice(0,src.indexOf('// Explicit execution mode')),ctx);
for(const [name,end] of [['async function doGuardarNube','// Alias para compatibilidad'],['async function syncHaciaFirebase','function limpiarRutinasLocal']]){const a=src.indexOf(name);vm.runInContext(src.slice(a,src.indexOf(end,a)),ctx);}
vm.runInContext("forge={photos:['local-photo'],sessions:[{id:'s',foto:'local-session-photo',recommendation:{items:[{targetRepsBySet:undefined,history:[{load:65,reps:[8,8,8]}]}]},exercises:[{sets:[{done:true,weight:0,externalLoadKg:-27,rir:2}],prescription:{durationRangeSeconds:undefined,progressionScore:undefined,targetLoad:65,targetReps:8,targetSets:3}}]}],array:[undefined,0,false,null]}",ctx);
assert.throws(()=>rejectUndefined(ctx.forge));
(async()=>{
 await ctx.doGuardarNube();assert.equal(succeeded,1);assert.equal(saved,1);assert.ok(!('photos' in uploaded));assert.ok(!('foto' in uploaded.sessions[0]));
 assert.equal(uploaded.sessions[0].exercises[0].prescription.targetLoad,65);assert.equal(uploaded.sessions[0].exercises[0].sets[0].externalLoadKg,-27);assert.equal(uploaded.array[0],null);assert.equal(uploaded.array[1],0);assert.equal(uploaded.array[2],false);
 assert.ok('durationRangeSeconds' in ctx.forge.sessions[0].exercises[0].prescription);assert.equal(ctx.forge.photos[0],'local-photo');assert.equal(ctx.forge.sessions[0].foto,'local-session-photo');
 await ctx.syncHaciaFirebase();rejectUndefined(uploaded);assert.equal(uploaded.photos[0],'local-photo');
 vm.runInContext("cyclic={};cyclic.self=cyclic",ctx);assert.throws(()=>ctx.mq2113CloudData(ctx.cyclic),/circular/);
 assert.throws(()=>vm.runInContext('mq2113CloudData({x:[[1]]})',ctx),/anidada/);
 // Failure must not mark sync successful.
 const old=succeeded;ref.set=async()=>{throw new Error('permission-denied')};await ctx.doGuardarNube();assert.equal(succeeded,old);
 console.log('PASS both upload paths: undefined prescription reproduced/repaired, nested snapshots, array positions, zero/false, photos policy preserved, local data unchanged, invalid cycles/nested arrays rejected, failed writes do not mark synced.');
})().catch(e=>{console.error(e);process.exitCode=1});
