const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const ctx={forge:{sessions:[],exercises:[],routines:[]},today:()=> '2026-10-22',localDateStr:t=>{const d=new Date(t);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')},saveDB(){},renderAll(){},console:{info(){}}};
ctx.window=ctx;vm.createContext(ctx);
vm.runInContext(src.slice(src.indexOf('function mq213NormalizeRunJson'),src.indexOf('// MELQART v194')),ctx);
const fixture={fecha:'2026-10-22',hora:'08:00',tipo:'Trote',nombre:'Carrera / Trote',distancia_km:4.4,tiempo:'00:25:13',duracion_segundos:1513,ritmo_promedio:'05:44',frecuencia_cardiaca_media:161,calorias_activas:477,pasos:3787,elevacion_media_m:610.2,elevacion_maxima_m:627.3,observaciones:'Distancia original GPS de 204,7 km descartada por error. Distancia reconstruida: 4,4 km.'};
let s=ctx.importRunJson(JSON.stringify(fixture));
assert.equal(s.importedRun.distanceKm,4.4);assert.equal(s.elapsed,1513);assert.equal(s.exercises[0].sets[0].time,'25:13');
assert.equal(s.importedRun.avgPaceCalculated,'5:44');assert.equal(s.importedRun.avgPaceReported,'05:44');
assert.equal(s.fcMedia,161);assert.equal(s.kcal,477);assert.equal(s.pasos,3787);assert.equal(s.importedRun.notes,fixture.observaciones);
assert.equal(s.importedRun.elevationAvgM,610.2);assert.equal(s.exercises[0].sets[0].elevationMaxM,627.3);
assert.equal(ctx.localDateStr(s.date),'2026-10-22');
ctx.importRunJson(fixture);assert.equal(ctx.forge.sessions.length,1);
for(const field of ['tiempo','duration','timeTotal','elapsed']){
 const v=ctx.mq213NormalizeRunJson({distancia_km:'4,4',[field]:'25:13'});
 assert.equal(v.distanceKm,4.4);assert.equal(v.duration,1513);
}
for(const field of ['durationSeconds','duracion_segundos']) assert.equal(ctx.mq213NormalizeRunJson({distanceKm:4.4,[field]:'1513'}).duration,1513);
assert.equal(ctx.mq213NormalizeRunJson({distanceKm:4.4,duration:1513}).duration,1513);
assert.equal(ctx.mq213NormalizeRunJson({distanceKm:4.4,duration:'00:25:13'}).duration,1513);
assert.equal(ctx.mq213NormalizeRunJson({distanceKm:4.4,duracion_segundos:1513,tiempo:'00:26:00'}).duration,1513);
const english={date:'2026-10-23',time:'08:02',distanceKm:10.35,duration:'01:22:44',avgHeartRate:140,steps:12263,notes:'legacy',splits:[{km:1,pace:'7:49'},{km:2,pace:'8:04'}]};
s=ctx.importRunJson(english);assert.equal(s.elapsed,4964);assert.equal(s.importedRun.distanceKm,10.35);assert.equal(s.importedRun.splits.length,2);assert.equal(s.exercises[0].sets[0].durationHHMMSS,'01:22:44');
for(const bad of [null,[],{},'{broken',{distanceKm:-1,duration:2},{distanceKm:Infinity,duration:2},{distanceKm:0,duration:2},{distanceKm:'4x',duration:2},{distanceKm:4,duration:0},{distanceKm:4,duration:-1},{distanceKm:4,duration:'00:60:00'},{distanceKm:4,duration:'25:99'},{distanceKm:4,duration:'abc'},{distanceKm:4,duration:Infinity}]){
 const before=JSON.stringify(ctx.forge);assert.throws(()=>ctx.importRunJson(bad));assert.equal(JSON.stringify(ctx.forge),before);
}
assert.equal(ctx.importRunJson,ctx.importRunJson193);assert.equal(ctx.importRunJson,ctx.importRunJson188);assert.equal(ctx.importRunJson,ctx.mq184RunJsonToSession);
console.log('PASS: screenshot fixture, ES/EN, numeric seconds, HH:MM:SS/MM:SS, comma decimal, metadata, splits, same-date update, invalid inputs without mutation, importer aliases.');
