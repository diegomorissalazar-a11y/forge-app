
// ---------------------------------------------------------------
//  MELQART v177 — Fix integral heatmaps + nutrición histórica + recuperación
// ---------------------------------------------------------------
function mq177IsMealDoneState(x){
  if(!x) return false;
  if(x===true) return true;
  if(typeof x==='object') return !!(x.completada || x.completed || x.done || x.ok || x.checked);
  return false;
}
function mq177CompletedMealCount(fd){
  if(!fd) return 0;
  if(fd.allDone || fd.pautaManual) return (COMIDAS||[]).length;
  const directKeys=['comidasCompletadas','completedMeals','mealsDone','platosCompletados'];
  for(const k of directKeys){
    const n=parseInt(fd[k],10);
    if(Number.isFinite(n) && n>=0) return Math.min((COMIDAS||[]).length,n);
  }
  return (COMIDAS||[]).filter(c=>mq177IsMealDoneState(fd.comidas?.[c.id])).length;
}
function mq177HasAnyMealDetail(fd){
  return (COMIDAS||[]).some(c=>String(fd?.comidas?.[c.id]?.texto||'').trim().length>0);
}
function getMealProgress(fd){
  const total=(COMIDAS||[]).length||7;
  const done=mq177CompletedMealCount(fd);
  return {done,total,pct: total?Math.round(done/total*100):0};
}
function calcNutritionDayDetail(fd){
  const total=clonePortionZero();
  const details=[];
  const mealCount=mq177CompletedMealCount(fd);
  const hasDetail=mq177HasAnyMealDetail(fd);
  (COMIDAS||[]).forEach((c,idx)=>{
    const state=fd?.comidas?.[c.id];
    const doneByState=mq177IsMealDoneState(state);
    const doneByLegacyOrder=!hasDetail && idx<mealCount;
    if(doneByState || doneByLegacyOrder){
      let res;
      if(String(state?.texto||'').trim()) res=portionsForMeal(c,fd);
      else res={portions:(MEAL_PORTIONS?.[c.id]||c.portions||{}), source:'platos legacy', details:[`${c.nombre} → plato ${idx+1}/${(COMIDAS||[]).length}`]};
      sumPortionsInto(total,res.portions||{});
      details.push({type:'comida', name:c.nombre, source:res.source, portions:res.portions||{}, details:res.details||[]});
    }
  });
  (fd?.extraFoods||[]).forEach(f=>{
    sumPortionsInto(total, f.portions||{});
    details.push({type:f.quickMeal?'comida_rapida':'alimento_rapido', name:f.name, source:f.quickMeal?'comida rápida':'registro rápido', portions:f.portions||{}, details:f.calcDetail||f.details||[]});
  });
  Object.keys(total).forEach(k=>total[k]=nRound(total[k],2));
  return {portions:total, details, mealCount};
}
function calcPortionsConsumed(fd){ return calcNutritionDayDetail(fd).portions; }
function getPorcionesHoy(fd){ return calcPortionsConsumed(fd); }
function isFoodComplete(f){
  const fd=getFoodRecordSafe(f); if(!fd || !getFoodHasRecord(f)) return false;
  const p=getMealProgress(fd);
  return !!(fd.allDone || fd.pautaManual || p.done>=p.total);
}
function getProteinPctForDate(f){
  const fd=getFoodRecordSafe(f); if(!fd || !getFoodHasRecord(f)) return null;
  const calc=calcNutritionDayDetail(fd);
  const prot=parseFloat(calc.portions?.proteinas||0);
  return NUTRITION_TARGETS.proteinas ? Math.round((prot/NUTRITION_TARGETS.proteinas)*100) : 0;
}
function mq177YearElapsedDays(year){
  const todayStr=today();
  const end=todayStr.startsWith(String(year)) ? todayStr : `${year}-12-31`;
  return getYearDays(year).filter(f=>f<=end).length;
}
function renderMqYearHeatmap(opts){
  const year=opts.year||new Date().getFullYear();
  const todayStr=today();
  const start=new Date(year,0,1,12);
  const dow0=(start.getDay()+6)%7; // lunes=0
  const gridStart=new Date(year,0,1,12); gridStart.setDate(1-dow0);
  const gridEnd=new Date(year,11,31,12);
  const months=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const monthStarts=[];
  for(let m=0;m<12;m++){
    const md=new Date(year,m,1,12);
    const diff=Math.floor((md-gridStart)/86400000);
    monthStarts.push({m, col:Math.floor(diff/7)});
  }
  let cells='', ok=0, activeDays=0;
  for(let d=new Date(gridStart); d<=gridEnd; d.setDate(d.getDate()+1)){
    const f=localDateStr(d);
    const isOther=d.getFullYear()!==year, isFuture=f>todayStr;
    let level=-1, title=f;
    if(!isOther && !isFuture){
      const v=opts.valueFn(f);
      level=(v===null || typeof v==='undefined') ? -1 : v;
      if(level>0) activeDays++;
      if(level>=1) ok++;
      title=opts.tooltipFn ? opts.tooltipFn(f,level) : f;
    }
    let cls='mq-hm-cell';
    if(isOther || isFuture) cls+=' fut';
    else if(level>=2) cls+=' lvl2';
    else if(level>=1) cls+=' lvl1';
    else cls+=' empty';
    cells += `<div class="${cls}" title="${String(title).replace(/"/g,'&quot;')}"></div>`;
  }
  const elapsed=mq177YearElapsedDays(year);
  const label=opts.labelFn ? opts.labelFn(ok,elapsed,activeDays) : `${ok} de ${elapsed} días (${pct(ok,elapsed)}%)`;
  const monthHtml=monthStarts.map(x=>`<span style="grid-column:${x.col+1}">${months[x.m]}</span>`).join('');
  const daysHtml=['L','M','X','J','V','S','D'].map(x=>`<span>${x}</span>`).join('');
  return `<div class="mq-heat-card mq-heat-card-v177">
    <div class="mq-heat-head"><div><div class="mq-heat-title">${opts.title}</div><div class="mq-heat-sub">${opts.subtitle} · <strong>${label}</strong></div></div>
      <div class="mq-heat-legend mq-heat-legend-top"><span>Menos</span><span class="mq-hm-leg empty"></span><span class="mq-hm-leg lvl1"></span><span class="mq-hm-leg lvl2"></span><span>Más</span></div>
    </div>
    <div class="mq-heat-scroll">
      <div class="mq-heat-with-days"><div class="mq-heat-days-axis"><span></span>${daysHtml}</div><div><div class="mq-heat-months" style="grid-template-columns:repeat(53, var(--hm-size))">${monthHtml}</div><div class="mq-heat-grid">${cells}</div></div></div>
    </div>
  </div>`;
}
function weeklyRecoveryData(year=new Date().getFullYear()){
  const todayStr=today();
  return getWeekRangesForYear(year).map(w=>{
    const days=datesBetween(w.start,w.end).filter(f=>f<=todayStr && f.startsWith(String(year)));
    const sleepVals=days.map(getSleepMinutesForDate).filter(v=>v!==null);
    const sleepAvg=sleepVals.length ? sleepVals.reduce((a,b)=>a+b,0)/sleepVals.length : 0;
    const creat=days.filter(getCreatinaTomadaOficial).length;
    const protPcts=days.map(getProteinPctForDate).map(v=>v===null?0:Math.min(100,v));
    const protAvg=protPcts.length ? protPcts.reduce((a,b)=>a+b,0)/protPcts.length : 0;
    const waterVals=days.map(getWaterVasosForDate).map(v=>v===null?0:v);
    const waterAvg=waterVals.length ? waterVals.reduce((a,b)=>a+b,0)/waterVals.length : 0;
    const sleepScore=sleepVals.length ? Math.min(100, Math.round((sleepAvg/420)*100)) : 0;
    const creatScore=days.length ? Math.min(100, Math.round((creat/days.length)*100)) : 0;
    const protScore=Math.round(protAvg);
    const waterScore=Math.min(100, Math.round((waterAvg/(getAguaMeta().vasos||10))*100));
    const general=Math.round((sleepScore+creatScore+protScore+waterScore)/4);
    return { ...w, days:days.length, sleepAvg, sleepScore, creat, creatScore, protAvg, protScore, waterAvg, waterScore, general };
  }).filter(w=>w.days>0);
}
function renderProgRecuperacion(){
  const el=document.getElementById('prog-recuperacion-content'); if(!el) return;
  const year=new Date().getFullYear();
  const data=weeklyRecoveryData(year);
  const last=data[data.length-1]||{};
  const kpis=[
    {t:'Sueño',v:fmtHours(last.sleepAvg||0),s:'promedio semanal'},
    {t:'Creatina',v:`${last.creat||0}/${last.days||7}`,s:'días semana'},
    {t:'Proteína',v:`${Math.round(last.protAvg||0)}%`,s:'cumplimiento'},
    {t:'Agua',v:`${(last.waterAvg||0).toFixed(1)}/10`,s:'vasos promedio'},
    {t:'Cumplimiento',v:`${last.general||0}%`,s:'promedio recuperación'}
  ].map(k=>`<div class="lumen-stat mq-rec-kpi"><div class="lumen-num">${k.v}</div><div class="lumen-lbl">${k.t}</div><div class="lumen-sub">${k.s}</div></div>`).join('');
  el.innerHTML=`
    <div class="section-label" style="margin-bottom:10px">Recuperación semanal</div>
    <div class="mq-rec-kpi-row">${kpis}</div>
    ${renderRecoveryChart('Sueño promedio',data,d=>Math.round((d.sleepAvg||0)/60*100)/100,{target:7,format:(v,d)=>fmtHours((d.sleepAvg||0)),meta:'Meta: 7h promedio',tooltip:d=>fmtHours(d.sleepAvg||0)})}
    ${renderRecoveryChart('Creatina',data,d=>d.creat||0,{target:7,format:(v,d)=>`${d.creat||0}/7`,meta:'Meta: 7/7 días',tooltip:d=>`${d.creat||0} días con creatina`})}
    ${renderRecoveryChart('Proteína',data,d=>Math.round(d.protAvg||0),{target:100,format:v=>`${Math.round(v)}%`,meta:'Meta: 100% semanal',tooltip:d=>`${Math.round(d.protAvg||0)}% promedio`})}
    ${renderRecoveryChart('Agua',data,d=>Math.round((d.waterAvg||0)*10)/10,{target:10,format:v=>`${v.toFixed(1)}/10`,meta:'Meta: 10 vasos promedio',tooltip:d=>`${(d.waterAvg||0).toFixed(1)} vasos promedio`})}
    ${renderRecoveryChart('Cumplimiento general',data,d=>d.general||0,{target:100,format:v=>`${Math.round(v)}%`,meta:'Promedio simple: sueño, creatina, proteína y agua',tooltip:d=>`${d.general||0}% recuperación`})}
    <div class="section-label" style="margin:18px 0 10px">Heatmaps ${year}</div>
    ${renderMqYearHeatmap({title:'◈ Días entrenados',subtitle:'Entrenamientos diarios',year,valueFn:f=>{const n=getTrainingCountByDate()[f]||0; return n>=2?2:n===1?1:0;},tooltipFn:f=>`${f} · ${(getTrainingCountByDate()[f]||0)} entrenamiento(s)`})}
    ${renderMqYearHeatmap({title:'◈ Pauta alimenticia',subtitle:'Días con pauta completa',year,valueFn:f=>isFoodComplete(f)?1:0,tooltipFn:f=>`${f} · ${isFoodComplete(f)?'pauta completa':'pauta no completa'}`})}
    ${renderMqYearHeatmap({title:'◈ Proteína',subtitle:'Meta diaria de proteína',year,valueFn:f=>{const p=getProteinPctForDate(f); return p!==null&&p>=100?1:0;},tooltipFn:f=>`${f} · ${getProteinPctForDate(f)??0}% proteína`})}
    ${renderMqYearHeatmap({title:'◈ Agua',subtitle:'Meta diaria de agua',year,valueFn:f=>getWaterOkForDate(f)?1:0,tooltipFn:f=>`${f} · ${getWaterVasosForDate(f)??0}/10 vasos`})}
    ${renderMqYearHeatmap({title:'◈ Creatina',subtitle:'Consumo diario',year,valueFn:f=>getCreatinaTomadaOficial(f)?1:0,tooltipFn:f=>`${f} · ${getCreatinaTomadaOficial(f)?'tomada':'no tomada'}`})}`;
}
