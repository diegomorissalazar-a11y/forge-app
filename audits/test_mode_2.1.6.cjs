const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const ctx={forge:{routines:[{id:'r_martes'},{id:'other'}],sessions:[]},EJERCICIOS_BASE:[{id:'ex_remo_manc',bilateral:true}],activeSession:{routineId:'r_martes',exercises:[{exId:'ex_remo_manc',sets:[{weight:22,reps:8,done:false}]}]},getEx:id=>({id,type:id==='carry'?'dumbbell':id==='bar'?'barbell':'dumbbell',bilateral:true}),mq212IsLoadDuration:id=>id==='carry',saveDB(){},mq210PersistDraft(){ctx.persisted=true},rerenderActiveSessionExercises(){},maybeStartRestForSet(){},mq215Kg:v=>v,mq215KgText:v=>String(v)};ctx.window=ctx;
vm.createContext(ctx);vm.runInContext(src.slice(0,src.indexOf('// MELQART 2.1.5')),ctx);
for(const [name,end] of [['renderSetRow','function parseTimeStr'],['toggleLado','function toggleSet'],['toggleSet','function removeSetFromEx']]){
 const a=src.indexOf('function '+name+'('),b=src.indexOf(end,a+1);vm.runInContext(src.slice(a,b),ctx);
}
let ex=ctx.activeSession.exercises[0];assert.equal(ctx.mq216Mode(ex),'bilateral');
assert.match(ctx.renderSetRow(0,0,ex.sets[0],false),/toggleSet\(0,0\)/);
assert.ok(!ctx.renderSetRow(0,0,ex.sets[0],false).includes('toggleLado'));
ctx.toggleSet(0,0);assert.equal(ex.sets[0].done,true);
ctx.mq216SetMode(0,'unilateral');assert.equal(ex.sets[0].done,false);assert.equal(ctx.persisted,true);
assert.equal(ctx.forge.routines[0].exerciseModes.ex_remo_manc,'unilateral');
const html=ctx.renderSetRow(0,0,ex.sets[0],false);assert.match(html,/>I<\/button>/);assert.match(html,/>D<\/button>/);
ctx.toggleLado(0,0,'L');assert.equal(ex.sets[0].done,false);ctx.toggleLado(0,0,'R');assert.equal(ex.sets[0].done,true);
ctx.mq216SetMode(0,'bilateral');assert.equal(ex.sets[0].done,true);ctx.toggleSet(0,0);assert.equal(ex.sets[0].done,false);
assert.equal(ctx.mq216Mode({exId:'ex_remo_manc'},{routineId:'other'}),'unilateral');
assert.equal(ctx.mq216Mode({exId:'ex_remo_manc'},{routineId:'r_martes'}),'bilateral');
assert.equal(ctx.mq216Mode(JSON.parse(JSON.stringify(ex))),'bilateral');
assert.equal(ctx.mq216SupportsMode({exId:'carry'}),false);assert.equal(ctx.mq216SupportsMode({exId:'bar'}),false);
assert.equal(ctx.forge.sessions.length,0);
console.log('PASS: row default bilateral, actual row rendering I/D or check, both sides completion, no invented completed sides, session/routine persistence, routine isolation, carry/bar exclusions, history untouched.');
