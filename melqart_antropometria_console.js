/* MELQART v175 — carga histórica antropométrica completa por consola
   Pegar este script completo en la consola del navegador con Melqart abierto.
   Regla: una fecha = un registro. Si ya existe, se fusiona y se corrige con la fuente oficial. */
(() => {
  const REGISTROS_ANTROPOMETRICOS = [
    {date:'2024-01-06', edad:32.0, peso:103.9, estatura:188, grasaPct:32.0, grasaKg:33.2, muscularPct:30.5, muscularKg:31.7, imc:29.4, ratioCinturaCadera:0.9, suma6Pliegues:200, suma8Pliegues:264,
      pliegues:{p6:200,p8:264,triceps:38,subescapular:29,supraespinal:31,abdominal:50,muslo:30,pantorrilla:22,biceps:14,crestaIliaca:50},
      perimetros:{brazoRelajado:32.6,brazoFlexTension:25.9,cinturaMinima:84.0,caderaMaxima:110.3,musloMedial:50.2,pantorrillaMaxima:41.7},
      somatotipo:{endo:7.8,meso:4.7,ecto:0.9}, anthropometry:true, source:'reporte_antropometrico_oficial'},
    {date:'2024-02-03', edad:32.1, peso:103.2, estatura:188, grasaPct:29.4, grasaKg:30.4, muscularPct:33.4, muscularKg:34.5, imc:29.2, ratioCinturaCadera:0.9, suma6Pliegues:169, suma8Pliegues:220,
      pliegues:{p6:169,p8:220,triceps:26,subescapular:27,supraespinal:23,abdominal:50,muslo:24,pantorrilla:19,biceps:11,crestaIliaca:40},
      perimetros:{brazoRelajado:32.5,brazoFlexTension:28.7,cinturaMinima:84.1,caderaMaxima:110.5,musloMedial:51.8,pantorrillaMaxima:41.7},
      somatotipo:{endo:6.5,meso:4.8,ecto:0.9}, anthropometry:true, source:'reporte_antropometrico_oficial'},
    {date:'2024-04-06', edad:32.2, peso:102.2, estatura:188, grasaPct:28.6, grasaKg:29.2, muscularPct:35.1, muscularKg:35.9, imc:28.9, ratioCinturaCadera:0.9, suma6Pliegues:146.5, suma8Pliegues:194.5,
      pliegues:{p6:146.5,p8:194.5,triceps:25,subescapular:23, supraespinal:16,abdominal:45,muslo:20,pantorrilla:16.5,biceps:9,crestaIliaca:39},
      perimetros:{brazoRelajado:33.6,brazoFlexTension:29.6,cinturaMinima:84.8,caderaMaxima:108.7,musloMedial:52.7,pantorrillaMaxima:42.0},
      somatotipo:{endo:5.7,meso:5.0,ecto:1.0}, anthropometry:true, source:'reporte_antropometrico_oficial'},
    {date:'2024-06-01', edad:32.4, peso:104.3, estatura:188, grasaPct:30.7, grasaKg:32.1, muscularPct:32.5, muscularKg:33.9, imc:29.5, ratioCinturaCadera:0.9, suma6Pliegues:167, suma8Pliegues:224,
      pliegues:{p6:167,p8:224,triceps:30,subescapular:28,supraespinal:20,abdominal:46,muslo:22,pantorrilla:17,biceps:11,crestaIliaca:46},
      perimetros:{brazoRelajado:32.8,brazoFlexTension:28.1,cinturaMinima:84.8,caderaMaxima:109.6,musloMedial:51.6,pantorrillaMaxima:42.0},
      somatotipo:{endo:6.8,meso:4.9,ecto:0.9}, anthropometry:true, source:'reporte_antropometrico_oficial'},
    {date:'2024-08-03', edad:32.6, peso:104.5, estatura:188, grasaPct:29.6, grasaKg:31.0, muscularPct:34.0, muscularKg:35.5, imc:29.6, ratioCinturaCadera:0.9, suma6Pliegues:152, suma8Pliegues:206,
      pliegues:{p6:152,p8:206,triceps:24,subescapular:25,supraespinal:20,abdominal:43,muslo:18,pantorrilla:16,biceps:11,crestaIliaca:43},
      perimetros:{brazoRelajado:33.2,brazoFlexTension:29.1,cinturaMinima:86.5,caderaMaxima:111.0,musloMedial:52.5,pantorrillaMaxima:41.8},
      somatotipo:{endo:6.2,meso:5.0,ecto:0.9}, anthropometry:true, source:'reporte_antropometrico_oficial'},
    {date:'2024-10-19', edad:32.8, peso:100.3, estatura:188, grasaPct:28.7, grasaKg:28.8, muscularPct:36.7, muscularKg:36.8, imc:28.4, ratioCinturaCadera:0.9, suma6Pliegues:140, suma8Pliegues:189,
      pliegues:{p6:140,p8:189,triceps:23,subescapular:25,supraespinal:18,abdominal:43,muslo:18,pantorrilla:13,biceps:9,crestaIliaca:40},
      perimetros:{brazoRelajado:33.7,brazoFlexTension:29.8,cinturaMinima:82.9,caderaMaxima:107.0,musloMedial:53.0,pantorrillaMaxima:41.4},
      somatotipo:{endo:5.8,meso:4.9,ecto:1.1}, anthropometry:true, source:'reporte_antropometrico_oficial'},
    {date:'2024-12-21', edad:33.0, peso:99.0, estatura:188, grasaPct:28.3, grasaKg:28.0, muscularPct:37.1, muscularKg:36.7, imc:28.0, ratioCinturaCadera:0.9, suma6Pliegues:140, suma8Pliegues:186,
      pliegues:{p6:140,p8:186,triceps:22,subescapular:25,supraespinal:18,abdominal:43,muslo:18,pantorrilla:13,biceps:9,crestaIliaca:37},
      perimetros:{brazoRelajado:33.7,brazoFlexTension:30.0,cinturaMinima:84.2,caderaMaxima:107.0,musloMedial:52.3,pantorrillaMaxima:41.5},
      somatotipo:{endo:5.8,meso:5.0,ecto:1.2}, anthropometry:true, source:'reporte_antropometrico_oficial'},
    {date:'2025-03-01', edad:33.1, peso:100.0, estatura:188, grasaPct:29.0, grasaKg:29.0, muscularPct:36.4, muscularKg:36.4, imc:28.3, ratioCinturaCadera:0.9, suma6Pliegues:150, suma8Pliegues:197,
      pliegues:{p6:150,p8:197,triceps:25,subescapular:28,supraespinal:20,abdominal:45,muslo:18,pantorrilla:14,biceps:10,crestaIliaca:37},
      perimetros:{brazoRelajado:34.0,brazoFlexTension:29.3,cinturaMinima:83.4,caderaMaxima:107.0,musloMedial:53.1,pantorrillaMaxima:41.2},
      somatotipo:{endo:6.3,meso:4.9,ecto:1.1}, anthropometry:true, source:'reporte_antropometrico_oficial'}
  ];;

  if (typeof window.importAnthropometryRecords === 'function') {
    window.importAnthropometryRecords(REGISTROS_ANTROPOMETRICOS);
    console.log('✅ Importador nativo usado. Revisa Progreso > Medidas corporales.');
    return;
  }

  const DB_KEY = 'forge_db_v1';
  const db = JSON.parse(localStorage.getItem(DB_KEY) || '{}');
  db.bodyMetrics = Array.isArray(db.bodyMetrics) ? db.bodyMetrics : [];
  db.anthropometry = Array.isArray(db.anthropometry) ? db.anthropometry : [];

  function clean(v) { return v === undefined || v === null || v === ''; }
  function merge(base, inc) {
    const out = JSON.parse(JSON.stringify(base || {}));
    Object.keys(inc || {}).forEach(k => {
      if(['pliegues','perimetros','somatotipo'].includes(k)) return;
      if(!clean(inc[k])) out[k] = inc[k];
    });
    ['pliegues','perimetros','somatotipo'].forEach(group => {
      out[group] = out[group] && typeof out[group] === 'object' ? out[group] : {};
      const src = inc[group] && typeof inc[group] === 'object' ? inc[group] : {};
      Object.keys(src).forEach(k => { if(!clean(src[k])) out[group][k] = src[k]; });
    });
    return out;
  }

  const byDate = new Map();
  [...db.bodyMetrics, ...db.anthropometry].filter(x => x && x.date).forEach(x => {
    byDate.set(x.date, byDate.has(x.date) ? merge(byDate.get(x.date), x) : x);
  });
  REGISTROS_ANTROPOMETRICOS.forEach(r => {
    byDate.set(r.date, byDate.has(r.date) ? merge(byDate.get(r.date), r) : r);
  });

  const arr = Array.from(byDate.values()).sort((a,b) => String(a.date).localeCompare(String(b.date)));
  db.bodyMetrics = arr;
  db.anthropometry = arr.filter(x => x.anthropometry || x.source === 'reporte_antropometrico_oficial' || x.pliegues || x.perimetros || x.somatotipo);
  db.perfil = db.perfil || {};
  db.perfil.estatura = db.perfil.estatura || 188;
  db._migrations = db._migrations || {};
  db._migrations.v175AnthropometryOfficial = new Date().toISOString();
  localStorage.setItem(DB_KEY, JSON.stringify(db));
  console.log('✅ Antropometría v175 cargada/corregida. Fechas antropométricas:', db.anthropometry.map(x => x.date));
  console.table(db.anthropometry.map(r => ({
    date:r.date, peso:r.peso, grasaPct:r.grasaPct, grasaKg:r.grasaKg,
    muscularPct:r.muscularPct, muscularKg:r.muscularKg, imc:r.imc,
    p6:r.suma6Pliegues || r.pliegues?.p6, p8:r.suma8Pliegues || r.pliegues?.p8,
    cintura:r.perimetros?.cinturaMinima, endo:r.somatotipo?.endo, meso:r.somatotipo?.meso, ecto:r.somatotipo?.ecto
  })));
  console.log('Recarga Melqart y revisa Progreso > Medidas corporales.');
})();
