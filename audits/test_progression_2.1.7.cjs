const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const ctx={forge:{sessions:[],routines:[],exercises:[]},BUILD:{recommendationSchema:1},today:()=> '2026-10-26',localDateStr:t=>new Date(t).toISOString().slice(0,10),parseTimeStr:s=>({h:0,m:0,s:0}),fmtTimeStr:s=>String(s),console};ctx.window=ctx;ctx.getEx=id=>({id,name:id,type:'barbell'});vm.createContext(ctx);
vm.runInContext(src.slice(0,src.indexOf('// MELQART 2.1.2')),ctx);
vm.runInContext(src.slice(src.indexOf('  const ALIASES = Object.freeze',src.indexOf('// MELQART 2.1.0')),src.indexOf('  function decorateRecommendationButtons(){')),ctx);
const routine={id:'r',cycle:2,exercises:['ex_press_banca'],exercisePlan:{ex_press_banca:{sets:3,reps:'6–8'}}};
function history(reps,rir=2,weight=70,dates=['2026-10-19','2026-10-23']){ctx.forge.sessions=dates.map((d,i)=>({id:d,routineId:'r',date:Date.parse(d+'T12:00:00Z'),exercises:[{exId:'ex_press_banca',sets:reps.map(r=>({weight,reps:r,done:true,...(rir==null?{}:{rir})}))}]}));}
history([8,8,8]);let x=ctx.mq210EvaluateExercise('ex_press_banca',routine);assert.equal(x.targetLoad,75);assert.equal(x.decision,'increase_load');
history([8,8,8],null);assert.equal(ctx.mq210EvaluateExercise('ex_press_banca',routine).targetLoad,70);assert.equal(ctx.mq210EvaluateExercise('ex_press_banca',routine).decision,'maintain');
history([8,7,6]);x=ctx.mq210EvaluateExercise('ex_press_banca',routine);assert.deepEqual(Array.from(x.targetRepsBySet),[8,8,6]);assert.equal(x.targetLoad,70);
history([8,8,8],1);assert.equal(ctx.mq210EvaluateExercise('ex_press_banca',routine).decision,'maintain');
history([8,8,8],2,30);assert.equal(ctx.mq210EvaluateExercise('ex_press_banca',routine).targetLoad,30);
history([8,8,8],2,70,['2026-09-01','2026-10-23']);assert.equal(ctx.mq210EvaluateExercise('ex_press_banca',routine).decision,'reentry');
history([8,8,8]);ctx.forge.sessions[1].exercises[0].sets[2].done=false;assert.equal(ctx.mq210EvaluateExercise('ex_press_banca',routine).targetLoad,70);
history([8,8,8]);const frozen=JSON.stringify(ctx.forge.sessions);ctx.forge.routines=[routine];let nodes=new Map();ctx.document={getElementById:id=>nodes.get(id),createElement:()=>({addEventListener(){}}),body:{appendChild:n=>nodes.set(n.id,n)}};
ctx.mq210OpenRoutineRecommendation('r');const preview=JSON.stringify(ctx.mq217Preview);ctx.forge.sessions=[];
ctx._doIniciarRutina=id=>{ctx.activeSession={exercises:[{exId:'ex_press_banca',sets:[{}]}]};ctx.mq217Apply(ctx.mq217Starting||ctx.mq210EvaluateRoutine(id));};ctx.mq210PersistDraft=()=>{};ctx.renderTrain=()=>{};ctx.showToast=()=>{};
ctx.mq210StartRecommended('r');assert.equal(ctx.activeSession.exercises[0].sets[0].weight,75);assert.ok(ctx.activeSession.exercises[0].sets.every(s=>s.done===false&&s.rir==null));assert.equal(JSON.stringify(ctx.activeSession.recommendation),preview);
// The ordinary start uses the same prescription application hook, not weekly percent growth.
const start=src.slice(src.indexOf('function _doIniciarRutina('),src.indexOf('function startFreeSession('));assert.match(start,/mq217Apply\(window.mq217Starting\|\|window.mq210EvaluateRoutine/);
const week=src.slice(src.indexOf('function getCargasSemana('),src.indexOf('function crearPlan('));assert.ok(!week.includes('1.025'));assert.match(week,/mq210EvaluateRoutine/);
console.log('PASS: two complete RIR2 exposures, one total rep, missing/low RIR hold, large jump hold, gap reentry, incomplete sets, frozen preview equals prescription, normal-start hook, no weekly percentage.');

// User regression: 65x5 progresses in reps before any load increase.
history([5,5,5],2,65);x=ctx.mq210EvaluateExercise('ex_press_banca',routine);assert.equal(x.targetLoad,65);assert.deepEqual(Array.from(x.targetRepsBySet),[6,5,5]);
history([7,7,7],2,65);x=ctx.mq210EvaluateExercise('ex_press_banca',routine);assert.equal(x.targetLoad,65);assert.deepEqual(Array.from(x.targetRepsBySet),[8,7,7]);
history([8,8,8],2,65);x=ctx.mq210EvaluateExercise('ex_press_banca',routine);assert.equal(x.targetLoad,70);assert.deepEqual(Array.from(x.targetRepsBySet),[5,5,5]);
console.log('PASS user example: 65kg 5/5/5 -> 6/5/5; 7/7/7 -> 8/7/7; two 8/8/8 RIR2 -> 70kg 5/5/5.');
