const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),path=require('path');
const src=fs.readFileSync(process.argv[2]||path.join(__dirname,'../app.js'),'utf8');
const nodes=new Map();
const ctx={forge:{sessions:[],exercises:[],routines:[]},BUILD:{recommendationSchema:1},activeSession:null,
 today:()=> '2026-10-26',localDateStr:t=>new Date(t).toISOString().slice(0,10),
 parseTimeStr:s=>{const p=s.split(':').map(Number);return {h:0,m:p.length>1?p[0]:0,s:p.at(-1)||0}},fmtTimeStr:s=>`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`,
 document:{getElementById:id=>nodes.get(id),createElement:()=>({addEventListener(){},remove(){nodes.delete(this.id)}}),body:{appendChild:n=>nodes.set(n.id,n)}},
 saveDB(){},renderTrain(){},showToast(){},mq210PersistDraft(){ctx.persisted=true;}
};
ctx.window=ctx;ctx.getEx=id=>ctx.forge.exercises.find(e=>e.id===id);
ctx._doIniciarRutina=rid=>{const r=ctx.forge.routines.find(x=>x.id===rid);ctx.activeSession={exercises:r.exercises.map(exId=>({exId,sets:[{weight:0,reps:0,done:false}]}))};};
vm.createContext(ctx);
vm.runInContext(src.slice(src.indexOf('  const ALIASES = Object.freeze',src.indexOf('// MELQART 2.1.0')),src.indexOf('  function decorateRecommendationButtons(){')),ctx);
const exs=['ex_press_banca','ex_dominadas','ex_fondos','ex_farmer_carry'];
ctx.forge.exercises=exs.map(id=>({id,name:id,type:'weight'}));
ctx.forge.routines=[{id:'test',name:'Test',exercises:exs,exercisePlan:Object.fromEntries(exs.map(id=>[id,{sets:3}]))}];
function session(date,exId,sets){return {id:date+exId,date:Date.parse(date+'T12:00:00Z'),exercises:[{exId,sets}]};}
function sets(extra){return Array.from({length:3},()=>({done:true,...extra}));}
for(const date of ['2026-10-19','2026-10-23'])ctx.forge.sessions.push(
 session(date,'ex_press_banca',sets({weight:70,reps:8})),
 session(date,'ex_dominadas_asist',sets({externalLoadKg:-20,reps:7})),
 session(date,'ex_fondos_asist',sets({externalLoadKg:0,reps:7})),
 session(date,'ex_farmer_carry',sets({weight:24,durationSeconds:30}))
);
const before=JSON.stringify(ctx.forge.sessions);
const rec=ctx.mq210EvaluateRoutine('test');assert.equal(rec.items.length,4);
const bench=rec.items.find(x=>x.exerciseId==='ex_press_banca');assert.equal(bench.decision,'increase_load');assert.equal(bench.targetLoad,72.5);assert.equal(bench.targetSets,3);
const pull=rec.items.find(x=>x.exerciseId==='ex_dominadas');assert.equal(pull.targetLoad,-20);assert.equal(pull.history.length,2);
const carry=rec.items.find(x=>x.exerciseId==='ex_farmer_carry');assert.equal(carry.targetDurationSeconds,30);assert.equal(carry.targetReps,null);
ctx.mq210OpenRoutineRecommendation('test');assert.match(nodes.get('mq210-rec-modal').innerHTML,/Iniciar con recomendación/);assert.match(nodes.get('mq210-rec-modal').innerHTML,/72.5 kg/);
ctx.mq210StartRecommended('test');assert.equal(ctx.persisted,true);
for(const ex of ctx.activeSession.exercises){assert.equal(ex.sets.length,3);assert.ok(ex.sets.every(s=>s.done===false));}
assert.equal(ctx.activeSession.exercises[0].sets[0].weight,72.5);
assert.equal(ctx.activeSession.exercises[1].sets[0].externalLoadKg,-20);
const carrySet=ctx.activeSession.exercises[3].sets[0];assert.equal(carrySet.durationSeconds,30);assert.equal(carrySet.weight,24);assert.ok(!('reps' in carrySet));
assert.equal(JSON.stringify(ctx.forge.sessions),before);
ctx.forge.sessions=[];assert.equal(ctx.mq210EvaluateRoutine('test').items[0].status,'SIN_DATOS');
ctx.forge.sessions=[session('2026-09-01','ex_press_banca',sets({weight:70,reps:8}))];assert.equal(ctx.mq210EvaluateExercise('ex_press_banca',ctx.forge.routines[0]).decision,'reentry');
console.log('PASS: historical exposure, canonical aliases, normal strength, external loads, carry duration, recommendation modal, start/sets prescription, no history mutation, no data, reentry.');
