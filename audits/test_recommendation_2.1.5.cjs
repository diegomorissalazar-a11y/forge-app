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
vm.runInContext(src.slice(0,src.indexOf("// MELQART 2.1.2")),ctx);
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
const bench=rec.items.find(x=>x.exerciseId==='ex_press_banca');assert.equal(bench.decision,'increase_load');assert.equal(bench.targetLoad,75);assert.equal(bench.targetSets,3);
const pull=rec.items.find(x=>x.exerciseId==='ex_dominadas');assert.equal(pull.targetLoad,-20);assert.equal(pull.history.length,2);
const carry=rec.items.find(x=>x.exerciseId==='ex_farmer_carry');assert.equal(carry.targetDurationSeconds,30);assert.equal(carry.targetReps,null);
ctx.mq210OpenRoutineRecommendation('test');assert.match(nodes.get('mq210-rec-modal').innerHTML,/Iniciar con recomendación/);assert.match(nodes.get('mq210-rec-modal').innerHTML,/75 kg/);
ctx.mq210StartRecommended('test');assert.equal(ctx.persisted,true);
for(const ex of ctx.activeSession.exercises){assert.equal(ex.sets.length,3);assert.ok(ex.sets.every(s=>s.done===false));}
assert.equal(ctx.activeSession.exercises[0].sets[0].weight,75);
assert.equal(ctx.activeSession.exercises[1].sets[0].externalLoadKg,-20);
const carrySet=ctx.activeSession.exercises[3].sets[0];assert.equal(carrySet.durationSeconds,30);assert.equal(carrySet.weight,24);assert.ok(!('reps' in carrySet));
assert.equal(JSON.stringify(ctx.forge.sessions),before);
ctx.forge.sessions=[];assert.equal(ctx.mq210EvaluateRoutine('test').items[0].status,'SIN_DATOS');
ctx.forge.sessions=[session('2026-09-01','ex_press_banca',sets({weight:70,reps:8}))];assert.equal(ctx.mq210EvaluateExercise('ex_press_banca',ctx.forge.routines[0]).decision,'reentry');
console.log('PASS: historical exposure, canonical aliases, normal strength, external loads, carry duration, recommendation modal, start/sets prescription, no history mutation, no data, reentry.');
assert.equal(ctx.mq215Kg(83.90000000000002),83.9);
assert.equal(ctx.mq215Kg('63,15'),63.2);
assert.equal(ctx.mq215Kg(-27.15),-27.2);
assert.equal(ctx.mq215KgText(63.100000000001),'63,1');
assert.equal(ctx.mq215Seconds(30.7),31);
for(const [id,last,next] of [['ex_press_banca',83.9,88.9],['ex_sentadilla',96.3,101.3],['ex_peso_muerto',96.1,101.1],['ex_press_hombros',40,45],['ex_elev_lateral',8,9],['ex_elev_lateral',9,10],['ex_elev_lateral',10,12],['ex_press_incl_manc',12,14],['ex_press_incl_manc',38,40],['ex_press_incl_manc',40,null]]){
 const upper=ctx.MELQART_TAXONOMY[id].repRange[1];
 ctx.forge.exercises=[{id,name:id,type:'weight'}];
 ctx.forge.routines=[{id:'test',name:'Test',exercises:[id],exercisePlan:{[id]:{sets:3}}}];
 ctx.forge.sessions=['2026-10-19','2026-10-23'].map(d=>session(d,id,sets({weight:last,reps:upper})));
 const old=JSON.stringify(ctx.forge.sessions);
 const item=ctx.mq210EvaluateRoutine('test').items[0];
 assert.equal(item.targetLoad,next,id+' must use the real next load');
 ctx.mq210OpenRoutineRecommendation('test');
 assert.ok(!nodes.get('mq210-rec-modal').innerHTML.includes('900000000'));
 ctx.mq210StartRecommended('test');
 if(next!==null)assert.equal(ctx.activeSession.exercises[0].sets[0].weight,next);
 assert.equal(JSON.stringify(ctx.forge.sessions),old);
}
// Raw float noise is rounded when reading, never rewritten into history.
ctx.forge.exercises=[{id:'ex_farmer_carry',name:'Farmer Carry',type:'weight'}];
ctx.forge.sessions=[session('2026-10-23','ex_farmer_carry',sets({weight:24.10000000000001,durationSeconds:30.7}))];
const rawHistory=JSON.stringify(ctx.forge.sessions);
const carryRec=ctx.mq210EvaluateExercise('ex_farmer_carry');assert.equal(carryRec.targetLoad,24.1);assert.equal(carryRec.targetDurationSeconds,31);assert.equal(carryRec.targetReps,null);
assert.equal(JSON.stringify(ctx.forge.sessions),rawHistory);
// Exercise input handlers share the same precision in active and saved sessions.
ctx.normDec=v=>String(v).replace(',','.');
for(const name of ['updateSet','updateEditSet','updateCarryDuration','fmtTimeStr']){
 const begin=src.indexOf('function '+name+'(');const end=src.indexOf('\n}',begin)+2;
 vm.runInContext(src.slice(begin,end),ctx);
}
ctx.activeSession={exercises:[{exId:'ex_farmer_carry',sets:[{}]}]};
ctx.updateSet(0,0,'weight','83,900000000001');assert.equal(ctx.activeSession.exercises[0].sets[0].weight,83.9);
ctx.updateCarryDuration(0,0,'30,7');assert.equal(ctx.activeSession.exercises[0].sets[0].durationSeconds,31);assert.equal(ctx.activeSession.exercises[0].sets[0].time,'00:31');
ctx.forge.sessions=[session('2026-10-23','ex_farmer_carry',[{}])];
ctx.updateEditSet(ctx.forge.sessions[0].id,0,0,'weight','63,15');assert.equal(ctx.forge.sessions[0].exercises[0].sets[0].weight,63.2);
assert.equal(ctx.fmtTimeStr(61.9),'01:02');
console.log('PASS: one-decimal kg, Spanish comma, integer seconds, bar offsets +5, dumbbell boundaries 8/9/10/12/38/40, no invented load above 40, carry precision, active/saved inputs, history unchanged.');
