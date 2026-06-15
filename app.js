// ---------------------------------------------------------------
//  FIREBASE
// ---------------------------------------------------------------
var authIsSignup = false;
var authBusy = false;
if (typeof firebase === 'undefined') { console.error('Firebase SDK no cargó'); }
const fbConfig = {
  apiKey:"AIzaSyBKMfDz3XLJCmjjaYdeT_o1Z05T2yub_Qc",
  authDomain:"lumen-6ed85.firebaseapp.com",
  projectId:"lumen-6ed85",
  storageBucket:"lumen-6ed85.firebasestorage.app",
  messagingSenderId:"473887918286",
  appId:"1:473887918286:web:e3ee5a38f52e9aa107e89f"
};
firebase.initializeApp(fbConfig);
const auth = firebase.auth();
const db   = firebase.firestore();
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(()=>{});

// ---------------------------------------------------------------
//  BASE DE DATOS LOCAL
// ---------------------------------------------------------------
const DB_KEY = 'forge_db_v1';
let forge = {
  exercises:[], routines:[], sessions:[],
  bodyMetrics:[], photos:[], logros:[], perfil:{},
  planes:[], habitos:[]
};
let currentUser = null;
let currentScreen = 'home';

function loadDB() {
  try { const r = localStorage.getItem(DB_KEY); if(r) forge = {...forge, ...JSON.parse(r)}; } catch{}
}
function saveDB() {
  localStorage.setItem(DB_KEY, JSON.stringify(forge));
}
function mergeDB(local, remote) {
  const m = {...local};
  // Sessions: deduplicar por id
  const sessIds = new Set((local.sessions||[]).map(s=>s.id));
  const sessKeys = new Set((local.sessions||[]).map(s=>s.routineName+'|'+s.date));
  (remote.sessions||[]).forEach(s=>{
    if(!sessIds.has(s.id) && !sessKeys.has(s.routineName+'|'+s.date)) m.sessions.push(s);
  });
  // Exercises: por id
  const exIds = new Set((local.exercises||[]).map(e=>e.id));
  (remote.exercises||[]).forEach(e=>{ if(!exIds.has(e.id)) m.exercises.push(e); });
  // Routines: merge inteligente — no agregar duplicados por nombre
  const IDS_BASE_SET = new Set(['r_lunes','r_martes','r_mierco','r_jueves','r_jueves_noche','r_cardio']);
  const rIds = new Set((local.routines||[]).map(r=>r.id));
  const rNombres = new Set((local.routines||[]).map(r=>r.name.toLowerCase().trim()));
  (remote.routines||[]).forEach(r=>{
    if(rIds.has(r.id)) return; // ya existe por ID
    const n = r.name.toLowerCase().trim();
    if(rNombres.has(n)) return; // ya existe por nombre exacto
    // Si es una copia de rutina base (nombre similar) y ya tenemos la base → ignorar
    const esCopiaBase = !IDS_BASE_SET.has(r.id) &&
      ['tren inferior a','tren superior a','tren inferior b','tren superior b','trote','cardio'].some(k=>n.includes(k));
    const tenemosSuBase = [...m.routines].some(x => IDS_BASE_SET.has(x.id) && x.name.toLowerCase().includes(
      ['tren inferior a','tren superior a','tren inferior b','tren superior b','trote','cardio'].find(k=>n.includes(k))||'__'
    ));
    if(esCopiaBase && tenemosSuBase) return; // es duplicado → ignorar
    m.routines.push(r);
    rNombres.add(n);
  });
  // bodyMetrics: por fecha
  const mDates = new Set((local.bodyMetrics||[]).map(x=>x.date));
  (remote.bodyMetrics||[]).forEach(x=>{ if(!mDates.has(x.date)) m.bodyMetrics.push(x); });
  // Photos, logros, habitos: por id
  ['photos','logros','habitos'].forEach(k=>{
    const ids = new Set((local[k]||[]).map(x=>x.id));
    (remote[k]||[]).forEach(x=>{ if(!ids.has(x.id)) m[k].push(x); });
  });
  // Planes: el más reciente gana
  const planMap={};
  [...(local.planes||[]),...(remote.planes||[])].forEach(p=>{
    if(!planMap[p.id]||(p.createdAt||0)>(planMap[p.id].createdAt||0)) planMap[p.id]=p;
  });
  m.planes = Object.values(planMap);
  m.bodyMetrics.sort((a,b)=>a.date.localeCompare(b.date));
  m.sessions.sort((a,b)=>a.date-b.date);
  return m;
}

// ---------------------------------------------------------------
//  AUTH
// ---------------------------------------------------------------
function authMode(m) {
  authIsSignup = m==='up';
  document.getElementById('atab-in').classList.toggle('on', !authIsSignup);
  document.getElementById('atab-up').classList.toggle('on', authIsSignup);
  document.getElementById('a-name').style.display = authIsSignup ? 'block' : 'none';
  document.getElementById('a-btn').textContent = authIsSignup ? 'Crear cuenta' : 'Entrar';
  document.getElementById('auth-err').textContent = '';
}
function friendlyAuthError(err){
  const msg = (err && err.message ? err.message : String(err||'')).toLowerCase();
  if(msg.includes('user-not-found')) return 'No existe una cuenta con ese correo.';
  if(msg.includes('wrong-password') || msg.includes('invalid-credential')) return 'Contraseña incorrecta o credenciales inválidas.';
  if(msg.includes('invalid-email')) return 'El correo no tiene un formato válido.';
  if(msg.includes('too-many-requests')) return 'Demasiados intentos. Espera un momento.';
  if(msg.includes('email-already-in-use')) return 'Ese correo ya está registrado.';
  if(msg.includes('weak-password')) return 'La contraseña es demasiado débil.';
  if(msg.includes('network-request-failed')) return 'Problema de red. Revisa tu conexión.';
  return err && err.message ? err.message : 'No se pudo iniciar sesión.';
}
function setAuthBusy(b){
  authBusy = !!b;
  const btn = document.getElementById('a-btn');
  if(!btn) return;
  btn.disabled = authBusy;
  btn.textContent = authBusy ? 'Entrando…' : (authIsSignup ? 'Crear cuenta' : 'Entrar');
}
function doAuth() {
  if(authBusy) return;
  if(typeof firebase === 'undefined'){ showAuthErr('Firebase no cargó. Recarga la página.'); return; }
  const email = document.getElementById('a-email').value.trim();
  const pass  = document.getElementById('a-pass').value;
  const name  = document.getElementById('a-name').value.trim();
  if(!email||!pass){showAuthErr('Completa email y contraseña');return;}
  setAuthBusy(true);
  const p = authIsSignup
    ? auth.createUserWithEmailAndPassword(email,pass).then(c=> name ? c.user.updateProfile({displayName:name}) : null)
    : auth.signInWithEmailAndPassword(email,pass);
  p.catch(e=>showAuthErr(friendlyAuthError(e))).finally(()=>{ setTimeout(()=>setAuthBusy(false), 150); });
}
function resetPass() {
  const email = document.getElementById('a-email').value.trim();
  if(!email){showAuthErr('Ingresa tu email primero');return;}
  auth.sendPasswordResetEmail(email)
    .then(()=>showAuthErr('✓ Email enviado', true))
    .catch(e=>showAuthErr(e.message));
}
function showAuthErr(msg, ok=false) {
  const el = document.getElementById('auth-err');
  el.textContent = msg;
  el.style.color = ok ? 'var(--green)' : 'var(--alerta)';
  if(!authBusy) document.getElementById('a-btn').textContent = authIsSignup ? 'Crear cuenta' : 'Entrar';
}

document.getElementById('a-email').addEventListener('keydown',e=>{ if(e.key==='Enter') document.getElementById('a-pass').focus(); });
document.getElementById('a-pass').addEventListener('keydown',e=>{ if(e.key==='Enter') doAuth(); });
function updateUserUI(user){
  const btn = document.getElementById('user-btn');
  if(btn){ btn.textContent=(user.displayName||user.email||'U').slice(0,2).toUpperCase(); btn.style.display='flex'; }
  const nm = document.getElementById('um-name');
  const em = document.getElementById('um-email');
  if(nm) nm.textContent = user.displayName || 'Usuario';
  if(em) em.textContent = user.email || '';
  refreshUmSyncInfo();
}

function refreshUmSyncInfo(){
  const last = forge._lastSync;
  const syncTxt = document.getElementById('um-sync-txt');
  const lastTxt = document.getElementById('um-last-sync');
  const recTxt  = document.getElementById('um-records');
  if(!syncTxt) return;
  if(last){
    const d = new Date(last);
    syncTxt.textContent = 'Sincronizado';
    lastTxt.textContent = `Última sync: ${d.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})} · ${d.toLocaleDateString('es',{day:'numeric',month:'short'})}`;
  } else {
    syncTxt.textContent = 'Sin sincronizar';
    lastTxt.textContent = '';
  }
  // Contar registros
  const total = (forge.sessions?.length||0) + (forge.bodyMetrics?.length||0) + (forge.photos?.length||0);
  if(recTxt) recTxt.textContent = `${total} registros locales`;
}

auth.onAuthStateChanged(async user => {
  if(user) {
    currentUser = user;
    loadDB();
    initRutinas();
    document.getElementById('auth').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    updateUserUI(user);
    setSyncDot('syncing');
    renderAll();
    try {
      const snap = await db.collection('users').doc(user.uid).collection('forge').doc('data').get();
      if(snap.exists){
        const remoto = snap.data();
        const tsLocal = forge._lastSync||0;
        const tsRemoto = remoto._lastSync||0;
        // Preservar fotos locales antes de cualquier operación
        const fotosLocales = forge.photos||[];
        const fotosSesLocal = {};
        (forge.sessions||[]).forEach(s=>{ if(s.foto) fotosSesLocal[s.id]=s.foto; });
        if(tsRemoto > tsLocal){
          // Firebase es más reciente → usarlo directamente, no hacer merge
          forge = {...remoto};
          showToast('Datos actualizados desde la nube', 2000, 'ok');
        } else {
          // Local es más reciente o igual → merge normal
          forge = mergeDB(forge, remoto);
        }
        // Restaurar fotos locales siempre
        if(fotosLocales.length) forge.photos = fotosLocales;
        forge.sessions = (forge.sessions||[]).map(s => fotosSesLocal[s.id]?{...s,foto:fotosSesLocal[s.id]}:s);
        saveDB(); renderAll(); setLastSync();
      }
      setSyncDot('ok');
    } catch(e){ setSyncDot('off'); console.error('Firebase load error:', e); }
  } else {
    currentUser = null;
    document.getElementById('auth').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
  }
});

// ── Guardar en nube ────────────────────────────────────────────
async function doGuardarNube() {
  if(!currentUser){ showToast('Inicia sesión primero'); return; }
  setSyncDot('syncing');
  try {
    // Excluir fotos del sync — son base64 y superan el límite de 1MB de Firestore
    // Las fotos se guardan solo en localStorage de cada dispositivo
    const forgeSync = {...forge};
    // Excluir fotos de progreso
    if(forgeSync.photos) delete forgeSync.photos;
    // Excluir fotos post-sesión de cada sesión
    if(forgeSync.sessions) forgeSync.sessions = forgeSync.sessions.map(s=>{
      if(!s.foto) return s;
      const {foto, ...rest} = s;
      return rest;
    });
    await db.collection('users').doc(currentUser.uid).collection('forge').doc('data').set(forgeSync);
    setLastSync(); saveDB();
    setSyncDot('ok');
    showToast('✓ Datos guardados en la nube', 2500, 'ok');
    refreshUmSyncInfo();
  } catch(e){
    setSyncDot('off');
    showToast('Error al guardar en nube: '+e.message, 4000);
    console.error('Firestore error:', e);
  }
}
// Alias para compatibilidad con llamadas existentes
function syncCloud(){ return doGuardarNube(); }

// ── Cargar desde nube (merge incremental) ──────────────────────
async function doCargarNube() {
  if(!currentUser){ showToast('Inicia sesión primero'); return; }
  setSyncDot('syncing');
  showToast('📥 Descargando desde la nube…', 2000);
  try {
    const snap = await db.collection('users').doc(currentUser.uid).collection('forge').doc('data').get();
    if(!snap.exists){
      setSyncDot('ok');
      showToast('Sin datos en la nube aún', 2000);
      return;
    }
    const remoto = snap.data();
    const antes  = contarRegistros(forge);
    // Preservar fotos locales antes del merge (no están en Firebase)
    const fotosLocales = forge.photos||[];
    const fotosSesLocal = {};
    (forge.sessions||[]).forEach(s=>{ if(s.foto) fotosSesLocal[s.id]=s.foto; });
    forge = mergeDB(forge, remoto);
    // Restaurar fotos locales
    if(fotosLocales.length) forge.photos=fotosLocales;
    forge.sessions=(forge.sessions||[]).map(s=>fotosSesLocal[s.id]?{...s,foto:fotosSesLocal[s.id]}:s);
    saveDB();
    setLastSync();
    setSyncDot('ok');
    const despues = contarRegistros(forge);
    const nuevos  = despues - antes;
    showToast(nuevos > 0 ? `✓ ${nuevos} registros nuevos cargados` : '✓ Todo al día, sin cambios', 3000, 'ok');
    renderAll();
    refreshUmSyncInfo();
  } catch(e){
    setSyncDot('off');
    showToast('Error al cargar: '+e.message);
  }
}

function contarRegistros(db){
  return (db.sessions?.length||0) + (db.bodyMetrics?.length||0) +
         (db.exercises?.length||0) + (db.routines?.length||0) +
         (db.photos?.length||0) + (db.logros?.length||0);
}

// ── Cerrar sesión ──────────────────────────────────────────────
function openModalCerrarSesion(){
  const total = contarRegistros(forge);
  const el = document.getElementById('logout-records');
  if(el) el.textContent = `Tienes ${total} registros locales.`;
  openModal('modal-logout');
}
async function doGuardarYSalir(){
  closeModal('modal-logout');
  await doGuardarNube();
  auth.signOut();
}
function doSalirSinGuardar(){
  closeModal('modal-logout');
  auth.signOut();
}
function setSyncDot(st) {
  const d = document.getElementById('sync-dot'); if(!d) return;
  d.style.background = st==='ok'?'var(--green)':st==='syncing'?'var(--gold)':'var(--red)';
  const txt = document.getElementById('um-sync-txt');
  if(txt) txt.textContent = st==='ok'?'Sincronizado':st==='syncing'?'Sincronizando…':'Error de conexión';
  if(txt) txt.style.color = st==='ok'?'var(--green)':st==='syncing'?'var(--gold)':'var(--red)';
}
function setLastSync() { forge._lastSync = Date.now(); }

// ---------------------------------------------------------------
//  NAVEGACIÓN
// ---------------------------------------------------------------
function goTo(s) {
  document.querySelectorAll('.screen').forEach(x=>x.classList.remove('on'));
  document.querySelectorAll('.nb').forEach(x=>x.classList.remove('on'));
  document.getElementById('s-'+s).classList.add('on');
  document.getElementById('nb-'+s).classList.add('on');
  currentScreen = s;
  if(s==='home')     renderHome();
  if(s==='train')    renderTrain();
  if(s==='progress') renderProgress();
  if(s==='food')     renderFood();
  if(s==='perfil')   renderPerfil();
}
function renderAll() {
  renderHome();
  if(currentScreen==='train')    renderTrain();
  if(currentScreen==='progress') renderProgress();
  if(currentScreen==='food')     renderFood();
  if(currentScreen==='perfil')   renderPerfil();
}

// ---------------------------------------------------------------
//  UTILIDADES
// ---------------------------------------------------------------
/** Formatea número con punto de miles. Independiente del locale del dispositivo.
 *  fmtMiles(3476)   → "3.476"
 *  fmtMiles(3476.5) → "3.476,5"  (no aplica, solo enteros)
 */
function fmtMiles(n){
  if(n===null||n===undefined||isNaN(n)) return '—';
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g,'.');
}

function fmtTime(s){
  const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),ss=s%60; return h>0?`${h}:${pad(m)}:${pad(ss)}`:`${pad(m)}:${pad(ss)}`; }
function pad(n){ return String(n).padStart(2,'0'); }
function fmtDate(ts){ return new Date(ts).toLocaleDateString('es',{day:'2-digit',month:'short',year:'numeric'}); }
// Convertir timestamp a fecha local YYYY-MM-DD (evita desfase UTC en Santiago UTC-3/UTC-4)
function localDateStr(ts){
  const d=new Date(ts);
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,'0');
  const day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function today(){
  return localDateStr(Date.now());
}
function showToast(msg,dur=2200,type='') {
  const t=document.getElementById('toast'); if(!t) return;
  t.textContent=msg; t.className='toast on'+(type?' '+type:'');
  clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('on'),dur);
}
function openModal(id){ document.getElementById(id).classList.add('on'); }
function closeModal(id){ document.getElementById(id).classList.remove('on'); }
function toggleUserMenu(){
  const m = document.getElementById('user-menu');
  const isOpen = m.classList.toggle('on');
  if(isOpen) refreshUmSyncInfo();
}
function closeUserMenu(){ document.getElementById('user-menu').classList.remove('on'); }
document.addEventListener('click',e=>{ if(!e.target.closest('#user-menu')&&!e.target.closest('#user-btn')) closeUserMenu(); });

function getEx(id){ return (forge.exercises||[]).find(e=>e.id===id); }
function getPR(exId){
  let best={weight:0,reps:0};
  (forge.sessions||[]).forEach(s=>{
    (s.exercises||[]).forEach(ex=>{
      if(ex.exId!==exId) return;
      (ex.sets||[]).filter(s=>s.done&&s.weight).forEach(s=>{
        if(s.weight>best.weight||(s.weight===best.weight&&s.reps>best.reps)) best={weight:s.weight,reps:s.reps};
      });
    });
  });
  return best;
}
function getLunesDe(dateStr){
  // Devuelve el lunes de la semana de una fecha YYYY-MM-DD (semana parte lunes)
  const d=new Date(dateStr+'T12:00:00');
  const dow=d.getDay(); // 0=dom,1=lun,...6=sab
  const diff=dow===0?6:dow-1; // días desde el lunes
  d.setDate(d.getDate()-diff);
  return localDateStr(d);
}
function calcStreak(){
  // Racha de SEMANAS consecutivas con al menos 1 sesión (semana=lunes a domingo)
  const sesiones=forge.sessions||[];
  if(!sesiones.length) return 0;
  const semanas=new Set(sesiones.map(s=>getLunesDe(localDateStr(s.date))));
  const sorted=[...semanas].sort().reverse();
  // Semana actual
  const hoyLunes=getLunesDe(today());
  // Si la semana actual no tiene sesiones, empezar desde la anterior
  let cur=sorted[0]===hoyLunes?hoyLunes:sorted[0];
  let streak=0;
  for(const s of sorted){
    if(s!==cur) break;
    streak++;
    // Retroceder una semana
    const d=new Date(cur+'T12:00:00'); d.setDate(d.getDate()-7);
    cur=localDateStr(d);
  }
  return streak;
}
function calcMaxStreak(){
  const sesiones=forge.sessions||[];
  if(!sesiones.length) return 0;
  const semanas=[...new Set(sesiones.map(s=>getLunesDe(localDateStr(s.date))))].sort();
  let max=0,cur=0,prev=null;
  semanas.forEach(s=>{
    if(!prev){ cur=1; }
    else {
      const d=new Date(prev+'T12:00:00'); d.setDate(d.getDate()+7);
      cur=getLunesDe(localDateStr(d))===s?cur+1:1;
    }
    max=Math.max(max,cur); prev=s;
  });
  return max;
}
function getSesionesXSemana(){
  // Devuelve {lunesStr: count} para todas las semanas
  const map={};
  (forge.sessions||[]).forEach(s=>{
    const l=getLunesDe(localDateStr(s.date));
    map[l]=(map[l]||0)+1;
  });
  return map;
}
function getMejorSemanaAnio(anio){
  const map=getSesionesXSemana();
  let best=0, bestLunes=null;
  Object.entries(map).forEach(([l,cnt])=>{
    if(l.startsWith(anio) && cnt>best){ best=cnt; bestLunes=l; }
  });
  return {count:best, lunes:bestLunes};
}
function fmtRangoSemana(lunesStr){
  if(!lunesStr) return '';
  const l=new Date(lunesStr+'T12:00:00');
  const d=new Date(l); d.setDate(l.getDate()+6);
  const meses=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return l.getDate()+' '+meses[l.getMonth()]+' – '+d.getDate()+' '+meses[d.getMonth()];
}
function est1RM(w,r){ return Math.round(w*(1+r/30)*10)/10; } // Fórmula Epley

function switchTab(scope,tab,btn){
  document.querySelectorAll(scope+' .tab-btn').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
  const prefix = scope==='#prog-fotos' ? '#photos-' : scope.replace('#','#')+'-';
  return tab;
}

// ---------------------------------------------------------------
//  RUTINAS INICIALES
// ---------------------------------------------------------------
// ─────────────────────────────────────────────────────────────
//  BIBLIOTECA DE EJERCICIOS — clasificada por grupo muscular
//  Variantes: barbell · smith · dumbbell · cable · machine · bodyweight
//  restSec en segundos · bilateral:true = se registra una extremidad
// ─────────────────────────────────────────────────────────────
const EJERCICIOS_BASE = [

  // ── CALENTAMIENTO / ESTIRAMIENTO (no tocar IDs) ──────────
  {id:'ex_cal_inf',  name:'Calentamiento Tren Inferior', type:'warmup',     muscle:'piernas',  restSec:0, youtubeId:'jSACK-0lKi4'},
  {id:'ex_cal_trote',name:'Calentamiento Trote',          type:'warmup',     muscle:'cardio',   restSec:0, youtubeId:'bZWd5jKhbVo'},
  {id:'ex_cal_sup',  name:'Calentamiento Tren Superior',  type:'warmup',     muscle:'hombros',  restSec:0, youtubeId:'sytmEGA0HKU'},
  {id:'ex_est_inf',  name:'Estiramiento Tren Inferior',   type:'stretch',    muscle:'piernas',  restSec:0, youtubeId:'byeZQ8cNIFs'},
  {id:'ex_est_sup',  name:'Estiramiento Tren Superior',   type:'stretch',    muscle:'hombros',  restSec:0, youtubeId:'FozCaXSnB6A'},
  {id:'ex_est_trote',name:'Estiramiento Trote',            type:'stretch',    muscle:'cardio',   restSec:0, youtubeId:'e8Y6Y-PST2g'},

  // ── CARDIO ───────────────────────────────────────────────
  {id:'ex_correr',   name:'Carrera / Trote',              type:'run',        muscle:'cardio',   restSec:0},
  {id:'ex_cinta',    name:'Correr en Cinta',               type:'run',        muscle:'cardio',   restSec:0},
  {id:'ex_hiit',     name:'HIIT Carrera',                  type:'hiit',       muscle:'cardio',   restSec:60, youtubeId:'qO0hUgxd-d4'},
  {id:'ex_bici',     name:'Bicicleta Estática',            type:'run',        muscle:'cardio',   restSec:0},
  {id:'ex_remo_erg', name:'Remo Ergómetro',                type:'run',        muscle:'cardio',   restSec:0},
  {id:'ex_eliptica', name:'Elíptica',                      type:'run',        muscle:'cardio',   restSec:0},
  {id:'ex_saltar_cuerda', name:'Saltar Cuerda',            type:'hiit',       muscle:'cardio',   restSec:60},

  // ── CUÁDRICEPS / PIERNAS (compuesto) ─────────────────────
  {id:'ex_sentadilla',       name:'Sentadilla (Barra)',          type:'barbell',    muscle:'cuadriceps', restSec:180, grupo:'Cuádriceps'},
  {id:'ex_sent_smith',       name:'Sentadilla (Smith)',           type:'smith',      muscle:'cuadriceps', restSec:180, grupo:'Cuádriceps'},
  {id:'ex_sent_manc',        name:'Sentadilla (Mancuernas)',      type:'dumbbell',   muscle:'cuadriceps', restSec:150, grupo:'Cuádriceps'},
  {id:'ex_sent_hack',        name:'Hack Squat (Máquina)',         type:'machine',    muscle:'cuadriceps', restSec:150, grupo:'Cuádriceps'},
  {id:'ex_sent_goblet',      name:'Sentadilla Goblet',            type:'dumbbell',   muscle:'cuadriceps', restSec:120, grupo:'Cuádriceps'},
  {id:'ex_prensa',           name:'Prensa de Piernas (Máquina)',  type:'machine',    muscle:'cuadriceps', restSec:150, grupo:'Cuádriceps'},
  {id:'ex_extension_cuad',   name:'Extensión de Cuádriceps',      type:'machine',    muscle:'cuadriceps', restSec:90,  grupo:'Cuádriceps'},
  {id:'ex_zancada_barra',    name:'Zancadas (Barra)',             type:'barbell',    muscle:'cuadriceps', restSec:90,  grupo:'Cuádriceps', bilateral:true},
  {id:'ex_zancada_manc',     name:'Zancadas (Mancuernas)',        type:'dumbbell',   muscle:'cuadriceps', restSec:90,  grupo:'Cuádriceps', bilateral:true},
  {id:'ex_zancada_caminando',name:'Zancadas Caminando',           type:'dumbbell',   muscle:'cuadriceps', restSec:90,  grupo:'Cuádriceps', bilateral:true},
  {id:'ex_saltos_cajon',     name:'Saltos al Cajón',              type:'plyo',       muscle:'cuadriceps', restSec:60,  grupo:'Cuádriceps'},

  // ── ISQUIOTIBIALES ────────────────────────────────────────
  {id:'ex_curl_femoral',     name:'Curl Femoral (Máquina)',       type:'machine',    muscle:'isquios',    restSec:120, grupo:'Isquiotibiales'},
  {id:'ex_curl_fem_tumbado', name:'Curl Femoral Tumbado',         type:'machine',    muscle:'isquios',    restSec:120, grupo:'Isquiotibiales'},
  {id:'ex_peso_muerto',      name:'Peso Muerto (Barra)',          type:'barbell',    muscle:'isquios',    restSec:180, grupo:'Isquiotibiales'},
  {id:'ex_peso_muerto_rum',  name:'Peso Muerto Rumano (Barra)',   type:'barbell',    muscle:'isquios',    restSec:180, grupo:'Isquiotibiales'},
  {id:'ex_pdr_smith',        name:'Peso Muerto Rumano (Smith)',   type:'smith',      muscle:'isquios',    restSec:180, grupo:'Isquiotibiales'},
  {id:'ex_pdr_manc',         name:'Peso Muerto Rumano (Mancuernas)', type:'dumbbell', muscle:'isquios',  restSec:150, grupo:'Isquiotibiales'},
  {id:'ex_buenos_dias',      name:'Buenos Días (Barra)',          type:'barbell',    muscle:'isquios',    restSec:120, grupo:'Isquiotibiales'},
  {id:'ex_nordic_curl',      name:'Nordic Curl',                  type:'bodyweight', muscle:'isquios',    restSec:120, grupo:'Isquiotibiales'},

  // ── GLÚTEOS ───────────────────────────────────────────────
  {id:'ex_hip_thrust',       name:'Hip Thrust (Barra)',           type:'barbell',    muscle:'gluteos',    restSec:180, grupo:'Glúteos'},
  {id:'ex_hip_thrust_smith', name:'Hip Thrust (Smith)',           type:'smith',      muscle:'gluteos',    restSec:180, grupo:'Glúteos'},
  {id:'ex_hip_thrust_maq',   name:'Hip Thrust (Máquina)',         type:'machine',    muscle:'gluteos',    restSec:180, grupo:'Glúteos'},
  {id:'ex_sent_bulgara',     name:'Sentadilla Búlgara',           type:'dumbbell',   muscle:'gluteos',    restSec:120, grupo:'Glúteos', bilateral:true},
  {id:'ex_sent_bulg_barra',  name:'Sentadilla Búlgara (Barra)',   type:'barbell',    muscle:'gluteos',    restSec:150, grupo:'Glúteos', bilateral:true},
  {id:'ex_kickback_cable',   name:'Kickback Glúteo (Cable)',      type:'cable',      muscle:'gluteos',    restSec:90,  grupo:'Glúteos', bilateral:true},
  {id:'ex_abduccion_maq',    name:'Abducción (Máquina)',          type:'machine',    muscle:'gluteos',    restSec:90,  grupo:'Glúteos'},
  {id:'ex_puente_gluteo',    name:'Puente de Glúteo',             type:'bodyweight', muscle:'gluteos',    restSec:60,  grupo:'Glúteos'},

  // ── GEMELOS / PANTORRILLA ─────────────────────────────────
  {id:'ex_elevacion_talones_maq', name:'Elevación Talones (Máquina)', type:'machine', muscle:'gemelos', restSec:90, grupo:'Gemelos'},
  {id:'ex_elevacion_talones_bar', name:'Elevación Talones (Barra)',   type:'barbell', muscle:'gemelos', restSec:90, grupo:'Gemelos'},
  {id:'ex_elevacion_sentado',     name:'Elevación Talones Sentado',   type:'machine', muscle:'gemelos', restSec:90, grupo:'Gemelos'},

  // ── PECHO ─────────────────────────────────────────────────
  {id:'ex_press_banca',       name:'Press Banca (Barra)',          type:'barbell',    muscle:'pecho',    restSec:180, grupo:'Pecho'},
  {id:'ex_press_banca_smith', name:'Press Banca (Smith)',          type:'smith',      muscle:'pecho',    restSec:180, grupo:'Pecho'},
  {id:'ex_press_banca_manc',  name:'Press Banca (Mancuernas)',     type:'dumbbell',   muscle:'pecho',    restSec:180, grupo:'Pecho'},
  {id:'ex_press_inclinado',   name:'Press Inclinado (Barra)',      type:'barbell',    muscle:'pecho',    restSec:180, grupo:'Pecho'},
  {id:'ex_press_incl_smith',  name:'Press Inclinado (Smith)',      type:'smith',      muscle:'pecho',    restSec:180, grupo:'Pecho'},
  {id:'ex_press_incl_manc',   name:'Press Inclinado (Mancuernas)',  type:'dumbbell',  muscle:'pecho',    restSec:150, grupo:'Pecho'},
  {id:'ex_press_declinado',   name:'Press Declinado (Barra)',      type:'barbell',    muscle:'pecho',    restSec:150, grupo:'Pecho'},
  {id:'ex_press_decl_manc',   name:'Press Declinado (Mancuernas)', type:'dumbbell',  muscle:'pecho',    restSec:150, grupo:'Pecho'},
  {id:'ex_aperturas_manc',    name:'Aperturas (Mancuernas)',        type:'dumbbell',  muscle:'pecho',    restSec:120, grupo:'Pecho'},
  {id:'ex_aperturas_cable',   name:'Aperturas (Cable)',             type:'cable',     muscle:'pecho',    restSec:120, grupo:'Pecho'},
  {id:'ex_fondos',            name:'Fondos en Paralelas',           type:'bodyweight',muscle:'pecho',    restSec:120, grupo:'Pecho'},
  {id:'ex_push_up',           name:'Flexiones de Pecho',            type:'bodyweight',muscle:'pecho',    restSec:60,  grupo:'Pecho'},
  {id:'ex_peck_deck',         name:'Peck Deck (Mariposa)',          type:'machine',   muscle:'pecho',    restSec:120, grupo:'Pecho'},
  {id:'ex_press_maq_pecho',   name:'Press de Pecho (Máquina)',     type:'machine',   muscle:'pecho',    restSec:150, grupo:'Pecho'},

  // ── ESPALDA ───────────────────────────────────────────────
  {id:'ex_remo_barra',        name:'Remo con Barra',               type:'barbell',   muscle:'espalda',  restSec:150, grupo:'Espalda'},
  {id:'ex_remo_manc',         name:'Remo con Mancuerna',           type:'dumbbell',  muscle:'espalda',  restSec:120, grupo:'Espalda', bilateral:true},
  {id:'ex_remo_cable',        name:'Remo en Polea (Cable)',         type:'cable',     muscle:'espalda',  restSec:120, grupo:'Espalda'},
  {id:'ex_remo_maq',          name:'Remo Pecho Apoyado (Máquina)', type:'machine',   muscle:'espalda',  restSec:150, grupo:'Espalda'},
  {id:'ex_remo_sentado',      name:'Remo Sentado (Cable)',          type:'cable',     muscle:'espalda',  restSec:150, grupo:'Espalda'},
  {id:'ex_jalon_pecho',       name:'Jalón al Pecho (Cable)',        type:'cable',     muscle:'espalda',  restSec:150, grupo:'Espalda'},
  {id:'ex_jalon_prono',       name:'Jalón Pronado (Cable)',         type:'cable',     muscle:'espalda',  restSec:150, grupo:'Espalda'},
  {id:'ex_jalon_supino',      name:'Jalón Supino (Cable)',          type:'cable',     muscle:'espalda',  restSec:150, grupo:'Espalda'},
  {id:'ex_dominadas',         name:'Dominadas (Peso Corporal)',     type:'bodyweight',muscle:'espalda',  restSec:150, grupo:'Espalda'},
  {id:'ex_dominadas_asist',   name:'Dominadas Asistidas',          type:'machine',   muscle:'espalda',  restSec:150, grupo:'Espalda'},
  {id:'ex_pullover_manc',     name:'Pullover (Mancuerna)',          type:'dumbbell',  muscle:'espalda',  restSec:120, grupo:'Espalda'},
  {id:'ex_pullover_cable',    name:'Pullover (Cable)',              type:'cable',     muscle:'espalda',  restSec:120, grupo:'Espalda'},
  {id:'ex_facepull',          name:'Face Pull (Cable)',             type:'cable',     muscle:'espalda',  restSec:90,  grupo:'Espalda'},

  // ── HOMBROS ───────────────────────────────────────────────
  {id:'ex_press_hombros',      name:'Press Hombros (Barra)',        type:'barbell',  muscle:'hombros',  restSec:150, grupo:'Hombros'},
  {id:'ex_press_homb_smith',   name:'Press Hombros (Smith)',        type:'smith',    muscle:'hombros',  restSec:150, grupo:'Hombros'},
  {id:'ex_press_homb_manc',    name:'Press Hombros (Mancuernas)',   type:'dumbbell', muscle:'hombros',  restSec:150, grupo:'Hombros'},
  {id:'ex_press_arnold',       name:'Press Arnold',                 type:'dumbbell', muscle:'hombros',  restSec:150, grupo:'Hombros'},
  {id:'ex_press_homb_maq',     name:'Press Hombros (Máquina)',      type:'machine',  muscle:'hombros',  restSec:150, grupo:'Hombros'},
  {id:'ex_elev_lateral',       name:'Elevaciones Laterales',        type:'dumbbell', muscle:'hombros',  restSec:120, grupo:'Hombros'},
  {id:'ex_elev_lat_cable',     name:'Elevaciones Laterales (Cable)',type:'cable',    muscle:'hombros',  restSec:120, grupo:'Hombros', bilateral:true},
  {id:'ex_elev_frontal',       name:'Elevaciones Frontales',        type:'dumbbell', muscle:'hombros',  restSec:90,  grupo:'Hombros'},
  {id:'ex_elev_frontal_barra', name:'Elevaciones Frontales (Barra)',type:'barbell',  muscle:'hombros',  restSec:90,  grupo:'Hombros'},
  {id:'ex_pajaros',            name:'Pájaros (Mancuernas)',          type:'dumbbell', muscle:'hombros', restSec:90,  grupo:'Hombros'},
  {id:'ex_pajaros_cable',      name:'Pájaros (Cable)',               type:'cable',    muscle:'hombros', restSec:90,  grupo:'Hombros'},
  {id:'ex_encogimiento',       name:'Encogimiento de Hombros (Barra)',type:'barbell', muscle:'hombros', restSec:90,  grupo:'Hombros'},
  {id:'ex_encogimiento_manc',  name:'Encogimiento de Hombros (Manc)',type:'dumbbell', muscle:'hombros', restSec:90, grupo:'Hombros'},

  // ── BÍCEPS ────────────────────────────────────────────────
  {id:'ex_curl_barra',        name:'Curl de Bíceps (Barra)',        type:'barbell',  muscle:'biceps',   restSec:90,  grupo:'Bíceps'},
  {id:'ex_curl_manc',         name:'Curl de Bíceps (Mancuernas)',   type:'dumbbell', muscle:'biceps',   restSec:90,  grupo:'Bíceps', bilateral:true},
  {id:'ex_curl_martillo',     name:'Curl Martillo (Mancuernas)',    type:'dumbbell', muscle:'biceps',   restSec:90,  grupo:'Bíceps', bilateral:true},
  {id:'ex_curl_cable',        name:'Curl de Bíceps (Cable)',        type:'cable',    muscle:'biceps',   restSec:90,  grupo:'Bíceps'},
  {id:'ex_curl_predicador',   name:'Curl Predicador (Barra)',       type:'barbell',  muscle:'biceps',   restSec:90,  grupo:'Bíceps'},
  {id:'ex_curl_pred_cable',   name:'Curl Predicador (Cable)',       type:'cable',    muscle:'biceps',   restSec:90,  grupo:'Bíceps'},
  {id:'ex_curl_concentrado',  name:'Curl Concentrado (Mancuerna)', type:'dumbbell', muscle:'biceps',   restSec:90,  grupo:'Bíceps', bilateral:true},
  {id:'ex_curl_barra_z',      name:'Curl con Barra Z',              type:'barbell',  muscle:'biceps',   restSec:90,  grupo:'Bíceps'},

  // ── TRÍCEPS ───────────────────────────────────────────────
  {id:'ex_tricep_polea',      name:'Tríceps en Polea (Cable)',      type:'cable',    muscle:'triceps',  restSec:90,  grupo:'Tríceps'},
  {id:'ex_tricep_cuerda',     name:'Tríceps Cuerda (Cable)',        type:'cable',    muscle:'triceps',  restSec:90,  grupo:'Tríceps'},
  {id:'ex_press_frances',     name:'Press Francés (Barra)',         type:'barbell',  muscle:'triceps',  restSec:90,  grupo:'Tríceps'},
  {id:'ex_press_franc_manc',  name:'Press Francés (Mancuernas)',    type:'dumbbell', muscle:'triceps',  restSec:90,  grupo:'Tríceps'},
  {id:'ex_patada_tricep',     name:'Patada de Tríceps (Mancuerna)',type:'dumbbell', muscle:'triceps',  restSec:90,  grupo:'Tríceps', bilateral:true},
  {id:'ex_fondos_tricep',     name:'Fondos para Tríceps',           type:'bodyweight',muscle:'triceps', restSec:90,  grupo:'Tríceps'},
  {id:'ex_tricep_detras',     name:'Tríceps Detrás de Cabeza (Manc)',type:'dumbbell',muscle:'triceps', restSec:90,  grupo:'Tríceps'},
  {id:'ex_tricep_det_barra',  name:'Tríceps Detrás de Cabeza (Barra)',type:'barbell',muscle:'triceps', restSec:90, grupo:'Tríceps'},

  // ── CORE / ABDOMEN ────────────────────────────────────────
  {id:'ex_crunch',            name:'Abdominal Banco Inclinado',     type:'bodyweight',muscle:'core',    restSec:60,  grupo:'Core'},
  {id:'ex_crunch_cable',      name:'Crunch en Polea (Cable)',       type:'cable',    muscle:'core',     restSec:60,  grupo:'Core'},
  {id:'ex_plancha',           name:'Plancha',                       type:'bodyweight',muscle:'core',    restSec:60,  grupo:'Core'},
  {id:'ex_plancha_lateral',   name:'Plancha Lateral',               type:'bodyweight',muscle:'core',    restSec:60,  grupo:'Core', bilateral:true},
  {id:'ex_elevacion_piernas', name:'Elevación de Piernas',          type:'bodyweight',muscle:'core',    restSec:60,  grupo:'Core'},
  {id:'ex_rueda_abdominal',   name:'Rueda Abdominal',               type:'bodyweight',muscle:'core',    restSec:60,  grupo:'Core'},
  {id:'ex_giro_ruso',         name:'Giro Ruso (Peso)',              type:'dumbbell', muscle:'core',     restSec:60,  grupo:'Core'},
  {id:'ex_deadbug',           name:'Dead Bug',                      type:'bodyweight',muscle:'core',    restSec:60,  grupo:'Core'},
  {id:'ex_cable_pallof',      name:'Pallof Press (Cable)',          type:'cable',    muscle:'core',     restSec:60,  grupo:'Core'},
  {id:'ex_ab_machine',        name:'Abdominal en Máquina',          type:'machine',  muscle:'core',     restSec:60,  grupo:'Core'},
];

// Mapa de grupos musculares para la UI del selector
const GRUPOS_MUSCULARES = [
  {key:'cardio',      label:'Cardio', emoji:'🏃'},
  {key:'cuadriceps',  label:'Cuádriceps', emoji:'🦵'},
  {key:'isquios',     label:'Isquiotibiales', emoji:'🦵'},
  {key:'gluteos',     label:'Glúteos', emoji:'🍑'},
  {key:'gemelos',     label:'Gemelos', emoji:'🦵'},
  {key:'pecho',       label:'Pecho', emoji:'💪'},
  {key:'espalda',     label:'Espalda', emoji:'🏋️'},
  {key:'hombros',     label:'Hombros', emoji:'💪'},
  {key:'biceps',      label:'Bíceps', emoji:'💪'},
  {key:'triceps',     label:'Tríceps', emoji:'💪'},
  {key:'core',        label:'Core', emoji:'⚡'},
];

// Mapa de tipo a label corto para mostrar junto al nombre
const TIPO_LABEL = {
  barbell:'Barra', smith:'Smith', dumbbell:'Manc.', cable:'Cable',
  machine:'Máq.', bodyweight:'PC', plyo:'Plyo', run:'Cardio', hiit:'HIIT',
  warmup:'Cal.', stretch:'Est.'
};
const RUTINAS_BASE = [
  {id:'r_lunes',   name:'Lunes — Tren Inferior A',  emoji:'◉', exercises:['ex_cal_inf','ex_sentadilla','ex_peso_muerto','ex_saltos_cajon','ex_curl_femoral','ex_est_inf'],        restSec:180},
  {id:'r_martes',  name:'Martes — Tren Superior A', emoji:'◈', exercises:['ex_cal_sup','ex_press_banca','ex_remo_barra','ex_press_hombros','ex_elev_lateral','ex_est_sup'],      restSec:180},
  {id:'r_mierco',  name:'Miércoles — Tren Inferior B', emoji:'✶', exercises:['ex_cal_inf','ex_sent_bulgara','ex_curl_fem_tumbado','ex_hip_thrust','ex_crunch','ex_est_inf'], restSec:90},
  {id:'r_jueves',  name:'Jueves — Tren Superior B', emoji:'✦', exercises:['ex_cal_sup','ex_press_inclinado','ex_jalon_pecho','ex_press_homb_manc','ex_crunch','ex_est_sup'],restSec:90},
  {id:'r_jueves_noche', name:'Jueves Noche — Trote', emoji:'☾', exercises:['ex_cal_trote','ex_correr','ex_est_trote'], restSec:0},
  {id:'r_cardio',  name:'Domingo — Cardio',          emoji:'↝', exercises:['ex_correr','ex_est_trote'], restSec:0},
];
function initRutinas(){
  if(!forge.exercises) forge.exercises=[];
  if(!forge.routines)  forge.routines=[];

  // ── Migrar ejercicios viejos de carrera → ex_correr ─────────
  const viejosRun=['ex_correr_10k','ex_trote','ex_running','ex_trote_suave'];
  forge.exercises=forge.exercises.filter(e=>!viejosRun.includes(e.id));
  if(forge.sessions){
    forge.sessions.forEach(s=>{
      (s.exercises||[]).forEach(ex=>{
        if(viejosRun.includes(ex.exId)) ex.exId='ex_correr';
      });
    });
  }
  if(forge.routines){
    forge.routines.forEach(r=>{
      if(r.exercises) r.exercises=r.exercises.map(id=>viejosRun.includes(id)?'ex_correr':id);
    });
  }

  // ── Fusionar duplicados importados de Hevy ────────────────────
  // Formato: 'nombre duplicado (a eliminar)' → 'id canónico (a conservar)'
  // Solo fusionar si son exactamente el mismo ejercicio con el mismo instrumento
  const FUSION_MAP = {
    // Press Banca Barra
    'press de banca (barra)':         'ex_press_banca',
    'press banca (barra)':            'ex_press_banca',
    // Press Inclinado Barra
    'press de banca inclinado (barra)':'ex_press_inclinado',
    'press inclinado (barra)':         'ex_press_inclinado',
    // Remo con barra
    'remo pendlay (barra)':            'ex_remo_barra',
    // Press hombros barra
    'press de hombros (barra)':        'ex_press_hombros',
    // Peso muerto barra
    'peso muerto (barra)':             'ex_peso_muerto',
    // Jalón al pecho cable — SOLO el agarre normal, no el cerrado
    'jalón al pecho (cable)':          'ex_jalon_pecho',
    'jalon al pecho (cable)':          'ex_jalon_pecho',
    // Sentadilla barra
    'sentadilla (barra)':              'ex_sentadilla',
    // Hip thrust barra
    'empuje de caderas (barra)':       'ex_hip_thrust',
    'hip thrust (barra)':              'ex_hip_thrust',
    // ── Carrera / Trote — todos los nombres posibles de Hevy ──
    'trote':                           'ex_correr',
    'trote semanal':                   'ex_correr',
    'trote suave 4-5km':               'ex_correr',
    'correr':                          'ex_correr',
    'correr / trote':                  'ex_correr',
    'carrera':                         'ex_correr',
    'carrera / trote':                 'ex_correr',
    'running':                         'ex_correr',
    'run':                             'ex_correr',
    'outdoor run':                     'ex_correr',
    'outdoor running':                 'ex_correr',
    'treadmill running':               'ex_correr',
    'treadmill':                       'ex_correr',
    'jogging':                         'ex_correr',
  };

  // Construir mapa id_duplicado → id_canonico
  const idFusionMap = {};
  (forge.exercises||[]).forEach(e=>{
    const key = e.name.toLowerCase().trim();
    const canonico = FUSION_MAP[key];
    if(canonico && e.id !== canonico) {
      idFusionMap[e.id] = canonico;
    }
  });

  // Si hay fusiones que hacer, reasignar en sesiones y migrar sets de cardio
  if(Object.keys(idFusionMap).length > 0){
    (forge.sessions||[]).forEach(s=>{
      (s.exercises||[]).forEach(ex=>{
        if(idFusionMap[ex.exId]){
          const nuevoId = idFusionMap[ex.exId];
          ex.exId = nuevoId;
          // Si el ejercicio destino es cardio, migrar sets a formato run
          const exDest = EJERCICIOS_BASE.find(e=>e.id===nuevoId);
          if(exDest?.type==='run'||exDest?.type==='hiit'){
            ex.sets = (ex.sets||[]).map(set=>{
              if(set.type==='run') return set; // ya migrado
              // Intentar rescatar datos: peso→distancia, reps→nada
              return {
                type:'run', done: set.done||true,
                distance: set.weight>0 ? String(set.weight) : (set.distance||''),
                time: set.time||'',
                fc: set.fc||'', pasos: set.pasos||'',
                weight:0, reps:0
              };
            });
          }
        }
      });
    });
    const idsAEliminar = new Set(Object.keys(idFusionMap));
    forge.exercises = forge.exercises.filter(e=>!idsAEliminar.has(e.id));
    saveDB();
  }

  // También migrar sets de ex_correr que aún tengan type:'weight'
  const runIds = new Set(['ex_correr', 'ex_hiit']);
  (forge.sessions||[]).forEach(s=>{
    (s.exercises||[]).forEach(ex=>{
      if(!runIds.has(ex.exId)) return;
      ex.sets=(ex.sets||[]).map(set=>{
        if(set.type==='run') return set;
        return {
          type:'run', done:set.done||true,
          distance: set.weight>0?String(set.weight):(set.distance||''),
          time: set.time||'', fc: set.fc||'', pasos: set.pasos||'',
          weight:0, reps:0
        };
      });
    });
  });

  const exIds = new Set(forge.exercises.map(e=>e.id));
  EJERCICIOS_BASE.forEach(e=>{ if(!exIds.has(e.id)) forge.exercises.push(e); });
  // Forzar campos críticos desde EJERCICIOS_BASE sobre ejercicios existentes (bilateral, youtubeId, type)
  EJERCICIOS_BASE.forEach(base=>{
    const ex=forge.exercises.find(e=>e.id===base.id);
    if(ex){
      if(base.bilateral) ex.bilateral=true;
      else delete ex.bilateral;
      if(base.youtubeId) ex.youtubeId=base.youtubeId;
      ex.type=base.type;
      ex.restSec=base.restSec; // Forzar descanso correcto desde base
    }
  });

  // ── Deduplicar rutinas: si hay IDs base Y copias con otro ID del mismo nombre, quitar las copias ──
  const IDS_BASE=new Set(['r_lunes','r_martes','r_mierco','r_jueves','r_jueves_noche','r_cardio']);
  const nombresBase=new Set(RUTINAS_BASE.map(r=>r.name.toLowerCase().trim()));

  // Eliminar duplicados que son copias de las base (mismo nombre pero ID distinto)
  forge.routines=forge.routines.filter(r=>{
    if(IDS_BASE.has(r.id)) return true; // siempre conservar las base
    const n=r.name.toLowerCase().trim();
    // Si tiene nombre de rutina base pero ID distinto → es duplicado, eliminar
    if(nombresBase.has(n)) return false;
    return true; // conservar rutinas personalizadas
  });

  // Agregar las base que falten
  const rIds=new Set(forge.routines.map(r=>r.id));
  RUTINAS_BASE.forEach(r=>{ if(!rIds.has(r.id)) forge.routines.push({...r}); });

  // v172 — Cambio de plan: solo Miércoles / Tren Inferior B
  // Reemplaza Peso Muerto Rumano por Curl Femoral Tumbado en la rutina del miércoles.
  // La rutina del lunes se mantiene intacta con Peso Muerto (Barra).
  (forge.routines||[]).forEach(r=>{
    const id=String(r.id||'').toLowerCase();
    const name=String(r.name||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
    const esMiercoles = id==='r_mierco' || (name.includes('miercoles') && name.includes('tren inferior')) || name.includes('tren inferior b');
    if(!esMiercoles || !Array.isArray(r.exercises)) return;
    r.exercises = r.exercises.map(exId => exId === 'ex_peso_muerto_rum' ? 'ex_curl_fem_tumbado' : exId);
  });

  saveDB();
}

// ---------------------------------------------------------------
//  SCREEN: INICIO
// ---------------------------------------------------------------


// ---------------------------------------------------------------
//  MELQART v181.5 — núcleo corregido exportación + nutrición
// ---------------------------------------------------------------
function mq1815DayOf(ts){
  try { return typeof localDateStr==='function' ? localDateStr(ts) : new Date(ts).toISOString().slice(0,10); }
  catch(e){ return new Date(ts).toISOString().slice(0,10); }
}
function mq1815W(weight,reps){
  return {type:'weight',done:true,weight:parseFloat(weight)||0,reps:parseInt(reps)||0,distance:'',time:'',fc:'',pasos:''};
}
function mq1815R(distance,time,fc='',pasos=''){
  return {type:'run',done:true,weight:0,reps:0,distance:String(distance||''),time:String(time||''),fc:String(fc||''),pasos:String(pasos||'')};
}
function mq1815EnsureEx(id,name,type){
  if(!forge.exercises) forge.exercises=[];
  let e=forge.exercises.find(x=>x.id===id);
  if(!e){ e={id,name,type}; forge.exercises.push(e); }
  e.name=name; e.type=type||e.type;
  return e;
}
function mq1815SetExerciseSets(session, exId, sets){
  if(!session) return false;
  if(!session.exercises) session.exercises=[];
  let ex=session.exercises.find(e=>e.exId===exId);
  if(!ex){ ex={exId,sets:[]}; session.exercises.push(ex); }
  ex.sets=sets;
  return true;
}
function mq1815RepairCoreData(){
  mq1815EnsureEx('ex_step_manc','Step con Mancuerna','dumbbell');
  mq1815EnsureEx('ex_sent_bulgara','Sentadilla Búlgara','dumbbell');
  mq1815EnsureEx('ex_correr','Carrera / Trote','run');
  mq1815EnsureEx('ex_hip_thrust_maq','Hip Thrust (Máquina)','machine');

  const s0801=(forge.sessions||[]).find(s=>mq1815DayOf(s.date)==='2026-01-08' && String(s.routineName||'').toLowerCase().includes('inferior'));
  mq1815SetExerciseSets(s0801,'ex_step_manc',[mq1815W(14,12),mq1815W(14,12),mq1815W(10,14)]);
  mq1815SetExerciseSets(s0801,'ex_sent_bulgara',[mq1815W(14,7),mq1815W(14,7),mq1815W(14,5),mq1815W(14,5)]);

  const s0802=(forge.sessions||[]).find(s=>mq1815DayOf(s.date)==='2026-02-08' && (s.exercises||[]).some(e=>e.exId==='ex_correr'));
  mq1815SetExerciseSets(s0802,'ex_correr',[mq1815R(7.74,'53:19','171','8072')]);

  const s1903=(forge.sessions||[]).find(s=>mq1815DayOf(s.date)==='2026-03-19' && (s.exercises||[]).some(e=>e.exId==='ex_correr'));
  if(s1903 && String(s1903.routineName||'').toLowerCase().includes('sesión libre')) s1903.routineName='Trote';
  if(s1903 && String(s1903.routineName||'').toLowerCase().includes('sesion libre')) s1903.routineName='Trote';

  // Normalizar cualquier variante restante de hip thrust máquina.
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const aliases=['hiptrust maquina','hip thrust maquina','hip thrust (maquina)'];
  const dupIds=(forge.exercises||[]).filter(e=>e.id!=='ex_hip_thrust_maq' && aliases.includes(norm(e.name))).map(e=>e.id);
  (forge.sessions||[]).forEach(sess=>{
    (sess.exercises||[]).forEach(ex=>{
      const def=(forge.exercises||[]).find(e=>e.id===ex.exId);
      if(dupIds.includes(ex.exId) || aliases.includes(norm(def?.name))) ex.exId='ex_hip_thrust_maq';
    });
  });
  forge.exercises=(forge.exercises||[]).filter(e=>!dupIds.includes(e.id));

  try{ localStorage.setItem('melqart_v181_5_core_repaired', new Date().toISOString()); }catch(e){}
}
function mq1815ProteinByMeals(done){
  const n=parseInt(done||0);
  if(n<=0) return 0;
  if(n<=2) return 2;
  if(n<=4) return 6;
  if(n<=6) return 9;
  return 13;
}
function mq1815NutritionForDay(fd){
  const meals=getMealProgress(fd);
  const calc=calcNutritionDayDetail(fd);
  const p=Object.assign({}, calc.portions||{});
  p.proteinas=Math.max(parseFloat(p.proteinas||0), mq1815ProteinByMeals(meals.done));
  if(meals.done===meals.total && meals.total>0){
    p.proteinas=Math.max(parseFloat(p.proteinas||0),13);
    p.cereales=Math.max(parseFloat(p.cereales||0),4.5);
    p.frutas=Math.max(parseFloat(p.frutas||0),2);
    p.lacteoProtein=Math.max(parseFloat(p.lacteoProtein||0),2);
    p.lacteoDescremado=Math.max(parseFloat(p.lacteoDescremado||0),1);
    p.verduras=Math.max(parseFloat(p.verduras||0),2);
    p.lipidos=Math.max(parseFloat(p.lipidos||0),0.5);
  }
  return {meals, portions:p};
}
function mq1815Adherence(meals,p){
  if(meals.done===meals.total && meals.total>0) return 100;
  const groups=['proteinas','lacteoProtein','lacteoDescremado','cereales','frutas','lipidos','verduras']; // aceite excluido
  let done=0,total=0;
  groups.forEach(g=>{
    const t=(NUTRITION_TARGETS&&NUTRITION_TARGETS[g])||0;
    total+=t;
    done+=Math.min(t, parseFloat(p[g]||0));
  });
  return total?Math.round(done/total*100):0;
}
function mq1815FormatRunSet(st){
  const dist=parseFloat(st.distance)||0;
  return dist.toFixed(2)+'km'+(st.time?' - '+fmtTimeStr(st.time):'')+(st.fc?' - FC '+st.fc+'bpm':'');
}

function exportNutritionLines(fechaInicio, fechaFin){
  const out=[];
  const dates=[];
  for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i);
    if(k && k.startsWith('ff_')){
      const f=k.slice(3);
      const d=new Date(f+'T12:00:00');
      if(d>=fechaInicio && d<=fechaFin) dates.push(f);
    }
  }
  dates.sort();
  if(!dates.length) return out;
  out.push('NUTRICION');
  out.push('');
  out.push('Fecha       Agua ml  Vasos    MetaH2O  Comidas  Prot  Cere  Frut  Lact  Verd  Lip   Aceit  Adh%');
  out.push('-----------------------------------------------------------------------------------------------');
  let completeDays=0, waterOk=0, waterSum=0, adhSum=0;
  dates.forEach(f=>{
    const fd=getFD(f);
    const meta=getAguaMeta();
    const vasos=fd.aguaVasosHoy ?? fd.agua ?? 0;
    const aguaMl=fd.aguaMl ?? Math.round(vasos*(meta.mlPorVaso||250));
    const metaMl=(meta.vasos||10)*(meta.mlPorVaso||250);
    const cn=mq1815NutritionForDay(fd);
    const meals=cn.meals;
    const p=cn.portions;
    const adh=mq1815Adherence(meals,p);
    if(aguaMl>=metaMl) waterOk++;
    waterSum+=parseFloat(vasos)||0;
    if(meals.done===meals.total) completeDays++;
    adhSum+=adh;
    const fmt=f.split('-').reverse().join('/');
    out.push(`${fmt.padEnd(10)}  ${String(aguaMl).padEnd(7)}  ${String(vasos+'/'+(meta.vasos||10)).padEnd(7)}  ${(aguaMl>=metaMl?'S':'N').padEnd(7)}  ${String(meals.done+'/'+meals.total).padEnd(7)}  ${String(nRound(p.proteinas||0,2)).padEnd(5)} ${String(nRound(p.cereales||0,2)).padEnd(5)} ${String(nRound(p.frutas||0,2)).padEnd(5)} ${String(nRound((p.lacteoProtein||0)+(p.lacteoDescremado||0),2)).padEnd(5)} ${String(nRound(p.verduras||0,2)).padEnd(5)} ${String(nRound(p.lipidos||0,2)).padEnd(5)} ${String(nRound(p.aceites||0,2)).padEnd(6)} ${String(adh+'%').padEnd(5)}`);
  });
  out.push('');
  out.push(`Resumen (${dates.length} dias con registro):`);
  out.push(`  Agua promedio/dia:         ${dates.length?Math.round(waterSum/dates.length):0}/10 vasos - meta cumplida ${waterOk}/${dates.length} dias (${dates.length?Math.round(waterOk/dates.length*100):0}%)`);
  out.push(`  Comidas dias completos:    ${completeDays}/${dates.length} dias (${dates.length?Math.round(completeDays/dates.length*100):0}%)`);
  out.push(`  Adherencia pauta promedio: ${dates.length?Math.round(adhSum/dates.length):0}%`);
  out.push('  Corrección v181.5 aplicada: aceite excluido; 7/7 comidas = 100%; proteína por platos.');
  out.push('');
  return out;
}

function exportarSemana(){
  // v181.7 reemplazo directo de la función original. No depende de override final.
  if(typeof mq1815RepairCoreData==='function') mq1815RepairCoreData();
  if(typeof melqartFix1816==='function') { try{ melqartFix1816(); }catch(e){} }
  const semanas=parseInt(document.getElementById('export-semanas')?.value||'4');
  const hoy=new Date();
  const lunes=new Date(hoy); lunes.setDate(hoy.getDate()-(hoy.getDay()||7)+1); lunes.setHours(0,0,0,0);
  let fechaInicio;
  if(semanas===0){
    fechaInicio=new Date(0);
  } else {
    fechaInicio=new Date(lunes);
    fechaInicio.setDate(lunes.getDate()-((semanas-1)*7));
  }
  const domingo=new Date(hoy); domingo.setHours(23,59,59,999);
  const ses=(forge.sessions||[]).filter(s=>new Date(s.date)>=fechaInicio&&new Date(s.date)<=domingo).sort((a,b)=>a.date-b.date);
  const fmtDate=d=>new Date(d).toLocaleDateString('es-CL',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const fmtDur=s=>{ const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60; return h>0?(h+'h '+m+'m'):(m+'m '+sec+'s'); };
  const sep='-------------------------------';
  const lines=[];
  lines.push(sep);
  const tituloRango=semanas===0?'HISTORIAL COMPLETO':('ULTIMAS '+semanas+' SEMANA'+(semanas>1?'S':''));
  lines.push(tituloRango);
  lines.push(fechaInicio.toLocaleDateString('es-CL')+' - '+domingo.toLocaleDateString('es-CL'));
  lines.push(sep);
  lines.push('');
  if(typeof exportWeightLines === 'function') lines.push(...exportWeightLines(fechaInicio, domingo));
  if(typeof exportAnthropometryLines === 'function'){
    const anthroLines = exportAnthropometryLines(fechaInicio, domingo);
    if(anthroLines.length) lines.push(...anthroLines);
  }

  if(!ses.length){
    lines.push('Sin sesiones en este periodo.');
  } else {
    const semanaStr=d=>{ const x=new Date(d); const l=new Date(x); l.setDate(x.getDate()-(x.getDay()||7)+1); return l.toLocaleDateString('es-CL',{day:'numeric',month:'long'}); };
    let semActual='';
    lines.push('SESIONES ('+ses.length+' total)');
    lines.push('');
    ses.forEach(s=>{
      const sw=semanaStr(s.date);
      if(sw!==semActual){
        semActual=sw;
        lines.push('> ');
        lines.push('> Semana del '+sw);
      }
      lines.push('> '+fmtDate(s.date)+' - '+(s.routineName||'Sesion libre'));
      if(s.elapsed) lines.push('> Duracion: '+fmtDur(s.elapsed));
      if(s.fcMedia) lines.push('> FC media: '+s.fcMedia+'bpm');
      if(s.kcal)    lines.push('> Calorias: '+s.kcal+'kcal');
      if(s.pasos)   lines.push('> Pasos: '+s.pasos);
      (s.exercises||[]).forEach(ex=>{
        const e=getEx(ex.exId); if(!e) return;
        if(e.type==='warmup'||e.type==='stretch') return;
        const sets=(ex.sets||[]).filter(st=>st.done!==false);
        if(!sets.length) return;
        if(e.type==='run'||e.type==='hiit'||ex.exId==='ex_correr'){
          const seen=new Set();
          const unique=[];
          sets.forEach(st=>{
            const key=[st.distance,st.time,st.fc||'',st.pasos||''].join('|');
            if(!seen.has(key)){ seen.add(key); unique.push(st); }
          });
          unique.forEach(st=>{
            const dist=parseFloat(st.distance)||0;
            lines.push('> '+e.name+': '+dist.toFixed(2)+'km'+(st.time?' - '+fmtTimeStr(st.time):'')+(st.fc?' - FC '+st.fc+'bpm':''));
          });
        } else {
          // v181.7: preservar todas las series, incluso idénticas. No deduplicar sets.
          lines.push('> '+e.name+': '+sets.map(st=>st.weight+'kg x '+st.reps).join(' | '));
        }
      });
      lines.push('');
    });
  }

  if(typeof exportNutritionLines === 'function') {
    const nutritionLines = exportNutritionLines(fechaInicio, domingo);
    if(nutritionLines.length){
      lines.push(sep);
      lines.push(...nutritionLines);
    }
  }
  if(typeof exportRecoveryLines === 'function') {
    const recoveryLines = exportRecoveryLines(fechaInicio, domingo);
    if(recoveryLines.length){
      lines.push(sep);
      lines.push(...recoveryLines);
    }
  }

  lines.push(sep);
  lines.push('Corrección v181.7 aplicada en exportador DIRECTO');
  lines.push('Generado por MELQART - '+new Date().toLocaleDateString('es-CL'));
  const txt=lines.join('\n');
  if(navigator.clipboard){
    navigator.clipboard.writeText(txt).then(()=>showToast('Historial copiado al portapapeles',3000,'ok'));
  } else {
    const modal=document.getElementById('modal-ejercicio');
    modal.querySelector('.modal-title').textContent='Historial exportado';
    modal.querySelector('.modal-body').innerHTML='<textarea style="width:100%;height:300px;font-family:monospace;font-size:11px;border:1px solid var(--border);border-radius:var(--r);padding:10px;resize:none" readonly>'+txt+'</textarea>';
    modal.classList.add('show');
  }
  return txt;
}

function getPesoObjetivo(){
  const def={inicio:103, objetivo:95};
  if(forge.pesoObjetivo) return forge.pesoObjetivo;
  return def;
}
function registrarPesoRapido(){
  openMedModal();
  // Preseleccionar métrica "peso" automáticamente
  setTimeout(()=>{
    const btn=document.querySelector('#modal-med [data-key="peso"]');
    if(btn) btn.click();
    else {
      medKeyActual='peso';
      renderMedModal();
    }
  }, 100);
}
function abrirPesoObjetivo(){
  const po=getPesoObjetivo();
  document.getElementById('po-inicio').value=po.inicio||103;
  document.getElementById('po-objetivo').value=po.objetivo||95;
  openModal('modal-peso-objetivo');
}
function guardarPesoObjetivo(){
  const inicio=parseFloat(document.getElementById('po-inicio').value)||103;
  const objetivo=parseFloat(document.getElementById('po-objetivo').value)||95;
  forge.pesoObjetivo={inicio,objetivo};
  saveDB();
  setTimeout(()=>syncCloud(),500);
  closeModal('modal-peso-objetivo');
  renderPesoBanner();
  showToast('✓ Objetivo actualizado',2000,'ok');
}

// ═══════════════════════════════════════════════════════
//  MELQART DESIGN SYSTEM — SVG Icons + UI Helpers
// ═══════════════════════════════════════════════════════
const MQ = {
  // Ícono balanza (peso)
  balanza:`<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="3" x2="12" y2="19"/><line x1="5" y1="8" x2="19" y2="8"/><circle cx="12" cy="3" r="1.5" fill="currentColor" stroke="none"/><path d="M5,8 L3,15 Q5,17 7,15 L5,8" fill="none"/><path d="M19,8 L17,15 Q19,17 21,15 L19,8" fill="none"/><line x1="4" y1="21" x2="20" y2="21"/></svg>`,
  // Ícono antorcha (racha)
  antorcha:`<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="10" y="15" width="4" height="7" rx="1.5" stroke="currentColor" stroke-width="1.6"/><path d="M12,2 Q8,8 8,12 Q8,15 12,15 Q16,15 16,12 Q16,8 12,2" stroke="#CDA349" stroke-width="1.5" fill="none"/><path d="M12,7 Q10,10 10,12 Q10,14 12,15 Q14,14 14,12 Q14,10 12,7" fill="#CDA349" fill-opacity="0.4" stroke="none"/></svg>`,
  // Ícono columna (sesiones)
  columna:`<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M8,8 Q12,6 16,8"/><rect x="8" y="8" width="8" height="10" rx="1"/><line x1="10" y1="8" x2="10" y2="18" opacity=".3"/><line x1="14" y1="8" x2="14" y2="18" opacity=".3"/><rect x="7" y="18" width="10" height="3" rx="1"/><rect x="6" y="5" width="12" height="3" rx="1"/></svg>`,
  // Ícono ánfora (agua) — turquesa
  anfora:`<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="4" rx="1.5" stroke="#2EC4C7" stroke-width="1.5"/><line x1="8" y1="2" x2="16" y2="2" stroke="#2EC4C7" stroke-width="1.5"/><path d="M9,6 Q6,10 6,15 Q6,20 8,22 L8,23 L16,23 L16,22 Q18,20 18,15 Q18,10 15,6 Z" stroke="#2EC4C7" stroke-width="1.5"/><path d="M9,9 Q4,10 4,16" stroke="#2EC4C7" stroke-width="1.3"/><path d="M15,9 Q20,10 20,16" stroke="#2EC4C7" stroke-width="1.3"/><path d="M12,10 Q10,13 10,16 Q10,19 12,19 Q14,19 14,16 Q14,13 12,10" fill="#2EC4C7" fill-opacity="0.45" stroke="none"/></svg>`,
  // Ícono plato desde arriba (comidas) — dorado
  plato:`<svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="10" fill="#FFF8E6" stroke="#CDA349" stroke-width="1.7"/><circle cx="12" cy="12" r="6.5" fill="none" stroke="#CDA349" stroke-width="1.1"/><circle cx="12" cy="12" r="3" fill="#CDA349" fill-opacity="0.6"/></svg>`,
  // Laurel (logros)
  laurel:`<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M6,17 Q3,13 5,9 Q8,12 7,16"/><path d="M7,16 Q4,12 6,8 Q9,11 8,15"/><path d="M8,15 Q6,11 8,7 Q11,11 9,15"/><path d="M9,14 Q8,10 11,7 Q13,11 11,14"/><path d="M18,17 Q21,13 19,9 Q16,12 17,16"/><path d="M17,16 Q20,12 18,8 Q15,11 16,15"/><path d="M16,15 Q18,11 16,7 Q13,11 15,15"/><path d="M15,14 Q16,10 13,7 Q11,11 13,14"/><path d="M9,17 Q12,19 15,17" stroke-width="1.6"/></svg>`,
};

// Genera anillo SVG de progreso — r=38, circ=238.76
function mqRing(pct, label, sub){
  const r=38, circ=238.76, dash=(pct/100)*circ, gap=circ-dash, off=circ*0.25;
  return '<svg viewBox="0 0 100 100" width="100" height="100" style="display:block">'
    +'<circle cx="50" cy="50" r="'+r+'" fill="none" stroke="var(--mq-ring-bg,#E8E0F8)" stroke-width="9"/>'
    +'<circle cx="50" cy="50" r="'+r+'" fill="none" stroke="var(--mq-purple,#5A2D82)" stroke-width="9"'
    +' stroke-dasharray="'+dash.toFixed(1)+' '+gap.toFixed(1)+'" stroke-dashoffset="'+off.toFixed(1)+'" stroke-linecap="round"/>'
    +'<text x="50" y="46" text-anchor="middle" font-size="18" font-weight="800" fill="#5A2D82" font-family="Montserrat, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif">'+label+'</text>'
    +(sub?'<text x="50" y="61" text-anchor="middle" font-size="8.5" font-weight="600" fill="#9B7FC7" font-family="Montserrat, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif">'+sub+'</text>':'')
    +'</svg>';
}

// Ánforas agua: activas ON (turquesa), OFF (gris)
function mqAnforas(activas, total){
  let h='<div class="mq-tracker-row">';
  for(let i=0;i<total;i++){
    const on=i<activas;
    h+='<button class="mq-anfora-btn'+(on?' on':'')+'" onclick="mqToggleAnfora('+i+')" aria-label="Ánfora '+(i+1)+'">'+MQ.anfora+'</button>';
  }
  h+='</div><div class="mq-tracker-lbl" style="color:#2EC4C7">'+activas+' / '+total+' ánforas</div>';
  return h;
}

// Platos comidas: ON (dorado), OFF (gris)
function mqPlatos(activas, total){
  let h='<div class="mq-tracker-row">';
  for(let i=0;i<total;i++){
    const on=i<activas;
    h+='<div class="mq-plato-btn'+(on?'':' off')+'" aria-label="Comida '+(i+1)+'">'+MQ.plato+'</div>';
  }
  h+='</div><div class="mq-tracker-lbl" style="color:#CDA349">'+activas+' / '+total+' comidas</div>';
  return h;
}

// Toggle ánfora desde home (sincroniza con sistema existente)
function mqToggleAnfora(idx){
  const fd=getFD(typeof foodDate!=='undefined'?foodDate:today());
  const cps=getAguaCps(fd);
  cps[idx]=!cps[idx];
  fd.aguaCps=cps;
  fd.agua=cps.filter(Boolean).length;
  saveFD(fd);
  const totalMl=AGUA_CPS.filter((_,i)=>cps[i]).reduce((a,c)=>a+c.ml,0);
  if(totalMl>=AGUA_META_ML) showToast('Meta de agua alcanzada',2500,'ok');
  renderHomeWaterCard();
  renderAguaCheckpoints(fd);
}

// Gráfico sparkline últimos 7 pesajes en SVG
function mqPesoChart(mets){
  if(!mets||mets.length<2) return '';
  const datos=mets.slice(-7);
  const W=200,H=60,pad=6;
  const pesos=datos.map(m=>m.peso);
  const min=Math.min(...pesos)-0.5, max=Math.max(...pesos)+0.5;
  const xStep=(W-pad*2)/(datos.length-1);
  const yOf=p=>pad+(1-(p-min)/(max-min))*(H-pad*2);
  const pts=datos.map((m,i)=>[pad+i*xStep, yOf(m.peso)]);
  const pathD='M'+pts.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join(' L');
  const areaD=pathD+' L'+pts[pts.length-1][0].toFixed(1)+','+(H-pad)+' L'+pad+','+(H-pad)+' Z';
  const dias=['D','L','M','M','J','V','S'];
  let svg='<svg viewBox="0 0 '+W+' '+H+'" width="100%" style="overflow:visible;display:block" id="peso-sparkline">';
  svg+='<defs><linearGradient id="pgr" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#5A2D82" stop-opacity="0.28"/><stop offset="100%" stop-color="#5A2D82" stop-opacity="0.03"/></linearGradient></defs>';
  svg+='<path d="'+areaD+'" fill="url(#pgr)" stroke="none"/>';
  svg+='<path d="'+pathD+'" fill="none" stroke="#5A2D82" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
  // Puntos con tooltip via data-* attrs
  pts.forEach((p,i)=>{
    const isLast=i===pts.length-1;
    const m=datos[i];
    // Calcular variación respecto al punto anterior
    let varStr='';
    if(i>0){
      const diff=parseFloat((parseFloat(m.peso)-parseFloat(datos[i-1].peso)).toFixed(1));
      varStr=(diff>0?'+':'')+diff+' kg';
    }
    // Fecha formateada DD/MM/YYYY
    const d=new Date(m.date+'T12:00:00');
    const fechaFmt=String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear();
    // Zona de toque amplia (rect invisible)
    svg+=`<rect x="${(p[0]-8).toFixed(1)}" y="${(p[1]-8).toFixed(1)}" width="16" height="16" fill="transparent" style="cursor:pointer"
      data-peso="${m.peso}" data-fecha="${fechaFmt}" data-var="${varStr}"
      onmouseenter="mqPesoTT(event,this)" onmouseleave="mqPesoTTHide()"
      ontouchstart="mqPesoTT(event,this)" ontouchend="mqPesoTTHide()"/>`;
    svg+='<circle cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="'+(isLast?4:2.5)+'" fill="'+(isLast?'#5A2D82':'#B79CFF')+'" stroke="'+(isLast?'#fff':'none')+'" stroke-width="1.5" style="pointer-events:none"/>';
    if(isLast){
      svg+='<text x="'+p[0].toFixed(1)+'" y="'+(p[1]-8).toFixed(1)+'" text-anchor="middle" font-size="9" font-weight="700" fill="#5A2D82" font-family="sans-serif" style="pointer-events:none">'+datos[i].peso+'</text>';
    }
  });
  svg+='</svg>';
  return svg;
}

// Tooltip del gráfico de peso
(function(){
  if(document.getElementById('peso-tt')) return;
  const el=document.createElement('div');
  el.id='peso-tt';
  el.style.cssText='position:fixed;background:#181B1D;color:#fff;border-radius:8px;padding:7px 10px;font-size:11px;line-height:1.55;pointer-events:none;z-index:9999;display:none;max-width:160px;box-shadow:0 4px 16px rgba(0,0,0,.22)';
  document.body.appendChild(el);
})();

function mqPesoTT(evt,el){
  const tt=document.getElementById('peso-tt'); if(!tt) return;
  const peso=el.dataset.peso, fecha=el.dataset.fecha, vari=el.dataset.var;
  tt.innerHTML=`<div style="font-size:13px;font-weight:700">${peso} kg</div>`
    +`<div style="font-size:10px;opacity:.7;margin-top:2px">${fecha}</div>`
    +(vari?`<div style="font-size:11px;margin-top:3px;color:${vari.startsWith('-')?'#7ECBA1':'#F4A261'}">${vari}</div>`:'');
  tt.style.display='block';
  const touch=evt.touches&&evt.touches[0];
  const x=touch?touch.clientX:evt.clientX, y=touch?touch.clientY:evt.clientY;
  const W=window.innerWidth;
  tt.style.left=(x+12+160>W?x-172:x+12)+'px';
  tt.style.top=(y-44)+'px';
}
function mqPesoTTHide(){
  const tt=document.getElementById('peso-tt'); if(tt) tt.style.display='none';
}
document.addEventListener('scroll',mqPesoTTHide,{passive:true,capture:true});


function renderPesoBanner(){
  const el=document.getElementById('home-peso-banner'); if(!el) return;
  const po=getPesoObjetivo();
  const PESO_INICIO=po.inicio, PESO_OBJETIVO=po.objetivo;
  const BRECHA=PESO_INICIO-PESO_OBJETIVO;
  if(BRECHA<=0){ el.innerHTML=''; return; }
  const mets=(forge.bodyMetrics||[]).filter(m=>m.peso).sort((a,b)=>a.date.localeCompare(b.date));
  if(!mets.length){ el.innerHTML=''; return; }
  const actual=mets[mets.length-1].peso;
  const perdidos=Math.max(0,parseFloat((PESO_INICIO-actual).toFixed(1)));
  const faltan=Math.max(0,parseFloat((actual-PESO_OBJETIVO).toFixed(1)));
  const pct=Math.min(100,Math.round((perdidos/BRECHA)*100));
  const completado=actual<=PESO_OBJETIVO;
  const colPct=completado?'var(--green)':'#5A2D82';

  el.innerHTML=
    // Card principal
    '<div class="mq-home-card">'
    // Header fila
    +'<div class="mq-hrow mq-hrow-sb" style="margin-bottom:10px">'
      +'<div class="mq-hrow" style="gap:8px;color:#5A2D82">'+MQ.balanza+'<span class="mq-kicker">Peso de la semana</span></div>'
      +'<div class="mq-hrow" style="gap:6px">'
        +'<button class="mq-btn-pill" onclick="registrarPesoRapido()">+ Peso</button>'
        +'<button class="mq-btn-icon" onclick="abrirPesoObjetivo()" title="Editar objetivo">✏</button>'
      +'</div>'
    +'</div>'
    // KPI + sparkline + ring
    +'<div class="mq-hrow" style="align-items:flex-start;gap:12px">'
      // Columna izquierda: KPI + gráfico
      +'<div style="flex:1;min-width:0">'
        +'<div style="display:flex;align-items:baseline;gap:6px;margin-bottom:8px">'
          +'<span class="mq-kpi-big">'+actual+'</span>'
          +'<span class="mq-kpi-unit">kg</span>'
          +'<span style="font-size:11px;color:var(--ink3);margin-left:4px">'+(faltan>0?'faltan '+faltan+'kg':'✓ meta')+'</span>'
        +'</div>'
        // Sparkline últimos 7 pesajes
        +mqPesoChart(mets)
        // sin barra de progreso — el ring ya lo muestra
      +'</div>'
      // Columna derecha: ring + meta
      +'<div style="text-align:center;flex-shrink:0">'
        +'<div style="font-size:10px;color:var(--ink3);margin-bottom:4px">Meta</div>'
        +'<div style="font-size:18px;font-weight:800;color:#CDA349">'+PESO_OBJETIVO+' kg</div>'
        +'<div style="margin-top:6px">'+mqRing(pct,pct+'%','Progreso')+'</div>'
      +'</div>'
    +'</div>'
    +'</div>';
}

function renderStreakBanner(){
  const el=document.getElementById('home-streak-banner'); if(!el) return;
  const anio=new Date().getFullYear()+'';
  const rachaActual=calcStreak();
  const rachaMejor=calcMaxStreak();
  const mejor=getMejorSemanaAnio(anio);
  const hoyLunes=getLunesDe(today());
  const mapSem=getSesionesXSemana();
  const estaSemana=mapSem[hoyLunes]||0;
  if(!rachaActual&&!mejor.count){ el.innerHTML=''; return; }
  const esNuevaMejor=mejor.lunes===hoyLunes&&estaSemana>0;

  el.innerHTML='<div class="mq-home-card">'
    +'<div class="mq-hrow mq-hrow-sb" style="margin-bottom:10px;color:#5A2D82">'
      +MQ.laurel
      +'<span class="mq-kicker" style="flex:1;margin-left:8px">Seguimiento · '+anio+'</span>'
      +(esNuevaMejor?'<span class="mq-chip-gold">Nueva mejor</span>':'')
    +'</div>'
    +'<div class="mq-hrow" style="gap:20px;flex-wrap:wrap">'
      +'<div><div class="mq-stat-val" style="color:#5A2D82">'+rachaActual+'</div><div class="mq-stat-lbl">Racha</div></div>'
      +(rachaMejor>rachaActual?'<div><div class="mq-stat-val">'+rachaMejor+'</div><div class="mq-stat-lbl">Mejor racha</div></div>':'')
      +(mejor.count?'<div><div class="mq-stat-val" style="color:#CDA349">'+mejor.count+'</div><div class="mq-stat-lbl">Mejor semana</div></div>':'')
      +'<div><div class="mq-stat-val">'+estaSemana+'</div><div class="mq-stat-lbl">Esta semana</div></div>'
    +'</div>'
    +(mejor.lunes?'<div class="mq-stat-lbl" style="margin-top:6px;color:var(--ink3)">'+fmtRangoSemana(mejor.lunes)+'</div>':'')
    +'</div>';
}

function renderHome(){
  const dias  =['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const meses =['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const hoy   = new Date();
  const nombre= currentUser?.displayName?.split(' ')[0]||'Diego';

  document.getElementById('home-greet').innerHTML=`
    <div class="home-greet-date">${dias[hoy.getDay()]} ${hoy.getDate()} de ${meses[hoy.getMonth()]}</div>
    <div class="home-greet-title">Hola, ${nombre}</div>`;

  renderHomePlanBanner();
  renderPesoBanner();
  renderHomeNutritionCard();
  renderHomeWaterCard();
  renderCreatinaCard();
  renderSuenoCard();

  const ses    = forge.sessions||[];
  const statsEl=document.getElementById('home-stats');
  if(statsEl){ statsEl.innerHTML=''; statsEl.style.display='none'; }

  const ultimas = [...ses].sort((a,b)=>b.date-a.date);
  const el = document.getElementById('home-sessions');
  if(!ultimas.length){
    el.innerHTML=`<div class="empty"><div class="empty-icon">◈</div><div class="empty-text">Sin sesiones aún</div><div class="empty-sub">Inicia tu primera rutina para ver el historial.</div></div>`;
    return;
  }
  el.innerHTML=ultimas.map(s=>renderSesCard(s,hoy)).join('');
}

function renderHomePlanBanner(){
  const plan=(forge.planes||[]).find(p=>p.activo);
  const el=document.getElementById('home-plan-banner');
  const elStats=document.getElementById('home-stats');
  const elStreak=document.getElementById('home-streak-banner');
  if(elStats){ elStats.innerHTML=''; elStats.style.display='none'; }
  if(elStreak){ elStreak.innerHTML=''; elStreak.style.display='none'; }
  if(!el) return;
  el.style.display='block';

  const hoy=new Date();
  const sesiones=forge.sessions||[];
  const wStart=new Date(hoy);
  wStart.setDate(hoy.getDate()-(hoy.getDay()||7)+1);
  wStart.setHours(0,0,0,0);
  const sesionesSemana=sesiones.filter(s=>new Date(s.date)>=wStart).length;
  const racha=calcStreak();
  const totalSesiones=sesiones.length;
  const anio=hoy.getFullYear()+'';
  const mejor=getMejorSemanaAnio(anio);

  if(!plan){
    el.innerHTML=`
      <section class="home-plan-unified">
        <div class="home-plan-unified__top">
          <div>
            <h2 class="home-plan-unified__title">¿Cómo vamos con el plan?</h2>
            <div class="home-plan-unified__name">Sin plan activo</div>
            <div class="home-plan-unified__block">Crea o activa un plan para ver tu progreso.</div>
          </div>
        </div>
      </section>`;
    return;
  }

  const semG=semanaActualPlan(plan);
  const totalSemanas=plan.totalSemanas||16;
  const pct=Math.min(100,Math.round((semG/totalSemanas)*100));
  const bloque=plan.bloques?.[Math.floor((semG-1)/4)]||{nombre:'—'};

  // ── Adherencia nutricional y agua (días completados) ──
  const HOY = today();
  let diasNutriOK = 0, diasAguaOK = 0;
  // Contar días del mes actual con pauta completa
  const mesStr = HOY.slice(0, 7);
  for (let d = 1; d <= new Date().getDate(); d++) {
    const f = `${mesStr}-${String(d).padStart(2,'0')}`;
    try {
      const r = localStorage.getItem('ff_' + f);
      if (r) {
        const fd2 = JSON.parse(r);
        // Nutrición completa: ≥5 comidas marcadas
        const mealsDone = (fd2.meals||[]).filter(m=>m.done).length + (fd2.extraFoods||[]).length;
        if (mealsDone >= 5 || fd2.allDone) diasNutriOK++;
        // Agua completa: ≥7 checkpoints o ≥2500ml
        const aguaCps = (fd2.aguaCps||[]).filter(Boolean).length;
        const aguaMl = fd2.aguaMl || 0;
        if (aguaCps >= 7 || aguaMl >= 2500) diasAguaOK++;
      }
    } catch {}
  }

  // ── Ejercicio del día según plan ──
  const diasOrden = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  const diaHoyNombre = diasOrden[new Date().getDay()];
  const rutinaHoy = (forge.routines||[]).find(r => r.name.toLowerCase().includes(diaHoyNombre));
  const ejHoyHtml = rutinaHoy
    ? `<div class="home-plan-ej-hoy">Hoy: <strong>${rutinaHoy.name}</strong></div>`
    : '';

  el.innerHTML=`
    <section class="home-plan-unified">
      <div class="home-plan-unified__top">
        <div>
          <div class="home-plan-unified__eyebrow">Plan activo · Sem ${semG}/${totalSemanas}</div>
          <h2 class="home-plan-unified__title">¿Cómo vamos con el plan?</h2>
          <div class="home-plan-unified__name">${plan.nombre}</div>
          <div class="home-plan-unified__block">Bloque actual: <strong>${bloque.nombre}</strong></div>
        </div>
        <div class="home-plan-unified__status">
          <div class="home-plan-unified__badge">Plan activo</div>
          <div class="home-plan-unified__week">${semG}<span>/${totalSemanas}</span></div>
        </div>
      </div>
      <div class="home-plan-unified__bar"><div class="home-plan-unified__bar-fill" style="width:${pct}%"></div></div>
      <div class="home-plan-unified__metrics">
        <div class="home-plan-unified__metric">
          <div class="home-plan-unified__metric-value">${sesionesSemana}</div>
          <div class="home-plan-unified__metric-label">Esta semana</div>
        </div>
        <div class="home-plan-unified__metric">
          <div class="home-plan-unified__metric-value purple">${racha}</div>
          <div class="home-plan-unified__metric-label">Racha</div>
        </div>
        <div class="home-plan-unified__metric">
          <div class="home-plan-unified__metric-value">${totalSesiones}</div>
          <div class="home-plan-unified__metric-label">Total sesiones</div>
        </div>
      </div>
      <div class="home-plan-adherencia">
        <div class="home-plan-adherencia-item">
          <div class="home-plan-adherencia-val">${diasNutriOK}</div>
          <div class="home-plan-adherencia-lbl">Nutrición ✓</div>
        </div>
        <div class="home-plan-adherencia-item">
          <div class="home-plan-adherencia-val">${diasAguaOK}</div>
          <div class="home-plan-adherencia-lbl">Agua ✓</div>
        </div>
        <div class="home-plan-adherencia-item" style="border-left:1px solid var(--border);padding-left:12px;text-align:left;flex:2;display:flex;align-items:center">
          <div style="font-size:10px;color:var(--ink3)">Días completados<br>este mes</div>
        </div>
      </div>
      ${ejHoyHtml}
      ${mejor?.count?`<div class="home-plan-unified__best" style="margin-top:6px">Mejor semana: <strong>${mejor.count} sesiones</strong></div>`:''}
    </section>`;
}

// Calcular ritmo promedio de una sesión de carrera
function calcSesRitmo(s){
  let totalDist=0, totalMins=0, fcSum=0, fcCount=0, totalPasos=0;
  (s.exercises||[]).forEach(ex=>{
    const e=getEx(ex.exId); if(!e) return;
    if(e.type!=='run'&&e.type!=='hiit') return;
    // Acepta sets con o sin done:true — solo necesita distancia o tiempo
    (ex.sets||[]).filter(set=>parseFloat(set.distance)>0||set.time).forEach(set=>{
      const dist=parseFloat(set.distance)||0;
      if(dist>0) totalDist+=dist;
      if(set.time){
        const t=String(set.time);
        if(t.includes(':')){
          const parts=t.split(':');
          if(parts.length===3){
            // hh:mm:ss
            totalMins+=(parseInt(parts[0])||0)*60+(parseInt(parts[1])||0)+(parseInt(parts[2])||0)/60;
          } else {
            // mm:ss
            totalMins+=(parseInt(parts[0])||0)+(parseInt(parts[1])||0)/60;
          }
        } else {
          // segundos crudos (legacy)
          const secs=parseInt(t)||0;
          totalMins+=secs/60;
        }
      }
      if(set.fc){ fcSum+=parseFloat(set.fc)||0; fcCount++; }
      if(set.pasos) totalPasos+=parseInt(set.pasos)||0;
    });
  });
  // Si no hay tiempo explícito pero sí hay elapsed en la sesión, usarlo para calcular ritmo
  if(totalDist>0 && totalMins===0 && s.elapsed){
    totalMins = s.elapsed/60;
  }
  return {
    dist:totalDist,
    ritmo: totalDist>0&&totalMins>0 ? totalMins/totalDist : 0,
    fcMedia: fcCount>0 ? Math.round(fcSum/fcCount) : 0,
    pasos: totalPasos
  };
}

function esSesSoloCardio(s){
  const exs=s.exercises||[];
  // Ignorar warmup y stretch al evaluar si es sesión de cardio
  const relevantes=exs.filter(ex=>{ const e=getEx(ex.exId); return e?.type!=='warmup'&&e?.type!=='stretch'; });
  return relevantes.length>0 && relevantes.every(ex=>{ const e=getEx(ex.exId); return e?.type==='run'||e?.type==='hiit'; });
}

function renderSesCard(s, hoy){
  const fecha    = new Date(s.date);
  // Comparar por fecha local (no UTC) para evitar desfase en Santiago UTC-3
  const hoyStr  = `${hoy.getFullYear()}-${hoy.getMonth()}-${hoy.getDate()}`;
  const fStr    = `${fecha.getFullYear()}-${fecha.getMonth()}-${fecha.getDate()}`;
  const hoyMid  = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const fMid    = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  const dias    = Math.round((hoyMid - fMid) / 86400000);
  const cuando   = dias===0?'Hoy':dias===1?'Ayer':`Hace ${dias} días`;
  const durStr   = s.elapsed?fmtTime(s.elapsed):'—';
  const esCardio = esSesSoloCardio(s);
  const ritmoData = esCardio ? calcSesRitmo(s) : null;

  // Métricas secundarias
  let metaRow='';
  if(esCardio && ritmoData){
    const distStr = ritmoData.dist>0 ? `${ritmoData.dist.toFixed(2)} km` : '—';
    const ritmoStr= ritmoData.ritmo>0 ? `${Math.floor(ritmoData.ritmo)}'${pad(Math.round((ritmoData.ritmo%1)*60))}"/km` : '—';
    // Zancada autocalculada: (dist_m / pasos) × 100 = cm/paso
    let zancadaStr = '';
    if(ritmoData.pasos>0 && ritmoData.dist>0){
      const zCm = Math.round((ritmoData.dist * 1000 / ritmoData.pasos) * 100 * 10) / 10;
      zancadaStr = `<div class="hm-item"><div class="hm-label">Zancada</div><div class="hm-val" style="color:var(--teal)">${zCm} cm</div></div>`;
    }
    metaRow=`
      <div class="hm-item"><div class="hm-label">Distancia</div><div class="hm-val">${distStr}</div></div>
      <div class="hm-item"><div class="hm-label">Ritmo</div><div class="hm-val">${ritmoStr}</div></div>
      ${ritmoData.fcMedia>0?`<div class="hm-item"><div class="hm-label">FC media</div><div class="hm-val" style="color:#f87171">❤️ ${ritmoData.fcMedia}</div></div>`:''}
      ${ritmoData.pasos>0?`<div class="hm-item"><div class="hm-label">Pasos</div><div class="hm-val" style="color:var(--blue)">👟 ${fmtMiles(ritmoData.pasos)}</div></div>`:''}
      ${zancadaStr}`;
  } else {
    const volStr = s.totalVolume ? `${fmtMiles(s.totalVolume)} kg` : '—';
    const nSeries = (s.exercises||[]).reduce((a,ex)=>a+(ex.sets||[]).filter(s=>s.done).length,0);
    const records = calcSesRecords(s);
    // FC: puede venir del campo top-level o del primer set de cardio de la sesión
    const fcVal = s.fcMedia || s.fc || 0;
    const kcalVal = s.kcal || 0;
    metaRow=`
      <div class="hm-item"><div class="hm-label">Volumen</div><div class="hm-val">${volStr}</div></div>
      ${nSeries?`<div class="hm-item"><div class="hm-label">Series</div><div class="hm-val">${nSeries}</div></div>`:''}
      ${records?`<div class="hm-item"><div class="hm-label">Récords</div><div class="hm-val">🏅 ${records}</div></div>`:''}
      ${fcVal>0?`<div class="hm-item"><div class="hm-label">FC media</div><div class="hm-val" style="color:#f87171">❤️ ${fcVal} bpm</div></div>`:''}
      ${kcalVal>0?`<div class="hm-item"><div class="hm-label">Calorías</div><div class="hm-val" style="color:var(--gold)">✦ ${kcalVal} kcal</div></div>`:''}`;
  }

  // Emoji e ícono según tipo de sesión
  const esCardioFlag = esCardio;
  const rutEmoji = esCardioFlag ? '↝' : s.routineId ? (
    (forge.routines||[]).find(r=>r.id===s.routineId)?.emoji || '◈'
  ) : '◈';

  const exs = (s.exercises||[]).slice(0,3);
  return `
  <div class="hevy-card" onclick="openSesDetail('${s.id}')">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
      <div class="hevy-avatar" style="font-size:16px">${rutEmoji}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:16px;font-weight:800;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.routineName||'Sesión libre'}</div>
        <div style="font-size:11px;color:var(--ink3)">${cuando}</div>
      </div>
    </div>
    <div class="hevy-meta">
      <div class="hm-item"><div class="hm-label">Tiempo</div><div class="hm-val">${durStr}</div></div>
      ${metaRow}
    </div>
    <div style="border-top:1px solid var(--border);padding-top:8px;margin-top:4px">
      ${exs.map(ex=>{ const e=getEx(ex.exId); const n=(ex.sets||[]).filter(s=>s.done).length; return e?`<div style="font-size:12px;color:var(--ink2);padding:2px 0">${n} serie${n!==1?'s':''} ${e.name}</div>`:''; }).join('')}
      ${(s.exercises||[]).length>3?`<div style="font-size:11px;color:var(--orange);margin-top:3px">Ver ${(s.exercises||[]).length-3} más</div>`:''}
    </div>
    ${s.foto?`<div style="margin-top:8px;border-radius:var(--r);overflow:hidden;max-height:160px"><img src="${s.foto}" style="width:100%;object-fit:cover;max-height:160px;display:block"></div>`:''}
  </div>`;
}

function calcSesRecords(s){
  let n=0;
  (s.exercises||[]).forEach(ex=>{
    const pr=getPR(ex.exId);
    const best=(ex.sets||[]).filter(s=>s.done&&s.weight).sort((a,b)=>b.weight-a.weight)[0];
    if(best&&best.weight>0&&best.weight>=(pr.weight||0)) n++;
  });
  return n;
}

// Detalle sesión
function openSesDetail(id){
  const s=(forge.sessions||[]).find(x=>x.id===id); if(!s) return;
  const fecha=new Date(s.date).toLocaleDateString('es',{weekday:'long',day:'numeric',month:'short',year:'numeric'});
  const hora=new Date(s.date).toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'});
  const dur=s.elapsed?fmtTime(s.elapsed):'—';
  const vol=s.totalVolume?`${fmtMiles(s.totalVolume)} kg`:'—';
  const nS=(s.exercises||[]).reduce((a,ex)=>a+(ex.sets||[]).filter(s=>s.done).length,0);
  const rec=calcSesRecords(s);
  const div=calcDivMuscular(s);

  document.getElementById('ses-detail-body').innerHTML=`
    <div style="padding:16px;border-bottom:1px solid var(--border)">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <div class="hevy-avatar">${(currentUser?.displayName||'DM').slice(0,2).toUpperCase()}</div>
        <div style="flex:1"><div style="font-size:13px;font-weight:700">${currentUser?.displayName||'Diego'}</div><div style="font-size:11px;color:var(--ink3)">${fecha} − ${hora}</div></div>
        <button class="btn btn-s btn-sm" onclick="openEditSesion('${id}')">✏ Editar</button>
      </div>
      <div style="font-size:22px;font-weight:800;margin-bottom:12px">${s.routineName||'Sesión libre'}</div>
      <div class="hevy-meta">
        <div class="hm-item"><div class="hm-label">Tiempo</div><div class="hm-val">${dur}</div></div>
        <div class="hm-item"><div class="hm-label">Volumen</div><div class="hm-val">${vol}</div></div>
        <div class="hm-item"><div class="hm-label">Series</div><div class="hm-val">${nS}</div></div>
        ${rec?`<div class="hm-item"><div class="hm-label">Récords</div><div class="hm-val">🏅 ${rec}</div></div>`:''}
      </div>
    </div>
    ${div.length?`<div style="padding:16px;border-bottom:1px solid var(--border)">
      <div class="section-label">División muscular</div>
      ${div.map(d=>`<div style="margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:3px"><span style="font-weight:600">${d.g}</span><span style="color:var(--ink3)">${d.p}%</span></div>
        <div class="division-bar"><div class="division-fill" style="width:${d.p}%"></div></div>
      </div>`).join('')}
    </div>`:''}
    <div style="padding:16px">
      <div class="section-label">Ejercicios</div>
      ${(s.exercises||[]).map(ex=>{
        const e=getEx(ex.exId); if(!e) return '';
        const sets=(ex.sets||[]).filter(s=>s.done);
        const isRun=e.type==='run'||e.type==='hiit';
        return `<div style="margin-bottom:20px">
          <div onclick="closeSesDetail();goTo('progress');setTimeout(()=>openExDetail('${ex.exId}'),80)"
            style="font-size:16px;font-weight:700;color:var(--orange);margin-bottom:8px;cursor:pointer;display:flex;align-items:center;justify-content:space-between">
            <span>${e.name}</span>
            <span style="font-size:11px;font-weight:400;color:var(--ink3);letter-spacing:.5px">Ver progreso →</span>
          </div>
          <div style="display:grid;grid-template-columns:48px 1fr;font-size:10px;color:var(--ink3);letter-spacing:1px;text-transform:uppercase;padding:4px;margin-bottom:2px">
            <span>Serie</span><span>${isRun?'Distancia / Tiempo':'Peso y Reps'}</span>
          </div>
          ${sets.map((set,i)=>`
          <div style="display:grid;grid-template-columns:48px 1fr;padding:7px 4px;border-radius:6px;background:${i%2===0?'var(--bg3)':'transparent'}">
            <span style="font-size:16px;font-weight:700;color:var(--ink)">${i+1}</span>
            <span style="font-size:14px;color:var(--ink2)">${isRun?
              [set.distance?set.distance+'km':'',set.time||''].filter(Boolean).join(' · ')+
              (set.fc?` ❤️${set.fc}bpm`:'')+(set.pasos?` 👟${fmtMiles(parseInt(set.pasos))}p`:'')
              :(set.weight||0)+' kg × '+(set.reps||0)}</span>
          </div>`).join('')}
        </div>`;
      }).join('')}
      <button class="btn btn-r btn-sm" style="margin-top:12px" onclick="deleteSesion('${id}')">🗑 Eliminar sesión</button>
    </div>`;
  document.getElementById('ses-detail').classList.add('on');
}
function closeSesDetail(){ document.getElementById('ses-detail').classList.remove('on'); }

function deleteSesion(id){
  if(!confirm('¿Eliminar esta sesión? No se puede deshacer.')) return;
  forge.sessions=(forge.sessions||[]).filter(s=>s.id!==id);
  saveDB(); closeSesDetail(); renderHome(); showToast('Sesión eliminada');
}

function openEditSesion(id){
  const s=(forge.sessions||[]).find(x=>x.id===id); if(!s) return;
  // Precargamos el modal de edición
  const fechaStr=localDateStr(s.date);
  const durMins=Math.floor((s.elapsed||0)/60);
  document.getElementById('edit-ses-id').value=id;
  document.getElementById('edit-ses-fecha-wrap').innerHTML=renderDatePicker('edit-ses-fecha',fechaStr);
  document.getElementById('edit-ses-nombre').value=s.routineName||'';

  // Duración: mostrar siempre (fuerza y cardio)
  document.getElementById('edit-dur-field').style.display='block';
  setDurSelects(s.elapsed||0);
  document.getElementById('edit-ses-fc').value=s.fcMedia||s.fc||'';
  document.getElementById('edit-ses-kcal').value=s.kcal||'';
  renderEditSesExs(s);
  closeSesDetail();
  openModal('modal-edit-ses');
}

function renderEditSesExs(s){
  const container=document.getElementById('edit-ses-exs');
  container.innerHTML=(s.exercises||[]).map((ex,ei)=>{
    const e=getEx(ex.exId); if(!e) return '';
    const isRun=e.type==='run'||e.type==='hiit';
    return `<div style="margin-bottom:14px;background:var(--bg3);border-radius:var(--r);padding:10px 12px">
      <div style="font-size:13px;font-weight:700;color:var(--orange);margin-bottom:8px">${e.name}</div>
      ${ex.sets.map((set,si)=>isRun?`
        <div style="margin-bottom:10px;border-bottom:1px solid var(--border);padding-bottom:10px">
          <div style="display:grid;grid-template-columns:28px 1fr auto;gap:6px;align-items:center;margin-bottom:5px">
            <span style="font-size:13px;font-weight:700;color:var(--ink3)">${si+1}</span>
            <input class="inp" type="text" placeholder="km (ej: 7.74)" value="${set.distance||''}" oninput="updateEditSet('${s.id}',${ei},${si},'distance',this.value)" style="padding:7px;font-size:13px">
            <button onclick="deleteEditSet('${s.id}',${ei},${si})" style="background:none;border:none;color:var(--red);cursor:pointer;padding:4px;font-size:16px">✕</button>
          </div>
          <div style="display:grid;grid-template-columns:28px 1fr 1fr;gap:6px;align-items:center;margin-bottom:5px">
            <div></div>
            <select class="dp-sel" id="edit-time-mm-${ei}-${si}" style="font-size:13px;padding:7px" onchange="updateEditTimeFromSel('${s.id}',${ei},${si})">${[...Array(180)].map((_,i)=>'<option value="'+i+'"'+(getEditTimeMM(set.time)===i?' selected':'')+'>'+String(i).padStart(2,'0')+' min</option>').join('')}</select>
            <select class="dp-sel" id="edit-time-ss-${ei}-${si}" style="font-size:13px;padding:7px" onchange="updateEditTimeFromSel('${s.id}',${ei},${si})">${[...Array(60)].map((_,i)=>'<option value="'+i+'"'+(getEditTimeSS(set.time)===i?' selected':'')+'>'+String(i).padStart(2,'0')+' s</option>').join('')}</select>
          </div>
          <div style="display:grid;grid-template-columns:28px 1fr 1fr;gap:6px">
            <div></div>
            <input class="inp" type="number" placeholder="❤️ FC media (bpm)" value="${set.fc||''}" oninput="updateEditSet('${s.id}',${ei},${si},'fc',this.value)" style="padding:7px;font-size:12px;color:#f87171;border-color:#7f1d1d" inputmode="numeric">
            <input class="inp" type="number" placeholder="👟 Pasos" value="${set.pasos||''}" oninput="updateEditSet('${s.id}',${ei},${si},'pasos',this.value)" style="padding:7px;font-size:12px;color:var(--blue);border-color:#1e3a8a" inputmode="numeric">
          </div>
        </div>
      `:`
        <div style="display:grid;grid-template-columns:28px 1fr 1fr auto;gap:6px;align-items:center;margin-bottom:6px">
          <span style="font-size:13px;font-weight:700;color:var(--ink3)">${si+1}</span>
          <input class="inp" type="text" placeholder="kg" value="${set.weight||''}" oninput="updateEditSet('${s.id}',${ei},${si},'weight',this.value)" style="padding:7px;font-size:13px" inputmode="decimal">
          <input class="inp" type="number" placeholder="reps" value="${set.reps||''}" oninput="updateEditSet('${s.id}',${ei},${si},'reps',this.value)" style="padding:7px;font-size:13px" inputmode="numeric">
          <button onclick="deleteEditSet('${s.id}',${ei},${si})" style="background:none;border:none;color:var(--red);cursor:pointer;padding:4px;font-size:16px">✕</button>
        </div>
      `).join('')}
      <button onclick="addEditSet('${s.id}',${ei})" style="background:none;border:none;color:var(--orange);cursor:pointer;font-size:12px;font-weight:600;padding:4px 0">+ Serie</button>
    </div>`;
  }).join('');
}

function getEditTimeMM(timeVal){
  if(!timeVal) return 0;
  const s = String(timeVal);
  if(s.includes(':')){ return parseInt(s.split(':')[0])||0; }
  // segundos crudos
  const secs = parseInt(s)||0;
  return Math.floor(secs/60);
}
function getEditTimeSS(timeVal){
  if(!timeVal) return 0;
  const s = String(timeVal);
  if(s.includes(':')){ return parseInt(s.split(':')[1])||0; }
  const secs = parseInt(s)||0;
  return secs%60;
}
function updateEditTimeFromSel(sesId,ei,si){
  const mm=parseInt(document.getElementById('edit-time-mm-'+ei+'-'+si)?.value)||0;
  const ss=parseInt(document.getElementById('edit-time-ss-'+ei+'-'+si)?.value)||0;
  const timeStr=String(mm).padStart(2,'0')+':'+String(ss).padStart(2,'0');
  const s=(forge.sessions||[]).find(x=>x.id===sesId); if(!s) return;
  s.exercises[ei].sets[si].time=timeStr;
}
function updateEditSet(sesId,ei,si,field,val){
  const s=(forge.sessions||[]).find(x=>x.id===sesId); if(!s) return;
  const v=normDec(val);
  const numFields=['weight','reps','fc','pasos'];
  s.exercises[ei].sets[si][field]=numFields.includes(field)?parseFloat(v)||0:v;
}

function saveEditSesion(){
  const id=document.getElementById('edit-ses-id').value;
  const s=(forge.sessions||[]).find(x=>x.id===id); if(!s) return;
  const fecha=getDatePickerValue('edit-ses-fecha');
  const nombre=document.getElementById('edit-ses-nombre').value.trim();

  if(fecha) s.date=new Date(fecha+'T12:00:00').getTime();
  if(nombre) s.routineName=nombre;
  const fcEdit=parseInt(document.getElementById('edit-ses-fc')?.value)||0;
  const kcalEdit=parseInt(document.getElementById('edit-ses-kcal')?.value)||0;
  if(fcEdit>0) s.fcMedia=fcEdit; else if(fcEdit===0&&document.getElementById('edit-ses-fc')?.value==='') delete s.fcMedia;
  if(kcalEdit>0) s.kcal=kcalEdit; else if(kcalEdit===0&&document.getElementById('edit-ses-kcal')?.value==='') delete s.kcal;

  // Marcar sets como done según si tienen datos
  s.exercises.forEach(ex=>{
    const e=getEx(ex.exId);
    const isRun=e?.type==='run'||e?.type==='hiit';
    ex.sets.forEach(set=>{
      set.done = isRun ? !!(parseFloat(set.distance)||set.time) : !!(set.weight||set.reps);
    });
    ex.sets=ex.sets.filter(set=>isRun?(parseFloat(set.distance)||set.time):set.done);
  });

  // Duración: para cardio sumar tiempos de sets; para fuerza usar campo manual
  if(esSesSoloCardio(s)){
    let totalSecs=0;
    s.exercises.forEach(ex=>{
      (ex.sets||[]).forEach(set=>{
        if(set.time){
          const t=String(set.time);
          if(t.includes(':')){
            const p=t.split(':');
            totalSecs+=(parseInt(p[0])||0)*60+(parseInt(p[1])||0);
          } else {
            // segundos crudos legacy
            totalSecs+=parseInt(t)||0;
          }
        }
      });
    });
    s.elapsed = totalSecs;
  } else {
    const durSecs=getDurSecs();
    if(durSecs>0) s.elapsed=durSecs;
  }

  // Recalcular volumen (solo fuerza)
  s.totalVolume=s.exercises.reduce((a,ex)=>
    a+ex.sets.filter(s=>s.done&&s.weight).reduce((b,s2)=>b+(s2.weight||0)*(s2.reps||1),0),0);

  saveDB();
  closeModal('modal-edit-ses');
  renderHome();
  showToast('✓ Sesión actualizada',2000,'ok');
}
function deleteEditSet(sesId,ei,si){
  const s=(forge.sessions||[]).find(x=>x.id===sesId); if(!s) return;
  s.exercises[ei].sets.splice(si,1);
  renderEditSesExs(s);
}
function addEditSet(sesId,ei){
  const s=(forge.sessions||[]).find(x=>x.id===sesId); if(!s) return;
  const e=getEx(s.exercises[ei].exId);
  const isRun=e?.type==='run'||e?.type==='hiit';
  const last=s.exercises[ei].sets[s.exercises[ei].sets.length-1]||{weight:0,reps:8};
  s.exercises[ei].sets.push({type:isRun?'run':'weight',done:true,weight:last.weight,reps:last.reps,distance:'',time:'',fc:'',pasos:''});
  renderEditSesExs(s);
}

function calcDivMuscular(s){
  const grupos={Pecho:0,Espalda:0,Hombros:0,Piernas:0,Glúteos:0,Brazos:0,Cardio:0};
  (s.exercises||[]).forEach(ex=>{
    const e=getEx(ex.exId); if(!e) return;
    const n=(ex.sets||[]).filter(s=>s.done).length||1;
    const t=e.type, mu=e.muscle||'';
    if(t==='run'||t==='hiit') grupos.Cardio+=n;
    else if(mu.includes('pecho')) grupos.Pecho+=n;
    else if(mu.includes('espalda')) grupos.Espalda+=n;
    else if(mu.includes('hombro')) grupos.Hombros+=n;
    else if(mu.includes('pierna')) grupos.Piernas+=n;
    else if(mu.includes('glut')) grupos.Glúteos+=n;
    else if(mu.includes('brazo')||mu.includes('bicep')||mu.includes('tricep')) grupos.Brazos+=n;
  });
  const total=Object.values(grupos).reduce((a,b)=>a+b,0)||1;
  return Object.entries(grupos).filter(([,v])=>v>0).map(([g,v])=>({g,p:Math.round(v/total*100)})).sort((a,b)=>b.p-a.p);
}

// ---------------------------------------------------------------
//  SCREEN: ENTRENAR
// ---------------------------------------------------------------
let activeSession=null, sesTimer=null, sesSeconds=0;
let restTimer=null, restTotal=0, restLeft=0, pendingNextEx=null;

// Timestamps para timers precisos (no se detienen en segundo plano)
let _sesStartTs=null;      // timestamp Date.now() cuando inició la sesión
let _sesAccum=0;           // segundos acumulados antes de pausas
let _restEndTs=null;       // timestamp cuando termina el descanso
let _wakeLock=null;        // Wake Lock API

// Solicitar Wake Lock para mantener pantalla activa durante sesión
async function pedirWakeLock(){
  try{
    if('wakeLock' in navigator){
      _wakeLock=await navigator.wakeLock.request('screen');
    }
  }catch(e){}
}
function liberarWakeLock(){
  try{ _wakeLock?.release(); _wakeLock=null; }catch(e){}
}

// Page Visibility API — recalcular tiempos al volver al primer plano
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'){
    // Corregir sesión si hay una activa
    if(activeSession && _sesStartTs){
      const elapsed=Math.floor((Date.now()-_sesStartTs)/1000)+_sesAccum;
      sesSeconds=elapsed;
      const el=document.getElementById('ses-timer');
      if(el) el.textContent=fmtTime(sesSeconds);
    }
    // Corregir descanso si hay uno activo
    if(_restEndTs){
      const left=Math.ceil((_restEndTs-Date.now())/1000);
      if(left<=0){
        skipRest();
        beep(660,0.15,0.4); vibrar([100,50,100,50,200]);
      } else {
        restLeft=left;
        updateRestUI();
      }
    }
    // Re-solicitar wake lock si se perdió
    if(activeSession) pedirWakeLock();
  }
});

function renderTrain(){
  if(activeSession){
    document.getElementById('train-home').style.display='none';
    document.getElementById('session-view').style.display='flex';
    renderSessionView();
  } else {
    document.getElementById('train-home').style.display='block';
    document.getElementById('session-view').style.display='none';
    renderRutinas();
  }
}

// Redondeo correcto según tipo: barra=2.5kg, mancuerna=0.5kg
function roundCarga(kg, tipo){
  if(tipo==='barbell') return Math.round(kg/2.5)*2.5;
  return Math.round(kg*2)/2; // 0.5kg
}


function renderRutinas(){
  const list=document.getElementById('rutinas-list');
  const rutinas=forge.routines||[];
  if(!rutinas.length){ list.innerHTML=`<div class="empty"><div class="empty-icon">▤</div><div class="empty-text">Sin rutinas</div><div class="empty-sub">Crea tu primera rutina.</div></div>`; return; }

  const plan=(forge.planes||[]).find(p=>p.activo);
  const semG=plan?semanaActualPlan(plan):0;

  // Día actual
  const ahora=new Date();
  const diasOrden=['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  const diaHoyIdx=ahora.getDay(); // 0=dom … 6=sab
  const diaHoyNombre=diasOrden[diaHoyIdx];

  // ¿Ya entrenó hoy con alguna rutina?
  const inicioHoy=new Date(ahora); inicioHoy.setHours(0,0,0,0);
  const sesionesForgadas=forge.sessions||[];
  const yaEntrenóHoy=sesionesForgadas.some(s=>s.date>=inicioHoy.getTime()&&s.routineId);

  // Detectar qué día le corresponde a cada rutina según su nombre
  function diaDeRutina(r){
    const n=r.name.toLowerCase();
    return diasOrden.findIndex(d=>n.includes(d));
  }

  // Cuántos días faltan para la próxima ocurrencia de ese día
  function diasHasta(diaRutinaIdx){
    if(diaRutinaIdx<0) return 999; // sin día definido, va al final
    let diff=diaRutinaIdx-diaHoyIdx;
    if(diff<0) diff+=7;
    // Si es hoy pero ya entrenó, mostrarla como "en 7 días"
    if(diff===0&&yaEntrenóHoy) diff=7;
    return diff;
  }

  // Ordenar por proximidad al día de hoy
  const sorted=[...rutinas].sort((a,b)=>diasHasta(diaDeRutina(a))-diasHasta(diaDeRutina(b)));

  // La primera con día definido y que toque hoy (o la más próxima) es la sugerida
  const primero=sorted[0];
  const sugeridaId=(primero&&diaDeRutina(primero)>=0)?primero.id:null;

  list.innerHTML=sorted.map((r,idx)=>{
    const exs=(r.exercises||[]).map(id=>getEx(id)).filter(Boolean);
    const ultsesion=sesionesForgadas.filter(s=>s.routineId===r.id).sort((a,b)=>b.date-a.date)[0];
    const ultstxt=ultsesion?'Último: '+fmtDate(ultsesion.date):'Sin sesiones aún';
    const num=idx+1;
    const esSugerida=r.id===sugeridaId;
    const diasFalta=diasHasta(diaDeRutina(r));
    const diaRut=diaDeRutina(r);

    const esClavePlan=plan&&exs.some(e=>['ex_sentadilla','ex_press_banca','ex_correr'].includes(e.id));
    const cargas=plan?getCargasSemana(r.id):{};
    const tieneCarga=esClavePlan&&Object.keys(cargas).length>0;

    const btnColor=esClavePlan?'var(--green)':'var(--orange)';
    const borderColor=esSugerida?'var(--orange)':esClavePlan?'var(--green)':'var(--border2)';

    const planTag=esClavePlan?`<span style="background:var(--green);color:#fff;font-size:9px;padding:2px 7px;border-radius:4px;font-weight:700;letter-spacing:.5px;text-transform:uppercase">Plan · Sem ${semG}</span>`:'';

    // Etiqueta de día/proximidad
    let diaTag='';
    if(diaRut>=0){
      const label=diasFalta===0?'HOY':diasFalta===1?'Mañana':diasOrden[diaRut].charAt(0).toUpperCase()+diasOrden[diaRut].slice(1);
      const bg=diasFalta===0?'var(--orange)':diasFalta===1?'var(--bg4)':'var(--bg3)';
      const col=diasFalta===0?'#fff':diasFalta===1?'var(--gold)':'var(--ink3)';
      diaTag=`<span style="background:${bg};color:${col};font-size:9px;padding:2px 8px;border-radius:4px;font-weight:700;letter-spacing:.5px;text-transform:uppercase">${label}</span>`;
    }

    const cargaHint=tieneCarga?`<div style="background:var(--bg3);border-top:1px solid var(--border);padding:7px 16px;font-size:11px;color:var(--green)">
      ✦ Carga plan sem ${semG}: ${exs.filter(e=>cargas[e.id]).map(e=>`${e.name.split('(')[0].trim()} ${cargas[e.id]}kg`).join(' · ')}
    </div>`:'';

    // Banner sugerida
    const bannerSugerida=esSugerida?`<div style="background:linear-gradient(90deg,rgba(37,99,235,.06),var(--bg2));padding:5px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:6px">
      <span style="font-size:10px;font-weight:700;color:var(--orange);letter-spacing:1px;text-transform:uppercase">✶ Sugerida — ${diasFalta===0?'HOY':diasFalta===1?'Mañana':diaRut>=0?(diasOrden[diaRut].charAt(0).toUpperCase()+diasOrden[diaRut].slice(1)):'Próxima'}</span>
    </div>`:'';

    return `<div class="rutina-card" style="border-color:${borderColor}">
      ${bannerSugerida}
      <div class="rutina-head" onclick="openRutinaPreview('${r.id}')">
        <span class="rutina-emoji">${r.emoji||'◈'}</span>
        <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-bottom:2px">
          <div class="rutina-name">${r.name}</div>${diaTag}
        </div>
        <div class="rutina-meta">${exs.length} ejerc. · ${ultstxt}</div>
        ${planTag ? `<div style="margin-top:4px">${planTag}</div>` : ''}
      </div>
      ${cargaHint}
      <button onclick="iniciarRutina('${r.id}')"
        style="width:100%;padding:10px;background:${esSugerida?'var(--p)':esClavePlan?'var(--p)':'var(--bg3)'};
        color:${esSugerida||esClavePlan?'#fff':'var(--ink2)'};border:none;font-family:var(--ff);
        font-size:11px;font-weight:700;letter-spacing:1px;cursor:pointer;
        display:flex;align-items:center;justify-content:center;gap:6px;
        border-top:1px solid var(--border);border-radius:0 0 16px 16px;margin-top:auto">
        ▶ ${esClavePlan?'Iniciar (plan)':'Iniciar'}
      </button>
    </div>`;
  }).join('');

  document.getElementById('train-topbar-right').innerHTML=`
    <button class="btn btn-p btn-sm" onclick="openNewRutina()">+ Nueva</button>`;
}

function abrirMenuRutina(rutinaId, btn){
  // Mini menú contextual
  const existing=document.getElementById('menu-rutina-ctx');
  if(existing) existing.remove();
  const rect=btn.getBoundingClientRect();
  const m=document.createElement('div');
  m.id='menu-rutina-ctx';
  m.style.cssText=`position:fixed;top:${rect.bottom+4}px;right:${window.innerWidth-rect.right}px;
    background:var(--bg2);border:1px solid var(--border2);border-radius:var(--r);
    z-index:500;min-width:160px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.15)`;
  m.innerHTML=`
    <div onclick="openEditRutina('${rutinaId}');document.getElementById('menu-rutina-ctx')?.remove()"
      style="padding:12px 16px;font-size:13px;color:var(--ink);cursor:pointer;display:flex;align-items:center;gap:8px"
      onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
      ✏️ Editar rutina
    </div>
    <div style="height:1px;background:var(--border)"></div>
    <div onclick="deleteRutina('${rutinaId}');document.getElementById('menu-rutina-ctx')?.remove()"
      style="padding:12px 16px;font-size:13px;color:var(--red);cursor:pointer;display:flex;align-items:center;gap:8px"
      onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
      🗑 Eliminar rutina
    </div>`;
  document.body.appendChild(m);
  setTimeout(()=>document.addEventListener('click',()=>m.remove(),{once:true}),10);
}

function deleteRutina(rutinaId){
  const r=(forge.routines||[]).find(x=>x.id===rutinaId); if(!r) return;
  if(!confirm(`¿Eliminar "${r.name}"?\nEsto no elimina las sesiones ya registradas.`)) return;
  forge.routines=forge.routines.filter(x=>x.id!==rutinaId);
  saveDB();
  renderRutinas();
  showToast('Rutina eliminada');
}

function openRutinaPreview(rutinaId) {
  const r = (forge.routines||[]).find(x => x.id === rutinaId); if (!r) return;
  const plan = (forge.planes||[]).find(p => p.activo);
  const semG = plan ? semanaActualPlan(plan) : 0;
  const cargas = plan ? getCargasSemana(rutinaId) : {};
  const exs = (r.exercises||[]).map(id => getEx(id)).filter(Boolean);

  const exRows = exs.map(e => {
    const isRun = e.type === 'run' || e.type === 'hiit';
    const pr = getPR(e.id);
    const carga = cargas[e.id];
    const series = r._series?.[e.id] || [];
    const pdrVal = isRun ? getRunPR(e.id) : (pr.weight > 0 ? `${pr.weight} kg` : '—');

    let seriesHtml = '';
    if (!isRun) {
      const sugeridoKg = carga || pr.weight || '—';
      if (series.length) {
        seriesHtml = series.map((s, i) =>
          `<div style="display:flex;gap:10px;font-size:12px;color:var(--ink2);padding:4px 0;border-bottom:1px solid var(--border)">
            <span style="color:var(--ink3);min-width:20px;font-size:11px">${i+1}</span>
            <span style="font-weight:600;color:var(--p)">${s.peso||sugeridoKg} kg</span>
            <span style="color:var(--ink3)">× ${s.reps||8} reps</span>
            ${carga ? `<span style="font-size:10px;color:var(--p);margin-left:auto">Plan: ${carga}kg</span>` : ''}
          </div>`).join('');
      } else {
        seriesHtml = `<div style="font-size:12px;color:var(--ink3);padding:4px 0">
          3 series · ${sugeridoKg} kg × 8 reps
          ${carga ? `<span style="font-size:10px;color:var(--p);margin-left:6px">Plan sem ${semG}: ${carga}kg</span>` : ''}
        </div>`;
      }
    } else {
      seriesHtml = `<div style="font-size:12px;color:var(--ink3)">Cardio — km, tiempo, FC</div>`;
    }

    return `<div style="padding:12px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
        <div style="font-size:13px;font-weight:700;color:var(--ink)">${e.name}</div>
        <div style="text-align:right;flex-shrink:0;margin-left:8px">
          <div style="font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:var(--ink3)">PDR</div>
          <div style="font-size:13px;font-weight:700;color:var(--p)">${pdrVal}</div>
        </div>
      </div>
      ${seriesHtml}
    </div>`;
  }).join('');

  // Usar el modal genérico
  const modalBg = document.createElement('div');
  modalBg.className = 'modal-bg on';
  modalBg.id = 'rutina-preview-modal';
  modalBg.innerHTML = `
    <div class="modal" style="max-height:85dvh">
      <div class="modal-handle"></div>
      <div class="modal-head">
        <div style="font-size:16px;font-weight:700;color:var(--ink)">${r.emoji||'◈'} ${r.name}</div>
        <button onclick="document.getElementById('rutina-preview-modal')?.remove()" class="bicon">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="modal-body">
        <div style="font-size:11px;color:var(--ink3);margin-bottom:12px">${exs.length} ejercicios · Descanso ${fmtTime(r.restSec||90)} entre series</div>
        ${exRows}
        <button onclick="document.getElementById('rutina-preview-modal')?.remove();iniciarRutina('${rutinaId}')"
          class="btn btn-p" style="margin-top:16px">
          ▶ Iniciar sesión
        </button>
      </div>
    </div>`;
  // Cerrar al tocar fuera
  modalBg.addEventListener('click', e => { if (e.target === modalBg) modalBg.remove(); });
  document.body.appendChild(modalBg);
}

function toggleRutinaDetalle(rutinaId) {
  // Mantenida por compatibilidad — ahora abre preview
  openRutinaPreview(rutinaId);
}



function buildDurSelects(){
  const hhSel=document.getElementById('edit-ses-hh');
  const mmSel=document.getElementById('edit-ses-mm');
  const ssSel=document.getElementById('edit-ses-ss');
  if(hhSel.options.length>1) return; // ya poblados
  hhSel.innerHTML=[...Array(24)].map((_,i)=>`<option value="${i}">${i} h</option>`).join('');
  mmSel.innerHTML=[...Array(60)].map((_,i)=>`<option value="${i}">${String(i).padStart(2,'0')} min</option>`).join('');
  ssSel.innerHTML=[...Array(60)].map((_,i)=>`<option value="${i}">${String(i).padStart(2,'0')} s</option>`).join('');
}
function setDurSelects(totalSecs){
  buildDurSelects();
  const hh=Math.floor(totalSecs/3600);
  const mm=Math.floor((totalSecs%3600)/60);
  const ss=totalSecs%60;
  document.getElementById('edit-ses-hh').value=hh;
  document.getElementById('edit-ses-mm').value=mm;
  document.getElementById('edit-ses-ss').value=ss;
}
function getDurSecs(){
  const hh=parseInt(document.getElementById('edit-ses-hh').value)||0;
  const mm=parseInt(document.getElementById('edit-ses-mm').value)||0;
  const ss=parseInt(document.getElementById('edit-ses-ss').value)||0;
  return hh*3600+mm*60+ss;
}
function iniciarRutina(rutinaId){
  _doIniciarRutina(rutinaId, 1.0);
}

function _doIniciarRutina(rutinaId, factor){
  const r=(forge.routines||[]).find(x=>x.id===rutinaId); if(!r) return;
  const cargaSemana=getCargasSemana(rutinaId);

  const exercises=(r.exercises||[]).map(exId=>{
    const e=getEx(exId); if(!e) return null;
    // Calentamiento y estiramiento: sin sets
    if(e.type==='warmup'||e.type==='stretch') return {exId, sets:[]};
    const isRun=e.type==='run'||e.type==='hiit';

    // Peso sugerido: plan > editor de rutina > PR histórico
    const cargaPlan=cargaSemana[exId]||0;
    const seriesRutina=(r._series?.[exId])||[];
    const prHistorial=getPR(exId);

    // Último peso REAL usado en una sesión completada (no el PR máximo, sino el más reciente)
    let ultimoPesoReal=0;
    const sesionesOrdenadas=(forge.sessions||[]).filter(s=>s.routineId===r.id).sort((a,b)=>b.date-a.date);
    for(const ses of sesionesOrdenadas){
      const ex=ses.exercises?.find(x=>x.exId===exId);
      const sets=ex?.sets?.filter(s=>s.done&&s.weight>0);
      if(sets?.length){ ultimoPesoReal=sets[0].weight; break; }
    }

    // Número de series: del editor si existe, sino 1 para cardio y 3 para fuerza
    const nSeries=isRun?1:(seriesRutina.length||3);

    const sets=Array.from({length:nSeries},(_,i)=>{
      // Peso sugerido para esta serie: plan > serie definida en editor > último real > PR
      const pesoPlan=cargaPlan?roundCarga(cargaPlan*factor,e.type):0;
      const pesoEditor=seriesRutina[i]?.peso||0;
      const repsEditor=seriesRutina[i]?.reps||8;
      const pesoSugerido=pesoPlan||pesoEditor||ultimoPesoReal||prHistorial.weight||0;
      const pesoHistorial=ultimoPesoReal||prHistorial.weight||0;

      return {
        type:isRun?'run':'weight', done:false,
        weight:isRun?0:pesoSugerido,
        reps:isRun?0:repsEditor,
        distance:'',time:'',fc:'',pasos:'',
        // Metadatos para mostrar referencias
        _pesoSugerido: isRun?0:pesoPlan||pesoEditor||0,
        _pesoHistorial: isRun?0:pesoHistorial,
        _fuente: pesoPlan?'plan':pesoEditor?'rutina':pesoHistorial?'historial':''
      };
    });
    return {exId, sets};
  }).filter(Boolean);

  activeSession={
    id:'s_'+Date.now(), routineId:r.id, routineName:r.name,
    date:Date.now(), exercises, elapsed:0, totalVolume:0,
    restSec:r.restSec||90
  };
  _iniciarTimerSesion();
  renderTrain();
  showToast('A entrenar ✦',2000,'ok');
}

function startFreeSession(){
  document.getElementById('free-ses-fecha-wrap').innerHTML=renderDatePicker('free-ses-fecha', today());
  document.getElementById('free-ses-nombre').value='Sesión libre';
  openModal('modal-free-ses');
}
function doStartFreeSession(){
  const fecha=getDatePickerValue('free-ses-fecha')||today();
  const nombre=document.getElementById('free-ses-nombre').value.trim()||'Sesión libre';
  closeModal('modal-free-ses');
  activeSession={
    id:'s_'+Date.now(), routineId:null, routineName:nombre,
    date:new Date(fecha+'T12:00:00').getTime(),
    exercises:[], elapsed:0, totalVolume:0, restSec:90
  };
  sesSeconds=0;
  _iniciarTimerSesion();
  renderTrain();
}

// ── Plan de progresión dominical ─────────────────────────────────
// ── PLAN CARRERA 24 SEMANAS — sub-50min 10K ──────────────────
// Base: Daniels Running Formula + Seiler 80/20
// Inicio: semana del 13 de abril 2026
const SEMANA_INICIO_CARRERA = '2026-04-13';

// tipo: 'z2'=zona2, 'tempo'=tempo, 'intervalos'=intervalos, 'test'=test, 'descarga'=descarga
const PLAN_CARRERA = [
  {sem:1,  jTipo:'z2',        jDist:4,   jRitmo:'7:15-7:45', jFC:150, jNota:'Zona 2 real — si FC>150 baja el paso',
           dTipo:'desarrollo',dDist:8,   dRitmo:'6:29',       dFC:155, dNota:'Mantén ritmo actual controlando FC'},
  {sem:2,  jTipo:'z2',        jDist:4,   jRitmo:'7:15-7:45', jFC:150, jNota:'Zona 2 real — conversacional',
           dTipo:'desarrollo',dDist:8.5, dRitmo:'6:45',       dFC:152, dNota:'Mas lento que sem 1, FC mas baja'},
  {sem:3,  jTipo:'z2',        jDist:4,   jRitmo:'7:15-7:45', jFC:150, jNota:'Zona 2 real — conversacional',
           dTipo:'desarrollo',dDist:9,   dRitmo:'6:45',       dFC:152, dNota:'Aumenta distancia, mismo ritmo'},
  {sem:4,  jTipo:'z2',        jDist:5,   jRitmo:'7:15-7:30', jFC:150, jNota:'Zona 2 — sube distancia',
           dTipo:'desarrollo',dDist:9.5, dRitmo:'6:30',       dFC:155, dNota:'Ligeramente mas rapido'},
  {sem:5,  jTipo:'z2',        jDist:5,   jRitmo:'7:00-7:30', jFC:150, jNota:'Zona 2 — FC debe bajar vs sem 1',
           dTipo:'desarrollo',dDist:10,  dRitmo:'6:30',       dFC:155, dNota:'Primera vez a 10km'},
  {sem:6,  jTipo:'z2',        jDist:5,   jRitmo:'7:00-7:15', jFC:150, jNota:'Zona 2 — ya debes hablar sin ahogarte',
           dTipo:'desarrollo',dDist:10,  dRitmo:'6:15',       dFC:155, dNota:'Mismo distancia, mas rapido'},
  {sem:7,  jTipo:'z2',        jDist:5,   jRitmo:'6:50-7:15', jFC:150, jNota:'Zona 2 — ritmo bajando naturalmente',
           dTipo:'desarrollo',dDist:11,  dRitmo:'6:15',       dFC:155, dNota:'Sube a 11km'},
  {sem:8,  jTipo:'descarga',  jDist:3,   jRitmo:'muy suave', jFC:145, jNota:'Semana descarga — piernas frescas para el test',
           dTipo:'test',      dDist:5,   dRitmo:'maximo',     dFC:186, dNota:'TEST 5km a esfuerzo maximo — registra tiempo exacto'},
  {sem:9,  jTipo:'z2',        jDist:5,   jRitmo:'7:00-7:15', jFC:150, jNota:'Vuelta al volumen post-test',
           dTipo:'desarrollo',dDist:10,  dRitmo:'6:15',       dFC:155, dNota:'Retoma con distancia comoda'},
  {sem:10, jTipo:'tempo',     jDist:5,   jRitmo:'6:00',      jFC:165, jNota:'1km suave + 3km a 6:00 min/km + 1km suave',
           dTipo:'desarrollo',dDist:10,  dRitmo:'6:10',       dFC:155, dNota:'Continua progresion domingo'},
  {sem:11, jTipo:'z2',        jDist:5,   jRitmo:'6:50-7:10', jFC:150, jNota:'Zona 2 — recuperacion post-tempo',
           dTipo:'desarrollo',dDist:11,  dRitmo:'6:10',       dFC:155, dNota:'Sube distancia'},
  {sem:12, jTipo:'tempo',     jDist:6,   jRitmo:'6:00',      jFC:165, jNota:'1km suave + 4km a 6:00 min/km + 1km suave',
           dTipo:'desarrollo',dDist:10,  dRitmo:'6:00',       dFC:155, dNota:'Primera vez a 6:00 min/km'},
  {sem:13, jTipo:'z2',        jDist:5,   jRitmo:'6:45-7:00', jFC:150, jNota:'Zona 2 — descansa del tempo',
           dTipo:'desarrollo',dDist:12,  dRitmo:'6:00',       dFC:155, dNota:'Sube a 12km'},
  {sem:14, jTipo:'tempo',     jDist:6,   jRitmo:'5:50',      jFC:168, jNota:'1km suave + 4km a 5:50 min/km + 1km suave',
           dTipo:'desarrollo',dDist:11,  dRitmo:'5:55',       dFC:158, dNota:'Ritmo bajo 6 min sostenido'},
  {sem:15, jTipo:'z2',        jDist:5,   jRitmo:'6:40-7:00', jFC:150, jNota:'Zona 2 — recuperacion',
           dTipo:'desarrollo',dDist:12,  dRitmo:'5:50',       dFC:158, dNota:'12km bajo 6 min/km'},
  {sem:16, jTipo:'descarga',  jDist:3,   jRitmo:'muy suave', jFC:145, jNota:'Semana descarga — piernas frescas para test',
           dTipo:'test',      dDist:5,   dRitmo:'maximo',     dFC:186, dNota:'TEST 5km — mide progreso VDOT'},
  {sem:17, jTipo:'intervalos',jDist:4,   jRitmo:'5:20',      jFC:175, jNota:'6x400m a 5:20 min/km · rec 90s caminando',
           dTipo:'desarrollo',dDist:10,  dRitmo:'5:45',       dFC:160, dNota:'Ritmo objetivo baja'},
  {sem:18, jTipo:'z2',        jDist:5,   jRitmo:'6:30-6:50', jFC:150, jNota:'Zona 2 — recuperacion post-intervalos',
           dTipo:'desarrollo',dDist:11,  dRitmo:'5:40',       dFC:160, dNota:'Progresion continua'},
  {sem:19, jTipo:'intervalos',jDist:5,   jRitmo:'5:20',      jFC:175, jNota:'5x800m a 5:20 min/km · rec 2min',
           dTipo:'desarrollo',dDist:10,  dRitmo:'5:35',       dFC:162, dNota:'Acercandose al ritmo objetivo'},
  {sem:20, jTipo:'z2',        jDist:5,   jRitmo:'6:20-6:45', jFC:150, jNota:'Zona 2 — recuperacion',
           dTipo:'desarrollo',dDist:12,  dRitmo:'5:30',       dFC:162, dNota:'12km a ritmo de carrera'},
  {sem:21, jTipo:'intervalos',jDist:5,   jRitmo:'5:15',      jFC:178, jNota:'4x1000m a 5:15 min/km · rec 2min',
           dTipo:'desarrollo',dDist:10,  dRitmo:'5:20',       dFC:165, dNota:'Muy cerca del ritmo objetivo'},
  {sem:22, jTipo:'z2',        jDist:5,   jRitmo:'6:20-6:40', jFC:150, jNota:'Zona 2 — recuperacion',
           dTipo:'desarrollo',dDist:10,  dRitmo:'5:10',       dFC:165, dNota:'10km a ritmo sub-52min'},
  {sem:23, jTipo:'tempo',     jDist:7,   jRitmo:'5:00',      jFC:170, jNota:'2km suave + 4km a 5:00 min/km + 1km suave',
           dTipo:'desarrollo',dDist:8,   dRitmo:'5:05',       dFC:165, dNota:'Descarga parcial — piernas frescas'},
  {sem:24, jTipo:'descarga',  jDist:3,   jRitmo:'muy suave', jFC:145, jNota:'Semana descarga — CARRERA EL DOMINGO',
           dTipo:'test',      dDist:10,  dRitmo:'5:00',       dFC:175, dNota:'OBJETIVO: sub-50min 10K'},
];

function getSemanaCarrera(){
  const inicio = new Date(SEMANA_INICIO_CARRERA);
  const hoy = new Date();
  const dias = Math.floor((hoy - inicio) / 86400000);
  const sem = Math.floor(dias/7)+1;
  return Math.min(Math.max(1, sem), PLAN_CARRERA.length);
}

function getSemanaActualPlan(){ return getSemanaCarrera(); }

function tipoLabel(tipo){
  return {z2:'🧘 Zona 2 — Base aeróbica', tempo:'✶ Tempo', intervalos:'✦ Intervalos', test:'🏁 TEST 5km', descarga:'😌 Descarga', desarrollo:'📈 Desarrollo'}[tipo]||tipo;
}
function tipoColor(tipo){
  return {z2:'#16a34a,#15803d', tempo:'#d97706,#b45309', intervalos:'#dc2626,#b91c1c', test:'#7c3aed,#6d28d9', descarga:'#475467,#344054', desarrollo:'#1d4ed8,#1e40af'}[tipo]||'#1d4ed8,#1e40af';
}

function mostrarBannerCarrera(routineId){
  const esJueves = routineId==='r_jueves_noche';
  const esDomingo = routineId==='r_cardio';
  if(!esJueves&&!esDomingo) return;

  const sem = getSemanaCarrera();
  const plan = PLAN_CARRERA[sem-1];
  const bannerId = esJueves?'banner-trote-jueves':'banner-domingo';
  if(document.getElementById(bannerId)) return;

  const tipo  = esJueves?plan.jTipo:plan.dTipo;
  const dist  = esJueves?plan.jDist:plan.dDist;
  const ritmo = esJueves?plan.jRitmo:plan.dRitmo;
  const fc    = esJueves?plan.jFC:plan.dFC;
  const nota  = esJueves?plan.jNota:plan.dNota;
  const color = tipoColor(tipo);
  const label = tipoLabel(tipo);
  const bloque = sem<=8?'Bloque 1 — Base':sem<=16?'Bloque 2 — Desarrollo':'Bloque 3 — Específico 10K';

  const banner=document.createElement('div');
  banner.id=bannerId;
  banner.style.cssText='background:linear-gradient(135deg,'+color+');color:#fff;border-radius:12px;padding:14px 16px;margin:12px 16px 0;';
  let h='<div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;opacity:.7;margin-bottom:2px">'+bloque+' · Sem '+sem+'/24</div>';
  h+='<div style="font-size:13px;font-weight:700;margin-bottom:10px">'+label+'</div>';
  h+='<div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:8px">';
  h+='<div><div style="font-size:22px;font-weight:800">'+dist+'km</div><div style="font-size:10px;opacity:.75">Distancia</div></div>';
  if(ritmo!=='maximo'&&ritmo!=='muy suave'){
    h+='<div><div style="font-size:22px;font-weight:800">'+ritmo+'/km</div><div style="font-size:10px;opacity:.75">Ritmo objetivo</div></div>';
  }
  h+='<div><div style="font-size:22px;font-weight:800">'+(tipo==='test'||tipo==='intervalos'?fc+'max':'<'+fc)+'</div><div style="font-size:10px;opacity:.75">FC (bpm)</div></div>';
  h+='</div>';
  h+='<div style="font-size:11px;opacity:.8;background:rgba(0,0,0,.15);border-radius:6px;padding:6px 8px">'+nota+'</div>';
  banner.innerHTML=h;
  const container=document.getElementById('session-exs');
  if(container) container.parentNode.insertBefore(banner,container);
}

function renderSessionView(){
  document.getElementById('ses-name').textContent=activeSession.routineName;
  const container=document.getElementById('session-exs');
  container.innerHTML=activeSession.exercises.map((ex,ei)=>renderSexBlock(ex,ei)).join('');
  // Limpiar banners anteriores
  ['banner-domingo','banner-trote-jueves'].forEach(id=>{ const el=document.getElementById(id); if(el) el.remove(); });
  // Mostrar banner de plan de carrera
  mostrarBannerCarrera(activeSession.routineId);
}

function renderSexBlock(ex,ei){
  const e=getEx(ex.exId); if(!e) return '';
  const isWarmupStretch = e.type==='warmup'||e.type==='stretch';
  // Render especial para calentamiento y estiramiento — solo video
  if(isWarmupStretch){
    const label = e.type==='warmup'?'✦ Calentamiento':'🧘 Estiramiento';
    const tagColor = e.type==='warmup'?'rgba(217,119,6,.15);color:var(--gold)':'rgba(37,99,235,.12);color:var(--blue)';
    const ytSrc = e.youtubeId ? 'https://www.youtube.com/embed/'+e.youtubeId+'?rel=0&modestbranding=1' : '';
    const ytHtml = ytSrc
      ? '<div style="margin:0 16px 14px;border-radius:var(--r);overflow:hidden;aspect-ratio:16/9;background:#000">'
        +'<iframe src="'+ytSrc+'" width="100%" height="100%" frameborder="0"'
        +' allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"'
        +' allowfullscreen style="display:block"></iframe></div>'
      : '<div style="padding:12px 16px;color:var(--ink3);font-size:13px">Sin video asignado</div>';
    return '<div class="sex-block" id="sex-'+ei+'">'
      +'<div class="sex-head">'
        +'<div style="flex:1">'
          +'<div style="display:flex;align-items:center;gap:8px">'
            +'<div class="sex-name">'+e.name+'</div>'
            +'<span style="background:'+tagColor+';font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;padding:2px 7px;border-radius:4px">'+label+'</span>'
          +'</div>'
          +'<div style="font-size:11px;color:var(--ink3);margin-top:2px">Sigue el video — sin registro de series</div>'
        +'</div>'
      +'</div>'
      +ytHtml
      +'</div>';
  }
  const isRun=e.type==='run'||e.type==='hiit';
  const isPlyo=e.type==='plyo';
  const pr=getPR(ex.exId);

  // ── Último registro de esta misma rutina ──────────────────────
  const ultsesion=(forge.sessions||[])
    .filter(s=>s.exercises?.some(x=>x.exId===ex.exId))
    .sort((a,b)=>b.date-a.date)[0];
  const ultEx=ultsesion?.exercises?.find(x=>x.exId===ex.exId);
  const ultSets=(ultEx?.sets||[]).filter(s=>s.done&&(s.weight||s.distance||s.time));

  // Texto resumen para cardio
  let ultCardioStr='';
  if(isRun && ultEx){
    const sets=(ultEx.sets||[]).filter(s=>parseFloat(s.distance)>0||s.time);
    const dist=sets.reduce((a,s)=>a+(parseFloat(s.distance)||0),0);
    const fc=sets.find(s=>s.fc);
    const pasos=sets.find(s=>s.pasos);
    ultCardioStr=dist>0?`${dist.toFixed(2)}km`:'';
    if(fc) ultCardioStr+=` · ❤️${fc.fc}bpm`;
    if(pasos) ultCardioStr+=` · 👟${fmtMiles(parseInt(pasos.pasos))}p`;
  }

  // ── PR ────────────────────────────────────────────────────────
  let prStr='';
  if(isRun){
    const runPR=getRunPRObj(ex.exId);
    if(runPR.dist>0) prStr=`PR: ${runPR.dist.toFixed(2)}km`;
    if(runPR.ritmo>0) prStr+=(prStr?' · ':'')+`${Math.floor(runPR.ritmo)}'${pad(Math.round((runPR.ritmo%1)*60))}"/km`;
  } else {
    if(pr.weight>0) prStr=`PR: ${pr.weight}kg × ${pr.reps} reps`;
  }

  const cs=getCargasSemana(activeSession.routineId||'')[ex.exId];
  const csStr=cs&&!isRun?`📈 Carga sugerida esta semana: ${cs} kg`:'';
  const headerBg=isRun?'background:linear-gradient(90deg,rgba(22,163,74,.06),var(--bg2))':'';
  const tipoTag=isRun?`<span style="background:rgba(22,163,74,.12);color:var(--green);font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;padding:2px 7px;border-radius:4px;margin-left:8px">↝ Cardio</span>`:'';

  // ── Video YouTube si el ejercicio lo tiene ────────────────────
  const ytHtml = e.youtubeId ? `
    <div style="margin:0 16px 10px;border-radius:var(--r);overflow:hidden;aspect-ratio:16/9;background:#000">
      <iframe src="https://www.youtube.com/embed/${e.youtubeId}?rel=0&modestbranding=1"
        width="100%" height="100%" frameborder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen style="display:block"></iframe>
    </div>` : '';
  const colHeader = isRun ? '' : isPlyo ? `
    <div style="display:grid;grid-template-columns:28px 1fr 1fr 1fr auto;gap:6px;padding:5px 16px;background:var(--bg3);border-bottom:1px solid var(--border)">
      <span style="font-size:10px;color:var(--ink3);font-weight:700;text-transform:uppercase">Serie</span>
      <span style="font-size:10px;color:var(--ink3);font-weight:700;text-transform:uppercase">Anterior</span>
      <span style="font-size:10px;color:var(--ink3);font-weight:700;text-transform:uppercase;text-align:center">Altura</span>
      <span style="font-size:10px;color:var(--ink3);font-weight:700;text-transform:uppercase;text-align:center">Reps</span>
      <span style="width:34px"></span>
    </div>` : `
    <div style="display:grid;grid-template-columns:28px 1fr 1fr 1fr auto;gap:6px;padding:5px 16px;background:var(--bg3);border-bottom:1px solid var(--border)">
      <span style="font-size:10px;color:var(--ink3);font-weight:700;text-transform:uppercase">Serie</span>
      <span style="font-size:10px;color:var(--ink3);font-weight:700;text-transform:uppercase">Anterior</span>
      <span style="font-size:10px;color:var(--ink3);font-weight:700;text-transform:uppercase;text-align:center">KG</span>
      <span style="font-size:10px;color:var(--ink3);font-weight:700;text-transform:uppercase;text-align:center">Reps</span>
      <span style="width:34px"></span>
    </div>`;

  return `<div class="sex-block" id="sex-${ei}">
    <div class="sex-head" style="${headerBg}">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px">
          <div class="sex-name">${e.name}</div>${tipoTag}
        </div>
        ${prStr?`<div class="sex-pr" style="margin-top:2px;color:${isRun?'var(--green)':'var(--gold)'}">🏅 ${prStr}</div>`:''}
        ${isRun&&ultCardioStr?`<div style="font-size:11px;color:var(--green);margin-top:2px">Última: ${ultCardioStr}</div>`:''}
      </div>
      <button class="bicon" onclick="abrirReemplazarEx(${ei})" title="Reemplazar ejercicio" style="color:var(--ink3)">
        <svg viewBox="0 0 24 24" style="width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:2"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
      </button>
      <button class="bicon" onclick="abrirDescansoEx(${ei})" title="Descanso" style="color:var(--ink3);font-size:11px;font-weight:700;gap:2px">
        <svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <span style="font-size:10px;font-weight:700" id="rest-lbl-${ei}">${_exRestSec(ex.exId, activeSession)}s</span>
      </button>
      <button class="bicon" onclick="addSetToEx(${ei})">
        <svg viewBox="0 0 24 24" style="width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
    </div>
    ${csStr?`<div class="carga-sugerida">✦ ${csStr}</div>`:''}
    ${ytHtml}
    ${colHeader}
    ${ex.sets.map((set,si)=>renderSetRow(ei,si,set,isRun,ultSets[si])).join('')}
  </div>`;
}

function renderSetRow(ei,si,set,isRun,ultSet){
  const done=set.done;
  const anteriorTxt = ultSet
    ? (isRun ? (ultSet.distance?`${ultSet.distance}km`:'—') : `${ultSet.weight}kg×${ultSet.reps}`)
    : '—';

  // ¿Es ejercicio bilateral?
  // Buscar en 3 fuentes en orden: eDef (forge.exercises), exObj (sesión activa), EJERCICIOS_BASE
  const ex=activeSession?.exercises[ei];
  const eDef=getEx(ex?.exId);
  const baseEx=EJERCICIOS_BASE.find(b=>b.id===ex?.exId);
  const isBilateral = eDef?.bilateral===true || ex?.bilateral===true || baseEx?.bilateral===true;
  const isPlyo=eDef?.type==='plyo';

  // Render especial para ejercicios pliométricos (saltos cajón) — altura + reps
  if(isPlyo){
    const altura=set.altura||'media';
    const ultAlt=ultSet?.altura?(' · '+ultSet.altura):'';
    const ultReps=ultSet?.reps?(ultSet.reps+' reps'+ultAlt):'—';
    const bgColor=done?'rgba(22,163,74,.06)':'transparent';
    const selAltura='<select onchange="updateSet('+ei+','+si+String.fromCharCode(44)+String.fromCharCode(39)+'altura'+String.fromCharCode(39)+',this.value)" style="border:1px solid var(--border2);border-radius:var(--r);padding:6px 4px;font-size:13px;background:var(--bg3);color:var(--ink)">'
      +'<option value="baja"'+(altura==='baja'?' selected':'')+'>Baja</option>'
      +'<option value="media"'+(altura==='media'?' selected':'')+'>Media</option>'
      +'<option value="alta"'+(altura==='alta'?' selected':'')+'>Alta</option>'
      +'</select>';
    return '<div class="set-row" id="sr-'+ei+'-'+si+'" style="flex-wrap:wrap;background:'+bgColor+';grid-template-columns:28px 1fr 1fr 1fr auto auto">'
      +'<div class="set-num" style="color:'+(done?'var(--green)':'var(--ink3)')+'">'+( si+1)+'</div>'
      +'<div style="font-size:12px;color:var(--ink3);display:flex;align-items:center;padding:0 4px">'+ultReps+'</div>'
      +selAltura
      +'<input class="set-inp" type="number" placeholder="reps" value="'+(set.reps||'')+'" oninput="updateSet('+ei+','+si+','+String.fromCharCode(39)+'reps'+String.fromCharCode(39)+',this.value)" inputmode="numeric">'
      +'<div class="set-check '+(done?'done':'')+'" onclick="toggleSet('+ei+','+si+')">'
      +'<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div>'
      +'<button onclick="removeSetFromEx('+ei+','+si+')" style="background:none;border:none;color:var(--ink3);cursor:pointer;padding:4px 6px;font-size:16px">✕</button>'
      +'</div>';
  }

  
  if(isRun){
    return `<div id="sr-${ei}-${si}" style="padding:10px 16px;border-bottom:1px solid var(--border);background:${done?'rgba(22,163,74,.06)':'transparent'}">
      <div style="display:grid;grid-template-columns:28px 1fr 1fr auto;gap:6px;align-items:center;margin-bottom:6px">
        <div class="set-num">${si+1}</div>
        <input class="set-inp" type="text" placeholder="km (ej: 4.01)" value="${set.distance||''}" oninput="updateSet(${ei},${si},'distance',this.value)" style="font-size:14px">
        ${renderTimeSelects(ei,si,set.time)}
        <button onclick="removeSetFromEx(${ei},${si})" style="background:none;border:none;color:var(--ink3);cursor:pointer;padding:4px 6px;font-size:16px" title="Eliminar">✕</button>
      </div>
      <div style="display:grid;grid-template-columns:28px 1fr 1fr auto;gap:6px;align-items:center">
        <div></div>
        <input class="set-inp" type="number" placeholder="FC media (bpm)" value="${set.fc||''}" oninput="updateSet(${ei},${si},'fc',this.value)" inputmode="numeric" style="font-size:13px;color:#f87171">
        <input class="set-inp" type="number" placeholder="Pasos" value="${set.pasos||''}" oninput="updateSet(${ei},${si},'pasos',this.value)" inputmode="numeric" style="font-size:13px;color:var(--blue)">
        <div class="set-check ${done?'done':''}" onclick="toggleSet(${ei},${si})">
          <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
      </div>
    </div>`;
  }

  let refHtml='';
  if(set._pesoSugerido&&set._fuente){
    const icono=set._fuente==='plan'?'▤':'⚙️';
    const color=set._fuente==='plan'?'var(--green)':'var(--orange)';
    const label=set._fuente==='plan'?'Plan':'Rutina';
    refHtml=`<div style="grid-column:2/-1;font-size:10px;padding:1px 0 4px"><span style="color:${color};font-weight:700">${icono} ${label}: ${set._pesoSugerido}kg</span></div>`;
  }

  // Bilateral: botones L / R en lugar del check único
  const ladoL = set._ladoL || false; // izquierda completada
  const ladoR = set._ladoR || false; // derecha completada
  const ambos = ladoL && ladoR;

  const checkHtml = isBilateral
    ? `<div style="display:flex;gap:4px;align-items:center">
        <button onclick="toggleLado(${ei},${si},'L')" style="
          width:30px;height:30px;border-radius:50%;border:2px solid ${ladoL?'var(--green)':'var(--border2)'};
          background:${ladoL?'var(--green)':'var(--bg3)'};color:${ladoL?'#fff':'var(--ink3)'};
          font-size:11px;font-weight:800;cursor:pointer;font-family:var(--fb)">L</button>
        <button onclick="toggleLado(${ei},${si},'R')" style="
          width:30px;height:30px;border-radius:50%;border:2px solid ${ladoR?'var(--green)':'var(--border2)'};
          background:${ladoR?'var(--green)':'var(--bg3)'};color:${ladoR?'#fff':'var(--ink3)'};
          font-size:11px;font-weight:800;cursor:pointer;font-family:var(--fb)">R</button>
      </div>`
    : `<div class="set-check ${done?'done':''}" onclick="toggleSet(${ei},${si})">
        <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
      </div>`;

  const bgColor = isBilateral
    ? (ambos ? 'rgba(22,163,74,.06)' : ladoL||ladoR ? 'rgba(37,99,235,.04)' : 'transparent')
    : (done ? 'rgba(22,163,74,.06)' : 'transparent');

  return `<div class="set-row" id="sr-${ei}-${si}" style="flex-wrap:wrap;background:${bgColor};grid-template-columns:28px 1fr 1fr 1fr auto auto">
    <div class="set-num" style="color:${(done||ambos)?'var(--green)':'var(--ink3)'}">${si+1}</div>
    <div style="font-size:12px;color:var(--ink3);display:flex;align-items:center;padding:0 4px">${anteriorTxt}</div>
    <input class="set-inp" type="text" placeholder="kg" value="${set.weight||''}" oninput="updateSet(${ei},${si},'weight',this.value)" inputmode="decimal">
    <input class="set-inp" type="number" placeholder="reps" value="${set.reps||''}" oninput="updateSet(${ei},${si},'reps',this.value)" inputmode="numeric">
    ${checkHtml}
    <button onclick="removeSetFromEx(${ei},${si})" style="background:none;border:none;color:var(--ink3);cursor:pointer;padding:4px 6px;font-size:16px;line-height:1" title="Eliminar serie">✕</button>
    ${refHtml}
  </div>`;
}

function parseTimeStr(t){
  if(!t) return {h:0,m:0,s:0};
  const p=(t+'').split(':').map(Number);
  if(p.length===3) return {h:p[0]||0,m:p[1]||0,s:p[2]||0};
  if(p.length===2) return {h:0,m:p[0]||0,s:p[1]||0};
  return {h:0,m:parseInt(t)||0,s:0};
}
function renderTimeSelects(ei,si,timeVal){
  const t=parseTimeStr(timeVal);
  const selH='<select onchange="updateTimeFromSel('+ei+','+si+')" id="tsel-h-'+ei+'-'+si+'" style="border:1px solid var(--border2);border-radius:var(--r);padding:6px 2px;font-size:12px;background:var(--bg3);color:var(--ink);text-align:center">'
    +[...Array(11)].map((_,i)=>'<option value="'+i+'"'+(t.h===i?' selected':'')+'>'+String(i).padStart(2,'0')+'h</option>').join('')+'</select>';
  const selM='<select onchange="updateTimeFromSel('+ei+','+si+')" id="tsel-m-'+ei+'-'+si+'" style="border:1px solid var(--border2);border-radius:var(--r);padding:6px 2px;font-size:12px;background:var(--bg3);color:var(--ink);text-align:center">'
    +[...Array(60)].map((_,i)=>'<option value="'+i+'"'+(t.m===i?' selected':'')+'>'+String(i).padStart(2,'0')+'m</option>').join('')+'</select>';
  const selS='<select onchange="updateTimeFromSel('+ei+','+si+')" id="tsel-s-'+ei+'-'+si+'" style="border:1px solid var(--border2);border-radius:var(--r);padding:6px 2px;font-size:12px;background:var(--bg3);color:var(--ink);text-align:center">'
    +[...Array(60)].map((_,i)=>'<option value="'+i+'"'+(t.s===i?' selected':'')+'>'+String(i).padStart(2,'0')+'s</option>').join('')+'</select>';
  return '<div style="display:flex;gap:3px;align-items:center">'+selH+selM+selS+'</div>';
}
function updateTimeFromSel(ei,si){
  const hEl=document.getElementById('tsel-h-'+ei+'-'+si);
  const mEl=document.getElementById('tsel-m-'+ei+'-'+si);
  const sEl=document.getElementById('tsel-s-'+ei+'-'+si);
  // Si no existen los selectores (sesión ya terminada), no hacer nada
  if(!mEl&&!sEl) return;
  const h=parseInt(hEl?.value)||0;
  const m=parseInt(mEl?.value)||0;
  const s=parseInt(sEl?.value)||0;
  // Solo guardar si hay al menos minutos o segundos
  if(m===0&&s===0&&h===0) return;
  const timeStr=(h>0?String(h).padStart(2,'0')+':':'')+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
  if(activeSession) activeSession.exercises[ei].sets[si].time=timeStr;
}
function fmtTimeStr(t){
  // Normaliza tiempo: si es número (segundos) lo convierte a mm:ss
  if(!t) return '';
  const s=String(t);
  if(s.includes(':')) return s; // ya es mm:ss o hh:mm:ss
  const secs=parseInt(s)||0;
  if(secs===0) return '';
  const hh=Math.floor(secs/3600), mm=Math.floor((secs%3600)/60), ss=secs%60;
  return hh>0?(String(hh).padStart(2,'0')+':'+String(mm).padStart(2,'0')+':'+String(ss).padStart(2,'0'))
    :(String(mm).padStart(2,'0')+':'+String(ss).padStart(2,'0'));
}
function updateSet(ei,si,field,val){
  if(!activeSession) return;
  const v=normDec(val);
  activeSession.exercises[ei].sets[si][field]=field==='weight'||field==='reps'?parseFloat(v)||0:v;
}
function getRestSecondsForExercise(exObj){
  const eDef = getEx(exObj?.exId);
  const restSec = Number(exObj?._restSec ?? eDef?.restSec ?? activeSession?.restSec ?? 0) || 0;
  return restSec > 0 ? restSec : 0;
}
function rerenderActiveSessionExercises(){
  const container=document.getElementById('session-exs');
  if(container && activeSession){
    container.innerHTML=activeSession.exercises.map((ex,i)=>renderSexBlock(ex,i)).join('');
  }
}
function maybeStartRestForSet(exObj, ei, si){
  const restSec=getRestSecondsForExercise(exObj);
  if(restSec>0) startRest(restSec, ei, si);
}
function toggleLado(ei,si,lado){
  if(!activeSession) return;
  const exObj=activeSession.exercises[ei];
  if(!exObj) return;
  const set=exObj.sets[si];
  if(!set) return;

  const field = lado==='L' ? '_ladoL' : '_ladoR';
  const wasOn = !!set[field];
  set[field] = !wasOn;

  const ambos = !!(set._ladoL && set._ladoR);
  set.done = ambos;

  rerenderActiveSessionExercises();

  // Regla v165: cada lado marcado inicia descanso si el ejercicio tiene restSec.
  // Desmarcar no inicia descanso. La serie solo queda completa con L + D/R.
  if(!wasOn && set[field]){
    maybeStartRestForSet(exObj, ei, si);
  }
}

function toggleSet(ei,si){
  if(!activeSession) return;
  const ex=activeSession.exercises[ei];
  if(!ex) return;
  const set=ex.sets[si];
  if(!set) return;
  const e=getEx(ex.exId);
  const baseE=EJERCICIOS_BASE.find(b=>b.id===ex.exId);
  const isRun=e?.type==='run'||e?.type==='hiit';
  const isBilateral= e?.bilateral===true || ex.bilateral===true || baseE?.bilateral===true;
  // Unilaterales: no tocar desde toggleSet, lo maneja toggleLado.
  if(isBilateral) return;
  // Para cardio: leer selectores de tiempo antes de marcar done.
  if(isRun) updateTimeFromSel(ei,si);
  const wasDone=!!set.done;
  set.done=!set.done;
  rerenderActiveSessionExercises();
  // Regla v165: cualquier ejercicio con restSec > 0 inicia descanso al marcarse,
  // incluyendo plyo/Saltos al Cajón. Desmarcar no inicia descanso.
  if(set.done && !wasDone){
    maybeStartRestForSet(ex, ei, si);
  }
}
function removeSetFromEx(ei,si){
  if(!activeSession) return;
  const ex=activeSession.exercises[ei];
  if(ex.sets.length<=1){ showToast('Mínimo 1 serie',1500); return; }
  ex.sets.splice(si,1);
  const container=document.getElementById('session-exs');
  container.innerHTML=activeSession.exercises.map((ex,i)=>renderSexBlock(ex,i)).join('');
}
function addSetToEx(ei){
  if(!activeSession) return;
  const ex=activeSession.exercises[ei];
  const last=ex.sets[ex.sets.length-1]||{weight:0,reps:8};
  const e=getEx(ex.exId);
  const isRun=e?.type==='run'||e?.type==='hiit';
  ex.sets.push({type:isRun?'run':'weight',done:false,weight:last.weight,reps:last.reps,distance:'',time:'',fc:'',pasos:''});
  const container=document.getElementById('session-exs');
  container.innerHTML=activeSession.exercises.map((ex,i)=>renderSexBlock(ex,i)).join('');
}

function finishSession(){
  if(!activeSession) return;
  // Cerrar el contador de descanso si está activo
  skipRest();
  clearInterval(sesTimer);
  activeSession.elapsed=sesSeconds;
  activeSession.totalVolume=activeSession.exercises.reduce((a,ex)=>
    a+ex.sets.filter(s=>s.done&&s.weight).reduce((b,s)=>b+(s.weight||0)*(s.reps||1),0),0);
  // Mostrar modal post-sesión para FC y kcal
  abrirPostSesion();
}

function abrirPostSesion(){
  const vol=Math.round(activeSession.totalVolume||0);
  const dur=fmtTime(activeSession.elapsed||0);
  const esCardio=esSesSoloCardio(activeSession);
  document.getElementById('post-ses-resumen').innerHTML=`
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:4px">
      <div class="hm-item"><div class="hm-label">Duración</div><div class="hm-val">${dur}</div></div>
      ${vol>0?`<div class="hm-item"><div class="hm-label">Volumen</div><div class="hm-val">${fmtMiles(vol)} kg</div></div>`:''}
    </div>`;
  document.getElementById('post-ses-fc').value='';
  document.getElementById('post-ses-kcal').value='';
  document.getElementById('post-ses-duracion').value='';
  document.getElementById('post-ses-duracion-wrap').style.display=esCardio?'block':'none';
  document.getElementById('post-ses-foto').value='';
  document.getElementById('post-ses-foto-preview').style.display='none';
  openModal('modal-post-sesion');
}
function postSesPreviewFoto(input){
  const file=input.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=ev=>{
    const img=new Image();
    img.onload=()=>{
      const MAX=800;
      let w=img.width, h=img.height;
      if(w>MAX||h>MAX){ const r=Math.min(MAX/w,MAX/h); w=Math.round(w*r); h=Math.round(h*r); }
      const canvas=document.createElement('canvas');
      canvas.width=w; canvas.height=h;
      canvas.getContext('2d').drawImage(img,0,0,w,h);
      const compressed=canvas.toDataURL('image/jpeg',0.72);
      document.getElementById('post-ses-foto-img').src=compressed;
      document.getElementById('post-ses-foto-preview').style.display='block';
    };
    img.src=ev.target.result;
  };
  reader.readAsDataURL(file);
}

function parseDuracion(str){
  if(!str) return 0;
  const parts=str.trim().split(':');
  if(parts.length===2) return parseInt(parts[0]||0)*60+parseInt(parts[1]||0);
  if(parts.length===1) return parseInt(parts[0]||0)*60;
  return 0;
}
function guardarPostSesion(){
  const fc=parseInt(document.getElementById('post-ses-fc').value)||0;
  const kcal=parseInt(document.getElementById('post-ses-kcal').value)||0;
  const durStr=document.getElementById('post-ses-duracion').value.trim();
  const durSecs=parseDuracion(durStr);
  const fotoImg=document.getElementById('post-ses-foto-img');
  const fotoSrc=fotoImg?.src&&fotoImg.src.startsWith('data:')?fotoImg.src:'';
  if(fc>0) activeSession.fcMedia=fc;
  if(kcal>0) activeSession.kcal=kcal;
  if(durSecs>0) activeSession.elapsed=durSecs;
  if(fotoSrc) activeSession.foto=fotoSrc;
  // Calcular y guardar ritmo promedio para sesiones de cardio
  if(esSesSoloCardio(activeSession)){
    const rd=calcSesRitmo(activeSession);
    if(rd.ritmo>0) activeSession.ritmoPromedio=rd.ritmo;
    if(rd.dist>0) activeSession.distanciaTotal=rd.dist;
  }
  if(!forge.sessions) forge.sessions=[];
  forge.sessions.push({...activeSession});
  saveDB();
  checkLogros();
  closeModal('modal-post-sesion');
  const vol=Math.round(activeSession.totalVolume||0);
  showToast(`✓ Sesión guardada · ${fmtMiles(vol)} kg`,3000,'ok');
  activeSession=null; sesSeconds=0;
  setTimeout(()=>syncCloud(),1000);
  renderTrain();
  renderHome();
}

function openAddExToSession(){
  // Construir selector agrupado igual que en editor de rutinas
  const el = document.getElementById('modal-ejercicio');
  el.querySelector('.modal-title').textContent = 'Añadir ejercicio';
  el.querySelector('.modal-body').innerHTML = `
    <div style="display:flex;gap:6px;margin-bottom:10px">
      <input class="inp" id="ses-search-ex" placeholder="Buscar ejercicio…" style="flex:1;font-size:13px"
        oninput="_renderSesExList(this.value)">
    </div>
    <div id="ses-ex-list" style="max-height:55dvh;overflow-y:auto;border:1px solid var(--border);border-radius:12px;overflow:hidden"></div>`;
  openModal('modal-ejercicio');
  _renderSesExList('');
}

function _renderSesExList(q) {
  const ql = q.toLowerCase().trim();
  const todos = forge.exercises || [];
  const OCULTAR = ['warmup', 'stretch'];

  let html = '';

  if (ql.length >= 2) {
    // Búsqueda plana
    const filtrados = todos
      .filter(e => !OCULTAR.includes(e.type) && (e.name.toLowerCase().includes(ql) || (e.muscle||'').includes(ql)))
      .sort((a,b) => a.name.localeCompare(b.name,'es'));
    html = filtrados.map(e =>
      `<div style="display:flex;align-items:center;border-bottom:1px solid var(--border)" onclick="addExToSession('${e.id}')">
        <div style="flex:1;padding:10px 14px;cursor:pointer">
          <div style="font-size:13px;font-weight:600;color:var(--ink)">${e.name}</div>
          <div style="font-size:10px;color:var(--ink3)">${TIPO_LABEL[e.type]||e.type} · ${e.muscle||''}</div>
        </div>
        <div style="padding:10px 14px;color:var(--p);font-size:18px;cursor:pointer">+</div>
      </div>`
    ).join('') || '<div style="padding:20px;text-align:center;color:var(--ink3)">Sin resultados</div>';
  } else {
    // Agrupado por músculo
    const porMusculo = {};
    todos.forEach(e => {
      if (OCULTAR.includes(e.type)) return;
      const m = e.muscle || 'otros';
      if (!porMusculo[m]) porMusculo[m] = [];
      porMusculo[m].push(e);
    });
    const orden = [...GRUPOS_MUSCULARES.map(g => g.key), 'piernas', 'otros'];
    new Set(orden).forEach(mKey => {
      const exs = porMusculo[mKey]; if (!exs || !exs.length) return;
      const gInfo = GRUPOS_MUSCULARES.find(g => g.key === mKey) || { label: mKey, emoji: '◈' };
      html += `<div style="background:var(--bg3);padding:7px 14px;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--ink3);font-weight:700">${gInfo.emoji} ${gInfo.label}</div>`;
      exs.forEach(e => {
        html += `<div style="display:flex;align-items:center;border-bottom:1px solid var(--border)" onclick="addExToSession('${e.id}')">
          <div style="flex:1;padding:9px 14px;cursor:pointer">
            <div style="font-size:13px;font-weight:600;color:var(--ink)">${e.name}</div>
            <div style="font-size:10px;color:var(--ink3)">${TIPO_LABEL[e.type]||e.type}${e.restSec>0?' · '+Math.floor(e.restSec/60)+'min':''}</div>
          </div>
          <div style="padding:10px 14px;color:var(--p);font-size:18px;cursor:pointer">+</div>
        </div>`;
      });
    });
  }

  const listEl = document.getElementById('ses-ex-list');
  if (listEl) listEl.innerHTML = html;
}
function addExToSession(exId){
  if(!activeSession) return;
  activeSession.exercises.push({exId,sets:[{type:'weight',done:false,weight:0,reps:8,distance:'',time:''}]});
  closeModal('modal-ejercicio');
  const container=document.getElementById('session-exs');
  container.innerHTML=activeSession.exercises.map((ex,i)=>renderSexBlock(ex,i)).join('');
}

function _exRestSec(exId, ses){
  // Descanso específico del ejercicio en esta sesión, o el de la rutina, o 90s
  const ex=(ses?.exercises||[]).find(e=>e.exId===exId);
  if(ex?._restSec) return ex._restSec;
  const eDef=getEx(exId);
  return eDef?.restSec || ses?.restSec || 90;
}

function abrirDescansoEx(ei){
  if(!activeSession) return;
  const ex=activeSession.exercises[ei];
  const actual=_exRestSec(ex.exId, activeSession);
  const opciones=[30,45,60,90,120,150,180,240,300];
  const html=opciones.map(s=>{
    const min=Math.floor(s/60), seg=s%60;
    const label=min>0?(seg>0?`${min}:${String(seg).padStart(2,'0')}`:`${min} min`):`${s}s`;
    const sel=s===actual;
    return `<button onclick="setDescansoEx(${ei},${s})" style="
      padding:10px;border-radius:var(--r);border:2px solid ${sel?'var(--orange)':'var(--border)'};
      background:${sel?'var(--orange)':'var(--bg2)'};color:${sel?'#fff':'var(--ink)'};
      font-family:var(--fb);font-size:14px;font-weight:700;cursor:pointer;text-align:center">
      ${label}
    </button>`;
  }).join('');

  const eDef=getEx(ex.exId);
  document.getElementById('modal-ejercicio').querySelector('.modal-title').textContent=`⏱ Descanso — ${eDef?.name||'Ejercicio'}`;
  document.getElementById('modal-ejercicio').querySelector('.modal-body').innerHTML=`
    <div style="font-size:12px;color:var(--ink3);margin-bottom:12px">Selecciona el tiempo de descanso entre series para este ejercicio:</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">${html}</div>`;
  openModal('modal-ejercicio');
}

function setDescansoEx(ei, secs){
  if(!activeSession) return;
  activeSession.exercises[ei]._restSec = secs;
  const lbl=document.getElementById(`rest-lbl-${ei}`);
  if(lbl) lbl.textContent=secs+'s';
  closeModal('modal-ejercicio');
  showToast(`⏱ Descanso: ${secs}s`,1500,'ok');
}

// ── Reemplazar ejercicio en sesión activa ──────────────────────
let _reexIdx = -1; // índice del ejercicio a reemplazar

function abrirReemplazarEx(ei){
  _reexIdx = ei;
  const exId = activeSession?.exercises[ei]?.exId;
  const e = getEx(exId);
  document.getElementById('reex-nombre-actual').textContent = `Reemplazar: ${e?.name||'—'}`;
  document.getElementById('reex-search').value = '';
  document.getElementById('reex-solo-sesion').checked = true;
  reexRenderLista('');
  openModal('modal-reemplazar-ex');
}

function reexRenderLista(q){
  const exActualId = activeSession?.exercises[_reexIdx]?.exId;
  const exActual   = getEx(exActualId);
  const musculoActual = exActual?.muscle || '';
  const grupoActual   = exActual?.grupo  || '';   // ej. "Sentadilla"
  const ql = q.toLowerCase().trim();

  // Pool: todos excepto el actual, sin calentamiento ni estiramiento
  const pool = (forge.exercises||[])
    .filter(e => e.id !== exActualId && e.type !== 'warmup' && e.type !== 'stretch');

  // Con búsqueda → lista plana filtrada, sin secciones
  if (ql.length >= 2) {
    const filtrados = pool
      .filter(e => e.name.toLowerCase().includes(ql) ||
                   (e.muscle||'').includes(ql) ||
                   (e.grupo||'').toLowerCase().includes(ql))
      .sort((a,b) => {
        // Mismo grupo primero, luego mismo músculo, luego el resto
        const aGr = a.grupo === grupoActual ? 0 : a.muscle === musculoActual ? 1 : 2;
        const bGr = b.grupo === grupoActual ? 0 : b.muscle === musculoActual ? 1 : 2;
        return aGr - bGr || a.name.localeCompare(b.name, 'es');
      });

    document.getElementById('reex-lista').innerHTML =
      (filtrados.map(_reexFila).join('') ||
       '<div style="padding:20px;text-align:center;color:var(--ink3);font-size:13px">Sin resultados</div>')
      + _reexOtroHtml();
    return;
  }

  // ── Sin búsqueda: 3 secciones ──────────────────────────────

  // 1. Variantes del mismo ejercicio base (mismo grupo, ej. "Sentadilla")
  const variantes = grupoActual
    ? pool.filter(e => e.grupo === grupoActual)
    : [];

  // 2. Mismo grupo muscular (ej. cuadriceps) pero distinto grupo de variante
  const mismoMusculo = pool
    .filter(e => e.muscle === musculoActual && e.grupo !== grupoActual)
    .sort((a,b) => a.name.localeCompare(b.name,'es'));

  // 3. Resto — ordenado por músculo → nombre
  const GRUPO_ORDER = ['cuadriceps','isquios','gluteos','gemelos','pecho','espalda','hombros','biceps','triceps','core','cardio'];
  const resto = pool
    .filter(e => e.muscle !== musculoActual)
    .sort((a,b) => {
      const ia = GRUPO_ORDER.indexOf(a.muscle), ib = GRUPO_ORDER.indexOf(b.muscle);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.name.localeCompare(b.name,'es');
    });

  let html = '';

  // Sección 1 — variantes del mismo ejercicio
  if (variantes.length) {
    const gInfo = GRUPOS_MUSCULARES.find(g => g.key === musculoActual);
    html += _reexHeader(`Variantes · ${grupoActual}`, 'var(--p)');
    html += variantes.map(_reexFila).join('');
  }

  // Sección 2 — mismo músculo
  if (mismoMusculo.length) {
    const gInfo = GRUPOS_MUSCULARES.find(g => g.key === musculoActual);
    const label = gInfo ? `${gInfo.emoji} ${gInfo.label}` : musculoActual;
    html += _reexHeader(label, 'var(--ink2)');
    html += mismoMusculo.map(_reexFila).join('');
  }

  // Sección 3 — resto agrupado por músculo
  if (resto.length) {
    html += _reexHeader('Otros grupos musculares', 'var(--ink3)');
    let lastMuscle = '';
    resto.forEach(e => {
      if (e.muscle !== lastMuscle) {
        const gInfo = GRUPOS_MUSCULARES.find(g => g.key === e.muscle);
        const lbl = gInfo ? `${gInfo.emoji} ${gInfo.label}` : e.muscle;
        html += `<div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--ink3);padding:6px 16px 2px;background:var(--bg3)">${lbl}</div>`;
        lastMuscle = e.muscle;
      }
      html += _reexFila(e);
    });
  }

  if (!html) html = '<div style="padding:20px;text-align:center;color:var(--ink3)">Sin ejercicios disponibles</div>';
  document.getElementById('reex-lista').innerHTML = html + _reexOtroHtml();
}

// Cabecera de sección en el modal de reemplazo
function _reexHeader(label, color) {
  return `<div style="font-size:9px;letter-spacing:2.5px;text-transform:uppercase;font-weight:700;
    padding:8px 16px 4px;background:var(--bg3);border-bottom:1px solid var(--border);
    color:${color}">${label}</div>`;
}

// Fila individual de ejercicio en el modal de reemplazo
function _reexFila(e) {
  const tipoLabel = TIPO_LABEL[e.type] || e.type;
  const descansa  = e.restSec > 0 ? ` · ${Math.floor(e.restSec/60)}'` : '';
  return `<div onclick="reexConfirmar('${e.id}')" style="display:flex;align-items:center;
    border-bottom:1px solid var(--border);cursor:pointer;transition:background .1s"
    onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
    <div style="flex:1;padding:10px 14px">
      <div style="font-size:13px;font-weight:600;color:var(--ink)">${e.name}</div>
      <div style="font-size:10px;color:var(--ink3);margin-top:1px">${tipoLabel}${descansa}${e.bilateral?' · bilateral':''}</div>
    </div>
    <svg viewBox="0 0 24 24" width="16" height="16" style="flex-shrink:0;margin:0 14px;stroke:var(--p);fill:none;stroke-width:2.5">
      <path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
      <path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
    </svg>
  </div>`;
}

// Bloque "agregar ejercicio personalizado" al pie del modal
function _reexOtroHtml() {
  return `<div style="padding:10px 16px;background:var(--bg3);border-top:2px solid var(--border)">
    <div style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--ink3);font-weight:600;margin-bottom:6px">Ejercicio personalizado</div>
    <div style="display:flex;gap:8px;align-items:center">
      <input class="inp" id="reex-otro-nombre" placeholder="Nombre del ejercicio…" style="flex:1;font-size:13px"
        onkeydown="if(event.key==='Enter') reexAgregarOtro()">
      <button class="btn btn-p btn-sm" onclick="reexAgregarOtro()">Agregar</button>
    </div>
  </div>`;
}

function reexAgregarOtro(){
  const nombre=(document.getElementById('reex-otro-nombre')?.value||'').trim();
  if(!nombre){ showToast('Escribe el nombre del ejercicio'); return; }
  if(!forge.exercises) forge.exercises=[];
  const existe=forge.exercises.find(e=>e.name.toLowerCase()===nombre.toLowerCase());
  if(existe){ reexConfirmar(existe.id); return; }
  const nuevoEx={id:'ex_'+Date.now(),name:nombre,type:'bodyweight',muscle:'piernas',restSec:90};
  forge.exercises.push(nuevoEx);
  saveDB();
  reexConfirmar(nuevoEx.id);
  showToast('✓ "'+nombre+'" guardado y reemplazado',2000,'ok');
}

function reexConfirmar(nuevoExId){
  if(_reexIdx < 0 || !activeSession) return;
  const ei = _reexIdx;
  const exAnterior = activeSession.exercises[ei];
  const eNuevo = getEx(nuevoExId);
  const isRun = eNuevo?.type==='run'||eNuevo?.type==='hiit';
  const scope = document.querySelector('input[name="reex-scope"]:checked')?.value || 'sesion';

  // Reemplazar en la sesión activa
  exAnterior.exId = nuevoExId;
  // Resetear sets al formato correcto del nuevo ejercicio
  const nSeries = exAnterior.sets.length || 3;
  exAnterior.sets = Array.from({length: nSeries}, (_,i) => {
    const setViejo = exAnterior.sets[i] || {};
    return isRun
      ? {type:'run', done:false, distance:'', time:'', fc:'', pasos:'', weight:0, reps:0}
      : {type:'weight', done:false, weight:setViejo.weight||0, reps:setViejo.reps||8,
         distance:'', time:'', fc:'', pasos:'',
         _pesoSugerido:0, _pesoHistorial:0, _fuente:''};
  });

  // Si scope = rutina, también actualizar la rutina base
  if(scope === 'rutina' && activeSession.routineId){
    const rutina = (forge.routines||[]).find(r=>r.id===activeSession.routineId);
    if(rutina){
      const exAnteriorId = Object.keys(rutina._secciones||{}).find(k=>
        rutina.exercises[rutina.exercises.indexOf(k)] === exAnterior.exId
      );
      // Reemplazar en el array de ejercicios de la rutina
      const idxRut = rutina.exercises.findIndex(id=>id===Object.keys(rutina._secciones||{})[ei]||id===activeSession.exercises[ei]?.exId);
      // Buscar el id anterior antes del reemplazo — lo buscamos por posición
      const idxPos = ei < rutina.exercises.length ? ei : -1;
      if(idxPos >= 0){
        const idViejo = rutina.exercises[idxPos];
        rutina.exercises[idxPos] = nuevoExId;
        // Migrar metadatos (_secciones, _series, _restEx)
        if(rutina._secciones?.[idViejo]){ rutina._secciones[nuevoExId]=rutina._secciones[idViejo]; delete rutina._secciones[idViejo]; }
        if(rutina._series?.[idViejo]){    rutina._series[nuevoExId]=rutina._series[idViejo];       delete rutina._series[idViejo]; }
        if(rutina._restEx?.[idViejo]){   rutina._restEx[nuevoExId]=rutina._restEx[idViejo];        delete rutina._restEx[idViejo]; }
      }
      saveDB();
      showToast(`✓ Reemplazado en sesión y rutina`,2500,'ok');
    }
  } else {
    showToast(`✓ Reemplazado solo en esta sesión`,2000,'ok');
  }

  closeModal('modal-reemplazar-ex');
  // Re-renderizar la sesión
  const container = document.getElementById('session-exs');
  container.innerHTML = activeSession.exercises.map((ex,i)=>renderSexBlock(ex,i)).join('');
}
// ── EDITOR DE RUTINAS ─────────────────────────────────────────
// Estado temporal del editor
let re = { id:'', nombre:'', emoji:'◈', restSec:90, ejercicios:[], seccion:'principal' };
// ejercicios: [{exId, seccion:'calentamiento'|'principal'|'enfriamiento', series:[{peso,reps,tipo}], restSec}]

function openNewRutina(){
  re = {id:'', nombre:'', emoji:'◈', restSec:90, ejercicios:[]};
  abrirEditorRutina();
}

function openEditRutina(id){
  const r=(forge.routines||[]).find(x=>x.id===id); if(!r) return;
  re = {
    id: r.id,
    nombre: r.name,
    emoji: r.emoji||'◈',
    restSec: r.restSec||90,
    ejercicios: (r.exercises||[]).map(exId=>({
      exId,
      seccion: r._secciones?.[exId]||'principal',
      series: r._series?.[exId]||[{peso:0,reps:8},{peso:0,reps:8},{peso:0,reps:8}],
      restSec: r._restEx?.[exId]||r.restSec||90
    }))
  };
  abrirEditorRutina();
}

function abrirEditorRutina(){
  document.getElementById('re-nombre').value = re.nombre;
  document.getElementById('re-emoji').value  = re.emoji;
  document.getElementById('re-rest').value   = re.restSec;
  reRenderLista();
  document.getElementById('rutina-editor').style.display='flex';
}

function cerrarEditorRutina(){
  document.getElementById('rutina-editor').style.display='none';
}

function reToggleSeccion(sec){
  const btn=document.getElementById('re-btn-'+sec.slice(0,3));
  const tiene=re.ejercicios.some(e=>e.seccion===sec);
  if(tiene){
    re.ejercicios=re.ejercicios.filter(e=>e.seccion!==sec);
    if(btn){btn.style.background='var(--bg3)';btn.style.color='var(--ink3)';btn.style.borderColor='var(--border2)';}
  } else {
    // Agregar placeholder de sección — el usuario añadirá ejercicios después
    showToast(`Sección ${sec} activada — agrega ejercicios y asígnalos`,3000);
    if(btn){btn.style.background='var(--bg3)';btn.style.color='var(--green)';btn.style.borderColor='var(--green)';}
  }
  reRenderLista();
}

function reRenderLista(){
  const container=document.getElementById('re-lista');
  const secciones=[
    {key:'calentamiento', label:'✦ Calentamiento', color:'var(--gold)'},
    {key:'principal',     label:'◈ Principal',      color:'var(--orange)'},
    {key:'enfriamiento',  label:'◌ Enfriamiento',   color:'var(--blue)'},
  ];

  let html='';
  secciones.forEach(sec=>{
    const exs=re.ejercicios.filter(e=>e.seccion===sec.key);
    if(!exs.length && sec.key!=='principal') return;

    html+=`<div style="margin-bottom:20px">
      <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${sec.color};font-weight:700;margin-bottom:8px">${sec.label}</div>`;

    if(!exs.length){
      html+=`<div style="border:1px dashed var(--border2);border-radius:var(--rl);padding:16px;text-align:center;color:var(--ink3);font-size:13px">
        Sin ejercicios — toca "+ Agregar ejercicio"</div>`;
    } else {
      exs.forEach((ex,idx)=>{
        const globalIdx=re.ejercicios.indexOf(ex);
        const e=getEx(ex.exId);
        if(!e) return;
        const isRun=e.type==='run'||e.type==='hiit';
        html+=`
        <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);margin-bottom:8px;overflow:hidden">
          <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--border)">
            <div style="display:flex;flex-direction:column;gap:3px;cursor:ns-resize;color:var(--ink3);padding:0 4px" title="Arrastrar para reordenar">
              <svg viewBox="0 0 16 10" width="16" height="10" fill="var(--ink3)"><rect width="16" height="2" rx="1"/><rect y="4" width="16" height="2" rx="1"/><rect y="8" width="16" height="2" rx="1"/></svg>
            </div>
            <div style="flex:1">
              <div style="font-size:14px;font-weight:700;color:var(--ink)">${e.name}</div>
              <div style="font-size:11px;color:var(--ink3);margin-top:1px">${e.type} · ${e.muscle||'—'}</div>
            </div>
            <div style="display:flex;gap:4px">
              <select onchange="reMoveSec(${globalIdx},this.value)"
                style="background:var(--bg3);border:1px solid var(--border2);border-radius:5px;color:var(--ink3);font-size:10px;padding:3px 6px;cursor:pointer">
                <option value="calentamiento" ${ex.seccion==='calentamiento'?'selected':''}>✦ Cal.</option>
                <option value="principal"     ${ex.seccion==='principal'?'selected':''}>◈ Princ.</option>
                <option value="enfriamiento"  ${ex.seccion==='enfriamiento'?'selected':''}>◌ Enf.</option>
              </select>
              <button onclick="reQuitarEx(${globalIdx})"
                style="background:none;border:none;color:var(--red);cursor:pointer;font-size:16px;padding:2px 6px">✕</button>
            </div>
          </div>
          <!-- Descanso del ejercicio -->
          <div style="display:flex;align-items:center;gap:8px;padding:6px 12px;background:var(--bg3);border-bottom:1px solid var(--border);font-size:11px;color:var(--ink3)">
            <span>Descanso:</span>
            <select onchange="re.ejercicios[${globalIdx}].restSec=parseInt(this.value)"
              style="background:var(--bg2);border:1px solid var(--border2);border-radius:4px;color:var(--ink2);font-size:11px;padding:2px 6px">
              <option value="30" ${ex.restSec===30?'selected':''}>30s</option>
              <option value="60" ${ex.restSec===60?'selected':''}>1 min</option>
              <option value="90" ${ex.restSec===90?'selected':''}>1:30</option>
              <option value="120" ${ex.restSec===120?'selected':''}>2 min</option>
              <option value="180" ${ex.restSec===180?'selected':''}>3 min</option>
              <option value="300" ${ex.restSec===300?'selected':''}>5 min</option>
            </select>
          </div>
          <!-- Series -->
          ${isRun?`
          <div style="padding:10px 12px;font-size:12px;color:var(--ink3)">
            Ejercicio de cardio — los datos se registran durante la sesión (km, tiempo, FC, pasos).
          </div>`:`
          <div style="padding:8px 12px">
            <div style="display:grid;grid-template-columns:32px 1fr 1fr auto;gap:6px;font-size:10px;color:var(--ink3);margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px">
              <span>#</span><span>Peso kg</span><span>Reps</span><span></span>
            </div>
            ${(ex.series||[]).map((s,si)=>`
            <div style="display:grid;grid-template-columns:32px 1fr 1fr auto;gap:6px;align-items:center;margin-bottom:5px">
              <span style="font-size:13px;font-weight:700;color:var(--ink3)">${si+1}</span>
              <input type="text" value="${s.peso||''}" placeholder="kg"
                oninput="re.ejercicios[${globalIdx}].series[${si}].peso=parseFloat(normDec(this.value))||0"
                class="inp" style="padding:7px;font-size:13px;text-align:center" inputmode="decimal">
              <input type="number" value="${s.reps||''}" placeholder="reps"
                oninput="re.ejercicios[${globalIdx}].series[${si}].reps=parseInt(this.value)||0"
                class="inp" style="padding:7px;font-size:13px;text-align:center" inputmode="numeric">
              <button onclick="reQuitarSerie(${globalIdx},${si})"
                style="background:none;border:none;color:var(--red);cursor:pointer;font-size:14px;padding:2px 4px">✕</button>
            </div>`).join('')}
            <button onclick="reAgregarSerie(${globalIdx})"
              style="background:none;border:none;color:var(--orange);cursor:pointer;font-size:12px;font-weight:600;padding:4px 0;display:block">
              + Serie
            </button>
          </div>`}
        </div>`;
      });
    }
    html+='</div>';
  });

  container.innerHTML=html||'<div class="empty"><div class="empty-icon">▤</div><div class="empty-text">Sin ejercicios</div><div class="empty-sub">Toca "+ Agregar ejercicio" para empezar.</div></div>';
}

function reMoveSec(idx,sec){
  if(re.ejercicios[idx]) re.ejercicios[idx].seccion=sec;
  reRenderLista();
}
function reQuitarEx(idx){ re.ejercicios.splice(idx,1); reRenderLista(); }
function reQuitarSerie(exIdx,serIdx){ re.ejercicios[exIdx].series.splice(serIdx,1); reRenderLista(); }
function reAgregarSerie(exIdx){
  const last=re.ejercicios[exIdx].series.slice(-1)[0]||{peso:0,reps:8};
  re.ejercicios[exIdx].series.push({peso:last.peso,reps:last.reps});
  reRenderLista();
}

function reAbrirSelectorEx(){
  document.getElementById('re-search-ex').value='';
  reRenderSelectorEx('');
  document.getElementById('re-selector-ex').style.display='flex';
}
function reRenderSelectorEx(q) {
  const ql = q.toLowerCase().trim();
  const todos = (forge.exercises || []);

  // Si hay búsqueda → lista plana filtrada
  if (ql.length >= 2) {
    const filtrados = todos
      .filter(e => e.name.toLowerCase().includes(ql) || (e.muscle||'').toLowerCase().includes(ql) || (e.grupo||'').toLowerCase().includes(ql))
      .filter(e => e.type !== 'warmup' && e.type !== 'stretch')
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));

    const filas = filtrados.map(e => _exSelectorRow(e)).join('');
    document.getElementById('re-ex-list').innerHTML =
      (filas || '<div style="padding:20px;text-align:center;color:var(--ink3);font-size:13px">Sin resultados</div>')
      + _exOtroHtml(q);
    return;
  }

  // Sin búsqueda → agrupar por músculo
  // Ocultar calentamiento/estiramiento en el selector principal
  const OCULTAR = ['warmup','stretch'];

  // Construir mapa músculo → ejercicios
  const porMusculo = {};
  todos.forEach(e => {
    if (OCULTAR.includes(e.type)) return;
    const m = e.muscle || 'otros';
    if (!porMusculo[m]) porMusculo[m] = [];
    porMusculo[m].push(e);
  });

  // Renderizar por grupos en el orden definido
  let html = '';
  const gruposOrden = [...GRUPOS_MUSCULARES.map(g => g.key), 'piernas', 'otros'];

  // Agregar grupos que existan en los datos pero no estén en GRUPOS_MUSCULARES
  Object.keys(porMusculo).forEach(k => {
    if (!gruposOrden.includes(k)) gruposOrden.push(k);
  });

  new Set(gruposOrden).forEach(mKey => {
    const exsDeMusculo = porMusculo[mKey];
    if (!exsDeMusculo || !exsDeMusculo.length) return;

    const grupoInfo = GRUPOS_MUSCULARES.find(g => g.key === mKey) || { label: mKey.charAt(0).toUpperCase() + mKey.slice(1), emoji: '◈' };

    // Agrupar variantes del mismo ejercicio base (por campo grupo o por nombre base)
    const conGrupo = exsDeMusculo.filter(e => e.grupo);
    const sinGrupo = exsDeMusculo.filter(e => !e.grupo);

    // Ejercicios con grupo (variantes agrupadas)
    const subgrupos = {};
    conGrupo.forEach(e => {
      const g = e.grupo;
      if (!subgrupos[g]) subgrupos[g] = [];
      subgrupos[g].push(e);
    });

    let grupoHtml = '';

    // Subgrupos de variantes
    Object.entries(subgrupos).forEach(([sgLabel, variantes]) => {
      if (variantes.length === 1) {
        grupoHtml += _exSelectorRow(variantes[0]);
      } else {
        // Acordeón de variantes
        const sgId = 'sg_' + sgLabel.replace(/\s/g,'_') + '_' + mKey;
        grupoHtml += `
          <div style="border-bottom:1px solid var(--border)">
            <div onclick="toggleExSubgrupo('${sgId}')" style="display:flex;align-items:center;justify-content:space-between;padding:11px 16px;cursor:pointer;background:var(--bg2)">
              <div>
                <div style="font-size:13px;font-weight:600;color:var(--ink)">${sgLabel}</div>
                <div style="font-size:10px;color:var(--ink3);margin-top:1px">${variantes.length} variantes · ${variantes.map(v=>TIPO_LABEL[v.type]||v.type).join(' · ')}</div>
              </div>
              <svg id="chev-${sgId}" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--ink3)" stroke-width="2" style="transition:transform .2s;flex-shrink:0">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
            <div id="${sgId}" style="display:none;background:var(--bg3)">
              ${variantes.map(v => _exSelectorRow(v, true)).join('')}
            </div>
          </div>`;
      }
    });

    // Ejercicios sin subgrupo (cardio, plyo, etc.)
    sinGrupo.forEach(e => {
      grupoHtml += _exSelectorRow(e);
    });

    if (!grupoHtml) return;
    html += `
      <div style="background:var(--bg3);padding:8px 16px 4px;border-bottom:1px solid var(--border)">
        <div style="font-size:9px;letter-spacing:2.5px;text-transform:uppercase;color:var(--ink3);font-weight:700">${grupoInfo.emoji} ${grupoInfo.label}</div>
      </div>
      ${grupoHtml}`;
  });

  document.getElementById('re-ex-list').innerHTML = (html || '<div style="padding:20px;text-align:center;color:var(--ink3)">Sin ejercicios disponibles</div>') + _exOtroHtml('');
}

// Fila individual de ejercicio en el selector
function _exSelectorRow(e, indent = false) {
  return `<div style="display:flex;align-items:center;border-bottom:1px solid var(--border);${indent?'padding-left:8px':''}">
    <div style="flex:1;padding:10px ${indent?'12px':'16px'};cursor:pointer" onclick="reAgregarEx('${e.id}')">
      <div style="font-size:13px;font-weight:600;color:var(--ink)">${e.name}</div>
      <div style="font-size:10px;color:var(--ink3);margin-top:1px">${TIPO_LABEL[e.type]||e.type}${e.restSec>0?' · '+Math.floor(e.restSec/60)+'min descanso':''}${e.youtubeId?' · 🎬':''}${e.bilateral?' · bilateral':''}</div>
    </div>
    <button onclick="event.stopPropagation();abrirEditarEjercicio('${e.id}')" style="background:none;border:none;cursor:pointer;padding:10px 8px;color:var(--ink3);font-size:14px;flex-shrink:0" title="Editar">✏</button>
    <div onclick="reAgregarEx('${e.id}')" style="padding:10px 14px;cursor:pointer;color:var(--p);flex-shrink:0;font-size:18px;font-weight:300">+</div>
  </div>`;
}

// HTML del bloque "Otro"
function _exOtroHtml(q) {
  return `<div style="padding:10px 16px;background:var(--bg3);border-top:2px solid var(--border)">
    <div style="font-size:11px;color:var(--ink3);font-weight:600;margin-bottom:6px;letter-spacing:1px;text-transform:uppercase">Agregar ejercicio personalizado</div>
    <div style="display:flex;gap:8px;align-items:center">
      <input class="inp" id="re-otro-nombre" placeholder="Nombre del ejercicio…"
        value="${q}" style="flex:1;font-size:13px"
        onkeydown="if(event.key==='Enter') reAgregarOtro()">
      <button class="btn btn-p btn-sm" onclick="reAgregarOtro()">Agregar</button>
    </div>
  </div>`;
}

function toggleExSubgrupo(id) {
  const el = document.getElementById(id);
  const chev = document.getElementById('chev-' + id);
  if (!el) return;
  const open = el.style.display !== 'none';
  el.style.display = open ? 'none' : 'block';
  if (chev) chev.style.transform = open ? '' : 'rotate(180deg)';
}

function reAgregarOtro(){
  const input=document.getElementById('re-otro-nombre');
  const nombre=(input?.value||'').trim();
  if(!nombre){ showToast('Escribe el nombre del ejercicio'); return; }
  if(!forge.exercises) forge.exercises=[];
  // Verificar que no exista ya
  const existe=forge.exercises.find(e=>e.name.toLowerCase()===nombre.toLowerCase());
  if(existe){ reAgregarEx(existe.id); return; }
  // Crear ejercicio nuevo con valores por defecto
  const nuevoEx={
    id:'ex_'+Date.now(),
    name: nombre,
    type:'bodyweight',
    muscle:'core',
    restSec:90
  };
  forge.exercises.push(nuevoEx);
  saveDB();
  reAgregarEx(nuevoEx.id);
  showToast(`✓ "${nombre}" guardado en ejercicios`,2000,'ok');
}
function reAgregarEx(exId){
  const e=getEx(exId);
  const isRun=e?.type==='run'||e?.type==='hiit';
  re.ejercicios.push({
    exId,
    seccion:'principal',
    series: isRun?[]:[{peso:0,reps:8},{peso:0,reps:8},{peso:0,reps:8}],
    restSec: re.restSec
  });
  document.getElementById('re-selector-ex').style.display='none';
  reRenderLista();
}
function reAbrirNuevoEx(){
  document.getElementById('ex-edit-id').value='';
  document.getElementById('ex-name').value='';
  document.getElementById('ex-youtube').value='';
  document.getElementById('ex-yt-preview').style.display='none';
  document.getElementById('ex-yt-iframe').src='';
  document.getElementById('re-selector-ex').style.display='none';
  openModal('modal-ejercicio');
}
function abrirEditarEjercicio(exId){
  const e=getEx(exId); if(!e) return;
  document.getElementById('ex-edit-id').value=e.id;
  document.getElementById('ex-name').value=e.name;
  document.getElementById('ex-type').value=e.type||'bodyweight';
  document.getElementById('ex-muscle').value=e.muscle||'core';
  document.getElementById('ex-rest').value=e.restSec||90;
  const ytUrl=e.youtubeId?'https://www.youtube.com/watch?v='+e.youtubeId:'';
  document.getElementById('ex-youtube').value=ytUrl;
  if(e.youtubeId){
    document.getElementById('ex-yt-iframe').src='https://www.youtube.com/embed/'+e.youtubeId;
    document.getElementById('ex-yt-preview').style.display='block';
  } else {
    document.getElementById('ex-yt-iframe').src='';
    document.getElementById('ex-yt-preview').style.display='none';
  }
  document.getElementById('re-selector-ex').style.display='none';
  openModal('modal-ejercicio');
}

function guardarEditorRutina(){
  const nombre=document.getElementById('re-nombre').value.trim();
  if(!nombre){ showToast('Ingresa un nombre para la rutina'); return; }
  if(!forge.routines) forge.routines=[];

  const r={
    id: re.id||'r_'+Date.now(),
    name: nombre,
    emoji: document.getElementById('re-emoji').value||'◈',
    restSec: parseInt(document.getElementById('re-rest').value)||90,
    exercises: re.ejercicios.map(e=>e.exId),
    _secciones: Object.fromEntries(re.ejercicios.map(e=>[e.exId,e.seccion])),
    _series:    Object.fromEntries(re.ejercicios.map(e=>[e.exId,e.series])),
    _restEx:    Object.fromEntries(re.ejercicios.map(e=>[e.exId,e.restSec])),
  };

  if(re.id){
    const idx=forge.routines.findIndex(x=>x.id===re.id);
    if(idx>=0) forge.routines[idx]=r; else forge.routines.push(r);
  } else {
    // Evitar duplicados por nombre similar
    const similar=forge.routines.findIndex(x=>x.name.toLowerCase()===nombre.toLowerCase());
    if(similar>=0){
      if(!confirm(`Ya existe una rutina llamada "${forge.routines[similar].name}". ¿Reemplazarla?`)) return;
      forge.routines[similar]=r;
    } else {
      forge.routines.push(r);
    }
  }
  saveDB();
  cerrarEditorRutina();
  renderRutinas();
  showToast('✓ Rutina guardada',2000,'ok');
}

function ytIdFromUrl(url){
  if(!url) return '';
  const m = url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : '';
}
function exPreviewYT(url){
  const id = ytIdFromUrl(url);
  const preview = document.getElementById('ex-yt-preview');
  const iframe  = document.getElementById('ex-yt-iframe');
  if(id){
    iframe.src = `https://www.youtube.com/embed/${id}`;
    preview.style.display = 'block';
  } else {
    iframe.src = '';
    preview.style.display = 'none';
  }
}

function saveEjercicio(){
  const nombre=document.getElementById('ex-name').value.trim(); if(!nombre){ showToast('Ingresa un nombre'); return; }
  const editId=document.getElementById('ex-edit-id').value;
  const ytUrl=document.getElementById('ex-youtube').value.trim();
  const ytId=ytIdFromUrl(ytUrl);
  if(!forge.exercises) forge.exercises=[];
  const e={
    id:editId||'ex_'+Date.now(),
    name:nombre,
    type:document.getElementById('ex-type').value,
    muscle:document.getElementById('ex-muscle').value,
    restSec:parseInt(document.getElementById('ex-rest').value)||90,
  };
  if(ytId) e.youtubeId=ytId;
  if(editId){ const i=forge.exercises.findIndex(x=>x.id===editId); if(i>=0) forge.exercises[i]=e; } else forge.exercises.push(e);
  saveDB(); closeModal('modal-ejercicio');
  showToast('✓ Ejercicio creado',2000,'ok');
  if(document.getElementById('rutina-editor').style.display==='flex') reAgregarEx(e.id);
}

// ── TIMER DE DESCANSO ────────────────────────────────────────────
// ── Audio: desbloquear AudioContext en iOS con el primer toque ─
let _audioCtx=null;
let _melqartAudioUnlocked=false;
function getAudioCtx(){
  if(_audioCtx&&_audioCtx.state==='closed') _audioCtx=null;
  if(!_audioCtx){
    try{ _audioCtx=new(window.AudioContext||window.webkitAudioContext)(); }catch(e){}
  }
  if(_audioCtx&&_audioCtx.state==='suspended'){
    _audioCtx.resume().catch(()=>{});
  }
  return _audioCtx;
}
function getBeepAudioEl(kind='short'){
  if(kind==='final') return document.getElementById('beep-end') || document.getElementById('beep-urgent') || document.getElementById('beep-short');
  if(kind==='urgent') return document.getElementById('beep-urgent') || document.getElementById('beep-short') || document.getElementById('beep-end');
  return document.getElementById('beep-short') || document.getElementById('beep-urgent') || document.getElementById('beep-end');
}
function playHTMLBeep(kind='short'){
  const el=getBeepAudioEl(kind);
  if(!el) return;
  try{
    el.pause(); el.currentTime=0;
    const p=el.play();
    if(p&&p.catch) p.catch(()=>{});
  }catch(e){}
}
function unlockMelqartAudio(){
  const ctx=getAudioCtx();
  if(ctx&&ctx.state==='suspended') ctx.resume().catch(()=>{});
  if(!_melqartAudioUnlocked){
    ['short','urgent','final'].forEach(kind=>{
      const el=getBeepAudioEl(kind);
      if(!el) return;
      try{
        el.muted=true;
        const p=el.play();
        const done=()=>{ try{ el.pause(); el.currentTime=0; el.muted=false; }catch(e){} };
        if(p&&p.then) p.then(done).catch(()=>{ try{ el.muted=false; }catch(e){} });
        else done();
      }catch(e){ try{ el.muted=false; }catch(_){} }
    });
    _melqartAudioUnlocked=true;
  }
}
document.addEventListener('touchstart', unlockMelqartAudio, {passive:true});
document.addEventListener('click',      unlockMelqartAudio, {passive:true});
function playWebBeep(freq=880, dur=0.08, vol=0.3){
  const ctx=getAudioCtx();
  if(!ctx) return false;
  const doBeep=()=>{
    try{
      const osc=ctx.createOscillator(), gain=ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value=freq; osc.type='sine';
      gain.gain.setValueAtTime(Math.max(0.001,vol),ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+dur);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime+dur);
      return true;
    }catch(e){ return false; }
  };
  if(ctx.state==='suspended'){
    ctx.resume().then(doBeep).catch(()=>{});
    return true;
  }
  return doBeep();
}
function beep(freq=880, dur=0.08, vol=0.3){
  unlockMelqartAudio();
  const kind=freq>=1100?'urgent':'short';
  const ok=playWebBeep(freq,dur,vol);
  // Fallback rápido: ayuda cuando iOS suspende WebAudio o hay música de fondo.
  setTimeout(()=>{ if(!ok) playHTMLBeep(kind); }, 70);
}
function vibrateRestAlert(sec){
  // Respaldo táctil para cuando iOS/YouTube prioriza otro audio.
  if(sec<=0) return vibrar([180,70,180,70,420]);
  if(sec<=3) return vibrar([70,35,70]);
  return vibrar([55]);
}
function playRestCountdownBeep(sec){
  if(sec<=0) return playRestFinalBeep();
  if(sec<=3){
    beep(1250 + (3-sec)*120, 0.09, 0.55);
    setTimeout(()=>beep(1250 + (3-sec)*120, 0.09, 0.50), 115);
  } else {
    beep(880, 0.12, 0.45);
  }
  vibrateRestAlert(sec);
}
function playRestFinalBeep(){
  playHTMLBeep('final');
  beep(660,0.12,0.50);
  setTimeout(()=>beep(880,0.12,0.50), 170);
  setTimeout(()=>beep(1150,0.16,0.55), 340);
  vibrateRestAlert(0);
}
function testBeep(){
  unlockMelqartAudio();
  beep(880,0.12,0.45);
  setTimeout(()=>beep(1200,0.10,0.55), 180);
  setTimeout(()=>playRestFinalBeep(), 420);
  showToast('Beep de descanso probado', 1600, 'ok');
}
function vibrar(pattern=[50]){
  try{ if(navigator.vibrate) navigator.vibrate(pattern); }catch(e){}
}

function _iniciarTimerSesion(){
  clearInterval(sesTimer);
  sesSeconds=0; _sesAccum=0;
  _sesStartTs=Date.now();
  pedirWakeLock();
  sesTimer=setInterval(()=>{
    // Siempre calcular desde timestamp — preciso aunque vuelva del segundo plano
    sesSeconds=Math.floor((Date.now()-_sesStartTs)/1000)+_sesAccum;
    const el=document.getElementById('ses-timer');
    if(el) el.textContent=fmtTime(sesSeconds);
  },500); // cada 500ms para mayor precisión
}

function startRest(secs, ei, si){
  restTotal=secs; restLeft=secs;
  _restEndTs=Date.now()+(secs*1000);  // timestamp absoluto de fin

  const exs=activeSession?.exercises||[];
  let nextTxt='';
  for(let i=ei;i<exs.length;i++){
    for(let j=(i===ei?si+1:0);j<exs[i].sets.length;j++){
      if(!exs[i].sets[j].done){ const e=getEx(exs[i].exId); nextTxt=e?e.name:''; break; }
    }
    if(nextTxt) break;
  }
  document.getElementById('rest-next').textContent=nextTxt?`Siguiente: ${nextTxt}`:'';
  const restOv=document.getElementById('rest-ov');
  if(restOv){ restOv.classList.remove('urgent','final-alert'); restOv.classList.add('on'); }
  updateRestUI();
  clearInterval(restTimer);
  let _lastBeepSec=-1;
  restTimer=setInterval(()=>{
    const left=Math.ceil((_restEndTs-Date.now())/1000);
    if(left<=0){
      restLeft=0; updateRestUI();
      clearInterval(restTimer); _restEndTs=null;
      skipRest(); playRestFinalBeep(); return;
    }
    if(left!==restLeft){
      restLeft=left;
      updateRestUI();
      // Beep solo 1 vez por segundo aunque el interval corra más seguido
      if(restLeft<=5 && restLeft!==_lastBeepSec){
        _lastBeepSec=restLeft;
        playRestCountdownBeep(restLeft);
      }
    }
  },250); // 250ms — preciso y no pierde segundos al volver del bg
}

function updateRestUI(){
  const el=document.getElementById('rest-secs'); if(!el) return;
  el.textContent=restLeft;
  el.style.color=restLeft<=5?'var(--red)':restLeft<=10?'var(--orange)':'#fff';
  const ov=document.getElementById('rest-ov');
  if(ov){
    ov.classList.toggle('urgent', restLeft>0 && restLeft<=5);
    ov.classList.toggle('final-alert', restLeft===0);
  }
  const fill=document.getElementById('rc-fill'); if(!fill) return;
  fill.style.stroke=restLeft<=5?'var(--red)':restLeft<=10?'var(--red)':'var(--green)';
  const pct=restTotal>0?restLeft/restTotal:0;
  fill.style.strokeDashoffset=201*(1-pct);
}
function skipRest(){
  clearInterval(restTimer);
  _restEndTs=null;
  const ov=document.getElementById('rest-ov');
  if(ov) ov.classList.remove('on','urgent','final-alert');
}
function addRestTime(s){
  if(!_restEndTs) return;
  _restEndTs+=s*1000;
  // No permitir bajar de 5 segundos
  const minTs=Date.now()+5000;
  if(_restEndTs<minTs) _restEndTs=minTs;
  restLeft=Math.ceil((_restEndTs-Date.now())/1000);
  restTotal=Math.max(restTotal,restLeft);
  updateRestUI();
}

// ---------------------------------------------------------------
//  PLAN DE PROGRESIÓN (+2.5% semanal)
// ---------------------------------------------------------------
const EJERCICIOS_CLAVE=[
  {id:'ex_sentadilla',  label:'Sentadilla',  rutinaId:'r_lunes'},
  {id:'ex_press_banca', label:'Press Banca', rutinaId:'r_martes'},
  {id:'ex_correr',      label:'Dist. máx.',  rutinaId:'r_cardio', subkey:'dist'},
  {id:'ex_correr',      label:'Mejor ritmo', rutinaId:'r_cardio', subkey:'ritmo'},
];

function semanaActualPlan(plan){
  const ini=new Date(plan.inicio+'T12:00:00');
  const hoy=new Date();
  const sem=Math.floor((hoy-ini)/(7*86400000))+1;
  return Math.min(Math.max(sem,1),plan.totalSemanas||16);
}

function getCargasSemana(rutinaId){
  const plan=(forge.planes||[]).find(p=>p.activo);
  if(!plan) return {};
  const semG=semanaActualPlan(plan);
  const cargas={};
  EJERCICIOS_CLAVE.forEach(ec=>{
    if(!plan.cargas?.[ec.id]) return;
    const base=plan.cargas[ec.id];
    const factor=Math.pow(1.025,semG-1);
    const e=getEx(ec.id);
    cargas[ec.id]=roundCarga(base*factor, e?.type||'barbell');
  });
  return cargas;
}

function crearPlan(){
  const nombre=document.getElementById('plan-nombre').value.trim()||'Ciclo Fuerza + 10K';
  const inicio=getDatePickerValue('plan-inicio');
  if(!inicio){ showToast('Selecciona la fecha de inicio'); return; }
  const sent  =parseFloat(document.getElementById('plan-sent').value)||75.9;
  const banca =parseFloat(document.getElementById('plan-banca').value)||65;
  const k10   =parseFloat(document.getElementById('plan-10k').value)||53;
  const sentMeta =parseFloat(document.getElementById('plan-sent-meta').value)||95;
  const bancaMeta=parseFloat(document.getElementById('plan-banca-meta').value)||78;
  const k10Meta  =parseFloat(document.getElementById('plan-10k-meta').value)||50;
  const totalSemanas=16;

  const bloqueNombres=['Acumulación (Vol. alto)','Transmutación (Fuerza)','Intensificación (Pico)','Realización (Test)'];
  const bloques=bloqueNombres.map((nombre,i)=>({nombre, semInicio:i*4+1, semFin:(i+1)*4}));

  const plan={
    id:'plan_'+Date.now(), nombre, inicio, totalSemanas,
    cargas:{ex_sentadilla:sent, ex_press_banca:banca, ex_correr:k10},
    metas:{ex_sentadilla:sentMeta, ex_press_banca:bancaMeta, ex_correr:k10Meta},
    metas10kMin:k10Meta, bloques, activo:true, ciclo:1, createdAt:Date.now()
  };
  if(!forge.planes) forge.planes=[];
  forge.planes.forEach(p=>p.activo=false);
  forge.planes.push(plan);

  // ── Reemplazar TODAS las rutinas con exactamente las 5 del plan ──
  // Conservar solo rutinas creadas manualmente (sin ID base)
  const IDS_BASE=new Set(['r_lunes','r_martes','r_mierco','r_jueves','r_jueves_noche','r_cardio']);
  const rutinasManuales=(forge.routines||[]).filter(r=>!IDS_BASE.has(r.id));
  // Las 5 base siempre se reemplazan con la versión fresca
  forge.routines=[...RUTINAS_BASE.map(r=>({...r})), ...rutinasManuales];

  saveDB();
  closeModal('modal-plan');
  showToast('🚀 Plan creado · 5 rutinas listas',3000,'ok');
  renderPerfil();
  renderHome();
  if(currentScreen==='train') renderTrain();
}

// ---------------------------------------------------------------
//  SCREEN: PROGRESO
// ---------------------------------------------------------------
let progTab='ejercicios', photoTab='frente', showRM=false;

function renderProgress(){
  if(progTab==='ejercicios') renderProgEjercicios();
  else if(progTab==='cuerpo') renderProgCuerpo();
  else if(progTab==='plan') renderProgPlan();
  else if(progTab==='recuperacion') renderProgRecuperacion();
  else renderProgFotos();
}
function switchProgTab(tab,btn){
  progTab=tab;
  document.querySelectorAll('#s-progress .tab-btn').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
  document.querySelectorAll('#s-progress .tab-panel').forEach(p=>p.classList.remove('on'));
  document.getElementById('prog-'+tab).classList.add('on');
  renderProgress();
}
function switchPhotoTab(tipo,btn){
  photoTab=tipo;
  document.querySelectorAll('#prog-fotos .tab-btn').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
  renderProgFotos();
}

// ── Ejercicios — SÁNDWICH v124 ──────────────────────────────────

// Estado de apertura y filtro de tiempo por ejercicio
if(!window._progAccState) window._progAccState = {};
if(!window._progAccFiltro) window._progAccFiltro = {};

/** Alterna la apertura de un accordion de ejercicio */
function toggleProgAcc(exId) {
  window._progAccState[exId] = !window._progAccState[exId];
  renderProgEjercicios();
}

/** Cambia el filtro de tiempo de un accordion de ejercicio y lo re-renderiza */
function setProgAccFiltro(exId, filtro) {
  window._progAccFiltro[exId] = filtro;
  // Re-renderizar solo el cuerpo del accordion (optimización)
  const bodyEl = document.getElementById('acc-body-' + exId);
  if (bodyEl) bodyEl.innerHTML = buildAccBody(exId, filtro);
}

/** Construye el HTML del cuerpo del accordion con gráfico + filtros */
function buildAccBody(exId, filtro) {
  const e = getEx(exId); if (!e) return '';
  const isRun = e.type === 'run' || e.type === 'hiit';
  const sesiones = forge.sessions || [];
  filtro = filtro || window._progAccFiltro[exId] || '3m';

  // Recopilar puntos igual que renderExDetail
  const puntos = [];
  sesiones.sort((a, b) => a.date - b.date).forEach(s => {
    const ex = (s.exercises || []).find(x => x.exId === exId); if (!ex) return;
    const fecha = localDateStr(s.date);
    if (isRun) {
      const sets = (ex.sets || []).filter(set => parseFloat(set.distance) > 0 || set.time);
      if (!sets.length) return;
      const totalDist = sets.reduce((a, set) => a + parseFloat(set.distance || 0), 0);
      let totalMins = 0;
      sets.forEach(set => {
        if (set.time) { const p = (set.time + '').split(':'); totalMins += (parseInt(p[0]) || 0) + (parseInt(p[1]) || 0) / 60; }
      });
      const ritmo = totalDist > 0 && totalMins > 0 ? totalMins / totalDist : 0;
      // FC media: promedio de los sets que tienen fc
      const setsConFC = sets.filter(st => parseFloat(st.fc) > 0);
      const fcMedia = setsConFC.length
        ? Math.round(setsConFC.reduce((a, st) => a + parseFloat(st.fc), 0) / setsConFC.length)
        : 0;
      // Pasos totales de la sesión
      const pasosTot = sets.reduce((a, st) => a + (parseInt(st.pasos) || 0), 0);
      // Longitud de zancada en cm
      // Fórmula: distancia(km) × 1000 → metros ÷ pasos → m/paso × 100 → cm/paso
      // Ejemplo validación: 4.09km × 1000 = 4090m ÷ 5575 pasos = 0.7336 m/paso × 100 = 73.4 cm
      // Solo usar sets que tengan AMBOS: distancia > 0 Y pasos > 0
      const setsConPasos = sets.filter(st => parseFloat(st.distance) > 0 && parseInt(st.pasos) > 0);
      let zancadaCm = 0;
      if (setsConPasos.length) {
        const distConPasos = setsConPasos.reduce((a, st) => a + parseFloat(st.distance || 0), 0);
        const pasosConDist = setsConPasos.reduce((a, st) => a + (parseInt(st.pasos) || 0), 0);
        if (distConPasos > 0 && pasosConDist > 0) {
          const metrosPorPaso = (distConPasos * 1000) / pasosConDist; // m/paso
          zancadaCm = Math.round(metrosPorPaso * 100 * 10) / 10; // cm, 1 decimal
        }
      }
      // Pasos por km (cadencia): pasos totales / distancia km
      const pasosPorKm = pasosTot > 0 && totalDist > 0
        ? Math.round(pasosTot / totalDist)
        : 0;
      puntos.push({ fecha, val: totalDist, valDist: totalDist, valRitmo: ritmo,
        valFC: fcMedia, valZancada: zancadaCm, valPasosPorKm: pasosPorKm,
        label: `${totalDist.toFixed(2)}km${ritmo > 0 ? ' · ' + decimalToPace(ritmo) + '/km' : ''}` });
    } else {
      const sets = (ex.sets || []).filter(set => set.done && set.weight);
      if (!sets.length) return;
      const mejor = sets.sort((a, b) => b.weight - a.weight)[0];
      puntos.push({ fecha, val: mejor.weight,
        label: `${mejor.weight}kg×${mejor.reps}`,
        equipment: detectSmith(mejor.weight) ? 'Smith' : '' });
    }
  });

  // KPIs rápidos
  const pr = isRun ? null : getPR(exId);
  const runPR = isRun ? getRunPRObj(exId) : null;
  const totalSes = puntos.length;
  const primera = puntos[0], ultima = puntos[puntos.length - 1];
  const delta = primera && ultima && !isRun ? Math.round((ultima.val - primera.val) * 10) / 10 : 0;

  // Filtros de tiempo disponibles
  const FILTROS = [
    { id: '1m', label: '1M' }, { id: '3m', label: '3M' },
    { id: '6m', label: '6M' }, { id: '12m', label: '12M' }, { id: 'all', label: 'Todo' }
  ];
  const filtrosHtml = `<div class="acc-filters">` +
    FILTROS.map(f =>
      `<button class="acc-filter-btn${f.id === filtro ? ' on' : ''}"
        onclick="event.stopPropagation();setProgAccFiltro('${exId}','${f.id}')">${f.label}</button>`
    ).join('') + `</div>`;

  // KPIs
  let kpisHtml = '';
  if (!isRun) {
    const deltaColor = delta > 0 ? 'var(--ok)' : delta < 0 ? 'var(--warn)' : 'var(--ink3)';
    const rm = pr && pr.weight > 0 ? est1RM(pr.weight, pr.reps || 1) : 0;
    kpisHtml = `<div class="acc-kpis">
      <div class="acc-kpi">
        <div class="acc-kpi-val" style="color:var(--acc)">${pr && pr.weight > 0 ? pr.weight + ' kg' : '—'}</div>
        <div class="acc-kpi-lbl">PDR · ${pr ? (pr.reps || 0) + ' reps' : '—'}</div>
      </div>
      <div class="acc-kpi">
        <div class="acc-kpi-val" style="color:${deltaColor}">${delta > 0 ? '+' : ''}${delta} kg</div>
        <div class="acc-kpi-lbl">Progresión total</div>
      </div>
      <div class="acc-kpi">
        <div class="acc-kpi-val">${totalSes}</div>
        <div class="acc-kpi-lbl">Sesiones</div>
      </div>
    </div>`;
  } else {
    const mejorRitmo = runPR && runPR.ritmo > 0 ? decimalToPace(runPR.ritmo) + '/km' : '—';
    const maxDist = runPR && runPR.dist > 0 ? runPR.dist.toFixed(2) + ' km' : '—';
    kpisHtml = `<div class="acc-kpis">
      <div class="acc-kpi">
        <div class="acc-kpi-val" style="color:var(--teal)">${maxDist}</div>
        <div class="acc-kpi-lbl">Dist. máx.</div>
      </div>
      <div class="acc-kpi">
        <div class="acc-kpi-val" style="color:var(--acc)">${mejorRitmo}</div>
        <div class="acc-kpi-lbl">Mejor ritmo</div>
      </div>
      <div class="acc-kpi">
        <div class="acc-kpi-val">${totalSes}</div>
        <div class="acc-kpi-lbl">Sesiones</div>
      </div>
    </div>`;
  }

  // Gráficos con nuevo sistema genérico
  const puntosConData = puntos.map(p => ({
    date: p.fecha,
    label: p.fecha.slice(5).replace('-', '/'),
    value: isRun ? p.valDist : p.val,
    displayValue: p.label,
    equipment: p.equipment
  }));
  const chartHtml = renderMetricChart({
    id: `acc_chart_${exId}`,
    type: isRun ? 'distance' : 'weight',
    unit: isRun ? 'km' : 'kg',
    unitLabel: isRun ? 'km / sesión' : 'kg / sesión',
    title: '',
    data: puntosConData,
    yAxis: { forceZero: isRun },
    tooltip: { showDate: true, showEquipment: !isRun },
    height: 180,
    color: isRun ? 'var(--teal)' : 'var(--p)',
    activeFilter: filtro
  });

  // Si cardio, también gráfico de ritmo + FC + Zancada
  let ritmoChartHtml = '';
  if (isRun) {
    // ── Ritmo ──────────────────────────────────────────────────
    const ritmoData = puntos
      .filter(p => p.valRitmo > 0)
      .map(p => ({
        date: p.fecha,
        label: p.fecha.slice(5).replace('-', '/'),
        value: p.valRitmo,
        displayValue: decimalToPace(p.valRitmo) + ' min/km'
      }));
    if (ritmoData.length >= 2) {
      ritmoChartHtml += renderMetricChart({
        id: `acc_ritmo_${exId}`,
        type: 'pace', unit: 'min/km', unitLabel: 'min/km',
        title: 'Ritmo', subtitle: 'Arriba = más rápido',
        data: ritmoData,
        yAxis: { invertY: true },
        tooltip: { showDate: true },
        height: 160, color: 'var(--p)',
        activeFilter: filtro
      });
    }

    // ── FC media ───────────────────────────────────────────────
    const fcData = puntos
      .filter(p => p.valFC > 0)
      .map(p => ({
        date: p.fecha,
        label: p.fecha.slice(5).replace('-', '/'),
        value: p.valFC,
        displayValue: `${p.valFC} bpm`
      }));
    if (fcData.length >= 2) {
      ritmoChartHtml += renderMetricChart({
        id: `acc_fc_${exId}`,
        type: 'heartrate', unit: 'bpm', unitLabel: 'bpm',
        title: 'FC media', subtitle: 'Frecuencia cardíaca promedio por sesión',
        data: fcData,
        yAxis: { forceZero: false, paddingRatio: 0.08 },
        tooltip: { showDate: true },
        height: 160, color: 'var(--warn)',
        activeFilter: filtro
      });
    }

    // ── Longitud de zancada ────────────────────────────────────
    // Definición: distancia(m) / pasos = metros por zancada → convertido a cm
    // Ejemplo: 4km / 5000 pasos = 0.8m = 80cm por zancada
    // Un corredor eficiente apunta a ~90–100cm (mejora con técnica y velocidad)
    const zancadaData = puntos
      .filter(p => p.valZancada > 0)
      .map(p => ({
        date: p.fecha,
        label: p.fecha.slice(5).replace('-', '/'),
        value: p.valZancada,
        displayValue: `${p.valZancada} cm`
      }));
    if (zancadaData.length >= 2) {
      ritmoChartHtml += renderMetricChart({
        id: `acc_zancada_${exId}`,
        type: 'body_measure', unit: 'cm', unitLabel: 'cm / zancada',
        title: 'Longitud de zancada',
        subtitle: 'Distancia (m) ÷ pasos · Meta: 90–100 cm',
        data: zancadaData,
        yAxis: { forceZero: false, paddingRatio: 0.1 },
        tooltip: { showDate: true },
        height: 160, color: 'var(--teal)',
        activeFilter: filtro
      });
    } else if (fcData.length < 2 && zancadaData.length < 2) {
      // Hint para registrar pasos y FC
      ritmoChartHtml += `<div style="padding:10px 0;font-size:11px;color:var(--ink3)">
        ◈ Registra FC y pasos en cada sesión para ver estos gráficos.
      </div>`;
    }

    // ── Pasos por km (cadencia) ────────────────────────────
    const pasosPorKmData = puntos
      .filter(p => p.valPasosPorKm > 0)
      .map(p => ({
        date: p.fecha,
        label: p.fecha.slice(5).replace('-', '/'),
        value: p.valPasosPorKm,
        displayValue: `${p.valPasosPorKm.toLocaleString('es-CL')} p/km`
      }));
    if (pasosPorKmData.length >= 2) {
      ritmoChartHtml += renderMetricChart({
        id: `acc_cadencia_${exId}`,
        type: 'reps', unit: 'p/km', unitLabel: 'pasos / km',
        title: 'Cadencia',
        subtitle: 'Pasos por km — eficiencia al correr',
        data: pasosPorKmData,
        yAxis: { forceZero: false, paddingRatio: 0.08 },
        tooltip: { showDate: true },
        height: 160, color: 'var(--ok)',
        activeFilter: filtro
      });
    }
  }

  return kpisHtml + filtrosHtml + chartHtml + ritmoChartHtml;
}

function renderProgEjercicios() {
  // KPIs clave (parte superior)
  document.getElementById('prog-kpi-row').innerHTML = renderKPIEjClave();

  const exs = forge.exercises || [];
  const sesiones = forge.sessions || [];

  const exsConData = exs.filter(e =>
    sesiones.some(s => s.exercises?.some(ex =>
      ex.exId === e.id && (ex.sets || []).some(st => st.done && (st.weight > 0 || st.distance))
    ))
  );

  if (!exsConData.length) {
    document.getElementById('prog-ex-list').innerHTML =
      `<div class="empty"><div class="empty-icon" style="font-size:32px;margin-bottom:12px">📊</div>
       <div class="empty-text">Sin datos aún</div>
       <div class="empty-sub">Completa sesiones para ver tu progreso.</div></div>`;
    return;
  }

  // Clasificar ejercicios por grupo
  const KW_INF = ['pierna','glúteo','isquio','cuádricep','gemelo','pantorrilla','sentadilla','peso muerto','hip','búlgara','curl femoral','prensa','pdm','pdmr','rdl','quad','hamstring','glute','calf'];
  const KW_SUP = ['pecho','espalda','hombro','bícep','trícep','dorsal','remo','jalón','press','elevación','fondos','banca','bicep','tricep','chest','back','shoulder','lat'];

  function getGrupo(e) {
    if (e.type === 'run' || e.type === 'hiit') return 'correr';
    const n = (e.name + ' ' + (e.muscle || '')).toLowerCase();
    for (const k of KW_INF) if (n.includes(k)) return 'inferior';
    for (const k of KW_SUP) if (n.includes(k)) return 'superior';
    return 'superior';
  }

  const grupos = {
    inferior: { label: 'Tren Inferior', key: 'inferior', exs: [] },
    superior: { label: 'Tren Superior', key: 'superior', exs: [] },
    correr:   { label: 'Correr', key: 'correr', exs: [] }
  };
  exsConData.forEach(e => grupos[getGrupo(e)].exs.push(e));

  // ── Construye las filas de ejercicio dentro del grupo abierto ──
  function buildGroupBody(grupoKey, exsList) {
    const filtro = window._progAccFiltro['_grupo_' + grupoKey] || '3m';
    const exRows = exsList.map(e => {
      const isRun = e.type === 'run' || e.type === 'hiit';
      const pr = isRun ? null : getPR(e.id);
      const runPR = isRun ? getRunPRObj(e.id) : null;

      // PDR string
      const pdrVal = isRun
        ? (runPR && runPR.dist > 0 ? runPR.dist.toFixed(2) + ' km' : '—')
        : (pr && pr.weight > 0 ? pr.weight + ' kg' : '—');
      const pdrReps = !isRun && pr && pr.weight > 0 ? pr.reps + ' reps' : '';

      // Últimas series de la última sesión
      let seriesHtml = '';
      if (!isRun) {
        const ultSes = sesiones.filter(s => s.exercises?.some(x => x.exId === e.id))
          .sort((a, b) => b.date - a.date)[0];
        if (ultSes) {
          const exEnSes = ultSes.exercises.find(x => x.exId === e.id);
          const sets = (exEnSes?.sets || []).filter(s => s.done && s.weight).slice(0, 4);
          if (sets.length) {
            seriesHtml = `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">` +
              sets.map(s => `<span style="font-size:11px;color:var(--ink3);background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:2px 7px">${s.weight}kg×${s.reps}</span>`).join('') +
              `</div>`;
          }
        }
      } else {
        // Run: última sesión
        const ultSes = sesiones.filter(s => s.exercises?.some(x => x.exId === e.id))
          .sort((a, b) => b.date - a.date)[0];
        if (ultSes) {
          const exEnSes = ultSes.exercises.find(x => x.exId === e.id);
          const sets = exEnSes?.sets || [];
          const dist = sets.reduce((a, s) => a + parseFloat(s.distance || 0), 0);
          if (dist > 0) {
            seriesHtml = `<div style="margin-top:6px"><span style="font-size:11px;color:var(--ink3);background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:2px 7px">${dist.toFixed(2)} km</span></div>`;
          }
        }
      }

      // Gráfico del ejercicio individual (al hacer clic en la fila)
      const exIsOpen = !!window._progAccState[e.id];
      const exBodyHtml = exIsOpen ? buildAccBody(e.id, window._progAccFiltro[e.id] || filtro) : '';

      return `<div style="border-top:1px solid var(--border)">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;padding:12px 16px;cursor:pointer;gap:10px"
          onclick="toggleProgAcc('${e.id}')">
          <div style="flex:1;min-width:0">
            <div style="font-size:14px;font-weight:600;color:var(--ink)">${e.name}</div>
            ${seriesHtml}
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:var(--ink3);font-weight:600;margin-bottom:2px">PDR</div>
            <div style="font-size:15px;font-weight:700;color:var(--p)">${pdrVal}</div>
            ${pdrReps ? `<div style="font-size:10px;color:var(--ink3)">${pdrReps}</div>` : ''}
          </div>
          <svg style="flex-shrink:0;color:var(--ink3);margin-top:4px;transition:transform .2s;transform:${exIsOpen ? 'rotate(180deg)' : 'none'}" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
        ${exIsOpen ? `<div style="padding:0 16px 14px;background:var(--bg3);border-top:1px solid var(--border)" id="acc-body-${e.id}">${exBodyHtml}</div>` : ''}
      </div>`;
    }).join('');

    return exRows;
  }

  const html = Object.entries(grupos)
    .filter(([, g]) => g.exs.length > 0)
    .map(([gKey, g]) => {
      const isOpen = !!window._progAccState['_grupo_' + gKey];
      const resumen = g.exs.length + ' ejercicio' + (g.exs.length > 1 ? 's' : '');
      const bodyHtml = isOpen ? buildGroupBody(gKey, g.exs) : '';
      return `<div class="acc-card${isOpen ? ' open' : ''}" id="acc-grupo-${gKey}">
        <div class="acc-head" onclick="toggleProgAcc('_grupo_${gKey}')">
          <div class="acc-head-left">
            <div class="acc-ex-name" style="font-size:15px;font-weight:700">${g.label}</div>
            <div class="acc-ex-sub">${resumen}</div>
          </div>
          <svg class="acc-chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
        <div class="acc-body" id="acc-body-_grupo_${gKey}" style="padding:0">${bodyHtml}</div>
      </div>`;
    }).join('');

  document.getElementById('prog-ex-list').innerHTML = html;
}

function renderKPIEjClave(){
  const plan=(forge.planes||[]).find(p=>p.activo);
  // Deduplicar IDs para obtener el PR una sola vez
  const runPRCache={};
  return EJERCICIOS_CLAVE.map(ec=>{
    const e=getEx(ec.id); if(!e) return '';
    const isRun=e.type==='run'||e.type==='hiit';
    const pr=getPR(ec.id);
    const meta=plan?.metas?.[ec.id];

    if(isRun){
      // Caché para no recalcular dos veces
      if(!runPRCache[ec.id]) runPRCache[ec.id]=getRunPRObj(ec.id);
      const runPR=runPRCache[ec.id];

      if(ec.subkey==='dist'){
        const distStr=runPR.dist>0?`${runPR.dist.toFixed(2)} km`:'—';
        return `<div class="stat-box" onclick="openExDetail('${ec.id}')" style="cursor:pointer">
          <div style="font-size:9px;letter-spacing:1px;text-transform:uppercase;color:var(--ink3);margin-bottom:4px">${ec.label}</div>
          <div style="font-size:22px;font-weight:800;color:var(--p);line-height:1">${distStr}</div>
        </div>`;
      } else {
        const ritmoStr=runPR.ritmo>0?`${Math.floor(runPR.ritmo)}'${pad(Math.round((runPR.ritmo%1)*60))}"/km`:'—';
        const metaStr=meta?`Meta: ${meta}min`:'';
        return `<div class="stat-box" onclick="openExDetail('${ec.id}')" style="cursor:pointer">
          <div style="font-size:9px;letter-spacing:1px;text-transform:uppercase;color:var(--ink3);margin-bottom:4px">${ec.label}</div>
          <div style="font-size:20px;font-weight:800;color:var(--p);line-height:1">${ritmoStr}</div>
          ${metaStr?`<div style="font-size:10px;color:var(--ink3);margin-top:2px">${metaStr}</div>`:''}
        </div>`;
      }
    }

    // Fuerza
    const valStr=pr.weight>0?`${pr.weight}kg`:'—';
    const metaStr=meta?`Meta: ${meta}kg`:'';
    const pct=meta&&pr.weight>0?Math.min(100,Math.round((pr.weight/meta)*100)):0;
    return `<div class="stat-box" onclick="openExDetail('${ec.id}')" style="cursor:pointer">
      <div style="font-size:9px;letter-spacing:1px;text-transform:uppercase;color:var(--ink3);margin-bottom:4px">${ec.label}</div>
      <div style="font-size:24px;font-weight:800;color:var(--p);line-height:1">${valStr}</div>
      ${metaStr?`<div style="font-size:10px;color:var(--ink3);margin-top:2px">${metaStr}</div>`:''}
      ${pct>0?`<div style="background:var(--bg3);border-radius:2px;height:3px;margin-top:6px;overflow:hidden"><div style="width:${pct}%;height:100%;background:var(--p)"></div></div>`:''}
    </div>`;
  }).join('');
}

function getRunPRObj(exId){
  let bestDist=0, bestRitmo=999;
  (forge.sessions||[]).forEach(s=>(s.exercises||[]).forEach(ex=>{
    if(ex.exId!==exId) return;
    (ex.sets||[]).forEach(set=>{
      const dist=parseFloat(set.distance)||0;
      if(dist>bestDist) bestDist=dist;
      if(set.time&&dist>0){
        const p=(set.time+'').split(':');
        const mins=(parseInt(p[0])||0)+(parseInt(p[1])||0)/60;
        const rit=mins/dist;
        if(rit>0&&rit<bestRitmo) bestRitmo=rit;
      }
    });
  }));
  return {dist:bestDist, ritmo:bestRitmo<900?bestRitmo:0};
}

function getRunPR(exId){
  const pr=getRunPRObj(exId);
  const ritmoStr=pr.ritmo>0?`${Math.floor(pr.ritmo)}'${pad(Math.round((pr.ritmo%1)*60))}"/km`:'—';
  return pr.dist>0?`${pr.dist.toFixed(2)}km · ${ritmoStr}`:'—';
}

// Gráfico de ritmo — v179: eje normal, mayor arriba y menor abajo
function renderLineChartRitmo(puntos){
  function rl(v){ return `${Math.floor(v)}'${pad(Math.round((v%1)*60))}`; }
  const W=320,H=140,PL=44,PB=28,PT=10,PR=10;
  const vals=puntos.map(p=>p.val);
  const minV=Math.min(...vals), maxV=Math.max(...vals);
  const rng=maxV-minV||0.5;
  const xs=puntos.map((_,i)=>PL+(i/(puntos.length-1))*(W-PL-PR));
  const ys=puntos.map(p=>PT+(1-((p.val-minV)/rng))*(H-PT-PB)); // v179: eje normal, mayor arriba
  const line=xs.map((x,i)=>`${i===0?'M':'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  const area=line+` L${xs[xs.length-1].toFixed(1)},${(H-PB).toFixed(1)} L${xs[0].toFixed(1)},${(H-PB).toFixed(1)} Z`;
  const yLabs=[maxV, minV+rng/2, minV].map(v=>{
    const y=PT+(1-((v-minV)/rng))*(H-PT-PB);
    return `<text x="${PL-4}" y="${y.toFixed(1)}" class="chart-label" text-anchor="end" dominant-baseline="middle">${rl(v)}</text><line x1="${PL}" y1="${y.toFixed(1)}" x2="${W-PR}" y2="${y.toFixed(1)}" class="chart-grid"/>`;
  }).join('');
  const step=Math.max(1,Math.floor(puntos.length/5));
  const xLabs=puntos.filter((_,i)=>i%step===0||i===puntos.length-1).map(p=>{
    const i=puntos.indexOf(p);
    return `<text x="${xs[i].toFixed(1)}" y="${H}" class="chart-label" text-anchor="middle">${p.fecha.slice(5)}</text>`;
  }).join('');
  const dots=puntos.map((p,i)=>`<circle cx="${xs[i].toFixed(1)}" cy="${ys[i].toFixed(1)}" r="4" style="fill:var(--blue)"><title>${p.fecha}: ${rl(p.val)}/km</title></circle>`).join('');
  return `<div style="font-size:10px;color:var(--ink3);margin-bottom:4px">Ritmo (min/km)</div>
  <div class="chart-wrap"><svg class="chart-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <line x1="${PL}" y1="${PT}" x2="${PL}" y2="${H-PB}" class="chart-axis"/>
    <line x1="${PL}" y1="${H-PB}" x2="${W-PR}" y2="${H-PB}" class="chart-axis"/>
    ${yLabs}${xLabs}
    <path d="${area}" fill="var(--blue)" opacity=".12"/>
    <path d="${line}" stroke="var(--blue)" stroke-width="2" fill="none" stroke-linejoin="round"/>
    ${dots}
  </svg></div>`;
}

// Helper: genera botones de filtro reutilizables
// filtros: array de claves ('todo','12m','2024'...)
// seleccionado: clave activa
// onclickFn: string de JS para el onclick (recibe el filtro como parámetro)
// color: color activo
function buildFiltroHtml(filtros, seleccionado, onclickFn, color='var(--orange)'){
  const labels={'todo':'Todo','12m':'12 meses'};
  return filtros.map(f=>{
    const activo = f===seleccionado;
    const label = labels[f]||f;
    return `<button onclick="${onclickFn(f)}"
      style="padding:3px 10px;border-radius:20px;border:1px solid ${activo?color:'var(--border2)'};
      background:${activo?'rgba(255,255,255,.06)':'var(--bg3)'};
      color:${activo?color:'var(--ink3)'};font-size:11px;font-weight:600;cursor:pointer">${label}</button>`;
  }).join('');
}

// ── Detalle ejercicio con gráfico ───────────────────────────────
function openExDetail(exId){
  showRM=false;
  renderExDetail(exId);
  document.getElementById('ex-detail-ov').classList.add('on');
}
function closeExDetail(){ document.getElementById('ex-detail-ov').classList.remove('on'); }
function toggleRM(){ showRM=!showRM; const exId=document.getElementById('ex-detail-ov').dataset.exId; renderExDetail(exId); }

function renderExDetail(exId){
  const e=getEx(exId); if(!e) return;
  document.getElementById('ex-detail-ov').dataset.exId=exId;
  document.getElementById('ex-detail-name').textContent=e.name;
  const isRun=e.type==='run'||e.type==='hiit';
  const btn=document.getElementById('ex-rm-toggle');
  btn.style.display=isRun?'none':'block';
  btn.style.background=showRM?'var(--orange)':'var(--bg3)';
  btn.style.color=showRM?'#fff':'var(--ink2)';

  // ── Recopilar datos agrupados por sesión ─────────────────────
  const sesiones=[];
  const pr=getPR(exId);

  (forge.sessions||[]).sort((a,b)=>a.date-b.date).forEach(s=>{
    const ex=(s.exercises||[]).find(x=>x.exId===exId); if(!ex) return;
    const fecha=localDateStr(s.date);

    if(isRun){
      const sets=(ex.sets||[]).filter(set=>parseFloat(set.distance)>0||set.time);
      if(!sets.length) return;
      const totalDist=sets.reduce((a,set)=>a+parseFloat(set.distance||0),0);
      let totalMins=0;
      sets.forEach(set=>{
        if(set.time){ const p=(set.time+'').split(':'); totalMins+=(parseInt(p[0])||0)+(parseInt(p[1])||0)/60; }
      });
      const ritmo=totalDist>0&&totalMins>0?totalMins/totalDist:0;
      const fcMedia=sets.filter(s=>s.fc).reduce((a,s,i,arr)=>i===arr.length-1?Math.round((a+parseFloat(s.fc||0))/arr.length):a+parseFloat(s.fc||0),0);
      const pasosTot=sets.reduce((a,s)=>a+(parseInt(s.pasos)||0),0);
      sesiones.push({fecha,routineName:s.routineName,totalDist,ritmo,fcMedia,pasosTot,sets,tipo:'run'});
    } else {
      const sets=(ex.sets||[]).filter(set=>set.done&&set.weight);
      if(!sets.length) return;
      const mejor=sets.sort((a,b)=>b.weight-a.weight)[0];
      const val=showRM?est1RM(mejor.weight,mejor.reps||1):mejor.weight;
      const esPR=(mejor.weight>=pr.weight&&pr.weight>0)||(sets.length>0&&pr.weight===0);
      sesiones.push({fecha,routineName:s.routineName,mejor,val,sets,esPR:mejor.weight>=pr.weight&&pr.weight>0,tipo:'fuerza'});
    }
  });

  // ── Puntos para gráfico ──────────────────────────────────────
  const puntos=sesiones.map(s=>isRun
    ? {fecha:s.fecha, val:s.ritmo>0?s.ritmo:s.totalDist, valDist:s.totalDist, valRitmo:s.ritmo,
       label:`${s.totalDist.toFixed(2)}km${s.ritmo>0?' · '+Math.floor(s.ritmo)+"'"+pad(Math.round((s.ritmo%1)*60))+'"':''}`}
    : {fecha:s.fecha, val:s.val, label:showRM?`${s.val}kg 1RM`:`${s.mejor.weight}kg×${s.mejor.reps}`}
  );

  // ── KPIs ─────────────────────────────────────────────────────
  let kpis='';
  if(isRun){
    const runPR=getRunPRObj(exId);
    const mejorRitmo=runPR.ritmo>0?`${Math.floor(runPR.ritmo)}'${pad(Math.round((runPR.ritmo%1)*60))}"/km`:'—';
    const maxDist=runPR.dist>0?`${runPR.dist.toFixed(2)}km`:'—';
    const primeraSes=sesiones[0], ultimaSes=sesiones[sesiones.length-1];
    const mejora=primeraSes&&ultimaSes&&primeraSes.ritmo>0&&ultimaSes.ritmo>0
      ? Math.round((primeraSes.ritmo-ultimaSes.ritmo)*60) : 0; // seg/km
    kpis=`
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:20px">
        <div class="stat-box"><div class="stat-num" style="color:var(--green);font-size:18px">${maxDist}</div><div class="stat-label">Dist. máx.</div></div>
        <div class="stat-box"><div class="stat-num" style="color:var(--blue);font-size:18px">${mejorRitmo}</div><div class="stat-label">Mejor ritmo</div></div>
        <div class="stat-box"><div class="stat-num" style="color:${mejora>0?'var(--green)':'var(--ink3)'}; font-size:18px">${mejora>0?'-'+mejora+'s':'—'}</div><div class="stat-label">Mejora ritmo</div></div>
      </div>`;
  } else {
    const primera=sesiones[0], ultima=sesiones[sesiones.length-1];
    const delta=primera&&ultima?Math.round((ultima.mejor.weight-primera.mejor.weight)*10)/10:0;
    const rm=pr.weight>0?est1RM(pr.weight,pr.reps||1):0;
    const totalSeries=sesiones.reduce((a,s)=>a+s.sets.length,0);
    kpis=`
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:20px">
        <div class="stat-box">
          <div class="stat-num" style="color:var(--orange);font-size:22px">${pr.weight>0?pr.weight+'kg':'—'}</div>
          <div class="stat-label">PR · ${pr.reps||0} reps</div>
          ${rm>0?`<div style="font-size:10px;color:var(--ink3);margin-top:2px">1RM est. ${rm}kg</div>`:''}
        </div>
        <div class="stat-box">
          <div class="stat-num" style="color:${delta>0?'var(--green)':delta<0?'var(--red)':'var(--ink3)'};font-size:22px">${delta>0?'+':''}${delta}kg</div>
          <div class="stat-label">Progresión total</div>
          <div style="font-size:10px;color:var(--ink3);margin-top:2px">${sesiones.length} sesiones</div>
        </div>
        <div class="stat-box">
          <div class="stat-num" style="font-size:22px">${totalSeries}</div>
          <div class="stat-label">Series totales</div>
        </div>
      </div>`;
  }

  // ── Historial agrupado con filtro Todo / 12m / año ────────────
  const hoy12m = new Date(); hoy12m.setFullYear(hoy12m.getFullYear()-1);
  const fechaCorte12m = localDateStr(hoy12m);
  const años=[...new Set(sesiones.map(s=>s.fecha.slice(0,4)))].sort().reverse();

  // Estado del filtro: 'todo' | '12m' | '2026' | '2025' ...
  const filtroSel = window._exDetailFiltro || '12m';
  window._exDetailFiltro = filtroSel;

  const sesFiltradas = (()=>{
    if(filtroSel==='todo') return sesiones.slice().reverse();
    if(filtroSel==='12m')  return sesiones.filter(s=>s.fecha>=fechaCorte12m).reverse();
    return sesiones.filter(s=>s.fecha.startsWith(filtroSel)).reverse();
  })();

  // Puntos del gráfico según filtro
  const puntosGraf = (()=>{
    if(filtroSel==='todo') return puntos;
    if(filtroSel==='12m')  return puntos.filter(p=>p.fecha>=fechaCorte12m);
    return puntos.filter(p=>p.fecha.startsWith(filtroSel));
  })();

  // Construir gráfico filtrado — sistema genérico v123
  chartsHtml = buildExDetailCharts(puntos, isRun, exId, filtroSel);

  const botonesHtml = buildFiltroHtml(
    ['todo','12m',...años],
    filtroSel,
    (f)=>`window._exDetailFiltro='${f}';renderExDetail('${exId}')`,
    'var(--orange)'
  );

  const histHtml=`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:6px">
      <div class="section-label" style="margin:0">Historial · ${sesFiltradas.length} sesiones</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap">${botonesHtml}</div>
    </div>
    ${sesFiltradas.map(s=>{
      if(isRun){
        const ritmoStr=s.ritmo>0?`${Math.floor(s.ritmo)}'${pad(Math.round((s.ritmo%1)*60))}"/km`:'';
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--border)">
          <div>
            <div style="font-size:12px;color:var(--ink3)">${s.fecha}</div>
            <div style="font-size:13px;font-weight:600;color:var(--ink);margin-top:1px">${s.routineName||'Sesión libre'}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:14px;font-weight:700;color:var(--green)">${s.totalDist.toFixed(2)}km</div>
            <div style="font-size:11px;color:var(--blue)">${ritmoStr}${s.fcMedia>0?' · ❤️'+s.fcMedia:''}${s.pasosTot>0?' · 👟'+fmtMiles(s.pasosTot):''}</div>
          </div>
        </div>`;
      } else {
        const setsResumen=s.sets.slice(0,3).map(x=>`${x.weight}×${x.reps}`).join('  ');
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--border)">
          <div>
            <div style="font-size:12px;color:var(--ink3)">${s.fecha}</div>
            <div style="font-size:11px;color:var(--ink3);margin-top:1px">${setsResumen}${s.sets.length>3?' …':''}</div>
          </div>
          <div style="text-align:right;display:flex;align-items:center;gap:6px">
            ${s.esPR?'<span style="font-size:10px;background:var(--gold);color:#000;padding:1px 6px;border-radius:4px;font-weight:700">PR</span>':''}
            <div style="font-size:15px;font-weight:800;color:var(--ink)">${s.mejor.weight}kg<span style="font-size:11px;color:var(--ink3);font-weight:400"> ×${s.mejor.reps}</span></div>
          </div>
        </div>`;
      }
    }).join('')}`;

  document.getElementById('ex-detail-body').innerHTML=`<div style="padding:16px">${kpis}${chartsHtml}${histHtml}</div>`;
}

// Ancho real disponible (respeta max-width del app en desktop)
function getChartW(){ return Math.min(window.innerWidth, 980) - 32; }
function renderLineChartFull(puntos,yLabel,color='var(--orange)'){
  const PL=44,PB=28,PT=12,PR=10,H=260;
  // Ancho interno del SVG — siempre adapta al contenedor via viewBox+100%
  const W=Math.max(400, PL+PR+puntos.length*Math.max(8,Math.floor(900/puntos.length)));
  const vals=puntos.map(p=>p.val);
  const minV=Math.min(...vals),maxV=Math.max(...vals),rng=maxV-minV||1;
  const xs=puntos.map((_,i)=>PL+(i/(puntos.length-1||1))*(W-PL-PR));
  const ys=puntos.map(p=>PT+(1-(p.val-minV)/rng)*(H-PT-PB));
  const line=xs.map((x,i)=>`${i===0?'M':'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  const area=line+` L${xs[xs.length-1].toFixed(1)},${H-PB} L${xs[0].toFixed(1)},${H-PB} Z`;
  const yLabs=[minV,minV+rng/2,maxV].map(v=>{
    const y=PT+(1-(v-minV)/rng)*(H-PT-PB);
    return `<text x="${PL-4}" y="${y.toFixed(1)}" class="chart-label" text-anchor="end" dominant-baseline="middle">${Math.round(v*10)/10}</text>
    <line x1="${PL}" y1="${y.toFixed(1)}" x2="${W-PR}" y2="${y.toFixed(1)}" class="chart-grid"/>`;
  }).join('');
  const step=Math.max(1,Math.floor(puntos.length/10));
  const xLabs=puntos.filter((_,i)=>i%step===0||i===puntos.length-1).map(p=>{
    const i=puntos.indexOf(p);
    return `<text x="${xs[i].toFixed(1)}" y="${H}" class="chart-label" text-anchor="middle">${p.fecha.slice(5)}</text>`;
  }).join('');
  const dotR=puntos.length>50?2:puntos.length>20?3:4;
  const dots=puntos.map((p,i)=>`<circle cx="${xs[i].toFixed(1)}" cy="${ys[i].toFixed(1)}" r="${dotR}" style="fill:${color}"><title>${p.fecha}: ${p.label}</title></circle>`).join('');
  return `
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:12px 0 0">
      <svg width="100%" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="display:block;height:${H}px">
        <line x1="${PL}" y1="${PT}" x2="${PL}" y2="${H-PB}" class="chart-axis"/>
        <line x1="${PL}" y1="${H-PB}" x2="${W-PR}" y2="${H-PB}" class="chart-axis"/>
        ${yLabs}${xLabs}
        <path d="${area}" fill="${color}" opacity=".15"/>
        <path d="${line}" class="chart-line" stroke="${color}" stroke-width="2.5"/>
        ${dots}
      </svg>
    </div>`;
}

// Gráfico alto para pantalla de detalle (240px) — sin scroll, usa todo el ancho
function renderLineChartTall(puntos,yLabel,color='var(--orange)'){
  const PL=44,PB=28,PT=12,PR=10,H=240;
  const W=Math.max(400, PL+PR+puntos.length*Math.max(8,Math.floor(900/Math.max(puntos.length,1))));
  const vals=puntos.map(p=>p.val);
  const minV=Math.min(...vals),maxV=Math.max(...vals),rng=maxV-minV||1;
  const xs=puntos.map((_,i)=>PL+(i/(puntos.length-1||1))*(W-PL-PR));
  const ys=puntos.map(p=>PT+(1-(p.val-minV)/rng)*(H-PT-PB));
  const line=xs.map((x,i)=>`${i===0?'M':'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  const area=line+` L${xs[xs.length-1].toFixed(1)},${H-PB} L${xs[0].toFixed(1)},${H-PB} Z`;
  const yLabs=[minV,minV+rng/2,maxV].map(v=>{
    const y=PT+(1-(v-minV)/rng)*(H-PT-PB);
    return `<text x="${PL-4}" y="${y.toFixed(1)}" class="chart-label" text-anchor="end" dominant-baseline="middle">${Math.round(v*10)/10}</text><line x1="${PL}" y1="${y.toFixed(1)}" x2="${W-PR}" y2="${y.toFixed(1)}" class="chart-grid"/>`;
  }).join('');
  const step=Math.max(1,Math.floor(puntos.length/8));
  const xLabs=puntos.filter((_,i)=>i%step===0||i===puntos.length-1).map(p=>{
    const i=puntos.indexOf(p);
    return `<text x="${xs[i].toFixed(1)}" y="${H}" class="chart-label" text-anchor="middle">${p.fecha.slice(5)}</text>`;
  }).join('');
  const dotR=puntos.length>40?2:3;
  const dots=puntos.map((p,i)=>`<circle cx="${xs[i].toFixed(1)}" cy="${ys[i].toFixed(1)}" r="${dotR}" style="fill:${color}"><title>${p.fecha}: ${p.label}</title></circle>`).join('');
  return `
    <div style="font-size:11px;color:var(--ink3);margin-bottom:6px;font-weight:600">${yLabel} · ${puntos.length} sesiones</div>
    <div style="border-radius:var(--r);background:var(--bg2);border:1px solid var(--border);padding:12px 0 0">
      <svg width="100%" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="display:block;height:${H}px">
        <line x1="${PL}" y1="${PT}" x2="${PL}" y2="${H-PB}" class="chart-axis"/>
        <line x1="${PL}" y1="${H-PB}" x2="${W-PR}" y2="${H-PB}" class="chart-axis"/>
        ${yLabs}${xLabs}
        <path d="${area}" fill="${color}" opacity=".15"/>
        <path d="${line}" class="chart-line" stroke="${color}" stroke-width="2.5"/>
        ${dots}
      </svg>
    </div>`;
}

function renderLineChartRitmoTall(puntos){
  function rl(v){ return `${Math.floor(v)}'${pad(Math.round((v%1)*60))}`; }
  const PL=44,PB=28,PT=12,PR=10,H=200;
  const W=Math.max(400, PL+PR+puntos.length*Math.max(8,Math.floor(900/Math.max(puntos.length,1))));
  const vals=puntos.map(p=>p.val);
  const minV=Math.min(...vals),maxV=Math.max(...vals),rng=maxV-minV||0.5;
  const xs=puntos.map((_,i)=>PL+(i/(puntos.length-1||1))*(W-PL-PR));
  // v179: eje normal, valor mayor arriba y menor abajo
  const ys=puntos.map(p=>PT+(1-((p.val-minV)/rng))*(H-PT-PB));
  const line=xs.map((x,i)=>`${i===0?'M':'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  const area=line+` L${xs[xs.length-1].toFixed(1)},${H-PB} L${xs[0].toFixed(1)},${H-PB} Z`;
  const yLabs=[minV,minV+rng/2,maxV].map(v=>{
    const y=PT+(1-((v-minV)/rng))*(H-PT-PB);
    return `<text x="${PL-4}" y="${y.toFixed(1)}" class="chart-label" text-anchor="end" dominant-baseline="middle">${rl(v)}</text><line x1="${PL}" y1="${y.toFixed(1)}" x2="${W-PR}" y2="${y.toFixed(1)}" class="chart-grid"/>`;
  }).join('');
  const step=Math.max(1,Math.floor(puntos.length/8));
  const xLabs=puntos.filter((_,i)=>i%step===0||i===puntos.length-1).map(p=>{
    const i=puntos.indexOf(p);
    return `<text x="${xs[i].toFixed(1)}" y="${H}" class="chart-label" text-anchor="middle">${p.fecha.slice(5)}</text>`;
  }).join('');
  const dots=puntos.map((p,i)=>`<circle cx="${xs[i].toFixed(1)}" cy="${ys[i].toFixed(1)}" r="3" style="fill:var(--blue)"><title>${p.fecha}: ${rl(p.val)}/km</title></circle>`).join('');
  return `
    <div style="font-size:11px;color:var(--ink3);margin-bottom:6px;font-weight:600">Ritmo (min/km)</div>
    <div style="border-radius:var(--r);background:var(--bg2);border:1px solid var(--border);padding:12px 0 0">
      <svg width="100%" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="display:block;height:${H}px">
        <line x1="${PL}" y1="${PT}" x2="${PL}" y2="${H-PB}" class="chart-axis"/>
        <line x1="${PL}" y1="${H-PB}" x2="${W-PR}" y2="${H-PB}" class="chart-axis"/>
        ${yLabs}${xLabs}
        <path d="${area}" fill="var(--blue)" opacity=".12"/>
        <path d="${line}" stroke="var(--blue)" stroke-width="2.5" fill="none" stroke-linejoin="round"/>
        ${dots}
      </svg>
    </div>`;
}

function renderLineChart(puntos,yLabel){
  // Ancho dinámico: mínimo 8px por punto, mínimo 320px, máximo 1200px
  const PL=44,PB=28,PT=10,PR=10,H=140;
  const minPxPunto = puntos.length > 30 ? 6 : puntos.length > 15 ? 8 : 10;
  const W = Math.max(320, Math.min(1200, PL + PR + puntos.length * minPxPunto));

  const vals=puntos.map(p=>p.val);
  const minV=Math.min(...vals),maxV=Math.max(...vals);
  const rng=maxV-minV||1;
  const xs=puntos.map((_,i)=>PL+(i/(puntos.length-1))*(W-PL-PR));
  const ys=puntos.map(p=>PT+(1-(p.val-minV)/rng)*(H-PT-PB));
  const line=xs.map((x,i)=>`${i===0?'M':'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  const area=line+` L${xs[xs.length-1].toFixed(1)},${(H-PB).toFixed(1)} L${xs[0].toFixed(1)},${(H-PB).toFixed(1)} Z`;

  // Etiquetas Y
  const yLabels=[minV,minV+rng/2,maxV].map(v=>{
    const y=PT+(1-(v-minV)/rng)*(H-PT-PB);
    return `<text x="${PL-4}" y="${y.toFixed(1)}" class="chart-label" text-anchor="end" dominant-baseline="middle">${Math.round(v*10)/10}</text>
    <line x1="${PL}" y1="${y.toFixed(1)}" x2="${W-PR}" y2="${y.toFixed(1)}" class="chart-grid"/>`;
  }).join('');

  // Etiquetas X: mostrar máx ~10 etiquetas
  const labelStep=Math.max(1,Math.floor(puntos.length/10));
  const xLabels=puntos.filter((_,i)=>i%labelStep===0||i===puntos.length-1).map(p=>{
    const i=puntos.indexOf(p);
    return `<text x="${xs[i].toFixed(1)}" y="${H}" class="chart-label" text-anchor="middle">${p.fecha.slice(5)}</text>`;
  }).join('');

  // Dots: solo mostrar si hay pocos puntos, o solo los extremos + último si hay muchos
  const dotR = puntos.length > 40 ? 2 : 3;
  const dots=puntos.map((p,i)=>`
    <circle cx="${xs[i].toFixed(1)}" cy="${ys[i].toFixed(1)}" r="${dotR}" class="chart-dot">
      <title>${p.fecha}: ${p.label}</title>
    </circle>`).join('');

  return `
    <div style="font-size:10px;color:var(--ink3);margin-bottom:4px">${yLabel} · <span style="color:var(--ink3)">${puntos.length} registros</span></div>
    <div class="chart-wrap" style="overflow-x:auto;-webkit-overflow-scrolling:touch;cursor:grab">
      <svg class="chart-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block">
        <line x1="${PL}" y1="${PT}" x2="${PL}" y2="${H-PB}" class="chart-axis"/>
        <line x1="${PL}" y1="${H-PB}" x2="${W-PR}" y2="${H-PB}" class="chart-axis"/>
        ${yLabels}${xLabels}
        <path d="${area}" fill="var(--orange)" opacity=".12"/>
        <path d="${line}" class="chart-line"/>
        ${dots}
      </svg>
    </div>`;
}

// ── Cuerpo ──────────────────────────────────────────────────────
// Abre el overlay de gráfico corporal con pantalla completa
// mets se pasa como parámetro para evitar recalcular
let _cuerpoMets=null;
function openCuerpoChart(key, mets){
  mets = mets || _cuerpoMets;
  if(!mets||!mets.length) return;
  _cuerpoMets=mets;
  const CONFIG={
    peso:    {label:'Peso corporal',    unit:'kg', color:'var(--orange)'},
    imc:     {label:'IMC',              unit:'',   color:'var(--gold)'},
    grasa:   {label:'Grasa corporal',   unit:'%',  color:'var(--green)'},
    muscular:{label:'Masa muscular',    unit:'kg', color:'var(--blue)'},
    p6:      {label:'6 Pliegues',       unit:'mm', color:'var(--blue)'},
    p8:      {label:'8 Pliegues',       unit:'mm', color:'var(--blue)'},
  };
  const cfg=CONFIG[key]||{label:key,unit:'',color:'var(--orange)'};
  document.getElementById('cuerpo-chart-title').textContent=cfg.label;
  document.getElementById('cuerpo-chart-ov').style.display='flex';

  // KPIs de esta métrica (todos los registros)
  const vals=key==='p6'||key==='p8'
    ? mets.filter(m=>m.pliegues?.[key]).map(m=>parseFloat(m.pliegues[key]))
    : mets.filter(m=>m[key]!=null&&m[key]!='').map(m=>parseFloat(m[key]));
  const ult=vals[vals.length-1], pri=vals[0];
  const vMin=Math.min(...vals), vMax=Math.max(...vals);
  const vProm=Math.round(vals.reduce((a,b)=>a+b,0)/vals.length*10)/10;
  const delta=Math.round((ult-pri)*10)/10;
  const dStr=(delta>0?'+':'')+delta+(cfg.unit||'');
  const menorEsMejor=key==='grasa'||key==='imc'||key==='p6'||key==='p8'||key==='peso';
  const dColor=delta===0?'var(--ink3)':(delta<0)===menorEsMejor?'var(--green)':'var(--red)';

  document.getElementById('cuerpo-chart-kpis').innerHTML=`
    <div style="padding:12px 10px;border-right:1px solid var(--border);text-align:center">
      <div style="font-size:8px;color:var(--ink3);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:3px">Actual</div>
      <div style="font-family:var(--fd);font-size:26px;font-weight:900;color:${cfg.color};line-height:1">${ult||'—'}<span style="font-size:11px;color:var(--ink3)">${cfg.unit}</span></div>
    </div>
    <div style="padding:12px 10px;border-right:1px solid var(--border);text-align:center">
      <div style="font-size:8px;color:var(--ink3);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:3px">Progresión</div>
      <div style="font-family:var(--fd);font-size:26px;font-weight:900;color:${dColor};line-height:1">${dStr}</div>
      <div style="font-size:10px;color:var(--ink3);margin-top:2px">${vals.length} registros</div>
    </div>
    <div style="padding:12px 10px;border-right:1px solid var(--border);text-align:center">
      <div style="font-size:8px;color:var(--green);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:3px">▼ Mínimo</div>
      <div style="font-family:var(--fd);font-size:26px;font-weight:900;color:var(--green);line-height:1">${vMin}<span style="font-size:11px;color:var(--ink3)">${cfg.unit}</span></div>
    </div>
    <div style="padding:12px 10px;border-right:1px solid var(--border);text-align:center">
      <div style="font-size:8px;color:var(--ink3);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:3px">◎ Promedio</div>
      <div style="font-family:var(--fd);font-size:26px;font-weight:900;color:var(--ink);line-height:1">${vProm}<span style="font-size:11px;color:var(--ink3)">${cfg.unit}</span></div>
    </div>
    <div style="padding:12px 10px;text-align:center">
      <div style="font-size:8px;color:var(--red);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:3px">▲ Máximo</div>
      <div style="font-family:var(--fd);font-size:26px;font-weight:900;color:var(--red);line-height:1">${vMax}<span style="font-size:11px;color:var(--ink3)">${cfg.unit}</span></div>
    </div>`;

  // Gráfico
  const pts = key==='p6'||key==='p8'
    ? mets.filter(m=>m.pliegues?.[key]).map(m=>({fecha:m.date,val:parseFloat(m.pliegues[key]),label:`${m.pliegues[key]}${cfg.unit}`}))
    : mets.filter(m=>m[key]!=null&&m[key]!='').map(m=>({fecha:m.date,val:parseFloat(m[key]),label:`${m[key]}${cfg.unit}`}));

  // Filtro Todo / 12m / año
  const hoy12m=new Date(); hoy12m.setFullYear(hoy12m.getFullYear()-1);
  const corte12m=localDateStr(hoy12m);
  const años=[...new Set(pts.map(p=>p.fecha.slice(0,4)))].sort().reverse();
  const filtroSel=window._cuerpoChartFiltro||'12m';
  window._cuerpoChartFiltro=filtroSel;

  const ptsFilt=(()=>{
    if(filtroSel==='todo') return pts;
    if(filtroSel==='12m')  return pts.filter(p=>p.fecha>=corte12m);
    return pts.filter(p=>p.fecha.startsWith(filtroSel));
  })();

  const filtroHtml=buildFiltroHtml(
    ['todo','12m',...años],
    filtroSel,
    (f)=>`window._cuerpoChartFiltro='${f}';openCuerpoChart('${key}')`,
    cfg.color
  );

  // Stats del período filtrado
  const valsFilt=ptsFilt.map(p=>p.val);
  const statsHtml = valsFilt.length>=2 ? `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0;margin-top:12px;margin-bottom:4px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);overflow:hidden">
      <div style="padding:10px;text-align:center;border-right:1px solid var(--border)">
        <div style="font-size:8px;color:var(--green);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:2px">▼ Mínimo</div>
        <div style="font-family:var(--fd);font-size:20px;font-weight:800;color:var(--green)">${Math.min(...valsFilt)}<span style="font-size:10px;color:var(--ink3)">${cfg.unit}</span></div>
      </div>
      <div style="padding:10px;text-align:center;border-right:1px solid var(--border)">
        <div style="font-size:8px;color:var(--ink3);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:2px">◎ Promedio</div>
        <div style="font-family:var(--fd);font-size:20px;font-weight:800;color:var(--ink)">${Math.round(valsFilt.reduce((a,b)=>a+b,0)/valsFilt.length*10)/10}<span style="font-size:10px;color:var(--ink3)">${cfg.unit}</span></div>
      </div>
      <div style="padding:10px;text-align:center">
        <div style="font-size:8px;color:var(--red);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:2px">▲ Máximo</div>
        <div style="font-family:var(--fd);font-size:20px;font-weight:800;color:var(--red)">${Math.max(...valsFilt)}<span style="font-size:10px;color:var(--ink3)">${cfg.unit}</span></div>
      </div>
    </div>` : '';

  document.getElementById('cuerpo-chart-body').innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:6px">
      <div style="font-size:11px;color:var(--ink3)">${ptsFilt.length} registros en período</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap">${filtroHtml}</div>
    </div>
    ${ptsFilt.length>=2
      ? buildCuerpoChartHtml(ptsFilt, key, cfg.unit, cfg.color, filtroSel) + statsHtml
      : `<div class="empty" style="padding:40px 0"><div class="empty-icon">📈</div><div class="empty-text">Pocos datos en este período</div><div class="empty-sub">Prueba con "Todo" para ver el historial completo.</div></div>`}
    <div style="margin-top:20px">
      <div class="section-label" style="margin-bottom:8px">Todos los registros · ${pts.length} total</div>
      ${pts.slice().reverse().map(p=>`
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px">
          <span style="color:var(--ink3)">${p.fecha}</span>
          <span style="font-weight:700;color:${cfg.color}">${p.label}</span>
        </div>`).join('')}
    </div>`;
}
function closeCuerpoChart(){
  document.getElementById('cuerpo-chart-ov').style.display='none';
}

// Estado accordions de cuerpo
if(!window._bodyAccState) window._bodyAccState = {};
if(!window._bodyAccFiltro) window._bodyAccFiltro = {};

function toggleBodyAcc(key) {
  window._bodyAccState[key] = !window._bodyAccState[key];
  renderProgCuerpo();
}
function setBodyAccFiltro(key, filtro) {
  window._bodyAccFiltro[key] = filtro;

  // El gráfico de peso está dentro de la sección 'resumen', no en un body propio
  // — re-renderizar el body de resumen completo cuando cambia el filtro de peso
  if (key === 'peso') {
    const resumenBody = document.getElementById('body-acc-body-resumen');
    if (resumenBody) {
      // Re-invocar el render de la sección resumen
      renderProgCuerpo();
      // Mantener la sección abierta
      window._bodyAccState['resumen'] = true;
    }
    return;
  }

  // Para el resto (grasa, muscular, p6, p8) → actualizar solo el body del accordion hijo
  const bodyEl = document.getElementById('body-acc-body-' + key);
  if (bodyEl) bodyEl.innerHTML = buildBodyAccBody(key, filtro, window._cuerpoMets || []);
}

/** Calcula y retorna badge de IMC */
function imcBadge(imc) {
  const v = parseFloat(imc);
  if (isNaN(v)) return '';
  if (v < 18.5) return `<span class="imc-badge bajo">Bajo peso</span>`;
  if (v < 25)   return `<span class="imc-badge normal">Normal</span>`;
  if (v < 30)   return `<span class="imc-badge sobrepeso">Sobrepeso</span>`;
  return `<span class="imc-badge obesidad">Obesidad</span>`;
}

/** Construye el cuerpo de un accordion de medida corporal con gráfico */
function buildBodyAccBody(metricKey, filtro, metsAll) {
  filtro = filtro || window._bodyAccFiltro[metricKey] || 'all';
  const isPliegue = metricKey === 'p6' || metricKey === 'p8';

  // Todos los puntos sin filtrar
  const ptsAll = isPliegue
    ? metsAll.filter(m => m.pliegues?.[metricKey]).map(m => ({ date: m.date, label: m.date.slice(5).replace('-','/'), value: parseFloat(m.pliegues[metricKey]), displayValue: `${m.pliegues[metricKey]} mm` }))
    : metsAll.filter(m => m[metricKey] != null && m[metricKey] !== '').map(m => ({ date: m.date, label: m.date.slice(5).replace('-','/'), value: parseFloat(m[metricKey]), displayValue: `${m[metricKey]} ${metricKey==='grasa'?'%':'kg'}` }));

  if (!ptsAll.length) return `<div class="mq-chart-empty" style="padding:24px 0"><div class="mq-chart-empty-icon">◬</div><div class="mq-chart-empty-text">Sin registros</div></div>`;

  // Aplicar filtro de tiempo — días de corte por opción
  const DIAS_FILTRO = { '1m':30, '2m':60, '4m':120, '8m':240 };
  let pts;
  if (DIAS_FILTRO[filtro]) {
    const corte = new Date(); corte.setDate(corte.getDate() - DIAS_FILTRO[filtro]);
    const corteStr = localDateStr(corte);
    pts = ptsAll.filter(p => p.date >= corteStr);
  } else {
    pts = ptsAll; // 'all' o cualquier otro → todos los datos
  }

  const FILTROS = [
    { id: '1m', label: '1M' }, { id: '2m', label: '2M' },
    { id: '4m', label: '4M' }, { id: '8m', label: '8M' }, { id: 'all', label: 'Todo' }
  ];
  const filtrosHtml = `<div class="acc-filters">` +
    FILTROS.map(f =>
      `<button class="acc-filter-btn${f.id === filtro ? ' on' : ''}"
        onclick="event.stopPropagation();setBodyAccFiltro('${metricKey}','${f.id}')">${f.label}</button>`
    ).join('') + `</div>`;

  // Estado vacío para este período
  if (!pts.length) {
    return filtrosHtml + `<div class="mq-chart-empty" style="padding:16px 0">
      <div class="mq-chart-empty-text">Sin mediciones en este período</div>
      <div class="mq-chart-empty-sub">Prueba con un rango más amplio</div>
    </div>`;
  }

  const vals = pts.map(p => p.value);
  const ult = vals[vals.length - 1], pri = vals[0];
  const delta = Math.round((ult - pri) * 10) / 10;
  const menorMejor = ['peso','imc','grasa','p6','p8'].includes(metricKey);
  const deltaColor = delta === 0 ? 'var(--ink3)' : (delta < 0) === menorMejor ? 'var(--ok)' : 'var(--warn)';
  const unit = metricKey === 'grasa' ? '%' : (isPliegue ? 'mm' : 'kg');

  const kpisHtml = `<div class="acc-kpis">
    <div class="acc-kpi">
      <div class="acc-kpi-val">${ult} <span style="font-size:11px;color:var(--ink3)">${unit}</span></div>
      <div class="acc-kpi-lbl">Actual</div>
    </div>
    <div class="acc-kpi">
      <div class="acc-kpi-val" style="color:${deltaColor}">${delta > 0 ? '+' : ''}${delta} ${unit}</div>
      <div class="acc-kpi-lbl">Variación período</div>
    </div>
    <div class="acc-kpi">
      <div class="acc-kpi-val">${pts.length}</div>
      <div class="acc-kpi-lbl">Registros</div>
    </div>
  </div>`;

  const chartHtml = renderMetricChart({
    id: `body_${metricKey}_chart_${filtro}`,
    type: metricKey === 'grasa' ? 'percentage' : 'weight',
    unit, unitLabel: unit,
    data: pts,
    yAxis: { forceZero: false, paddingRatio: 0.1 },
    tooltip: { showDate: true },
    height: 180,
    color: metricKey === 'grasa' ? 'var(--warn)' : metricKey === 'muscular' ? 'var(--teal)' : 'var(--p)',
    activeFilter: 'all'   // ya filtramos pts arriba, pasamos todo al gráfico
  });

  return kpisHtml + filtrosHtml + chartHtml;
}

function renderProgCuerpo() {
  // Consolidar mediciones por fecha
  const porFecha = {};
  (forge.bodyMetrics || []).forEach(m => {
    const f = m.date;
    if (!porFecha[f]) { porFecha[f] = m; }
    else {
      const score = (x) => [x.peso, x.grasa, x.muscular, x.imc, x.pliegues?.p6, x.pliegues?.p8].filter(v => v != null && v !== '').length;
      const merged = { ...(score(m) > score(porFecha[f]) ? m : porFecha[f]) };
      ['peso','grasa','muscular','imc'].forEach(k => { if (!merged[k] && porFecha[f][k]) merged[k] = porFecha[f][k]; if (!merged[k] && m[k]) merged[k] = m[k]; });
      if (!merged.pliegues) merged.pliegues = {};
      ['p6','p8'].forEach(k => { if (!merged.pliegues[k] && porFecha[f].pliegues?.[k]) merged.pliegues[k] = porFecha[f].pliegues[k]; if (!merged.pliegues[k] && m.pliegues?.[k]) merged.pliegues[k] = m.pliegues[k]; });
      porFecha[f] = merged;
    }
  });
  const metsAll = Object.values(porFecha).sort((a, b) => a.date.localeCompare(b.date));
  _cuerpoMets = metsAll;
  window._cuerpoMets = metsAll;

  // ── Sin datos ──
  if (!metsAll.length) {
    document.getElementById('cuerpo-kpis').innerHTML = '';
    document.getElementById('cuerpo-charts').innerHTML = `<div class="empty" style="padding:60px 0"><div class="empty-icon" style="font-size:32px;margin-bottom:12px">◬</div><div class="empty-text">Sin mediciones</div><div class="empty-sub">Toca "+ Añadir" para registrar tu primera medición.</div></div>`;
    document.getElementById('cuerpo-historial').innerHTML = '';
    return;
  }

  const ult = metsAll[metsAll.length - 1];
  const perfil = getDatosPersonales();

  // IMC: prioridad → valor guardado en la medición → calcular con estatura del perfil
  let imcActual = null;
  if (ult.imc && parseFloat(ult.imc) > 0) {
    imcActual = parseFloat(ult.imc);
  } else if (ult.peso && perfil.estatura) {
    imcActual = calcIMC(ult.peso, perfil.estatura);
  }
  const imcStr = imcActual ? imcActual.toFixed(1) : '—';
  const estaturaStr = perfil.estatura || ult.estatura || '';

  // ── KPI strip superior (solo si hay datos) ──
  document.getElementById('cuerpo-kpis').innerHTML = '';

  // ── Secciones sándwich ──
  const SECCIONES = [
    {
      key: 'resumen', label: 'Resumen corporal',
      sub: `${ult.peso ? ult.peso + ' kg' : '—'} · IMC ${imcStr}`,
      render: () => {
        const pesosArr = metsAll.filter(m => m.peso).map(m => parseFloat(m.peso));
        const pesoMin = pesosArr.length ? Math.min(...pesosArr) : null;
        const pesoMax = pesosArr.length ? Math.max(...pesosArr) : null;
        const delta = pesosArr.length >= 2 ? Math.round((pesosArr[pesosArr.length-1] - pesosArr[0]) * 10) / 10 : null;
        const dColor = delta === null ? 'var(--ink3)' : delta < 0 ? 'var(--ok)' : 'var(--warn)';

        // Buscar estatura en todas las fuentes posibles
        const estaturaFinal = parseFloat(
          perfil.estatura ||
          metsAll.slice().reverse().find(m => m.estatura)?.estatura ||
          ''
        ) || 0;

        // Recalcular IMC con la estatura encontrada
        let imcFinal = imcActual;
        if (!imcFinal && ult.peso && estaturaFinal > 0) {
          const h = estaturaFinal / 100;
          imcFinal = Math.round((parseFloat(ult.peso) / (h * h)) * 10) / 10;
        }
        const imcFinalStr = imcFinal ? imcFinal.toFixed(1) : '—';

        const imcCard = `<div class="imc-card">
          <div style="flex-shrink:0;min-width:80px">
            <div class="acc-pdr-lbl" style="margin-bottom:4px">IMC</div>
            <div class="imc-val" style="color:${imcFinal?'var(--p)':'var(--ink3)'}">${imcFinalStr}</div>
            ${imcFinal ? imcBadge(imcFinal) : ''}
          </div>
          <div style="flex:1;font-size:12px;color:var(--ink3);line-height:1.8">
            ${ult.peso ? `<div>Peso: <strong style="color:var(--ink)">${ult.peso} kg</strong></div>` : ''}
            ${estaturaFinal > 0 ? `<div>Talla: <strong style="color:var(--ink)">${estaturaFinal} cm</strong></div>` : `<div style="color:var(--warn)">Ingresa tu talla en Perfil para ver el IMC</div>`}
            ${imcFinal && estaturaFinal > 0 ? `<div style="font-size:10px;margin-top:2px;color:var(--ink3)">${ult.peso} ÷ (${(estaturaFinal/100).toFixed(2)})² = ${imcFinalStr}</div>` : ''}
          </div>
        </div>`;

        const metasRows = [
          ult.peso ? { lbl: 'Peso', val: ult.peso + ' kg', color: 'var(--p)' } : null,
          ult.muscular ? { lbl: 'Masa muscular', val: ult.muscular + ' kg', color: 'var(--teal)' } : null,
          ult.grasa ? { lbl: 'Grasa corporal', val: ult.grasa + '%', color: 'var(--warn)' } : null,
        ].filter(Boolean);

        const resumFilas = metasRows.map(r =>
          `<div class="body-med-row">
            <div class="body-med-lbl">${r.lbl}</div>
            <div class="body-med-val" style="color:${r.color}">${r.val}</div>
          </div>`
        ).join('');

        // Filtros para gráfico de peso
        const filtro = window._bodyAccFiltro['peso'] || 'all';
        const FILTROS_PESO = [
          { id: '1m', label: '1M' }, { id: '2m', label: '2M' },
          { id: '4m', label: '4M' }, { id: '8m', label: '8M' }, { id: 'all', label: 'Todo' }
        ];
        const filtrosHtml = `<div class="acc-filters">` +
          FILTROS_PESO.map(f =>
            `<button class="acc-filter-btn${f.id === filtro ? ' on' : ''}"
              onclick="event.stopPropagation();setBodyAccFiltro('peso','${f.id}')">${f.label}</button>`
          ).join('') + `</div>`;

        // Aplicar filtro de tiempo antes de pasar al gráfico
        const DIAS_FP = { '1m':30, '2m':60, '4m':120, '8m':240 };
        let pesoData = metsAll.filter(m => m.peso);
        if (DIAS_FP[filtro]) {
          const corte = new Date(); corte.setDate(corte.getDate() - DIAS_FP[filtro]);
          const corteStr = localDateStr(corte);
          pesoData = pesoData.filter(m => m.date >= corteStr);
        }

        const pesoChart = renderMetricChart({
          id: 'body_peso_chart_' + filtro,
          type: 'weight', unit: 'kg', unitLabel: 'kg',
          title: 'Peso corporal', subtitle: 'Evolución en el tiempo',
          data: pesoData.map(m => ({
            date: m.date, label: m.date.slice(5).replace('-','/'),
            value: parseFloat(m.peso), displayValue: m.peso + ' kg'
          })),
          yAxis: { forceZero: false },
          tooltip: { showDate: true },
          height: 180, color: 'var(--p)',
          activeFilter: 'all'
        });

        return imcCard + resumFilas + filtrosHtml + pesoChart;
      }
    },
    {
      key: 'composicion', label: 'Composición corporal',
      sub: [ult.grasa ? `Grasa ${ult.grasa}%` : '', ult.muscular ? `Muscular ${ult.muscular} kg` : ''].filter(Boolean).join(' · ') || 'Grasa · Masa muscular',
      metrics: ['grasa','muscular'],
      render: () => {
        const charts = ['grasa','muscular'].map(mk => {
          const isOpen = !!window._bodyAccState[mk];
          const pts = metsAll.filter(m => m[mk] != null && m[mk] !== '');
          if (!pts.length) return '';
          const filtro = window._bodyAccFiltro[mk] || '12m';
          const bodyHtml = isOpen ? buildBodyAccBody(mk, filtro, metsAll) : '';
          const ult2 = pts[pts.length - 1];
          const labels = { grasa: 'Grasa corporal', muscular: 'Masa muscular' };
          const units = { grasa: '%', muscular: 'kg' };
          const colors = { grasa: 'var(--warn)', muscular: 'var(--teal)' };
          return `<div class="acc-card${isOpen ? ' open' : ''}" id="acc-${mk}" style="margin-bottom:0">
            <div class="acc-head" onclick="toggleBodyAcc('${mk}');event.stopPropagation()">
              <div class="acc-head-left">
                <div class="acc-ex-name">${labels[mk]}</div>
                <div class="acc-ex-sub">${pts.length} registros</div>
              </div>
              <div class="acc-head-right">
                <div class="acc-pdr-val" style="color:${colors[mk]}">${ult2[mk]} ${units[mk]}</div>
              </div>
              <svg class="acc-chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            <div class="acc-body" id="body-acc-body-${mk}">${bodyHtml}</div>
          </div>`;
        }).join('');
        return charts || `<div class="mq-chart-empty" style="padding:24px 0"><div class="mq-chart-empty-text">Sin datos de composición</div></div>`;
      }
    },
    {
      key: 'pliegues', label: 'Pliegues / Grasa corporal',
      sub: [ult.pliegues?.p6 ? `6 pliegues: ${ult.pliegues.p6} mm` : '', ult.pliegues?.p8 ? `8 pliegues: ${ult.pliegues.p8} mm` : ''].filter(Boolean).join(' · ') || 'Pliegues cutáneos',
      render: () => {
        const charts = ['p6','p8'].map(mk => {
          const pts = metsAll.filter(m => m.pliegues?.[mk]);
          if (!pts.length) return '';
          const isOpen = !!window._bodyAccState[mk];
          const filtro = window._bodyAccFiltro[mk] || '12m';
          const bodyHtml = isOpen ? buildBodyAccBody(mk, filtro, metsAll) : '';
          const labels = { p6: '6 Pliegues', p8: '8 Pliegues' };
          const ult2 = pts[pts.length - 1];
          return `<div class="acc-card${isOpen ? ' open' : ''}" id="acc-${mk}" style="margin-bottom:0">
            <div class="acc-head" onclick="toggleBodyAcc('${mk}');event.stopPropagation()">
              <div class="acc-head-left">
                <div class="acc-ex-name">${labels[mk]}</div>
                <div class="acc-ex-sub">${pts.length} registros · mm</div>
              </div>
              <div class="acc-head-right">
                <div class="acc-pdr-val">${ult2.pliegues[mk]} mm</div>
              </div>
              <svg class="acc-chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            <div class="acc-body" id="body-acc-body-${mk}">${bodyHtml}</div>
          </div>`;
        }).filter(Boolean).join('');
        if (!charts) return `<div class="mq-chart-empty" style="padding:24px 0"><div class="mq-chart-empty-text">Sin registros de pliegues</div></div>`;
        return charts;
      }
    }
  ];

  // Header con botón + Añadir
  document.getElementById('cuerpo-kpis').innerHTML = '';
  document.getElementById('cuerpo-charts').innerHTML = '';

  // Construir HTML de secciones sándwich
  const secHtml = SECCIONES.map(sec => {
    const isOpen = !!window._bodyAccState[sec.key];
    const bodyHtml = isOpen ? sec.render() : '';
    return `<div class="body-acc-card${isOpen ? ' open' : ''}" id="body-acc-${sec.key}">
      <div class="acc-head" onclick="toggleBodyAcc('${sec.key}')">
        <div class="acc-head-left">
          <div class="acc-ex-name">${sec.label}</div>
          <div class="acc-ex-sub">${sec.sub}</div>
        </div>
        <svg class="acc-chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="acc-body" id="body-acc-body-${sec.key}">${bodyHtml}</div>
    </div>`;
  }).join('');

  document.getElementById('cuerpo-historial').innerHTML = secHtml;
}


function renderMedRows(mets){
  return mets.map((m,i)=>`
  <tr id="med-row-${m.date}" style="border-bottom:1px solid var(--border);background:${i%2===0?'var(--bg3)':'transparent'}">
    <td style="padding:7px 10px;color:var(--ink2);white-space:nowrap;font-size:12px">${m.date}</td>
    <td onclick="openCuerpoChart('peso')"    style="padding:7px 6px;text-align:center;font-weight:700;color:var(--ink);cursor:pointer">${m.peso||'—'}</td>
    <td onclick="openCuerpoChart('imc')"     style="padding:7px 6px;text-align:center;color:var(--gold);cursor:pointer">${m.imc||'—'}</td>
    <td onclick="openCuerpoChart('grasa')"   style="padding:7px 6px;text-align:center;color:${parseFloat(m.grasa||99)<30?'var(--green)':'var(--red)'};cursor:pointer">${m.grasa||'—'}</td>
    <td onclick="openCuerpoChart('muscular')" style="padding:7px 6px;text-align:center;color:var(--blue);cursor:pointer">${m.muscular||'—'}</td>
    <td onclick="openCuerpoChart('p6')"      style="padding:7px 6px;text-align:center;color:var(--ink3);cursor:pointer">${m.pliegues?.p6||'—'}</td>
    <td onclick="openCuerpoChart('p8')"      style="padding:7px 6px;text-align:center;color:var(--ink3);cursor:pointer">${m.pliegues?.p8||'—'}</td>
    <td style="padding:7px 6px;text-align:center">
      <button onclick="openEditMedRow('${m.date}')"
        style="background:none;border:none;color:var(--orange);cursor:pointer;font-size:14px;padding:2px 4px"
        title="Editar">✏</button>
    </td>
  </tr>`).join('');
}

function openEditMedRow(fecha){
  const m=(forge.bodyMetrics||[]).find(x=>x.date===fecha);
  if(!m) return;
  const row=document.getElementById('med-row-'+fecha);
  if(!row) return;

  // Reemplazar la fila con inputs editables
  row.innerHTML=`
    <td style="padding:4px 6px" colspan="1">
      ${renderDatePicker('emd-'+fecha.replace(/-/g,''), fecha)}
    </td>
    <td style="padding:4px 3px"><input type="number" step="0.1" value="${m.peso||''}" placeholder="—"
      style="${styleInp()}" id="em-peso-${fecha}"></td>
    <td style="padding:4px 3px"><input type="number" step="0.1" value="${m.grasa||''}" placeholder="—"
      style="${styleInp()}" id="em-grasa-${fecha}"></td>
    <td style="padding:4px 3px"><input type="number" step="0.1" value="${m.muscular||''}" placeholder="—"
      style="${styleInp()}" id="em-musc-${fecha}"></td>
    <td style="padding:4px 3px"><input type="number" step="0.1" value="${m.imc||''}" placeholder="—"
      style="${styleInp()}" id="em-imc-${fecha}"></td>
    <td style="padding:4px 3px"><input type="number" step="0.5" value="${m.pliegues?.p6||''}" placeholder="—"
      style="${styleInp()}" id="em-p6-${fecha}"></td>
    <td style="padding:4px 3px"><input type="number" step="0.5" value="${m.pliegues?.p8||''}" placeholder="—"
      style="${styleInp()}" id="em-p8-${fecha}"></td>
    <td style="padding:4px 3px;white-space:nowrap">
      <button onclick="saveEditMedRow('${fecha}')"
        style="background:var(--green);border:none;border-radius:5px;color:#fff;cursor:pointer;font-size:11px;font-weight:700;padding:5px 8px;margin-right:2px">✓</button>
      <button onclick="deleteEditMedRow('${fecha}')"
        style="background:none;border:none;color:var(--red);cursor:pointer;font-size:14px;padding:3px">🗑</button>
    </td>`;
}

function styleInp(){
  return 'background:var(--bg4);border:1px solid var(--border2);border-radius:5px;color:var(--ink);padding:5px 4px;font-size:11px;width:62px;text-align:center;outline:none';
}

function saveEditMedRow(fechaOriginal){
  const dpId='emd-'+fechaOriginal.replace(/-/g,'');
  const nuevaFecha=getDatePickerValue(dpId)||fechaOriginal;
  const peso    =parseFloat(document.getElementById('em-peso-'+fechaOriginal)?.value)||null;
  const grasa   =parseFloat(document.getElementById('em-grasa-'+fechaOriginal)?.value)||null;
  const muscular=parseFloat(document.getElementById('em-musc-'+fechaOriginal)?.value)||null;
  const imc     =parseFloat(document.getElementById('em-imc-'+fechaOriginal)?.value)||null;
  const p6      =parseFloat(document.getElementById('em-p6-'+fechaOriginal)?.value)||null;
  const p8      =parseFloat(document.getElementById('em-p8-'+fechaOriginal)?.value)||null;

  if(!forge.bodyMetrics) forge.bodyMetrics=[];
  // Eliminar entrada original
  forge.bodyMetrics=forge.bodyMetrics.filter(x=>x.date!==fechaOriginal);
  // Agregar con nueva fecha y valores
  const entry = {date:nuevaFecha, peso, grasa, muscular, imc, pliegues:{p6,p8}, source:'manual'};
  autoCalcIMC(entry); // recalcular IMC si hay estatura guardada
  forge.bodyMetrics.push(entry);
  forge.bodyMetrics.sort((a,b)=>a.date.localeCompare(b.date));
  saveDB();
  showToast('✓ Medición actualizada',2000,'ok');
  renderProgCuerpo();
}

function deleteEditMedRow(fecha){
  if(!confirm('¿Eliminar esta medición?')) return;
  forge.bodyMetrics=(forge.bodyMetrics||[]).filter(x=>x.date!==fecha);
  saveDB();
  showToast('Medición eliminada');
  renderProgCuerpo();
}

// ---------------------------------------------------------------
//  DATOS PERSONALES + IMC AUTOMÁTICO
// ---------------------------------------------------------------
function getDatosPersonales(){
  // Priorizar forge.perfil (sincronizado) sobre localStorage
  if(forge.perfil&&forge.perfil.estatura) return forge.perfil;
  try{ return JSON.parse(localStorage.getItem('forge_perfil')||'{}'); }catch{ return {}; }
}
function saveDatosPersonalesData(d){
  localStorage.setItem('forge_perfil',JSON.stringify(d));
  // También guardar en forge para sincronizar con Firebase
  forge.perfil=d;
  saveDB();
}

function calcEdad(nac){
  if(!nac) return null;
  const hoy=new Date(), n=new Date(nac);
  let e=hoy.getFullYear()-n.getFullYear();
  if(hoy.getMonth()<n.getMonth()||(hoy.getMonth()===n.getMonth()&&hoy.getDate()<n.getDate())) e--;
  return e;
}
function calcIMC(peso,estCm){
  if(!peso||!estCm) return null;
  const h=parseFloat(estCm)/100;
  return Math.round((parseFloat(peso)/(h*h))*10)/10;
}

function openDatosPersonales(){
  const dp=getDatosPersonales();
  document.getElementById('dp-estatura').value=dp.estatura||'';
  document.getElementById('dp-nacimiento-wrap').innerHTML=renderDatePicker('dp-nac', dp.nacimiento||today());
  actualizarResumenPerfil(dp);
  document.getElementById('dp-estatura').oninput=()=>actualizarResumenPerfil({
    estatura:document.getElementById('dp-estatura').value,
    nacimiento:getDatePickerValue('dp-nac')
  });
  openModal('modal-perfil');
}
function actualizarResumenPerfil(dp){}  // simplificado — se recalcula al guardar
function actualizarResumenPerfil(dp){
  const res=document.getElementById('dp-resumen'); if(!res) return;
  const edad=calcEdad(dp.nacimiento);
  const ult=(forge.bodyMetrics||[]).slice(-1)[0];
  const imc=ult?.peso&&dp.estatura?calcIMC(ult.peso,dp.estatura):null;
  const lines=[];
  if(edad!=null) lines.push(`🎂 Edad: <strong>${edad} años</strong>`);
  if(dp.estatura) lines.push(`📏 Estatura: <strong>${dp.estatura} cm</strong>`);
  if(imc) lines.push(`📊 IMC actual con último peso (${ult.peso}kg): <strong style="color:var(--gold)">${imc}</strong>`);
  res.style.display=lines.length?'block':'none';
  res.innerHTML=lines.join('<br>');
}
function saveDatosPersonales(){
  const estatura=parseFloat(document.getElementById('dp-estatura').value)||null;
  const nacimiento=getDatePickerValue('dp-nac')||null;
  saveDatosPersonalesData({estatura,nacimiento});
  // Recalcular IMC en todas las mediciones que tienen peso
  if(estatura&&forge.bodyMetrics){
    forge.bodyMetrics.forEach(m=>{ if(m.peso) m.imc=calcIMC(m.peso,estatura); });
    saveDB();
  }
  closeModal('modal-perfil');
  showToast('✓ Datos guardados · IMC recalculado',2500,'ok');
  if(document.getElementById('prog-cuerpo')?.classList.contains('on')) renderProgCuerpo();
}
// Llamar al guardar cada medición de peso para calcular IMC automáticamente
function autoCalcIMC(m){
  const dp = getDatosPersonales();
  // Buscar estatura: perfil → historial de mediciones
  const est = parseFloat(dp.estatura || '') ||
    parseFloat((forge.bodyMetrics||[]).slice().reverse().find(x=>x.estatura)?.estatura || '') || 0;
  if (est > 0 && m.peso) m.imc = calcIMC(m.peso, est);
  return m;
}

// ── Mediciones: una métrica a la vez ──────────────────────────
const MED_METRICAS = [
  { key:'peso',     label:'Peso',              emoji:'◬',  unit:'kg',  step:'0.1', tipo:'number', placeholder:'99.0' },
  { key:'grasa',    label:'Grasa corporal',    emoji:'✦',  unit:'%',   step:'0.1', tipo:'number', placeholder:'28.3' },
  { key:'muscular', label:'Masa muscular',     emoji:'✦',  unit:'kg',  step:'0.1', tipo:'number', placeholder:'36.7' },
  { key:'imc',      label:'IMC',               emoji:'📊',  unit:'',    step:'0.1', tipo:'number', placeholder:'28.0' },
  { key:'p6',       label:'6 Pliegues',        emoji:'📐',  unit:'mm',  step:'0.5', tipo:'number', placeholder:'140'  },
  { key:'p8',       label:'8 Pliegues',        emoji:'📐',  unit:'mm',  step:'0.5', tipo:'number', placeholder:'186'  },
];

let medFechaActual = '';
let medPaso = 'selector'; // 'selector' | 'valor'
let medKeyActual = '';

function openMedModal(fecha){
  medFechaActual = fecha || today();
  medPaso = 'selector';
  document.getElementById('med-modal-title').textContent = 'Añadir medición';
  renderMedModal();
  openModal('modal-med');
}

function renderMedModal(){
  const body = document.getElementById('med-modal-body');

  if(medPaso === 'selector'){
    // Buscar si ya hay datos de esta fecha
    const existing = (forge.bodyMetrics||[]).find(m=>m.date===medFechaActual);

    body.innerHTML = `
      <div class="field">
        <label>Fecha</label>
        ${renderDatePicker('medmod', medFechaActual)}
        <div style="margin-top:6px;text-align:right">
          <button onclick="medFechaActual=getDatePickerValue('medmod');renderMedModal()" 
            class="btn btn-s btn-sm" style="width:auto">Confirmar fecha</button>
        </div>
      </div>
      <div style="font-size:11px;color:var(--ink3);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px;font-weight:700">
        ¿Qué quieres registrar?
      </div>
      ${MED_METRICAS.map(m=>{
        const val = m.key==='p6'||m.key==='p8'
          ? existing?.pliegues?.[m.key]
          : existing?.[m.key];
        return `<div onclick="abrirMedValor('${m.key}')"
          style="display:flex;align-items:center;justify-content:space-between;
          padding:13px 16px;border-radius:var(--r);margin-bottom:6px;
          background:var(--bg3);border:1px solid var(--border2);cursor:pointer;
          transition:border-color .1s"
          onmouseover="this.style.borderColor='var(--orange)'"
          onmouseout="this.style.borderColor='var(--border2)'">
          <div style="display:flex;align-items:center;gap:12px">
            <span style="font-size:22px">${m.emoji}</span>
            <div>
              <div style="font-size:14px;font-weight:600;color:var(--ink)">${m.label}</div>
              ${val?`<div style="font-size:12px;color:var(--green)">Registrado: ${val}${m.unit}</div>`
                   :`<div style="font-size:11px;color:var(--ink3)">Sin dato para esta fecha</div>`}
            </div>
          </div>
          <svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:var(--ink3);fill:none;stroke-width:2;flex-shrink:0">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </div>`;
      }).join('')}`;
  } else {
    const m = MED_METRICAS.find(x=>x.key===medKeyActual);
    const existing = (forge.bodyMetrics||[]).find(x=>x.date===medFechaActual);
    const valActual = m.key==='p6'||m.key==='p8'
      ? existing?.pliegues?.[m.key]||''
      : existing?.[m.key]||'';

    // Para peso: selectores de kg (70-150) y gramos (0-9)
    const esPeso = medKeyActual==='peso';
    const kgActual = esPeso ? Math.floor(parseFloat(valActual)||100) : 0;
    const gramosActual = esPeso ? Math.round(((parseFloat(valActual)||0)%1)*10) : 0;

    const selKg = esPeso ? (() => {
      let opts='';
      for(let i=70;i<=150;i++) opts+='<option value="'+i+'"'+(kgActual===i?' selected':'')+'>'+i+' kg</option>';
      return '<select id="med-kg-sel" onchange="medActualizarPesoInput()" style="flex:1;border:1px solid var(--border2);border-radius:var(--r);padding:14px 8px;font-size:22px;font-weight:700;background:var(--bg3);color:var(--ink);text-align:center">'+opts+'</select>';
    })() : '';
    const selGr = esPeso ? (() => {
      let opts='';
      for(let i=0;i<=9;i++) opts+='<option value="'+i+'"'+(gramosActual===i?' selected':'')+'>'+i+' 00g</option>';
      return '<select id="med-gr-sel" onchange="medActualizarPesoInput()" style="flex:1;border:1px solid var(--border2);border-radius:var(--r);padding:14px 8px;font-size:22px;font-weight:700;background:var(--bg3);color:var(--ink);text-align:center">'+opts+'</select>';
    })() : '';

    body.innerHTML = `
      <button onclick="medPaso='selector';renderMedModal()"
        style="background:none;border:none;color:var(--orange);cursor:pointer;
        font-size:13px;font-weight:600;display:flex;align-items:center;gap:4px;
        margin-bottom:16px;padding:0">
        ← Volver
      </button>
      <div style="text-align:center;margin-bottom:20px">
        <div style="font-size:36px;margin-bottom:6px">${m.emoji}</div>
        <div style="font-size:18px;font-weight:700;color:var(--ink)">${m.label}</div>
        <div style="font-size:12px;color:var(--ink3);margin-top:2px">${medFechaActual}</div>
      </div>
      ${esPeso ? `
      <div style="display:flex;gap:8px;margin-bottom:16px">
        ${selKg}
        ${selGr}
      </div>
      <input type="hidden" id="med-val-input" value="${valActual||''}">
      ` : `
      <div class="field">
        <label>${m.label}${m.unit?' ('+m.unit+')':''}</label>
        <input class="inp" id="med-val-input" type="text"
          placeholder="${m.placeholder}"
          value="${valActual}" inputmode="decimal"
          style="font-size:20px;text-align:center;padding:16px"
          autofocus>
      </div>
      `}
      <button class="btn btn-p" onclick="saveMedValor()" style="margin-top:4px">
        ✓ Guardar ${m.label}
      </button>
      ${valActual?`<button onclick="borrarMedValor()" style="background:none;border:none;color:var(--red);
        cursor:pointer;font-size:12px;width:100%;margin-top:10px;font-family:var(--fb)">
        Borrar este dato
      </button>`:''}`;

    if(esPeso) medActualizarPesoInput();
    else setTimeout(()=>document.getElementById('med-val-input')?.focus(), 100);
  }
}

function medActualizarPesoInput(){
  const kgSel=document.getElementById('med-kg-sel');
  const grSel=document.getElementById('med-gr-sel');
  if(!kgSel||!grSel) return;
  const kg=parseInt(kgSel.value)||100;
  const gr=parseInt(grSel.value)||0;
  const val=(kg+gr/10).toFixed(1);
  const inp=document.getElementById('med-val-input');
  if(inp) inp.value=val;
}
function abrirMedValor(key){
  medKeyActual = key;
  medPaso = 'valor';
  const m = MED_METRICAS.find(x=>x.key===key);
  document.getElementById('med-modal-title').textContent = m.label;
  renderMedModal();
}

function saveMedValor(){
  // Para peso: actualizar el input oculto desde los selectores antes de leer
  if(medKeyActual==='peso') medActualizarPesoInput();
  const input = document.getElementById('med-val-input');
  const val = normDec(input?.value?.trim());
  if(!val){ showToast('Ingresa un valor'); return; }

  if(!forge.bodyMetrics) forge.bodyMetrics=[];
  let m = forge.bodyMetrics.find(x=>x.date===medFechaActual);
  if(!m){
    m = {date:medFechaActual, peso:null, imc:null, grasa:null, muscular:null, pliegues:{p6:null,p8:null}};
    forge.bodyMetrics.push(m);
    forge.bodyMetrics.sort((a,b)=>a.date.localeCompare(b.date));
  }
  if(!m.pliegues) m.pliegues={p6:null,p8:null};

  const numVal = parseFloat(val);
  if(medKeyActual==='p6') m.pliegues.p6 = numVal;
  else if(medKeyActual==='p8') m.pliegues.p8 = numVal;
  else m[medKeyActual] = numVal;

  // Si se guarda peso, recalcular IMC automáticamente
  if(medKeyActual==='peso'){
    autoCalcIMC(m);
    setTimeout(()=>renderPesoBanner(), 100); // actualizar widget de inicio
  }

  saveDB();
  showToast(`✓ ${MED_METRICAS.find(x=>x.key===medKeyActual).label} guardado`,2000,'ok');

  // Volver al selector para seguir agregando
  medPaso = 'selector';
  document.getElementById('med-modal-title').textContent = 'Añadir medición';
  renderMedModal();
  renderProgCuerpo();
}

function borrarMedValor(){
  if(!confirm('¿Borrar este dato?')) return;
  const m = (forge.bodyMetrics||[]).find(x=>x.date===medFechaActual);
  if(!m) return;
  if(medKeyActual==='p6') m.pliegues.p6=null;
  else if(medKeyActual==='p8') m.pliegues.p8=null;
  else m[medKeyActual]=null;
  saveDB();
  medPaso='selector';
  document.getElementById('med-modal-title').textContent='Añadir medición';
  renderMedModal();
  renderProgCuerpo();
  showToast('Dato eliminado');
}

function saveMed(){
  // Función legacy — redirige al nuevo flujo
  openMedModal();
}

// ── Fotos ───────────────────────────────────────────────────────
let pendingFoto=null;
function renderProgPlan(){
  const el=document.getElementById('prog-plan-content'); if(!el) return;
  const plan=(forge.planes||[]).find(p=>p.activo);
  if(!plan){
    el.innerHTML=`<div class="empty"><div class="empty-icon">▤</div><div class="empty-text">Sin plan activo</div><div class="empty-sub">Crea un plan desde Perfil → Plan</div></div>`;
    return;
  }

  const semG=semanaActualPlan(plan);
  const ses=forge.sessions||[];
  const inicioDate=new Date(plan.inicio+'T12:00:00');

  // Tooltip global para el plan
  const ttId = 'plan-chart-tooltip';
  if (!document.getElementById(ttId)) {
    const tt = document.createElement('div');
    tt.id = ttId; tt.className = 'plan-tooltip';
    document.body.appendChild(tt);
  }

  function showPlanTooltip(evt, val, fecha, unidad) {
    const tt = document.getElementById(ttId); if (!tt) return;
    const d = new Date(fecha + 'T12:00:00');
    const fmtDate = `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
    tt.innerHTML = `<div class="plan-tooltip-val">${val} ${unidad}</div><div class="plan-tooltip-date">${fmtDate}</div>`;
    tt.classList.add('on');
    const x = evt.clientX, y = evt.clientY;
    tt.style.left = (x + 12) + 'px';
    tt.style.top  = (y - 40) + 'px';
  }
  function hidePlanTooltip() {
    const tt = document.getElementById(ttId); if (tt) tt.classList.remove('on');
  }
  // Exponer para onclick inline
  window._showPlanTT = showPlanTooltip;
  window._hidePlanTT = hidePlanTooltip;

  // ── Progresión ejercicios clave ───────────────────────────────
  const clavesHtml=EJERCICIOS_CLAVE.map(ec=>{
    const e=getEx(ec.id); if(!e) return '';
    const isRun=e.type==='run'||e.type==='hiit';
    const meta=plan.metas?.[ec.id]||0;
    const base=plan.cargas?.[ec.id]||0;
    const puntos=[];
    for(let s=1;s<=semG;s++){
      const semIni=new Date(inicioDate); semIni.setDate(semIni.getDate()+(s-1)*7);
      const semFin=new Date(semIni); semFin.setDate(semFin.getDate()+7);
      const sessSem=ses.filter(x=>{ const d=new Date(x.date); return d>=semIni&&d<semFin; });
      let realVal=null, realFecha=null;
      sessSem.forEach(sx=>{
        const exData=(sx.exercises||[]).find(ex=>ex.exId===ec.id);
        if(!exData) return;
        if(isRun){
          // Para trote: usar RITMO (min/km), no distancia
          let totalDist=0, totalMins=0;
          (exData.sets||[]).forEach(st=>{
            const d=parseFloat(st.distance)||0;
            totalDist+=d;
            if(st.time){ const p=(st.time+'').split(':'); totalMins+=(parseInt(p[0])||0)+(parseInt(p[1])||0)/60; }
          });
          if(totalDist>0&&totalMins>0){
            const ritmo=totalMins/totalDist;
            if(realVal===null||ritmo<realVal){ realVal=Math.round(ritmo*100)/100; realFecha=localDateStr(sx.date); }
          }
        } else {
          const maxW=Math.max(0,...(exData.sets||[]).filter(st=>st.done&&st.weight).map(st=>parseFloat(st.weight)||0));
          if(maxW>0){ realVal=maxW; realFecha=localDateStr(sx.date); }
        }
      });
      // Sugerido: para run usar meta en min/km (velocidad creciente = ritmo decreciente)
      const sugerido = isRun
        ? (base > 0 ? Math.round(base * Math.pow(0.985, s-1) * 100) / 100 : 0)
        : roundCarga(base*Math.pow(1.025,s-1), e.type||'barbell');
      puntos.push({sem:s, real:realVal, sugerido, fecha:realFecha});
    }
    const W=300, H=80, pad=10;
    // Para ritmo: menor = mejor → invertir eje Y
    const vals=[...puntos.map(p=>p.sugerido), ...puntos.filter(p=>p.real).map(p=>p.real), meta].filter(Boolean);
    if(!vals.length) return '';
    const minV=Math.min(...vals)*0.97, maxV=Math.max(...vals)*1.03;
    const xs=puntos.map((_,i)=>pad+(i/(Math.max(puntos.length-1,1)))*(W-pad*2));
    const yv = isRun
      ? v => pad + (v - minV) / (maxV - minV) * (H - pad*2)   // ritmo: mayor=abajo (peor), menor=arriba (mejor)
      : v => H - pad - (v - minV) / (maxV - minV) * (H - pad*2);
    const lineS=puntos.map((p,i)=>p.sugerido?`${i===0?'M':'L'}${xs[i].toFixed(1)},${yv(p.sugerido).toFixed(1)}`:'').filter(Boolean).join(' ');
    const realPts=puntos.filter(p=>p.real!==null);
    const lineR=realPts.length>1?realPts.map((p,i)=>{const idx=puntos.indexOf(p);return `${i===0?'M':'L'}${xs[idx].toFixed(1)},${yv(p.real).toFixed(1)}`;}).join(' '):'';

    // Dots con tooltip
    const unidad = isRun ? 'min/km' : 'kg';
    const dots=puntos.map((p,i)=>{
      if(p.real===null) return '';
      const dispVal = isRun ? decimalToPace(p.real) : p.real;
      const safeVal = String(dispVal).replace(/'/g, '&apos;');
      const safeDate = (p.fecha||'').replace(/"/g,'');
      return `<circle cx="${xs[i].toFixed(1)}" cy="${yv(p.real).toFixed(1)}" r="4" fill="var(--p)"
        stroke="var(--bg2)" stroke-width="1.5" style="cursor:pointer"
        onmouseenter="_showPlanTT(event,'${safeVal}','${safeDate}','${unidad}')"
        onmouseleave="_hidePlanTT()"
        ontouchstart="_showPlanTT(event,'${safeVal}','${safeDate}','${unidad}')"
        ontouchend="_hidePlanTT()"/>`;
    }).join('');

    const metaLine=meta>0?`<line x1="${pad}" y1="${yv(meta).toFixed(1)}" x2="${W-pad}" y2="${yv(meta).toFixed(1)}" stroke="var(--warn)" stroke-width="1" stroke-dasharray="4,3" opacity=".5"/>`:'';
    const ultimo=puntos.filter(p=>p.real!==null).pop();
    const pctMeta = isRun
      ? (meta&&ultimo ? Math.min(100,Math.round((meta/ultimo.real)*100)) : 0)  // ritmo: acercarse a meta (menor)
      : (meta&&ultimo ? Math.min(100,Math.round((ultimo.real/meta)*100)) : 0);
    const dispUltimo = ultimo ? (isRun ? decimalToPace(ultimo.real) : ultimo.real) : null;
    const dispMeta = meta ? (isRun ? decimalToPace(meta) : meta) : null;

    return `<div class="card" style="margin-bottom:14px;padding:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div style="font-size:14px;font-weight:700;color:var(--ink)">${e.name}</div>
        <div style="text-align:right">
          ${dispUltimo?`<div style="font-size:16px;font-weight:800;color:var(--p)">${dispUltimo} ${unidad}</div>`:''}
          ${dispMeta?`<div style="font-size:10px;color:var(--ink3)">Meta: ${dispMeta} ${unidad}${pctMeta>0?' · '+pctMeta+'%':''}</div>`:''}
        </div>
      </div>
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block;margin-bottom:8px">
        ${metaLine}
        <path d="${lineS}" fill="none" stroke="var(--border2)" stroke-width="1.5" stroke-dasharray="4,3"/>
        ${lineR?`<path d="${lineR}" fill="none" stroke="var(--p)" stroke-width="2.5"/>`:''}
        ${dots}
      </svg>
      <div style="display:flex;align-items:center;gap:12px;font-size:10px;color:var(--ink3)">
        <span><span style="display:inline-block;width:14px;height:0;border-top:2px dashed var(--border2);vertical-align:middle"></span> Sugerido</span>
        <span><span style="display:inline-block;width:14px;height:2px;background:var(--p);vertical-align:middle"></span> Real</span>
        ${dispMeta?`<span><span style="display:inline-block;width:14px;height:0;border-top:2px dashed var(--warn);vertical-align:middle;opacity:.5"></span> Meta</span>`:''}
      </div>
      ${pctMeta>0?`<div style="margin-top:8px;background:var(--bg3);border-radius:3px;height:5px;overflow:hidden"><div style="width:${pctMeta}%;height:100%;background:var(--p)"></div></div>`:''}
    </div>`;
  }).join('');

  // ── Semanas ───────────────────────────────────────────────────
  const semanasHtml=Array.from({length:semG},(_,i)=>{
    const s=i+1;
    const semIni=new Date(inicioDate); semIni.setDate(semIni.getDate()+(s-1)*7);
    const semFin=new Date(semIni); semFin.setDate(semFin.getDate()+7);
    const sessSem=ses.filter(x=>{ const d=new Date(x.date); return d>=semIni&&d<semFin; });
    const bloque=(plan.bloques||[]).find(b=>s>=b.semInicio&&s<=b.semFin);
    const esActual=s===semG;
    const filas=sessSem.map(sx=>{
      const dur=sx.elapsed?fmtTime(sx.elapsed):'—';
      const vol=sx.totalVolume?`${fmtMiles(sx.totalVolume)}kg`:'';
      const exResumen=(sx.exercises||[]).slice(0,2).map(ex=>{
        const eDef=getEx(ex.exId);
        const maxW=Math.max(0,...(ex.sets||[]).filter(st=>st.done&&st.weight).map(st=>parseFloat(st.weight)||0));
        return eDef&&maxW>0?`${eDef.name.split('(')[0].trim()} ${maxW}kg`:'';
      }).filter(Boolean).join(' · ');
      return `<div style="padding:8px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <div style="font-size:13px;font-weight:700;color:var(--ink)">${sx.routineName||'Sesión libre'}</div>
          ${exResumen?`<div style="font-size:11px;color:var(--ink3);margin-top:2px">${exResumen}</div>`:''}
        </div>
        <div style="text-align:right;flex-shrink:0;margin-left:8px">
          <div style="font-size:11px;color:var(--ink2)">${dur}</div>
          ${vol?`<div style="font-size:10px;color:var(--ink3)">${vol}</div>`:''}
        </div>
      </div>`;
    }).join('');
    return `<div class="card" style="margin-bottom:10px;${esActual?'border-color:var(--p)':''}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <div>
          <span style="font-size:13px;font-weight:800;color:${esActual?'var(--p)':'var(--ink)'}">Semana ${s}</span>
          ${bloque?`<span style="font-size:10px;color:var(--ink3);margin-left:6px">${bloque.nombre.split('(')[0].trim()}</span>`:''}
        </div>
        <span style="font-size:11px;font-weight:700;color:${sessSem.length>0?'var(--ok)':'var(--ink3)'}">${sessSem.length} sesión${sessSem.length!==1?'es':''}</span>
      </div>
      ${filas||`<div style="font-size:12px;color:var(--ink3);padding:4px 0">Sin entrenamientos esta semana</div>`}
    </div>`;
  }).reverse().join('');

  el.innerHTML=`
    <div class="section-label" style="margin-bottom:10px">Progresión ejercicios clave</div>
    ${clavesHtml}
    <div class="section-label" style="margin:16px 0 10px">Historial por semana</div>
    ${semanasHtml}`;
}

function renderProgFotos(){
  const fotos=(forge.photos||[]).filter(p=>p.tipo===photoTab).sort((a,b)=>b.date.localeCompare(a.date));
  const el=document.getElementById('photos-grid');
  el.innerHTML=fotos.map(p=>`
    <div class="photo-cell" onclick="viewFoto('${p.id}')">
      <img src="${p.data}" alt="${p.tipo}" loading="lazy">
      <div class="photo-date">${p.date}</div>
    </div>`).join('')+`
    <div class="photo-cell photo-add" onclick="openAddPhoto()">
      <div class="photo-add-plus">+</div>
      <div style="font-size:10px;color:var(--ink3)">${photoTab}</div>
    </div>`;
}
function openAddPhoto(){
  pendingFoto=null;
  document.getElementById('foto-tipo').value=photoTab;
  document.getElementById('foto-fecha-wrap').innerHTML=renderDatePicker('foto-fecha', today());
  document.getElementById('foto-preview').innerHTML='📷 Toca para seleccionar foto';
  document.getElementById('foto-preview').style.cssText='font-size:13px;color:var(--ink3)';
  document.getElementById('foto-save-btn').disabled=true;
  openModal('modal-foto');
}
function handleFotoFile(e){
  const file=e.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=ev=>{
    const img=new Image();
    img.onload=()=>{
      const MAX=800;
      let w=img.width, h=img.height;
      if(w>MAX||h>MAX){ const r=Math.min(MAX/w,MAX/h); w=Math.round(w*r); h=Math.round(h*r); }
      const canvas=document.createElement('canvas');
      canvas.width=w; canvas.height=h;
      canvas.getContext('2d').drawImage(img,0,0,w,h);
      pendingFoto=canvas.toDataURL('image/jpeg',0.72);
      document.getElementById('foto-preview').innerHTML='<img src="'+pendingFoto+'" style="width:100%;border-radius:var(--r);max-height:200px;object-fit:cover">';
      document.getElementById('foto-save-btn').disabled=false;
    };
    img.src=ev.target.result;
  };
  reader.readAsDataURL(file);
}
function savePhoto(){
  if(!pendingFoto) return;
  const p={id:'ph_'+Date.now(),tipo:document.getElementById('foto-tipo').value,date:getDatePickerValue('foto-fecha'),data:pendingFoto};
  if(!forge.photos) forge.photos=[];
  forge.photos.push(p); saveDB(); closeModal('modal-foto'); showToast('✓ Foto guardada',2000,'ok'); renderProgFotos();
}
function viewFoto(id){
  const p=(forge.photos||[]).find(x=>x.id===id); if(!p) return;
  if(confirm(`Foto del ${p.date}\n¿Eliminar?`)){ forge.photos=forge.photos.filter(x=>x.id!==id); saveDB(); renderProgFotos(); }
}


// ---------------------------------------------------------------
//  NUTRICIÓN INTELIGENTE V1 — MELQART
// ---------------------------------------------------------------
const NUTRITION_TARGETS = {
  cereales:3, frutas:2, proteinas:12, lacteoProtein:2, lacteoDescremado:1,
  lipidos:0.5, aceites:1, verduras:2, aguaMl:2500, aguaVasos:10
};
const PORTION_LABELS = {
  cereales:'Cereales', frutas:'Frutas', proteinas:'Proteínas', lacteoProtein:'Lácteo protein',
  lacteoDescremado:'Lácteo descremado', lipidos:'Lípidos', aceites:'Aceites', verduras:'Verduras'
};

// v173 — Equivalencias oficiales de la pauta nutricional
// Base única para calcular porciones desde cantidad registrada.
const NUTRITION_EQUIVALENCES = {
  targets:{ proteinas:12, lacteoProtein:2, lacteoDescremado:1 },
  proteinas:{
    pollo:50, pechuga:50, pavo:50, vacuno:50, carne:50, cerdo:50,
    atun:60, atún:60, jurel:60,
    merluza:80, tilapia:80, reineta:80, congrio:80, cojinova:80, salmon:80, salmón:80,
    camaron:120, camarón:120, camarones:120
  },
  huevoPorciones:1.5,
  scoopPorciones:2,
  lecheDescremadaMl:200,
  yogurtProteinPorciones:1
};
function nRound(v,dec=2){ const m=Math.pow(10,dec); return Math.round((parseFloat(v)||0)*m)/m; }
function normFoodText(txt){ return String(txt||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
function addP(base,k,v){ base[k]=(base[k]||0)+(parseFloat(v)||0); return base; }
function officialProteinPortions(food,grams){
  const key=normFoodText(food).trim();
  const gramsPer=NUTRITION_EQUIVALENCES.proteinas[key];
  if(!gramsPer || !grams) return 0;
  return nRound(grams/gramsPer,2);
}
function parseNutritionTextToPortions(txt){
  const text=normFoodText(txt);
  const portions=clonePortionZero();
  const details=[];
  if(!text.trim()) return {portions,details,hasAny:false};

  // Proteínas por gramos: 200g pollo / pollo 200 g
  Object.keys(NUTRITION_EQUIVALENCES.proteinas).forEach(food=>{
    const f=normFoodText(food);
    const re1=new RegExp('(\\d+(?:[\\.,]\\d+)?)\\s*g(?:r|rs|ramos)?\\s+(?:de\\s+)?'+f+'\\b','gi');
    const re2=new RegExp('\\b'+f+'\\s*(?:de\\s*)?(\\d+(?:[\\.,]\\d+)?)\\s*g(?:r|rs|ramos)?','gi');
    let m;
    while((m=re1.exec(text))){ const g=parseFloat(m[1].replace(',','.')); const val=officialProteinPortions(f,g); if(val){ addP(portions,'proteinas',val); details.push(`${food} ${g} g → ${val} proteína`); } }
    while((m=re2.exec(text))){ const g=parseFloat(m[1].replace(',','.')); const val=officialProteinPortions(f,g); if(val){ addP(portions,'proteinas',val); details.push(`${food} ${g} g → ${val} proteína`); } }
  });

  // Huevos: 2 huevos / 4 huevos duros
  const eh=text.match(/(\\d+(?:[\\.,]\\d+)?)\\s*huevos?/);
  if(eh){ const n=parseFloat(eh[1].replace(',','.')); const val=nRound(n*NUTRITION_EQUIVALENCES.huevoPorciones,2); addP(portions,'proteinas',val); details.push(`${n} huevo(s) → ${val} proteína`); }

  // Scoop proteína
  const scoop=text.match(/(\\d+(?:[\\.,]\\d+)?)?\\s*scoops?\\s*(?:de\\s*)?(?:proteina|proteína)?/);
  if(scoop && text.includes('scoop')){ const n=scoop[1]?parseFloat(scoop[1].replace(',','.')):1; const val=nRound(n*NUTRITION_EQUIVALENCES.scoopPorciones,2); addP(portions,'proteinas',val); details.push(`${n} scoop proteína → ${val} proteína`); }

  // Lácteos separados: no suman proteína
  if(text.includes('leche descremada')){ addP(portions,'lacteoDescremado',1); details.push('Leche descremada → 1 lácteo descremado'); }
  if(text.includes('yogur protein')||text.includes('yogurt protein')||text.includes('leche protein')){ addP(portions,'lacteoProtein',1); details.push('Lácteo protein → 1 lácteo semidescremado protein'); }

  // Cereales simples interpretables
  const papas=text.match(/(\\d+(?:[\\.,]\\d+)?)\\s*papas?/);
  if(papas){ const n=parseFloat(papas[1].replace(',','.')); addP(portions,'cereales',n); details.push(`${n} papa(s) → ${n} cereal`); }
  if(text.includes('arroz')){ addP(portions,'cereales',1); details.push('Arroz → 1 cereal'); }
  if(text.includes('fideos')||text.includes('pasta')){ addP(portions,'cereales',1); details.push('Fideos → 1 cereal'); }
  if(text.includes('pan molde')||text.includes('pan integral')){ addP(portions,'cereales',0.5); details.push('Pan molde/integral → 0.5 cereal'); }
  if(text.includes('platano')||text.includes('manzana')||text.includes('fruta')){ addP(portions,'frutas',1); details.push('Fruta → 1 fruta'); }
  if(text.includes('palta')||text.includes('mani')||text.includes('maní')){ addP(portions,'lipidos',0.5); details.push('Palta/maní → 0.5 lípidos'); }
  if(text.includes('verdura')||text.includes('lechuga')||text.includes('tomate')||text.includes('zanahoria')||text.includes('espinaca')||text.includes('zapallo')){ addP(portions,'verduras',1); details.push('Verduras → 1 verdura'); }

  Object.keys(portions).forEach(k=>portions[k]=nRound(portions[k],2));
  return {portions,details,hasAny:details.length>0};
}
function portionsForMeal(c,fd){
  const txt=fd?.comidas?.[c.id]?.texto || '';
  const parsed=parseNutritionTextToPortions(txt);
  if(parsed.hasAny) return {portions:parsed.portions, source:'detalle', details:parsed.details};
  return {portions:c.portions||MEAL_PORTIONS[c.id]||{}, source:'plantilla', details:[`${c.nombre} → plantilla pauta`]};
}
function makeQuickMeal(prot, carb){
  const protMap={pollo:'pollo', vacuno:'vacuno', tilapia:'tilapia', merluza:'merluza', reineta:'reineta', cojinova:'cojinova', salmon:'salmón', atun:'atún'};
  const nameProt=protMap[prot]||prot;
  const proteinas=officialProteinPortions(prot,200);
  const portions={proteinas, cereales:2};
  return {id:`qm_${prot}_${carb}`, name:`${nameProt.charAt(0).toUpperCase()+nameProt.slice(1)} + ${carb}`, quickMeal:true, detail:`${nameProt} 200 g + ${carb} 2 porciones`, portions, calcDetail:[`${nameProt} 200 g → ${proteinas} proteína`, `${carb} → 2 cereales`]};
}
const QUICK_MEALS = (()=>{
  const proteins=['pollo','vacuno','tilapia','merluza','reineta','cojinova','salmon','atun'];
  const carbs=['arroz','papas','fideos'];
  return proteins.flatMap(p=>carbs.map(c=>makeQuickMeal(p,c)));
})();

// v174 — Plantillas legacy por platos completados según pauta nutricional.
// Si el registro tiene detalle interpretable, se calcula por alimento/cantidad.
// Si no tiene detalle, cada plato completado abona estas porciones.
const MEAL_PORTIONS = {
  // Plato 1: desayuno estándar de pauta/app.
  // 1 scoop/proteína pauta + pan + 1/2 plátano + mantequilla de maní;
  // se incluye 1 lácteo protein como plantilla oficial de desayuno para no subestimar días completos.
  desayuno:{proteinas:3, lacteoProtein:1, frutas:1, cereales:0.5, lipidos:0.5},
  // Plato 2: fruta.
  fruta_1000:{frutas:1},
  // Plato 3: almuerzo estándar: 200 g pollo/vacuno equivalente + carbohidrato.
  almuerzo_post:{proteinas:4, cereales:2},
  // Plato 4: leche/yogurt protein.
  leche_protein_1700:{lacteoProtein:1},
  // Plato 5: 2 huevos duros. Regla oficial: 1 huevo = 1.5 porciones.
  huevos_1800:{proteinas:3},
  // Plato 6: leche descremada.
  leche_descremada_casa:{lacteoDescremado:1},
  // Plato 7: cena estándar: proteína + carbohidrato + verduras libre consumo.
  cena:{proteinas:3, cereales:2, verduras:2}
};
const FREQUENT_FOODS = [
  {id:'scoop_proteina', name:'Scoop proteína', portions:{proteinas:2}},
  {id:'medio_platano', name:'1/2 plátano', portions:{frutas:1}},
  {id:'pan_molde', name:'Pan molde', portions:{cereales:0.5}},
  {id:'mantequilla_mani', name:'Mantequilla de maní', portions:{lipidos:0.5}},
  {id:'fruta', name:'Fruta', portions:{frutas:1}},
  {id:'papa_cocida', name:'Papa cocida', portions:{cereales:1}},
  {id:'presa_pollo', name:'Presa de pollo', portions:{proteinas:2.5}},
  {id:'leche_protein', name:'Leche protein', portions:{lacteoProtein:1}},
  {id:'huevo_duro', name:'Huevo duro', portions:{proteinas:1.5}},
  {id:'leche_descremada', name:'Leche descremada', portions:{lacteoDescremado:1}},
  {id:'barra_low_carb', name:'Barra low carb', detail:'45g · 5,3g proteína · 6g carbos netos · 8g fibra', portions:{proteinas:0.5}},
  {id:'atun', name:'Atún', portions:{proteinas:2}},
  {id:'pollo_pavo_pescado', name:'Pollo/pavo/pescado', portions:{proteinas:2}},
  {id:'verduras', name:'Verduras', portions:{verduras:1}},
  {id:'aceite', name:'Aceite', portions:{aceites:1}},
  {id:'manzana', name:'Manzana', portions:{frutas:1}},
  {id:'arroz', name:'Porción de arroz', portions:{cereales:1}},
  {id:'tomates_cherry', name:'Tomates cherry', portions:{verduras:0.5}},
];
function clonePortionZero(){
  return Object.keys(NUTRITION_TARGETS).filter(k=>!['aguaMl','aguaVasos'].includes(k)).reduce((o,k)=>{o[k]=0;return o;},{});
}
function sumPortionsInto(base, add){ Object.entries(add||{}).forEach(([k,v])=>{base[k]=(base[k]||0)+(parseFloat(v)||0);}); return base; }
function calcNutritionDayDetail(fd){
  const total=clonePortionZero();
  const details=[];
  (COMIDAS||[]).forEach(c=>{
    if(fd.comidas?.[c.id]?.completada){
      const res=portionsForMeal(c,fd);
      sumPortionsInto(total,res.portions||{});
      details.push({type:'comida', name:c.nombre, source:res.source, portions:res.portions, details:res.details||[]});
    }
  });
  (fd.extraFoods||[]).forEach(f=>{
    sumPortionsInto(total, f.portions||{});
    details.push({type:f.quickMeal?'comida_rapida':'alimento_rapido', name:f.name, source:f.quickMeal?'comida rápida':'registro rápido', portions:f.portions||{}, details:f.calcDetail||f.details||[]});
  });
  Object.keys(total).forEach(k=>total[k]=nRound(total[k],2));
  return {portions:total, details};
}
function calcPortionsConsumed(fd){
  return calcNutritionDayDetail(fd).portions;
}
function calcPortionsRemaining(consumed){
  const rem=clonePortionZero();
  Object.keys(rem).forEach(k=>{rem[k]=Math.max(0, +(NUTRITION_TARGETS[k]-(consumed[k]||0)).toFixed(2));});
  return rem;
}
function getMealProgress(fd){
  const total=COMIDAS.length;
  const done=Object.values(fd.comidas||{}).filter(x=>x.completada).length;
  return {done,total,pct: total?Math.round(done/total*100):0};
}
function getCurrentMeal(fd){
  const pending=(COMIDAS||[]).find(c=>!fd.comidas?.[c.id]?.completada);
  if(!pending) return {current:null,next:null,allDone:true};
  const idx=COMIDAS.findIndex(c=>c.id===pending.id);
  const next=(COMIDAS||[]).slice(idx+1).find(c=>!fd.comidas?.[c.id]?.completada)||null;
  return {current:pending,next,allDone:false};
}

function getPendingMeals(fd){
  const data=fd||getFD(today());
  return (COMIDAS||[]).filter(c=>!data.comidas?.[c.id]?.completada);
}
function getSelectedPendingMeal(fd){
  const data=fd||getFD(today());
  const pending=getPendingMeals(data);
  if(!pending.length) return {meal:null,pending,index:-1,hasPrev:false,hasNext:false};
  let id=data.selectedPendingMealId;
  let idx=pending.findIndex(c=>c.id===id);
  if(idx<0) idx=0;
  const meal=pending[idx];
  return {meal,pending,index:idx,hasPrev:idx>0,hasNext:idx<pending.length-1};
}
function setSelectedPendingMeal(fecha,mealId){
  const f=fecha||today();
  const fd=getFD(f);
  const pending=getPendingMeals(fd);
  if(mealId && pending.some(c=>c.id===mealId)) fd.selectedPendingMealId=mealId;
  else if(pending.length) fd.selectedPendingMealId=pending[0].id;
  else delete fd.selectedPendingMealId;
  saveFD(fd);
}
function navPendingMeal(fecha,delta){
  const f=fecha||today();
  const fd=getFD(f);
  const sel=getSelectedPendingMeal(fd);
  if(!sel.meal) return;
  const nextIdx=sel.index+delta;
  if(nextIdx<0||nextIdx>=sel.pending.length) return;
  fd.selectedPendingMealId=sel.pending[nextIdx].id;
  saveFD(fd);
  renderHomeNutritionCard();
  renderFoodIfVisible();
}
function prevPendingMeal(fecha){ navPendingMeal(fecha,-1); }
function nextPendingMeal(fecha){ navPendingMeal(fecha,1); }
function completePendingMeal(fecha,mealId){
  const f=fecha||today();
  const fd=getFD(f);
  const id=mealId || getSelectedPendingMeal(fd).meal?.id;
  const cur=COMIDAS.find(c=>c.id===id);
  if(!cur){ showToast('Alimentación completa',1800,'ok'); return; }
  if(!fd.comidas[cur.id]) fd.comidas[cur.id]={completada:false,texto:''};
  fd.comidas[cur.id].completada=true;
  if(!fd.comidas[cur.id].texto) fd.comidas[cur.id].texto=cur.ejemplo||cur.detail||'';

  const remaining=getPendingMeals(fd);
  if(remaining.length){
    const currentPlanIndex=COMIDAS.findIndex(c=>c.id===cur.id);
    const nextByPlan=remaining.find(c=>COMIDAS.findIndex(x=>x.id===c.id)>currentPlanIndex) || remaining[0];
    fd.selectedPendingMealId=nextByPlan.id;
    fd.allDone=false;
  } else {
    delete fd.selectedPendingMealId;
    fd.allDone=true;
  }
  saveFD(fd);
  showToast(fd.allDone?'🎯 ¡Plan nutricional completo!':'Comida ingresada', fd.allDone?3000:1700, 'ok');
  renderHomeNutritionCard();
  renderFoodIfVisible();
}
function editSelectedPendingMeal(fecha){
  const f=fecha||today();
  const fd=getFD(f);
  const cur=getSelectedPendingMeal(fd).meal;
  foodFecha=f;
  if(cur) foodOpenId=cur.id;
  goTo('food');
  setTimeout(()=>{ const el=document.getElementById('food-comidas-list'); if(el) el.scrollIntoView({behavior:'smooth',block:'start'}); },80);
}
function renderPendingMealNavCard(fecha, opts={}){
  const f=fecha||today();
  const fd=getFD(f);
  const sel=getSelectedPendingMeal(fd);
  const cur=sel.meal;
  if(!cur){
    return '<div class="mq-stat-lbl" style="margin-top:8px;color:var(--ok)">Día alimentario completo</div>';
  }
  const idxPlan=COMIDAS.findIndex(c=>c.id===cur.id);
  const nextPlan=(COMIDAS||[]).slice(idxPlan+1).find(c=>!fd.comidas?.[c.id]?.completada)||null;
  const compact=!!opts.compact;
  const wrapStyle=compact?'margin-top:10px;padding:10px 12px;background:var(--bg3);border-radius:10px':'margin-bottom:12px;padding:12px 14px;background:var(--bg3);border-radius:var(--rl);border:1px solid var(--border)';
  const navBtns=(sel.hasPrev?`<button class="mq-btn-sec" onclick="prevPendingMeal('${f}')">← Anterior</button>`:'')
    +`<button class="mq-btn-pill" onclick="completePendingMeal('${f}','${cur.id}')">Completar</button>`
    +(sel.hasNext?`<button class="mq-btn-sec" onclick="nextPendingMeal('${f}')">Siguiente →</button>`:'');
  return '<div class="mq-pending-meal-card" style="'+wrapStyle+'">'
    +'<div class="mq-stat-lbl">Pendiente</div>'
    +'<div style="font-size:14px;font-weight:700;color:var(--ink);margin:2px 0">'+cur.nombre+'</div>'
    +'<div style="font-size:11px;color:var(--ink3)">'+(cur.ejemplo||cur.detail||cur.grupos||'')+'</div>'
    +'<div class="mq-pending-actions" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">'+navBtns+'</div>'
    +'<div class="mq-hrow" style="gap:8px;margin-top:8px"><button class="mq-btn-sec" onclick="editSelectedPendingMeal(\''+f+'\')">Editar</button></div>'
    +(nextPlan?'<div class="mq-stat-lbl" style="margin-top:6px">Próxima: '+nextPlan.hora+' — '+nextPlan.nombre+'</div>':'')
    +'</div>';
}

function completeCurrentMealFromHome(){
  completePendingMeal(today());
}
function editCurrentMealFromHome(){
  editSelectedPendingMeal(today());
}
function renderFoodIfVisible(){ if(currentScreen==='food') renderFood(); }

function getLastNDates(n, endDateStr){
  const arr=[];
  const d=new Date((endDateStr||today())+'T12:00:00');
  for(let i=0;i<n;i++){
    const x=new Date(d); x.setDate(d.getDate()-i);
    arr.push(localDateStr(x));
  }
  return arr;
}
function ensureDailyFields(fd){
  if(!fd) return fd;
  if(typeof fd.creatina==='undefined') fd.creatina=false;
  if(!fd.sueno) fd.sueno={horas:null,minutos:null,totalMinutos:null};
  return fd;
}
function getSuenoNocheAnteriorDate(baseDateStr){
  const d=new Date((baseDateStr||today())+'T12:00:00');
  d.setDate(d.getDate()-1);
  return localDateStr(d.getTime());
}
function fdGet(f){ return ensureDailyFields(getFD(f||today())); }
function fmtSleepMinutes(total){
  const n=parseInt(total||0,10);
  if(!n || n<0) return 'Sin registro';
  const h=Math.floor(n/60), m=n%60;
  return h+'h '+String(m).padStart(2,'0')+'m';
}
function calcCreatinaSemana(fecha){
  const dias=getLastNDates(7, fecha||today());
  let ok=0;
  dias.forEach(f=>{ const fd=fdGet(f); if(!!fd.creatina) ok++; });
  return {ok,total:7,dias};
}
function calcPromedioSueno7d(fecha){
  const dias=getLastNDates(7, fecha||today());
  const vals=[];
  dias.forEach(f=>{
    const fd=fdGet(f);
    const total=parseInt(fd.sueno?.totalMinutos||0,10);
    if(total>0) vals.push(total);
  });
  if(!vals.length) return {promedio:0,dias:0};
  const promedio=Math.round(vals.reduce((a,b)=>a+b,0)/vals.length);
  return {promedio,dias:vals.length};
}
function toggleCreatina(fecha){
  const f=fecha||today();
  const fd=fdGet(f);
  fd.creatina=!fd.creatina;
  saveFD(fd);
  renderCreatinaCard();
  renderFoodIfVisible();
  showToast(fd.creatina?'Creatina marcada':'Creatina desmarcada',1800,fd.creatina?'ok':'');
}
function renderCreatinaIcon(on){
  return '<svg viewBox="0 0 42 42" width="34" height="34" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    +'<rect x="14" y="5" width="14" height="6" rx="2" fill="'+(on?'#F8F5EF':'#FCFAF6')+'" stroke="#5A2D82" stroke-width="1.8"/>'
    +'<path d="M13 11h16l2 22a4 4 0 0 1-4 4H15a4 4 0 0 1-4-4l2-22Z" fill="'+(on?'#FFFDF7':'#F8F5EF')+'" stroke="#5A2D82" stroke-width="1.8"/>'
    +'<path d="M16 20h10" stroke="#CDA349" stroke-width="1.8"/>'
    +'<path d="M17 26h8" stroke="#CDA349" stroke-width="1.8"/>'
    +(on?'<circle cx="30" cy="12" r="6" fill="#7E8D61" stroke="#fff" stroke-width="1.5"/><path d="M27.5 12l1.8 1.8 3.6-4" stroke="#fff" stroke-width="1.8"/>':'')
    +'</svg>';
}
function renderCreatinaCard(){
  const el=document.getElementById('home-creatina'); if(!el) return;
  const fd=fdGet(today());
  const sem=calcCreatinaSemana(today());
  const tomada=!!fd.creatina;
  el.innerHTML='<div class="mq-home-card mq-creatina-card mq-creatina-card--compact">'
    +'<div class="mq-creatina-compact-head">'
      +'<div class="mq-creatina-icon-wrap">'+renderCreatinaIcon(tomada)+'</div>'
      +'<div class="mq-kicker">Creatina</div>'
    +'</div>'
    +'<button class="mq-creatina-compact-toggle '+(tomada?'on':'')+'" onclick="toggleCreatina()" aria-label="Marcar creatina">'
      +'<span class="mq-creatina-status">'+(tomada?'Tomada':'Pendiente')+'</span>'
      +'<span class="mq-creatina-week">'+sem.ok+'/7 semana</span>'
    +'</button>'
    +'</div>';
}
function openSuenoModal(){
  const sleepDate=getSuenoNocheAnteriorDate(today());
  const fd=fdGet(sleepDate);
  const h=fd.sueno?.horas??'';
  const m=fd.sueno?.minutos??'';
  const ih=document.getElementById('sueno-horas');
  const im=document.getElementById('sueno-minutos');
  const note=document.getElementById('sueno-fecha-nota');
  if(ih) ih.value=h;
  if(im) im.value=m;
  if(note) note.textContent='Se guardará como sueño del '+fmtDateDDMMYYYYStr(sleepDate)+'.';
  openModal('modal-sueno');
}
function fmtDateDDMMYYYYStr(dateStr){
  if(!dateStr) return '';
  const [y,m,d]=dateStr.split('-');
  return `${d}-${m}-${y}`;
}
function guardarSueno(){
  const h=Math.max(0,parseInt(document.getElementById('sueno-horas')?.value||'0',10)||0);
  let m=Math.max(0,parseInt(document.getElementById('sueno-minutos')?.value||'0',10)||0);
  if(m>59) m=59;
  const sleepDate=getSuenoNocheAnteriorDate(today());
  const fd=fdGet(sleepDate);
  fd.sueno={horas:h,minutos:m,totalMinutos:h*60+m, registradoEl:today(), tipo:'noche_anterior'};
  saveFD(fd);
  closeModal('modal-sueno');
  renderSuenoCard();
  renderFoodIfVisible();
  showToast('Sueño noche anterior guardado',1800,'ok');
}
function renderSuenoLunas(total){
  const horas=Math.max(0, Math.min(9, Math.floor((parseInt(total||0,10)||0)/60)));
  let h='<div class="mq-sueno-moons" aria-label="'+horas+' de 9 horas dormidas">';
  for(let i=0;i<9;i++){
    h+='<span class="mq-sueno-moon '+(i<horas?'on':'off')+'">☾</span>';
  }
  h+='</div>';
  return h;
}
function renderSuenoCard(){
  const el=document.getElementById('home-sueno'); if(!el) return;
  const sleepDate=getSuenoNocheAnteriorDate(today());
  const fd=fdGet(sleepDate);
  const total=parseInt(fd.sueno?.totalMinutos||0,10);
  const prom=calcPromedioSueno7d(sleepDate);
  const hasSleep=total>0;
  el.innerHTML='<div class="mq-home-card mq-sueno-card mq-sueno-card--compact">'
    +'<div class="mq-hrow mq-hrow-sb mq-sueno-head">'
      +'<div class="mq-hrow" style="gap:8px;color:#5A2D82"><span class="mq-sueno-icon">☾</span><span class="mq-kicker">Sueño</span></div>'
      +'<button class="mq-btn-pill mq-sueno-action" onclick="openSuenoModal()">'+(hasSleep?'Editar':'Registrar')+'</button>'
    +'</div>'
    +renderSuenoLunas(total)
    +'<div class="mq-sueno-meta">'
      +'<div class="mq-sueno-primary">'+(hasSleep?fmtSleepMinutes(total)+' dormidas':'Sin registro')+'</div>'
      +'<div class="mq-stat-lbl">Noche anterior · '+fmtDateDDMMYYYYStr(sleepDate)+'</div>'
      +'<div class="mq-stat-lbl mq-sueno-prom">Promedio 7 días: '+fmtSleepMinutes(prom.promedio)+(prom.dias?` · ${prom.dias}/7`: '')+'</div>'
    +'</div>'
    +'</div>';
}

/** Retorna objeto con todas las claves de porciones inicializadas a 0 */
function newPorciones(){
  return {proteinas:0,lacteoProtein:0,lacteoDescremado:0,cereales:0,frutas:0,lipidos:0,aceites:0,verduras:0};
}

/** Suma todas las porciones registradas hoy (comidas + alimentos rápidos) */
function getPorcionesHoy(fd){
  return calcPortionsConsumed(fd);
}

function renderHomeNutritionCard(){
  const el=document.getElementById('home-food-today'); if(!el) return;
  const fd=getFD(today()); const prog=getMealProgress(fd); const cm=getCurrentMeal(fd);
  const cur=cm.current, next=cm.next;
  const activas=prog.done||0, total=prog.total||5;

  // Calcular % de porciones del día (de todos los grupos)
  const porcionesHoy=getPorcionesHoy(fd);
  const targets=NUTRITION_TARGETS;
  const grupos=['proteinas','lacteoProtein','lacteoDescremado','cereales','frutas','lipidos','aceites','verduras'];
  let porDone=0, porTotal=0;
  grupos.forEach(g=>{
    const t=targets[g]||0;
    porTotal+=t;
    porDone+=Math.min(t, porcionesHoy[g]||0);
  });
  const porPct=porTotal>0?Math.round(porDone/porTotal*100):0;

  el.innerHTML='<div class="mq-home-card">'
    +'<div class="mq-hrow mq-hrow-sb" style="margin-bottom:8px">'
      +'<div class="mq-hrow" style="gap:8px;color:#CDA349">'+MQ.plato+'<span class="mq-kicker">Nutrición</span></div>'
      +'<div style="display:flex;gap:10px;align-items:center">'
        +`<div style="text-align:right"><div style="font-size:11px;font-weight:700;color:${cm.allDone?'var(--ok)':'#CDA349'}">${prog.pct}%</div><div style="font-size:9px;color:var(--ink3)">Platos</div></div>`
        +`<div style="text-align:right"><div style="font-size:11px;font-weight:700;color:${porPct>=100?'var(--ok)':'var(--p)'}">${porPct}%</div><div style="font-size:9px;color:var(--ink3)">Porciones</div></div>`
      +'</div>'
    +'</div>'
    // Platos tracker
    +mqPlatos(activas, total)
    // Comida pendiente navegable — solo pendientes, en orden de pauta
    +renderPendingMealNavCard(today(), {compact:true})
    +'</div>';
}
function setHomeWaterCups(n){
  const fd=getFD(today()); fd.agua=Math.max(0, Math.min(NUTRITION_TARGETS.aguaVasos, n));
  fd.aguaMl=Math.round(fd.agua*(NUTRITION_TARGETS.aguaMl/NUTRITION_TARGETS.aguaVasos));
  saveFD(fd); showToast('Agua registrada',1400,'ok'); renderHomeWaterCard(); renderFoodIfVisible();
}
function addHomeWaterMl(ml){
  const fd=getFD(today());
  const cur=fd.aguaMl || Math.round((fd.agua||0)*(NUTRITION_TARGETS.aguaMl/NUTRITION_TARGETS.aguaVasos));
  fd.aguaMl=Math.max(0,cur+ml); fd.agua=Math.min(NUTRITION_TARGETS.aguaVasos, Math.round(fd.aguaMl/(NUTRITION_TARGETS.aguaMl/NUTRITION_TARGETS.aguaVasos)));
  saveFD(fd); showToast(fd.aguaMl>=NUTRITION_TARGETS.aguaMl?'Meta cumplida':'Agua registrada',1600,'ok'); renderHomeWaterCard(); renderFoodIfVisible();
}
// Ícono vaso SVG reutilizable para el sistema de agua
function _vasoIco(done, w=20, h=24){
  const c = done ? 'var(--teal)' : 'var(--border2)';
  const f = done ? 'rgba(43,168,170,.20)' : 'none';
  return `<svg viewBox="0 0 20 26" width="${w}" height="${h}" fill="none">
    <path d="M5 2h10l-1.2 16H6.2Z" stroke="${c}" stroke-width="1.6" stroke-linejoin="round" fill="${f}"/>
    <line x1="4" y1="2" x2="16" y2="2" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/>
    ${done?`<path d="M8 8 Q10 11 12 8" stroke="var(--teal)" stroke-width="1.1" stroke-linecap="round" fill="none"/>`:''}
  </svg>`;
}

// Recupera la meta de agua del usuario (vasos y ml) — editable desde Nutrición
function getAguaMeta(){
  try {
    const s = localStorage.getItem('mq_agua_meta');
    if(s) return JSON.parse(s);
  } catch{}
  return { vasos: 10, mlPorVaso: 250 }; // default
}
function setAguaMeta(vasos, mlPorVaso){
  localStorage.setItem('mq_agua_meta', JSON.stringify({ vasos, mlPorVaso }));
}

function renderHomeWaterCard(){
  const el=document.getElementById('home-water-today'); if(!el) return;
  const fd=getFD(today());
  const meta=getAguaMeta();
  const totalVasos=meta.vasos, mlPorVaso=meta.mlPorVaso;
  const metaMl=totalVasos*mlPorVaso;

  // Sistema unificado: aguaVasosHoy = número de vasos marcados hoy
  let vasosHoy = fd.aguaVasosHoy || 0;
  const totalMl = vasosHoy * mlPorVaso;
  const pct = Math.min(100, Math.round(totalMl/metaMl*100));

  // Próximo vaso según hora
  const ahoraMin=(()=>{ const n=new Date(); return n.getHours()*60+n.getMinutes(); })();
  // Distribuir totalVasos entre 06:00 y 21:00 uniformemente
  const paso=Math.floor(900/Math.max(totalVasos-1,1));
  const horariosMin=Array.from({length:totalVasos},(_,i)=>360+i*paso); // 06:00=360min
  const proximoIdx=horariosMin.findIndex((_,i)=>i>=vasosHoy && horariosMin[i]>=ahoraMin);
  const proximoHtml = proximoIdx>=0
    ? `<div class="agua-proximo">◷ Próximo vaso ${proximoIdx+1}: <strong>${String(Math.floor(horariosMin[proximoIdx]/60)).padStart(2,'0')}:${String(horariosMin[proximoIdx]%60).padStart(2,'0')}</strong></div>`
    : vasosHoy>=totalVasos
      ? `<div class="agua-proximo" style="color:var(--ok)">✓ Meta de agua completada</div>`
      : '';

  // Icono vaso vectorial para el header
  const vasoIconHeader=`<svg viewBox="0 0 20 26" width="16" height="18" fill="none">
    <path d="M5 2h10l-1.2 16H6.2Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" fill="rgba(43,168,170,.15)"/>
    <line x1="4" y1="2" x2="16" y2="2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`;

  el.innerHTML='<div class="mq-home-card">'
    +'<div class="mq-hrow mq-hrow-sb" style="margin-bottom:8px">'
      +`<div class="mq-hrow" style="gap:6px;color:var(--teal)">${vasoIconHeader}<span class="mq-kicker">Agua hoy</span></div>`
      +`<span style="font-size:13px;font-weight:700;color:${pct>=100?'var(--ok)':'var(--teal)'}">${ vasosHoy}/${totalVasos}</span>`
    +'</div>'
    // Vasos clickeables
    +'<div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:6px">'
    +Array.from({length:totalVasos},(_,i)=>`
      <button onclick="toggleVasoHoy(${i})" title="Vaso ${i+1}"
        style="background:none;border:none;padding:2px;cursor:pointer;opacity:${i<vasosHoy?1:0.25};transition:opacity .15s">
        ${_vasoIco(i<vasosHoy)}
      </button>`).join('')
    +'</div>'
    +`<div class="mq-stat-lbl">Restante: ${Math.max(0,(metaMl-totalMl)/1000).toFixed(1)} L · ${totalMl} ml de ${metaMl} ml</div>`
    +proximoHtml
    +'</div>';
}

// Toggle: marcar/desmarcar vasos en orden (tap → activa el siguiente, tap en activo → desmarca el último)
function toggleVasoHoy(idx){
  const fd=getFD(today());
  const meta=getAguaMeta();
  let v=fd.aguaVasosHoy||0;
  // Si el idx clickeado es el último activo → restar, si no → sumar hasta ese idx+1
  if(idx===v-1){ v=Math.max(0,v-1); }
  else { v=Math.min(meta.vasos, idx+1); }
  fd.aguaVasosHoy=v;
  fd.agua=v;
  fd.aguaMl=v*meta.mlPorVaso;
  saveFD(fd);
  if(v>=meta.vasos) showToast('✓ Meta de agua completada',2500,'ok');
  renderHomeWaterCard();
  renderFoodIfVisible();
}
function addFrequentFood(foodId){
  const food=[...FREQUENT_FOODS,...QUICK_MEALS].find(f=>f.id===foodId); if(!food) return;
  const fd=getFD(foodFecha); if(!fd.extraFoods) fd.extraFoods=[];
  fd.extraFoods.push({id:food.id,name:food.name,detail:food.detail||'',portions:food.portions,quickMeal:!!food.quickMeal,calcDetail:food.calcDetail||[],ts:Date.now()});
  saveFD(fd); showToast(food.quickMeal?'Comida rápida registrada':'Alimento registrado',1400,'ok'); renderFood(); renderHomeNutritionCard();
}
function renderNutritionPortionDashboard(fd){
  const consumed=calcPortionsConsumed(fd), remaining=calcPortionsRemaining(consumed);
  const keys=Object.keys(remaining);
  return `<div class="mq-portion-card mq-card" style="margin-bottom:12px">
    <div class="mq-card-head"><div><div class="mq-kicker">Porciones del día</div><div class="mq-card-title">Consumido / restante</div></div></div>
    <div class="mq-portion-grid">${keys.map(k=>{const c=+(consumed[k]||0).toFixed(2), r=remaining[k], target=NUTRITION_TARGETS[k]; const p=Math.min(100,Math.round(c/target*100)); return `<div class="mq-portion-row"><div><strong>${PORTION_LABELS[k]}</strong><span>${c} / ${target}</span></div><div class="mq-mini-progress"><div style="width:${p}%"></div></div><small>Restan ${r}</small></div>`;}).join('')}</div>
  </div>`;
}
function renderFrequentFoods(){
  return `<div class="mq-card" style="margin-bottom:12px">
    <div class="mq-card-head"><div><div class="mq-kicker">Registro rápido</div><div class="mq-card-title">Alimentos y comidas rápidas</div></div></div>
    <div class="mq-kicker" style="margin:2px 0 6px">Alimentos frecuentes</div>
    <div class="mq-food-buttons">${FREQUENT_FOODS.map(f=>`<button onclick="addFrequentFood('${f.id}')">${f.name}</button>`).join('')}</div>
    <div class="mq-kicker" style="margin:12px 0 6px">Comidas rápidas · 200 g proteína + 2 cereales</div>
    <div class="mq-food-buttons mq-quick-meal-buttons">${QUICK_MEALS.map(f=>`<button onclick="addFrequentFood('${f.id}')" title="${f.detail}">${f.name}</button>`).join('')}</div>
  </div>`;
}

// ---------------------------------------------------------------
//  AGUA CHECKPOINTS
// ---------------------------------------------------------------
// 10 vasos de 250ml distribuidos entre 06:00 y 20:00
const AGUA_CPS = [
  {hora:'06:00', label:'Al levantarte',    ml:250},
  {hora:'08:00', label:'Desayuno',         ml:250},
  {hora:'10:00', label:'Media mañana',     ml:250},
  {hora:'12:00', label:'Antes almuerzo',   ml:250},
  {hora:'14:00', label:'Post almuerzo',    ml:250},
  {hora:'15:30', label:'Tarde',            ml:250},
  {hora:'17:00', label:'Merienda',         ml:250},
  {hora:'18:30', label:'Pre-entreno',      ml:250},
  {hora:'20:00', label:'Con cena',         ml:250},
  {hora:'21:30', label:'Antes de dormir',  ml:250},
];
const AGUA_META_ML = 2500; // 10 × 250ml

function getAguaCps(fd){ return fd.aguaCps || Array(AGUA_CPS.length).fill(false); }

function toggleAguaCp(idx){
  const fd=getFD(foodDate);
  const cps=getAguaCps(fd);
  cps[idx]=!cps[idx];
  fd.aguaCps=cps;
  // Sincronizar vasos legacy (cada cp = 1 vaso aprox)
  fd.agua=cps.filter(Boolean).length;
  saveFD(fd);
  renderAguaCheckpoints(fd); renderHomeWaterCard();
  const totalMl=AGUA_CPS.filter((_,i)=>cps[i]).reduce((a,c)=>a+c.ml,0);
  if(totalMl>=AGUA_META_ML) showToast('Meta de agua alcanzada',2500,'ok');
}

function renderAguaCheckpoints(fd){
  const el=document.getElementById('agua-checkpoints'); if(!el) return;
  const meta=getAguaMeta();
  const totalVasos=meta.vasos, mlPorVaso=meta.mlPorVaso;
  const metaMl=totalVasos*mlPorVaso;
  let vasosHoy=fd.aguaVasosHoy||0;
  const totalMl=vasosHoy*mlPorVaso;
  const pct=Math.min(100,Math.round(totalMl/metaMl*100));

  // Actualizar barra y label del HTML padre
  const lbl=document.getElementById('agua-total-label');
  if(lbl) lbl.textContent=`${totalMl} / ${metaMl} ml (${pct}%)`;
  const bar=document.getElementById('agua-progress-bar');
  if(bar) bar.style.width=pct+'%';

  // Vasos clickeables — misma lógica que home
  const vasosHtml=`<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">`
    +Array.from({length:totalVasos},(_,i)=>`
      <button onclick="toggleVasoNutri(${i})" title="Vaso ${i+1}"
        style="background:none;border:none;padding:2px;cursor:pointer;opacity:${i<vasosHoy?1:0.25};transition:opacity .15s">
        ${_vasoIco(i<vasosHoy,22,26)}
      </button>`).join('')
    +`</div>
    <div style="font-size:12px;font-weight:700;color:var(--teal);margin-bottom:10px">${vasosHoy} / ${totalVasos} vasos · ${totalMl} ml</div>`;

  // Editor de meta — elegante, sin modal
  const editorHtml=`
    <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:4px">
      <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--ink3);font-weight:700;margin-bottom:10px">Meta diaria de agua</div>
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <div style="flex:1;min-width:120px">
          <div style="font-size:11px;color:var(--ink3);margin-bottom:4px">Vasos por día</div>
          <div style="display:flex;align-items:center;gap:6px">
            <button onclick="ajustarMetaAgua('vasos',-1)"
              style="width:30px;height:30px;border-radius:50%;border:1px solid var(--border2);background:var(--bg3);font-size:16px;cursor:pointer;color:var(--ink);display:flex;align-items:center;justify-content:center">−</button>
            <span id="agua-meta-vasos-lbl" style="font-size:18px;font-weight:700;color:var(--p);min-width:28px;text-align:center">${totalVasos}</span>
            <button onclick="ajustarMetaAgua('vasos',1)"
              style="width:30px;height:30px;border-radius:50%;border:1px solid var(--border2);background:var(--bg3);font-size:16px;cursor:pointer;color:var(--ink);display:flex;align-items:center;justify-content:center">+</button>
          </div>
        </div>
        <div style="flex:1;min-width:120px">
          <div style="font-size:11px;color:var(--ink3);margin-bottom:4px">ml por vaso</div>
          <div style="display:flex;align-items:center;gap:6px">
            <button onclick="ajustarMetaAgua('ml',-50)"
              style="width:30px;height:30px;border-radius:50%;border:1px solid var(--border2);background:var(--bg3);font-size:16px;cursor:pointer;color:var(--ink);display:flex;align-items:center;justify-content:center">−</button>
            <span id="agua-meta-ml-lbl" style="font-size:18px;font-weight:700;color:var(--p);min-width:44px;text-align:center">${mlPorVaso}</span>
            <button onclick="ajustarMetaAgua('ml',50)"
              style="width:30px;height:30px;border-radius:50%;border:1px solid var(--border2);background:var(--bg3);font-size:16px;cursor:pointer;color:var(--ink);display:flex;align-items:center;justify-content:center">+</button>
          </div>
        </div>
        <div style="flex:1;min-width:100px;text-align:center;padding:8px;background:var(--bg3);border-radius:10px;border:1px solid var(--border)">
          <div style="font-size:10px;color:var(--ink3);margin-bottom:2px">Total</div>
          <div id="agua-meta-total-lbl" style="font-size:16px;font-weight:700;color:var(--teal)">${(metaMl/1000).toFixed(2).replace('.',',')} L</div>
        </div>
      </div>
    </div>`;

  el.innerHTML=vasosHtml+editorHtml;
}

// Toggle vasos desde el tab Nutrición
function toggleVasoNutri(idx){
  const fd=getFD(foodFecha);
  const meta=getAguaMeta();
  let v=fd.aguaVasosHoy||0;
  if(idx===v-1){ v=Math.max(0,v-1); } else { v=Math.min(meta.vasos,idx+1); }
  fd.aguaVasosHoy=v; fd.agua=v; fd.aguaMl=v*meta.mlPorVaso;
  saveFD(fd);
  if(v>=meta.vasos) showToast('✓ Meta de agua completada',2500,'ok');
  renderAguaCheckpoints(fd);
  renderHomeWaterCard();
}

// Ajusta la meta de agua (vasos o ml por vaso) y re-renderiza todo
function ajustarMetaAgua(tipo, delta){
  const m=getAguaMeta();
  if(tipo==='vasos') m.vasos=Math.max(1,Math.min(20,m.vasos+delta));
  else               m.mlPorVaso=Math.max(50,Math.min(1000,m.mlPorVaso+delta));
  setAguaMeta(m.vasos,m.mlPorVaso);
  // Actualizar labels en tiempo real sin re-renderizar todo
  const vl=document.getElementById('agua-meta-vasos-lbl');
  const ml=document.getElementById('agua-meta-ml-lbl');
  const tl=document.getElementById('agua-meta-total-lbl');
  if(vl) vl.textContent=m.vasos;
  if(ml) ml.textContent=m.mlPorVaso;
  if(tl) tl.textContent=((m.vasos*m.mlPorVaso)/1000).toFixed(2).replace('.',',')+' L';
  // Re-renderizar ambos cards
  const fd=getFD(foodFecha);
  renderAguaCheckpoints(fd);
  renderHomeWaterCard();
  // Actualizar vasos en food-stats
  const fsEl=document.getElementById('food-stats-row');
  if(fsEl) renderFood();
}

// ---------------------------------------------------------------
//  SCREEN: NUTRICIÓN
// ---------------------------------------------------------------
const COMIDAS=[
  {id:'desayuno', nombre:'Desayuno', hora:'08:00', grupos:'3 proteínas · 1 lácteo protein · 1 fruta · 0.5 cereal · 0.5 lípidos', ejemplo:'1 scoop proteína + 1/2 plátano + pan molde + mantequilla de maní medida', portions:MEAL_PORTIONS.desayuno},
  {id:'fruta_1000', nombre:'Fruta 10:00', hora:'10:00', grupos:'1 fruta', ejemplo:'1 fruta', portions:MEAL_PORTIONS.fruta_1000},
  {id:'almuerzo_post', nombre:'Almuerzo post-entreno', hora:'13:30', grupos:'4 proteínas · 2 cereales', ejemplo:'200 g pollo/vacuno o pescado + arroz, papas o fideos', portions:MEAL_PORTIONS.almuerzo_post},
  {id:'leche_protein_1700', nombre:'Leche protein 17:00', hora:'17:00', grupos:'1 lácteo protein', ejemplo:'1 leche protein', portions:MEAL_PORTIONS.leche_protein_1700},
  {id:'huevos_1800', nombre:'Huevos duros 18:00', hora:'18:00', grupos:'3 proteínas', ejemplo:'2 huevos duros', portions:MEAL_PORTIONS.huevos_1800},
  {id:'leche_descremada_casa', nombre:'Leche descremada al llegar', hora:'19:30', grupos:'1 lácteo descremado', ejemplo:'200 ml leche descremada', portions:MEAL_PORTIONS.leche_descremada_casa},
  {id:'cena', nombre:'Cena', hora:'21:00', grupos:'3 proteínas · 2 cereales · 2 verduras', ejemplo:'Proteína magra + arroz, papas o fideos + verduras de libre consumo', portions:MEAL_PORTIONS.cena},
];
const PORCIONES=[
  {emoji:'◌',nombre:'Cereales',              meta:'3'},
  {emoji:'◍',nombre:'Frutas',                meta:'2'},
  {emoji:'◉',nombre:'Carnes bajas en grasa', meta:'12'},
  {emoji:'◓',nombre:'Lácteos semidescrem.',  meta:'2'},
  {emoji:'◓',nombre:'Lácteos descremados',   meta:'1'},
  {emoji:'🥑',nombre:'Lípidos',               meta:'0.5'},
  {emoji:'🫒',nombre:'Aceites',               meta:'1'},
  {emoji:'◉',nombre:'Verduras',              meta:'2'},
];
const MENU_SEMANA=[
  {dia:'Domingo',   r:'Cardio ↝', d:'Yogur + pan + 3 huevos + fruta', a:'320g merluza + papa + lechuga', c:'Tortilla + 200g pollo + zanahoria + palta'},
  {dia:'Lunes',     r:'Inf A ◉',  d:'Yogur + avena + jamón pavo', a:'240g atún + rúcula + tomate', c:'Choclo + 200g pechuga + espinaca + palta'},
  {dia:'Martes',    r:'Sup A ◈',  d:'Yogur + pan + 3 huevos + jamón', a:'320g merluza + brócoli + zanahoria', c:'2 tortillas + 200g pollo + lechuga + palta'},
  {dia:'Miércoles', r:'Inf B ◉',  d:'Leche + 2 huevos + pan + jamón', a:'320g tilapia + apio + lechuga', c:'Arroz + pollo + zapallo + palta'},
  {dia:'Jueves',    r:'Sup B ✦',  d:'Yogur + avena + jamón', a:'4 huevos + apio + acelga', c:'Choclo + atún + tomate + palta'},
  {dia:'Viernes',   r:'Descanso',  d:'Yogur + pan + 3 huevos', a:'320g corvina + brócoli + champiñones', c:'2 tortillas + pollo + rúcula + palta'},
  {dia:'Sábado',    r:'Descanso',  d:'Leche + avena + 2 huevos + jamón', a:'Camarones + ensalada + zanahoria', c:'Arroz + pechuga + espinaca + nueces'},
];
const IDEAS={
  desayuno:[
    {t:'Proteico clásico',d:'3 huevos + 1 pan molde + yogur protein + 60g jamón pavo',p:'3 carnes + 0.5 cereal + 1 lácteo'},
    {t:'Avena + proteína',d:'40g avena + yogur protein + 2 huevos + 30g jamón',p:'0.5 cereal + 1 lácteo + 2 carnes'},
    {t:'Sándwich proteico',d:'2 panes molde + 2 huevos + 60g pechuga pavo + yogur',p:'1 cereal + 3 carnes + 1 lácteo'},
  ],
  almuerzo:[
    {t:'Merluza al vapor',d:'320g merluza + ensalada apio + tortilla acelga + limón',p:'4 carnes + 1 verdura'},
    {t:'Atún con ensalada',d:'240g atún al agua + lechuga + tomate + pepino + 1 cdta aceite',p:'4 carnes + verduras + 1 aceite'},
    {t:'Pollo con verduras',d:'200g pechuga grillada + brócoli + zanahoria',p:'4 carnes + 1 verdura'},
    {t:'Corvina al horno',d:'320g corvina + espárragos + champiñones + limón',p:'4 carnes + verduras'},
  ],
  cena:[
    {t:'Wrap de pollo',d:'1 tortilla grande + 200g pechuga + lechuga + zanahoria + 50g palta',p:'2 cereales + 4 carnes + verduras + 0.5 líp'},
    {t:'Choclo con atún',d:'130g choclo + 240g atún + lechuga + tomate + 50g palta',p:'1 cereal + 4 carnes + verduras + 0.5 líp'},
    {t:'Arroz con pollo',d:'100g arroz + 200g pechuga + espinaca + 50g palta',p:'1 cereal + 4 carnes + verduras + 0.5 líp'},
  ],
  pre_entreno:[
    {t:'Estándar',d:'200ml leche desc + 1 scoop proteína + 1 manzana',p:'1 lácteo + 2 carnes + 1 fruta'},
    {t:'Frutal',d:'120g arándanos + 200ml leche desc + 1 scoop',p:'1 fruta + 1 lácteo + 2 carnes'},
  ],
  colacion_am:[
    {t:'Fruta simple',d:'120g arándanos o 1 manzana chica',p:'1 fruta'},
    {t:'Kiwis',d:'2 kiwis + agua con limón',p:'1 fruta'},
  ],
  colacion_pm:[
    {t:'Yogur proteico',d:'1 yogur Soprole protein natural',p:'1 lácteo'},
  ],
};

let foodFecha=today(), foodOpenId=null, foodFoodTab='registro', ideasFiltro='desayuno';

function getFD(f){
  try{ const r=localStorage.getItem('ff_'+f); if(r) return JSON.parse(r); }catch{}
  const d={fecha:f,agua:0,comidas:{}};
  COMIDAS.forEach(c=>d.comidas[c.id]={completada:false,texto:''});
  return d;
}
function saveFD(d){ localStorage.setItem('ff_'+d.fecha,JSON.stringify(d)); }

function cambiarDia(delta){
  const d=new Date(foodFecha+'T12:00:00'); d.setDate(d.getDate()+delta);
  foodFecha=localDateStr(d); renderFood();
}
function switchFoodTab(tab,btn){
  foodFoodTab=tab;
  document.querySelectorAll('#s-food .tab-btn').forEach(b=>b.classList.remove('on')); btn.classList.add('on');
  document.querySelectorAll('#s-food .tab-panel').forEach(p=>p.classList.remove('on'));
  document.getElementById('food-'+tab).classList.add('on');
  if(tab==='ideas') renderIdeas();
  if(tab==='pauta') renderPauta();
}
function renderFood(){
  const fd=getFD(foodFecha);
  const dias=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const meses=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  const d=new Date(foodFecha+'T12:00:00');
  const esHoy=foodFecha===today();
  document.getElementById('food-fecha-lbl').textContent=`${dias[d.getDay()]} ${d.getDate()} ${meses[d.getMonth()]}${esHoy?' · Hoy':''}`;
  const completadas=Object.values(fd.comidas).filter(c=>c.completada).length;
  const pct=Math.round((completadas/COMIDAS.length)*100);
  const meta=getAguaMeta();
  const vasosHoy=fd.aguaVasosHoy||0;
  document.getElementById('food-stats-row').innerHTML=`
    <div class="stat-box"><div class="stat-num" style="color:var(--teal)">${vasosHoy}/${meta.vasos}</div><div class="stat-label">Vasos</div></div>
    <div class="stat-box"><div class="stat-num">${completadas}/${COMIDAS.length}</div><div class="stat-label">Comidas</div></div>
    <div class="stat-box"><div class="stat-num" style="color:${pct===100?'var(--ok)':'var(--p)'}">${pct}%</div><div class="stat-label">Adherencia</div></div>`;
  // Agua
  renderAguaCheckpoints(fd);
  document.getElementById('food-comidas-count').textContent=`${completadas} / ${COMIDAS.length}`;
  // Menú sugerido
  const menu=MENU_SEMANA[d.getDay()];
  const nutritionDash = renderNutritionPortionDashboard(fd) + renderFrequentFoods();
  const sug=menu&&esHoy?`<div style="background:var(--bg3);border-radius:var(--rl);padding:10px 14px;margin-bottom:10px;border-left:3px solid var(--orange)">
    <div style="font-size:10px;color:var(--ink3);letter-spacing:2px;text-transform:uppercase;margin-bottom:4px">▦ Menú sugerido · ${menu.r}</div>
    <div style="font-size:12px;color:var(--ink2);line-height:1.7"><strong style="color:var(--orange)">D:</strong> ${menu.d}<br><strong style="color:var(--orange)">A:</strong> ${menu.a}<br><strong style="color:var(--orange)">C:</strong> ${menu.c}</div>
  </div>`:'';
  document.getElementById('food-comidas-list').innerHTML=nutritionDash+sug+renderPendingMealNavCard(foodFecha,{compact:false})+COMIDAS.map(c=>{
    const est=fd.comidas[c.id]||{completada:false,texto:''};
    const ab=foodOpenId===c.id;
    return `<div class="comida-card">
      <div class="comida-head" onclick="toggleComida('${c.id}')">
        <div class="comida-emoji">◉</div>
        <div class="comida-info">
          <div class="comida-nombre">${c.nombre}</div>
          <div class="comida-hora">${c.hora}</div>
          ${est.texto?`<div class="comida-texto">${est.texto}</div>`:''}
        </div>
        <div class="comida-check ${est.completada?'done':''}" onclick="event.stopPropagation();toggleComidaCheck('${c.id}')">
          <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
      </div>
      ${ab?`<div class="comida-detalle">
        <div class="comida-grupos">${c.grupos}</div>
        <textarea class="comida-ta" rows="2" placeholder="¿Qué comiste? Ej: ${c.ejemplo}" oninput="saveComidaTxt('${c.id}',this.value)">${est.texto||''}</textarea>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px">
          ${(IDEAS[c.id]||[]).slice(0,3).map(idea=>`<button class="idea-btn" onclick="usarIdea('${c.id}','${idea.d.replace(/'/g,"\\'")}')">${idea.t}</button>`).join('')}
          <button class="idea-btn" style="color:var(--orange);border-color:var(--orange)" onclick="switchFoodTab('ideas',document.querySelector('#s-food .tab-btn:nth-child(2)'));ideasFiltro='${c.id}';renderIdeas()">Más ideas →</button>
        </div>
        <div style="font-size:11px;color:var(--ink3);margin-top:8px;font-style:italic">💡 ${c.ejemplo}</div>
      </div>`:''}
    </div>`;
  }).join('');
}
function toggleComida(id){ foodOpenId=foodOpenId===id?null:id; renderFood(); }
function toggleComidaCheck(id){
  const fd=getFD(foodFecha); if(!fd.comidas[id]) fd.comidas[id]={completada:false,texto:''};
  const wasDone=!!fd.comidas[id].completada;
  fd.comidas[id].completada=!wasDone;
  const pending=getPendingMeals(fd);
  if(pending.length){
    if(!fd.selectedPendingMealId || !pending.some(c=>c.id===fd.selectedPendingMealId)){
      const idx=COMIDAS.findIndex(c=>c.id===id);
      const nextByPlan=pending.find(c=>COMIDAS.findIndex(x=>x.id===c.id)>idx) || pending[0];
      fd.selectedPendingMealId=nextByPlan.id;
    }
    fd.allDone=false;
  } else {
    delete fd.selectedPendingMealId;
    fd.allDone=true;
  }
  saveFD(fd);
  if(fd.allDone) showToast('🎯 ¡Plan nutricional completo!',3000,'ok');
  renderFood(); renderHomeNutritionCard();
}
function saveComidaTxt(id,txt){
  const fd=getFD(foodFecha); if(!fd.comidas[id]) fd.comidas[id]={completada:false,texto:''};
  fd.comidas[id].texto=txt; saveFD(fd);
}
function usarIdea(id,txt){
  const fd=getFD(foodFecha); if(!fd.comidas[id]) fd.comidas[id]={completada:false,texto:''};
  fd.comidas[id].texto=txt; saveFD(fd); renderFood(); showToast('✓ Idea copiada',1500,'ok');
}
function cambiarAgua(delta){
  const fd=getFD(foodFecha);
  fd.agua=Math.min(NUTRITION_TARGETS.aguaVasos,Math.max(0,(fd.agua||0)+delta)); fd.aguaMl=Math.round(fd.agua*(NUTRITION_TARGETS.aguaMl/NUTRITION_TARGETS.aguaVasos)); saveFD(fd);
  if(fd.agua>=NUTRITION_TARGETS.aguaVasos) showToast('Meta de agua alcanzada',2500,'ok');
  renderAguaCheckpoints(fd);
  renderFood();
}
function renderIdeas(){
  const filtros=[
    {id:'desayuno',label:'☼ Desayuno'},{id:'almuerzo',label:'◐ Almuerzo'},
    {id:'cena',label:'☾ Cena'},{id:'pre_entreno',label:'✶ Pre-Entreno'},
    {id:'colacion_am',label:'◍ Colación'},{id:'colacion_pm',label:'◓ PM'},
  ];
  document.getElementById('ideas-filtro').innerHTML=filtros.map(f=>`
    <button onclick="ideasFiltro='${f.id}';renderIdeas()" style="padding:5px 12px;border-radius:20px;border:1px solid ${ideasFiltro===f.id?'var(--orange)':'var(--border2)'};background:${ideasFiltro===f.id?'var(--bg4)':'var(--bg3)'};color:${ideasFiltro===f.id?'var(--orange)':'var(--ink2)'};font-size:11px;font-weight:600;cursor:pointer">${f.label}</button>`).join('');
  const lista=IDEAS[ideasFiltro]||[];
  const c=COMIDAS.find(x=>x.id===ideasFiltro);
  document.getElementById('ideas-list').innerHTML=`
    <div style="font-size:11px;color:var(--ink3);margin-bottom:10px;font-style:italic">${c?.grupos||''}</div>
    ${lista.map(idea=>`<div class="card" style="margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
        <div style="flex:1">
          <div style="font-size:14px;font-weight:700;margin-bottom:4px">${idea.t}</div>
          <div style="font-size:12px;color:var(--ink2);line-height:1.6;margin-bottom:4px">${idea.d}</div>
          <div style="font-size:10px;color:var(--orange);font-weight:700">${idea.p}</div>
        </div>
        <button onclick="usarIdea('${ideasFiltro}','${idea.d.replace(/'/g,"\\'")}')" class="btn btn-p btn-sm" style="white-space:nowrap;flex-shrink:0">Usar hoy</button>
      </div>
    </div>`).join('')}`;
}
function renderPauta(){
  document.getElementById('food-porciones').innerHTML=PORCIONES.map(p=>`
    <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px">
      <span style="color:var(--ink2)">${p.emoji} ${p.nombre}</span>
      <span style="font-weight:700;color:var(--ink)">${p.meta}</span>
    </div>`).join('');
  document.getElementById('food-menu-sem').innerHTML=MENU_SEMANA.map(m=>`
    <div style="padding:10px 0;border-bottom:1px solid var(--border)">
      <div style="font-size:12px;font-weight:700;color:var(--orange);margin-bottom:3px">${m.dia} <span style="color:var(--ink3);font-weight:400">· ${m.r}</span></div>
      <div style="font-size:11px;color:var(--ink2);line-height:1.7"><strong>D:</strong> ${m.d}<br><strong>A:</strong> ${m.a}<br><strong>C:</strong> ${m.c}</div>
    </div>`).join('');
}

// ---------------------------------------------------------------
//  SCREEN: PERFIL
// ---------------------------------------------------------------
let perfilTab='habitos';
function renderPerfil(){
  const btn=document.getElementById('perfil-action-btn');
  if(perfilTab==='habitos')  { btn.textContent='';        btn.style.display='none'; renderHabitsLumen(); }
  if(perfilTab==='plan')     { btn.textContent='+ Plan';  btn.style.display='inline-flex'; btn.onclick=()=>{ document.getElementById('plan-inicio-wrap').innerHTML=renderDatePicker('plan-inicio',today()); openModal('modal-plan'); }; renderPerfilPlan(); }
  if(perfilTab==='logros')   { btn.style.display='none'; renderLogros(); }
}
function switchPerfilTab(tab,btn2){
  perfilTab=tab;
  document.querySelectorAll('#s-perfil .tab-btn').forEach(b=>b.classList.remove('on')); btn2.classList.add('on');
  document.querySelectorAll('#s-perfil .tab-panel').forEach(p=>p.classList.remove('on'));
  document.getElementById('perfil-'+tab).classList.add('on');
  renderPerfil();
}

// ── Hábitos Lumen ─────────────────────────────────────────────
function renderHabitsLumen(){
  const el=document.getElementById('perfil-habitos'); if(!el) return;
  const ses=forge.sessions||[];
  const entreDias=new Set(ses.map(s=>localDateStr(s.date)));
  const streak=calcStreak(), maxStr=calcMaxStreak(), total=entreDias.size;
  const year=new Date().getFullYear();
  const todayStr=today();

  // Estado de hoy para alcohol y pauta
  const habAlcohol = (forge.habitos||[]).find(x=>x.tipo==='alcohol');
  const todayAlcohol = (habAlcohol?.registros||{})[todayStr];
  let todayPauta = false;
  try { const r = localStorage.getItem('ff_'+todayStr); if(r){ const fd2=JSON.parse(r); todayPauta = fd2.pautaManual || false; } } catch {}

  el.innerHTML=`
    <div class="lumen-stat-row">
      <div class="lumen-stat"><div class="lumen-num">${streak}</div><div class="lumen-lbl">Racha actual</div><div class="lumen-sub">semanas seguidas</div></div>
      <div class="lumen-stat"><div class="lumen-num">${maxStr}</div><div class="lumen-lbl">Mejor racha</div><div class="lumen-sub">histórico</div></div>
      <div class="lumen-stat"><div class="lumen-num">${total}</div><div class="lumen-lbl">Días totales</div><div class="lumen-sub">registrados</div></div>
    </div>
    ${renderLumenHabitoGrid('◈ Días entrenados','Cada día que completaste un entrenamiento',year,todayStr,d=>entreDias.has(d)?1:-1)}

    <div style="margin-bottom:10px">
      <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--ink3);font-weight:600;margin-bottom:8px">Consumo de alcohol hoy</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="hab-alcohol-btn${todayAlcohol==='bebio'?' active':''}" onclick="toggleAlcohol('${todayStr}')">
          Marcar consumo de alcohol
        </button>
      </div>
    </div>

    ${renderLumenHabitoGrid('⊘ Días sin alcohol','Por defecto sin alcohol · Toca el botón de arriba para marcar si bebiste',year,todayStr,d=>{
      const h=(forge.habitos||[]).find(x=>x.tipo==='alcohol');
      if(!h) return 1;
      const r=(h.registros||{})[d];
      return r==='bebio'?0:1;
    }, 'alcohol')}

    <div style="margin-bottom:10px;margin-top:4px">
      <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--ink3);font-weight:600;margin-bottom:8px">Pauta nutricional hoy</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="hab-pauta-btn${todayPauta?' active':''}" onclick="togglePautaHoy()">
          ${todayPauta?'✓ Pauta completada hoy':'Marcar pauta completada'}
        </button>
      </div>
    </div>

    ${renderLumenHabitoGrid('◈ Pauta nutricional','Días con pauta alimentaria completada',year,todayStr,d=>{
      try{ const r=localStorage.getItem('ff_'+d); if(!r) return -1; const fd2=JSON.parse(r);
        const mealsDone=(fd2.meals||[]).filter(m=>m.done).length+(fd2.extraFoods||[]).length;
        return fd2.pautaManual?1:(mealsDone>=5||fd2.allDone)?1:mealsDone>=3?0.5:mealsDone>0?0.25:-1;
      }catch{ return -1; }
    })}

    ${renderLumenHabitoGrid('◈ Meta de agua','Días que alcanzaste los 7 checkpoints de agua',year,todayStr,d=>{
      try{ const r=localStorage.getItem('ff_'+d); if(!r) return -1; const fd2=JSON.parse(r);
        const aguaCps=(fd2.aguaCps||[]).filter(Boolean).length;
        return aguaCps>=7?1:aguaCps>=5?0.5:aguaCps>=3?0.25:-1;
      }catch{ return -1; }
    })}`;
}

function renderLumenHabitoGrid(titulo,subtitulo,year,todayStr,valFn,tipo=''){
  const start=new Date(year,0,1);
  const dow0=(start.getDay()+6)%7;
  const gridStart=new Date(year,0,1); gridStart.setDate(1-dow0);
  const gridEnd=new Date(year,11,31);
  const meses=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  let cells='', cumplidos=0, totalDias=0;
  for(let d=new Date(gridStart);d<=gridEnd;d.setDate(d.getDate()+1)){
    const f=localDateStr(d);
    const isOther=d.getFullYear()!==year, isFuture=f>todayStr;
    let cls='lc';
    const clickable=tipo==='alcohol'&&!isOther&&!isFuture;
    if(isOther||isFuture){ cls+=' fut'; }
    else {
      const v=valFn(f);
      totalDias++;
      if(v>=1){ cls+=' l4'; cumplidos++; }
      else if(v>=0.5) cls+=' l3';
      else if(v>=0.25) cls+=' l2';
      else if(v===0) cls+=' l1';
    }
    cells+=clickable
      ? `<div class="${cls}" onclick="toggleAlcohol('${f}')" style="cursor:pointer" title="${f}"></div>`
      : `<div class="${cls}"></div>`;
  }

  let monthsHtml='<div class="lumen-months">';
  for(let m=0;m<12;m++){
    monthsHtml+=`<div class="lumen-month" style="min-width:28px">${meses[m]}</div>`;
  }
  monthsHtml+='</div>';

  const etiqueta=tipo==='alcohol'
    ? `<strong style="color:var(--green)">${cumplidos}</strong> de ${totalDias} días sin alcohol`
    : `<strong style="color:var(--orange)">${cumplidos}</strong> de ${totalDias} días`;

  return `<div class="lumen-block">
    <div class="lumen-block-title">${titulo}</div>
    <div class="lumen-block-sub">${subtitulo} · ${etiqueta}</div>
    <div class="lumen-grid-wrap">
      ${monthsHtml}
      <div class="lgrid">${cells}</div>
    </div>
    <div class="lumen-legend">
      ${tipo==='alcohol'
        ? `<span>Bebiste</span><div class="ll" style="background:var(--red);opacity:.7"></div><div class="ll" style="background:var(--green);opacity:.4"></div><div class="ll" style="background:var(--green)"></div><span>Sin alcohol</span>`
        : `<span>Menos</span><div class="ll" style="background:var(--bg3);border:1px solid var(--border)"></div><div class="ll" style="background:var(--orange);opacity:.3"></div><div class="ll" style="background:var(--orange);opacity:.6"></div><div class="ll" style="background:var(--orange)"></div><span>Más</span>`}
    </div>
  </div>`;
}

function togglePautaHoy() {
  const f = today();
  try {
    const r = localStorage.getItem('ff_'+f);
    const fd2 = r ? JSON.parse(r) : {};
    fd2.pautaManual = !fd2.pautaManual;
    localStorage.setItem('ff_'+f, JSON.stringify(fd2));
    showToast(fd2.pautaManual ? '✓ Pauta completada' : 'Pauta desmarcada', 1500, fd2.pautaManual ? 'ok' : '');
    renderHabitsLumen();
  } catch {}
}

function toggleAlcohol(fecha){  if(!forge.habitos) forge.habitos=[];
  let h=forge.habitos.find(x=>x.tipo==='alcohol');
  if(!h){ h={id:'hab_alcohol',tipo:'alcohol',registros:{}}; forge.habitos.push(h); }
  if(!h.registros) h.registros={};
  // Toggle: si ya marcado como bebió → borrar, si no → marcar
  if(h.registros[fecha]==='bebio'){
    delete h.registros[fecha];
    showToast('✓ Día marcado sin alcohol',1500,'ok');
  } else {
    h.registros[fecha]='bebio';
    showToast('🍷 Día marcado con alcohol',1500);
  }
  saveDB();
  renderHabitsLumen();
}

// ── Plan de progresión ────────────────────────────────────────
function renderPerfilPlan(){
  const el=document.getElementById('perfil-plan'); if(!el) return;
  const plan=(forge.planes||[]).find(p=>p.activo);
  if(!plan){
    el.innerHTML=`<div class="empty"><div class="empty-icon">▤</div><div class="empty-text">Sin plan activo</div><div class="empty-sub">Crea tu plan de 16 semanas con progresión +2.5% semanal en los 3 ejercicios clave.</div><button class="btn btn-p" onclick="document.getElementById('plan-inicio-wrap').innerHTML=renderDatePicker('plan-inicio',today());openModal('modal-plan')" style="margin-top:16px">🚀 Crear plan</button></div>`;
    return;
  }
  const semG=semanaActualPlan(plan);
  const pct=Math.round((semG/plan.totalSemanas)*100);
  const cargas=getCargasSemana('');

  el.innerHTML=`
    <div class="card" style="margin-bottom:14px">
      <div style="font-size:16px;font-weight:800;color:var(--ink);margin-bottom:4px">${plan.nombre}</div>
      <div style="font-size:11px;color:var(--ink3);margin-bottom:8px">${plan.inicio} · Semana ${semG}/${plan.totalSemanas}</div>
      <div style="background:var(--bg3);border-radius:3px;height:6px;overflow:hidden;margin-bottom:4px"><div style="width:${pct}%;height:100%;background:var(--orange)"></div></div>
      <div style="font-size:10px;color:var(--ink3)">${pct}% completado</div>
    </div>

    <div class="section-label">Cargas sugeridas esta semana</div>
    ${EJERCICIOS_CLAVE.map(ec=>{
      const e=getEx(ec.id);
      const c=getCargasSemana('')[ec.id];
      const meta=plan.metas?.[ec.id];
      const pr=getPR(ec.id);
      const pct2=meta&&pr.weight>0?Math.min(100,Math.round((pr.weight/meta)*100)):0;
      return `<div class="card" style="margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <div style="font-size:14px;font-weight:700">${e?.name||ec.label}</div>
          ${c?`<span class="carga-tag">Sem ${semG}: ${c} kg</span>`:''}
        </div>
        <div style="font-size:12px;color:var(--ink3)">PR actual: ${pr.weight||'—'}kg · Meta: ${meta||'—'}kg</div>
        ${pct2>0?`<div style="background:var(--bg3);border-radius:2px;height:4px;margin-top:6px;overflow:hidden"><div style="width:${pct2}%;height:100%;background:var(--orange)"></div></div>`:''}
      </div>`;
    }).join('')}

    <div class="section-label" style="margin-top:16px">Bloques del plan</div>
    ${(plan.bloques||[]).map((b,i)=>{
      const activo=semG>=b.semInicio&&semG<=b.semFin;
      const done=semG>b.semFin;
      return `<div class="card" style="margin-bottom:8px;${activo?'border-color:var(--orange)':''}">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div>
            <div style="font-size:13px;font-weight:700;color:${activo?'var(--orange)':'var(--ink)'}">${done?'✓ ':''}Bloque ${i+1}: ${b.nombre}</div>
            <div style="font-size:11px;color:var(--ink3)">Semanas ${b.semInicio}–${b.semFin}</div>
          </div>
          ${activo?`<span class="pill state-active">Activo</span>`:''}
        </div>
      </div>`;
    }).join('')}

    <div class="section-label" style="margin-top:20px">Control de sincronización</div>
    <div class="card" style="margin-bottom:8px">
      <div style="font-size:13px;font-weight:700;color:var(--ink);margin-bottom:4px">Rutinas en app</div>
      <div style="font-size:12px;color:var(--ink3);margin-bottom:12px">${(forge.routines||[]).length} rutinas guardadas localmente</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <button class="btn btn-p" onclick="syncDesdeFirebase()" style="font-size:12px">
          ◌ Descargar desde Firebase (sobreescribir local)
        </button>
        <button class="btn btn-s" onclick="syncHaciaFirebase()" style="font-size:12px">
          ⬆️ Subir local a Firebase (sobreescribir nube)
        </button>
        <button class="btn btn-r" onclick="limpiarRutinasLocal()" style="font-size:12px;color:#fff">
          🗑 Limpiar rutinas duplicadas
        </button>
      </div>
    </div>`;
}

async function syncDesdeFirebase(){
  const user=firebase.auth().currentUser;
  if(!user){ showToast('Debes estar autenticado',2000); return; }
  showToast('Descargando desde Firebase…',2000);
  try{
    const ref=firebase.firestore().collection('users').doc(user.uid).collection('data').doc('forge');
    const snap=await ref.get();
    if(!snap.exists){ showToast('Sin datos en Firebase',2000); return; }
    const remoto=snap.data();
    // Firebase es fuente de verdad — sobreescribir todo excepto sesiones (merge)
    const sesLocal=forge.sessions||[];
    forge={...forge,...remoto};
    // Merge sesiones: conservar todas sin duplicar
    const sesIds=new Set((remoto.sessions||[]).map(s=>s.id));
    sesLocal.forEach(s=>{ if(!sesIds.has(s.id)) forge.sessions.push(s); });
    saveDB();
    renderTrain();
    renderHome();
    renderPerfil();
    showToast(`✓ Sincronizado: ${(forge.routines||[]).length} rutinas`,2500,'ok');
  }catch(e){ showToast('Error: '+e.message,3000); }
}

async function syncHaciaFirebase(){
  const user=firebase.auth().currentUser;
  if(!user){ showToast('Debes estar autenticado',2000); return; }
  if(!confirm('¿Sobreescribir Firebase con los datos locales actuales?\n\nEsto reemplazará las rutinas en la nube.')) return;
  showToast('Subiendo a Firebase…',2000);
  try{
    const ref=firebase.firestore().collection('users').doc(user.uid).collection('data').doc('forge');
    await ref.set(forge);
    showToast('✓ Firebase actualizado',2500,'ok');
  }catch(e){ showToast('Error: '+e.message,3000); }
}

function limpiarRutinasLocal(){
  const IDS_BASE=['r_lunes','r_martes','r_mierco','r_jueves','r_jueves_noche','r_cardio'];
  const NOMBRES_BASE=['tren inferior a','tren superior a','tren inferior b','tren superior b','cardio'];
  const antes=(forge.routines||[]).length;
  // Eliminar copias de rutinas base con ID distinto
  forge.routines=(forge.routines||[]).filter(r=>{
    if(IDS_BASE.includes(r.id)) return true;
    const n=r.name.toLowerCase();
    return !NOMBRES_BASE.some(nb=>n.includes(nb));
  });
  // Agregar las 5 base si faltan
  IDS_BASE.forEach((id,i)=>{
    if(!forge.routines.find(r=>r.id===id)) forge.routines.push({...RUTINAS_BASE[i]});
  });
  saveDB();
  renderTrain();
  renderPerfil();
  showToast(`✓ ${antes-(forge.routines||[]).length} duplicadas eliminadas · ${(forge.routines||[]).length} rutinas`,3000,'ok');
}

// ── Logros ─────────────────────────────────────────────────────
function renderLogros(){
  const el=document.getElementById('perfil-logros'); if(!el) return;
  const logros=forge.logros||[];
  if(!logros.length){
    el.innerHTML=`<div class="empty"><div class="empty-icon">⬢</div><div class="empty-text">Sin logros aún</div><div class="empty-sub">Completa sesiones para desbloquear logros.</div></div>`;
    return;
  }
  el.innerHTML=`<div class="section-label">Logros desbloqueados</div>`+
    logros.map(l=>`<div class="card" style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
      <div style="font-size:32px;flex-shrink:0">${l.icon}</div>
      <div><div style="font-size:14px;font-weight:700;color:var(--ink)">${l.title}</div><div style="font-size:12px;color:var(--ink3)">${l.sub}</div></div>
    </div>`).join('');
}

function checkLogros(){
  const ses=forge.sessions||[];
  const logros=forge.logros||[];
  const ids=new Set(logros.map(l=>l.id));
  const nuevos=[];
  if(ses.length===1&&!ids.has('first')) nuevos.push({id:'first',icon:'✦',title:'Primera sesión',sub:'Comenzaste tu camino en Melqart.'});
  if(ses.length>=10&&!ids.has('ten')) nuevos.push({id:'ten',icon:'✦',title:'10 sesiones',sub:'Constancia que forja resultados.'});
  if(ses.length>=50&&!ids.has('fifty')) nuevos.push({id:'fifty',icon:'⬢',title:'50 sesiones',sub:'Has consolidado tu disciplina.'});
  if(calcStreak()>=7&&!ids.has('week')) nuevos.push({id:'week',icon:'✶',title:'Racha de 7 días',sub:'Siete días de constancia.'});
  if(calcStreak()>=30&&!ids.has('month')) nuevos.push({id:'month',icon:'🌟',title:'Racha de 30 días',sub:'Un mes de consistencia total.'});
  if(nuevos.length){
    if(!forge.logros) forge.logros=[];
    forge.logros.push(...nuevos);
    saveDB();
    nuevos.forEach(l=>setTimeout(()=>showToast(`${l.icon} Logro: ${l.title}`,4000,'ok'),500));
  }
}

// ---------------------------------------------------------------
//  IMPORTAR HEVY CSV
// ---------------------------------------------------------------
// ── IMPORTADOR HEVY — 2 pasos ─────────────────────────────────
const impBuf={f1:null,f2:null};
let impSesRevisadas=[];  // sesiones parseadas pendientes de confirmar

function impReset(){
  impBuf.f1=null; impBuf.f2=null; impSesRevisadas=[];
}

function openImport(){
  impReset();
  document.getElementById('imp-title').textContent='Importar desde Hevy';
  renderImpStep1();
  openModal('modal-import');
}

function renderImpStep1(){
  document.getElementById('imp-body').innerHTML=`
    <div style="background:var(--bg3);border-left:3px solid var(--orange);border-radius:var(--r);padding:10px 12px;margin-bottom:14px;font-size:12px;color:var(--ink2);line-height:1.7">
      En Hevy: <strong>Perfil → Configuración → Exportar datos</strong><br>
      Genera dos archivos CSV. Después de cargarlos podrás revisar cada sesión antes de guardar.
    </div>
    <div style="margin-bottom:12px">
      <div class="section-label">📊 Entrenamientos (workout_history.csv)</div>
      <div onclick="document.getElementById('imp-f1').click()"
        style="border:2px dashed var(--border2);border-radius:var(--rl);padding:20px;text-align:center;cursor:pointer;transition:border-color .1s"
        onmouseover="this.style.borderColor='var(--orange)'" onmouseout="this.style.borderColor='var(--border2)'">
        <div style="font-size:28px;margin-bottom:6px">◈</div>
        <div id="imp-lbl-1" style="font-size:12px;color:var(--ink3)">Toca para seleccionar workout_history.csv</div>
      </div>
      <input type="file" id="imp-f1" accept=".csv" style="display:none" onchange="onImpFile(event,1)">
    </div>
    <div style="margin-bottom:16px">
      <div class="section-label">◬ Mediciones (measurements.csv — opcional)</div>
      <div onclick="document.getElementById('imp-f2').click()"
        style="border:2px dashed var(--border2);border-radius:var(--rl);padding:16px;text-align:center;cursor:pointer;transition:border-color .1s"
        onmouseover="this.style.borderColor='var(--orange)'" onmouseout="this.style.borderColor='var(--border2)'">
        <div style="font-size:22px;margin-bottom:4px">📏</div>
        <div id="imp-lbl-2" style="font-size:12px;color:var(--ink3)">Toca para seleccionar measurements.csv</div>
      </div>
      <input type="file" id="imp-f2" accept=".csv" style="display:none" onchange="onImpFile(event,2)">
    </div>
    <button class="btn btn-p" id="imp-next-btn" onclick="impParsear()" disabled>
      Analizar CSV →
    </button>`;
}

function onImpFile(e,n){
  const f=e.target.files[0]; if(!f) return;
  impBuf['f'+n]=f;
  document.getElementById('imp-lbl-'+n).textContent='✓ '+f.name;
  document.getElementById('imp-lbl-'+n).style.color='var(--green)';
  if(n===1) document.getElementById('imp-next-btn').disabled=false;
}

// ── PASO 1: parsear sin guardar, mostrar revisión ──────────────
async function impParsear(){
  const btn=document.getElementById('imp-next-btn');
  btn.disabled=true; btn.textContent='⏳ Analizando…';

  const text = await new Promise(res=>{ const r=new FileReader(); r.onload=e=>res(e.target.result); r.readAsText(impBuf.f1,'UTF-8'); });
  const sesiones = parsearHevySinGuardar(text);

  if(!sesiones.length){
    btn.disabled=false; btn.textContent='Analizar CSV →';
    document.getElementById('imp-body').innerHTML+=`<div style="color:var(--red);font-size:12px;margin-top:8px">No se encontraron sesiones válidas.</div>`;
    return;
  }

  impSesRevisadas=sesiones;
  renderImpStep2();
}

// Parsear CSV y devolver array de sesiones para revisar (sin guardar)
function parsearHevySinGuardar(text){
  const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(l=>l.trim());
  if(lines.length<2) return[];
  const hdr=lines[0].split(',').map(h=>h.trim().replace(/"/g,'').toLowerCase());
  const mapa={};

  for(let i=1;i<lines.length;i++){
    const cols=parseCSV(lines[i]);
    const row={}; hdr.forEach((h,j)=>row[h]=(cols[j]||'').replace(/"/g,'').trim());
    const title  = row.title||row['workout name']||row.workout_name||'';
    const dateRaw= row.start_time||row['start time']||row.date||row.created_at||'';
    const exName = row.exercise_title||row['exercise title']||row['exercise name']||row.exercise_name||'';
    const weight = parseFloat(row.weight_kg||row.weight||0);
    const reps   = parseInt(row.reps||0);
    const elapsed= parseInt(row.duration_seconds||row.duration||row['duration (seconds)']||0);
    const ts     = parseHevyDate(dateRaw);
    if(!ts) continue;
    const key=title+'|'+ts;
    if(!mapa[key]) mapa[key]={
      id:'s_h'+Math.abs(key.split('').reduce((a,c)=>a+c.charCodeAt(0),0)+(ts%100000)),
      routineName:title||'Entrenamiento', date:ts, elapsed,
      exercises:{}, source:'hevy',
      // Para revisión:
      _rutinaId:'', _ignorar:false
    };
    if(exName&&!mapa[key].exercises[exName]) mapa[key].exercises[exName]={exName,sets:[]};
    if(exName&&(weight||reps)) mapa[key].exercises[exName].sets.push({weight,reps});
  }
  return Object.values(mapa).sort((a,b)=>a.date-b.date);
}

// ── PASO 2: pantalla de revisión ──────────────────────────────
function renderImpStep2(){
  document.getElementById('imp-title').textContent=`Revisar ${impSesRevisadas.length} sesiones`;
  const existingIds=new Set((forge.sessions||[]).map(s=>s.id));
  const rutinas=forge.routines||[];

  // Mapa de nombres similares conocidos → ejercicio canónico
  const NOMBRE_MAP=buildNombreMap();

  let html=`
    <div style="background:var(--bg3);border-left:3px solid var(--green);border-radius:var(--r);padding:10px 12px;margin-bottom:12px;font-size:12px;color:var(--ink2);line-height:1.6">
      Revisa cada sesión: <strong>asigna la rutina correcta</strong>, corrige fechas si es necesario, 
      marca "Ignorar" las que no quieras importar. Los ejercicios similares ya están agrupados automáticamente.
    </div>
    <div style="font-size:11px;color:var(--ink3);margin-bottom:10px">
      ${impSesRevisadas.length} sesiones · <span style="color:var(--green)">${impSesRevisadas.filter(s=>!existingIds.has(s.id)).length} nuevas</span> · 
      <span style="color:var(--ink3)">${impSesRevisadas.filter(s=>existingIds.has(s.id)).length} ya existen</span>
    </div>`;

  impSesRevisadas.forEach((s,idx)=>{
    const yaExiste=existingIds.has(s.id);
    const fechaStr=localDateStr(s.date);
    const durMin=Math.round((s.elapsed||0)/60);
    // Nombres de ejercicios con su mapeo
    const exHtml=Object.entries(s.exercises).map(([nombre,ex])=>{
      const canonico=NOMBRE_MAP[nombre.toLowerCase().trim()];
      const exForge=canonico?(forge.exercises||[]).find(e=>e.id===canonico):null;
      const match=exForge?`<span style="color:var(--green);font-size:10px"> → ${exForge.name}</span>`:'';
      return `<div style="font-size:11px;color:var(--ink2);padding:1px 0">${nombre}${match} <span style="color:var(--ink3)">(${ex.sets.length} series)</span></div>`;
    }).join('');

    html+=`
    <div id="imp-ses-${idx}" style="background:${yaExiste?'var(--bg3)':'var(--bg2)'};border:1px solid ${yaExiste?'var(--border2)':'var(--border)'};border-radius:var(--rl);margin-bottom:10px;overflow:hidden;${s._ignorar?'opacity:.4':''}">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;gap:8px">
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:700;color:var(--ink);margin-bottom:4px">${s.routineName}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <div style="display:grid;grid-template-columns:1fr 2fr 1fr;gap:4px;min-width:200px" id="dp-imp-${idx}">
              ${renderDatePicker('imp'+idx, fechaStr)}
            </div>
            <button onclick="impSesRevisadas[${idx}].date=new Date(getDatePickerValue('imp${idx}')+'T12:00:00').getTime();showToast('Fecha actualizada',1200,'ok')"
              style="background:var(--bg3);border:1px solid var(--border2);border-radius:5px;color:var(--orange);font-size:11px;font-weight:600;padding:4px 8px;cursor:pointer;white-space:nowrap">✓ Ok</button>
            <select onchange="impSesRevisadas[${idx}]._rutinaId=this.value"
              style="background:var(--bg4);border:1px solid var(--border2);border-radius:5px;color:${s._rutinaId?'var(--green)':'var(--ink3)'};padding:4px 8px;font-size:11px;cursor:pointer;max-width:160px">
              <option value="">Sin rutina</option>
              ${rutinas.map(r=>`<option value="${r.id}" ${s._rutinaId===r.id?'selected':''}>${r.name}</option>`).join('')}
            </select>
            <span style="font-size:10px;color:var(--ink3)">${durMin>0?durMin+'min':''}</span>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
          ${yaExiste?'<span style="font-size:9px;background:var(--border2);color:var(--ink3);padding:2px 6px;border-radius:4px">YA EXISTE</span>':''}
          <button onclick="impToggleIgnorar(${idx})"
            style="background:${s._ignorar?'var(--bg3)':'#1a0505'};border:1px solid ${s._ignorar?'var(--border2)':'var(--red)'};border-radius:5px;color:${s._ignorar?'var(--ink3)':'var(--red)'};font-size:10px;font-weight:700;padding:3px 8px;cursor:pointer">
            ${s._ignorar?'Incluir':'Ignorar'}
          </button>
        </div>
      </div>
      <div style="padding:0 14px 10px;border-top:1px solid var(--border)">
        ${exHtml}
      </div>
    </div>`;
  });

  const nImportar=impSesRevisadas.filter(s=>!s._ignorar).length;
  html+=`
    <div style="position:sticky;bottom:0;background:var(--bg2);padding:12px 0;border-top:1px solid var(--border);display:flex;gap:8px">
      <button class="btn btn-s" style="width:auto" onclick="renderImpStep1();document.getElementById('imp-title').textContent='Importar desde Hevy'">← Volver</button>
      <button class="btn btn-p" onclick="impConfirmar()" id="imp-confirmar-btn">
        ✓ Importar <span id="imp-n-btn">${nImportar}</span> sesiones
      </button>
    </div>`;

  document.getElementById('imp-body').innerHTML=html;
}

function impToggleIgnorar(idx){
  impSesRevisadas[idx]._ignorar=!impSesRevisadas[idx]._ignorar;
  const el=document.getElementById('imp-ses-'+idx);
  if(el) el.style.opacity=impSesRevisadas[idx]._ignorar?'0.35':'1';
  // Actualizar contador
  const n=impSesRevisadas.filter(s=>!s._ignorar).length;
  const nbtn=document.getElementById('imp-n-btn');
  if(nbtn) nbtn.textContent=n;
  // Cambiar texto del botón
  const btn=el?.querySelector('button[onclick*="impToggleIgnorar"]');
  if(btn){ btn.textContent=impSesRevisadas[idx]._ignorar?'Incluir':'Ignorar'; btn.style.color=impSesRevisadas[idx]._ignorar?'var(--ink3)':'var(--red)'; btn.style.borderColor=impSesRevisadas[idx]._ignorar?'var(--border2)':'var(--red)'; btn.style.background=impSesRevisadas[idx]._ignorar?'var(--bg3)':'#1a0505'; }
}

// Construir mapa nombre→id canónico (incluye FUSION_MAP + nombres alternativos)
function buildNombreMap(){
  const m={
    'press de banca (barra)':'ex_press_banca','press banca (barra)':'ex_press_banca',
    'press de banca inclinado (barra)':'ex_press_inclinado','press inclinado (barra)':'ex_press_inclinado',
    'remo pendlay (barra)':'ex_remo_barra','remo con barra':'ex_remo_barra',
    'press de hombros (barra)':'ex_press_hombros',
    'peso muerto (barra)':'ex_peso_muerto',
    'jalón al pecho (cable)':'ex_jalon_pecho','jalon al pecho (cable)':'ex_jalon_pecho',
    'sentadilla (barra)':'ex_sentadilla',
    'empuje de caderas (barra)':'ex_hip_thrust','hip thrust (barra)':'ex_hip_thrust',
    'trote':'ex_correr','trote semanal':'ex_correr','correr':'ex_correr',
    'running':'ex_correr','outdoor run':'ex_correr','outdoor running':'ex_correr',
    'treadmill running':'ex_correr','treadmill':'ex_correr','jogging':'ex_correr',
    'carrera':'ex_correr','carrera / trote':'ex_correr','correr / trote':'ex_correr',
  };
  // Agregar también ejercicios existentes por nombre exacto
  (forge.exercises||[]).forEach(e=>{ m[e.name.toLowerCase().trim()]=e.id; });
  return m;
}

// ── PASO 3: confirmar y guardar ───────────────────────────────
function impConfirmar(){
  const btn=document.getElementById('imp-confirmar-btn');
  btn.disabled=true; btn.textContent='⏳ Guardando…';

  const NOMBRE_MAP=buildNombreMap();
  const aImportar=impSesRevisadas.filter(s=>!s._ignorar);
  const existingIds=new Set((forge.sessions||[]).map(s=>s.id));
  let nuevas=0, exNuevos=0;

  aImportar.forEach(s=>{
    if(existingIds.has(s.id)) return; // ya existe, saltar

    // Convertir exercises de {nombre:{sets}} a array con exId
    const exercises=Object.entries(s.exercises).map(([nombre,ex])=>{
      const key=nombre.toLowerCase().trim();
      const canonId=NOMBRE_MAP[key];
      // Buscar o crear ejercicio
      let exObj=(forge.exercises||[]).find(e=>e.id===canonId||e.name.toLowerCase().trim()===key);
      if(!exObj){
        const isRun=['trote','correr','running','jogging','carrera'].some(k=>key.includes(k));
        exObj={id:'ex_h'+Date.now()+'_'+Math.random().toString(36).slice(2,6),
               name:nombre,type:isRun?'run':'barbell',muscle:'',restSec:isRun?0:90};
        forge.exercises.push(exObj);
        exNuevos++;
      }
      const isRun=exObj.type==='run'||exObj.type==='hiit';
      return {
        exId:exObj.id,
        sets:ex.sets.map(set=>isRun
          ? {type:'run',done:true,distance:'',time:'',fc:'',pasos:'',weight:0,reps:0}
          : {type:'weight',done:true,weight:set.weight,reps:set.reps,distance:'',time:'',fc:'',pasos:''})
      };
    });

    const totalVol=exercises.reduce((a,ex)=>a+ex.sets.filter(s=>!['run','hiit'].includes((forge.exercises||[]).find(e=>e.id===ex.exId)?.type)).reduce((b,s)=>b+(s.weight||0)*(s.reps||0),0),0);
    const sesion={
      id:s.id, routineId:s._rutinaId||null,
      routineName:s._rutinaId?(forge.routines||[]).find(r=>r.id===s._rutinaId)?.name||s.routineName:s.routineName,
      date:s.date, exercises, elapsed:s.elapsed||0,
      totalVolume:totalVol, source:'hevy'
    };
    if(!forge.sessions) forge.sessions=[];
    forge.sessions.push(sesion);
    existingIds.add(s.id);
    nuevas++;
  });

  forge.sessions.sort((a,b)=>a.date-b.date);
  saveDB();
  setTimeout(()=>syncCloud(),800);

  closeModal('modal-import');
  impReset();
  renderAll();
  showToast(`✓ ${nuevas} sesiones importadas · ${exNuevos} ejercicios nuevos`,3000,'ok');
}

// Mantener alias para compatibilidad
function runImport(){ impParsear(); }
function doneImp(log,btn){}

// Parsea fechas de Hevy que vienen en múltiples formatos:
// "2024 Jan 06, 09:15 AM", "2024-01-06 09:15:00", "2024-01-06T09:15:00", "Jan 06, 2024", etc.
function parseHevyDate(raw){
  if(!raw) return null;
  raw=raw.trim().replace(/"/g,'');

  // Formato ISO o similar: 2024-01-06... → directo
  if(/^\d{4}-\d{2}-\d{2}/.test(raw)){
    const d=new Date(raw.replace(' ','T'));
    if(!isNaN(d)) return d.getTime();
  }

  // Formato Hevy: "2024 Jan 06, 09:15 AM"
  const m1=raw.match(/^(\d{4})\s+(\w{3})\s+(\d{1,2}),?\s+(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if(m1){
    const months={jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
    const mo=months[m1[2].toLowerCase()];
    let h=parseInt(m1[4]), min=parseInt(m1[5]);
    if(m1[6]&&m1[6].toUpperCase()==='PM'&&h<12) h+=12;
    if(m1[6]&&m1[6].toUpperCase()==='AM'&&h===12) h=0;
    const d=new Date(parseInt(m1[1]),mo,parseInt(m1[3]),h,min);
    if(!isNaN(d)) return d.getTime();
  }

  // Formato "Jan 06, 2024" o "06 Jan 2024"
  const m2=raw.match(/(\w{3})\s+(\d{1,2}),?\s+(\d{4})/i);
  if(m2){
    const d=new Date(`${m2[1]} ${m2[2]} ${m2[3]}`);
    if(!isNaN(d)) return d.getTime();
  }

  // Último intento: new Date()
  const d=new Date(raw);
  return isNaN(d)?null:d.getTime();
}

function importSesCSV(text){
  const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(l=>l.trim());
  if(lines.length<2) return{new:0,exNew:0};
  const hdr=lines[0].split(',').map(h=>h.trim().replace(/"/g,'').toLowerCase());
  const sessions={}, exNew=new Set();
  let sinFecha=0;

  for(let i=1;i<lines.length;i++){
    const cols=parseCSV(lines[i]);
    const row={};
    hdr.forEach((h,j)=>row[h]=(cols[j]||'').replace(/"/g,'').trim());

    const title   = row.title||row['workout name']||row['workout_name']||'';
    const dateRaw = row.start_time||row['start time']||row.date||row.created_at||'';
    const exName  = row.exercise_title||row['exercise title']||row['exercise name']||row['exercise_name']||'';
    const weight  = parseFloat(row.weight_kg||row.weight||0);
    const reps    = parseInt(row.reps||0);
    const elapsed = parseInt(row.duration_seconds||row.duration||row['duration (seconds)'||0])||0;

    const ts = parseHevyDate(dateRaw);
    if(!ts){ sinFecha++; continue; } // saltar filas sin fecha parseable

    const key=title+'|'+ts;
    if(!sessions[key]){
      sessions[key]={
        id:'s_h'+Math.abs(key.split('').reduce((a,c)=>a+c.charCodeAt(0),0)+(ts%100000)),
        routineId:null, routineName:title||'Entrenamiento',
        date:ts, exercises:{}, elapsed, source:'hevy'
      };
    }

    if(exName&&!sessions[key].exercises[exName]){
      let ex=(forge.exercises||[]).find(e=>e.name.toLowerCase()===exName.toLowerCase());
      if(!ex){
        ex={id:'ex_h'+Date.now()+'_'+i,name:exName,type:'barbell',muscle:'',restSec:90};
        forge.exercises.push(ex);
        exNew.add(ex.id);
      }
      sessions[key].exercises[exName]={exId:ex.id,sets:[]};
    }
    if(exName&&(weight||reps)){
      sessions[key].exercises[exName].sets.push({type:'weight',done:true,weight,reps,distance:'',time:'',fc:'',pasos:''});
    }
  }

  const arr=Object.values(sessions).map(s=>({
    ...s,
    exercises:Object.values(s.exercises),
    totalVolume:Object.values(s.exercises).reduce((a,ex)=>a+ex.sets.reduce((b,st)=>b+(st.weight||0)*(st.reps||0),0),0)
  }));

  if(!forge.sessions) forge.sessions=[];
  const existingIds=new Set(forge.sessions.map(s=>s.id));
  const existingKeys=new Set(forge.sessions.map(s=>s.routineName+'|'+new Date(s.date).toDateString()));
  const newSes=arr.filter(s=>!existingIds.has(s.id)&&!existingKeys.has(s.routineName+'|'+new Date(s.date).toDateString()));
  forge.sessions.push(...newSes);
  forge.sessions.sort((a,b)=>a.date-b.date);

  return{new:newSes.length, exNew:exNew.size, sinFecha};
}
function importMedCSV(text){
  const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(l=>l.trim());
  if(lines.length<2) return{new:0};
  const hdr=lines[0].split(',').map(h=>h.trim().replace(/"/g,'').toLowerCase());
  if(!forge.bodyMetrics) forge.bodyMetrics=[];
  const existing=new Set(forge.bodyMetrics.map(m=>m.date));
  let n=0;
  for(let i=1;i<lines.length;i++){
    const cols=parseCSV(lines[i]); const row={}; hdr.forEach((h,j)=>row[h]=(cols[j]||'').replace(/"/g,'').trim());
    const fecha=(row.date||row.created_at||row.timestamp||'').split('T')[0].split(' ')[0];
    if(!fecha||existing.has(fecha)) continue;
    const peso=parseFloat(row.weight||row.body_weight||row.weight_kg||0);
    const grasa=parseFloat(row.body_fat||row.body_fat_percentage||0);
    if(!peso&&!grasa) continue;
    forge.bodyMetrics.push({date:fecha,peso:peso||null,grasa:grasa||null,muscular:null,imc:null,pliegues:{p6:null,p8:null}});
    existing.add(fecha); n++;
  }
  forge.bodyMetrics.sort((a,b)=>a.date.localeCompare(b.date));
  return{new:n};
}
function parseCSV(line){ const r=[]; let cur='',inQ=false; for(const ch of line){ if(ch==='"'){inQ=!inQ;}else if(ch===','&&!inQ){r.push(cur.trim());cur='';}else{cur+=ch;} } r.push(cur.trim()); return r; }

// ---------------------------------------------------------------
//  DATE PICKER — 3 selectores (día / mes / año)
// ---------------------------------------------------------------
const MESES=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function renderDatePicker(id, valorISO, opts){
  // valorISO: 'YYYY-MM-DD' o '' para hoy
  // opts: { minYear, maxYear } — opcional para controlar el rango
  const d = valorISO ? new Date(valorISO+'T12:00:00') : new Date();
  const dd = d.getDate(), mm = d.getMonth()+1, yy = d.getFullYear();
  const añoActual = new Date().getFullYear();

  // Rango de años: si se pasa opts.minYear lo usa; si el id contiene 'nac' usa 1950; si no, rango corto ±5
  const minYear = opts?.minYear ?? (id.includes('nac') ? 1950 : añoActual - 8);
  const maxYear = opts?.maxYear ?? añoActual;

  const dias = Array.from({length:31},(_,i)=>`<option value="${i+1}" ${dd===i+1?'selected':''}>${String(i+1).padStart(2,'0')}</option>`).join('');
  const meses = MESES.map((m,i)=>`<option value="${i+1}" ${mm===i+1?'selected':''}>${m}</option>`).join('');
  const años = Array.from({length: maxYear - minYear + 1},(_,i)=>{
    const y = maxYear - i; // descendente: año más reciente primero
    return `<option value="${y}" ${yy===y?'selected':''}>${y}</option>`;
  }).join('');

  return `<div class="dp-wrap" id="dp-${id}">
    <select class="dp-sel" id="dp-d-${id}">${dias}</select>
    <select class="dp-sel" id="dp-m-${id}">${meses}</select>
    <select class="dp-sel" id="dp-y-${id}">${años}</select>
  </div>`;
}

function getDatePickerValue(id){
  const d=document.getElementById('dp-d-'+id)?.value;
  const m=document.getElementById('dp-m-'+id)?.value;
  const y=document.getElementById('dp-y-'+id)?.value;
  if(!d||!m||!y) return today();
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

function setDatePickerValue(id, valorISO){
  if(!valorISO) return;
  const parts=valorISO.split('-');
  const y=parseInt(parts[0]),m=parseInt(parts[1]),d=parseInt(parts[2]);
  const sd=document.getElementById('dp-d-'+id);
  const sm=document.getElementById('dp-m-'+id);
  const sy=document.getElementById('dp-y-'+id);
  if(sd) sd.value=d;
  if(sm) sm.value=m;
  if(sy){
    // Si el año no existe en las opciones, agregarlo
    if(![...sy.options].find(o=>parseInt(o.value)===y)){
      sy.insertBefore(new Option(y,y),sy.firstChild);
    }
    sy.value=y;
  }
}

// ── Normalizar decimales: coma → punto en iOS ─────────────────
// ── Normalizar decimales: coma → punto, limpiar caracteres inválidos ──
function normDec(val){
  if(val===null||val===undefined) return '';
  return val.toString()
    .replace(/,/g,'.')           // todas las comas → punto
    .replace(/[^0-9.]/g,'')     // quitar todo excepto dígitos y punto
    .replace(/\.(?=.*\.)/g,''); // si hay múltiples puntos, dejar solo el último
}

// Listener global: interceptar coma en CUALQUIER input decimal o numérico
document.addEventListener('input', e=>{
  const el=e.target;
  const esDecimal=el.inputMode==='decimal'||el.dataset.dec;
  if(!esDecimal) return;
  const v=el.value;
  // Reemplazar coma por punto en tiempo real
  if(v.includes(',')){
    const pos=el.selectionStart;
    el.value=v.replace(/,/g,'.');
    try{ el.setSelectionRange(pos,pos); }catch(_){}
  }
}, {passive:true});

// También interceptar keypress de coma → punto (para teclados físicos y algunos Android)
document.addEventListener('keydown', e=>{
  const el=e.target;
  if((el.inputMode==='decimal'||el.dataset.dec) && e.key===','){
    e.preventDefault();
    const pos=el.selectionStart, end=el.selectionEnd;
    el.value=el.value.slice(0,pos)+'.'+el.value.slice(end);
    try{ el.setSelectionRange(pos+1,pos+1); }catch(_){}
    el.dispatchEvent(new Event('input',{bubbles:true}));
  }
}, {passive:false});

// ---------------------------------------------------------------
loadDB();
// =============================================================
//  SISTEMA GENÉRICO DE GRÁFICOS MELQART v123
//  renderMetricChart(config)  — un solo componente para todo
// =============================================================

// -------------------------------------------------------------
//  HELPERS UTILITARIOS
// -------------------------------------------------------------

/** Convierte "6:54" → 6.9 (decimal para graficar) */
function paceToDecimal(pace) {
  if (typeof pace === 'number') return pace;
  const parts = String(pace).split(':');
  const minutes = parseInt(parts[0]) || 0;
  const seconds = parseInt(parts[1]) || 0;
  return minutes + seconds / 60;
}

/** Convierte 6.9 → "6:54" (para mostrar) */
function decimalToPace(value) {
  if (!value || isNaN(value)) return '—';
  const minutes = Math.floor(value);
  const seconds = Math.round((value - minutes) * 60);
  if (seconds === 60) return `${minutes + 1}:00`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Detecta si un peso fue en máquina Smith (termina en .9 o equipment="smith") */
function detectSmith(value, equipment) {
  if (equipment) return String(equipment).toLowerCase() === 'smith';
  return String(value).endsWith('.9');
}

/** Calcula volumen total: peso × reps × series */
function calculateVolume(weight, reps, sets) {
  if (!weight || !reps || !sets) return null;
  return weight * reps * sets;
}

/** Formatea un valor según su tipo para mostrar al usuario */
function formatMetricValue(value, type, unit) {
  if (value === null || value === undefined || isNaN(value)) return '—';
  if (type === 'pace')         return `${decimalToPace(value)} ${unit || 'min/km'}`;
  if (type === 'percentage')   return `${Math.round(value)}%`;
  if (type === 'weight')       return `${parseFloat(value).toFixed(1)} ${unit || 'kg'}`;
  if (type === 'body_measure') return `${parseFloat(value).toFixed(1)} ${unit || 'cm'}`;
  if (type === 'volume')       return `${fmtMiles(value)} ${unit || 'kg'}`;
  if (type === 'distance')     return `${parseFloat(value).toFixed(2)} ${unit || 'km'}`;
  if (type === 'time')         return `${Math.round(value)} ${unit || 'min'}`;
  if (type === 'reps')         return `${Math.round(value)} ${unit || 'reps'}`;
  if (type === 'heartrate')    return `${Math.round(value)} ${unit || 'bpm'}`;
  return `${value} ${unit || ''}`.trim();
}

/** Formatea el tick del eje Y según tipo */
function formatAxisTick(value, type, unit) {
  if (type === 'pace')         return decimalToPace(value);
  if (type === 'percentage')   return `${Math.round(value)}%`;
  if (type === 'weight')       return `${Math.round(value*10)/10}`;
  if (type === 'body_measure') return `${Math.round(value*10)/10} ${unit||'cm'}`;
  if (type === 'volume')       return `${Math.round(value/1000*10)/10}k`;
  if (type === 'distance')     return `${Math.round(value*10)/10}`;
  if (type === 'heartrate')    return `${Math.round(value)}`;
  if (type === 'reps')         return `${Math.round(value)}`;
  return `${Math.round(value*10)/10}`;
}

/** Calcula dominio dinámico del eje Y con padding */
function calculateYAxisDomain(values, options) {
  options = options || {};
  const valid = values.filter(v => typeof v === 'number' && !isNaN(v));
  if (!valid.length) return [0, 1];
  const minV = Math.min(...valid);
  const maxV = Math.max(...valid);
  const paddingRatio = options.paddingRatio !== undefined ? options.paddingRatio : 0.12;
  const range = maxV - minV || maxV || 1;
  const padding = range * paddingRatio;
  let min = options.forceZero ? 0 : minV - padding;
  let max = maxV + padding;
  if (options.min !== undefined) min = options.min;
  if (options.max !== undefined) max = options.max;
  return [min, max];
}

/** Aplica filtro de tiempo a un array de puntos con campo `date` (YYYY-MM-DD) */
function applyTimeFilter(data, range) {
  if (!range || range === 'all') return data;
  const now = new Date();
  let cutoff;
  if (range === '7d')  { cutoff = new Date(now); cutoff.setDate(now.getDate() - 7); }
  else if (range === '30d')  { cutoff = new Date(now); cutoff.setDate(now.getDate() - 30); }
  else if (range === '3m')   { cutoff = new Date(now); cutoff.setMonth(now.getMonth() - 3); }
  else if (range === '6m')   { cutoff = new Date(now); cutoff.setMonth(now.getMonth() - 6); }
  else if (range === '12m')  { cutoff = new Date(now); cutoff.setFullYear(now.getFullYear() - 1); }
  else if (/^\d{4}$/.test(range)) { // año específico ej "2026"
    return data.filter(p => String(p.date || '').startsWith(range));
  }
  else return data;
  const cutoffStr = localDateStr(cutoff);
  return data.filter(p => (p.date || '') >= cutoffStr);
}

/** Normaliza array de puntos: asegura campo `value` numérico */
function normalizeChartData(data, type) {
  return (data || []).map(p => {
    let v = p.value;
    if (type === 'pace' && typeof p.rawValue === 'string') {
      v = paceToDecimal(p.rawValue);
    } else if (typeof v === 'string') {
      // Intentar parsear string a número
      v = parseFloat(v.replace(',', '.'));
    }
    return { ...p, value: isNaN(v) ? null : v };
  }).filter(p => p.value !== null);
}

// -------------------------------------------------------------
//  GENERADORES DE CONFIGURACIÓN
// -------------------------------------------------------------

/** Genera config para gráfico de carga de un ejercicio */
function createExerciseWeightChart(exerciseName, sessions, exerciseId) {
  const data = [];
  (sessions || []).sort((a, b) => a.date - b.date).forEach(s => {
    const ex = (s.exercises || []).find(x => exerciseId ? x.exId === exerciseId : x.name === exerciseName);
    if (!ex) return;
    const sets = (ex.sets || []).filter(st => st.done && parseFloat(st.weight) > 0);
    if (!sets.length) return;
    const best = sets.sort((a, b) => parseFloat(b.weight) - parseFloat(a.weight))[0];
    const w = parseFloat(best.weight);
    data.push({
      date: localDateStr(s.date),
      label: localDateStr(s.date).slice(5).replace('-', '/'),
      value: w,
      reps: best.reps || 0,
      sets: sets.length,
      equipment: detectSmith(w) ? 'Smith' : 'Barra',
      displayValue: `${w} kg × ${best.reps || '?'}`
    });
  });
  return {
    id: `ex_weight_${exerciseId || exerciseName}`,
    title: exerciseName,
    subtitle: 'Mejor carga por sesión',
    unitLabel: 'kg / sesión',
    type: 'weight', unit: 'kg',
    data,
    yAxis: { auto: true, forceZero: false },
    tooltip: { showDate: true, showReps: true, showSets: true, showEquipment: true }
  };
}

/** Genera config para gráfico de volumen de un ejercicio */
function createExerciseVolumeChart(exerciseName, sessions, exerciseId) {
  const data = [];
  (sessions || []).sort((a, b) => a.date - b.date).forEach(s => {
    const ex = (s.exercises || []).find(x => exerciseId ? x.exId === exerciseId : x.name === exerciseName);
    if (!ex) return;
    const sets = (ex.sets || []).filter(st => st.done && parseFloat(st.weight) > 0 && parseInt(st.reps) > 0);
    if (!sets.length) return;
    const vol = sets.reduce((acc, st) => acc + parseFloat(st.weight) * parseInt(st.reps), 0);
    data.push({
      date: localDateStr(s.date),
      label: localDateStr(s.date).slice(5).replace('-', '/'),
      value: vol,
      displayValue: `${fmtMiles(Math.round(vol))} kg`
    });
  });
  return {
    id: `ex_vol_${exerciseId || exerciseName}`,
    title: exerciseName,
    subtitle: 'Volumen total por sesión',
    unitLabel: 'kg totales',
    type: 'volume', unit: 'kg',
    data,
    yAxis: { auto: true, forceZero: true }
  };
}

/** Genera config para gráfico de medida corporal */
function createBodyMeasureChart(measureId, measureName, measurements) {
  const data = (measurements || [])
    .filter(m => m[measureId] != null && m[measureId] !== '')
    .map(m => ({
      date: m.date,
      label: String(m.date).slice(5).replace('-', '/'),
      value: parseFloat(m[measureId]),
      displayValue: `${parseFloat(m[measureId]).toFixed(1)} cm`
    }));
  return {
    id: `body_${measureId}`,
    title: measureName,
    subtitle: 'Medida corporal',
    unitLabel: 'cm',
    type: 'body_measure', unit: 'cm',
    data,
    yAxis: { auto: true, forceZero: false }
  };
}

/** Genera config para gráfico de peso corporal */
function createBodyWeightChart(measurements) {
  const data = (measurements || [])
    .filter(m => m.peso != null && m.peso !== '')
    .map(m => ({
      date: m.date,
      label: String(m.date).slice(5).replace('-', '/'),
      value: parseFloat(m.peso),
      displayValue: `${parseFloat(m.peso).toFixed(1)} kg`
    }));
  return {
    id: 'body_weight',
    title: 'Peso corporal',
    subtitle: 'Evolución del peso',
    unitLabel: 'kg',
    type: 'weight', unit: 'kg',
    data,
    yAxis: { auto: true, forceZero: false }
  };
}

/** Genera config para gráfico de ritmo (carrera) */
function createPaceChart(runningSessions) {
  const data = (runningSessions || [])
    .filter(s => s.ritmo > 0)
    .map(s => ({
      date: s.fecha,
      label: String(s.fecha).slice(5).replace('-', '/'),
      value: s.ritmo,
      rawValue: `${Math.floor(s.ritmo)}:${String(Math.round((s.ritmo % 1) * 60)).padStart(2, '0')}`,
      displayValue: `${decimalToPace(s.ritmo)} min/km`
    }));
  return {
    id: 'run_pace',
    title: 'Ritmo promedio',
    subtitle: 'Evolución por sesión',
    unitLabel: 'min/km',
    type: 'pace', unit: 'min/km',
    data,
    yAxis: { auto: true, forceZero: false, invertY: false }
  };
}

/** Genera config para gráfico de distancia (carrera) */
function createDistanceChart(runningSessions) {
  const data = (runningSessions || [])
    .filter(s => s.totalDist > 0)
    .map(s => ({
      date: s.fecha,
      label: String(s.fecha).slice(5).replace('-', '/'),
      value: s.totalDist,
      displayValue: `${s.totalDist.toFixed(2)} km`
    }));
  return {
    id: 'run_distance',
    title: 'Distancia',
    subtitle: 'Por sesión de carrera',
    unitLabel: 'km',
    type: 'distance', unit: 'km',
    data,
    yAxis: { auto: true, forceZero: true }
  };
}

// -------------------------------------------------------------
//  AGRUPACIONES
// -------------------------------------------------------------

function groupByWeek(data) {
  const map = {};
  data.forEach(p => {
    const d = new Date(p.date);
    // Lunes de la semana
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1 - day);
    const mon = new Date(d); mon.setDate(d.getDate() + diff);
    const key = localDateStr(mon);
    if (!map[key]) map[key] = { date: key, label: key.slice(5).replace('-', '/'), points: [] };
    map[key].points.push(p);
  });
  return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
}

function groupByMonth(data) {
  const map = {};
  data.forEach(p => {
    const key = String(p.date).slice(0, 7);
    if (!map[key]) map[key] = { date: key + '-01', label: key.slice(5), points: [] };
    map[key].points.push(p);
  });
  return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
}

// -------------------------------------------------------------
//  COMPONENTE PRINCIPAL: renderMetricChart(config)
//
//  Retorna un string HTML con la tarjeta de gráfico completa.
//  config = {
//    id, title, subtitle, unitLabel,
//    type, unit,
//    data: [{date, label, value, displayValue, ...}],
//    yAxis: {auto, forceZero, invertY, paddingRatio},
//    tooltip: {showDate, showReps, showSets, showEquipment, showNotes},
//    filters: ['30d','3m','6m','12m','all'],  // opciones a mostrar
//    activeFilter: '12m',                     // filtro activo actual
//    onFilter: 'miFunc',                      // nombre de fn JS a llamar con nuevo filtro
//    height: 200,                             // alto del SVG (default 220)
//    color: '#A4713A',                        // color línea (default --orange)
//    areaOpacity: 0.12
//  }
// -------------------------------------------------------------

function renderMetricChart(config) {
  const {
    id = 'chart_' + Date.now(),
    title = '',
    subtitle = '',
    unitLabel = '',
    type = 'weight',
    unit = '',
    yAxis = {},
    tooltip = {},
    filters,
    activeFilter,
    onFilter,
    height: H = 220,
    color = 'var(--orange)',
    areaOpacity = 0.12
  } = config;

  // Normalizar datos
  const allData = normalizeChartData(config.data, type);

  // Aplicar filtro de tiempo
  const range = activeFilter || 'all';
  const data = applyTimeFilter(allData, range);

  // ── Cabecera de la tarjeta ────────────────────────────────
  const headerHtml = `
    <div class="mq-chart-header">
      <div>
        <div class="mq-chart-title">${title}</div>
        ${subtitle ? `<div class="mq-chart-subtitle">${subtitle}</div>` : ''}
      </div>
      <div class="mq-chart-unit">${unitLabel}</div>
    </div>`;

  // ── Botones de filtro ─────────────────────────────────────
  let filtersHtml = '';
  if (filters && filters.length && onFilter) {
    const labels = { '7d':'7d', '30d':'30d', '3m':'3m', '6m':'6m', '12m':'12m', 'all':'Todo' };
    filtersHtml = `<div class="mq-chart-filters">` +
      filters.map(f =>
        `<button class="mq-chart-filter-btn${f === range ? ' on' : ''}" onclick="${onFilter}('${f}')">${labels[f] || f}</button>`
      ).join('') +
      `</div>`;
  }

  // ── Estado vacío ──────────────────────────────────────────
  if (!data || data.length < 2) {
    return `
      <div class="mq-chart-card" id="${id}">
        ${headerHtml}
        ${filtersHtml}
        <div class="mq-chart-empty">
          <div class="mq-chart-empty-icon">📈</div>
          <div class="mq-chart-empty-text">Pocos datos en este período</div>
          <div class="mq-chart-empty-sub">Registra al menos 2 sesiones para ver tendencia</div>
        </div>
      </div>`;
  }

  // ── Cálculo del gráfico SVG ───────────────────────────────
  // PL más ancho para tipos con etiquetas más largas en el eje Y
  const PL = (type === 'body_measure' || type === 'heartrate' || type === 'reps') ? 58 : 46;
  const PB = 26, PT = 10, PR = 8;
  const n = data.length;
  const minPxPerPoint = n > 40 ? 6 : n > 20 ? 8 : 12;
  const W = Math.max(320, PL + PR + n * minPxPerPoint);

  const vals = data.map(p => p.value);
  const invertY = false; // v179: no invertir escalas; mayor arriba, menor abajo
  const [domMin, domMax] = calculateYAxisDomain(vals, yAxis);

  function toX(i) {
    return PL + (i / (n - 1 || 1)) * (W - PL - PR);
  }
  function toY(v) {
    const ratio = (domMax - domMin) > 0 ? (v - domMin) / (domMax - domMin) : 0.5;
    const normalized = invertY ? ratio : 1 - ratio;
    return PT + normalized * (H - PT - PB);
  }

  const xs = data.map((_, i) => toX(i));
  const ys = data.map(p => toY(p.value));

  // Línea suavizada (sin Bezier, pero aproximada con puntos intermedios)
  const linePath = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  const areaPath = linePath +
    ` L${xs[n-1].toFixed(1)},${(H - PB).toFixed(1)}` +
    ` L${xs[0].toFixed(1)},${(H - PB).toFixed(1)} Z`;

  // Etiquetas Y — 4 ticks
  const tickCount = 4;
  const yTicksHtml = Array.from({ length: tickCount + 1 }, (_, i) => {
    const v = domMin + (domMax - domMin) * (i / tickCount);
    const y = toY(v);
    const label = formatAxisTick(v, type, unit);
    return `<text x="${PL - 4}" y="${y.toFixed(1)}" text-anchor="end" dominant-baseline="middle" fill="var(--ink3)" font-size="9">${label}</text>
      <line x1="${PL}" y1="${y.toFixed(1)}" x2="${W - PR}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-width="1" stroke-dasharray="3,3"/>`;
  }).join('');

  // Etiquetas X — solo si hay pocos puntos (≤12), sino quitar para no apretar
  const xTicksHtml = n <= 12
    ? data.map((p, i) => {
        const xStep = Math.max(1, Math.floor(n / 6));
        if (i % xStep !== 0 && i !== n - 1) return '';
        return `<text x="${xs[i].toFixed(1)}" y="${H - 2}" text-anchor="middle" fill="var(--ink3)" font-size="9">${p.label}</text>`;
      }).join('')
    : ''; // Con muchos puntos: solo tooltips, sin fechas en el eje

  // Puntos (dots) — con datos para tooltip via data-* attrs
  const dotR = n > 40 ? 2 : n > 20 ? 3 : 4;
  const dotsHtml = data.map((p, i) => {
    const isSmithPoint = p.equipment ? detectSmith(p.value, p.equipment) : detectSmith(p.value);
    const ttMain = p.displayValue || formatMetricValue(p.value, type, unit);
    const ttSub = [
      tooltip.showReps && p.reps ? `${p.sets || '?'}×${p.reps} reps` : '',
      tooltip.showEquipment && isSmithPoint ? 'Smith' : (tooltip.showEquipment && p.equipment ? p.equipment : ''),
      tooltip.showNotes && p.notes ? p.notes : ''
    ].filter(Boolean).join(' · ');
    const safeDate = p.date || '';
    const safeMain = ttMain.replace(/"/g, '&quot;');
    const safeSub  = ttSub.replace(/"/g, '&quot;');
    return `<circle
      cx="${xs[i].toFixed(1)}" cy="${ys[i].toFixed(1)}" r="${dotR}"
      fill="${isSmithPoint && n < 60 ? 'var(--green)' : color}"
      stroke="var(--bg2)" stroke-width="1.5"
      style="cursor:pointer"
      onmouseenter="mqChartTooltipShow(event,'${safeDate}','${safeMain}','${safeSub}')"
      onmouseleave="mqChartTooltipHide()"
      ontouchstart="mqChartTooltipShow(event,'${safeDate}','${safeMain}','${safeSub}')"
      ontouchend="mqChartTooltipHide()">
    </circle>`;
  }).join('');

  const svgHtml = `
    <div class="mq-chart-svg-wrap" style="overflow-x:${n > 20 ? 'auto' : 'hidden'}">
      <svg width="${n > 20 ? W : '100%'}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block">
        <defs>
          <linearGradient id="mq_area_grad_${id.replace(/[^a-z0-9]/gi,'_')}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${color}" stop-opacity="${areaOpacity * 2}"/>
            <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
          </linearGradient>
        </defs>
        ${yTicksHtml}
        ${xTicksHtml}
        <path d="${areaPath}" fill="url(#mq_area_grad_${id.replace(/[^a-z0-9]/gi,'_')})"/>
        <path d="${linePath}" stroke="${color}" stroke-width="2.5" fill="none" stroke-linejoin="round" stroke-linecap="round"/>
        ${dotsHtml}
      </svg>
    </div>`;

  return `
    <div class="mq-chart-card" id="${id}">
      ${headerHtml}
      ${svgHtml}
      ${filtersHtml}
    </div>`;
}

// -------------------------------------------------------------
//  TOOLTIP GLOBAL (hover/touch sobre puntos del gráfico)
// -------------------------------------------------------------

(function setupChartTooltip() {
  if (document.getElementById('mq-chart-tooltip')) return;
  const el = document.createElement('div');
  el.id = 'mq-chart-tooltip';
  el.className = 'mq-chart-tooltip';
  document.body.appendChild(el);
})();

function mqChartTooltipShow(evt, date, main, sub) {
  const el = document.getElementById('mq-chart-tooltip');
  if (!el) return;
  el.innerHTML = `
    ${date ? `<div class="mq-chart-tooltip-date">${date}</div>` : ''}
    <div class="mq-chart-tooltip-main">${main}</div>
    ${sub ? `<div class="mq-chart-tooltip-sub">${sub}</div>` : ''}`;
  el.classList.add('visible');

  // Posicionar
  const touch = evt.touches && evt.touches[0];
  const x = touch ? touch.clientX : evt.clientX;
  const y = touch ? touch.clientY : evt.clientY;
  const W = window.innerWidth, H = window.innerHeight;
  let left = x + 12, top = y - 40;
  if (left + 200 > W) left = x - 212;
  if (top < 0) top = y + 12;
  if (top + 90 > H) top = H - 95;
  el.style.left = left + 'px';
  el.style.top  = top  + 'px';
}

function mqChartTooltipHide() {
  const el = document.getElementById('mq-chart-tooltip');
  if (el) el.classList.remove('visible');
}

// Ocultar tooltip al hacer scroll
document.addEventListener('scroll', mqChartTooltipHide, { passive: true, capture: true });

// =============================================================
//  INTEGRACIÓN: reemplaza gráficos del tab Progreso
//  con el nuevo sistema renderMetricChart()
// =============================================================

/**
 * Versión mejorada de renderExDetail que usa renderMetricChart()
 * Llamada internamente por renderExDetail() para el bloque de gráficos
 */
function buildExDetailCharts(puntos, isRun, exId, filtroSel) {
  // puntos: [{fecha, val, label, valDist?, valRitmo?}]
  const años = [...new Set(puntos.map(p => p.fecha.slice(0, 4)))].sort().reverse();
  const hoy12m = new Date(); hoy12m.setFullYear(hoy12m.getFullYear() - 1);
  const corte12m = localDateStr(hoy12m);

  const puntosGraf = (() => {
    if (filtroSel === 'todo') return puntos;
    if (filtroSel === '12m')  return puntos.filter(p => p.fecha >= corte12m);
    return puntos.filter(p => p.fecha.startsWith(filtroSel));
  })();

  if (puntosGraf.length < 2) {
    return `<div class="mq-chart-card">
      <div class="mq-chart-empty">
        <div class="mq-chart-empty-icon">📈</div>
        <div class="mq-chart-empty-text">Pocos datos en este período</div>
        <div class="mq-chart-empty-sub">Prueba "Todo" para ver el historial completo</div>
      </div>
    </div>`;
  }

  if (isRun) {
    const distData = puntosGraf
      .filter(p => p.valDist > 0)
      .map(p => ({ date: p.fecha, label: p.fecha.slice(5).replace('-', '/'), value: p.valDist, displayValue: `${p.valDist.toFixed(2)} km` }));
    const ritmoData = puntosGraf
      .filter(p => p.valRitmo > 0)
      .map(p => ({ date: p.fecha, label: p.fecha.slice(5).replace('-', '/'), value: p.valRitmo, displayValue: `${decimalToPace(p.valRitmo)} min/km` }));

    let html = renderMetricChart({
      id: `ex_dist_${exId}_${filtroSel}`,
      title: 'Distancia', unitLabel: 'km',
      type: 'distance', unit: 'km',
      data: distData,
      yAxis: { forceZero: true },
      tooltip: { showDate: true },
      height: 180, color: 'var(--green)'
    });
    if (ritmoData.length >= 2) {
      html += renderMetricChart({
        id: `ex_ritmo_${exId}_${filtroSel}`,
        title: 'Ritmo promedio',
        subtitle: 'Evolución del ritmo',
        unitLabel: 'min/km',
        type: 'pace', unit: 'min/km',
        data: ritmoData,
        yAxis: { invertY: false, forceZero: false },
        tooltip: { showDate: true },
        height: 180, color: 'var(--blue)'
      });
    }
    return html;
  } else {
    // Fuerza
    const isPeso1RM = puntos[0] && puntos[0].label && String(puntos[0].label).includes('1RM');
    const wData = puntosGraf.map(p => ({
      date: p.fecha,
      label: p.fecha.slice(5).replace('-', '/'),
      value: p.val,
      displayValue: p.label || formatMetricValue(p.val, 'weight', 'kg'),
      equipment: detectSmith(p.val) ? 'Smith' : undefined
    }));
    return renderMetricChart({
      id: `ex_weight_${exId}_${filtroSel}`,
      title: isPeso1RM ? '1RM estimado' : 'Peso máx. levantado',
      unitLabel: isPeso1RM ? 'kg 1RM' : 'kg / sesión',
      type: 'weight', unit: 'kg',
      data: wData,
      yAxis: { forceZero: false },
      tooltip: { showDate: true, showEquipment: true },
      height: 220, color: 'var(--orange)'
    });
  }
}

/**
 * Versión mejorada de gráfico corporal que usa renderMetricChart()
 * Sustituye a renderLineChartFull() en openCuerpoChart()
 */
// pts: [{fecha, val, label}] — ya filtrados por el caller (openCuerpoChart)
function buildCuerpoChartHtml(pts, metricKey, unit, color, filtroSel) {
  const data = pts.map(p => ({
    date: p.fecha,
    label: p.fecha.slice(5).replace('-', '/'),
    value: p.val,
    displayValue: p.label
  }));
  const chartType = unit === '%' ? 'percentage' : 'weight';
  return renderMetricChart({
    id: `cuerpo_${metricKey}_${filtroSel}`,
    type: chartType,
    unit,
    unitLabel: unit || '',
    data,
    yAxis: { forceZero: false, paddingRatio: 0.08 },
    tooltip: { showDate: true },
    height: 220,
    color
  });
}

// =============================================================
//  FIN SISTEMA DE GRÁFICOS MELQART v123
// =============================================================

/* =============================================================
   MELQART v171 — Antropometría completa
   Lee bodyMetrics/anthropometry, deduplica por fecha, grafica
   composición, pliegues, perímetros y somatotipo. No toca Home.
============================================================= */
(function(){
  const ANTRO_METRICS = {
    composicion: [
      { key:'peso', label:'Peso', unit:'kg', color:'var(--p)', path:'peso' },
      { key:'grasaPct', label:'Grasa corporal', unit:'%', color:'var(--warn)', paths:['grasaPct','grasa'] },
      { key:'grasaKg', label:'Masa grasa', unit:'kg', color:'var(--warn)', path:'grasaKg' },
      { key:'muscularPct', label:'Masa muscular %', unit:'%', color:'var(--teal)', path:'muscularPct' },
      { key:'muscularKg', label:'Masa muscular kg', unit:'kg', color:'var(--teal)', paths:['muscularKg','muscular'] },
      { key:'imc', label:'IMC', unit:'', color:'var(--gold)', path:'imc' },
      { key:'ratioCinturaCadera', label:'Ratio cintura-cadera', unit:'', color:'var(--orange)', path:'ratioCinturaCadera' }
    ],
    pliegues: [
      { key:'suma6Pliegues', label:'Suma 6 pliegues', unit:'mm', color:'var(--p)', paths:['suma6Pliegues','pliegues.p6'] },
      { key:'suma8Pliegues', label:'Suma 8 pliegues', unit:'mm', color:'var(--p)', paths:['suma8Pliegues','pliegues.p8'] },
      { key:'triceps', label:'Tríceps', unit:'mm', color:'var(--p)', path:'pliegues.triceps' },
      { key:'subescapular', label:'Subescapular', unit:'mm', color:'var(--p)', path:'pliegues.subescapular' },
      { key:'supraespinal', label:'Supraespinal', unit:'mm', color:'var(--p)', path:'pliegues.supraespinal' },
      { key:'abdominal', label:'Abdominal', unit:'mm', color:'var(--p)', path:'pliegues.abdominal' },
      { key:'muslo', label:'Muslo', unit:'mm', color:'var(--p)', path:'pliegues.muslo' },
      { key:'pantorrilla', label:'Pantorrilla', unit:'mm', color:'var(--p)', path:'pliegues.pantorrilla' },
      { key:'biceps', label:'Bíceps', unit:'mm', color:'var(--p)', path:'pliegues.biceps' },
      { key:'crestaIliaca', label:'Cresta ilíaca', unit:'mm', color:'var(--p)', path:'pliegues.crestaIliaca' }
    ],
    perimetros: [
      { key:'brazoRelajado', label:'Brazo relajado', unit:'cm', color:'var(--teal)', path:'perimetros.brazoRelajado' },
      { key:'brazoFlexTension', label:'Brazo flex tensión', unit:'cm', color:'var(--teal)', path:'perimetros.brazoFlexTension' },
      { key:'cinturaMinima', label:'Cintura mínima', unit:'cm', color:'var(--teal)', path:'perimetros.cinturaMinima' },
      { key:'caderaMaxima', label:'Cadera máxima', unit:'cm', color:'var(--teal)', path:'perimetros.caderaMaxima' },
      { key:'musloMedial', label:'Muslo medial', unit:'cm', color:'var(--teal)', path:'perimetros.musloMedial' },
      { key:'pantorrillaMaxima', label:'Pantorrilla máxima', unit:'cm', color:'var(--teal)', path:'perimetros.pantorrillaMaxima' }
    ],
    somatotipo: [
      { key:'endo', label:'Endomorfía', unit:'', color:'var(--warn)', path:'somatotipo.endo' },
      { key:'meso', label:'Mesomorfía', unit:'', color:'var(--teal)', path:'somatotipo.meso' },
      { key:'ecto', label:'Ectomorfía', unit:'', color:'var(--gold)', path:'somatotipo.ecto' }
    ]
  };
  window.ANTRO_METRICS = ANTRO_METRICS;


  // v175 — serie histórica oficial de informes antropométricos.
  // Se usa como migración segura: una fecha = un registro, sin duplicados.
  // Si el usuario ya tenía un registro incompleto para esa fecha, estos campos oficiales lo completan/corrigen.
  const ANTRO_HISTORICAL_RECORDS = [
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
  ];
  window.ANTRO_HISTORICAL_RECORDS = ANTRO_HISTORICAL_RECORDS;

  function numOrNull(v){
    if(v===null || v===undefined || v==='') return null;
    const n = parseFloat(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  function getPath(obj, path){
    if(!obj || !path) return null;
    return String(path).split('.').reduce((acc,k)=>acc && acc[k]!==undefined ? acc[k] : null, obj);
  }
  function metricVal(m, cfg){
    const paths = cfg.paths || [cfg.path || cfg.key];
    for(const p of paths){
      const v = numOrNull(getPath(m,p));
      if(v!==null) return v;
    }
    return null;
  }
  function round1(v){ return Math.round(v*10)/10; }
  function mergeDeepMissing(target, src){
    if(!src || typeof src!=='object') return target;
    Object.keys(src).forEach(k=>{
      const sv=src[k];
      if(sv && typeof sv==='object' && !Array.isArray(sv)){
        if(!target[k] || typeof target[k]!=='object') target[k]={};
        mergeDeepMissing(target[k], sv);
      }else if((target[k]===undefined || target[k]===null || target[k]==='') && sv!==undefined && sv!==null && sv!==''){
        target[k]=sv;
      }
    });
    return target;
  }
  function normalizeAnthroRecord(m){
    const r = JSON.parse(JSON.stringify(m||{}));
    if(!r.date && r.fecha) r.date = r.fecha;
    if(!r.date) return null;
    if(!r.pliegues) r.pliegues={};
    if(!r.perimetros) r.perimetros={};
    if(!r.somatotipo) r.somatotipo={};

    if(r.suma6Pliegues==null && r.pliegues.p6!=null) r.suma6Pliegues = r.pliegues.p6;
    if(r.suma8Pliegues==null && r.pliegues.p8!=null) r.suma8Pliegues = r.pliegues.p8;
    if(r.pliegues.p6==null && r.suma6Pliegues!=null) r.pliegues.p6 = r.suma6Pliegues;
    if(r.pliegues.p8==null && r.suma8Pliegues!=null) r.pliegues.p8 = r.suma8Pliegues;

    if(r.grasaPct==null && r.grasa!=null) r.grasaPct = r.grasa;
    if(r.grasa==null && r.grasaPct!=null) r.grasa = r.grasaPct;
    if(r.muscularKg==null && r.muscular!=null) r.muscularKg = r.muscular;
    if(r.muscular==null && r.muscularKg!=null) r.muscular = r.muscularKg;

    ['peso','estatura','grasa','grasaPct','grasaKg','muscular','muscularPct','muscularKg','imc','ratioCinturaCadera','suma6Pliegues','suma8Pliegues'].forEach(k=>{
      const n = numOrNull(r[k]); if(n!==null) r[k]=n;
    });
    ['p6','p8','triceps','subescapular','supraespinal','abdominal','muslo','pantorrilla','biceps','crestaIliaca'].forEach(k=>{
      const n = numOrNull(r.pliegues[k]); if(n!==null) r.pliegues[k]=n;
    });
    ['brazoRelajado','brazoFlexTension','cinturaMinima','caderaMaxima','musloMedial','pantorrillaMaxima'].forEach(k=>{
      const n = numOrNull(r.perimetros[k]); if(n!==null) r.perimetros[k]=n;
    });
    ['endo','meso','ecto'].forEach(k=>{
      const n = numOrNull(r.somatotipo[k]); if(n!==null) r.somatotipo[k]=n;
    });
    if(!r.source) r.source='antropometria';
    return r;
  }

  function mergeAnthroRecord(base, incoming, preferIncoming=false){
    const out = JSON.parse(JSON.stringify(base || {}));
    const inc = JSON.parse(JSON.stringify(incoming || {}));
    const scalarKeys = ['date','edad','peso','estatura','grasa','grasaPct','grasaKg','muscular','muscularPct','muscularKg','imc','ratioCinturaCadera','suma6Pliegues','suma8Pliegues','anthropometry','tipo','source'];
    scalarKeys.forEach(k=>{
      const v = inc[k];
      if(v===undefined || v===null || v==='') return;
      if(preferIncoming || out[k]===undefined || out[k]===null || out[k]==='') out[k]=v;
    });
    ['pliegues','perimetros','somatotipo'].forEach(group=>{
      out[group] = out[group] && typeof out[group]==='object' ? out[group] : {};
      const src = inc[group] && typeof inc[group]==='object' ? inc[group] : {};
      Object.keys(src).forEach(k=>{
        const v = src[k];
        if(v===undefined || v===null || v==='') return;
        if(preferIncoming || out[group][k]===undefined || out[group][k]===null || out[group][k]==='') out[group][k]=v;
      });
    });
    return out;
  }

  window.normalizeAnthropometry = function(){
    // Primero los registros reales del usuario; luego los informes oficiales v175 para completar/corregir la serie histórica.
    const src = [...(forge.bodyMetrics||[]), ...(forge.anthropometry||[])].map(normalizeAnthroRecord).filter(Boolean);
    const oficiales = (ANTRO_HISTORICAL_RECORDS||[]).map(normalizeAnthroRecord).filter(Boolean);
    const byDate = new Map();
    src.forEach(r=>{
      if(!byDate.has(r.date)) byDate.set(r.date, r);
      else byDate.set(r.date, mergeAnthroRecord(byDate.get(r.date), r, false));
    });
    oficiales.forEach(r=>{
      if(!byDate.has(r.date)) byDate.set(r.date, r);
      else byDate.set(r.date, mergeAnthroRecord(byDate.get(r.date), r, true));
    });
    const arr = Array.from(byDate.values()).map(normalizeAnthroRecord).filter(Boolean).sort((a,b)=>a.date.localeCompare(b.date));
    forge.bodyMetrics = arr;
    forge.anthropometry = arr.filter(x => x.anthropometry || x.tipo==='antropometria' || x.source==='reporte_antropometrico_oficial' || x.somatotipo || x.perimetros || x.pliegues);
    if(!forge.perfil) forge.perfil={};
    const est = arr.slice().reverse().find(x=>x.estatura)?.estatura;
    if(est && !forge.perfil.estatura) forge.perfil.estatura = est;
    if(!forge._migrations) forge._migrations={};
    if(!forge._migrations.v175AnthropometryOfficial){
      forge._migrations.v175AnthropometryOfficial = new Date().toISOString();
      try{ if(typeof saveDB==='function') saveDB(); }catch(_e){}
    }
    return arr;
  };

  window.importAnthropometryRecords = function(records){
    if(!Array.isArray(records)) throw new Error('Debes pasar un array de registros antropométricos');
    if(!forge.bodyMetrics) forge.bodyMetrics=[];
    if(!forge.anthropometry) forge.anthropometry=[];
    forge.bodyMetrics.push(...records);
    forge.anthropometry.push(...records);
    const arr = window.normalizeAnthropometry();
    if(typeof saveDB==='function') saveDB();
    if(typeof renderAll==='function') renderAll();
    else if(typeof renderProgCuerpo==='function') renderProgCuerpo();
    console.log(`✅ Antropometría importada: ${records.length} registros recibidos, ${arr.length} fechas únicas en Melqart`, arr);
    return arr;
  };

  function metricPoints(cfg, mets){
    return (mets||[]).map(m=>{
      const v = metricVal(m,cfg);
      if(v===null) return null;
      return { date:m.date, label:m.date.slice(5).replace('-','/'), value:v, displayValue:`${v}${cfg.unit?' '+cfg.unit:''}` };
    }).filter(Boolean);
  }
  function applyMetricFilter(pts, filtro){
    const DIAS_FILTRO = { '1m':30, '2m':60, '4m':120, '8m':240, '12m':365 };
    if(!DIAS_FILTRO[filtro]) return pts;
    const corte = new Date(); corte.setDate(corte.getDate() - DIAS_FILTRO[filtro]);
    const corteStr = typeof localDateStr==='function' ? localDateStr(corte) : corte.toISOString().slice(0,10);
    return pts.filter(p=>p.date>=corteStr);
  }
  function buildMetricBody(metricKey, cfg, filtro, mets){
    filtro = filtro || window._bodyAccFiltro[metricKey] || 'all';
    const all = metricPoints(cfg, mets);
    const FILTROS = [{id:'1m',label:'1M'},{id:'2m',label:'2M'},{id:'4m',label:'4M'},{id:'8m',label:'8M'},{id:'12m',label:'12M'},{id:'all',label:'Todo'}];
    const filtrosHtml = `<div class="acc-filters">${FILTROS.map(f=>`<button class="acc-filter-btn${f.id===filtro?' on':''}" onclick="event.stopPropagation();setBodyAccFiltro('${metricKey}','${f.id}')">${f.label}</button>`).join('')}</div>`;
    if(!all.length) return `<div class="mq-chart-empty" style="padding:24px 0"><div class="mq-chart-empty-text">Sin registros</div></div>`;
    const pts = applyMetricFilter(all, filtro);
    if(!pts.length) return filtrosHtml + `<div class="mq-chart-empty" style="padding:16px 0"><div class="mq-chart-empty-text">Sin mediciones en este período</div></div>`;
    const vals=pts.map(p=>p.value), ult=vals[vals.length-1], pri=vals[0], delta=round1(ult-pri);
    const menorMejor = ['peso','imc','grasaPct','grasaKg','ratioCinturaCadera','suma6Pliegues','suma8Pliegues','triceps','subescapular','supraespinal','abdominal','muslo','pantorrilla','biceps','crestaIliaca','cinturaMinima'].includes(metricKey);
    const deltaColor = delta===0 ? 'var(--ink3)' : ((delta<0)===menorMejor ? 'var(--ok)' : 'var(--warn)');
    const kpisHtml = `<div class="acc-kpis">
      <div class="acc-kpi"><div class="acc-kpi-val">${ult} <span style="font-size:11px;color:var(--ink3)">${cfg.unit||''}</span></div><div class="acc-kpi-lbl">Actual</div></div>
      <div class="acc-kpi"><div class="acc-kpi-val" style="color:${deltaColor}">${delta>0?'+':''}${delta} ${cfg.unit||''}</div><div class="acc-kpi-lbl">Variación período</div></div>
      <div class="acc-kpi"><div class="acc-kpi-val">${pts.length}</div><div class="acc-kpi-lbl">Registros</div></div>
    </div>`;
    const chartHtml = (typeof renderMetricChart==='function') ? renderMetricChart({
      id:`anthro_${metricKey}_${filtro}`,
      type: cfg.unit==='%' ? 'percentage' : 'weight',
      unit:cfg.unit||'', unitLabel:cfg.unit||'', data:pts,
      yAxis:{forceZero:false,paddingRatio:0.12}, tooltip:{showDate:true}, height:180,
      color:cfg.color||'var(--p)', activeFilter:'all'
    }) : `<div style="padding:20px;color:var(--ink3)">Gráfico no disponible</div>`;
    return kpisHtml + filtrosHtml + chartHtml;
  }

  window.buildBodyAccBody = function(metricKey, filtro, metsAll){
    const allCfg = [...ANTRO_METRICS.composicion, ...ANTRO_METRICS.pliegues, ...ANTRO_METRICS.perimetros, ...ANTRO_METRICS.somatotipo];
    const cfg = allCfg.find(x=>x.key===metricKey) || allCfg.find(x=>(x.paths||[]).includes(metricKey));
    if(!cfg) return `<div class="mq-chart-empty" style="padding:24px 0"><div class="mq-chart-empty-text">Métrica no configurada</div></div>`;
    return buildMetricBody(metricKey, cfg, filtro, metsAll||window._cuerpoMets||[]);
  };

  function metricCard(cfg, mets){
    const pts = metricPoints(cfg, mets);
    if(!pts.length) return '';
    const isOpen = !!window._bodyAccState[cfg.key];
    const filtro = window._bodyAccFiltro[cfg.key] || 'all';
    const bodyHtml = isOpen ? buildMetricBody(cfg.key, cfg, filtro, mets) : '';
    const ult = pts[pts.length-1];
    return `<div class="acc-card${isOpen?' open':''}" id="acc-${cfg.key}" style="margin-bottom:8px">
      <div class="acc-head" onclick="toggleBodyAcc('${cfg.key}');event.stopPropagation()">
        <div class="acc-head-left"><div class="acc-ex-name">${cfg.label}</div><div class="acc-ex-sub">${pts.length} registros${cfg.unit?' · '+cfg.unit:''}</div></div>
        <div class="acc-head-right"><div class="acc-pdr-val" style="color:${cfg.color||'var(--p)'}">${ult.value}${cfg.unit?' '+cfg.unit:''}</div></div>
        <svg class="acc-chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="acc-body" id="body-acc-body-${cfg.key}">${bodyHtml}</div>
    </div>`;
  }
  function groupCards(configs, mets){
    const html = configs.map(c=>metricCard(c,mets)).filter(Boolean).join('');
    return html || `<div class="mq-chart-empty" style="padding:24px 0"><div class="mq-chart-empty-text">Sin datos para esta categoría</div></div>`;
  }

  window.renderProgCuerpo = function(){
    const metsAll = window.normalizeAnthropometry();
    window._cuerpoMets = metsAll;
    if(!metsAll.length){
      const k=document.getElementById('cuerpo-kpis'), c=document.getElementById('cuerpo-charts'), h=document.getElementById('cuerpo-historial');
      if(k) k.innerHTML='';
      if(c) c.innerHTML = `<div class="empty" style="padding:60px 0"><div class="empty-icon" style="font-size:32px;margin-bottom:12px">◬</div><div class="empty-text">Sin mediciones</div><div class="empty-sub">Carga antropometría por consola o toca "+ Añadir".</div></div>`;
      if(h) h.innerHTML='';
      return;
    }
    const ult=metsAll[metsAll.length-1];
    const imc = metricVal(ult, ANTRO_METRICS.composicion.find(x=>x.key==='imc'));
    const compSub = `${ult.peso?ult.peso+' kg':'—'} · IMC ${imc||'—'}`;
    const plSub = [metricVal(ult, ANTRO_METRICS.pliegues[0])?`6 pliegues: ${metricVal(ult, ANTRO_METRICS.pliegues[0])} mm`:'', metricVal(ult, ANTRO_METRICS.pliegues[1])?`8 pliegues: ${metricVal(ult, ANTRO_METRICS.pliegues[1])} mm`:''].filter(Boolean).join(' · ') || 'Pliegues cutáneos';
    const perSub = metricVal(ult, ANTRO_METRICS.perimetros[2]) ? `Cintura: ${metricVal(ult, ANTRO_METRICS.perimetros[2])} cm` : 'Perímetros corregidos';
    const somSub = metricVal(ult, ANTRO_METRICS.somatotipo[0]) ? `Endo ${metricVal(ult,ANTRO_METRICS.somatotipo[0])} · Meso ${metricVal(ult,ANTRO_METRICS.somatotipo[1])} · Ecto ${metricVal(ult,ANTRO_METRICS.somatotipo[2])}` : 'Somatocarta';

    const SECCIONES = [
      {key:'composicion', label:'Composición corporal', sub:compSub, render:()=>groupCards(ANTRO_METRICS.composicion,metsAll)},
      {key:'pliegues', label:'Pliegues', sub:plSub, render:()=>groupCards(ANTRO_METRICS.pliegues,metsAll)},
      {key:'perimetros', label:'Perímetros', sub:perSub, render:()=>groupCards(ANTRO_METRICS.perimetros,metsAll)},
      {key:'somatotipo', label:'Somatotipo', sub:somSub, render:()=>groupCards(ANTRO_METRICS.somatotipo,metsAll)}
    ];
    const k=document.getElementById('cuerpo-kpis'), c=document.getElementById('cuerpo-charts'), h=document.getElementById('cuerpo-historial');
    if(k) k.innerHTML='';
    if(c) c.innerHTML='';
    if(h) h.innerHTML = SECCIONES.map(sec=>{
      const isOpen=!!window._bodyAccState[sec.key];
      return `<div class="body-acc-card${isOpen?' open':''}" id="body-acc-${sec.key}">
        <div class="acc-head" onclick="toggleBodyAcc('${sec.key}')">
          <div class="acc-head-left"><div class="acc-ex-name">${sec.label}</div><div class="acc-ex-sub">${sec.sub}</div></div>
          <svg class="acc-chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
        <div class="acc-body" id="body-acc-body-${sec.key}">${isOpen?sec.render():''}</div>
      </div>`;
    }).join('');
  };

  window.exportAnthropometryLines = function(fechaInicio, fechaFin){
    const mets = window.normalizeAnthropometry().filter(m=>{
      const d=new Date(m.date+'T12:00:00'); return (!fechaInicio || d>=fechaInicio) && (!fechaFin || d<=fechaFin);
    });
    if(!mets.length) return [];
    const lines=['ANTROPOMETRIA'];
    mets.forEach(m=>{
      lines.push(`  ${m.date}: peso ${m.peso??'—'} kg · grasa ${m.grasaPct??m.grasa??'—'}% (${m.grasaKg??'—'} kg) · músculo ${m.muscularPct??'—'}% (${m.muscularKg??m.muscular??'—'} kg) · IMC ${m.imc??'—'}`);
      lines.push(`    Pliegues: 6=${m.suma6Pliegues??m.pliegues?.p6??'—'} mm · 8=${m.suma8Pliegues??m.pliegues?.p8??'—'} mm · tríceps=${m.pliegues?.triceps??'—'} · subesc=${m.pliegues?.subescapular??'—'} · supra=${m.pliegues?.supraespinal??'—'} · abd=${m.pliegues?.abdominal??'—'} · muslo=${m.pliegues?.muslo??'—'} · pant=${m.pliegues?.pantorrilla??'—'} · bíceps=${m.pliegues?.biceps??'—'} · cresta=${m.pliegues?.crestaIliaca??'—'}`);
      lines.push(`    Perímetros: brazo rel=${m.perimetros?.brazoRelajado??'—'} · brazo flex=${m.perimetros?.brazoFlexTension??'—'} · cintura=${m.perimetros?.cinturaMinima??'—'} · cadera=${m.perimetros?.caderaMaxima??'—'} · muslo=${m.perimetros?.musloMedial??'—'} · pant=${m.perimetros?.pantorrillaMaxima??'—'}`);
      lines.push(`    Somatotipo: endo=${m.somatotipo?.endo??'—'} · meso=${m.somatotipo?.meso??'—'} · ecto=${m.somatotipo?.ecto??'—'}`);
    });
    lines.push('');
    return lines;
  };
})();


// ---------------------------------------------------------------
//  MELQART v176 — Heatmaps corregidos + Progreso > Recuperación
// ---------------------------------------------------------------
const CREATINA_INICIO_OFICIAL = '2024-12-12';
const CREATINA_DIAS_SIN_CONSUMO = new Set(['2026-03-07','2026-03-08','2026-05-09','2026-05-10']);

function dateAddDaysStr(dateStr, days){
  const d = new Date(dateStr+'T12:00:00');
  d.setDate(d.getDate()+days);
  return localDateStr(d);
}
function getYearDays(year){
  const arr=[];
  for(let d=new Date(year,0,1,12); d.getFullYear()===year; d.setDate(d.getDate()+1)) arr.push(localDateStr(d));
  return arr;
}
function getTrainingCountByDate(){
  const m={};
  (forge.sessions||[]).forEach(s=>{
    const f=localDateStr(s.date);
    m[f]=(m[f]||0)+1;
  });
  return m;
}
function getFoodRecordSafe(f){
  try{ return getFD(f); }catch{ return null; }
}
function getFoodHasRecord(f){
  return !!localStorage.getItem('ff_'+f);
}
function isFoodComplete(f){
  const fd=getFoodRecordSafe(f); if(!fd || !getFoodHasRecord(f)) return false;
  const p=getMealProgress(fd);
  return !!fd.allDone || p.done>=p.total;
}
function getProteinPctForDate(f){
  const fd=getFoodRecordSafe(f); if(!fd || !getFoodHasRecord(f)) return null;
  const calc=calcNutritionDayDetail(fd);
  const prot=parseFloat(calc.portions?.proteinas||0);
  return NUTRITION_TARGETS.proteinas ? Math.round((prot/NUTRITION_TARGETS.proteinas)*100) : 0;
}
function getWaterVasosForDate(f){
  const fd=getFoodRecordSafe(f); if(!fd || !getFoodHasRecord(f)) return null;
  const meta=getAguaMeta();
  return fd.aguaVasosHoy ?? fd.agua ?? Math.round((fd.aguaMl||0)/(meta.mlPorVaso||250));
}
function getWaterOkForDate(f){
  const fd=getFoodRecordSafe(f); if(!fd || !getFoodHasRecord(f)) return false;
  const meta=getAguaMeta();
  const vasos=fd.aguaVasosHoy ?? fd.agua ?? 0;
  const ml=fd.aguaMl ?? Math.round(vasos*(meta.mlPorVaso||250));
  return vasos >= (meta.vasos||10) || ml >= ((meta.vasos||10)*(meta.mlPorVaso||250));
}
function getCreatinaTomadaOficial(f){
  if(f < CREATINA_INICIO_OFICIAL) return false;
  if(f > today()) return false;
  if(CREATINA_DIAS_SIN_CONSUMO.has(f)) return false;
  // Si existe un registro explícito local, respeta un no tomado solo en los días definidos como excepción.
  // Para la serie histórica indicada por el usuario, el consumo es completo salvo 4 días.
  return true;
}
function getSleepMinutesForDate(f){
  const fd=getFoodRecordSafe(f); if(!fd) return null;
  const t=parseInt(fd.sueno?.totalMinutos||0,10);
  return t>0?t:null;
}
function pct(n,d){ return d ? Math.round((n/d)*100) : 0; }

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
  let cells='', ok=0, totalYear=getYearDays(year).length, activeDays=0;
  for(let d=new Date(gridStart); d<=gridEnd; d.setDate(d.getDate()+1)){
    const f=localDateStr(d);
    const isOther=d.getFullYear()!==year, isFuture=f>todayStr;
    let level=-1, title=f;
    if(!isOther && !isFuture){
      const v=opts.valueFn(f);
      level = (v===null || typeof v==='undefined') ? -1 : v;
      if(level>0) activeDays++;
      if(level>=1) ok++;
      title = opts.tooltipFn ? opts.tooltipFn(f,level) : f;
    }
    let cls='mq-hm-cell';
    if(isOther || isFuture) cls+=' fut';
    else if(level>=2) cls+=' lvl2';
    else if(level>=1) cls+=' lvl1';
    else cls+=' empty';
    cells += `<div class="${cls}" title="${title.replace(/"/g,'&quot;')}"></div>`;
  }
  const label = opts.labelFn ? opts.labelFn(ok,totalYear,activeDays) : `${ok} de ${totalYear} días (${pct(ok,totalYear)}%)`;
  const monthHtml = monthStarts.map(x=>`<span style="grid-column:${x.col+1}">${months[x.m]}</span>`).join('');
  return `<div class="mq-heat-card">
    <div class="mq-heat-title">${opts.title}</div>
    <div class="mq-heat-sub">${opts.subtitle} · <strong>${label}</strong></div>
    <div class="mq-heat-scroll">
      <div class="mq-heat-months" style="grid-template-columns:repeat(53, var(--hm-size))">${monthHtml}</div>
      <div class="mq-heat-grid">${cells}</div>
    </div>
    <div class="mq-heat-legend"><span>Menos</span><span class="mq-hm-leg empty"></span><span class="mq-hm-leg lvl1"></span><span class="mq-hm-leg lvl2"></span><span>Más</span></div>
  </div>`;
}

// Reemplazo v176: heatmaps de hábitos corregidos.
function renderHabitsLumen(){
  const el=document.getElementById('perfil-habitos'); if(!el) return;
  const year=new Date().getFullYear();
  const todayStr=today();
  const trainingByDate=getTrainingCountByDate();
  const trainedDays=Object.keys(trainingByDate).filter(f=>f.startsWith(String(year))).length;
  const streak=calcStreak(), maxStr=calcMaxStreak();
  const habAlcohol = (forge.habitos||[]).find(x=>x.tipo==='alcohol');
  const todayAlcohol = (habAlcohol?.registros||{})[todayStr];

  el.innerHTML=`
    <div class="lumen-stat-row">
      <div class="lumen-stat"><div class="lumen-num">${streak}</div><div class="lumen-lbl">Racha actual</div><div class="lumen-sub">semanas seguidas</div></div>
      <div class="lumen-stat"><div class="lumen-num">${maxStr}</div><div class="lumen-lbl">Mejor racha</div><div class="lumen-sub">histórico</div></div>
      <div class="lumen-stat"><div class="lumen-num">${trainedDays}</div><div class="lumen-lbl">Días entrenados</div><div class="lumen-sub">año ${year}</div></div>
    </div>
    ${renderMqYearHeatmap({
      title:'◈ Días entrenados', subtitle:'Cada día que completaste un entrenamiento', year,
      valueFn:f=>trainingByDate[f]>=2?2:trainingByDate[f]===1?1:0,
      labelFn:(ok,total)=>`${ok} de ${total} días (${pct(ok,total)}%)`,
      tooltipFn:(f)=>`${f} · ${trainingByDate[f]||0} entrenamiento(s)`
    })}
    <div style="margin-bottom:10px">
      <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--ink3);font-weight:600;margin-bottom:8px">Consumo de alcohol hoy</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="hab-alcohol-btn${todayAlcohol==='bebio'?' active':''}" onclick="toggleAlcohol('${todayStr}')">Marcar consumo de alcohol</button></div>
    </div>
    ${renderMqYearHeatmap({
      title:'⊘ Días sin alcohol', subtitle:'Por defecto sin alcohol · Toca el botón de arriba para marcar si bebiste', year,
      valueFn:f=>{ const h=(forge.habitos||[]).find(x=>x.tipo==='alcohol'); const r=(h?.registros||{})[f]; return r==='bebio'?0:1; },
      labelFn:(ok,total)=>`${ok} de ${total} días sin alcohol (${pct(ok,total)}%)`,
      tooltipFn:f=>`${f} · ${((forge.habitos||[]).find(x=>x.tipo==='alcohol')?.registros||{})[f]==='bebio'?'con alcohol':'sin alcohol'}`
    })}
    ${renderMqYearHeatmap({
      title:'◈ Pauta nutricional', subtitle:'Días con pauta alimentaria completada', year,
      valueFn:f=>isFoodComplete(f)?1:0,
      labelFn:(ok,total)=>`${ok} de ${total} días (${pct(ok,total)}%)`,
      tooltipFn:f=>`${f} · ${isFoodComplete(f)?'pauta completa':'pauta no completa'}`
    })}
    ${renderMqYearHeatmap({
      title:'◈ Proteína diaria', subtitle:'Días con meta de proteína cumplida', year,
      valueFn:f=>{ const p=getProteinPctForDate(f); if(p===null) return 0; return p>=100?1:0; },
      labelFn:(ok,total)=>`${ok} de ${total} días (${pct(ok,total)}%)`,
      tooltipFn:f=>{ const p=getProteinPctForDate(f); return `${f} · proteína ${p===null?'sin registro':p+'%'}`; }
    })}
    ${renderMqYearHeatmap({
      title:'◈ Meta de agua', subtitle:'Días que alcanzaste 10 vasos / 2500 ml', year,
      valueFn:f=>getWaterOkForDate(f)?1:0,
      labelFn:(ok,total)=>`${ok} de ${total} días (${pct(ok,total)}%)`,
      tooltipFn:f=>`${f} · ${getWaterVasosForDate(f)??0}/10 vasos`
    })}
    ${renderMqYearHeatmap({
      title:'◈ Creatina', subtitle:'Días con creatina tomada', year,
      valueFn:f=>getCreatinaTomadaOficial(f)?1:0,
      labelFn:(ok,total)=>`${ok} de ${total} días (${pct(ok,total)}%)`,
      tooltipFn:f=>`${f} · ${getCreatinaTomadaOficial(f)?'tomada':'no tomada'}`
    })}`;
}

function weekMondayStr(dateStr){
  const d=new Date(dateStr+'T12:00:00');
  const day=d.getDay()||7;
  d.setDate(d.getDate()-day+1);
  return localDateStr(d);
}
function getWeekRangesForYear(year){
  const todayStr=today();
  const first=new Date(year,0,1,12);
  const firstMon=new Date(first); const day=firstMon.getDay()||7; firstMon.setDate(firstMon.getDate()-day+1);
  const weeks=[];
  for(let mon=new Date(firstMon); mon.getFullYear()<=year || (mon.getFullYear()===year-1 && weeks.length===0); mon.setDate(mon.getDate()+7)){
    const start=localDateStr(mon);
    const end=dateAddDaysStr(start,6);
    if(end < `${year}-01-01`) continue;
    if(start > todayStr) break;
    weeks.push({start,end,label:start.slice(5).replace('-', '/')});
    if(end >= `${year}-12-31`) break;
  }
  return weeks;
}
function datesBetween(start,end){
  const arr=[];
  for(let d=new Date(start+'T12:00:00'); localDateStr(d)<=end; d.setDate(d.getDate()+1)) arr.push(localDateStr(d));
  return arr;
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
    const sleepScore=Math.min(100, Math.round((sleepAvg/420)*100));
    const creatScore=Math.min(100, Math.round((creat/Math.max(days.length||7,1))*100));
    const protScore=Math.round(protAvg);
    const waterScore=Math.min(100, Math.round((waterAvg/(getAguaMeta().vasos||10))*100));
    const general=Math.round((sleepScore+creatScore+protScore+waterScore)/4);
    return { ...w, days:days.length, sleepAvg, sleepScore, creat, creatScore, protAvg, protScore, waterAvg, waterScore, general };
  });
}
function fmtHours(min){
  if(!min) return '0h 00m';
  const h=Math.floor(min/60), m=Math.round(min%60);
  return `${h}h ${String(m).padStart(2,'0')}m`;
}
function renderRecoveryChart(title, data, getVal, opts={}){
  const W=320,H=128,pad=20;
  const vals=data.map(getVal).filter(v=>v!==null && !isNaN(v));
  const target=opts.target||0;
  const allVals=target?vals.concat([target]):vals;
  const minRaw=Math.min(...allVals,0), maxRaw=Math.max(...allVals, target||1);
  const span=Math.max(maxRaw-minRaw,1);
  const minV=Math.max(0, minRaw-span*.2), maxV=maxRaw+span*.2;
  const xs=data.map((_,i)=>pad+(i/(Math.max(data.length-1,1)))*(W-pad*2));
  const y=v=>H-pad-((v-minV)/(maxV-minV))*(H-pad*2);
  const line=data.map((d,i)=>`${i===0?'M':'L'}${xs[i].toFixed(1)},${y(getVal(d)).toFixed(1)}`).join(' ');
  const dots=data.map((d,i)=>`<circle cx="${xs[i].toFixed(1)}" cy="${y(getVal(d)).toFixed(1)}" r="3.8" fill="var(--p)"><title>${d.start} · ${opts.tooltip?opts.tooltip(d):getVal(d)}</title></circle>`).join('');
  const last=data[data.length-1];
  const lastVal=last?getVal(last):0;
  const pctMeta=target?Math.min(100,Math.round((lastVal/target)*100)):Math.min(100,Math.round(lastVal));
  const display=opts.format?opts.format(lastVal,last):lastVal;
  return `<div class="mq-recovery-chart card">
    <div class="mq-recovery-chart-head"><div><strong>${title}</strong></div><div class="mq-recovery-chart-val">${display}</div></div>
    <div class="mq-recovery-chart-meta">${opts.meta||''}</div>
    <svg viewBox="0 0 ${W} ${H}" class="mq-recovery-svg">
      ${target?`<line x1="${pad}" y1="${y(target).toFixed(1)}" x2="${W-pad}" y2="${y(target).toFixed(1)}" stroke="var(--warn)" stroke-width="1" stroke-dasharray="4,3" opacity=".55"/>`:''}
      <path d="${line}" fill="none" stroke="var(--p)" stroke-width="2.6"/>
      ${dots}
    </svg>
    <div class="mq-recovery-progress"><div style="width:${pctMeta}%"></div></div>
  </div>`;
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

// ---------------------------------------------------------------
//  MELQART v178 — Árbol de decisión proteína + limpieza heatmaps/recuperación
// ---------------------------------------------------------------
(function(){
  // Plantillas cerradas por tabla de equivalencias y definición del plan diario.
  window.MQ178_MEAL_PORTIONS = {
    desayuno: { proteinas:2, cereales:0.5, frutas:0.5, lipidos:0.5 },
    fruta_1000: { frutas:1 },
    almuerzo_post: { proteinas:4, cereales:2 },
    leche_protein_1700: { lacteoProtein:1 },
    huevos_1800: { proteinas:3 },
    leche_descremada_casa: { lacteoDescremado:1 },
    cena: { proteinas:4, cereales:2, verduras:2 }
  };
  try{
    Object.keys(window.MQ178_MEAL_PORTIONS).forEach(id=>{
      if(typeof MEAL_PORTIONS!=='undefined' && MEAL_PORTIONS[id]){
        Object.keys(MEAL_PORTIONS[id]).forEach(k=>delete MEAL_PORTIONS[id][k]);
        Object.assign(MEAL_PORTIONS[id], window.MQ178_MEAL_PORTIONS[id]);
      }
      if(typeof COMIDAS!=='undefined'){
        const c=COMIDAS.find(x=>x.id===id);
        if(c) c.portions=window.MQ178_MEAL_PORTIONS[id];
      }
    });
    if(typeof COMIDAS!=='undefined'){
      const d=COMIDAS.find(x=>x.id==='desayuno'); if(d) d.grupos='2 proteínas · 0.5 cereal · 0.5 fruta · 0.5 lípidos';
      const c=COMIDAS.find(x=>x.id==='cena'); if(c) c.grupos='4 proteínas · 2 cereales · 2 verduras';
    }
  }catch(e){ console.warn('v178 meal portion normalization skipped', e); }
})();

function mq178MealIds(){ return (typeof COMIDAS!=='undefined' ? COMIDAS : []).map(c=>c.id); }
function mq178MealTotal(){ return mq178MealIds().length || 7; }
function mq178IsDone(v){
  if(v===true) return true;
  if(v===false || v==null) return false;
  if(typeof v==='number') return v>0;
  if(typeof v==='string') return ['true','1','si','sí','done','ok','completa','completada'].includes(v.toLowerCase());
  if(typeof v==='object') return !!(v.completada || v.completed || v.done || v.ok || v.checked || v.status==='done');
  return false;
}
function mq178ParseIntSafe(v){ const n=parseInt(v,10); return Number.isFinite(n) && n>=0 ? n : null; }
function mq177CompletedMealCount(fd){
  if(!fd) return 0;
  const total=mq178MealTotal();
  if(fd.allDone || fd.pautaManual) return total;
  const keys=['comidasCompletadas','completedMeals','mealsDone','platosCompletados','mealCount','comidasDone','comidasCount'];
  for(const k of keys){ const n=mq178ParseIntSafe(fd[k]); if(n!==null) return Math.min(total,n); }
  if(Array.isArray(fd.meals)){
    const n=fd.meals.filter(m=>mq178IsDone(m)).length;
    if(n>0) return Math.min(total,n);
  }
  if(fd.comidas && typeof fd.comidas==='object'){
    const n=Object.values(fd.comidas).filter(mq178IsDone).length;
    if(n>0) return Math.min(total,n);
  }
  return 0;
}
function mq178MealText(fd, meal){
  const cur=fd?.comidas?.[meal.id];
  if(cur && typeof cur==='object' && String(cur.texto||'').trim()) return String(cur.texto).trim();
  if(Array.isArray(fd?.meals)){
    const m=fd.meals.find(x=>x && (x.id===meal.id || x.key===meal.id || normFoodText(x.nombre||x.name||'')===normFoodText(meal.nombre||'')));
    if(m) return String(m.texto||m.text||m.detail||m.detalle||m.descripcion||'').trim();
  }
  return '';
}
function mq178CompletedMealIds(fd){
  const ids=mq178MealIds();
  const out=new Set();
  const count=mq177CompletedMealCount(fd);
  // Regla histórica cerrada: X/7 significa primeros X platos completados en orden.
  ids.slice(0,count).forEach(id=>out.add(id));
  // Mantener compatibilidad con registros explícitos no secuenciales de la app nueva.
  if(fd?.comidas && typeof fd.comidas==='object'){
    ids.forEach(id=>{ if(mq178IsDone(fd.comidas[id])) out.add(id); });
  }
  if(Array.isArray(fd?.meals)){
    fd.meals.forEach(m=>{
      if(!mq178IsDone(m)) return;
      const idx=ids.findIndex(id=>id===m.id || id===m.key);
      if(idx>=0) out.add(ids[idx]);
    });
  }
  return out;
}
function getMealProgress(fd){
  const total=mq178MealTotal();
  const done=mq177CompletedMealCount(fd);
  return {done,total,pct: total?Math.round(done/total*100):0};
}
function mq178MealPortionsFor(meal, fd){
  const txt=mq178MealText(fd, meal);
  if(txt){
    const parsed=parseNutritionTextToPortions(txt);
    if(parsed.hasAny) return {portions:parsed.portions, source:'detalle', details:parsed.details};
  }
  const portions=(window.MQ178_MEAL_PORTIONS && window.MQ178_MEAL_PORTIONS[meal.id]) || meal.portions || {};
  return {portions, source:'platos', details:[`${meal.nombre} → plantilla por plato completado`]};
}
function calcNutritionDayDetail(fd){
  const total=clonePortionZero();
  const details=[];
  if(!fd) return {portions:total, details, mealCount:0, source:'sin_dato'};
  const completedIds=mq178CompletedMealIds(fd);
  (COMIDAS||[]).forEach(meal=>{
    if(!completedIds.has(meal.id)) return;
    const res=mq178MealPortionsFor(meal,fd);
    sumPortionsInto(total,res.portions||{});
    details.push({type:'comida', name:meal.nombre, source:res.source, portions:res.portions||{}, details:res.details||[]});
  });
  (fd.extraFoods||[]).forEach(f=>{
    sumPortionsInto(total, f.portions||{});
    details.push({type:f.quickMeal?'comida_rapida':'alimento_rapido', name:f.name, source:f.quickMeal?'comida rápida':'registro rápido', portions:f.portions||{}, details:f.calcDetail||f.details||[]});
  });
  Object.keys(total).forEach(k=>total[k]=nRound(total[k],2));
  return {portions:total, details, mealCount:completedIds.size, source:details.length?'calculado':'sin_dato'};
}
function calcPortionsConsumed(fd){ return calcNutritionDayDetail(fd).portions; }
function getPorcionesHoy(fd){ return calcPortionsConsumed(fd); }
function getFoodHasRecord(f){
  try{
    const raw=localStorage.getItem('ff_'+f);
    if(!raw) return false;
    const fd=JSON.parse(raw);
    if(fd.pautaManual || fd.allDone) return true;
    if(mq177CompletedMealCount(fd)>0) return true;
    if((fd.extraFoods||[]).length>0) return true;
    if((fd.aguaVasosHoy||fd.agua||fd.aguaMl||0)>0) return true;
    if(fd.sueno || typeof fd.creatinaTomada!=='undefined') return true;
    return true;
  }catch{ return false; }
}
function getProteinPortionsForDate(f){
  const fd=getFoodRecordSafe(f);
  if(!fd || !getFoodHasRecord(f)) return null;
  const calc=calcNutritionDayDetail(fd);
  if(!calc.details.length && calc.mealCount===0) return null;
  return nRound(calc.portions?.proteinas||0,2);
}
function getProteinPctForDate(f){
  const prot=getProteinPortionsForDate(f);
  if(prot===null) return null;
  return NUTRITION_TARGETS.proteinas ? Math.round((prot/NUTRITION_TARGETS.proteinas)*100) : 0;
}
function isFoodComplete(f){
  const fd=getFoodRecordSafe(f); if(!fd || !getFoodHasRecord(f)) return false;
  const p=getMealProgress(fd);
  return !!(fd.allDone || fd.pautaManual || p.done>=p.total);
}

function mq178ElapsedDays(year){
  const todayStr=today();
  const end=todayStr.startsWith(String(year)) ? todayStr : `${year}-12-31`;
  return getYearDays(year).filter(f=>f<=end).length;
}
function renderMqYearHeatmap(opts){
  const year=opts.year||new Date().getFullYear();
  const todayStr=today();
  const start=new Date(year,0,1,12);
  const dow0=(start.getDay()+6)%7;
  const gridStart=new Date(year,0,1,12); gridStart.setDate(1-dow0);
  const gridEnd=new Date(year,11,31,12);
  const months=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const monthStarts=[];
  for(let m=0;m<12;m++){
    const md=new Date(year,m,1,12);
    const diff=Math.floor((md-gridStart)/86400000);
    monthStarts.push({m, col:Math.floor(diff/7)});
  }
  let cells='', ok=0, valid=0, activeDays=0;
  for(let d=new Date(gridStart); d<=gridEnd; d.setDate(d.getDate()+1)){
    const f=localDateStr(d);
    const isOther=d.getFullYear()!==year, isFuture=f>todayStr;
    let level=-1, title=f;
    if(!isOther && !isFuture){
      const v=opts.valueFn(f);
      level=(v===null || typeof v==='undefined') ? -1 : v;
      if(level!==-1) valid++;
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
  const elapsed=mq178ElapsedDays(year);
  const label=opts.labelFn ? opts.labelFn(ok,elapsed,valid,activeDays) : `${ok} de ${elapsed} días (${pct(ok,elapsed)}%)`;
  const monthHtml=monthStarts.map(x=>`<span style="grid-column:${x.col+1}">${months[x.m]}</span>`).join('');
  const dayRows=['L','','X','','V','','D'].map(x=>`<span>${x}</span>`).join('');
  return `<div class="mq-heat-card mq-heat-card-v178">
    <div class="mq-heat-head"><div><div class="mq-heat-title">${opts.title}</div><div class="mq-heat-sub">${opts.subtitle} · <strong>${label}</strong></div></div></div>
    <div class="mq-heat-scroll"><div class="mq-heat-with-days"><div class="mq-heat-days-axis mq-heat-days-axis-lite"><span></span>${dayRows}</div><div><div class="mq-heat-months" style="grid-template-columns:repeat(53, var(--hm-size))">${monthHtml}</div><div class="mq-heat-grid">${cells}</div></div></div></div>
  </div>`;
}
function renderLumenHabitoGrid(titulo,subtitulo,year,todayStr,valFn,tipo=''){
  const start=new Date(year,0,1,12);
  const dow0=(start.getDay()+6)%7;
  const gridStart=new Date(year,0,1,12); gridStart.setDate(1-dow0);
  const gridEnd=new Date(year,11,31,12);
  const meses=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  let cells='', cumplidos=0,totalDias=0;
  for(let d=new Date(gridStart);d<=gridEnd;d.setDate(d.getDate()+1)){
    const f=localDateStr(d); const isOther=d.getFullYear()!==year, isFuture=f>todayStr;
    let cls='lc'; const clickable=tipo==='alcohol'&&!isOther&&!isFuture;
    if(isOther||isFuture){ cls+=' fut'; }
    else{
      const v=valFn(f); totalDias++;
      if(v>=1){ cls+=' l4'; cumplidos++; }
      else if(v>=0.5) cls+=' l3';
      else if(v>=0.25) cls+=' l2';
      else if(v===0) cls+=' l1';
    }
    cells+=clickable ? `<div class="${cls}" onclick="toggleAlcohol('${f}')" style="cursor:pointer" title="${f}"></div>` : `<div class="${cls}" title="${f}"></div>`;
  }
  const monthsHtml='<div class="lumen-months">'+meses.map(m=>`<div class="lumen-month" style="min-width:28px">${m}</div>`).join('')+'</div>';
  const etiqueta=tipo==='alcohol' ? `<strong style="color:var(--green)">${cumplidos}</strong> de ${totalDias} días sin alcohol` : `<strong style="color:var(--orange)">${cumplidos}</strong> de ${totalDias} días`;
  return `<div class="lumen-block"><div class="lumen-block-title">${titulo}</div><div class="lumen-block-sub">${subtitulo} · ${etiqueta}</div><div class="lumen-grid-wrap">${monthsHtml}<div class="lgrid">${cells}</div></div></div>`;
}

function mq178WeekLabel(start){ return String(start||'').slice(8,10)+'/'+String(start||'').slice(5,7); }
function mq178FilterWeeks(data,key){
  const filter=localStorage.getItem('mq_rec_filter_'+key)||'3m';
  if(filter==='all') return data;
  const months={m1:1,m3:3,m6:6,m12:12}[filter]||3;
  const cutoff=new Date(today()+'T12:00:00'); cutoff.setMonth(cutoff.getMonth()-months);
  return data.filter(d=>new Date(d.start+'T12:00:00')>=cutoff);
}
function mq178Seg(key){
  const cur=localStorage.getItem('mq_rec_filter_'+key)||'3m';
  const opts=[['m1','1 mes'],['m3','3 meses'],['m6','6 meses'],['m12','12 meses'],['all','Todo']];
  return `<div class="mq-rec-seg">${opts.map(o=>`<button class="${cur===o[0]?'on':''}" onclick="localStorage.setItem('mq_rec_filter_${key}','${o[0]}');renderProgRecuperacion();">${o[1]}</button>`).join('')}</div>`;
}
function weeklyRecoveryData(year=new Date().getFullYear()){
  const todayStr=today();
  return getWeekRangesForYear(year).map(w=>{
    const days=datesBetween(w.start,w.end).filter(f=>f<=todayStr && f.startsWith(String(year)));
    const sleepVals=days.map(getSleepMinutesForDate).filter(v=>v!==null);
    const sleepAvg=sleepVals.length ? sleepVals.reduce((a,b)=>a+b,0)/sleepVals.length : null;
    const creatDays=days.filter(f=>f>=CREATINA_INICIO_OFICIAL);
    const creat=creatDays.filter(getCreatinaTomadaOficial).length;
    const creatScore=creatDays.length ? Math.min(100,Math.round(creat/creatDays.length*100)) : null;
    const protVals=days.map(getProteinPctForDate).filter(v=>v!==null).map(v=>Math.min(100,v));
    const protAvg=protVals.length ? Math.round(protVals.reduce((a,b)=>a+b,0)/protVals.length) : null;
    const waterVals=days.map(getWaterVasosForDate).filter(v=>v!==null);
    const waterAvg=waterVals.length ? waterVals.reduce((a,b)=>a+b,0)/waterVals.length : null;
    const sleepScore=sleepAvg!==null ? Math.min(100,Math.round(sleepAvg/420*100)) : null;
    const waterScore=waterAvg!==null ? Math.min(100,Math.round(waterAvg/(getAguaMeta().vasos||10)*100)) : null;
    const scores=[sleepScore,creatScore,protAvg,waterScore];
    const general=scores.every(v=>v!==null) ? Math.round(scores.reduce((a,b)=>a+b,0)/4) : null;
    return {...w, days:days.length, sleepAvg, sleepScore, creat, creatDays:creatDays.length, creatScore, protAvg, protScore:protAvg, waterAvg, waterScore, general};
  }).filter(w=>w.days>0);
}
function mq178RenderRecoveryChart(key,title,data,getVal,opts={}){
  const filtered=mq178FilterWeeks(data,key).filter(d=>getVal(d)!==null && typeof getVal(d)!=='undefined' && !isNaN(getVal(d)));
  if(filtered.length<2){
    return `<div class="mq-recovery-chart card"><div class="mq-recovery-chart-head"><div><strong>${title}</strong></div></div>${mq178Seg(key)}<div class="mq-empty-small">Sin datos suficientes</div></div>`;
  }
  const W=320,H=144,pad=22;
  const vals=filtered.map(getVal);
  const target=opts.target||0;
  const allVals=target?vals.concat([target]):vals;
  const minRaw=Math.min(...allVals), maxRaw=Math.max(...allVals);
  const span=Math.max(maxRaw-minRaw,1);
  const minV=Math.max(0,minRaw-span*.2), maxV=maxRaw+span*.2;
  const xs=filtered.map((_,i)=>pad+(i/(Math.max(filtered.length-1,1)))*(W-pad*2));
  const y=v=>H-pad-18-((v-minV)/(maxV-minV))*(H-pad*2-18);
  const line=filtered.map((d,i)=>`${i===0?'M':'L'}${xs[i].toFixed(1)},${y(getVal(d)).toFixed(1)}`).join(' ');
  const dots=filtered.map((d,i)=>`<circle cx="${xs[i].toFixed(1)}" cy="${y(getVal(d)).toFixed(1)}" r="3.8" fill="var(--p)"><title>${mq178WeekLabel(d.start)} · ${opts.tooltip?opts.tooltip(d):getVal(d)}</title></circle>`).join('');
  const labels=filtered.map((d,i)=> i%Math.ceil(filtered.length/5)===0 || i===filtered.length-1 ? `<text x="${xs[i].toFixed(1)}" y="${H-6}" text-anchor="middle" font-size="9" fill="var(--ink3)">${mq178WeekLabel(d.start)}</text>` : '').join('');
  const last=filtered[filtered.length-1], lastVal=getVal(last);
  const display=opts.format?opts.format(lastVal,last):lastVal;
  const pctMeta=target?Math.min(100,Math.round(lastVal/target*100)):Math.min(100,Math.round(lastVal));
  return `<div class="mq-recovery-chart card"><div class="mq-recovery-chart-head"><div><strong>${title}</strong></div><div class="mq-recovery-chart-val">${display}</div></div><div class="mq-recovery-chart-meta">${opts.meta||''}</div>${mq178Seg(key)}<svg viewBox="0 0 ${W} ${H}" class="mq-recovery-svg">${target?`<line x1="${pad}" y1="${y(target).toFixed(1)}" x2="${W-pad}" y2="${y(target).toFixed(1)}" stroke="var(--warn)" stroke-width="1" stroke-dasharray="4,3" opacity=".55"/>`:''}<path d="${line}" fill="none" stroke="var(--p)" stroke-width="2.6"/>${dots}${labels}</svg><div class="mq-recovery-progress"><div style="width:${pctMeta}%"></div></div></div>`;
}
function renderProgRecuperacion(){
  const el=document.getElementById('prog-recuperacion-content'); if(!el) return;
  const data=weeklyRecoveryData(new Date().getFullYear());
  const lastWith=k=>[...data].reverse().find(d=>d[k]!==null && typeof d[k]!=='undefined');
  const lSleep=lastWith('sleepAvg'), lCreat=lastWith('creatScore'), lProt=lastWith('protAvg'), lWater=lastWith('waterAvg'), lGen=lastWith('general');
  const kpis=[
    {t:'Sueño',v:lSleep?fmtHours(lSleep.sleepAvg):'Sin datos',s:'promedio semanal'},
    {t:'Creatina',v:lCreat?`${lCreat.creat}/${lCreat.creatDays||7}`:'Sin datos',s:'días semana'},
    {t:'Proteína',v:lProt?`${Math.round(lProt.protAvg)}%`:'Sin datos',s:'cumplimiento'},
    {t:'Agua',v:lWater?`${(lWater.waterAvg||0).toFixed(1)}/10`:'Sin datos',s:'vasos promedio'},
    {t:'Cumplimiento',v:lGen?`${lGen.general}%`:'Sin datos',s:'promedio recuperación'}
  ].map(k=>`<div class="lumen-stat mq-rec-kpi"><div class="lumen-num">${k.v}</div><div class="lumen-lbl">${k.t}</div><div class="lumen-sub">${k.s}</div></div>`).join('');
  el.innerHTML=`<div class="section-label" style="margin-bottom:10px">Recuperación semanal</div><div class="mq-rec-kpi-row">${kpis}</div>${mq178RenderRecoveryChart('sleep','Sueño promedio',data,d=>d.sleepAvg===null?null:Math.round(d.sleepAvg/60*100)/100,{target:7,format:(v,d)=>fmtHours(d.sleepAvg),meta:'Meta: 7h promedio',tooltip:d=>fmtHours(d.sleepAvg)})}${mq178RenderRecoveryChart('creatine','Creatina',data,d=>d.creatScore===null?null:d.creat,{target:7,format:(v,d)=>`${d.creat}/${d.creatDays||7}`,meta:'Meta: consumo diario',tooltip:d=>`${d.creat} de ${d.creatDays} días`})}${mq178RenderRecoveryChart('protein','Proteína',data,d=>d.protAvg,{target:100,format:v=>`${Math.round(v)}%`,meta:'Meta: 100% semanal',tooltip:d=>`${Math.round(d.protAvg)}% promedio`})}${mq178RenderRecoveryChart('water','Agua',data,d=>d.waterAvg,{target:10,format:v=>`${v.toFixed(1)}/10`,meta:'Meta: 10 vasos promedio',tooltip:d=>`${d.waterAvg.toFixed(1)} vasos promedio`})}${mq178RenderRecoveryChart('general','Cumplimiento general',data,d=>d.general,{target:100,format:v=>`${Math.round(v)}%`,meta:'Promedio simple: sueño, creatina, proteína y agua',tooltip:d=>`${d.general}% recuperación`})}`;
}


// ---------------------------------------------------------------
//  MELQART v179 — Corrección proteína + ejes verticales Progreso
// ---------------------------------------------------------------
(function mq179NormalizeNutritionPlan(){
  window.MQ179_MEAL_PORTIONS = {
    // Regla cerrada: scoop proteína = 2 porciones; lácteos protein no suman carnes.
    desayuno: { proteinas:2, cereales:0.5, frutas:0.5, lipidos:0.5 },
    fruta_1000: { frutas:1 },
    almuerzo_post: { proteinas:4, cereales:2 },
    leche_protein_1700: { lacteoProtein:1 },
    huevos_1800: { proteinas:3 },
    leche_descremada_casa: { lacteoDescremado:1 },
    cena: { proteinas:4, cereales:2, verduras:2 }
  };
  try{
    Object.keys(window.MQ179_MEAL_PORTIONS).forEach(id=>{
      if(typeof MEAL_PORTIONS !== 'undefined'){
        if(!MEAL_PORTIONS[id]) MEAL_PORTIONS[id] = {};
        Object.keys(MEAL_PORTIONS[id]).forEach(k=>delete MEAL_PORTIONS[id][k]);
        Object.assign(MEAL_PORTIONS[id], window.MQ179_MEAL_PORTIONS[id]);
      }
      if(typeof COMIDAS !== 'undefined'){
        const c = COMIDAS.find(x=>x.id===id);
        if(c) c.portions = window.MQ179_MEAL_PORTIONS[id];
      }
    });
    if(typeof COMIDAS !== 'undefined'){
      const d=COMIDAS.find(x=>x.id==='desayuno');
      if(d){ d.grupos='2 proteínas · 0.5 cereal · 0.5 fruta · 0.5 lípidos'; d.ejemplo='1 scoop proteína + 1/2 plátano + pan molde + mantequilla de maní medida'; }
      const c=COMIDAS.find(x=>x.id==='cena');
      if(c){ c.grupos='4 proteínas · 2 cereales · 2 verduras'; c.ejemplo='Proteína magra + arroz, papas o fideos + verduras de libre consumo'; }
    }
  }catch(e){ console.warn('v179 nutrition plan normalization skipped', e); }
})();

function mq179PortionZero(){
  return (typeof clonePortionZero === 'function') ? clonePortionZero() : {proteinas:0,lacteoProtein:0,lacteoDescremado:0,cereales:0,frutas:0,lipidos:0,aceites:0,verduras:0};
}
function mq179MealIds(){ return (typeof COMIDAS !== 'undefined' ? COMIDAS : []).map(c=>c.id); }
function mq179MealTotal(){ return mq179MealIds().length || 7; }
function mq179IsDone(v){
  if(v===true) return true;
  if(v===false || v==null) return false;
  if(typeof v==='number') return v>0;
  if(typeof v==='string') return ['true','1','si','sí','done','ok','completa','completada'].includes(v.toLowerCase());
  if(typeof v==='object') return !!(v.completada || v.completed || v.done || v.ok || v.checked || v.status==='done');
  return false;
}
function mq179DirectMealCount(fd){
  if(!fd) return 0;
  const total=mq179MealTotal();
  if(fd.allDone || fd.pautaManual) return total;
  for(const k of ['comidasCompletadas','completedMeals','mealsDone','platosCompletados','mealCount','comidasDone','comidasCount']){
    const n=parseInt(fd[k],10);
    if(Number.isFinite(n) && n>=0) return Math.min(total,n);
  }
  if(fd.comidas && typeof fd.comidas==='object'){
    const ids=mq179MealIds();
    const n=ids.filter(id=>mq179IsDone(fd.comidas[id])).length;
    if(n>0) return Math.min(total,n);
  }
  if(Array.isArray(fd.meals)){
    const n=fd.meals.filter(m=>mq179IsDone(m)).length;
    if(n>0) return Math.min(total,n);
  }
  return 0;
}
function mq177CompletedMealCount(fd){ return mq179DirectMealCount(fd); }
function getMealProgress(fd){
  const total=mq179MealTotal();
  const done=mq179DirectMealCount(fd);
  return { done, total, pct: total ? Math.round(done/total*100) : 0 };
}
function mq179PlatePortions(count){
  const total=mq179PortionZero();
  const meals=(typeof COMIDAS !== 'undefined' ? COMIDAS : []);
  const n=Math.min(Math.max(parseInt(count||0,10)||0,0), meals.length||7);
  for(let i=0;i<n;i++){
    const meal=meals[i];
    const p=(window.MQ179_MEAL_PORTIONS && window.MQ179_MEAL_PORTIONS[meal.id]) || (meal && meal.portions) || {};
    if(typeof sumPortionsInto==='function') sumPortionsInto(total,p); else Object.keys(p).forEach(k=>total[k]=(total[k]||0)+(parseFloat(p[k])||0));
  }
  Object.keys(total).forEach(k=>total[k]=nRound(total[k],2));
  return total;
}
function mq179TextPortions(fd){
  const total=mq179PortionZero();
  const details=[];
  const meals=(typeof COMIDAS !== 'undefined' ? COMIDAS : []);
  meals.forEach(meal=>{
    const txt = (fd?.comidas?.[meal.id] && typeof fd.comidas[meal.id]==='object') ? String(fd.comidas[meal.id].texto||'').trim() : '';
    if(!txt) return;
    const parsed=parseNutritionTextToPortions(txt);
    if(parsed && parsed.hasAny){
      if(typeof sumPortionsInto==='function') sumPortionsInto(total, parsed.portions||{}); else Object.keys(parsed.portions||{}).forEach(k=>total[k]=(total[k]||0)+(parseFloat(parsed.portions[k])||0));
      details.push({type:'detalle', name:meal.nombre, source:'detalle', portions:parsed.portions||{}, details:parsed.details||[]});
    }
  });
  (fd?.extraFoods||[]).forEach(f=>{
    if(typeof sumPortionsInto==='function') sumPortionsInto(total, f.portions||{}); else Object.keys(f.portions||{}).forEach(k=>total[k]=(total[k]||0)+(parseFloat(f.portions[k])||0));
    details.push({type:f.quickMeal?'comida_rapida':'alimento_rapido', name:f.name, source:f.quickMeal?'comida rápida':'registro rápido', portions:f.portions||{}, details:f.calcDetail||f.details||[]});
  });
  Object.keys(total).forEach(k=>total[k]=nRound(total[k],2));
  return {portions:total, details};
}
function mq179MaxPortions(a,b){
  const out=mq179PortionZero();
  const keys=Object.keys(out);
  keys.forEach(k=>out[k]=nRound(Math.max(parseFloat(a?.[k]||0), parseFloat(b?.[k]||0)),2));
  return out;
}
function calcNutritionDayDetail(fd){
  const empty=mq179PortionZero();
  if(!fd) return {portions:empty, details:[], mealCount:0, source:'sin_dato'};
  const mealCount=mq179DirectMealCount(fd);
  const platePortions=mq179PlatePortions(mealCount);
  const detail=mq179TextPortions(fd);
  // Regla cerrada v179: proteína/porciones finales = MAX(platos completados, detalle real).
  // Evita que un resumen o texto parcial deje 7/7 con Prot 3.
  const finalPortions=mq179MaxPortions(platePortions, detail.portions);
  const details=[];
  if(mealCount>0){
    details.push({type:'platos', name:`${mealCount}/${mq179MealTotal()} comidas`, source:'árbol de decisión por platos', portions:platePortions, details:[`Proteína por platos = ${platePortions.proteinas||0}`]});
  }
  details.push(...(detail.details||[]));
  return { portions:finalPortions, details, mealCount, source:details.length?'max_platos_detalle':'sin_dato', platePortions, detailPortions:detail.portions };
}
function calcPortionsConsumed(fd){ return calcNutritionDayDetail(fd).portions; }
function getPorcionesHoy(fd){ return calcPortionsConsumed(fd); }
function getFoodHasRecord(f){
  try{
    const raw=localStorage.getItem('ff_'+f);
    if(!raw) return false;
    const fd=JSON.parse(raw);
    if(fd.pautaManual || fd.allDone) return true;
    if(mq179DirectMealCount(fd)>0) return true;
    if((fd.extraFoods||[]).length>0) return true;
    if((fd.aguaVasosHoy||fd.agua||fd.aguaMl||0)>0) return true;
    if(fd.sueno || typeof fd.creatinaTomada!=='undefined') return true;
    return true;
  }catch{ return false; }
}
function getProteinPortionsForDate(f){
  const fd=(typeof getFoodRecordSafe==='function') ? getFoodRecordSafe(f) : null;
  if(!fd || !getFoodHasRecord(f)) return null;
  const calc=calcNutritionDayDetail(fd);
  if(!calc.details.length && calc.mealCount===0) return null;
  return nRound(calc.portions?.proteinas||0,2);
}
function getProteinPctForDate(f){
  const prot=getProteinPortionsForDate(f);
  if(prot===null) return null;
  return NUTRITION_TARGETS.proteinas ? Math.round((prot/NUTRITION_TARGETS.proteinas)*100) : 0;
}
function isFoodComplete(f){
  const fd=(typeof getFoodRecordSafe==='function') ? getFoodRecordSafe(f) : null;
  if(!fd || !getFoodHasRecord(f)) return false;
  const p=getMealProgress(fd);
  return !!(fd.allDone || fd.pautaManual || p.done>=p.total);
}

function mq179FormatAxis(v,opts={}){
  if(opts.axisFormat) return opts.axisFormat(v);
  if(opts.valueSuffix==='%') return `${Math.round(v)}%`;
  if(opts.unit==='h') return `${Math.round(v*10)/10}h`;
  if(opts.unit==='vasos') return `${Math.round(v*10)/10}`;
  return String(Math.round(v*10)/10);
}
function mq178RenderRecoveryChart(key,title,data,getVal,opts={}){
  const filtered=mq178FilterWeeks(data,key).filter(d=>getVal(d)!==null && typeof getVal(d)!=='undefined' && !isNaN(getVal(d)));
  if(filtered.length<2){
    return `<div class="mq-recovery-chart card"><div class="mq-recovery-chart-head"><div><strong>${title}</strong></div></div>${mq178Seg(key)}<div class="mq-empty-small">Sin datos suficientes</div></div>`;
  }
  const W=340,H=158,PL=44,PR=12,PT=18,PB=28;
  const vals=filtered.map(getVal);
  const target=opts.target||0;
  const allVals=target?vals.concat([target]):vals;
  const minRaw=Math.min(...allVals), maxRaw=Math.max(...allVals);
  const span=Math.max(maxRaw-minRaw,1);
  const minV=Math.max(0, minRaw-span*.18), maxV=maxRaw+span*.18;
  const xs=filtered.map((_,i)=>PL+(i/(Math.max(filtered.length-1,1)))*(W-PL-PR));
  const y=v=>PT+(1-((v-minV)/(maxV-minV)))*(H-PT-PB);
  const line=filtered.map((d,i)=>`${i===0?'M':'L'}${xs[i].toFixed(1)},${y(getVal(d)).toFixed(1)}`).join(' ');
  const ticks=[maxV, minV+(maxV-minV)/2, minV];
  const yAxis=ticks.map(v=>`<text x="${PL-5}" y="${y(v).toFixed(1)}" text-anchor="end" dominant-baseline="middle" font-size="9" fill="var(--ink3)">${mq179FormatAxis(v,opts)}</text><line x1="${PL}" y1="${y(v).toFixed(1)}" x2="${W-PR}" y2="${y(v).toFixed(1)}" stroke="var(--border)" stroke-width="1" stroke-dasharray="3,3"/>`).join('');
  const dots=filtered.map((d,i)=>`<circle cx="${xs[i].toFixed(1)}" cy="${y(getVal(d)).toFixed(1)}" r="3.8" fill="var(--p)"><title>${mq178WeekLabel(d.start)} · ${opts.tooltip?opts.tooltip(d):getVal(d)}</title></circle>`).join('');
  const labels=filtered.map((d,i)=> i%Math.ceil(filtered.length/5)===0 || i===filtered.length-1 ? `<text x="${xs[i].toFixed(1)}" y="${H-6}" text-anchor="middle" font-size="9" fill="var(--ink3)">${mq178WeekLabel(d.start)}</text>` : '').join('');
  const last=filtered[filtered.length-1], lastVal=getVal(last);
  const display=opts.format?opts.format(lastVal,last):lastVal;
  const pctMeta=target?Math.min(100,Math.round(lastVal/target*100)):Math.min(100,Math.round(lastVal));
  return `<div class="mq-recovery-chart card"><div class="mq-recovery-chart-head"><div><strong>${title}</strong></div><div class="mq-recovery-chart-val">${display}</div></div><div class="mq-recovery-chart-meta">${opts.meta||''}</div>${mq178Seg(key)}<svg viewBox="0 0 ${W} ${H}" class="mq-recovery-svg">${yAxis}<line x1="${PL}" y1="${PT}" x2="${PL}" y2="${H-PB}" stroke="var(--border)"/><line x1="${PL}" y1="${H-PB}" x2="${W-PR}" y2="${H-PB}" stroke="var(--border)"/>${target?`<line x1="${PL}" y1="${y(target).toFixed(1)}" x2="${W-PR}" y2="${y(target).toFixed(1)}" stroke="var(--warn)" stroke-width="1" stroke-dasharray="4,3" opacity=".55"/>`:''}<path d="${line}" fill="none" stroke="var(--p)" stroke-width="2.6"/>${dots}${labels}</svg><div class="mq-recovery-progress"><div style="width:${pctMeta}%"></div></div></div>`;
}
function renderProgRecuperacion(){
  const el=document.getElementById('prog-recuperacion-content'); if(!el) return;
  const data=weeklyRecoveryData(new Date().getFullYear());
  const lastWith=k=>[...data].reverse().find(d=>d[k]!==null && typeof d[k]!=='undefined');
  const lSleep=lastWith('sleepAvg'), lCreat=lastWith('creatScore'), lProt=lastWith('protAvg'), lWater=lastWith('waterAvg'), lGen=lastWith('general');
  const kpis=[
    {t:'Sueño',v:lSleep?fmtHours(lSleep.sleepAvg):'Sin datos',s:'promedio semanal'},
    {t:'Creatina',v:lCreat?`${lCreat.creat}/${lCreat.creatDays||7}`:'Sin datos',s:'días semana'},
    {t:'Proteína',v:lProt?`${Math.round(lProt.protAvg)}%`:'Sin datos',s:'cumplimiento'},
    {t:'Agua',v:lWater?`${(lWater.waterAvg||0).toFixed(1)}/10`:'Sin datos',s:'vasos promedio'},
    {t:'Cumplimiento',v:lGen?`${lGen.general}%`:'Sin datos',s:'promedio recuperación'}
  ].map(k=>`<div class="lumen-stat mq-rec-kpi"><div class="lumen-num">${k.v}</div><div class="lumen-lbl">${k.t}</div><div class="lumen-sub">${k.s}</div></div>`).join('');
  el.innerHTML=`<div class="section-label" style="margin-bottom:10px">Recuperación semanal</div><div class="mq-rec-kpi-row">${kpis}</div>${mq178RenderRecoveryChart('sleep','Sueño promedio',data,d=>d.sleepAvg===null?null:Math.round(d.sleepAvg/60*100)/100,{target:7,unit:'h',axisFormat:v=>`${Math.round(v*10)/10}h`,format:(v,d)=>fmtHours(d.sleepAvg),meta:'Meta: 7h promedio',tooltip:d=>fmtHours(d.sleepAvg)})}${mq178RenderRecoveryChart('creatine','Creatina',data,d=>d.creatScore===null?null:d.creat,{target:7,axisFormat:v=>`${Math.round(v)}`,format:(v,d)=>`${d.creat}/${d.creatDays||7}`,meta:'Meta: consumo diario',tooltip:d=>`${d.creat} de ${d.creatDays} días`})}${mq178RenderRecoveryChart('protein','Proteína',data,d=>d.protAvg,{target:100,valueSuffix:'%',format:v=>`${Math.round(v)}%`,meta:'Meta: 100% semanal',tooltip:d=>`${Math.round(d.protAvg)}% promedio`})}${mq178RenderRecoveryChart('water','Agua',data,d=>d.waterAvg,{target:10,unit:'vasos',axisFormat:v=>`${Math.round(v*10)/10}`,format:v=>`${v.toFixed(1)}/10`,meta:'Meta: 10 vasos promedio',tooltip:d=>`${d.waterAvg.toFixed(1)} vasos promedio`})}${mq178RenderRecoveryChart('general','Cumplimiento general',data,d=>d.general,{target:100,valueSuffix:'%',format:v=>`${Math.round(v)}%`,meta:'Promedio simple: sueño, creatina, proteína y agua',tooltip:d=>`${d.general}% recuperación`})}`;
}

// v179: todos los gráficos de Progreso deben usar eje normal; ningún ritmo se invierte.
try{
  if(typeof createPaceChart==='function'){
    const _mqOldCreatePaceChart=createPaceChart;
    createPaceChart=function(runningSessions){
      const cfg=_mqOldCreatePaceChart(runningSessions);
      cfg.subtitle='Evolución por sesión';
      cfg.yAxis=Object.assign({},cfg.yAxis||{},{invertY:false});
      return cfg;
    };
  }
}catch(e){ console.warn('v179 pace chart override skipped', e); }



// ---------------------------------------------------------------
//  MELQART v180 — Hevy history + unified charts + recovery cleanup
// ---------------------------------------------------------------
(function mq180Patch(){
  const V180_KEY='melqart_v180_hevy_history_graphs_applied_v1';

  function mq180Slug(s){
    return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
  }
  function mq180Date(date,time='12:00'){
    return new Date(`${date}T${time}:00`).getTime();
  }
  function mq180SafeLocalDate(ts){
    try{ return typeof localDateStr==='function' ? localDateStr(ts) : new Date(ts).toISOString().slice(0,10); }
    catch(e){ return new Date(ts).toISOString().slice(0,10); }
  }
  function mq180EnsureExercise(id,name,type='barbell',muscle='',restSec=90,grupo=''){
    if(!window.forge) return id;
    if(!forge.exercises) forge.exercises=[];
    let ex=forge.exercises.find(e=>e.id===id);
    if(!ex){
      ex={id,name,type,muscle,restSec,grupo};
      forge.exercises.push(ex);
    }else{
      ex.name=name; ex.type=ex.type||type; ex.muscle=ex.muscle||muscle; ex.restSec=ex.restSec||restSec; ex.grupo=ex.grupo||grupo;
    }
    return id;
  }
  function mq180NormalizeHipThrustMachine(){
    if(!window.forge) return;
    if(!forge.exercises) forge.exercises=[];
    const canonicalId='ex_hip_thrust_maq';
    mq180EnsureExercise(canonicalId,'Hip Thrust (Máquina)','machine','gluteos',180,'Glúteos');
    const aliases=[
      'hiptrust máquina','hiptrust maquina','hip thrust máquina','hip thrust maquina',
      'hip thrust (máquina)','hip thrust (maquina)','empuje de cadera máquina','empuje de caderas máquina'
    ];
    const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
    const dupIds=forge.exercises
      .filter(e=>e.id!==canonicalId && aliases.includes(norm(e.name)))
      .map(e=>e.id);
    (forge.sessions||[]).forEach(sess=>{
      (sess.exercises||[]).forEach(ex=>{
        if(dupIds.includes(ex.exId)) ex.exId=canonicalId;
      });
    });
    (forge.routines||[]).forEach(r=>{
      if(Array.isArray(r.exercises)){
        r.exercises=r.exercises.map(id=>dupIds.includes(id)?canonicalId:id).filter((id,i,a)=>a.indexOf(id)===i);
      }
    });
    forge.exercises = forge.exercises.filter(e=>!dupIds.includes(e.id));
    const c=forge.exercises.find(e=>e.id===canonicalId);
    if(c) c.name='Hip Thrust (Máquina)';
  }
  function mq180RegisterNewExercises(){
    mq180EnsureExercise('ex_peso_muerto_manc','Peso Muerto (Mancuerna)','dumbbell','isquios',150,'Isquiotibiales');
    mq180EnsureExercise('ex_step_manc','Step con Mancuerna','dumbbell','piernas',90,'Piernas');
    mq180EnsureExercise('ex_curl_barra_z','Curl con Barra Z','barbell','biceps',90,'Bíceps');
    mq180EnsureExercise('ex_press_homb_manc','Press Hombros (Mancuernas)','dumbbell','hombros',150,'Hombros');
    mq180EnsureExercise('ex_press_homb_maq','Press Hombros (Máquina)','machine','hombros',150,'Hombros');
    mq180EnsureExercise('ex_crunch','Abdominal Banco Inclinado','bodyweight','core',60,'Core');
    mq180EnsureExercise('ex_dominadas','Dominadas (Peso Corporal)','bodyweight','espalda',150,'Espalda');
    mq180EnsureExercise('ex_correr','Carrera / Trote','run','cardio',0,'Cardio');
  }
  function mq180W(weight,reps){ return {type:'weight',done:true,weight:parseFloat(weight)||0,reps:parseInt(reps)||0,distance:'',time:'',fc:'',pasos:''}; }
  function mq180R(distance,time,fc='',pasos=''){ return {type:'run',done:true,weight:0,reps:0,distance:String(distance||''),time:String(time||''),fc:String(fc||''),pasos:String(pasos||'')}; }
  function mq180Ex(exId,sets){ return {exId,sets}; }
  function mq180Session(date,time,routineName,elapsedMin,exercises){
    return {
      id:`mq180_hevy_${date}_${mq180Slug(routineName)}`,
      routineId:null,
      routineName,
      date:mq180Date(date,time),
      elapsed:Math.round((elapsedMin||0)*60),
      exercises,
      source:'hevy_v180'
    };
  }
  function mq180Volume(session){
    return (session.exercises||[]).reduce((sum,ex)=>{
      const def=(forge.exercises||[]).find(e=>e.id===ex.exId)||{};
      if(def.type==='run'||def.type==='hiit') return sum;
      return sum+(ex.sets||[]).reduce((a,s)=>a+(parseFloat(s.weight)||0)*(parseInt(s.reps)||0),0);
    },0);
  }
  function mq180SetKey(set){
    if(set.type==='run') return `run:${set.distance}:${set.time}`;
    return `w:${set.weight}:${set.reps}`;
  }
  function mq180MergeExerciseSets(targetEx, incomingEx){
    if(!targetEx.sets) targetEx.sets=[];
    const keys=new Set(targetEx.sets.map(mq180SetKey));
    (incomingEx.sets||[]).forEach(st=>{
      const k=mq180SetKey(st);
      if(!keys.has(k)){ targetEx.sets.push(st); keys.add(k); }
    });
  }
  function mq180AddOrMergeSession(incoming){
    if(!forge.sessions) forge.sessions=[];
    incoming.totalVolume=mq180Volume(incoming);
    const day=mq180SafeLocalDate(incoming.date);
    let existing=forge.sessions.find(s=>s.id===incoming.id);
    if(!existing){
      // Si ya existe una sesión del mismo día con al menos un ejercicio coincidente, fusionar para no duplicar.
      existing=forge.sessions.find(s=>mq180SafeLocalDate(s.date)===day && (s.exercises||[]).some(ex=>(incoming.exercises||[]).some(ix=>ix.exId===ex.exId)));
    }
    if(existing){
      if(!existing.exercises) existing.exercises=[];
      (incoming.exercises||[]).forEach(ix=>{
        const tx=existing.exercises.find(e=>e.exId===ix.exId);
        if(tx) mq180MergeExerciseSets(tx,ix);
        else existing.exercises.push(ix);
      });
      existing.elapsed=Math.max(existing.elapsed||0,incoming.elapsed||0);
      existing.totalVolume=mq180Volume(existing);
      existing.source=existing.source||'hevy_v180';
      return 'merged';
    }
    forge.sessions.push(incoming);
    return 'added';
  }
  function mq180SeedHevyHistory(){
    if(!window.forge) return;
    mq180NormalizeHipThrustMachine();
    mq180RegisterNewExercises();
    const S=[
      mq180Session('2026-03-19','15:12','Tren superior',37,[
        mq180Ex('ex_press_inclinado',[mq180W(60,6),mq180W(60,5),mq180W(50,8)]),
        mq180Ex('ex_jalon_pecho',[mq180W(50,10),mq180W(50,10),mq180W(50,10)]),
        mq180Ex('ex_press_homb_manc',[mq180W(28,10),mq180W(28,10),mq180W(28,10)])
      ]),
      mq180Session('2026-03-17','14:37','Tren superior',38,[
        mq180Ex('ex_press_banca',[mq180W(65,8),mq180W(65,8),mq180W(65,5)]),
        mq180Ex('ex_press_homb_maq',[mq180W(30,7),mq180W(30,8),mq180W(30,8)]),
        mq180Ex('ex_curl_barra_z',[mq180W(30,7),mq180W(30,7),mq180W(30,6)])
      ]),
      mq180Session('2026-03-16','14:44','Tren inferior',48,[
        mq180Ex('ex_sentadilla',[mq180W(70,10),mq180W(70,9),mq180W(70,9)]),
        mq180Ex('ex_peso_muerto_manc',[mq180W(50,8),mq180W(60,10)])
      ]),
      mq180Session('2026-03-10','15:07','Tren superior',47,[
        mq180Ex('ex_press_banca',[mq180W(60,8),mq180W(60,8),mq180W(60,6)]),
        mq180Ex('ex_press_hombros',[mq180W(35,9),mq180W(35,9),mq180W(35,8)]),
        mq180Ex('ex_curl_barra_z',[mq180W(30,7),mq180W(30,6),mq180W(30,7)])
      ]),
      mq180Session('2026-03-09','15:06','Tren inferior',42,[
        mq180Ex('ex_sentadilla',[mq180W(60.9,9),mq180W(60.9,8),mq180W(60.9,8)]),
        mq180Ex('ex_peso_muerto_manc',[mq180W(44,8),mq180W(44,9)]),
        mq180Ex('ex_hip_thrust_maq',[mq180W(70.9,10),mq180W(70.9,10),mq180W(70.9,10)]),
        mq180Ex('ex_crunch',[mq180W(0,30),mq180W(0,30),mq180W(0,30)])
      ]),
      mq180Session('2026-02-19','14:57','Tren superior',35,[
        mq180Ex('ex_press_banca',[mq180W(60,8),mq180W(60,8),mq180W(60,7)]),
        mq180Ex('ex_press_hombros',[mq180W(35,8),mq180W(35,8),mq180W(35,7)]),
        mq180Ex('ex_curl_barra_z',[mq180W(30,6),mq180W(30,5)])
      ]),
      mq180Session('2026-02-16','14:54','Tren inferior',56,[
        mq180Ex('ex_sentadilla',[mq180W(60,9),mq180W(60,8),mq180W(60,9)]),
        mq180Ex('ex_peso_muerto_manc',[mq180W(44,8),mq180W(44,9)]),
        mq180Ex('ex_hip_thrust_maq',[mq180W(67.5,9),mq180W(62.7,10),mq180W(62.7,9)]),
        mq180Ex('ex_crunch',[mq180W(0,30),mq180W(0,30),mq180W(0,30)])
      ]),
      mq180Session('2026-02-12','20:54','Tren inferior',40,[
        mq180Ex('ex_sentadilla',[mq180W(60,10),mq180W(60,9),mq180W(60,9)]),
        mq180Ex('ex_peso_muerto_manc',[mq180W(40,8),mq180W(40,8)]),
        mq180Ex('ex_hip_thrust_maq',[mq180W(67.5,7),mq180W(62.7,9),mq180W(62.7,9)])
      ]),
      mq180Session('2026-02-10','14:32','Tren superior',49,[
        mq180Ex('ex_press_banca',[mq180W(60,9),mq180W(60,8),mq180W(60,7)]),
        mq180Ex('ex_press_homb_maq',[mq180W(30,6),mq180W(30,7),mq180W(30,6)]),
        mq180Ex('ex_correr',[mq180R(1.15,'9:52')])
      ]),
      mq180Session('2026-02-08','12:42','Trote - Semanal',53,[
        mq180Ex('ex_correr',[mq180R(7.74,'53:19','',8072)])
      ]),
      mq180Session('2026-02-05','14:40','Tren inferior',43,[
        mq180Ex('ex_sentadilla',[mq180W(60,10),mq180W(60,9),mq180W(60,8)]),
        mq180Ex('ex_peso_muerto_manc',[mq180W(40,8),mq180W(40,8)]),
        mq180Ex('ex_hip_thrust',[mq180W(62.7,10),mq180W(62.7,9),mq180W(62.7,8)]),
        mq180Ex('ex_crunch',[mq180W(0,30),mq180W(0,30),mq180W(0,30)])
      ]),
      mq180Session('2026-02-03','20:51','Tren superior',20,[
        mq180Ex('ex_correr',[mq180R(1.21,'7:18','81',1057)])
      ]),
      mq180Session('2026-01-29','14:07','Tren inferior',46,[
        mq180Ex('ex_sentadilla',[mq180W(40,10),mq180W(50,10),mq180W(55,10),mq180W(60,10)]),
        mq180Ex('ex_peso_muerto_manc',[mq180W(40,8),mq180W(40,8)]),
        mq180Ex('ex_hip_thrust',[mq180W(42.7,9),mq180W(62.7,9),mq180W(62.7,10)]),
        mq180Ex('ex_crunch',[mq180W(0,30),mq180W(0,30),mq180W(0,20)])
      ]),
      mq180Session('2026-01-27','20:56','Trote - Semanal / Tren superior',49,[
        mq180Ex('ex_press_banca',[mq180W(40,10),mq180W(40,11),mq180W(40,9)]),
        mq180Ex('ex_press_hombros',[mq180W(30,9),mq180W(30,8),mq180W(30,7)]),
        mq180Ex('ex_dominadas',[mq180W(0,10),mq180W(0,7),mq180W(0,7)]),
        mq180Ex('ex_correr',[mq180R(2.03,'12:05')])
      ]),
      mq180Session('2026-01-25','09:32','Tren superior',61,[
        mq180Ex('ex_correr',[mq180R(3.52,'21:26','',3110)])
      ]),
      mq180Session('2026-01-18','12:00','Trote - Semanal',46,[
        mq180Ex('ex_correr',[mq180R(6.7,'45:21','',6835)])
      ]),
      mq180Session('2026-01-13','21:03','Trote - Semanal',34,[
        mq180Ex('ex_correr',[mq180R(3.36,'21:09','124',3109)])
      ]),
      mq180Session('2026-01-11','10:22','Trote - Semanal',45,[
        mq180Ex('ex_correr',[mq180R(6.42,'45:08','133',6742)])
      ]),
      mq180Session('2026-01-08','20:48','Tren inferior',31,[
        mq180Ex('ex_step_manc',[mq180W(14,12),mq180W(14,12),mq180W(10,14)]),
        mq180Ex('ex_sent_bulgara',[mq180W(14,7),mq180W(14,7),mq180W(14,5),mq180W(14,5)])
      ])
    ];
    let added=0, merged=0;
    S.forEach(sess=>{
      const res=mq180AddOrMergeSession(sess);
      if(res==='added') added++; else if(res==='merged') merged++;
    });
    forge.sessions.sort((a,b)=>(a.date||0)-(b.date||0));
    if(typeof saveDB==='function') saveDB();
    try{ localStorage.setItem(V180_KEY, JSON.stringify({at:new Date().toISOString(), added, merged})); }catch(e){}
    console.info(`MELQART v180 Hevy history: ${added} nuevas, ${merged} fusionadas`);
  }

  // --- Nutrición: el aceite no castiga adherencia
  window.mq180NutritionAdherencePct=function(portions){
    const groups=['proteinas','lacteoProtein','lacteoDescremado','cereales','frutas','lipidos','verduras']; // aceites excluido
    let done=0,total=0;
    groups.forEach(g=>{
      const t=(typeof NUTRITION_TARGETS!=='undefined' ? (NUTRITION_TARGETS[g]||0) : 0);
      total+=t;
      done+=Math.min(t, parseFloat(portions?.[g]||0));
    });
    return total?Math.round(done/total*100):0;
  };

  // Reescribir exportador nutricional para no castigar aceite y mantener trazabilidad de proteína.
  if(typeof exportNutritionLines==='function'){
    exportNutritionLines=function(fechaInicio,fechaFin){
      const out=[], dates=[];
      for(let i=0;i<localStorage.length;i++){
        const k=localStorage.key(i);
        if(k&&k.startsWith('ff_')){
          const f=k.slice(3), d=new Date(f+'T12:00:00');
          if(d>=fechaInicio&&d<=fechaFin) dates.push(f);
        }
      }
      dates.sort();
      if(!dates.length) return out;
      out.push('NUTRICION');
      out.push('');
      out.push('Fecha       Agua ml  Vasos    MetaH2O  Comidas  Prot  Cere  Frut  Lact  Verd  Lip   Aceit  Adh%');
      out.push('-----------------------------------------------------------------------------------------------');
      let completeDays=0, waterOk=0, waterSum=0;
      dates.forEach(f=>{
        const fd=(typeof getFD==='function')?getFD(f):JSON.parse(localStorage.getItem('ff_'+f)||'{}');
        const meta=getAguaMeta();
        const vasos=fd.aguaVasosHoy ?? fd.agua ?? 0;
        const aguaMl=fd.aguaMl ?? Math.round(vasos*(meta.mlPorVaso||250));
        const metaMl=(meta.vasos||10)*(meta.mlPorVaso||250);
        const meals=getMealProgress(fd);
        const calc=calcNutritionDayDetail(fd);
        const p=calc.portions||{};
        const adh=window.mq180NutritionAdherencePct(p);
        if(aguaMl>=metaMl) waterOk++;
        waterSum+=parseFloat(vasos)||0;
        if(meals.done===meals.total) completeDays++;
        const fmt=f.split('-').reverse().join('/');
        out.push(`${fmt.padEnd(10)}  ${String(aguaMl).padEnd(7)}  ${String(vasos+'/'+(meta.vasos||10)).padEnd(7)}  ${(aguaMl>=metaMl?'S':'N').padEnd(7)}  ${String(meals.done+'/'+meals.total).padEnd(7)}  ${String(nRound(p.proteinas||0,2)).padEnd(5)} ${String(nRound(p.cereales||0,2)).padEnd(5)} ${String(nRound(p.frutas||0,2)).padEnd(5)} ${String(nRound((p.lacteoProtein||0)+(p.lacteoDescremado||0),2)).padEnd(5)} ${String(nRound(p.verduras||0,2)).padEnd(5)} ${String(nRound(p.lipidos||0,2)).padEnd(5)} ${String(nRound(p.aceites||0,2)).padEnd(6)} ${String(adh+'%').padEnd(5)}`);
      });
      out.push('');
      out.push(`Resumen (${dates.length} dias con registro):`);
      out.push(`  Agua promedio/dia:         ${Math.round(waterSum/Math.max(dates.length,1))}/10 vasos - meta cumplida ${waterOk}/${dates.length} dias (${Math.round(waterOk/Math.max(dates.length,1)*100)}%)`);
      out.push(`  Comidas dias completos:    ${completeDays}/${dates.length} dias (${Math.round(completeDays/Math.max(dates.length,1)*100)}%)`);
      out.push(`  Adherencia pauta promedio: calculada sin castigo por aceite`);
      return out;
    };
  }

  // --- Recuperación: creatina en %, semana en curso por días transcurridos y ejes Y claros.
  if(typeof weeklyRecoveryData==='function'){
    weeklyRecoveryData=function(year=new Date().getFullYear()){
      const todayStr=today();
      return getWeekRangesForYear(year).map(w=>{
        const days=datesBetween(w.start,w.end).filter(f=>f<=todayStr && f.startsWith(String(year)));
        const sleepVals=days.map(getSleepMinutesForDate).filter(v=>v!==null);
        const sleepAvg=sleepVals.length ? sleepVals.reduce((a,b)=>a+b,0)/sleepVals.length : null;
        const creat=days.filter(getCreatinaTomadaOficial).length;
        const creatDays=days.length;
        const creatPct=creatDays ? Math.round(creat/creatDays*100) : null;
        const protValid=days.map(getProteinPctForDate).filter(v=>v!==null && !isNaN(v));
        const protAvg=protValid.length ? protValid.map(v=>Math.min(100,v)).reduce((a,b)=>a+b,0)/protValid.length : null;
        const waterValid=days.map(getWaterVasosForDate).filter(v=>v!==null && !isNaN(v));
        const waterAvg=waterValid.length ? waterValid.reduce((a,b)=>a+b,0)/waterValid.length : null;
        const sleepScore=sleepAvg===null?null:Math.min(100,Math.round((sleepAvg/420)*100));
        const waterScore=waterAvg===null?null:Math.min(100,Math.round(waterAvg/(getAguaMeta().vasos||10)*100));
        const parts=[sleepScore,creatPct,protAvg===null?null:Math.round(protAvg),waterScore].filter(v=>v!==null && !isNaN(v));
        const general=parts.length===4 ? Math.round(parts.reduce((a,b)=>a+b,0)/4) : null;
        return {...w,days:creatDays,sleepAvg,sleepScore,creat,creatDays,creatPct,creatScore:creatPct,protAvg,protScore:protAvg===null?null:Math.round(protAvg),waterAvg,waterScore,general};
      });
    };
  }
  if(typeof renderProgRecuperacion==='function'){
    renderProgRecuperacion=function(){
      const el=document.getElementById('prog-recuperacion-content'); if(!el) return;
      const data=weeklyRecoveryData(new Date().getFullYear());
      const lastWith=k=>[...data].reverse().find(d=>d[k]!==null && typeof d[k]!=='undefined' && !isNaN(d[k]));
      const lSleep=lastWith('sleepAvg'), lCreat=lastWith('creatPct'), lProt=lastWith('protAvg'), lWater=lastWith('waterAvg'), lGen=lastWith('general');
      const kpis=[
        {t:'Sueño',v:lSleep?fmtHours(lSleep.sleepAvg):'Sin datos',s:'promedio semanal'},
        {t:'Creatina',v:lCreat?`${lCreat.creatPct}%`:'Sin datos',s:lCreat?`${lCreat.creat}/${lCreat.creatDays} días`:'cumplimiento'},
        {t:'Proteína',v:lProt?`${Math.round(lProt.protAvg)}%`:'Sin datos',s:'cumplimiento'},
        {t:'Agua',v:lWater?`${(lWater.waterAvg||0).toFixed(1)}/10`:'Sin datos',s:'vasos promedio'},
        {t:'Cumplimiento',v:lGen?`${lGen.general}%`:'Sin datos',s:'4 indicadores'}
      ].map(k=>`<div class="lumen-stat mq-rec-kpi"><div class="lumen-num">${k.v}</div><div class="lumen-lbl">${k.t}</div><div class="lumen-sub">${k.s}</div></div>`).join('');
      el.innerHTML=`<div class="section-label" style="margin-bottom:10px">Recuperación semanal</div><div class="mq-rec-kpi-row">${kpis}</div>${
        mq178RenderRecoveryChart('sleep','Sueño promedio',data,d=>d.sleepAvg===null?null:Math.round(d.sleepAvg/60*100)/100,{target:7,unit:'h',axisFormat:v=>`${Math.round(v*10)/10}h`,format:(v,d)=>fmtHours(d.sleepAvg),meta:'Meta: 7h promedio',tooltip:d=>fmtHours(d.sleepAvg)})}${
        mq178RenderRecoveryChart('creatine','Creatina',data,d=>d.creatPct,{target:100,valueSuffix:'%',axisFormat:v=>`${Math.round(v)}%`,format:v=>`${Math.round(v)}%`,meta:'Meta: 100% de días transcurridos',tooltip:d=>`${d.creat} de ${d.creatDays} días`})}${
        mq178RenderRecoveryChart('protein','Proteína',data,d=>d.protAvg,{target:100,valueSuffix:'%',format:v=>`${Math.round(v)}%`,meta:'Meta: 100% semanal',tooltip:d=>`${Math.round(d.protAvg)}% promedio`})}${
        mq178RenderRecoveryChart('water','Agua',data,d=>d.waterAvg,{target:10,unit:'vasos',axisFormat:v=>`${Math.round(v*10)/10}`,format:v=>`${v.toFixed(1)}/10`,meta:'Meta: 10 vasos promedio',tooltip:d=>`${d.waterAvg.toFixed(1)} vasos promedio`})}${
        mq178RenderRecoveryChart('general','Cumplimiento general',data,d=>d.general,{target:100,valueSuffix:'%',format:v=>`${Math.round(v)}%`,meta:'Promedio simple de 4 indicadores',tooltip:d=>`${d.general}% recuperación`})}`;
    };
  }

  // --- Gráfico genérico v180: ancho útil, eje Y, tooltip y tendencia lineal.
  function mq180Trend(data, toX, toY){
    if(!data || data.length<2) return '';
    const pts=data.map((p,i)=>({x:i,y:parseFloat(p.value)})).filter(p=>!isNaN(p.y));
    const n=pts.length; if(n<2) return '';
    const sx=pts.reduce((a,p)=>a+p.x,0), sy=pts.reduce((a,p)=>a+p.y,0);
    const sxx=pts.reduce((a,p)=>a+p.x*p.x,0), sxy=pts.reduce((a,p)=>a+p.x*p.y,0);
    const den=n*sxx-sx*sx; if(!den) return '';
    const m=(n*sxy-sx*sy)/den, b=(sy-m*sx)/n;
    const first=0, last=data.length-1;
    return `<line x1="${toX(first).toFixed(1)}" y1="${toY(m*first+b).toFixed(1)}" x2="${toX(last).toFixed(1)}" y2="${toY(m*last+b).toFixed(1)}" stroke="var(--border2)" stroke-width="2" stroke-dasharray="5,4" opacity=".9"/>`;
  }
  if(typeof renderMetricChart==='function'){
    renderMetricChart=function(config){
      const { id='chart_'+Date.now(), title='', subtitle='', unitLabel='', type='weight', unit='', yAxis={}, tooltip={}, filters, activeFilter, onFilter, height:H=220, color='var(--orange)', areaOpacity=0.12 }=config;
      const allData=normalizeChartData(config.data,type);
      const range=activeFilter||'all';
      const data=applyTimeFilter(allData,range);
      const headerHtml=`<div class="mq-chart-header"><div><div class="mq-chart-title">${title}</div>${subtitle?`<div class="mq-chart-subtitle">${subtitle}</div>`:''}</div><div class="mq-chart-unit">${unitLabel}</div></div>`;
      let filtersHtml='';
      if(filters&&filters.length&&onFilter){
        const labels={'7d':'7d','30d':'1M','1m':'1M','3m':'3M','6m':'6M','12m':'12M','all':'Todo'};
        filtersHtml=`<div class="mq-chart-filters">`+filters.map(f=>`<button class="mq-chart-filter-btn${f===range?' on':''}" onclick="${onFilter}('${f}')">${labels[f]||f}</button>`).join('')+`</div>`;
      }
      if(!data||data.length<2){
        return `<div class="mq-chart-card mq-chart-card-v180" id="${id}">${headerHtml}${filtersHtml}<div class="mq-chart-empty"><div class="mq-chart-empty-text">Pocos datos en este período</div><div class="mq-chart-empty-sub">Registra al menos 2 datos para ver tendencia</div></div></div>`;
      }
      const PL=(type==='body_measure'||type==='heartrate'||type==='pace'||type==='percentage')?58:50;
      const PB=30,PT=14,PR=14;
      const n=data.length;
      const W=Math.max(390,PL+PR+n*(n>40?8:n>20?12:18));
      const vals=data.map(p=>parseFloat(p.value)).filter(v=>!isNaN(v));
      const [domMin,domMax]=calculateYAxisDomain(vals,yAxis);
      const toX=i=>PL+(i/(n-1||1))*(W-PL-PR);
      const toY=v=>PT+(1-((v-domMin)/(domMax-domMin||1)))*(H-PT-PB);
      const xs=data.map((_,i)=>toX(i)), ys=data.map(p=>toY(parseFloat(p.value)));
      const linePath=xs.map((x,i)=>`${i===0?'M':'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
      const areaPath=linePath+` L${xs[n-1].toFixed(1)},${H-PB} L${xs[0].toFixed(1)},${H-PB} Z`;
      const tickCount=4;
      const yTicksHtml=Array.from({length:tickCount+1},(_,i)=>{
        const v=domMax-(domMax-domMin)*(i/tickCount);
        const y=toY(v);
        return `<text x="${PL-5}" y="${y.toFixed(1)}" text-anchor="end" dominant-baseline="middle" fill="var(--ink3)" font-size="9">${formatAxisTick(v,type,unit)}</text><line x1="${PL}" y1="${y.toFixed(1)}" x2="${W-PR}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-width="1" stroke-dasharray="3,3"/>`;
      }).join('');
      const xStep=Math.max(1,Math.ceil(n/5));
      const xTicksHtml=data.map((p,i)=>(i%xStep===0||i===n-1)?`<text x="${xs[i].toFixed(1)}" y="${H-4}" text-anchor="middle" fill="var(--ink3)" font-size="9">${p.label||''}</text>`:'').join('');
      const dotsHtml=data.map((p,i)=>{
        const isSmithPoint=p.equipment?detectSmith(p.value,p.equipment):detectSmith(p.value);
        const ttMain=(p.displayValue||formatMetricValue(p.value,type,unit)||'').replace(/"/g,'&quot;');
        const ttSub=[tooltip.showReps&&p.reps?`${p.sets||'?'}×${p.reps} reps`:'',tooltip.showEquipment&&isSmithPoint?'Smith':(tooltip.showEquipment&&p.equipment?p.equipment:''),tooltip.showNotes&&p.notes?p.notes:''].filter(Boolean).join(' · ').replace(/"/g,'&quot;');
        const safeDate=(p.date||'').replace(/"/g,'&quot;');
        return `<circle cx="${xs[i].toFixed(1)}" cy="${ys[i].toFixed(1)}" r="${n>40?2.6:n>20?3.4:4.4}" fill="${isSmithPoint&&n<60?'var(--green)':color}" stroke="var(--bg2)" stroke-width="1.4" style="cursor:pointer" onmouseenter="mqChartTooltipShow(event,'${safeDate}','${ttMain}','${ttSub}')" onmouseleave="mqChartTooltipHide()" onclick="mqChartTooltipShow(event,'${safeDate}','${ttMain}','${ttSub}')" ontouchstart="mqChartTooltipShow(event,'${safeDate}','${ttMain}','${ttSub}')"></circle>`;
      }).join('');
      const trend=mq180Trend(data,toX,toY);
      const safeId=String(id).replace(/[^a-z0-9]/gi,'_');
      return `<div class="mq-chart-card mq-chart-card-v180" id="${id}">${headerHtml}<div class="mq-chart-svg-wrap" style="overflow-x:${n>18?'auto':'hidden'}"><svg width="${n>18?W:'100%'}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block"><defs><linearGradient id="mq_area_grad_${safeId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity="${areaOpacity*2}"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>${yTicksHtml}<line x1="${PL}" y1="${PT}" x2="${PL}" y2="${H-PB}" stroke="var(--border)"/><line x1="${PL}" y1="${H-PB}" x2="${W-PR}" y2="${H-PB}" stroke="var(--border)"/>${xTicksHtml}<path d="${areaPath}" fill="url(#mq_area_grad_${safeId})"/><path d="${linePath}" stroke="${color}" stroke-width="2.6" fill="none" stroke-linejoin="round" stroke-linecap="round"/>${trend}${dotsHtml}</svg></div>${filtersHtml}</div>`;
    };
  }

  // Ejecutar migración al cargar.
  try{
    mq180SeedHevyHistory();
    if(typeof saveDB==='function') saveDB();
    setTimeout(()=>{ try{ if(typeof renderAll==='function') renderAll(); }catch(e){} }, 150);
  }catch(e){ console.warn('MELQART v180 migration failed', e); }
})();




// ---------------------------------------------------------------
//  MELQART v181.1 — migración real Hevy + fixes críticos UI
// ---------------------------------------------------------------
(function mq1811(){
  const MIGRATION_ID = 'melqart_v181_1_hevy_real_migration';
  const LOG_PREFIX = 'MELQART v181.1';

  function slug(s){ return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,''); }
  function norm(s){ return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(); }
  function ts(date,time='12:00'){ return new Date(`${date}T${time}:00`).getTime(); }
  function dayOf(x){ try{ return typeof localDateStr==='function' ? localDateStr(x) : new Date(x).toISOString().slice(0,10); }catch(e){ return new Date(x).toISOString().slice(0,10); } }
  function W(weight,reps){ return {type:'weight',done:true,weight:parseFloat(weight)||0,reps:parseInt(reps)||0,distance:'',time:'',fc:'',pasos:''}; }
  function R(distance,time,fc='',pasos=''){ return {type:'run',done:true,weight:0,reps:0,distance:String(distance||''),time:String(time||''),fc:String(fc||''),pasos:String(pasos||'')}; }
  function EX(exId,sets){ return {exId,sets}; }
  function ensureArray(obj,key){ if(!obj[key]) obj[key]=[]; return obj[key]; }

  function ensureExercise(id,name,type='barbell',muscle='',restSec=90,grupo=''){
    if(!window.forge) return id;
    ensureArray(forge,'exercises');
    let ex=forge.exercises.find(e=>e.id===id);
    if(!ex){
      ex={id,name,type,muscle,restSec,grupo};
      forge.exercises.push(ex);
    }else{
      ex.name=name;
      ex.type=type||ex.type;
      ex.muscle=muscle||ex.muscle;
      ex.restSec=restSec||ex.restSec;
      ex.grupo=grupo||ex.grupo;
    }
    return id;
  }

  function registerExercises(){
    ensureExercise('ex_sentadilla','Sentadilla (Barra)','barbell','cuadriceps',180,'Cuádriceps');
    ensureExercise('ex_peso_muerto_manc','Peso Muerto (Mancuerna)','dumbbell','isquios',150,'Isquiotibiales');
    ensureExercise('ex_peso_muerto','Peso Muerto (Barra)','barbell','isquios',180,'Isquiotibiales');
    ensureExercise('ex_hip_thrust','Hip Thrust (Barra)','barbell','gluteos',180,'Glúteos');
    ensureExercise('ex_hip_thrust_maq','Hip Thrust (Máquina)','machine','gluteos',180,'Glúteos');
    ensureExercise('ex_step_manc','Step con Mancuerna','dumbbell','piernas',90,'Piernas');
    ensureExercise('ex_sent_bulgara','Sentadilla Búlgara','dumbbell','gluteos',120,'Glúteos');
    ensureExercise('ex_crunch','Abdominal Banco Inclinado','bodyweight','core',60,'Core');
    ensureExercise('ex_press_banca','Press Banca (Barra)','barbell','pecho',180,'Pecho');
    ensureExercise('ex_press_inclinado','Press Inclinado (Barra)','barbell','pecho',180,'Pecho');
    ensureExercise('ex_press_hombros','Press Hombros (Barra)','barbell','hombros',150,'Hombros');
    ensureExercise('ex_press_homb_manc','Press Hombros (Mancuernas)','dumbbell','hombros',150,'Hombros');
    ensureExercise('ex_press_homb_maq','Press Hombros (Máquina)','machine','hombros',150,'Hombros');
    ensureExercise('ex_curl_barra_z','Curl con Barra Z','barbell','biceps',90,'Bíceps');
    ensureExercise('ex_dominadas','Dominadas (Peso Corporal)','bodyweight','espalda',150,'Espalda');
    ensureExercise('ex_jalon_pecho','Jalón al Pecho (Cable)','cable','espalda',150,'Espalda');
    ensureExercise('ex_correr','Carrera / Trote','run','cardio',0,'Cardio');
  }

  function normalizeHipThrustMachine(){
    if(!window.forge) return 0;
    ensureArray(forge,'exercises');
    registerExercises();
    const canonical='ex_hip_thrust_maq';
    const canonicalNames=[
      'hiptrust maquina','hiptrust máquina','hip thrust maquina','hip thrust máquina',
      'hip thrust (maquina)','hip thrust (máquina)','empuje de cadera maquina','empuje de cadera máquina',
      'empuje de caderas maquina','empuje de caderas máquina'
    ].map(norm);
    const dupIds=[];
    forge.exercises.forEach(e=>{
      if(e.id!==canonical && canonicalNames.includes(norm(e.name))) dupIds.push(e.id);
    });
    (forge.sessions||[]).forEach(sess=>{
      (sess.exercises||[]).forEach(ex=>{
        const exDef=forge.exercises.find(e=>e.id===ex.exId);
        if(dupIds.includes(ex.exId) || canonicalNames.includes(norm(exDef?.name||ex.name||''))){
          ex.exId=canonical;
          delete ex.name;
        }
      });
      // fusionar ejercicios repetidos dentro de la misma sesión
      const by={};
      (sess.exercises||[]).forEach(ex=>{
        if(!by[ex.exId]) by[ex.exId]={exId:ex.exId,sets:[]};
        const existing=new Set(by[ex.exId].sets.map(setKey));
        (ex.sets||[]).forEach(st=>{ const k=setKey(st); if(!existing.has(k)){ by[ex.exId].sets.push(st); existing.add(k); } });
      });
      sess.exercises=Object.values(by);
    });
    (forge.routines||[]).forEach(r=>{
      if(Array.isArray(r.exercises)){
        r.exercises=r.exercises.map(id=>dupIds.includes(id)?canonical:id).filter((id,i,a)=>a.indexOf(id)===i);
      }
    });
    forge.exercises=forge.exercises.filter(e=>!dupIds.includes(e.id));
    const c=forge.exercises.find(e=>e.id===canonical);
    if(c) c.name='Hip Thrust (Máquina)';
    return dupIds.length;
  }

  function volume(session){
    return (session.exercises||[]).reduce((sum,ex)=>{
      const def=(forge.exercises||[]).find(e=>e.id===ex.exId)||{};
      if(def.type==='run'||def.type==='hiit'||ex.exId==='ex_correr') return sum;
      return sum+(ex.sets||[]).reduce((a,s)=>a+(parseFloat(s.weight)||0)*(parseInt(s.reps)||0),0);
    },0);
  }
  function setKey(st){ return st.type==='run' ? `r:${st.distance}:${st.time}:${st.fc}:${st.pasos}` : `w:${st.weight}:${st.reps}`; }
  function mergeSets(target,incoming){
    if(!target.sets) target.sets=[];
    const keys=new Set(target.sets.map(setKey));
    (incoming.sets||[]).forEach(st=>{ const k=setKey(st); if(!keys.has(k)){ target.sets.push(st); keys.add(k); } });
  }
  function session(date,time,kind,elapsedMin,exercises){
    const routineName = kind === 'trote' ? 'Trote' : (kind === 'superior' ? 'Tren superior' : 'Tren inferior');
    return {
      id:`mq181_hevy_${date}_${kind}`,
      routineId:null,
      routineName,
      date:ts(date,time),
      elapsed:Math.round((elapsedMin||0)*60),
      exercises,
      source:'hevy_v181_1',
      tipoHevy:kind
    };
  }
  function hasOverlap(a,b){
    const idsA=new Set((a.exercises||[]).map(e=>e.exId));
    return (b.exercises||[]).some(e=>idsA.has(e.exId));
  }
  function similarSession(existing,incoming){
    const sameDay=dayOf(existing.date)===dayOf(incoming.date);
    if(!sameDay) return false;
    if(existing.id===incoming.id) return true;
    const er=String(existing.routineName||'').toLowerCase();
    const ir=String(incoming.routineName||'').toLowerCase();
    if(ir.includes('trote') || incoming.exercises?.some(e=>e.exId==='ex_correr')){
      return (existing.exercises||[]).some(e=>e.exId==='ex_correr');
    }
    if(ir.includes('superior')) return (er.includes('superior') || hasOverlap(existing,incoming)) && !er.includes('inferior');
    if(ir.includes('inferior')) return (er.includes('inferior') || hasOverlap(existing,incoming)) && !er.includes('superior');
    return hasOverlap(existing,incoming);
  }
  function addOrMerge(incoming){
    ensureArray(forge,'sessions');
    incoming.totalVolume=volume(incoming);
    let existing=forge.sessions.find(s=>s.id===incoming.id) || forge.sessions.find(s=>similarSession(s,incoming));
    if(existing){
      // Si el nombre era libre y ahora tenemos categoría clara, renombrar.
      const er=String(existing.routineName||'').toLowerCase();
      if(er.includes('libre') || !existing.routineName || (incoming.routineName==='Trote' && !(existing.exercises||[]).some(e=>e.exId!=='ex_correr'))){
        existing.routineName=incoming.routineName;
      }
      existing.source=existing.source||incoming.source;
      existing.tipoHevy=existing.tipoHevy||incoming.tipoHevy;
      existing.elapsed=Math.max(existing.elapsed||0,incoming.elapsed||0);
      ensureArray(existing,'exercises');
      (incoming.exercises||[]).forEach(ix=>{
        const tx=existing.exercises.find(e=>e.exId===ix.exId);
        if(tx) mergeSets(tx,ix); else existing.exercises.push(ix);
      });
      existing.totalVolume=volume(existing);
      return 'merged';
    }
    forge.sessions.push(incoming);
    return 'added';
  }

  function hevySessions(){
    return [
      session('2026-03-19','15:12','superior',37,[EX('ex_press_inclinado',[W(60,6),W(60,5),W(50,8)]),EX('ex_jalon_pecho',[W(50,10),W(50,10),W(50,10)]),EX('ex_press_homb_manc',[W(28,10),W(28,10),W(28,10)])]),
      session('2026-03-17','14:37','superior',38,[EX('ex_press_banca',[W(65,8),W(65,8),W(65,5)]),EX('ex_press_homb_maq',[W(30,7),W(30,8),W(30,8)]),EX('ex_curl_barra_z',[W(30,7),W(30,7),W(30,6)])]),
      session('2026-03-16','14:44','inferior',48,[EX('ex_sentadilla',[W(70,10),W(70,9),W(70,9)]),EX('ex_peso_muerto_manc',[W(50,8),W(60,10)])]),
      session('2026-03-10','15:07','superior',47,[EX('ex_press_banca',[W(60,8),W(60,8),W(60,6)]),EX('ex_press_hombros',[W(35,9),W(35,9),W(35,8)]),EX('ex_curl_barra_z',[W(30,7),W(30,6),W(30,7)])]),
      session('2026-03-09','15:06','inferior',42,[EX('ex_sentadilla',[W(60.9,9),W(60.9,8),W(60.9,8)]),EX('ex_peso_muerto_manc',[W(44,8),W(44,9)]),EX('ex_hip_thrust_maq',[W(70.9,10),W(70.9,10),W(70.9,10)]),EX('ex_crunch',[W(0,30),W(0,30),W(0,30)])]),
      session('2026-02-19','14:57','superior',35,[EX('ex_press_banca',[W(60,8),W(60,8),W(60,7)]),EX('ex_press_hombros',[W(35,8),W(35,8),W(35,7)]),EX('ex_curl_barra_z',[W(30,6),W(30,5)])]),
      session('2026-02-16','14:54','inferior',56,[EX('ex_sentadilla',[W(60,9),W(60,8),W(60,9)]),EX('ex_peso_muerto_manc',[W(44,8),W(44,9)]),EX('ex_hip_thrust_maq',[W(67.5,9),W(62.7,10),W(62.7,9)]),EX('ex_crunch',[W(0,30),W(0,30),W(0,30)])]),
      session('2026-02-12','20:54','inferior',40,[EX('ex_sentadilla',[W(60,10),W(60,9),W(60,9)]),EX('ex_peso_muerto_manc',[W(40,8),W(40,8)]),EX('ex_hip_thrust_maq',[W(67.5,7),W(62.7,9),W(62.7,9)])]),
      session('2026-02-10','14:32','superior',49,[EX('ex_press_banca',[W(60,9),W(60,8),W(60,7)]),EX('ex_press_homb_maq',[W(30,6),W(30,7),W(30,6)])]),
      session('2026-02-10','14:32','trote',10,[EX('ex_correr',[R(1.15,'9:52')])]),
      session('2026-02-08','12:42','trote',53,[EX('ex_correr',[R(7.74,'53:19','',8072)])]),
      session('2026-02-05','14:40','inferior',43,[EX('ex_sentadilla',[W(60,10),W(60,9),W(60,8)]),EX('ex_peso_muerto_manc',[W(40,8),W(40,8)]),EX('ex_hip_thrust',[W(62.7,10),W(62.7,9),W(62.7,8)]),EX('ex_crunch',[W(0,30),W(0,30),W(0,30)])]),
      session('2026-02-03','20:51','trote',20,[EX('ex_correr',[R(1.21,'7:18','81',1057)])]),
      session('2026-01-29','14:07','inferior',46,[EX('ex_sentadilla',[W(40,10),W(50,10),W(55,10),W(60,10)]),EX('ex_peso_muerto_manc',[W(40,8),W(40,8)]),EX('ex_hip_thrust',[W(42.7,9),W(62.7,9),W(62.7,10)]),EX('ex_crunch',[W(0,30),W(0,30),W(0,20)])]),
      session('2026-01-27','20:56','superior',37,[EX('ex_press_banca',[W(40,10),W(40,11),W(40,9)]),EX('ex_press_hombros',[W(30,9),W(30,8),W(30,7)]),EX('ex_dominadas',[W(0,10),W(0,7),W(0,7)])]),
      session('2026-01-27','20:56','trote',12,[EX('ex_correr',[R(2.03,'12:05')])]),
      session('2026-01-25','09:32','trote',21,[EX('ex_correr',[R(3.52,'21:26','',3110)])]),
      session('2026-01-18','12:00','trote',46,[EX('ex_correr',[R(6.7,'45:21','',6835)])]),
      session('2026-01-13','21:03','trote',34,[EX('ex_correr',[R(3.36,'21:09','124',3109)])]),
      session('2026-01-11','10:22','trote',45,[EX('ex_correr',[R(6.42,'45:08','133',6742)])]),
      session('2026-01-08','20:48','inferior',31,[EX('ex_step_manc',[W(14,12),W(14,12),W(10,14)]),EX('ex_sent_bulgara',[W(14,7),W(14,7),W(14,5),W(14,5)])])
    ];
  }

  function runMigration(reason='auto'){
    if(!window.forge || !Array.isArray(forge.sessions)) return false;
    registerExercises();
    const dup=normalizeHipThrustMachine();
    let added=0, merged=0;
    hevySessions().forEach(s=>{ const r=addOrMerge(s); if(r==='added') added++; else merged++; });
    normalizeHipThrustMachine();
    forge.sessions.sort((a,b)=>(a.date||0)-(b.date||0));
    try{ if(typeof saveDB==='function') saveDB(); }catch(e){}
    try{ localStorage.setItem(MIGRATION_ID, JSON.stringify({at:new Date().toISOString(),reason,added,merged,hipThrustDupRemoved:dup,totalSessions:forge.sessions.length})); }catch(e){}
    console.info(`${LOG_PREFIX}: migración ${reason} · agregadas ${added} · fusionadas ${merged} · sesiones ${forge.sessions.length}`);
    return added>0 || merged>0 || dup>0;
  }
  window.melqartFix181 = () => { const changed=runMigration('manual'); try{ renderAll(); }catch(e){} return changed; };

  // Ejecutar varias veces: antes y después de la carga desde nube, porque Firebase puede sobrescribir local.
  function scheduleMigration(){
    [250,1200,2600,5200,9000].forEach(ms=>setTimeout(()=>{ const changed=runMigration(`t+${ms}`); if(changed){ try{ renderAll(); }catch(e){} } },ms));
  }
  scheduleMigration();

  // Hook renderAll para asegurar que, aunque una carga remota llegue tarde, se normalice antes de renderizar.
  if(typeof renderAll==='function' && !window._mq181RenderAllHooked){
    const oldRenderAll=renderAll;
    window._mq181RenderAllHooked=true;
    renderAll=function(){
      runMigration('renderAll');
      return oldRenderAll.apply(this,arguments);
    };
  }

  // Fix segmentadores de peso / medidas: aplicar filtro antes de renderizar.
  if(typeof setBodyAccFiltro==='function'){
    setBodyAccFiltro=function(key,filtro){
      if(!window._bodyAccFiltro) window._bodyAccFiltro={};
      if(!window._bodyAccState) window._bodyAccState={};
      window._bodyAccFiltro[key]=filtro;
      if(key==='peso'){
        window._bodyAccState['resumen']=true;
        if(typeof renderProgCuerpo==='function') renderProgCuerpo();
        setTimeout(()=>{ window._bodyAccState['resumen']=true; },0);
        return;
      }
      const bodyEl=document.getElementById('body-acc-body-'+key);
      if(bodyEl && typeof buildBodyAccBody==='function') bodyEl.innerHTML=buildBodyAccBody(key,filtro,window._cuerpoMets||[]);
    };
  }

  // Fix tooltips de Recuperación: usar tooltip global en hover/click/touch, no solo <title>.
  if(typeof mq178RenderRecoveryChart==='function'){
    mq178RenderRecoveryChart=function(key,title,data,getVal,opts={}){
      const filtered=mq178FilterWeeks(data,key).filter(d=>getVal(d)!==null && typeof getVal(d)!=='undefined' && !isNaN(getVal(d)));
      if(filtered.length<2){
        return `<div class="mq-recovery-chart card"><div class="mq-recovery-chart-head"><div><strong>${title}</strong></div></div>${mq178Seg(key)}<div class="mq-empty-small">Sin datos suficientes</div></div>`;
      }
      const W=360,H=168,PL=52,PR=14,PT=18,PB=30;
      const vals=filtered.map(getVal);
      const target=opts.target||0;
      const allVals=target?vals.concat([target]):vals;
      let minRaw=Math.min(...allVals), maxRaw=Math.max(...allVals);
      if(opts.valueSuffix==='%' && minRaw===maxRaw){ minRaw=Math.max(0,minRaw-5); maxRaw=Math.min(100,maxRaw+5); }
      const span=Math.max(maxRaw-minRaw,1);
      const minV=Math.max(0,minRaw-span*.18), maxV=maxRaw+span*.18;
      const xs=filtered.map((_,i)=>PL+(i/(Math.max(filtered.length-1,1)))*(W-PL-PR));
      const y=v=>PT+(1-((v-minV)/(maxV-minV)))*(H-PT-PB);
      const line=filtered.map((d,i)=>`${i===0?'M':'L'}${xs[i].toFixed(1)},${y(getVal(d)).toFixed(1)}`).join(' ');
      const ticks=[maxV,minV+(maxV-minV)/2,minV];
      const yAxis=ticks.map(v=>`<text x="${PL-6}" y="${y(v).toFixed(1)}" text-anchor="end" dominant-baseline="middle" font-size="9" fill="var(--ink3)">${mq179FormatAxis(v,opts)}</text><line x1="${PL}" y1="${y(v).toFixed(1)}" x2="${W-PR}" y2="${y(v).toFixed(1)}" stroke="var(--border)" stroke-width="1" stroke-dasharray="3,3"/>`).join('');
      const labels=filtered.map((d,i)=> i%Math.ceil(filtered.length/5)===0 || i===filtered.length-1 ? `<text x="${xs[i].toFixed(1)}" y="${H-6}" text-anchor="middle" font-size="9" fill="var(--ink3)">${mq178WeekLabel(d.start)}</text>` : '').join('');
      const dots=filtered.map((d,i)=>{
        const val=getVal(d);
        const main=(opts.tooltip?opts.tooltip(d):String(val)).replace(/"/g,'&quot;');
        const date=mq178WeekLabel(d.start).replace(/"/g,'&quot;');
        return `<circle cx="${xs[i].toFixed(1)}" cy="${y(val).toFixed(1)}" r="4.2" fill="var(--p)" stroke="var(--bg2)" stroke-width="1.4" style="cursor:pointer" onmouseenter="mqChartTooltipShow(event,'${date}','${main}','${title.replace(/"/g,'&quot;')}')" onmouseleave="mqChartTooltipHide()" onclick="mqChartTooltipShow(event,'${date}','${main}','${title.replace(/"/g,'&quot;')}')" ontouchstart="mqChartTooltipShow(event,'${date}','${main}','${title.replace(/"/g,'&quot;')}')"></circle>`;
      }).join('');
      const last=filtered[filtered.length-1], lastVal=getVal(last);
      const display=opts.format?opts.format(lastVal,last):lastVal;
      const pctMeta=target?Math.min(100,Math.round(lastVal/target*100)):Math.min(100,Math.round(lastVal));
      return `<div class="mq-recovery-chart card"><div class="mq-recovery-chart-head"><div><strong>${title}</strong></div><div class="mq-recovery-chart-val">${display}</div></div><div class="mq-recovery-chart-meta">${opts.meta||''}</div>${mq178Seg(key)}<svg viewBox="0 0 ${W} ${H}" class="mq-recovery-svg">${yAxis}<line x1="${PL}" y1="${PT}" x2="${PL}" y2="${H-PB}" stroke="var(--border)"/><line x1="${PL}" y1="${H-PB}" x2="${W-PR}" y2="${H-PB}" stroke="var(--border)"/>${target?`<line x1="${PL}" y1="${y(target).toFixed(1)}" x2="${W-PR}" y2="${y(target).toFixed(1)}" stroke="var(--warn)" stroke-width="1" stroke-dasharray="4,3" opacity=".55"/>`:''}<path d="${line}" fill="none" stroke="var(--p)" stroke-width="2.6"/>${dots}${labels}</svg><div class="mq-recovery-progress"><div style="width:${pctMeta}%"></div></div></div>`;
    };
  }

})();




// ---------------------------------------------------------------
// MELQART v181.2 — ID canónico real para Hevy y ejercicios duplicados
// ---------------------------------------------------------------
(function mq1812(){
  const LOG='MELQART v181.2';
  function N(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()}
  function ts(d,t='12:00'){return new Date(`${d}T${t}:00`).getTime()}
  function day(x){try{return typeof localDateStr==='function'?localDateStr(x):new Date(x).toISOString().slice(0,10)}catch(e){return new Date(x).toISOString().slice(0,10)}}
  function W(w,r){return {type:'weight',done:true,weight:parseFloat(w)||0,reps:parseInt(r)||0,distance:'',time:'',fc:'',pasos:''}}
  function R(d,t,fc='',pasos=''){return {type:'run',done:true,weight:0,reps:0,distance:String(d||''),time:String(t||''),fc:String(fc||''),pasos:String(pasos||'')}}
  function E(id,sets){return {exId:id,sets}}
  function a(k){if(!forge[k])forge[k]=[];return forge[k]}
  const C={
    ex_hip_thrust_maq:['Hip Thrust (Máquina)','machine','gluteos','Glúteos',['hiptrust maquina','hiptrust máquina','hip thrust maquina','hip thrust máquina','hip thrust (maquina)','hip thrust (máquina)','empuje de cadera maquina','empuje de cadera máquina','empuje de caderas maquina','empuje de caderas máquina']],
    ex_hip_thrust:['Hip Thrust (Barra)','barbell','gluteos','Glúteos',['hip thrust barra','hip thrust (barra)','empuje de cadera barra','empuje de caderas barra']],
    ex_sentadilla:['Sentadilla (Barra)','barbell','cuadriceps','Cuádriceps',['sentadilla','sentadilla barra','sentadilla (barra)']],
    ex_peso_muerto_manc:['Peso Muerto (Mancuerna)','dumbbell','isquios','Isquiotibiales',['peso muerto mancuerna','peso muerto (mancuerna)']],
    ex_peso_muerto:['Peso Muerto (Barra)','barbell','isquios','Isquiotibiales',['peso muerto barra','peso muerto (barra)']],
    ex_step_manc:['Step con Mancuerna','dumbbell','piernas','Piernas',['step con mancuerna','step mancuerna']],
    ex_sent_bulgara:['Sentadilla Búlgara','dumbbell','gluteos','Glúteos',['sentadilla bulgara','sentadilla búlgara']],
    ex_crunch:['Abdominal Banco Inclinado','bodyweight','core','Core',['abdominal corto en banco inclinado','abdominal banco inclinado','abdominal en banco','crunch abdominal','crunch']],
    ex_press_banca:['Press Banca (Barra)','barbell','pecho','Pecho',['press de banca barra','press banca barra','press banca (barra)']],
    ex_press_inclinado:['Press Inclinado (Barra)','barbell','pecho','Pecho',['press de banca inclinado barra','press banca inclinado barra','press inclinado (barra)']],
    ex_press_hombros:['Press Hombros (Barra)','barbell','hombros','Hombros',['press de hombros barra','press hombros barra','press hombros (barra)']],
    ex_press_homb_manc:['Press Hombros (Mancuerna)','dumbbell','hombros','Hombros',['press hombros mancuerna','press de hombros mancuerna','press hombros (mancuerna)','press hombros (mancuernas)']],
    ex_press_homb_maq:['Press Hombros (Máquina)','machine','hombros','Hombros',['press hombros maquina','press de hombros sentado maquina','press hombros sentado maquina','press hombros (maquina)','press hombros (máquina)']],
    ex_curl_barra_z:['Curl con Barra Z','barbell','biceps','Bíceps',['curl con barra ez','curl barra ez','curl con barra z']],
    ex_dominadas:['Dominadas (Peso Corporal)','bodyweight','espalda','Espalda',['dominada','dominadas']],
    ex_jalon_pecho:['Jalón al Pecho (Cable)','cable','espalda','Espalda',['jalon al pecho cable','jalón al pecho cable','jalon al pecho (cable)','jalón al pecho (cable)']],
    ex_correr:['Carrera / Trote','run','cardio','Cardio',['correr','carrera','trote','carrera / trote']]
  };
  const A={}; Object.entries(C).forEach(([id,v])=>{A[N(v[0])]=id;(v[4]||[]).forEach(x=>A[N(x)]=id)})
  function ensure(id){const v=C[id]; if(!v)return; let ex=a('exercises').find(e=>e.id===id); if(!ex){ex={id};forge.exercises.push(ex)}; ex.name=v[0]; ex.type=v[1]; ex.muscle=v[2]; ex.grupo=v[3]; ex.restSec=ex.type==='run'?0:ex.restSec||120}
  function kset(st){return st.type==='run'?`r:${st.distance}:${st.time}:${st.fc}:${st.pasos}`:`w:${st.weight}:${st.reps}`}
  function normalize(){Object.keys(C).forEach(ensure); const map={}; (forge.exercises||[]).forEach(e=>{const id=A[N(e.name)]; if(id&&id!==e.id)map[e.id]=id}); (forge.sessions||[]).forEach(s=>{(s.exercises||[]).forEach(ex=>{const def=(forge.exercises||[]).find(e=>e.id===ex.exId); const id=map[ex.exId]||A[N(ex.name)]||A[N(def&&def.name)]; if(id){ex.exId=id; delete ex.name}}); const by={}; (s.exercises||[]).forEach(ex=>{if(!by[ex.exId])by[ex.exId]={exId:ex.exId,sets:[]}; const keys=new Set(by[ex.exId].sets.map(kset)); (ex.sets||[]).forEach(st=>{const k=kset(st); if(!keys.has(k)){by[ex.exId].sets.push(st); keys.add(k)}})}); s.exercises=Object.values(by)}); (forge.routines||[]).forEach(r=>{if(Array.isArray(r.exercises))r.exercises=r.exercises.map(id=>map[id]||id).filter((id,i,x)=>x.indexOf(id)===i)}); forge.exercises=(forge.exercises||[]).filter(e=>!map[e.id]); Object.keys(C).forEach(ensure); return Object.keys(map).length}
  function vol(s){return (s.exercises||[]).reduce((z,ex)=>z+(ex.exId==='ex_correr'?0:(ex.sets||[]).reduce((a,st)=>a+(parseFloat(st.weight)||0)*(parseInt(st.reps)||0),0)),0)}
  function mergeSets(t,i){if(!t.sets)t.sets=[]; const keys=new Set(t.sets.map(kset)); (i.sets||[]).forEach(st=>{const k=kset(st); if(!keys.has(k)){t.sets.push(st); keys.add(k)}})}
  function S(d,time,kind,mins,exercises){return {id:`mq1812_hevy_${d}_${kind}`,routineId:null,routineName:kind==='trote'?'Trote':kind==='superior'?'Tren superior':'Tren inferior',date:ts(d,time),elapsed:Math.round(mins*60),exercises,source:'hevy_v181_2',tipoHevy:kind}}
  function similar(a,b){if(day(a.date)!==day(b.date))return false; const br=String(b.routineName||'').toLowerCase(), ar=String(a.routineName||'').toLowerCase(); if(br.includes('trote'))return (a.exercises||[]).some(e=>e.exId==='ex_correr'); if(br.includes('superior'))return ar.includes('superior')||(a.exercises||[]).some(e=>['ex_press_banca','ex_press_inclinado','ex_press_hombros','ex_press_homb_manc','ex_press_homb_maq','ex_curl_barra_z','ex_jalon_pecho'].includes(e.exId)); if(br.includes('inferior'))return ar.includes('inferior')||(a.exercises||[]).some(e=>['ex_sentadilla','ex_peso_muerto','ex_peso_muerto_manc','ex_hip_thrust','ex_hip_thrust_maq','ex_sent_bulgara','ex_step_manc'].includes(e.exId)); return false}
  function add(s){s.totalVolume=vol(s); let e=(forge.sessions||[]).find(x=>x.id===s.id)||(forge.sessions||[]).find(x=>similar(x,s)); if(e){if(!e.routineName||String(e.routineName).toLowerCase().includes('libre'))e.routineName=s.routineName; e.elapsed=Math.max(e.elapsed||0,s.elapsed||0); e.source=e.source||s.source; e.tipoHevy=e.tipoHevy||s.tipoHevy; if(!e.exercises)e.exercises=[]; (s.exercises||[]).forEach(ix=>{const tx=e.exercises.find(x=>x.exId===ix.exId); if(tx)mergeSets(tx,ix); else e.exercises.push(ix)}); e.totalVolume=vol(e); return 'merged'}; forge.sessions.push(s); return 'added'}
  function data(){return [
    S('2026-03-19','15:12','superior',37,[E('ex_press_inclinado',[W(60,6),W(60,5),W(50,8)]),E('ex_jalon_pecho',[W(50,10),W(50,10),W(50,10)]),E('ex_press_homb_manc',[W(28,10),W(28,10),W(28,10)])]),
    S('2026-03-17','14:37','superior',38,[E('ex_press_banca',[W(65,8),W(65,8),W(65,5)]),E('ex_press_homb_maq',[W(30,7),W(30,8),W(30,8)]),E('ex_curl_barra_z',[W(30,7),W(30,7),W(30,6)])]),
    S('2026-03-16','14:44','inferior',48,[E('ex_sentadilla',[W(70,10),W(70,9),W(70,9)]),E('ex_peso_muerto_manc',[W(50,8),W(60,10)])]),
    S('2026-03-10','15:07','superior',47,[E('ex_press_banca',[W(60,8),W(60,8),W(60,6)]),E('ex_press_hombros',[W(35,9),W(35,9),W(35,8)]),E('ex_curl_barra_z',[W(30,7),W(30,6),W(30,7)])]),
    S('2026-03-09','15:06','inferior',42,[E('ex_sentadilla',[W(60.9,9),W(60.9,8),W(60.9,8)]),E('ex_peso_muerto_manc',[W(44,8),W(44,9)]),E('ex_hip_thrust_maq',[W(70.9,10),W(70.9,10),W(70.9,10)]),E('ex_crunch',[W(0,30),W(0,30),W(0,30)])]),
    S('2026-02-19','14:57','superior',35,[E('ex_press_banca',[W(60,8),W(60,8),W(60,7)]),E('ex_press_hombros',[W(35,8),W(35,8),W(35,7)]),E('ex_curl_barra_z',[W(30,6),W(30,5)])]),
    S('2026-02-16','14:54','inferior',56,[E('ex_sentadilla',[W(60,9),W(60,8),W(60,9)]),E('ex_peso_muerto_manc',[W(44,8),W(44,9)]),E('ex_hip_thrust_maq',[W(67.5,9),W(62.7,10),W(62.7,9)]),E('ex_crunch',[W(0,30),W(0,30),W(0,30)])]),
    S('2026-02-12','20:54','inferior',40,[E('ex_sentadilla',[W(60,10),W(60,9),W(60,9)]),E('ex_peso_muerto_manc',[W(40,8),W(40,8)]),E('ex_hip_thrust_maq',[W(67.5,7),W(62.7,9),W(62.7,9)])]),
    S('2026-02-10','14:32','superior',49,[E('ex_press_banca',[W(60,9),W(60,8),W(60,7)]),E('ex_press_homb_maq',[W(30,6),W(30,7),W(30,6)])]), S('2026-02-10','14:32','trote',10,[E('ex_correr',[R(1.15,'9:52')])]),
    S('2026-02-08','12:42','trote',53,[E('ex_correr',[R(7.74,'53:19','',8072)])]),
    S('2026-02-05','14:40','inferior',43,[E('ex_sentadilla',[W(60,10),W(60,9),W(60,8)]),E('ex_peso_muerto_manc',[W(40,8),W(40,8)]),E('ex_hip_thrust',[W(62.7,10),W(62.7,9),W(62.7,8)]),E('ex_crunch',[W(0,30),W(0,30),W(0,30)])]),
    S('2026-02-03','20:51','trote',20,[E('ex_correr',[R(1.21,'7:18','81',1057)])]),
    S('2026-01-29','14:07','inferior',46,[E('ex_sentadilla',[W(40,10),W(50,10),W(55,10),W(60,10)]),E('ex_peso_muerto_manc',[W(40,8),W(40,8)]),E('ex_hip_thrust',[W(42.7,9),W(62.7,9),W(62.7,10)]),E('ex_crunch',[W(0,30),W(0,30),W(0,20)])]),
    S('2026-01-27','20:56','superior',37,[E('ex_press_banca',[W(40,10),W(40,11),W(40,9)]),E('ex_press_hombros',[W(30,9),W(30,8),W(30,7)]),E('ex_dominadas',[W(0,10),W(0,7),W(0,7)])]), S('2026-01-27','20:56','trote',12,[E('ex_correr',[R(2.03,'12:05')])]),
    S('2026-01-25','09:32','trote',21,[E('ex_correr',[R(3.52,'21:26','',3110)])]), S('2026-01-18','12:00','trote',46,[E('ex_correr',[R(6.7,'45:21','',6835)])]), S('2026-01-13','21:03','trote',34,[E('ex_correr',[R(3.36,'21:09','124',3109)])]), S('2026-01-11','10:22','trote',45,[E('ex_correr',[R(6.42,'45:08','133',6742)])]), S('2026-01-08','20:48','inferior',31,[E('ex_step_manc',[W(14,12),W(14,12),W(10,14)]),E('ex_sent_bulgara',[W(14,7),W(14,7),W(14,5),W(14,5)])])
  ]}
  function migrate(reason='auto'){a('sessions'); a('exercises'); a('routines'); let normalized=normalize(); let added=0,merged=0; data().forEach(s=>{const r=add(s); if(r==='added')added++; else merged++}); normalized+=normalize(); forge.sessions.sort((a,b)=>(a.date||0)-(b.date||0)); try{localStorage.setItem('melqart_v181_2_status',JSON.stringify({at:new Date().toISOString(),reason,added,merged,normalized,total:forge.sessions.length}))}catch(e){}; try{saveDB()}catch(e){}; console.info(`${LOG}: ${reason} · agregadas ${added} · fusionadas ${merged} · normalizadas ${normalized} · sesiones ${forge.sessions.length}`); return {added,merged,normalized,total:forge.sessions.length}}
  window.melqartFix181=()=>{const r=migrate('manual'); try{renderAll()}catch(e){} return r};
  window.melqartDiagnostico181=()=>({status:JSON.parse(localStorage.getItem('melqart_v181_2_status')||'null'),hipThrustExercises:(forge.exercises||[]).filter(e=>/hip\s*trust|hiptrust/i.test(e.name||'')).map(e=>({id:e.id,name:e.name})),sesionesEneMar:(forge.sessions||[]).filter(s=>day(s.date)>='2026-01-01'&&day(s.date)<='2026-03-31').map(s=>({date:day(s.date),routineName:s.routineName,ex:(s.exercises||[]).map(e=>e.exId)})),totalSessions:(forge.sessions||[]).length});
  [200,1000,2500,5000,9000,14000].forEach(ms=>setTimeout(()=>{const r=migrate('t+'+ms); if(r&&(r.added||r.normalized))try{renderAll()}catch(e){}},ms));
  if(typeof renderAll==='function'&&!window._mq1812RenderAllHooked){const old=renderAll; window._mq1812RenderAllHooked=true; renderAll=function(){migrate('renderAll'); return old.apply(this,arguments)}}
  if(typeof doGuardarNube==='function'&&!window._mq1812GuardarHooked){const oldG=doGuardarNube; window._mq1812GuardarHooked=true; doGuardarNube=function(){migrate('guardarNube'); return oldG.apply(this,arguments)}}
})();




// ---------------------------------------------------------------
//  MELQART v181.3 — sets Hevy exactos + nutrición/adherencia final
// ---------------------------------------------------------------
(function mq1813(){
  const LOG='MELQART v181.3';
  function dt(date,time='12:00'){ return new Date(`${date}T${time}:00`).getTime(); }
  function dayOf(ts){ try{return typeof localDateStr==='function'?localDateStr(ts):new Date(ts).toISOString().slice(0,10)}catch{return new Date(ts).toISOString().slice(0,10)} }
  function W(weight,reps){ return {type:'weight',done:true,weight:parseFloat(weight)||0,reps:parseInt(reps)||0,distance:'',time:'',fc:'',pasos:''}; }
  function R(distance,time,fc='',pasos=''){ return {type:'run',done:true,weight:0,reps:0,distance:String(distance||''),time:String(time||''),fc:String(fc||''),pasos:String(pasos||'')}; }
  function E(exId,sets){ return {exId,sets}; }
  function n(v,d=2){ try{return typeof nRound==='function'?nRound(v,d):Math.round(v*Math.pow(10,d))/Math.pow(10,d)}catch{return Math.round(v*Math.pow(10,d))/Math.pow(10,d)} }
  function clone(x){ return JSON.parse(JSON.stringify(x)); }

  // Tabla cerrada por platos: proteína final no puede ser menor a esto.
  const PLATE_STEPS=[
    {proteinas:2,cereales:.5,frutas:1,lipidos:.5},    // 1 desayuno
    {frutas:1},                                      // 2 fruta
    {proteinas:4,cereales:2},                        // 3 almuerzo
    {lacteoProtein:1},                               // 4 leche/yogurt protein
    {proteinas:3},                                   // 5 2 huevos
    {lacteoDescremado:1},                            // 6 leche descremada
    {proteinas:4,cereales:2,verduras:2}              // 7 cena
  ];
  function zero(){ return {proteinas:0,cereales:0,frutas:0,lacteoProtein:0,lacteoDescremado:0,lipidos:0,aceites:0,verduras:0}; }
  function addInto(total,p){ Object.keys(p||{}).forEach(k=>{ total[k]=(parseFloat(total[k])||0)+(parseFloat(p[k])||0); }); return total; }
  function mealCount(fd){ try{return typeof mq179DirectMealCount==='function'?mq179DirectMealCount(fd):(typeof getMealProgress==='function'?getMealProgress(fd).done:0)}catch{return 0} }
  function mealTotal(){ try{return typeof mq179MealTotal==='function'?mq179MealTotal():7}catch{return 7} }
  function portionsByPlates(count){
    const total=zero();
    const c=Math.max(0,Math.min(parseInt(count||0,10)||0,7));
    for(let i=0;i<c;i++) addInto(total,PLATE_STEPS[i]);
    Object.keys(total).forEach(k=>total[k]=n(total[k],2));
    return total;
  }
  function maxPortions(a,b){ const out=zero(); Object.keys(out).forEach(k=>out[k]=n(Math.max(parseFloat(a?.[k]||0),parseFloat(b?.[k]||0)),2)); return out; }

  // Reaplicar árbol nutricional: final = MAX(platos, detalle). Aceite no castiga; 7/7 = 100%.
  if(typeof calcNutritionDayDetail==='function'){
    calcNutritionDayDetail=function(fd){
      const empty=zero();
      if(!fd) return {portions:empty,details:[],mealCount:0,source:'sin_dato'};
      const mc=mealCount(fd);
      const plate=portionsByPlates(mc);
      let detail={portions:zero(),details:[]};
      try{ if(typeof mq179TextPortions==='function') detail=mq179TextPortions(fd)||detail; }catch(e){}
      const final=maxPortions(plate,detail.portions);
      const details=[];
      if(mc>0) details.push({type:'platos',name:`${mc}/${mealTotal()} comidas`,source:'árbol fijo v181.3',portions:plate,details:[`Proteína por platos = ${plate.proteinas||0}`]});
      details.push(...(detail.details||[]));
      return {portions:final,details,mealCount:mc,source:details.length?'max_platos_detalle_v181_3':'sin_dato',platePortions:plate,detailPortions:detail.portions};
    };
    window.calcNutritionDayDetail=calcNutritionDayDetail;
  }
  if(typeof calcPortionsConsumed==='function') calcPortionsConsumed=function(fd){ return calcNutritionDayDetail(fd).portions; };
  if(typeof getPorcionesHoy==='function') getPorcionesHoy=function(fd){ return calcNutritionDayDetail(fd).portions; };

  window.mq1813Adherence=function(fd,portions){
    const mc=mealCount(fd); const mt=mealTotal();
    if(mt && mc===mt) return 100;
    const p=portions||calcNutritionDayDetail(fd).portions||zero();
    // Aceites excluidos del denominador por definición del usuario.
    const targets=(typeof NUTRITION_TARGETS!=='undefined')?NUTRITION_TARGETS:{proteinas:12,cereales:3,frutas:2,lacteoProtein:2,lacteoDescremado:1,lipidos:.5,verduras:2};
    const groups=['proteinas','cereales','frutas','lacteoProtein','lacteoDescremado','lipidos','verduras'];
    let done=0,total=0;
    groups.forEach(g=>{ const t=parseFloat(targets[g]||0); total+=t; done+=Math.min(t,parseFloat(p[g]||0)); });
    return total?Math.round(done/total*100):0;
  };

  // Export nutrición final: mantiene columnas antiguas pero con proteína/adherencia corregida.
  if(typeof exportNutritionLines==='function'){
    exportNutritionLines=function(fechaInicio,fechaFin){
      const out=[],dates=[];
      for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); if(k&&k.startsWith('ff_')){ const f=k.slice(3); const d=new Date(f+'T12:00:00'); if(d>=fechaInicio&&d<=fechaFin) dates.push(f); } }
      dates.sort(); if(!dates.length) return out;
      out.push('NUTRICION'); out.push('');
      out.push('Fecha       Agua ml  Vasos    MetaH2O  Comidas  Prot  Cere  Frut  Lact  Verd  Lip   Aceit  Adh%');
      out.push('-----------------------------------------------------------------------------------------------');
      let complete=0, waterOk=0, waterSum=0, adhSum=0;
      dates.forEach(f=>{
        const fd=getFD(f); const meta=getAguaMeta();
        const vasos=fd.aguaVasosHoy ?? fd.agua ?? 0;
        const aguaMl=fd.aguaMl ?? Math.round(vasos*(meta.mlPorVaso||250));
        const metaMl=(meta.vasos||10)*(meta.mlPorVaso||250);
        const meals=getMealProgress(fd); const calc=calcNutritionDayDetail(fd); const p=calc.portions||{};
        const adh=window.mq1813Adherence(fd,p); adhSum+=adh;
        if(aguaMl>=metaMl) waterOk++; waterSum+=parseFloat(vasos)||0; if(meals.done===meals.total) complete++;
        const fmt=f.split('-').reverse().join('/');
        out.push(`${fmt.padEnd(10)}  ${String(aguaMl).padEnd(7)}  ${String(vasos+'/'+(meta.vasos||10)).padEnd(7)}  ${(aguaMl>=metaMl?'S':'N').padEnd(7)}  ${String(meals.done+'/'+meals.total).padEnd(7)}  ${String(n(p.proteinas||0,2)).padEnd(5)} ${String(n(p.cereales||0,2)).padEnd(5)} ${String(n(p.frutas||0,2)).padEnd(5)} ${String(n((p.lacteoProtein||0)+(p.lacteoDescremado||0),2)).padEnd(5)} ${String(n(p.verduras||0,2)).padEnd(5)} ${String(n(p.lipidos||0,2)).padEnd(5)} ${String(n(p.aceites||0,2)).padEnd(6)} ${String(adh+'%').padEnd(5)}`);
      });
      out.push(''); out.push(`Resumen (${dates.length} dias con registro):`);
      out.push(`  Agua promedio/dia:         ${dates.length?Math.round(waterSum/dates.length):0}/10 vasos - meta cumplida ${waterOk}/${dates.length} dias (${dates.length?Math.round(waterOk/dates.length*100):0}%)`);
      out.push(`  Comidas dias completos:    ${complete}/${dates.length} dias (${dates.length?Math.round(complete/dates.length*100):0}%)`);
      out.push(`  Adherencia pauta promedio: ${dates.length?Math.round(adhSum/dates.length):0}%`);
      return out;
    };
    window.exportNutritionLines=exportNutritionLines;
  }

  // Set exacto para Hevy: NO deduplicar series iguales de fuerza; sí corregir trotes duplicados.
  function exactSessions(){return [
    {date:'2026-01-08',kind:'inferior',routineName:'Tren inferior',elapsed:31,ex:[E('ex_step_manc',[W(14,12),W(14,12),W(10,14)]),E('ex_sent_bulgara',[W(14,7),W(14,7),W(14,5),W(14,5)])]},
    {date:'2026-01-11',kind:'trote',routineName:'Trote',elapsed:45,ex:[E('ex_correr',[R(6.42,'45:08','133',6742)])]},
    {date:'2026-01-13',kind:'trote',routineName:'Trote',elapsed:34,ex:[E('ex_correr',[R(3.36,'21:09','124',3109)])]},
    {date:'2026-01-18',kind:'trote',routineName:'Trote',elapsed:46,ex:[E('ex_correr',[R(6.7,'45:21','',6835)])]},
    {date:'2026-01-25',kind:'trote',routineName:'Trote',elapsed:21,ex:[E('ex_correr',[R(3.52,'21:26','',3110)])]},
    {date:'2026-01-27',kind:'superior',routineName:'Tren superior',elapsed:37,ex:[E('ex_press_banca',[W(40,10),W(40,11),W(40,9)]),E('ex_press_hombros',[W(30,9),W(30,8),W(30,7)]),E('ex_dominadas',[W(0,10),W(0,7),W(0,7)])]},
    {date:'2026-01-27',kind:'trote',routineName:'Trote',elapsed:12,ex:[E('ex_correr',[R(2.03,'12:05')])]},
    {date:'2026-01-29',kind:'inferior',routineName:'Tren inferior',elapsed:46,ex:[E('ex_sentadilla',[W(40,10),W(50,10),W(55,10),W(60,10)]),E('ex_peso_muerto_manc',[W(40,8),W(40,8)]),E('ex_hip_thrust',[W(42.7,9),W(62.7,9),W(62.7,10)]),E('ex_crunch',[W(0,30),W(0,30),W(0,20)])]},
    {date:'2026-02-03',kind:'trote',routineName:'Trote',elapsed:20,ex:[E('ex_correr',[R(1.21,'7:18','81',1057)])]},
    {date:'2026-02-05',kind:'inferior',routineName:'Tren inferior',elapsed:43,ex:[E('ex_sentadilla',[W(60,10),W(60,9),W(60,8)]),E('ex_peso_muerto_manc',[W(40,8),W(40,8)]),E('ex_hip_thrust',[W(62.7,10),W(62.7,9),W(62.7,8)]),E('ex_crunch',[W(0,30),W(0,30),W(0,30)])]},
    {date:'2026-02-08',kind:'trote',routineName:'Trote',elapsed:53,ex:[E('ex_correr',[R(7.74,'53:19','171',8072)])]},
    {date:'2026-02-10',kind:'superior',routineName:'Tren superior',elapsed:49,ex:[E('ex_press_banca',[W(60,9),W(60,8),W(60,7)]),E('ex_press_homb_maq',[W(30,6),W(30,7),W(30,6)])]},
    {date:'2026-02-10',kind:'trote',routineName:'Trote',elapsed:10,ex:[E('ex_correr',[R(1.15,'9:52')])]},
    {date:'2026-02-12',kind:'inferior',routineName:'Tren inferior',elapsed:40,ex:[E('ex_sentadilla',[W(60,10),W(60,9),W(60,9)]),E('ex_peso_muerto_manc',[W(40,8),W(40,8)]),E('ex_hip_thrust_maq',[W(67.5,7),W(62.7,9),W(62.7,9)])]},
    {date:'2026-02-16',kind:'inferior',routineName:'Tren inferior',elapsed:56,ex:[E('ex_sentadilla',[W(60,9),W(60,8),W(60,9)]),E('ex_peso_muerto_manc',[W(44,8),W(44,9)]),E('ex_hip_thrust_maq',[W(67.5,9),W(62.7,10),W(62.7,9)]),E('ex_crunch',[W(0,30),W(0,30),W(0,30)])]},
    {date:'2026-02-19',kind:'superior',routineName:'Tren superior',elapsed:35,ex:[E('ex_press_banca',[W(60,8),W(60,8),W(60,7)]),E('ex_press_hombros',[W(35,8),W(35,8),W(35,7)]),E('ex_curl_barra_z',[W(30,6),W(30,5)])]},
    {date:'2026-03-09',kind:'inferior',routineName:'Tren inferior',elapsed:42,ex:[E('ex_sentadilla',[W(60.9,9),W(60.9,8),W(60.9,8)]),E('ex_peso_muerto_manc',[W(44,8),W(44,9)]),E('ex_hip_thrust_maq',[W(70.9,10),W(70.9,10),W(70.9,10)]),E('ex_crunch',[W(0,30),W(0,30),W(0,30)])]},
    {date:'2026-03-10',kind:'superior',routineName:'Tren superior',elapsed:47,ex:[E('ex_press_banca',[W(60,8),W(60,8),W(60,6)]),E('ex_press_hombros',[W(35,9),W(35,9),W(35,8)]),E('ex_curl_barra_z',[W(30,7),W(30,6),W(30,7)])]},
    {date:'2026-03-16',kind:'inferior',routineName:'Tren inferior',elapsed:48,ex:[E('ex_sentadilla',[W(70,10),W(70,9),W(70,9)]),E('ex_peso_muerto_manc',[W(50,8),W(60,10)])]},
    {date:'2026-03-17',kind:'superior',routineName:'Tren superior',elapsed:38,ex:[E('ex_press_banca',[W(65,8),W(65,8),W(65,5)]),E('ex_press_homb_maq',[W(30,7),W(30,8),W(30,8)]),E('ex_curl_barra_z',[W(30,7),W(30,7),W(30,6)])]}
  ];}
  function findSession(date,kind){
    const rn=kind==='trote'?'trote':kind==='superior'?'tren superior':'tren inferior';
    return (forge.sessions||[]).find(s=>dayOf(s.date)===date && String(s.routineName||'').toLowerCase().includes(rn));
  }
  function totalVolume(sess){return (sess.exercises||[]).reduce((sum,ex)=> ex.exId==='ex_correr'?sum:sum+(ex.sets||[]).reduce((a,s)=>a+(parseFloat(s.weight)||0)*(parseInt(s.reps)||0),0),0);}
  function applyExactHevy(reason='auto'){
    if(!window.forge && typeof forge==='undefined') return;
    let fixed=0, added=0;
    exactSessions().forEach(x=>{
      let s=findSession(x.date,x.kind);
      if(!s){ s={id:`mq1813_hevy_${x.date}_${x.kind}`,routineId:null,routineName:x.routineName,date:dt(x.date),elapsed:Math.round(x.elapsed*60),exercises:[],source:'hevy_v181_3',tipoHevy:x.kind}; forge.sessions.push(s); added++; }
      s.routineName=x.routineName; s.elapsed=Math.max(s.elapsed||0,Math.round(x.elapsed*60)); s.source=s.source||'hevy_v181_3'; s.tipoHevy=s.tipoHevy||x.kind;
      x.ex.forEach(ix=>{
        let ex=s.exercises.find(e=>e.exId===ix.exId);
        if(!ex){ ex={exId:ix.exId,sets:[]}; s.exercises.push(ex); }
        // Set exacto para Hevy: reemplaza los sets de ese ejercicio por la serie original completa.
        ex.sets=clone(ix.sets);
        fixed++;
      });
      s.totalVolume=totalVolume(s);
    });
    // Corrección específica: trotes con sets duplicados por migraciones anteriores -> dejar solo el set real Hevy cuando hay fecha exacta.
    exactSessions().filter(x=>x.kind==='trote').forEach(x=>{
      const s=findSession(x.date,'trote'); const ex=s&&(s.exercises||[]).find(e=>e.exId==='ex_correr'); if(ex) ex.sets=clone(x.ex[0].sets);
    });
    forge.sessions.sort((a,b)=>(a.date||0)-(b.date||0));
    try{localStorage.setItem('melqart_v181_3_status',JSON.stringify({at:new Date().toISOString(),reason,added,fixed,total:forge.sessions.length}));}catch(e){}
    try{if(typeof saveDB==='function') saveDB();}catch(e){}
    console.info(`${LOG}: ${reason} · sesiones agregadas ${added} · ejercicios restaurados ${fixed}`);
  }
  window.melqartFix1813=function(){ applyExactHevy('manual'); try{renderAll()}catch(e){} return JSON.parse(localStorage.getItem('melqart_v181_3_status')||'{}'); };
  [250,1200,3000,6000,10000].forEach(ms=>setTimeout(()=>{applyExactHevy('t+'+ms); try{renderAll()}catch(e){}},ms));
  if(typeof renderAll==='function' && !window._mq1813RenderAllHooked){ const old=renderAll; window._mq1813RenderAllHooked=true; renderAll=function(){ applyExactHevy('renderAll'); return old.apply(this,arguments); }; }
})();




// ---------------------------------------------------------------
//  MELQART v181.4 — override final exportador + reparación Hevy/Nutrición
// ---------------------------------------------------------------
(function mq1814(){
  const LOG='MELQART v181.4';
  function nrm(s){ return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(); }
  function dayOf(ts){ try{return typeof localDateStr==='function'?localDateStr(ts):new Date(ts).toISOString().slice(0,10)}catch(e){return new Date(ts).toISOString().slice(0,10)} }
  function W(weight,reps){ return {type:'weight',done:true,weight:parseFloat(weight)||0,reps:parseInt(reps)||0,distance:'',time:'',fc:'',pasos:''}; }
  function R(distance,time,fc='',pasos=''){ return {type:'run',done:true,weight:0,reps:0,distance:String(distance||''),time:String(time||''),fc:String(fc||''),pasos:String(pasos||'')}; }
  function getExerciseByNameLike(name){
    const target=nrm(name);
    return (forge.exercises||[]).find(e=>nrm(e.name)===target);
  }
  function ensureEx(id,name,type='barbell'){
    if(!forge.exercises) forge.exercises=[];
    let e=forge.exercises.find(x=>x.id===id);
    if(!e){ e={id,name,type}; forge.exercises.push(e); }
    e.name=name; e.type=type||e.type;
    return e;
  }
  function canonExerciseIds(){
    const hipM=ensureEx('ex_hip_thrust_maq','Hip Thrust (Máquina)','machine');
    const step=ensureEx('ex_step_manc','Step con Mancuerna','dumbbell');
    const bulg=ensureEx('ex_sent_bulgara','Sentadilla Búlgara','dumbbell');
    const run=ensureEx('ex_correr','Carrera / Trote','run');
    // convertir variantes restantes por nombre
    const aliases=['hiptrust maquina','hiptrust máquina','hip thrust maquina','hip thrust máquina','hip thrust (maquina)','hip thrust (máquina)'];
    const dupIds=[];
    (forge.exercises||[]).forEach(e=>{
      if(e.id!=='ex_hip_thrust_maq' && aliases.includes(nrm(e.name))) dupIds.push(e.id);
    });
    (forge.sessions||[]).forEach(s=>{
      (s.exercises||[]).forEach(ex=>{
        const def=(forge.exercises||[]).find(e=>e.id===ex.exId);
        if(dupIds.includes(ex.exId) || aliases.includes(nrm(def?.name||ex.name))) ex.exId='ex_hip_thrust_maq';
        if(nrm(def?.name||ex.name)==='step con mancuerna') ex.exId='ex_step_manc';
        if(nrm(def?.name||ex.name)==='sentadilla bulgara' || nrm(def?.name||ex.name)==='sentadilla búlgara') ex.exId='ex_sent_bulgara';
        if(nrm(def?.name||ex.name)==='carrera / trote' || nrm(def?.name||ex.name)==='trote') ex.exId='ex_correr';
        delete ex.name;
      });
    });
    forge.exercises=(forge.exercises||[]).filter(e=>!dupIds.includes(e.id));
  }
  function findSession(date, routineContains){
    const rc=nrm(routineContains||'');
    return (forge.sessions||[]).find(s=>dayOf(s.date)===date && (!rc || nrm(s.routineName).includes(rc)));
  }
  function setExerciseSets(session, exId, sets){
    if(!session) return false;
    if(!session.exercises) session.exercises=[];
    let ex=session.exercises.find(e=>e.exId===exId);
    if(!ex){ ex={exId,sets:[]}; session.exercises.push(ex); }
    ex.sets=sets;
    return true;
  }
  function repairHevyKnownRecords(){
    if(!window.forge && typeof forge==='undefined') return;
    canonExerciseIds();

    // 08-01: preservar series idénticas reales
    const s0801=findSession('2026-01-08','tren inferior');
    setExerciseSets(s0801,'ex_step_manc',[W(14,12),W(14,12),W(10,14)]);
    setExerciseSets(s0801,'ex_sent_bulgara',[W(14,7),W(14,7),W(14,5),W(14,5)]);

    // 08-02: distancia real, no sumada doble
    const s0802=findSession('2026-02-08','trote') || (forge.sessions||[]).find(s=>dayOf(s.date)==='2026-02-08' && (s.exercises||[]).some(e=>e.exId==='ex_correr'));
    setExerciseSets(s0802,'ex_correr',[R(7.74,'53:19','171','8072')]);

    // 19-03: si hay sesión libre de trote, clasificarla como Trote.
    const s1903=(forge.sessions||[]).find(s=>dayOf(s.date)==='2026-03-19' && (s.exercises||[]).some(e=>e.exId==='ex_correr'));
    if(s1903 && nrm(s1903.routineName).includes('sesion libre')) s1903.routineName='Trote';

    // Recalcular volumen simple
    (forge.sessions||[]).forEach(s=>{
      s.totalVolume=(s.exercises||[]).reduce((sum,ex)=>{
        const def=(forge.exercises||[]).find(e=>e.id===ex.exId)||{};
        if(def.type==='run'||ex.exId==='ex_correr') return sum;
        return sum+(ex.sets||[]).filter(st=>st.done!==false).reduce((a,st)=>a+(parseFloat(st.weight)||0)*(parseInt(st.reps)||0),0);
      },0);
    });
    try{ if(typeof saveDB==='function') saveDB(); }catch(e){}
    try{ localStorage.setItem('melqart_v181_4_hevy_repaired',new Date().toISOString()); }catch(e){}
  }

  function proteinByMeals(done){
    const n=parseInt(done||0);
    if(n<=0) return 0;
    if(n<=2) return 2;
    if(n<=4) return 6;
    if(n<=6) return 9;
    return 13;
  }
  function correctedNutritionForDay(fd){
    const meals=getMealProgress(fd);
    const calc=calcNutritionDayDetail(fd);
    const p=Object.assign({}, calc.portions||{});
    const byMeals=proteinByMeals(meals.done);
    p.proteinas=Math.max(parseFloat(p.proteinas||0), byMeals);
    // Si el día es 7/7, completar estructura base; aceite no cuenta.
    if(meals.done===meals.total && meals.total>0){
      p.proteinas=Math.max(p.proteinas||0,13);
      p.cereales=Math.max(p.cereales||0,4.5);
      p.frutas=Math.max(p.frutas||0,2);
      p.lacteoProtein=Math.max(p.lacteoProtein||0,2);
      p.lacteoDescremado=Math.max(p.lacteoDescremado||0,1);
      p.verduras=Math.max(p.verduras||0,2);
      p.lipidos=Math.max(p.lipidos||0,0.5);
    }
    return {meals, portions:p, calc};
  }
  function adherencePct(meals,p){
    // Regla final: 7/7 = 100%. Aceite no castiga.
    if(meals.done===meals.total && meals.total>0) return 100;
    const groups=['proteinas','lacteoProtein','lacteoDescremado','cereales','frutas','lipidos','verduras'];
    let done=0,total=0;
    groups.forEach(g=>{
      const t=(NUTRITION_TARGETS&&NUTRITION_TARGETS[g])||0;
      total+=t;
      done+=Math.min(t, parseFloat(p[g]||0));
    });
    return total?Math.round(done/total*100):0;
  }

  // Override final del exportador de nutrición.
  exportNutritionLines=function(fechaInicio, fechaFin){
    const out=[], dates=[];
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      if(k && k.startsWith('ff_')){
        const f=k.slice(3);
        const d=new Date(f+'T12:00:00');
        if(d>=fechaInicio && d<=fechaFin) dates.push(f);
      }
    }
    dates.sort();
    if(!dates.length) return out;
    out.push('NUTRICION');
    out.push('');
    out.push('Fecha       Agua ml  Vasos    MetaH2O  Comidas  Prot  Cere  Frut  Lact  Verd  Lip   Aceit  Adh%');
    out.push('-----------------------------------------------------------------------------------------------');
    let completeDays=0, waterOk=0, waterSum=0, adhSum=0;
    dates.forEach(f=>{
      const fd=getFD(f);
      const meta=getAguaMeta();
      const vasos=fd.aguaVasosHoy ?? fd.agua ?? 0;
      const aguaMl=fd.aguaMl ?? Math.round(vasos*(meta.mlPorVaso||250));
      const metaMl=(meta.vasos||10)*(meta.mlPorVaso||250);
      const cn=correctedNutritionForDay(fd);
      const meals=cn.meals, p=cn.portions;
      const prot=nRound(p.proteinas||0,2);
      const adh=adherencePct(meals,p);
      if(aguaMl>=metaMl) waterOk++;
      waterSum+=parseFloat(vasos)||0;
      if(meals.done===meals.total) completeDays++;
      adhSum+=adh;
      const fmt=f.split('-').reverse().join('/');
      out.push(`${fmt.padEnd(10)}  ${String(aguaMl).padEnd(7)}  ${String(vasos+'/'+(meta.vasos||10)).padEnd(7)}  ${(aguaMl>=metaMl?'S':'N').padEnd(7)}  ${String(meals.done+'/'+meals.total).padEnd(7)}  ${String(prot).padEnd(5)} ${String(nRound(p.cereales||0,2)).padEnd(5)} ${String(nRound(p.frutas||0,2)).padEnd(5)} ${String(nRound((p.lacteoProtein||0)+(p.lacteoDescremado||0),2)).padEnd(5)} ${String(nRound(p.verduras||0,2)).padEnd(5)} ${String(nRound(p.lipidos||0,2)).padEnd(5)} ${String(nRound(p.aceites||0,2)).padEnd(6)} ${String(adh+'%').padEnd(5)}`);
    });
    out.push('');
    out.push(`Resumen (${dates.length} dias con registro):`);
    out.push(`  Agua promedio/dia:         ${dates.length?Math.round(waterSum/dates.length):0}/10 vasos - meta cumplida ${waterOk}/${dates.length} dias (${dates.length?Math.round(waterOk/dates.length*100):0}%)`);
    out.push(`  Comidas dias completos:    ${completeDays}/${dates.length} dias (${dates.length?Math.round(completeDays/dates.length*100):0}%)`);
    out.push(`  Adherencia pauta promedio: ${dates.length?Math.round(adhSum/dates.length):0}%`);
    out.push('  Nota v181.4: aceite excluido del castigo; 7/7 comidas = 100% adherencia.');
    out.push('');
    return out;
  };

  // Override exportarSemana para usar exportación de sets sin colapsar y carrera sin sumar duplicados.
  if(typeof exportarSemana==='function'){
    exportarSemana=function(){
      repairHevyKnownRecords();
      const semanas=parseInt(document.getElementById('export-semanas')?.value||'4');
      const hoy=new Date();
      const lunes=new Date(hoy); lunes.setDate(hoy.getDate()-(hoy.getDay()||7)+1); lunes.setHours(0,0,0,0);
      let fechaInicio;
      if(semanas===0){ fechaInicio=new Date(0); }
      else { fechaInicio=new Date(lunes); fechaInicio.setDate(lunes.getDate()-((semanas-1)*7)); }
      const domingo=new Date(hoy); domingo.setHours(23,59,59,999);
      const ses=(forge.sessions||[]).filter(s=>new Date(s.date)>=fechaInicio&&new Date(s.date)<=domingo).sort((a,b)=>a.date-b.date);
      const fmtDate=d=>new Date(d).toLocaleDateString('es-CL',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
      const fmtDur=s=>{ const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60; return h>0?(h+'h '+m+'m'):(m+'m '+sec+'s'); };
      const sep='-------------------------------';
      const lines=[];
      lines.push(sep);
      const tituloRango=semanas===0?'HISTORIAL COMPLETO':('ULTIMAS '+semanas+' SEMANA'+(semanas>1?'S':''));
      lines.push(tituloRango);
      lines.push(fechaInicio.toLocaleDateString('es-CL')+' - '+domingo.toLocaleDateString('es-CL'));
      lines.push(sep); lines.push('');
      if(typeof exportWeightLines==='function') lines.push(...exportWeightLines(fechaInicio,domingo));
      if(typeof exportAnthropometryLines==='function'){
        const a=exportAnthropometryLines(fechaInicio,domingo);
        if(a.length) lines.push(...a);
      }
      if(!ses.length){ lines.push('Sin sesiones en este periodo.'); }
      else{
        const semanaStr=d=>{ const x=new Date(d); const l=new Date(x); l.setDate(x.getDate()-(x.getDay()||7)+1); return l.toLocaleDateString('es-CL',{day:'numeric',month:'long'}); };
        let semActual='';
        lines.push('SESIONES ('+ses.length+' total)'); lines.push('');
        ses.forEach(s=>{
          const sw=semanaStr(s.date);
          if(sw!==semActual){ semActual=sw; lines.push('> '); lines.push('> Semana del '+sw); }
          lines.push('> '+fmtDate(s.date)+' - '+(s.routineName||'Sesión libre'));
          if(s.elapsed) lines.push('> Duracion: '+fmtDur(s.elapsed));
          if(s.fcMedia) lines.push('> FC media: '+s.fcMedia+'bpm');
          if(s.kcal) lines.push('> Calorias: '+s.kcal+'kcal');
          if(s.pasos) lines.push('> Pasos: '+s.pasos);
          (s.exercises||[]).forEach(ex=>{
            const e=getEx(ex.exId); if(!e) return;
            if(e.type==='warmup'||e.type==='stretch') return;
            const sets=(ex.sets||[]).filter(st=>st.done!==false);
            if(!sets.length) return;
            if(e.type==='run'||e.type==='hiit'||ex.exId==='ex_correr'){
              // No sumar duplicados: una sesión de trote se reporta por set real único.
              const seen=new Set();
              const unique=sets.filter(st=>{
                const k=`${st.distance}|${st.time}|${st.fc||''}|${st.pasos||''}`;
                if(seen.has(k)) return false;
                seen.add(k); return true;
              });
              unique.forEach(st=>{
                const dist=parseFloat(st.distance)||0;
                lines.push('> '+e.name+': '+dist.toFixed(2)+'km'+(st.time?' - '+fmtTimeStr(st.time):'')+(st.fc?' - FC '+st.fc+'bpm':''));
              });
            }else{
              // Preserva sets idénticos reales. No deduplica.
              lines.push('> '+e.name+': '+sets.map(st=>st.weight+'kg x '+st.reps).join(' | '));
            }
          });
          lines.push('');
        });
      }
      if(typeof exportNutritionLines==='function'){
        const n=exportNutritionLines(fechaInicio,domingo);
        if(n.length){ lines.push(sep); lines.push(...n); }
      }
      if(typeof exportRecoveryLines==='function'){
        const r=exportRecoveryLines(fechaInicio,domingo);
        if(r.length){ lines.push(sep); lines.push(...r); }
      }
      lines.push(sep);
      lines.push('Generado por MELQART - '+new Date().toLocaleDateString('es-CL'));
      const txt=lines.join('\n');
      if(navigator.clipboard) navigator.clipboard.writeText(txt).then(()=>showToast('Historial copiado al portapapeles',3000,'ok'));
      else{
        const modal=document.getElementById('modal-ejercicio');
        modal.querySelector('.modal-title').textContent='Historial exportado';
        modal.querySelector('.modal-body').innerHTML='<textarea style="width:100%;height:300px;font-family:monospace;font-size:11px;border:1px solid var(--border);border-radius:var(--r);padding:10px;resize:none" readonly>'+txt+'</textarea>';
        modal.classList.add('show');
      }
      return txt;
    };
  }

  window.melqartFix1814=function(){ repairHevyKnownRecords(); try{renderAll()}catch(e){} return localStorage.getItem('melqart_v181_4_hevy_repaired'); };
  [200,1200,3500].forEach(ms=>setTimeout(()=>{ try{repairHevyKnownRecords();}catch(e){console.warn(LOG,e)} },ms));
  console.info(LOG+': cargado');
})();




// MELQART v181.5 bootstrap
(function(){
  try{
    setTimeout(()=>{ if(typeof mq1815RepairCoreData==='function') mq1815RepairCoreData(); }, 500);
    window.melqartFix1815=function(){ mq1815RepairCoreData(); try{renderAll()}catch(e){} return localStorage.getItem('melqart_v181_5_core_repaired'); };
    console.info('MELQART v181.5 cargado: exportador reemplazado directamente');
  }catch(e){ console.warn('MELQART v181.5 bootstrap error', e); }
})();



// ---------------------------------------------------------------
//  MELQART v181.6 — override FINAL al final del archivo
//  Motivo: parches v181.4/v181.5 anteriores podían sobrescribirse entre sí.
// ---------------------------------------------------------------
(function mq1816FinalExportOverride(){
  function d1816(ts){
    try { return typeof localDateStr==='function' ? localDateStr(ts) : new Date(ts).toISOString().slice(0,10); }
    catch(e){ return new Date(ts).toISOString().slice(0,10); }
  }
  function W1816(weight,reps){
    return {type:'weight',done:true,weight:parseFloat(weight)||0,reps:parseInt(reps)||0,distance:'',time:'',fc:'',pasos:''};
  }
  function R1816(distance,time,fc='',pasos=''){
    return {type:'run',done:true,weight:0,reps:0,distance:String(distance||''),time:String(time||''),fc:String(fc||''),pasos:String(pasos||'')};
  }
  function ensureEx1816(id,name,type){
    if(!forge.exercises) forge.exercises=[];
    let e=forge.exercises.find(x=>x.id===id);
    if(!e){ e={id,name,type}; forge.exercises.push(e); }
    e.name=name; e.type=type||e.type;
    return e;
  }
  function setSets1816(session, exId, sets){
    if(!session) return false;
    if(!session.exercises) session.exercises=[];
    let ex=session.exercises.find(e=>e.exId===exId);
    if(!ex){ ex={exId,sets:[]}; session.exercises.push(ex); }
    ex.sets=sets;
    return true;
  }
  function repair1816(){
    ensureEx1816('ex_step_manc','Step con Mancuerna','dumbbell');
    ensureEx1816('ex_sent_bulgara','Sentadilla Búlgara','dumbbell');
    ensureEx1816('ex_correr','Carrera / Trote','run');
    ensureEx1816('ex_hip_thrust_maq','Hip Thrust (Máquina)','machine');

    const s0801=(forge.sessions||[]).find(s=>d1816(s.date)==='2026-01-08' && String(s.routineName||'').toLowerCase().includes('inferior'));
    setSets1816(s0801,'ex_step_manc',[W1816(14,12),W1816(14,12),W1816(10,14)]);
    setSets1816(s0801,'ex_sent_bulgara',[W1816(14,7),W1816(14,7),W1816(14,5),W1816(14,5)]);

    const s0802=(forge.sessions||[]).find(s=>d1816(s.date)==='2026-02-08' && (s.exercises||[]).some(e=>e.exId==='ex_correr'));
    setSets1816(s0802,'ex_correr',[R1816(7.74,'53:19','171','8072')]);

    try{ localStorage.setItem('melqart_v181_6_core_repaired', new Date().toISOString()); }catch(e){}
    try{ if(typeof saveDB==='function') saveDB(); }catch(e){}
  }
  function proteinByMeals1816(done){
    const n=parseInt(done||0);
    if(n<=0) return 0;
    if(n<=2) return 2;
    if(n<=4) return 6;
    if(n<=6) return 9;
    return 13;
  }
  function nutritionForDay1816(fd){
    const meals=getMealProgress(fd);
    const calc=calcNutritionDayDetail(fd);
    const p=Object.assign({}, calc.portions||{});
    p.proteinas=Math.max(parseFloat(p.proteinas||0), proteinByMeals1816(meals.done));
    if(meals.done===meals.total && meals.total>0){
      p.proteinas=Math.max(parseFloat(p.proteinas||0),13);
      p.cereales=Math.max(parseFloat(p.cereales||0),4.5);
      p.frutas=Math.max(parseFloat(p.frutas||0),2);
      p.lacteoProtein=Math.max(parseFloat(p.lacteoProtein||0),2);
      p.lacteoDescremado=Math.max(parseFloat(p.lacteoDescremado||0),1);
      p.verduras=Math.max(parseFloat(p.verduras||0),2);
      p.lipidos=Math.max(parseFloat(p.lipidos||0),0.5);
    }
    return {meals, portions:p};
  }
  function adherence1816(meals,p){
    if(meals.done===meals.total && meals.total>0) return 100;
    const groups=['proteinas','lacteoProtein','lacteoDescremado','cereales','frutas','lipidos','verduras'];
    let done=0,total=0;
    groups.forEach(g=>{
      const t=(NUTRITION_TARGETS&&NUTRITION_TARGETS[g])||0;
      total+=t;
      done+=Math.min(t, parseFloat(p[g]||0));
    });
    return total?Math.round(done/total*100):0;
  }
  function runLine1816(st){
    const dist=parseFloat(st.distance)||0;
    return dist.toFixed(2)+'km'+(st.time?' - '+fmtTimeStr(st.time):'')+(st.fc?' - FC '+st.fc+'bpm':'');
  }

  exportNutritionLines=function(fechaInicio, fechaFin){
    const out=[], dates=[];
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      if(k && k.startsWith('ff_')){
        const f=k.slice(3), d=new Date(f+'T12:00:00');
        if(d>=fechaInicio && d<=fechaFin) dates.push(f);
      }
    }
    dates.sort();
    if(!dates.length) return out;
    out.push('NUTRICION');
    out.push('');
    out.push('Fecha       Agua ml  Vasos    MetaH2O  Comidas  Prot  Cere  Frut  Lact  Verd  Lip   Aceit  Adh%');
    out.push('-----------------------------------------------------------------------------------------------');
    let completeDays=0, waterOk=0, waterSum=0, adhSum=0;
    dates.forEach(f=>{
      const fd=getFD(f);
      const meta=getAguaMeta();
      const vasos=fd.aguaVasosHoy ?? fd.agua ?? 0;
      const aguaMl=fd.aguaMl ?? Math.round(vasos*(meta.mlPorVaso||250));
      const metaMl=(meta.vasos||10)*(meta.mlPorVaso||250);
      const cn=nutritionForDay1816(fd);
      const meals=cn.meals, p=cn.portions;
      const adh=adherence1816(meals,p);
      if(aguaMl>=metaMl) waterOk++;
      waterSum+=parseFloat(vasos)||0;
      if(meals.done===meals.total) completeDays++;
      adhSum+=adh;
      const fmt=f.split('-').reverse().join('/');
      out.push(`${fmt.padEnd(10)}  ${String(aguaMl).padEnd(7)}  ${String(vasos+'/'+(meta.vasos||10)).padEnd(7)}  ${(aguaMl>=metaMl?'S':'N').padEnd(7)}  ${String(meals.done+'/'+meals.total).padEnd(7)}  ${String(nRound(p.proteinas||0,2)).padEnd(5)} ${String(nRound(p.cereales||0,2)).padEnd(5)} ${String(nRound(p.frutas||0,2)).padEnd(5)} ${String(nRound((p.lacteoProtein||0)+(p.lacteoDescremado||0),2)).padEnd(5)} ${String(nRound(p.verduras||0,2)).padEnd(5)} ${String(nRound(p.lipidos||0,2)).padEnd(5)} ${String(nRound(p.aceites||0,2)).padEnd(6)} ${String(adh+'%').padEnd(5)}`);
    });
    out.push('');
    out.push(`Resumen (${dates.length} dias con registro):`);
    out.push(`  Agua promedio/dia:         ${dates.length?Math.round(waterSum/dates.length):0}/10 vasos - meta cumplida ${waterOk}/${dates.length} dias (${dates.length?Math.round(waterOk/dates.length*100):0}%)`);
    out.push(`  Comidas dias completos:    ${completeDays}/${dates.length} dias (${dates.length?Math.round(completeDays/dates.length*100):0}%)`);
    out.push(`  Adherencia pauta promedio: ${dates.length?Math.round(adhSum/dates.length):0}%`);
    out.push('  Corrección v181.6 aplicada: aceite excluido; 7/7 comidas = 100%; proteína por platos.');
    out.push('');
    return out;
  };

  exportarSemana=function(){
    repair1816();
    const semanas=parseInt(document.getElementById('export-semanas')?.value||'4');
    const hoy=new Date();
    const lunes=new Date(hoy); lunes.setDate(hoy.getDate()-(hoy.getDay()||7)+1); lunes.setHours(0,0,0,0);
    let fechaInicio;
    if(semanas===0) fechaInicio=new Date(0);
    else { fechaInicio=new Date(lunes); fechaInicio.setDate(lunes.getDate()-((semanas-1)*7)); }
    const domingo=new Date(hoy); domingo.setHours(23,59,59,999);
    const ses=(forge.sessions||[]).filter(s=>new Date(s.date)>=fechaInicio&&new Date(s.date)<=domingo).sort((a,b)=>a.date-b.date);
    const fmtDate=d=>new Date(d).toLocaleDateString('es-CL',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
    const fmtDur=s=>{ const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60; return h>0?(h+'h '+m+'m'):(m+'m '+sec+'s'); };
    const sep='-------------------------------';
    const lines=[];
    lines.push(sep);
    const tituloRango=semanas===0?'HISTORIAL COMPLETO':('ULTIMAS '+semanas+' SEMANA'+(semanas>1?'S':''));
    lines.push(tituloRango);
    lines.push(fechaInicio.toLocaleDateString('es-CL')+' - '+domingo.toLocaleDateString('es-CL'));
    lines.push(sep); lines.push('');
    if(typeof exportWeightLines==='function') lines.push(...exportWeightLines(fechaInicio,domingo));
    if(typeof exportAnthropometryLines==='function'){
      const a=exportAnthropometryLines(fechaInicio,domingo);
      if(a.length) lines.push(...a);
    }
    if(!ses.length) lines.push('Sin sesiones en este periodo.');
    else{
      const semanaStr=d=>{ const x=new Date(d); const l=new Date(x); l.setDate(x.getDate()-(x.getDay()||7)+1); return l.toLocaleDateString('es-CL',{day:'numeric',month:'long'}); };
      let semActual='';
      lines.push('SESIONES ('+ses.length+' total)'); lines.push('');
      ses.forEach(s=>{
        const sw=semanaStr(s.date);
        if(sw!==semActual){ semActual=sw; lines.push('> '); lines.push('> Semana del '+sw); }
        lines.push('> '+fmtDate(s.date)+' - '+(s.routineName||'Sesion libre'));
        if(s.elapsed) lines.push('> Duracion: '+fmtDur(s.elapsed));
        if(s.fcMedia) lines.push('> FC media: '+s.fcMedia+'bpm');
        if(s.kcal) lines.push('> Calorias: '+s.kcal+'kcal');
        if(s.pasos) lines.push('> Pasos: '+s.pasos);
        (s.exercises||[]).forEach(ex=>{
          const e=getEx(ex.exId); if(!e) return;
          if(e.type==='warmup'||e.type==='stretch') return;
          const sets=(ex.sets||[]).filter(st=>st.done!==false);
          if(!sets.length) return;
          if(e.type==='run'||e.type==='hiit'||ex.exId==='ex_correr'){
            const seen=new Set();
            const unique=[];
            sets.forEach(st=>{
              const key=[st.distance,st.time,st.fc||'',st.pasos||''].join('|');
              if(!seen.has(key)){ seen.add(key); unique.push(st); }
            });
            unique.forEach(st=>lines.push('> '+e.name+': '+runLine1816(st)));
          }else{
            // No deduplicar: sets idénticos son series reales.
            lines.push('> '+e.name+': '+sets.map(st=>st.weight+'kg x '+st.reps).join(' | '));
          }
        });
        lines.push('');
      });
    }
    const n=exportNutritionLines(fechaInicio,domingo);
    if(n.length){ lines.push(sep); lines.push(...n); }
    if(typeof exportRecoveryLines==='function'){
      const r=exportRecoveryLines(fechaInicio,domingo);
      if(r.length){ lines.push(sep); lines.push(...r); }
    }
    lines.push(sep);
    lines.push('Corrección v181.6 aplicada en exportador FINAL');
    lines.push('Generado por MELQART - '+new Date().toLocaleDateString('es-CL'));
    const txt=lines.join('\n');
    if(navigator.clipboard) navigator.clipboard.writeText(txt).then(()=>showToast('Historial copiado al portapapeles',3000,'ok'));
    else{
      const modal=document.getElementById('modal-ejercicio');
      modal.querySelector('.modal-title').textContent='Historial exportado';
      modal.querySelector('.modal-body').innerHTML='<textarea style="width:100%;height:300px;font-family:monospace;font-size:11px;border:1px solid var(--border);border-radius:var(--r);padding:10px;resize:none" readonly>'+txt+'</textarea>';
      modal.classList.add('show');
    }
    return txt;
  };

  window.melqartFix1816=function(){ repair1816(); try{renderAll()}catch(e){} return localStorage.getItem('melqart_v181_6_core_repaired'); };
  setTimeout(()=>{ try{ repair1816(); }catch(e){} }, 700);
  console.info('MELQART v181.6 FINAL cargado: exportarSemana/exportNutritionLines sobrescritos al final');
})();



// MELQART v181.7 hard binding
(function(){
  try{
    window.exportarSemana = exportarSemana;
    window.melqartDiagnosticoExportador = function(){
      return {
        exportarSemanaV1817: exportarSemana.toString().includes('v181.7'),
        exportNutritionV1816: typeof exportNutritionLines==='function' && exportNutritionLines.toString().includes('v181.6'),
        exportNutritionV1815: typeof exportNutritionLines==='function' && exportNutritionLines.toString().includes('v181.5')
      };
    };
    console.info('MELQART v181.7 cargado: exportarSemana reemplazado en función original');
  }catch(e){ console.warn('MELQART v181.7 hard binding error', e); }
})();



// ---------------------------------------------------------------
// MELQART v181.8 — último override efectivo de exportarSemana
// Diagnóstico anterior: exportNutritionLines v181.6 = true, exportarSemana v181.7 = false.
// Este bloque va al final y redefine exportarSemana después de todos los parches previos.
// ---------------------------------------------------------------
(function(){
  function fixBeforeExport1818(){
    try{ if(typeof melqartFix1816==='function') melqartFix1816(); }catch(e){}
    try{ if(typeof mq1815RepairCoreData==='function') mq1815RepairCoreData(); }catch(e){}
  }
  function fmtRun1818(st){
    const dist=parseFloat(st.distance)||0;
    return dist.toFixed(2)+'km'+(st.time?' - '+fmtTimeStr(st.time):'')+(st.fc?' - FC '+st.fc+'bpm':'');
  }
  exportarSemana = function(){
    // v181.8 reemplazo final efectivo
    fixBeforeExport1818();
    const semanas=parseInt(document.getElementById('export-semanas')?.value||'4');
    const hoy=new Date();
    const lunes=new Date(hoy); lunes.setDate(hoy.getDate()-(hoy.getDay()||7)+1); lunes.setHours(0,0,0,0);
    let fechaInicio;
    if(semanas===0){
      fechaInicio=new Date(0);
    } else {
      fechaInicio=new Date(lunes);
      fechaInicio.setDate(lunes.getDate()-((semanas-1)*7));
    }
    const domingo=new Date(hoy); domingo.setHours(23,59,59,999);
    const ses=(forge.sessions||[]).filter(s=>new Date(s.date)>=fechaInicio&&new Date(s.date)<=domingo).sort((a,b)=>a.date-b.date);
    const fmtDate=d=>new Date(d).toLocaleDateString('es-CL',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
    const fmtDur=s=>{ const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60; return h>0?(h+'h '+m+'m'):(m+'m '+sec+'s'); };
    const sep='-------------------------------';
    const lines=[];
    lines.push(sep);
    const tituloRango=semanas===0?'HISTORIAL COMPLETO':('ULTIMAS '+semanas+' SEMANA'+(semanas>1?'S':''));
    lines.push(tituloRango);
    lines.push(fechaInicio.toLocaleDateString('es-CL')+' - '+domingo.toLocaleDateString('es-CL'));
    lines.push(sep);
    lines.push('');
    if(typeof exportWeightLines==='function') lines.push(...exportWeightLines(fechaInicio,domingo));
    if(typeof exportAnthropometryLines==='function'){
      const anthroLines=exportAnthropometryLines(fechaInicio,domingo);
      if(anthroLines.length) lines.push(...anthroLines);
    }
    if(!ses.length){
      lines.push('Sin sesiones en este periodo.');
    } else {
      const semanaStr=d=>{ const x=new Date(d); const l=new Date(x); l.setDate(x.getDate()-(x.getDay()||7)+1); return l.toLocaleDateString('es-CL',{day:'numeric',month:'long'}); };
      let semActual='';
      lines.push('SESIONES ('+ses.length+' total)');
      lines.push('');
      ses.forEach(s=>{
        const sw=semanaStr(s.date);
        if(sw!==semActual){ semActual=sw; lines.push('> '); lines.push('> Semana del '+sw); }
        lines.push('> '+fmtDate(s.date)+' - '+(s.routineName||'Sesion libre'));
        if(s.elapsed) lines.push('> Duracion: '+fmtDur(s.elapsed));
        if(s.fcMedia) lines.push('> FC media: '+s.fcMedia+'bpm');
        if(s.kcal) lines.push('> Calorias: '+s.kcal+'kcal');
        if(s.pasos) lines.push('> Pasos: '+s.pasos);
        (s.exercises||[]).forEach(ex=>{
          const e=getEx(ex.exId); if(!e) return;
          if(e.type==='warmup'||e.type==='stretch') return;
          const sets=(ex.sets||[]).filter(st=>st.done!==false);
          if(!sets.length) return;
          if(e.type==='run'||e.type==='hiit'||ex.exId==='ex_correr'){
            const seen=new Set();
            const unique=[];
            sets.forEach(st=>{
              const key=[st.distance,st.time,st.fc||'',st.pasos||''].join('|');
              if(!seen.has(key)){ seen.add(key); unique.push(st); }
            });
            unique.forEach(st=>lines.push('> '+e.name+': '+fmtRun1818(st)));
          } else {
            // v181.8: no deduplicar series idénticas.
            lines.push('> '+e.name+': '+sets.map(st=>st.weight+'kg x '+st.reps).join(' | '));
          }
        });
        lines.push('');
      });
    }
    if(typeof exportNutritionLines==='function'){
      const nutritionLines=exportNutritionLines(fechaInicio,domingo);
      if(nutritionLines.length){ lines.push(sep); lines.push(...nutritionLines); }
    }
    if(typeof exportRecoveryLines==='function'){
      const recoveryLines=exportRecoveryLines(fechaInicio,domingo);
      if(recoveryLines.length){ lines.push(sep); lines.push(...recoveryLines); }
    }
    lines.push(sep);
    lines.push('Corrección v181.8 aplicada en exportador FINAL');
    lines.push('Generado por MELQART - '+new Date().toLocaleDateString('es-CL'));
    const txt=lines.join('\n');
    if(navigator.clipboard){
      navigator.clipboard.writeText(txt).then(()=>showToast('Historial copiado al portapapeles',3000,'ok'));
    } else {
      const modal=document.getElementById('modal-ejercicio');
      modal.querySelector('.modal-title').textContent='Historial exportado';
      modal.querySelector('.modal-body').innerHTML='<textarea style="width:100%;height:300px;font-family:monospace;font-size:11px;border:1px solid var(--border);border-radius:var(--r);padding:10px;resize:none" readonly>'+txt+'</textarea>';
      modal.classList.add('show');
    }
    return txt;
  };
  window.exportarSemana=exportarSemana;
  window.melqartDiagnosticoExportador=function(){
    return {
      exportarSemanaV1818: exportarSemana.toString().includes('v181.8'),
      exportarSemanaV1817: exportarSemana.toString().includes('v181.7'),
      exportNutritionV1816: typeof exportNutritionLines==='function' && exportNutritionLines.toString().includes('v181.6'),
      exportNutritionV1815: typeof exportNutritionLines==='function' && exportNutritionLines.toString().includes('v181.5')
    };
  };
  console.info('MELQART v181.8 cargado: exportarSemana final sobrescrito al final del archivo');
})();



// ---------------------------------------------------------------
// MELQART v184 — importador JSON carrera + medidas con huincha
// ---------------------------------------------------------------
(function mq184Importers(){
  function mq184Today(){
    try { return typeof today==='function' ? today() : new Date().toISOString().slice(0,10); }
    catch(e){ return new Date().toISOString().slice(0,10); }
  }
  function mq184NormDate(d){
    if(!d) return mq184Today();
    if(/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    const dt=new Date(d);
    if(!isNaN(dt)) return dt.toISOString().slice(0,10);
    return mq184Today();
  }
  function mq184TimeToSeconds(v){
    if(typeof v==='number') return Math.round(v);
    const s=String(v||'').trim();
    if(!s) return 0;
    const parts=s.split(':').map(x=>parseInt(x,10)||0);
    if(parts.length===3) return parts[0]*3600+parts[1]*60+parts[2];
    if(parts.length===2) return parts[0]*60+parts[1];
    return parseInt(s,10)||0;
  }
  function mq184SecondsToDuration(sec){
    sec=Math.round(sec||0);
    const h=Math.floor(sec/3600), m=Math.floor((sec%3600)/60), s=sec%60;
    return h>0 ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
  function mq184EnsureExercise(id,name,type){
    if(!forge.exercises) forge.exercises=[];
    let e=forge.exercises.find(x=>x.id===id);
    if(!e){ e={id,name,type}; forge.exercises.push(e); }
    e.name=name; e.type=type||e.type;
    return e;
  }
  function mq184EnsureRoutine(id,name,exerciseIds,emoji='◎'){
    if(!forge.routines) forge.routines=[];
    let r=forge.routines.find(x=>x.id===id);
    if(!r){ r={id,name,emoji,exercises:exerciseIds||[],restSec:90}; forge.routines.push(r); }
    r.name=name; r.emoji=emoji; r.exercises=exerciseIds||r.exercises||[];
    return r;
  }
  function mq184RunJsonToSession(raw){
    const j=typeof raw==='string' ? JSON.parse(raw) : raw;
    const date=mq184NormDate(j.date);
    const time=String(j.time||'12:00').slice(0,5);
    const ts=new Date(`${date}T${time}:00`).getTime();
    const distance=Number(j.distanceKm ?? j.distance ?? j.km ?? 0);
    const duration=String(j.duration || j.timeTotal || j.elapsed || '');
    const seconds=mq184TimeToSeconds(duration);
    const avgPaceReported=j.avgPace || j.ritmoPromedio || j.pace || '';
    const calcPace=distance>0 && seconds>0 ? mq184SecondsToDuration(seconds/distance) : '';
    const avgHeartRate=j.avgHeartRate ?? j.fcMedia ?? j.heartRate ?? j.hr ?? '';
    const calories=j.calories ?? j.kcal ?? '';
    const steps=j.steps ?? j.pasos ?? '';
    const strideCm=j.strideCm ?? j.zancadaCm ?? j.pasoMedioCm ?? '';
    const routineName=j.routineName || 'Domingo — Cardio';
    mq184EnsureExercise('ex_correr','Carrera / Trote','run');
    const routine=mq184EnsureRoutine('rut_domingo_cardio','Domingo — Cardio',['ex_correr'],'◎');

    let sess=(forge.sessions||[]).find(s=>{
      const d=(typeof localDateStr==='function') ? localDateStr(s.date) : new Date(s.date).toISOString().slice(0,10);
      return d===date && (s.exercises||[]).some(e=>e.exId==='ex_correr');
    });
    if(!sess){
      sess={
        id:'run_import_'+date.replaceAll('-','')+'_'+String(Date.now()).slice(-5),
        routineId:routine.id,
        routineName,
        date:ts,
        elapsed:seconds,
        source:j.source||'json_carrera',
        exercises:[]
      };
      if(!forge.sessions) forge.sessions=[];
      forge.sessions.push(sess);
    }
    sess.routineId=sess.routineId||routine.id;
    sess.routineName=routineName;
    sess.date=ts;
    sess.elapsed=seconds || sess.elapsed || 0;
    sess.fcMedia=avgHeartRate ? Number(avgHeartRate) : sess.fcMedia;
    sess.kcal=calories!=='' ? Number(calories) : sess.kcal;
    sess.pasos=steps!=='' ? Number(steps) : sess.pasos;
    sess.source=j.source||sess.source||'json_carrera';
    sess.importedRun={
      distanceKm:distance,
      duration,
      avgHeartRate:avgHeartRate?Number(avgHeartRate):null,
      calories:calories!==''?Number(calories):null,
      steps:steps!==''?Number(steps):null,
      strideCm:strideCm!==''?Number(strideCm):null,
      avgPaceReported,
      avgPaceCalculated:calcPace,
      source:j.source||'json_carrera'
    };
    let ex=(sess.exercises||[]).find(e=>e.exId==='ex_correr');
    if(!ex){ ex={exId:'ex_correr',sets:[]}; sess.exercises.push(ex); }
    ex.sets=[{
      type:'run', done:true, weight:0, reps:0,
      distance:String(distance),
      time:duration,
      fc:avgHeartRate?String(avgHeartRate):'',
      pasos:steps?String(steps):'',
      calories:calories,
      strideCm:strideCm,
      avgPaceReported,
      avgPaceCalculated:calcPace
    }];
    try{ if(typeof saveDB==='function') saveDB(); }catch(e){}
    try{ if(typeof renderAll==='function') renderAll(); }catch(e){}
    return sess;
  }
  function mq184NormalizeTapeJson(raw){
    const j=typeof raw==='string' ? JSON.parse(raw) : raw;
    const m=j.measurements || j.medidas || j.perimetros || j;
    const n=v=>v===''||v===undefined||v===null?null:Number(v);
    return {
      date:mq184NormDate(j.date),
      anthropometry:true,
      source:j.source || 'huincha_semanal',
      perimetros:{
        cinturaOmbligo:n(m.cinturaOmbligo ?? m.cintura ?? m.contornoCintura),
        pecho:n(m.pecho ?? m.torax ?? m.contornoPecho),
        bicepsRelajado:n(m.bicepsRelajado ?? m.bícepsRelajado ?? m.brazoRelajado),
        bicepsApretado:n(m.bicepsApretado ?? m.bícepsApretado ?? m.brazoFlexTension),
        muslo:n(m.muslo ?? m.musloMedial),
        cadera:n(m.cadera ?? m.caderaMaxima)
      }
    };
  }
  function mq184UpsertTape(raw){
    const rec=mq184NormalizeTapeJson(raw);
    if(!forge.bodyMetrics) forge.bodyMetrics=[];
    if(!forge.anthropometry) forge.anthropometry=[];
    const mergeInto=(arr)=>{
      const idx=arr.findIndex(x=>x.date===rec.date && (x.source==='huincha_semanal' || x.source==='medicion_huincha_semanal'));
      if(idx>=0) arr[idx]={...arr[idx], ...rec, perimetros:{...(arr[idx].perimetros||{}), ...rec.perimetros}};
      else arr.push(rec);
    };
    mergeInto(forge.bodyMetrics);
    mergeInto(forge.anthropometry);
    try{ if(typeof normalizeAnthropometry==='function') normalizeAnthropometry(); }catch(e){}
    try{ if(typeof saveDB==='function') saveDB(); }catch(e){}
    try{ if(typeof renderAll==='function') renderAll(); }catch(e){}
    return rec;
  }
  function mq184Modal(title, placeholder, onLoad){
    const modalBg=document.createElement('div');
    modalBg.className='modal-bg on';
    modalBg.id='mq184-json-modal';
    modalBg.innerHTML=`<div class="modal" style="max-height:88dvh">
      <div class="modal-handle"></div>
      <div class="modal-head">
        <div class="modal-title">${title}</div>
        <button class="bicon" onclick="document.getElementById('mq184-json-modal')?.remove()">×</button>
      </div>
      <div class="modal-body">
        <textarea id="mq184-json-text" style="width:100%;height:260px;font-family:monospace;font-size:12px;border:1px solid var(--border);border-radius:var(--r);padding:10px;background:var(--bg2);color:var(--ink)" placeholder='${placeholder.replaceAll("'","&#39;")}'></textarea>
        <div id="mq184-json-err" style="color:var(--warn);font-size:12px;margin-top:8px;display:none"></div>
        <button class="btn btn-p" style="margin-top:12px" onclick="mq184ConfirmJsonImport()">Cargar JSON</button>
      </div>
    </div>`;
    window._mq184OnLoad=onLoad;
    window.mq184ConfirmJsonImport=function(){
      const txt=document.getElementById('mq184-json-text').value.trim();
      const err=document.getElementById('mq184-json-err');
      try{
        const obj=JSON.parse(txt);
        const res=window._mq184OnLoad(obj);
        document.getElementById('mq184-json-modal')?.remove();
        if(typeof showToast==='function') showToast('Datos cargados correctamente',3000,'ok');
        console.log('MELQART v184 import OK', res);
      }catch(e){
        err.style.display='block';
        err.textContent='JSON inválido o incompleto: '+(e.message||e);
      }
    };
    modalBg.addEventListener('click', e=>{ if(e.target===modalBg) modalBg.remove(); });
    document.body.appendChild(modalBg);
  }

  window.openRunJsonImporter=function(){
    mq184Modal('Cargar datos de carrera', `{
  "date": "2026-06-07",
  "time": "09:27",
  "type": "trote",
  "routineName": "Domingo — Cardio",
  "exerciseName": "Carrera / Trote",
  "distanceKm": 10.01,
  "duration": "01:19:36",
  "avgHeartRate": 148,
  "calories": 269.3,
  "steps": 11568,
  "strideCm": 87,
  "avgPace": "8:56",
  "source": "captura_reloj"
}`, mq184RunJsonToSession);
  };
  window.openTapeJsonImporter=function(){
    mq184Modal('Cargar medidas con huincha', `{
  "date": "2026-06-07",
  "source": "huincha_semanal",
  "measurements": {
    "cinturaOmbligo": 97,
    "pecho": 111,
    "bicepsRelajado": 36,
    "bicepsApretado": 38,
    "muslo": 60,
    "cadera": 110
  }
}`, mq184UpsertTape);
  };
  window.importRunJson=window.mq184RunJsonToSession=mq184RunJsonToSession;
  window.importTapeMeasurementsJson=window.mq184UpsertTape=mq184UpsertTape;

  // Extender métricas de perímetros con huincha, sin romper informes antropométricos.
  function ensureTapeMetrics(){
    if(!window.ANTRO_METRICS || !ANTRO_METRICS.perimetros) return;
    const add=(key,label,path)=>{
      if(!ANTRO_METRICS.perimetros.some(x=>x.key===key)){
        ANTRO_METRICS.perimetros.push({key,label,unit:'cm',color:'var(--teal)',path});
      }
    };
    add('cinturaOmbligo','Cintura ombligo','perimetros.cinturaOmbligo');
    add('pecho','Pecho','perimetros.pecho');
    add('bicepsRelajado','Bíceps relajado','perimetros.bicepsRelajado');
    add('bicepsApretado','Bíceps apretado','perimetros.bicepsApretado');
    add('musloHuincha','Muslo huincha','perimetros.muslo');
    add('caderaHuincha','Cadera huincha','perimetros.cadera');
  }
  ensureTapeMetrics();

  // Añadir botones sin reescribir toda la pantalla.
  const oldRenderRutinas=typeof renderRutinas==='function' ? renderRutinas : null;
  if(oldRenderRutinas && !window._mq184RenderRutinasHooked){
    window._mq184RenderRutinasHooked=true;
    renderRutinas=function(){
      oldRenderRutinas.apply(this,arguments);
      const top=document.getElementById('train-topbar-right');
      if(top && !document.getElementById('mq184-run-import-btn')){
        top.innerHTML = `<button id="mq184-run-import-btn" class="btn btn-ghost btn-sm" onclick="openRunJsonImporter()">Cargar trote</button>` + top.innerHTML;
      }
      const list=document.getElementById('rutinas-list');
      if(list && !document.getElementById('mq184-tape-import-card')){
        list.insertAdjacentHTML('afterbegin', `<div id="mq184-tape-import-card" class="rutina-card" style="border-color:var(--border2);padding:14px 16px">
          <div class="rutina-name">Medidas con huincha</div>
          <div class="rutina-meta">Cintura, pecho, bíceps, muslo y cadera</div>
          <button class="btn btn-p" style="margin-top:10px" onclick="openTapeJsonImporter()">Cargar medidas</button>
        </div>`);
      }
      // En tarjetas de cardio/correr, añadir botón cargar datos.
      document.querySelectorAll('.rutina-card').forEach(card=>{
        const txt=card.textContent||'';
        if(/cardio|trote|correr|domingo/i.test(txt) && !card.querySelector('.mq184-load-run-inline')){
          card.insertAdjacentHTML('beforeend', `<button class="mq184-load-run-inline" onclick="event.stopPropagation();openRunJsonImporter()"
            style="width:100%;padding:10px;background:var(--bg2);color:var(--p);border:0;border-top:1px solid var(--border);font-family:var(--ff);font-size:11px;font-weight:700;letter-spacing:1px;cursor:pointer">
            Cargar datos
          </button>`);
        }
      });
    };
  }

  // Si está la pantalla progreso abierta, que se pueda re-renderizar con nuevas métricas.
  const oldRenderProgCuerpo=typeof renderProgCuerpo==='function' ? renderProgCuerpo : null;
  if(oldRenderProgCuerpo && !window._mq184RenderProgCuerpoHooked){
    window._mq184RenderProgCuerpoHooked=true;
    renderProgCuerpo=function(){
      ensureTapeMetrics();
      return oldRenderProgCuerpo.apply(this,arguments);
    };
  }

  console.info('MELQART v184 importadores cargados');
})();



// ---------------------------------------------------------------
// MELQART v185 — Perímetros medición manual separados
// ---------------------------------------------------------------
(function mq185ManualPerimeters(){
  const MANUAL_KEYS = [
    {key:'cinturaOmbligo', label:'Cintura ombligo', unit:'cm', paths:['perimetros.cinturaOmbligo','perimetros.cintura','measurements.cinturaOmbligo']},
    {key:'pecho', label:'Pecho', unit:'cm', paths:['perimetros.pecho','measurements.pecho']},
    {key:'bicepsRelajado', label:'Bíceps relajado', unit:'cm', paths:['perimetros.bicepsRelajado','perimetros.brazoRelajado','measurements.bicepsRelajado']},
    {key:'bicepsApretado', label:'Bíceps apretado', unit:'cm', paths:['perimetros.bicepsApretado','perimetros.brazoFlexTension','measurements.bicepsApretado']},
    {key:'muslo', label:'Muslo', unit:'cm', paths:['perimetros.muslo','perimetros.musloMedial','measurements.muslo']},
    {key:'cadera', label:'Cadera', unit:'cm', paths:['perimetros.cadera','perimetros.caderaMaxima','measurements.cadera']}
  ];

  function getPath(obj,path){
    return String(path).split('.').reduce((a,k)=>a==null?undefined:a[k], obj);
  }
  function hasManualPerim(m){
    const src=String(m?.source||'').toLowerCase();
    return src.includes('huincha') || src.includes('manual_perimetros') ||
      MANUAL_KEYS.some(k=>k.paths.some(p=>getPath(m,p)!=null && getPath(m,p)!==''));
  }
  function collectManualPerimeters(){
    const byDate={};
    const sources=[...(forge.bodyMetrics||[]), ...(forge.anthropometry||[])];
    sources.forEach(m=>{
      if(!m || !m.date || !hasManualPerim(m)) return;
      if(!byDate[m.date]) byDate[m.date]={date:m.date, source:m.source||'huincha_semanal', perimetros:{}};
      MANUAL_KEYS.forEach(def=>{
        for(const p of def.paths){
          const v=getPath(m,p);
          if(v!=null && v!=='' && !isNaN(Number(v))){
            byDate[m.date].perimetros[def.key]=Number(v);
            break;
          }
        }
      });
    });
    return Object.values(byDate)
      .filter(m=>MANUAL_KEYS.some(k=>m.perimetros[k.key]!=null))
      .sort((a,b)=>a.date.localeCompare(b.date));
  }
  function filterByRange(data, filtro){
    const days={ '1m':30, '2m':60, '3m':90, '4m':120, '6m':180, '8m':240, '12m':365 };
    if(!days[filtro]) return data;
    const corte=new Date(); corte.setDate(corte.getDate()-days[filtro]);
    const corteStr=(typeof localDateStr==='function') ? localDateStr(corte) : corte.toISOString().slice(0,10);
    return data.filter(m=>m.date>=corteStr);
  }
  function metricPts(data, key, filtro){
    return filterByRange(data.filter(m=>m.perimetros?.[key]!=null), filtro)
      .map(m=>({
        date:m.date,
        label:m.date.slice(5).replace('-','/'),
        value:Number(m.perimetros[key]),
        displayValue:Number(m.perimetros[key])+' cm'
      }));
  }
  function renderOneMetric(def, data){
    const ptsAll=data.filter(m=>m.perimetros?.[def.key]!=null);
    if(!ptsAll.length) return '';
    const cardKey='manual_'+def.key;
    const isOpen=!!window._mq185ManualOpen?.[cardKey];
    const filtro=window._mq185ManualFiltro?.[cardKey] || 'all';
    const ult=ptsAll[ptsAll.length-1];
    const prev=ptsAll.length>1 ? ptsAll[ptsAll.length-2] : null;
    const delta=prev ? Math.round((ult.perimetros[def.key]-prev.perimetros[def.key])*10)/10 : null;
    const deltaTxt=delta==null ? '' : ` · ${delta>0?'+':''}${delta} cm vs anterior`;
    const filters=['1m','3m','6m','12m','all'];
    const body = isOpen ? (
      `<div class="acc-kpi-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:10px">
        <div class="acc-kpi"><div class="acc-kpi-val">${ult.perimetros[def.key]} cm</div><div class="acc-kpi-lbl">actual</div></div>
        <div class="acc-kpi"><div class="acc-kpi-val" style="color:${delta==null?'var(--ink3)':delta<0?'var(--ok)':'var(--p)'}">${delta==null?'—':(delta>0?'+':'')+delta+' cm'}</div><div class="acc-kpi-lbl">variación</div></div>
        <div class="acc-kpi"><div class="acc-kpi-val">${ptsAll.length}</div><div class="acc-kpi-lbl">registros</div></div>
      </div>
      <div class="acc-filters">${filters.map(f=>`<button class="acc-filter-btn${filtro===f?' on':''}" onclick="event.stopPropagation();mq185SetManualFiltro('${cardKey}','${f}')">${f==='all'?'Todo':f.toUpperCase()}</button>`).join('')}</div>
      ${typeof renderMetricChart==='function' ? renderMetricChart({
        id:'mq185_'+def.key+'_'+filtro,
        type:'manual-perimeter',
        unit:'cm',
        unitLabel:'cm',
        title:def.label,
        subtitle:'Medición manual con huincha',
        data:metricPts(data,def.key,filtro),
        yAxis:{forceZero:false},
        tooltip:{showDate:true},
        height:180,
        color:'var(--p)',
        activeFilter:'all'
      }) : `<div class="mq-chart-empty"><div class="mq-chart-empty-text">Sin motor de gráfico disponible</div></div>`}`
    ) : '';
    return `<div class="acc-card${isOpen?' open':''}" id="acc-${cardKey}" style="margin-bottom:0">
      <div class="acc-head" onclick="mq185ToggleManual('${cardKey}');event.stopPropagation()">
        <div class="acc-head-left">
          <div class="acc-ex-name">${def.label}</div>
          <div class="acc-ex-sub">${ptsAll.length} registros · huincha${deltaTxt}</div>
        </div>
        <div class="acc-head-right">
          <div class="acc-pdr-val">${ult.perimetros[def.key]} cm</div>
        </div>
        <svg class="acc-chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="acc-body" id="body-acc-body-${cardKey}">${body}</div>
    </div>`;
  }
  function renderManualSection(){
    const data=collectManualPerimeters();
    const h=document.getElementById('cuerpo-historial');
    if(!h) return;
    const old=document.getElementById('body-acc-perimetros-manual');
    if(old) old.remove();
    const sub=data.length ? `${data.length} registro${data.length===1?'':'s'} · huincha semanal` : 'Cintura, pecho, bíceps, muslo y cadera';
    const isOpen=!!window._mq185ManualSectionOpen;
    const bodyHtml = isOpen ? (
      data.length
        ? MANUAL_KEYS.map(k=>renderOneMetric(k,data)).filter(Boolean).join('')
        : `<div class="mq-chart-empty" style="padding:24px 0"><div class="mq-chart-empty-text">Sin datos de medición manual</div><div class="mq-chart-empty-sub">Carga un JSON de huincha desde Entrenar o consola.</div></div>`
    ) : '';
    const html=`<div class="body-acc-card${isOpen?' open':''}" id="body-acc-perimetros-manual">
      <div class="acc-head" onclick="mq185ToggleManualSection()">
        <div class="acc-head-left">
          <div class="acc-ex-name">Perímetros medición manual</div>
          <div class="acc-ex-sub">${sub}</div>
        </div>
        <svg class="acc-chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="acc-body" id="body-acc-body-perimetros-manual">${bodyHtml}</div>
    </div>`;
    const per=document.getElementById('body-acc-perimetros');
    if(per) per.insertAdjacentHTML('afterend', html);
    else h.insertAdjacentHTML('beforeend', html);
  }

  window._mq185ManualOpen=window._mq185ManualOpen||{};
  window._mq185ManualFiltro=window._mq185ManualFiltro||{};
  window.mq185ToggleManualSection=function(){
    window._mq185ManualSectionOpen=!window._mq185ManualSectionOpen;
    renderManualSection();
  };
  window.mq185ToggleManual=function(key){
    window._mq185ManualOpen[key]=!window._mq185ManualOpen[key];
    renderManualSection();
  };
  window.mq185SetManualFiltro=function(key,filtro){
    window._mq185ManualFiltro[key]=filtro;
    renderManualSection();
  };
  window.mq185ManualPerimetersData=collectManualPerimeters;

  const oldRenderProgCuerpo=typeof renderProgCuerpo==='function' ? renderProgCuerpo : null;
  if(oldRenderProgCuerpo && !window._mq185RenderProgCuerpoHooked){
    window._mq185RenderProgCuerpoHooked=true;
    renderProgCuerpo=function(){
      const r=oldRenderProgCuerpo.apply(this,arguments);
      setTimeout(renderManualSection,0);
      return r;
    };
  }

  // Asegurar que el importador de huincha refresque esta sección.
  if(typeof window.importTapeMeasurementsJson==='function' && !window._mq185ImportTapeHooked){
    const oldImport=window.importTapeMeasurementsJson;
    window._mq185ImportTapeHooked=true;
    window.importTapeMeasurementsJson=function(obj){
      const r=oldImport(obj);
      setTimeout(()=>{ try{ renderProgCuerpo(); renderManualSection(); }catch(e){} },0);
      return r;
    };
    window.mq184UpsertTape=window.importTapeMeasurementsJson;
  }

  // Exportador: sección separada de huincha.
  window.exportManualPerimetersLines=function(fechaInicio, fechaFin){
    const data=collectManualPerimeters().filter(m=>{
      const d=new Date(m.date+'T12:00:00');
      return (!fechaInicio || d>=fechaInicio) && (!fechaFin || d<=fechaFin);
    });
    if(!data.length) return [];
    const lines=['PERIMETROS MEDICION MANUAL'];
    data.forEach(m=>{
      lines.push(`  ${m.date}: cintura ombligo=${m.perimetros.cinturaOmbligo??'—'} cm · pecho=${m.perimetros.pecho??'—'} cm · bíceps relajado=${m.perimetros.bicepsRelajado??'—'} cm · bíceps apretado=${m.perimetros.bicepsApretado??'—'} cm · muslo=${m.perimetros.muslo??'—'} cm · cadera=${m.perimetros.cadera??'—'} cm`);
    });
    lines.push('');
    return lines;
  };
  if(typeof window.exportAnthropometryLines==='function' && !window._mq185ExportAnthroHooked){
    const oldExport=window.exportAnthropometryLines;
    window._mq185ExportAnthroHooked=true;
    window.exportAnthropometryLines=function(fechaInicio, fechaFin){
      const base=oldExport(fechaInicio,fechaFin)||[];
      const manual=window.exportManualPerimetersLines(fechaInicio,fechaFin);
      if(!manual.length) return base;
      if(!base.length) return manual;
      return base.concat(manual);
    };
  }

  setTimeout(()=>{ try{ renderManualSection(); }catch(e){} },800);
  console.info('MELQART v185: sección Perímetros medición manual cargada');
})();



// ---------------------------------------------------------------
// MELQART v186 — mover huincha desde Entrenar a Progreso > Medidas corporales
// ---------------------------------------------------------------
(function mq186MoveTapeImporter(){
  function removeTapeFromTraining(){
    const card=document.getElementById('mq184-tape-import-card');
    if(card) card.remove();
  }
  function addTapeButtonToBodyProgress(){
    const h=document.getElementById('cuerpo-historial');
    if(!h || document.getElementById('mq186-tape-progress-actions')) return;
    const html=`<div id="mq186-tape-progress-actions" style="display:flex;gap:8px;justify-content:flex-end;margin:0 0 12px 0">
      <button class="btn btn-ghost btn-sm" onclick="openTapeJsonImporter()">Cargar medidas con huincha</button>
    </div>`;
    h.insertAdjacentHTML('afterbegin', html);
  }

  const oldRenderRutinas = typeof renderRutinas==='function' ? renderRutinas : null;
  if(oldRenderRutinas && !window._mq186RenderRutinasHooked){
    window._mq186RenderRutinasHooked=true;
    renderRutinas=function(){
      const r=oldRenderRutinas.apply(this,arguments);
      removeTapeFromTraining();
      return r;
    };
  }

  const oldRenderProgCuerpo = typeof renderProgCuerpo==='function' ? renderProgCuerpo : null;
  if(oldRenderProgCuerpo && !window._mq186RenderProgCuerpoHooked){
    window._mq186RenderProgCuerpoHooked=true;
    renderProgCuerpo=function(){
      const r=oldRenderProgCuerpo.apply(this,arguments);
      setTimeout(()=>{
        try{
          addTapeButtonToBodyProgress();
          if(typeof mq185ManualPerimetersData==='function'){
            // La sección v185 se renderiza por su propio hook; este botón queda arriba como acción contextual.
          }
        }catch(e){}
      },0);
      return r;
    };
  }

  // Si la pantalla ya está montada, limpiar y agregar.
  setTimeout(()=>{
    removeTapeFromTraining();
    try{ addTapeButtonToBodyProgress(); }catch(e){}
  },800);

  console.info('MELQART v186: huincha movida a Progreso > Medidas corporales');
})();



// ---------------------------------------------------------------
// MELQART v187 — Planificación de Carrera 10K Base
// ---------------------------------------------------------------
(function mq187RunningPlanBase(){
  const DEFAULT_PLAN_ID='running_10k_2026';
  const GOAL_PACE=400; // 6:40/km
  const GOAL_TIME=4000; // 1h06m40s
  const PHASES=[
    {name:'Base Aeróbica', pct:.40},
    {name:'Desarrollo', pct:.35},
    {name:'Específica', pct:.25}
  ];
  const DEFAULT_HR={
    'Base Aeróbica':{thu:[140,148],sun:[140,150]},
    'Desarrollo':{thu:[145,155],sun:[140,150]},
    'Específica':{thu:[150,160],sun:[140,152]}
  };
  function todayStr187(){
    try{return typeof today==='function'?today():new Date().toISOString().slice(0,10)}
    catch(e){return new Date().toISOString().slice(0,10)}
  }
  function localStr187(d){
    try{return typeof localDateStr==='function'?localDateStr(d):new Date(d).toISOString().slice(0,10)}
    catch(e){return new Date(d).toISOString().slice(0,10)}
  }
  function parseDate187(s){ return new Date(String(s||todayStr187())+'T12:00:00'); }
  function daysBetween187(a,b){ return Math.ceil((parseDate187(b)-parseDate187(a))/(1000*60*60*24)); }
  function fmtPace187(sec){
    sec=Math.round(sec||0);
    if(!sec || !isFinite(sec)) return '—';
    return `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}/km`;
  }
  function fmtTime187(sec){
    sec=Math.round(sec||0);
    if(!sec || !isFinite(sec)) return '—';
    const h=Math.floor(sec/3600), m=Math.floor((sec%3600)/60), s=sec%60;
    if(h>0) return `${h}h${String(m).padStart(2,'0')}m${s?String(s).padStart(2,'0')+'s':''}`;
    return `${m}m${String(s).padStart(2,'0')}s`;
  }
  function secondsFromTime187(t){
    if(typeof t==='number') return t;
    const s=String(t||'').trim();
    if(!s) return 0;
    const p=s.split(':').map(x=>parseInt(x,10)||0);
    if(p.length===3) return p[0]*3600+p[1]*60+p[2];
    if(p.length===2) return p[0]*60+p[1];
    return parseInt(s,10)||0;
  }
  function ensureStore187(){
    if(!forge.runningPlans) forge.runningPlans=[];
    if(!forge.runningPrescriptions) forge.runningPrescriptions={};
  }
  function createInitialRunningPlan187(){
    ensureStore187();
    let plan=forge.runningPlans.find(p=>p.id===DEFAULT_PLAN_ID);
    const start=todayStr187();
    if(!plan){
      plan={
        id:DEFAULT_PLAN_ID,
        active:true,
        planName:'Plan 10K 6:40 — 2026',
        goalDistanceKm:10,
        goalPaceSecondsPerKm:GOAL_PACE,
        goalTimeSeconds:GOAL_TIME,
        goalDate:'2026-12-31',
        startDate:start,
        createdAt:start,
        currentWeek:1,
        totalWeeks:1,
        currentPhase:'Base Aeróbica',
        phaseConfig:{basePct:.40,developmentPct:.35,specificPct:.25},
        heartRateConfig:JSON.parse(JSON.stringify(DEFAULT_HR)),
        checkpointEvents:[{name:'ASICS 10K Agosto 2026',date:'2026-08-01',type:'checkpoint',goalDistanceKm:10}],
        status:'active'
      };
      forge.runningPlans.push(plan);
    }else{
      plan.active=true;
      plan.goalDistanceKm=plan.goalDistanceKm||10;
      plan.goalPaceSecondsPerKm=plan.goalPaceSecondsPerKm||GOAL_PACE;
      plan.goalTimeSeconds=plan.goalTimeSeconds||GOAL_TIME;
      plan.goalDate=plan.goalDate||'2026-12-31';
      plan.startDate=plan.startDate||plan.createdAt||start;
      plan.createdAt=plan.createdAt||plan.startDate;
      plan.heartRateConfig=plan.heartRateConfig||JSON.parse(JSON.stringify(DEFAULT_HR));
      plan.checkpointEvents=plan.checkpointEvents?.length?plan.checkpointEvents:[{name:'ASICS 10K Agosto 2026',date:'2026-08-01',type:'checkpoint',goalDistanceKm:10}];
      plan.status=plan.status||'active';
    }
    updateRunningPlanComputed187(plan);
    generateCurrentWeekPrescription187(plan);
    try{saveDB()}catch(e){}
    try{renderAll()}catch(e){}
    return plan;
  }
  function getActiveRunningPlan187(){
    ensureStore187();
    const p=forge.runningPlans.find(p=>p.active);
    if(p) updateRunningPlanComputed187(p);
    return p||null;
  }
  function updateRunningPlanComputed187(plan){
    const start=plan.startDate||plan.createdAt||todayStr187();
    const total=Math.max(1,Math.ceil(daysBetween187(start,plan.goalDate)/7));
    let cur=Math.floor(daysBetween187(start,todayStr187())/7)+1;
    cur=Math.max(1,Math.min(cur,total));
    plan.totalWeeks=total;
    plan.currentWeek=cur;
    if(parseDate187(todayStr187())>parseDate187(plan.goalDate)) plan.status=plan.status==='completed'?'completed':'expired';
    const baseEnd=Math.ceil(total*(plan.phaseConfig?.basePct??.40));
    const devEnd=baseEnd+Math.ceil(total*(plan.phaseConfig?.developmentPct??.35));
    plan.currentPhase=cur<=baseEnd?'Base Aeróbica':cur<=devEnd?'Desarrollo':'Específica';
    return plan;
  }
  function getRunSessions187(){
    const runs=[];
    (forge.sessions||[]).forEach(s=>{
      (s.exercises||[]).forEach(ex=>{
        const e=typeof getEx==='function'?getEx(ex.exId):null;
        if(ex.exId==='ex_correr' || e?.type==='run' || /carrera|trote|correr/i.test(e?.name||'')){
          (ex.sets||[]).forEach(st=>{
            const dist=parseFloat(st.distance)||parseFloat(st.distanceKm)||0;
            const sec=secondsFromTime187(st.time||st.duration||s.elapsed||0);
            if(dist>0 && sec>0){
              runs.push({
                date:localStr187(s.date),
                ts:s.date,
                distanceKm:dist,
                durationSec:sec,
                paceSec:sec/dist,
                fc:Number(st.fc||s.fcMedia||0)||null,
                kcal:Number(st.calories||s.kcal||0)||null,
                steps:Number(st.pasos||s.pasos||0)||null,
                routineName:s.routineName||'Trote'
              });
            }
          });
        }
      });
    });
    return runs.sort((a,b)=>a.ts-b.ts);
  }
  function currentPace187(){
    const runs=getRunSessions187();
    if(!runs.length) return {paceSec:null, source:'sin datos', runs:[]};
    const now=new Date();
    const d30=new Date(now); d30.setDate(now.getDate()-30);
    let recent=runs.filter(r=>new Date(r.date+'T12:00:00')>=d30);
    let source='últimos 30 días';
    if(recent.length<2){
      const d28=new Date(now); d28.setDate(now.getDate()-28);
      recent=runs.filter(r=>new Date(r.date+'T12:00:00')>=d28);
      source='últimas 4 semanas';
    }
    if(!recent.length){ recent=[runs[runs.length-1]]; source='último trote válido'; }
    const priority=recent.filter(r=>r.distanceKm>=8 && r.distanceKm<=12);
    const base=priority.length?priority:recent;
    if(priority.length) source += ' · 8K–12K';
    const totalKm=base.reduce((a,r)=>a+r.distanceKm,0);
    const totalSec=base.reduce((a,r)=>a+r.durationSec,0);
    return {paceSec:totalKm?totalSec/totalKm:null, source, runs:base};
  }
  function predict10k187(){
    const runs=getRunSessions187().slice().reverse();
    if(!runs.length) return {timeSec:null, source:'sin datos'};
    const exact=runs.find(r=>r.distanceKm>=9.8 && r.distanceKm<=10.2);
    if(exact) return {timeSec:exact.paceSec*10, source:'10K reciente'};
    const near=runs.find(r=>r.distanceKm>=8 && r.distanceKm<=12);
    if(near) return {timeSec:near.paceSec*10, source:'trote 8K–12K extrapolado'};
    const five=runs.find(r=>r.distanceKm>=4.8 && r.distanceKm<=5.3);
    if(five) return {timeSec:five.durationSec*2.1, source:'5K x 2.1'};
    const cur=currentPace187();
    return {timeSec:cur.paceSec?cur.paceSec*10:null, source:cur.source};
  }
  function longMax187(){
    const runs=getRunSessions187();
    if(!runs.length) return null;
    return runs.reduce((max,r)=>!max||r.distanceKm>max.distanceKm?r:max,null);
  }
  function avgFc187(){
    const runs=currentPace187().runs.filter(r=>r.fc);
    if(!runs.length) return null;
    return Math.round(runs.reduce((a,r)=>a+r.fc,0)/runs.length);
  }
  function weekStart187(dateStr){
    const d=parseDate187(dateStr||todayStr187());
    d.setDate(d.getDate()-(d.getDay()||7)+1);
    return localStr187(d);
  }
  function phaseHr187(plan, day){
    const phase=plan.currentPhase||'Base Aeróbica';
    const cfg=plan.heartRateConfig||DEFAULT_HR;
    return cfg[phase]?.[day] || DEFAULT_HR[phase]?.[day] || [140,150];
  }
  function prescriptionForWeek187(plan, week){
    const phase=plan.currentPhase||'Base Aeróbica';
    const baseLong=8.5, increment=.25;
    const longKm=Math.min(12, Math.round((baseLong+(week-1)*increment)*10)/10);
    const thuKm=Math.max(4, Math.min(7, Math.round((longKm*.52)*10)/10));
    const thuType=phase==='Base Aeróbica'?'EASY_RUN':phase==='Desarrollo'?'PROGRESSIVE_RUN':'TEMPO_RUN';
    const sunType='LONG_RUN';
    const thuHr=phaseHr187(plan,'thu'), sunHr=phaseHr187(plan,'sun');
    return {
      planId:plan.id,
      week,
      weekStart:weekStart187(),
      phase,
      workouts:[
        {
          day:'jueves',
          type:thuType,
          targetDistanceKm:thuKm,
          estimatedTimeSec:thuKm*(currentPace187().paceSec||plan.goalPaceSecondsPerKm+60),
          targetHeartRateRange:thuHr,
          description:phase==='Base Aeróbica'?'Rodaje controlado, cómodo y sin forzar.':phase==='Desarrollo'?'Progresivo moderado, cerrar controlado.':'Bloque específico cerca de ritmo objetivo.',
          structure:phase==='Base Aeróbica'?['Rodaje suave continuo']:[`1 km suave`,`${Math.max(1,Math.round((thuKm-2)*10)/10)} km controlado`,`1 km suave`]
        },
        {
          day:'domingo',
          type:sunType,
          targetDistanceKm:longKm,
          estimatedTimeSec:longKm*(currentPace187().paceSec||plan.goalPaceSecondsPerKm+60),
          targetHeartRateRange:sunHr,
          description:'Largo aeróbico. Priorizar completar distancia dentro de rango de FC.',
          structure:['Largo continuo aeróbico']
        }
      ]
    };
  }
  function generateCurrentWeekPrescription187(plan){
    ensureStore187();
    updateRunningPlanComputed187(plan);
    const key=`${plan.id}_w${plan.currentWeek}`;
    const p=prescriptionForWeek187(plan,plan.currentWeek);
    forge.runningPrescriptions[key]=p;
    return p;
  }
  function getCurrentPrescription187(plan){
    ensureStore187();
    const key=`${plan.id}_w${plan.currentWeek}`;
    return forge.runningPrescriptions[key] || generateCurrentWeekPrescription187(plan);
  }
  function actualForDay187(day){
    const runs=getRunSessions187();
    const ws=weekStart187();
    const we=new Date(ws+'T12:00:00'); we.setDate(we.getDate()+6);
    const start=parseDate187(ws).getTime(), end=we.getTime();
    return runs.filter(r=>r.ts>=start && r.ts<=end).filter(r=>{
      const dow=parseDate187(r.date).getDay();
      return day==='jueves' ? dow===4 : day==='domingo' ? dow===0 : true;
    }).sort((a,b)=>b.ts-a.ts)[0] || null;
  }
  function evalPlanWeek187(plan){
    const pres=getCurrentPrescription187(plan);
    const rows=pres.workouts.map(w=>{
      const real=actualForDay187(w.day);
      const distPct=real?real.distanceKm/w.targetDistanceKm:0;
      const fcIn=real?.fc ? real.fc>=w.targetHeartRateRange[0] && real.fc<=w.targetHeartRateRange[1] : null;
      const deviation=real?Math.round((real.distanceKm-w.targetDistanceKm)*10)/10:null;
      return {w, real, distPct, fcIn, deviation};
    });
    const avg=rows.length?rows.reduce((a,r)=>a+(r.real?Math.min(1.2,r.distPct):0),0)/rows.length:0;
    const overFc=rows.some(r=>r.fcIn===false && r.real?.fc>w.targetHeartRateRange?.[1]);
    let suggestion='mantener';
    if(avg>=.95 && rows.every(r=>r.fcIn!==false)) suggestion='subir suavemente';
    if(avg<.8) suggestion='repetir semana';
    if(overFc) suggestion='descargar o mantener';
    return {prescription:pres, rows, compliancePct:Math.round(avg*100), suggestion};
  }
  function renderRunningGoalCard187(){
    const plan=getActiveRunningPlan187();
    const cur=currentPace187();
    const pred=predict10k187();
    const long=longMax187();
    if(!plan){
      return `<div class="card mq-running-card">
        <div class="section-title">◇ Objetivo de carrera</div>
        <div class="empty" style="padding:18px 0"><div class="empty-text">No hay plan de carrera activo</div><div class="empty-sub">Crea un plan 10K sin modificar fuerza.</div></div>
        <button class="btn btn-p" onclick="createRunningPlan10K187()">Crear plan 10K</button>
      </div>`;
    }
    const gap=cur.paceSec?Math.round(cur.paceSec-plan.goalPaceSecondsPerKm):null;
    return `<div class="card mq-running-card">
      <div class="section-title">◇ Objetivo de carrera</div>
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
        <div>
          <div style="font-size:20px;font-weight:900;color:var(--ink)">10 km @ ${fmtPace187(plan.goalPaceSecondsPerKm)}</div>
          <div style="font-size:12px;color:var(--ink3);margin-top:3px">Fecha: ${plan.goalDate} · Semana ${plan.currentWeek}/${plan.totalWeeks}</div>
        </div>
        <div class="chip" style="background:var(--bg3);color:var(--p);font-weight:800">${plan.currentPhase}</div>
      </div>
      <div class="acc-kpi-grid" style="grid-template-columns:repeat(3,1fr);margin-top:12px">
        <div class="acc-kpi"><div class="acc-kpi-val">${fmtPace187(cur.paceSec)}</div><div class="acc-kpi-lbl">ritmo actual</div></div>
        <div class="acc-kpi"><div class="acc-kpi-val" style="color:${gap!=null&&gap<=0?'var(--ok)':'var(--p)'}">${gap==null?'—':(gap>0?'+':'')+Math.floor(Math.abs(gap)/60)+':'+String(Math.abs(gap)%60).padStart(2,'0')}</div><div class="acc-kpi-lbl">brecha</div></div>
        <div class="acc-kpi"><div class="acc-kpi-val">${fmtTime187(pred.timeSec)}</div><div class="acc-kpi-lbl">pred. 10K</div></div>
      </div>
      <div style="font-size:11px;color:var(--ink3);margin-top:8px">Fuente ritmo: ${cur.source} · Predicción: ${pred.source}${long?` · Largo máx: ${long.distanceKm.toFixed(2)} km`:''}</div>
    </div>`;
  }
  function injectRunningHome187(){
    const host=document.getElementById('home-plan-banner');
    if(!host || document.getElementById('mq187-home-running')) return;
    host.insertAdjacentHTML('afterend', `<div id="mq187-home-running">${renderRunningGoalCard187()}</div>`);
  }
  function renderTrainPrescription187(){
    const plan=getActiveRunningPlan187();
    if(!plan) return '';
    const pres=getCurrentPrescription187(plan);
    return `<div id="mq187-train-prescription" class="rutina-card" style="grid-column:1/-1;border-color:var(--p);overflow:hidden">
      <div style="background:linear-gradient(90deg,rgba(111,62,168,.10),var(--bg2));padding:8px 16px;border-bottom:1px solid var(--border)">
        <span style="font-size:10px;font-weight:800;color:var(--p);letter-spacing:1px;text-transform:uppercase">Plan de carrera · Semana ${plan.currentWeek}/${plan.totalWeeks} · ${plan.currentPhase}</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;padding:14px">
        ${pres.workouts.map(w=>`<div style="border:1px solid var(--border);border-radius:14px;padding:12px;background:var(--bg2)">
          <div style="font-size:12px;color:var(--ink3);text-transform:uppercase;letter-spacing:1px;font-weight:800">${w.day}</div>
          <div style="font-size:17px;font-weight:900;color:var(--ink);margin-top:3px">${w.type.replaceAll('_',' ')}</div>
          <div style="font-size:13px;color:var(--p);font-weight:800;margin-top:4px">${w.targetDistanceKm} km · FC ${w.targetHeartRateRange[0]}-${w.targetHeartRateRange[1]}</div>
          <div style="font-size:12px;color:var(--ink3);margin-top:6px">${w.description}</div>
          <div style="font-size:11px;color:var(--ink2);margin-top:6px">${(w.structure||[]).join(' · ')}</div>
          <button class="btn btn-ghost btn-sm" style="margin-top:10px" onclick="openRunJsonImporter()">Cargar datos</button>
        </div>`).join('')}
      </div>
    </div>`;
  }
  function injectRunningTrain187(){
    const list=document.getElementById('rutinas-list');
    if(!list || document.getElementById('mq187-train-prescription')) return;
    list.insertAdjacentHTML('afterbegin', renderTrainPrescription187());
  }
  function renderRunningProgress187(){
    const plan=getActiveRunningPlan187();
    if(!plan) return '';
    const runs=getRunSessions187();
    const pred=predict10k187(), cur=currentPace187(), long=longMax187(), fc=avgFc187();
    const paceData=runs.map(r=>({date:r.date,label:r.date.slice(5).replace('-','/'),value:Math.round(r.paceSec),displayValue:fmtPace187(r.paceSec)}));
    const fcData=runs.filter(r=>r.fc).map(r=>({date:r.date,label:r.date.slice(5).replace('-','/'),value:r.fc,displayValue:r.fc+' bpm'}));
    let max=0; const distData=runs.map(r=>{max=Math.max(max,r.distanceKm); return {date:r.date,label:r.date.slice(5).replace('-','/'),value:Math.round(max*100)/100,displayValue:(Math.round(max*100)/100)+' km'};});
    const chart=(id,title,unit,data,color='var(--p)')=> data.length && typeof renderMetricChart==='function' ? renderMetricChart({id,type:'running-plan',unit,unitLabel:unit,title,subtitle:'Plan de carrera',data,yAxis:{forceZero:false},tooltip:{showDate:true},height:185,color,activeFilter:'all'}) : `<div class="mq-chart-empty" style="padding:24px 0"><div class="mq-chart-empty-text">Sin datos para ${title}</div></div>`;
    return `<div id="mq187-progress" style="margin-top:18px">
      ${renderRunningGoalCard187()}
      <div class="acc-kpi-grid" style="grid-template-columns:repeat(4,1fr);margin:12px 0">
        <div class="acc-kpi"><div class="acc-kpi-val">${fmtPace187(cur.paceSec)}</div><div class="acc-kpi-lbl">ritmo</div></div>
        <div class="acc-kpi"><div class="acc-kpi-val">${fmtTime187(pred.timeSec)}</div><div class="acc-kpi-lbl">pred. 10K</div></div>
        <div class="acc-kpi"><div class="acc-kpi-val">${long?long.distanceKm.toFixed(2):'—'} km</div><div class="acc-kpi-lbl">largo máx.</div></div>
        <div class="acc-kpi"><div class="acc-kpi-val">${fc||'—'}</div><div class="acc-kpi-lbl">FC prom.</div></div>
      </div>
      <div class="body-acc-card open"><div class="acc-head"><div class="acc-head-left"><div class="acc-ex-name">Carrera · Plan 10K</div><div class="acc-ex-sub">Métricas básicas</div></div></div>
        <div class="acc-body">
          ${chart('mq187_pace','Ritmo promedio','seg/km',paceData)}
          ${chart('mq187_fc','FC promedio','bpm',fcData,'var(--warn)')}
          ${chart('mq187_long','Distancia larga máxima','km',distData,'var(--teal)')}
        </div>
      </div>
    </div>`;
  }
  function injectRunningProgress187(){
    const el=document.getElementById('prog-plan-content') || document.getElementById('prog-ejercicios-content') || document.querySelector('#s-progress .tab-panel.on');
    if(!el || document.getElementById('mq187-progress')) return;
    const plan=getActiveRunningPlan187();
    if(plan) el.insertAdjacentHTML('afterbegin', renderRunningProgress187());
  }
  function renderRunningWeekly187(){
    const plan=getActiveRunningPlan187();
    if(!plan) return '';
    const ev=evalPlanWeek187(plan);
    return `<div id="mq187-weekly" class="card" style="margin-top:14px">
      <div class="section-title">◇ Plan de carrera</div>
      <div style="font-size:13px;color:var(--ink3);margin-bottom:8px">Semana ${plan.currentWeek} de ${plan.totalWeeks} · ${plan.currentPhase}</div>
      ${ev.rows.map(r=>`<div style="border:1px solid var(--border);border-radius:14px;padding:10px;margin-bottom:8px;background:var(--bg2)">
        <div style="display:flex;justify-content:space-between;gap:8px"><strong style="color:var(--ink);text-transform:capitalize">${r.w.day}</strong><span style="color:var(--p);font-weight:800">${r.w.type.replaceAll('_',' ')}</span></div>
        <div style="font-size:12px;color:var(--ink3);margin-top:4px">Objetivo: ${r.w.targetDistanceKm} km · FC ${r.w.targetHeartRateRange[0]}-${r.w.targetHeartRateRange[1]}</div>
        <div style="font-size:12px;color:${r.real?'var(--ink2)':'var(--warn)'};margin-top:3px">Resultado: ${r.real?`${r.real.distanceKm.toFixed(2)} km · FC ${r.real.fc||'—'} · desv. ${r.deviation>0?'+':''}${r.deviation} km`:'pendiente'}</div>
      </div>`).join('')}
      <div style="font-weight:900;color:var(--p);margin-top:8px">Cumplimiento: ${ev.compliancePct}% · Sugerencia: ${ev.suggestion}</div>
    </div>`;
  }
  function injectRunningWeekly187(){
    const candidates=[document.getElementById('weekly-content'),document.getElementById('eval-content'),document.getElementById('home-sessions')];
    const host=candidates.find(Boolean);
    if(!host || document.getElementById('mq187-weekly')) return;
    const plan=getActiveRunningPlan187();
    if(plan && host.id==='home-sessions') host.insertAdjacentHTML('beforebegin', renderRunningWeekly187());
  }
  function exportRunningPlanLines187(fechaInicio,fechaFin){
    const plan=getActiveRunningPlan187();
    if(!plan) return [];
    const ev=evalPlanWeek187(plan);
    const lines=['PLAN DE CARRERA'];
    lines.push(`  Objetivo: ${plan.goalDistanceKm}K @ ${fmtPace187(plan.goalPaceSecondsPerKm)} (${fmtTime187(plan.goalTimeSeconds)})`);
    lines.push(`  Fecha objetivo: ${plan.goalDate}`);
    lines.push(`  Semana: ${plan.currentWeek}/${plan.totalWeeks}`);
    lines.push(`  Fase: ${plan.currentPhase}`);
    ev.rows.forEach(r=>{
      lines.push(`  ${r.w.day}: plan ${r.w.targetDistanceKm} km ${r.w.type} FC ${r.w.targetHeartRateRange[0]}-${r.w.targetHeartRateRange[1]} · real ${r.real?`${r.real.distanceKm.toFixed(2)} km FC ${r.real.fc||'—'} desv ${r.deviation>0?'+':''}${r.deviation} km`:'pendiente'}`);
    });
    lines.push(`  Cumplimiento semanal: ${ev.compliancePct}%`);
    lines.push(`  Sugerencia semanal: ${ev.suggestion}`);
    (plan.checkpointEvents||[]).forEach(c=>lines.push(`  Checkpoint: ${c.name} · ${c.date} · ${c.type}`));
    lines.push('');
    return lines;
  }
  // Hooks
  window.createRunningPlan10K187=createInitialRunningPlan187;
  window.getActiveRunningPlan187=getActiveRunningPlan187;
  window.mq187RunningMetrics=()=>({currentPace:currentPace187(), prediction:predict10k187(), longMax:longMax187(), plan:getActiveRunningPlan187(), eval: getActiveRunningPlan187()?evalPlanWeek187(getActiveRunningPlan187()):null});
  const oldHome=typeof renderHome==='function'?renderHome:null;
  if(oldHome && !window._mq187HomeHooked){ window._mq187HomeHooked=true; renderHome=function(){ const r=oldHome.apply(this,arguments); setTimeout(()=>{try{injectRunningHome187();injectRunningWeekly187()}catch(e){}},0); return r; }; }
  const oldRut=typeof renderRutinas==='function'?renderRutinas:null;
  if(oldRut && !window._mq187RutHooked){ window._mq187RutHooked=true; renderRutinas=function(){ const r=oldRut.apply(this,arguments); setTimeout(()=>{try{injectRunningTrain187()}catch(e){}},0); return r; }; }
  const oldProg=typeof renderProgress==='function'?renderProgress:null;
  if(oldProg && !window._mq187ProgHooked){ window._mq187ProgHooked=true; renderProgress=function(){ const r=oldProg.apply(this,arguments); setTimeout(()=>{try{injectRunningProgress187()}catch(e){}},0); return r; }; }
  if(typeof window.exportarSemana==='function' && !window._mq187ExportHooked){
    const oldExport=window.exportarSemana;
    window._mq187ExportHooked=true;
    window.exportarSemana=function(){
      const txt=oldExport.apply(this,arguments);
      // Si el exportador antiguo devolvió texto, no se puede reinyectar dentro del clipboard ya copiado sin rehacerlo.
      // Se deja función auxiliar abajo para export completo del plan.
      return txt;
    };
  }
  // Reforzar sección PLAN DE CARRERA en exportadores que usen exportWeight/exportAnthro por composición:
  window.exportRunningPlanLines=exportRunningPlanLines187;
  window.copyRunningPlanExport187=function(){
    const lines=exportRunningPlanLines187();
    const txt=lines.join('\n');
    if(navigator.clipboard) navigator.clipboard.writeText(txt);
    return txt;
  };
  // Añadir a exportarSemana si su cuerpo es v181.8 y fácil de sobreescribir con wrapper de clipboard posterior.
  if(typeof exportarSemana==='function' && !exportarSemana.toString().includes('PLAN DE CARRERA v187 injected')){
    const prevExport=exportarSemana;
    exportarSemana=function(){
      const result=prevExport.apply(this,arguments);
      try{
        const planLines=exportRunningPlanLines187();
        if(planLines.length && typeof result==='string' && !result.includes('PLAN DE CARRERA')){
          const txt=result.replace(/\nGenerado por MELQART/, '\n-------------------------------\n'+planLines.join('\n')+'Generado por MELQART');
          if(navigator.clipboard) navigator.clipboard.writeText(txt);
          return txt; // PLAN DE CARRERA v187 injected
        }
      }catch(e){}
      return result;
    };
  }
  setTimeout(()=>{try{injectRunningHome187();injectRunningTrain187();injectRunningProgress187();injectRunningWeekly187()}catch(e){}},900);
  console.info('MELQART v187 Planificación de Carrera 10K Base cargado');
})();



// ---------------------------------------------------------------
// MELQART v188 — Fix duración import JSON carrera + métricas limpias
// ---------------------------------------------------------------
(function mq188RunImportAndMetricsFix(){
  const MIN_VALID_PACE=240;   // 4:00/km
  const MAX_VALID_PACE=810;   // 13:30/km

  function dStr(ts){
    try{return typeof localDateStr==='function'?localDateStr(ts):new Date(ts).toISOString().slice(0,10)}
    catch(e){return new Date(ts).toISOString().slice(0,10)}
  }
  function todayStr(){
    try{return typeof today==='function'?today():new Date().toISOString().slice(0,10)}
    catch(e){return new Date().toISOString().slice(0,10)}
  }
  function normDate(d){
    if(!d) return todayStr();
    if(/^\d{4}-\d{2}-\d{2}$/.test(String(d))) return String(d);
    const x=new Date(d);
    return isNaN(x)?todayStr():x.toISOString().slice(0,10);
  }
  function secFromTime(v){
    if(typeof v==='number') return Math.round(v);
    const s=String(v||'').trim();
    if(!s) return 0;
    const p=s.split(':').map(x=>parseInt(x,10)||0);
    if(p.length===3) return p[0]*3600+p[1]*60+p[2];
    if(p.length===2) return p[0]*60+p[1];
    return parseInt(s,10)||0;
  }
  function mmssFromSec(sec){
    sec=Math.round(sec||0);
    const m=Math.floor(sec/60), s=sec%60;
    return `${m}:${String(s).padStart(2,'0')}`;
  }
  function hhmmssFromSec(sec){
    sec=Math.round(sec||0);
    const h=Math.floor(sec/3600), m=Math.floor((sec%3600)/60), s=sec%60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
  function fmtPace(sec){
    sec=Math.round(sec||0);
    if(!sec || !isFinite(sec)) return '—';
    return `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}/km`;
  }
  function ensureEx(id,name,type){
    if(!forge.exercises) forge.exercises=[];
    let e=forge.exercises.find(x=>x.id===id);
    if(!e){ e={id,name,type}; forge.exercises.push(e); }
    e.name=name; e.type=type||e.type;
    return e;
  }
  function ensureRoutine(id,name,exerciseIds,emoji='◎'){
    if(!forge.routines) forge.routines=[];
    let r=forge.routines.find(x=>x.id===id);
    if(!r){ r={id,name,emoji,exercises:exerciseIds||[],restSec:90}; forge.routines.push(r); }
    r.name=name; r.emoji=emoji; r.exercises=exerciseIds||r.exercises||[];
    return r;
  }

  function importRunJson188(raw){
    const j=typeof raw==='string'?JSON.parse(raw):raw;
    const date=normDate(j.date);
    const time=String(j.time||'12:00').slice(0,5);
    const ts=new Date(`${date}T${time}:00`).getTime();
    const distance=Number(j.distanceKm ?? j.distance ?? j.km ?? 0);
    const durationRaw=String(j.duration || j.timeTotal || j.elapsed || '');
    const seconds=secFromTime(durationRaw);
    if(!distance || !seconds) throw new Error('Faltan distanceKm o duration');
    const timeForSet=mmssFromSec(seconds); // la app espera MM:SS. 01:19:36 -> 79:36
    const avgPaceReported=j.avgPace || j.ritmoPromedio || j.pace || '';
    const avgPaceCalculated=distance>0 ? fmtPace(seconds/distance).replace('/km','') : '';
    const avgHeartRate=j.avgHeartRate ?? j.fcMedia ?? j.heartRate ?? j.hr ?? '';
    const calories=j.calories ?? j.kcal ?? '';
    const steps=j.steps ?? j.pasos ?? '';
    const strideCm=j.strideCm ?? j.zancadaCm ?? j.pasoMedioCm ?? '';
    const routineName=j.routineName || (new Date(ts).getDay()===0?'Domingo — Cardio':'Jueves Noche — Trote');

    ensureEx('ex_correr','Carrera / Trote','run');
    const routine=ensureRoutine(new Date(ts).getDay()===0?'rut_domingo_cardio':'rut_jueves_trote', routineName, ['ex_correr'], '◎');

    let sess=(forge.sessions||[]).find(s=>{
      const sd=dStr(s.date);
      return sd===date && (s.exercises||[]).some(e=>e.exId==='ex_correr');
    });
    if(!sess){
      sess={id:'run_import_'+date.replaceAll('-','')+'_'+String(Date.now()).slice(-5),routineId:routine.id,routineName,date:ts,elapsed:seconds,source:j.source||'json_carrera',exercises:[]};
      if(!forge.sessions) forge.sessions=[];
      forge.sessions.push(sess);
    }
    sess.routineId=routine.id;
    sess.routineName=routineName;
    sess.date=ts;
    sess.elapsed=seconds;
    sess.fcMedia=avgHeartRate?Number(avgHeartRate):sess.fcMedia;
    sess.kcal=calories!==''?Number(calories):sess.kcal;
    sess.pasos=steps!==''?Number(steps):sess.pasos;
    sess.source=j.source||sess.source||'json_carrera';
    sess.importedRun={distanceKm:distance,durationRaw,durationStored:timeForSet,durationSeconds:seconds,durationHHMMSS:hhmmssFromSec(seconds),avgHeartRate:avgHeartRate?Number(avgHeartRate):null,calories:calories!==''?Number(calories):null,steps:steps!==''?Number(steps):null,strideCm:strideCm!==''?Number(strideCm):null,avgPaceReported,avgPaceCalculated,source:j.source||'json_carrera'};
    let ex=(sess.exercises||[]).find(e=>e.exId==='ex_correr');
    if(!ex){ ex={exId:'ex_correr',sets:[]}; sess.exercises.push(ex); }
    ex.sets=[{type:'run',done:true,weight:0,reps:0,distance:String(distance),time:timeForSet,durationSeconds:seconds,durationRaw,durationHHMMSS:hhmmssFromSec(seconds),fc:avgHeartRate?String(avgHeartRate):'',pasos:steps?String(steps):'',calories,strideCm,avgPaceReported,avgPaceCalculated}];
    try{saveDB()}catch(e){}
    try{renderAll()}catch(e){}
    return sess;
  }

  function collectRuns188(){
    const runs=[];
    (forge.sessions||[]).forEach(s=>{
      (s.exercises||[]).forEach(ex=>{
        const e=typeof getEx==='function'?getEx(ex.exId):null;
        if(ex.exId==='ex_correr' || e?.type==='run' || /carrera|trote|correr/i.test(e?.name||'')){
          (ex.sets||[]).forEach(st=>{
            const dist=parseFloat(st.distance)||parseFloat(st.distanceKm)||0;
            const sec=Number(st.durationSeconds)||secFromTime(st.time||st.duration||s.elapsed||0);
            if(dist>0 && sec>0){
              const pace=sec/dist;
              runs.push({date:dStr(s.date),ts:s.date,distanceKm:dist,durationSec:sec,paceSec:pace,fc:Number(st.fc||s.fcMedia||0)||null,kcal:Number(st.calories||s.kcal||0)||null,steps:Number(st.pasos||s.pasos||0)||null,routineName:s.routineName||'Trote',validForPlan:pace>=MIN_VALID_PACE && pace<=MAX_VALID_PACE,excludedReason:pace<MIN_VALID_PACE?'ritmo imposible bajo 4:00/km':pace>MAX_VALID_PACE?'ritmo sobre 13:30/km':''});
            }
          });
        }
      });
    });
    return runs.sort((a,b)=>a.ts-b.ts);
  }
  function validRuns188(){ return collectRuns188().filter(r=>r.validForPlan); }
  function currentPace188(){
    const runs=validRuns188();
    const excluded=collectRuns188().filter(r=>!r.validForPlan);
    if(!runs.length) return {paceSec:null, source:'sin datos válidos', runs:[], excluded};
    const now=new Date();
    const d30=new Date(now); d30.setDate(now.getDate()-30);
    let recent=runs.filter(r=>new Date(r.date+'T12:00:00')>=d30);
    let source='últimos 30 días';
    if(recent.length<2){
      const d28=new Date(now); d28.setDate(now.getDate()-28);
      recent=runs.filter(r=>new Date(r.date+'T12:00:00')>=d28);
      source='últimas 4 semanas';
    }
    if(!recent.length){ recent=[runs[runs.length-1]]; source='último trote válido'; }
    const priority=recent.filter(r=>r.distanceKm>=8 && r.distanceKm<=12);
    const base=priority.length?priority:recent;
    if(priority.length) source+=' · 8K–12K';
    const totalKm=base.reduce((a,r)=>a+r.distanceKm,0);
    const totalSec=base.reduce((a,r)=>a+r.durationSec,0);
    return {paceSec:totalKm?totalSec/totalKm:null, source, runs:base, excluded};
  }
  function predict10k188(){
    const runs=validRuns188().slice().reverse();
    if(!runs.length) return {timeSec:null, source:'sin datos válidos'};
    const exact=runs.find(r=>r.distanceKm>=9.8 && r.distanceKm<=10.2);
    if(exact) return {timeSec:exact.paceSec*10, source:'10K reciente'};
    const near=runs.find(r=>r.distanceKm>=8 && r.distanceKm<=12);
    if(near) return {timeSec:near.paceSec*10, source:'trote 8K–12K extrapolado'};
    const five=runs.find(r=>r.distanceKm>=4.8 && r.distanceKm<=5.3);
    if(five) return {timeSec:five.durationSec*2.1, source:'5K x 2.1'};
    const cur=currentPace188();
    return {timeSec:cur.paceSec?cur.paceSec*10:null, source:cur.source};
  }
  function longMax188(){ const runs=validRuns188(); return runs.length?runs.reduce((m,r)=>!m||r.distanceKm>m.distanceKm?r:m,null):null; }
  function avgFc188(){ const runs=currentPace188().runs.filter(r=>r.fc); return runs.length?Math.round(runs.reduce((a,r)=>a+r.fc,0)/runs.length):null; }
  function repairExistingRunDurations188(){
    let changed=0;
    (forge.sessions||[]).forEach(s=>{
      (s.exercises||[]).forEach(ex=>{
        if(ex.exId!=='ex_correr') return;
        (ex.sets||[]).forEach(st=>{
          const raw=String(st.time||'');
          if(/^\d{1,2}:\d{2}:\d{2}$/.test(raw)){
            const sec=secFromTime(raw);
            st.durationSeconds=sec; st.durationRaw=raw; st.durationHHMMSS=hhmmssFromSec(sec); st.time=mmssFromSec(sec); s.elapsed=sec; changed++;
          }
          if(st.durationRaw && !st.durationSeconds){
            const sec=secFromTime(st.durationRaw);
            if(sec){ st.durationSeconds=sec; st.time=mmssFromSec(sec); s.elapsed=sec; changed++; }
          }
        });
      });
    });
    try{saveDB()}catch(e){}
    try{renderAll()}catch(e){}
    return changed;
  }
  window.importRunJson=window.mq184RunJsonToSession=window.importRunJson188=importRunJson188;
  window.mq188RunningMetrics=function(){
    const plan=typeof getActiveRunningPlan187==='function'?getActiveRunningPlan187():null;
    return {currentPace:currentPace188(),prediction:predict10k188(),longMax:longMax188(),avgFc:avgFc188(),allRuns:collectRuns188(),excludedRuns:collectRuns188().filter(r=>!r.validForPlan),plan};
  };
  window.mq187RunningMetrics=window.mq188RunningMetrics;
  window.mq188RepairExistingRunDurations=repairExistingRunDurations188;
  function injectDataQualityNote(){
    const card=document.querySelector('#mq187-progress .mq-running-card, .mq-running-card');
    if(!card || document.getElementById('mq188-data-quality-note')) return;
    const excluded=collectRuns188().filter(r=>!r.validForPlan);
    if(!excluded.length) return;
    card.insertAdjacentHTML('beforeend', `<div id="mq188-data-quality-note" style="font-size:11px;color:var(--warn);margin-top:8px">${excluded.length} trote${excluded.length===1?'':'s'} excluido${excluded.length===1?'':'s'} del cálculo por ritmo sospechoso.</div>`);
  }
  const oldRenderAll=typeof renderAll==='function'?renderAll:null;
  if(oldRenderAll && !window._mq188RenderAllHooked){
    window._mq188RenderAllHooked=true;
    renderAll=function(){ const r=oldRenderAll.apply(this,arguments); setTimeout(()=>{try{injectDataQualityNote()}catch(e){}},0); return r; };
  }
  setTimeout(()=>{try{repairExistingRunDurations188();injectDataQualityNote()}catch(e){}},800);
  console.info('MELQART v188: duración JSON carrera corregida + métricas con filtro de datos sospechosos');
})();



// ---------------------------------------------------------------
// MELQART v189 — Fix definitivo duración de trote en importador y editor
// ---------------------------------------------------------------
(function mq189RunDurationEditorFix(){
  function secFromTime189(v){
    if(typeof v==='number') return Math.round(v);
    const s=String(v||'').trim();
    if(!s) return 0;
    const p=s.split(':').map(x=>parseInt(x,10)||0);
    if(p.length===3) return p[0]*3600+p[1]*60+p[2];
    if(p.length===2) return p[0]*60+p[1];
    return parseInt(s,10)||0;
  }
  function mmssFromSec189(sec){
    sec=Math.round(sec||0);
    return `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`;
  }
  function hhmmssFromSec189(sec){
    sec=Math.round(sec||0);
    const h=Math.floor(sec/3600), m=Math.floor((sec%3600)/60), s=sec%60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
  function normDate189(d){
    if(!d) return (typeof today==='function'?today():new Date().toISOString().slice(0,10));
    if(/^\d{4}-\d{2}-\d{2}$/.test(String(d))) return String(d);
    const x=new Date(d);
    return isNaN(x)?new Date().toISOString().slice(0,10):x.toISOString().slice(0,10);
  }
  function ensureEx189(id,name,type){
    if(!forge.exercises) forge.exercises=[];
    let e=forge.exercises.find(x=>x.id===id);
    if(!e){ e={id,name,type}; forge.exercises.push(e); }
    e.name=name; e.type=type||e.type;
    return e;
  }
  function ensureRoutine189(id,name,exerciseIds,emoji='◎'){
    if(!forge.routines) forge.routines=[];
    let r=forge.routines.find(x=>x.id===id);
    if(!r){ r={id,name,emoji,exercises:exerciseIds||[],restSec:90}; forge.routines.push(r); }
    r.name=name; r.emoji=emoji; r.exercises=exerciseIds||r.exercises||[];
    return r;
  }
  function localDate189(ts){
    try{return typeof localDateStr==='function'?localDateStr(ts):new Date(ts).toISOString().slice(0,10)}
    catch(e){return new Date(ts).toISOString().slice(0,10)}
  }

  // Reemplaza importador: guarda siempre set.time en MM:SS largo, por ejemplo 01:16:57 -> 76:57.
  window.importRunJson = window.importRunJson188 = window.mq184RunJsonToSession = function(raw){
    const j=typeof raw==='string'?JSON.parse(raw):raw;
    const date=normDate189(j.date);
    const time=String(j.time||'12:00').slice(0,5);
    const ts=new Date(`${date}T${time}:00`).getTime();
    const distance=Number(j.distanceKm ?? j.distance ?? j.km ?? 0);
    const durationRaw=String(j.duration || j.timeTotal || j.elapsed || '');
    const seconds=secFromTime189(durationRaw);
    if(!distance || !seconds) throw new Error('Faltan distanceKm o duration');
    const timeForSet=mmssFromSec189(seconds);
    const avgHeartRate=j.avgHeartRate ?? j.fcMedia ?? j.heartRate ?? j.hr ?? '';
    const calories=j.calories ?? j.kcal ?? '';
    const steps=j.steps ?? j.pasos ?? '';
    const strideCm=j.strideCm ?? j.zancadaCm ?? j.pasoMedioCm ?? '';
    const routineName=j.routineName || (new Date(ts).getDay()===0?'Domingo — Cardio':'Jueves Noche — Trote');

    ensureEx189('ex_correr','Carrera / Trote','run');
    const routine=ensureRoutine189(new Date(ts).getDay()===0?'rut_domingo_cardio':'rut_jueves_trote', routineName, ['ex_correr'], '◎');

    let sess=(forge.sessions||[]).find(s=>{
      const sd=localDate189(s.date);
      return sd===date && (s.exercises||[]).some(e=>e.exId==='ex_correr');
    });
    if(!sess){
      sess={
        id:'run_import_'+date.replaceAll('-','')+'_'+String(Date.now()).slice(-5),
        routineId:routine.id,
        routineName,
        date:ts,
        elapsed:seconds,
        source:j.source||'json_carrera',
        exercises:[]
      };
      if(!forge.sessions) forge.sessions=[];
      forge.sessions.push(sess);
    }

    sess.routineId=routine.id;
    sess.routineName=routineName;
    sess.date=ts;
    sess.elapsed=seconds;
    sess.fcMedia=avgHeartRate?Number(avgHeartRate):sess.fcMedia;
    sess.kcal=calories!==''?Number(String(calories).replace(',','.')):sess.kcal;
    sess.pasos=steps!==''?Number(steps):sess.pasos;
    sess.source=j.source||sess.source||'json_carrera';
    sess.importedRun={
      distanceKm:distance,
      durationRaw,
      durationStored:timeForSet,
      durationSeconds:seconds,
      durationHHMMSS:hhmmssFromSec189(seconds),
      avgHeartRate:avgHeartRate?Number(avgHeartRate):null,
      calories:calories!==''?Number(String(calories).replace(',','.')):null,
      steps:steps!==''?Number(steps):null,
      strideCm:strideCm!==''?Number(strideCm):null,
      avgPaceReported:j.avgPace||j.ritmoPromedio||j.pace||'',
      avgPaceCalculated:distance?mmssFromSec189(seconds/distance):'',
      rawPaceFromImage:j.rawPaceFromImage||'',
      notes:j.notes||'',
      source:j.source||'json_carrera'
    };

    let ex=(sess.exercises||[]).find(e=>e.exId==='ex_correr');
    if(!ex){ ex={exId:'ex_correr',sets:[]}; sess.exercises.push(ex); }
    ex.sets=[{
      type:'run',
      done:true,
      weight:0,
      reps:0,
      distance:String(distance),
      time:timeForSet,
      durationSeconds:seconds,
      durationRaw,
      durationHHMMSS:hhmmssFromSec189(seconds),
      fc:avgHeartRate?String(avgHeartRate):'',
      pasos:steps?String(steps):'',
      calories:calories,
      strideCm:strideCm,
      avgPaceReported:j.avgPace||'',
      rawPaceFromImage:j.rawPaceFromImage||'',
      notes:j.notes||''
    }];

    try{saveDB()}catch(e){}
    try{renderAll()}catch(e){}
    return sess;
  };

  // Reemplaza el modal de importador para que use SIEMPRE el importador corregido.
  window.openRunJsonImporter=function(){
    const placeholder=`{
  "date": "2026-06-14",
  "time": "08:43",
  "type": "trote",
  "routineName": "Domingo — Trote",
  "exerciseName": "Carrera / Trote",
  "distanceKm": 9.8,
  "duration": "01:16:57",
  "avgHeartRate": 144,
  "calories": 263.7,
  "steps": 11290,
  "strideCm": 87,
  "avgPace": "07:51",
  "source": "captura_reloj"
}`;
    if(typeof mq184Modal==='function'){
      mq184Modal('Cargar datos de carrera', placeholder, window.importRunJson);
      return;
    }
    const modalBg=document.createElement('div');
    modalBg.className='modal-bg on';
    modalBg.id='mq189-json-modal';
    modalBg.innerHTML=`<div class="modal" style="max-height:88dvh">
      <div class="modal-handle"></div>
      <div class="modal-head">
        <div class="modal-title">Cargar datos de carrera</div>
        <button class="bicon" onclick="document.getElementById('mq189-json-modal')?.remove()">×</button>
      </div>
      <div class="modal-body">
        <textarea id="mq189-json-text" style="width:100%;height:260px;font-family:monospace;font-size:12px;border:1px solid var(--border);border-radius:var(--r);padding:10px;background:var(--bg2);color:var(--ink)" placeholder='${placeholder.replaceAll("'","&#39;")}'></textarea>
        <div id="mq189-json-err" style="color:var(--warn);font-size:12px;margin-top:8px;display:none"></div>
        <button class="btn btn-p" style="margin-top:12px" onclick="mq189ConfirmRunJsonImport()">Cargar JSON</button>
      </div>
    </div>`;
    window.mq189ConfirmRunJsonImport=function(){
      const txt=document.getElementById('mq189-json-text').value.trim();
      const err=document.getElementById('mq189-json-err');
      try{
        const obj=JSON.parse(txt);
        const res=window.importRunJson(obj);
        document.getElementById('mq189-json-modal')?.remove();
        if(typeof showToast==='function') showToast('Carrera cargada correctamente',3000,'ok');
        console.log('MELQART v189 import carrera OK', res);
      }catch(e){
        err.style.display='block';
        err.textContent='JSON inválido o incompleto: '+(e.message||e);
      }
    };
    modalBg.addEventListener('click', e=>{ if(e.target===modalBg) modalBg.remove(); });
    document.body.appendChild(modalBg);
  };

  // Editor: si set.time viene HH:MM:SS, mostrar minutos totales y segundos correctos.
  getEditTimeMM=function(timeVal,setObj){
    const sec = setObj?.durationSeconds || secFromTime189(timeVal);
    return Math.floor(sec/60);
  };
  getEditTimeSS=function(timeVal,setObj){
    const sec = setObj?.durationSeconds || secFromTime189(timeVal);
    return sec%60;
  };

  // Como renderEditSesExs llama getEditTimeMM(set.time) sin setObj, hacemos compatible con HH:MM:SS.
  const oldGetMM=getEditTimeMM, oldGetSS=getEditTimeSS;
  getEditTimeMM=function(timeVal){
    const sec=secFromTime189(timeVal);
    return Math.floor(sec/60);
  };
  getEditTimeSS=function(timeVal){
    const sec=secFromTime189(timeVal);
    return sec%60;
  };

  updateEditTimeFromSel=function(sesId,ei,si){
    const mm=parseInt(document.getElementById('edit-time-mm-'+ei+'-'+si)?.value)||0;
    const ss=parseInt(document.getElementById('edit-time-ss-'+ei+'-'+si)?.value)||0;
    const total=mm*60+ss;
    const timeStr=String(mm).padStart(2,'0')+':'+String(ss).padStart(2,'0');
    const s=(forge.sessions||[]).find(x=>x.id===sesId); if(!s) return;
    const set=s.exercises[ei].sets[si];
    set.time=timeStr;
    set.durationSeconds=total;
    set.durationHHMMSS=hhmmssFromSec189(total);
    set.durationRaw=set.durationRaw||set.durationHHMMSS;
  };

  // Reparación sobre registros existentes: si quedó 01:16:57, pasarlo a 76:57.
  window.mq189RepairRunDurations=function(){
    let changed=0;
    (forge.sessions||[]).forEach(s=>{
      (s.exercises||[]).forEach(ex=>{
        if(ex.exId!=='ex_correr') return;
        (ex.sets||[]).forEach(set=>{
          if(String(set.time||'').split(':').length===3){
            const sec=secFromTime189(set.time);
            set.durationSeconds=sec;
            set.durationRaw=set.time;
            set.durationHHMMSS=hhmmssFromSec189(sec);
            set.time=mmssFromSec189(sec);
            s.elapsed=sec;
            changed++;
          }else if(set.durationSeconds && set.time && secFromTime189(set.time)!==Number(set.durationSeconds)){
            // Si durationSeconds existe y time quedó truncado, durationSeconds manda.
            const sec=Number(set.durationSeconds);
            set.time=mmssFromSec189(sec);
            set.durationHHMMSS=hhmmssFromSec189(sec);
            s.elapsed=sec;
            changed++;
          }
        });
      });
    });
    try{saveDB()}catch(e){}
    try{renderAll()}catch(e){}
    return changed;
  };

  window.mq189DiagnosticoRun=function(){
    const rows=[];
    (forge.sessions||[]).forEach(s=>{
      (s.exercises||[]).forEach(ex=>{
        if(ex.exId==='ex_correr'){
          (ex.sets||[]).forEach(set=>{
            rows.push({
              date:localDate189(s.date),
              routine:s.routineName,
              distance:set.distance,
              time:set.time,
              durationSeconds:set.durationSeconds||secFromTime189(set.time),
              paceSec:(Number(set.durationSeconds)||secFromTime189(set.time))/(parseFloat(set.distance)||1),
              fc:set.fc||s.fcMedia||''
            });
          });
        }
      });
    });
    return rows.sort((a,b)=>a.date.localeCompare(b.date));
  };

  setTimeout(()=>{try{window.mq189RepairRunDurations()}catch(e){}},600);
  console.info('MELQART v189: importador y editor de duración de carrera corregidos');
})();



// ---------------------------------------------------------------
// MELQART v190 — Integración visual plan carrera dentro de rutinas semanales
// ---------------------------------------------------------------
(function mq190IntegratedWeeklyPlan(){
  function titleCase(s){ return String(s||'').charAt(0).toUpperCase()+String(s||'').slice(1); }
  function normalize(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
  function getRunPlan190(){
    try{ return typeof getActiveRunningPlan187==='function' ? getActiveRunningPlan187() : null; }catch(e){ return null; }
  }
  function getRunPrescription190(plan){
    try{ return typeof getCurrentPrescription187==='function' ? getCurrentPrescription187(plan) : null; }catch(e){ return null; }
  }
  function isRunRoutine190(r){
    const n=normalize(r?.name||'');
    const exs=(r?.exercises||[]).map(id=>typeof getEx==='function'?getEx(id):null).filter(Boolean);
    return n.includes('cardio') || n.includes('trote') || n.includes('correr') || exs.some(e=>e.id==='ex_correr'||e.type==='run'||e.type==='hiit');
  }
  function runDay190(r){
    const n=normalize(r?.name||'');
    if(n.includes('jueves')) return 'jueves';
    if(n.includes('domingo')) return 'domingo';
    return '';
  }
  function isStrengthPlanRoutine190(r){
    const n=normalize(r?.name||'');
    return n.includes('tren inferior a') || n.includes('tren inferior b') || n.includes('tren superior a') || n.includes('tren superior b') ||
      n.includes('lunes') || n.includes('martes') || n.includes('miercoles') || n.includes('jueves');
  }
  function spanishRunName190(type, day){
    const t=String(type||'').toUpperCase();
    if(t==='LONG_RUN') return 'Largo aeróbico';
    if(t==='EASY_RUN') return 'Rodaje suave';
    if(t==='PROGRESSIVE_RUN') return 'Rodaje progresivo';
    if(t==='TEMPO_RUN') return 'Tempo controlado';
    if(t==='FARTLEK') return 'Fartlek';
    if(t==='RECOVERY_RUN') return 'Rodaje recuperación';
    return day==='domingo'?'Largo aeróbico':'Rodaje suave';
  }
  function renderIntegratedRunCard190(r, idx, opts){
    const {runPlan, prescription, semG, esSugerida, diasFalta, diaRut, diasOrden}=opts;
    const day=runDay190(r) || (idx%2?'domingo':'jueves');
    const w=(prescription?.workouts||[]).find(x=>x.day===day);
    if(!w) return null;
    const label=day==='jueves'?'Jueves':'Domingo';
    const diaTag=`<span style="background:${diasFalta===0?'var(--orange)':diasFalta===1?'var(--bg4)':'var(--bg3)'};color:${diasFalta===0?'#fff':diasFalta===1?'var(--gold)':'var(--ink3)'};font-size:9px;padding:2px 8px;border-radius:4px;font-weight:700;letter-spacing:.5px;text-transform:uppercase">${diasFalta===0?'HOY':diasFalta===1?'MAÑANA':label}</span>`;
    const bannerSugerida=esSugerida?`<div style="background:linear-gradient(90deg,rgba(111,62,168,.08),var(--bg2));padding:5px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:6px">
      <span style="font-size:10px;font-weight:700;color:var(--p);letter-spacing:1px;text-transform:uppercase">✶ Sugerida — ${diasFalta===0?'HOY':diasFalta===1?'Mañana':label}</span>
    </div>`:'';
    const planTag=`<span style="background:var(--p);color:#fff;font-size:9px;padding:2px 7px;border-radius:4px;font-weight:800;letter-spacing:.5px;text-transform:uppercase">Carrera · Sem ${runPlan.currentWeek}/${runPlan.totalWeeks}</span>
      <span style="background:var(--bg3);color:var(--p);font-size:9px;padding:2px 7px;border-radius:4px;font-weight:800;letter-spacing:.5px;text-transform:uppercase">${runPlan.currentPhase}</span>`;
    const title=`${label} — ${spanishRunName190(w.type,day)}`;
    const subtitle=`${w.targetDistanceKm} km · FC ${w.targetHeartRateRange[0]}-${w.targetHeartRateRange[1]}`;
    return `<div class="rutina-card mq190-run-card" style="border-color:${esSugerida?'var(--orange)':'var(--p)'}">
      ${bannerSugerida}
      <div class="rutina-head" onclick="openRutinaPreview('${r.id}')">
        <span class="rutina-emoji">◎</span>
        <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-bottom:2px">
          <div class="rutina-name">${title}</div>${diaTag}
        </div>
        <div class="rutina-meta">${subtitle}</div>
        <div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap">${planTag}</div>
        <div style="font-size:12px;color:var(--ink3);margin-top:8px">${w.description||''}</div>
        <div style="font-size:11px;color:var(--ink2);margin-top:5px">${(w.structure||[]).join(' · ')}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;border-top:1px solid var(--border);margin-top:auto">
        <button onclick="event.stopPropagation();openRunJsonImporter()"
          style="padding:10px;background:var(--bg3);color:var(--p);border:none;border-right:1px solid var(--border);font-family:var(--ff);font-size:11px;font-weight:800;letter-spacing:1px;cursor:pointer">
          Cargar datos
        </button>
        <button onclick="event.stopPropagation();iniciarRutina('${r.id}')"
          style="padding:10px;background:var(--p);color:#fff;border:none;font-family:var(--ff);font-size:11px;font-weight:800;letter-spacing:1px;cursor:pointer">
          ▶ Iniciar
        </button>
      </div>
    </div>`;
  }

  renderRutinas=function(){
    const list=document.getElementById('rutinas-list');
    const rutinas=forge.routines||[];
    if(!rutinas.length){ list.innerHTML=`<div class="empty"><div class="empty-icon">▤</div><div class="empty-text">Sin rutinas</div><div class="empty-sub">Crea tu primera rutina.</div></div>`; return; }

    const fuerzaPlan=(forge.planes||[]).find(p=>p.activo);
    const semG=fuerzaPlan?semanaActualPlan(fuerzaPlan):0;
    const runPlan=getRunPlan190();
    const prescription=runPlan?getRunPrescription190(runPlan):null;

    const ahora=new Date();
    const diasOrden=['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
    const diaHoyIdx=ahora.getDay();
    const inicioHoy=new Date(ahora); inicioHoy.setHours(0,0,0,0);
    const sesionesForgadas=forge.sessions||[];
    const yaEntrenoHoy=sesionesForgadas.some(s=>s.date>=inicioHoy.getTime()&&s.routineId);

    function diaDeRutina(r){
      const n=normalize(r.name);
      for(let i=0;i<diasOrden.length;i++){
        const d=normalize(diasOrden[i]);
        if(n.includes(d)) return i;
      }
      return 999;
    }
    function diasHasta(diaRutinaIdx){
      if(diaRutinaIdx<0 || diaRutinaIdx===999) return 999;
      let diff=diaRutinaIdx-diaHoyIdx;
      if(diff<0) diff+=7;
      if(diff===0&&yaEntrenoHoy) diff=7;
      return diff;
    }

    // Deduplicar visualmente cardio: dejar sólo una rutina por jueves y una por domingo.
    const seenRunDays=new Set();
    const filtered=[];
    rutinas.forEach(r=>{
      if(runPlan && isRunRoutine190(r)){
        const d=runDay190(r);
        if(d){
          if(seenRunDays.has(d)) return;
          seenRunDays.add(d);
        }
      }
      filtered.push(r);
    });

    const sorted=[...filtered].sort((a,b)=>diasHasta(diaDeRutina(a))-diasHasta(diaDeRutina(b)));
    const primero=sorted[0];
    const sugeridaId=(primero&&diaDeRutina(primero)!==999)?primero.id:null;

    list.innerHTML=sorted.map((r,idx)=>{
      const exs=(r.exercises||[]).map(id=>getEx(id)).filter(Boolean);
      const diaRut=diaDeRutina(r);
      const diasFalta=diasHasta(diaRut);
      const esSugerida=r.id===sugeridaId;

      if(runPlan && prescription && isRunRoutine190(r) && runDay190(r)){
        const html=renderIntegratedRunCard190(r, idx, {runPlan,prescription,semG,esSugerida,diasFalta,diaRut,diasOrden});
        if(html) return html;
      }

      const ultsesion=sesionesForgadas.filter(s=>s.routineId===r.id).sort((a,b)=>b.date-a.date)[0];
      const ultstxt=ultsesion?'Último: '+fmtDate(ultsesion.date):'Sin sesiones aún';
      const esClavePlan=!!fuerzaPlan && isStrengthPlanRoutine190(r);
      const cargas=fuerzaPlan?getCargasSemana(r.id):{};
      const tieneCarga=esClavePlan&&Object.keys(cargas).length>0;
      const borderColor=esSugerida?'var(--orange)':esClavePlan?'var(--green)':'var(--border2)';
      const planTag=esClavePlan?`<span style="background:var(--green);color:#fff;font-size:9px;padding:2px 7px;border-radius:4px;font-weight:700;letter-spacing:.5px;text-transform:uppercase">Plan fuerza · Sem ${semG}</span>`:'';

      let diaTag='';
      if(diaRut!==999){
        const label=diasFalta===0?'HOY':diasFalta===1?'Mañana':titleCase(diasOrden[diaRut]);
        const bg=diasFalta===0?'var(--orange)':diasFalta===1?'var(--bg4)':'var(--bg3)';
        const col=diasFalta===0?'#fff':diasFalta===1?'var(--gold)':'var(--ink3)';
        diaTag=`<span style="background:${bg};color:${col};font-size:9px;padding:2px 8px;border-radius:4px;font-weight:700;letter-spacing:.5px;text-transform:uppercase">${label}</span>`;
      }
      const cargaHint=tieneCarga?`<div style="background:var(--bg3);border-top:1px solid var(--border);padding:7px 16px;font-size:11px;color:var(--green)">
        ✦ Carga plan sem ${semG}: ${exs.filter(e=>cargas[e.id]).map(e=>`${e.name.split('(')[0].trim()} ${cargas[e.id]}kg`).join(' · ')}
      </div>`:'';
      const bannerSugerida=esSugerida?`<div style="background:linear-gradient(90deg,rgba(37,99,235,.06),var(--bg2));padding:5px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:6px">
        <span style="font-size:10px;font-weight:700;color:var(--orange);letter-spacing:1px;text-transform:uppercase">✶ Sugerida — ${diasFalta===0?'HOY':diasFalta===1?'Mañana':diaRut!==999?titleCase(diasOrden[diaRut]):'Próxima'}</span>
      </div>`:'';

      return `<div class="rutina-card" style="border-color:${borderColor}">
        ${bannerSugerida}
        <div class="rutina-head" onclick="openRutinaPreview('${r.id}')">
          <span class="rutina-emoji">${r.emoji||'◈'}</span>
          <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-bottom:2px">
            <div class="rutina-name">${r.name}</div>${diaTag}
          </div>
          <div class="rutina-meta">${exs.length} ejerc. · ${ultstxt}</div>
          ${planTag ? `<div style="margin-top:4px">${planTag}</div>` : ''}
        </div>
        ${cargaHint}
        <button onclick="iniciarRutina('${r.id}')"
          style="width:100%;padding:10px;background:${esSugerida||esClavePlan?'var(--p)':'var(--bg3)'};
          color:${esSugerida||esClavePlan?'#fff':'var(--ink2)'};border:none;font-family:var(--ff);
          font-size:11px;font-weight:700;letter-spacing:1px;cursor:pointer;
          display:flex;align-items:center;justify-content:center;gap:6px;
          border-top:1px solid var(--border);border-radius:0 0 16px 16px;margin-top:auto">
          ▶ ${esClavePlan?'Iniciar (plan)':'Iniciar'}
        </button>
      </div>`;
    }).join('');

    // Topbar: dejar sólo Nueva. El cargador de trote queda dentro de las tarjetas de carrera.
    const top=document.getElementById('train-topbar-right');
    if(top) top.innerHTML=`<button class="btn btn-p btn-sm" onclick="openNewRutina()">+ Nueva</button>`;

    // Seguridad: si algún hook anterior insertó el bloque grande de v187, eliminarlo.
    const legacy=document.getElementById('mq187-train-prescription');
    if(legacy) legacy.remove();
  };

  // Evitar que hooks antiguos vuelvan a insertar el bloque separado.
  const oldInject=window.injectRunningTrain187;
  window.injectRunningTrain187=function(){
    const legacy=document.getElementById('mq187-train-prescription');
    if(legacy) legacy.remove();
  };

  setTimeout(()=>{try{renderRutinas()}catch(e){}},700);
  console.info('MELQART v190: plan de carrera integrado en rutinas semanales');
})();



// ---------------------------------------------------------------
// MELQART v191 — Fix render Entrenar: carrera no es fuerza + fallback prescripción
// ---------------------------------------------------------------
(function mq191FixEntrenarRunningPlan(){
  function norm191(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
  function title191(s){ return String(s||'').charAt(0).toUpperCase()+String(s||'').slice(1); }
  function getRunPlan191(){
    try{ return typeof getActiveRunningPlan187==='function' ? getActiveRunningPlan187() : null; }catch(e){ return null; }
  }
  function pace191(){
    try{
      const m=typeof mq188RunningMetrics==='function'?mq188RunningMetrics():typeof mq187RunningMetrics==='function'?mq187RunningMetrics():null;
      return m?.currentPace?.paceSec || 460;
    }catch(e){ return 460; }
  }
  function hrFor191(plan, day){
    const phase=plan?.currentPhase || 'Base Aeróbica';
    const cfg=plan?.heartRateConfig || {};
    const defaults={
      'Base Aeróbica':{jueves:[140,148],domingo:[140,150]},
      'Desarrollo':{jueves:[145,155],domingo:[140,150]},
      'Específica':{jueves:[150,160],domingo:[140,152]}
    };
    return cfg?.[phase]?.[day==='domingo'?'sun':'thu'] || defaults[phase]?.[day] || [140,150];
  }
  function fallbackPrescription191(plan){
    if(!plan) return null;
    const week=Math.max(1,Number(plan.currentWeek||1));
    const phase=plan.currentPhase||'Base Aeróbica';
    const baseLong=8.5, inc=.25;
    const longKm=Math.min(12, Math.round((baseLong+(week-1)*inc)*10)/10);
    const thuKm=Math.max(4, Math.min(7, Math.round((longKm*.52)*10)/10));
    const p=pace191();
    const thuType=phase==='Base Aeróbica'?'EASY_RUN':phase==='Desarrollo'?'PROGRESSIVE_RUN':'TEMPO_RUN';
    return {
      planId:plan.id,
      week,
      phase,
      workouts:[
        {
          day:'jueves',
          type:thuType,
          targetDistanceKm:thuKm,
          estimatedTimeSec:thuKm*p,
          targetHeartRateRange:hrFor191(plan,'jueves'),
          description:phase==='Base Aeróbica'?'Rodaje controlado, cómodo y sin forzar.':phase==='Desarrollo'?'Rodaje progresivo moderado, cerrar controlado.':'Trabajo controlado cerca de ritmo objetivo.',
          structure:phase==='Base Aeróbica'?['Rodaje suave continuo']:[`1 km suave`,`${Math.max(1,Math.round((thuKm-2)*10)/10)} km controlado`,`1 km suave`]
        },
        {
          day:'domingo',
          type:'LONG_RUN',
          targetDistanceKm:longKm,
          estimatedTimeSec:longKm*p,
          targetHeartRateRange:hrFor191(plan,'domingo'),
          description:'Largo aeróbico. Priorizar completar distancia dentro de rango de FC.',
          structure:['Largo continuo aeróbico']
        }
      ]
    };
  }
  function getPrescription191(plan){
    try{
      if(typeof getCurrentPrescription187==='function') return getCurrentPrescription187(plan);
    }catch(e){}
    return fallbackPrescription191(plan);
  }
  function isRunRoutine191(r){
    const n=norm191(r?.name||'');
    const exs=(r?.exercises||[]).map(id=>typeof getEx==='function'?getEx(id):null).filter(Boolean);
    return n.includes('cardio') || n.includes('trote') || n.includes('correr') || exs.some(e=>e.id==='ex_correr'||e.type==='run'||e.type==='hiit'||norm191(e.name).includes('carrera'));
  }
  function runDay191(r){
    const n=norm191(r?.name||'');
    if(n.includes('jueves')) return 'jueves';
    if(n.includes('domingo')) return 'domingo';
    return '';
  }
  function isStrengthRoutine191(r){
    const n=norm191(r?.name||'');
    if(isRunRoutine191(r)) return false;
    return n.includes('tren inferior a') || n.includes('tren inferior b') || n.includes('tren superior a') || n.includes('tren superior b');
  }
  function runName191(type,day){
    const t=String(type||'').toUpperCase();
    if(t==='LONG_RUN') return 'Largo aeróbico';
    if(t==='EASY_RUN') return 'Rodaje suave';
    if(t==='PROGRESSIVE_RUN') return 'Rodaje progresivo';
    if(t==='TEMPO_RUN') return 'Tempo controlado';
    if(t==='FARTLEK') return 'Fartlek';
    if(t==='RECOVERY_RUN') return 'Rodaje recuperación';
    return day==='domingo'?'Largo aeróbico':'Rodaje suave';
  }
  function renderRunCard191(r, opts){
    const {runPlan,prescription,esSugerida,diasFalta,diaLabel}=opts;
    const day=runDay191(r);
    const w=(prescription?.workouts||[]).find(x=>x.day===day);
    if(!w) return '';
    const label=day==='domingo'?'Domingo':'Jueves';
    const tagTxt=diasFalta===0?'HOY':diasFalta===1?'MAÑANA':label.toUpperCase();
    const tagBg=diasFalta===0?'var(--orange)':diasFalta===1?'var(--bg4)':'var(--bg3)';
    const tagCol=diasFalta===0?'#fff':diasFalta===1?'var(--gold)':'var(--ink3)';
    const title=`${label} — ${runName191(w.type,day)}`;
    const banner=esSugerida?`<div style="background:linear-gradient(90deg,rgba(111,62,168,.08),var(--bg2));padding:5px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:6px">
      <span style="font-size:10px;font-weight:700;color:var(--p);letter-spacing:1px;text-transform:uppercase">✶ Sugerida — ${tagTxt==='HOY'?'Hoy':tagTxt==='MAÑANA'?'Mañana':title191(day)}</span>
    </div>`:'';
    return `<div class="rutina-card mq191-run-card" style="border-color:${esSugerida?'var(--orange)':'var(--p)'}">
      ${banner}
      <div class="rutina-head" onclick="openRutinaPreview('${r.id}')">
        <span class="rutina-emoji">◎</span>
        <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-bottom:2px">
          <div class="rutina-name">${title}</div>
          <span style="background:${tagBg};color:${tagCol};font-size:9px;padding:2px 8px;border-radius:4px;font-weight:700;letter-spacing:.5px;text-transform:uppercase">${tagTxt}</span>
        </div>
        <div class="rutina-meta">${w.targetDistanceKm} km · FC ${w.targetHeartRateRange[0]}-${w.targetHeartRateRange[1]}</div>
        <div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap">
          <span style="background:var(--p);color:#fff;font-size:9px;padding:2px 7px;border-radius:4px;font-weight:800;letter-spacing:.5px;text-transform:uppercase">Plan carrera · Sem ${runPlan.currentWeek}/${runPlan.totalWeeks}</span>
          <span style="background:var(--bg3);color:var(--p);font-size:9px;padding:2px 7px;border-radius:4px;font-weight:800;letter-spacing:.5px;text-transform:uppercase">${runPlan.currentPhase}</span>
        </div>
        <div style="font-size:12px;color:var(--ink3);margin-top:8px">${w.description||''}</div>
        <div style="font-size:11px;color:var(--ink2);margin-top:5px">${(w.structure||[]).join(' · ')}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;border-top:1px solid var(--border);margin-top:auto">
        <button onclick="event.stopPropagation();openRunJsonImporter()"
          style="padding:10px;background:var(--bg3);color:var(--p);border:none;border-right:1px solid var(--border);font-family:var(--ff);font-size:11px;font-weight:800;letter-spacing:1px;cursor:pointer">
          Cargar datos
        </button>
        <button onclick="event.stopPropagation();iniciarRutina('${r.id}')"
          style="padding:10px;background:var(--p);color:#fff;border:none;font-family:var(--ff);font-size:11px;font-weight:800;letter-spacing:1px;cursor:pointer">
          ▶ Iniciar
        </button>
      </div>
    </div>`;
  }

  renderRutinas=function(){
    const list=document.getElementById('rutinas-list');
    const rutinas=forge.routines||[];
    if(!rutinas.length){
      list.innerHTML=`<div class="empty"><div class="empty-icon">▤</div><div class="empty-text">Sin rutinas</div><div class="empty-sub">Crea tu primera rutina.</div></div>`;
      return;
    }

    const fuerzaPlan=(forge.planes||[]).find(p=>p.activo);
    const semG=fuerzaPlan?semanaActualPlan(fuerzaPlan):0;
    const runPlan=getRunPlan191();
    const prescription=getPrescription191(runPlan);

    const ahora=new Date();
    const diasOrden=['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
    const diaHoyIdx=ahora.getDay();
    const inicioHoy=new Date(ahora); inicioHoy.setHours(0,0,0,0);
    const sesiones=(forge.sessions||[]);
    const yaEntrenoHoy=sesiones.some(s=>s.date>=inicioHoy.getTime()&&s.routineId);

    function diaDeRutina(r){
      const n=norm191(r.name);
      for(let i=0;i<diasOrden.length;i++){
        if(n.includes(norm191(diasOrden[i]))) return i;
      }
      return 999;
    }
    function diasHasta(idx){
      if(idx===999||idx<0) return 999;
      let diff=idx-diaHoyIdx;
      if(diff<0) diff+=7;
      if(diff===0&&yaEntrenoHoy) diff=7;
      return diff;
    }

    const seenRunDays=new Set();
    const filtered=[];
    rutinas.forEach(r=>{
      if(runPlan && isRunRoutine191(r)){
        const d=runDay191(r);
        if(d){
          if(seenRunDays.has(d)) return;
          seenRunDays.add(d);
        }
      }
      filtered.push(r);
    });

    const sorted=[...filtered].sort((a,b)=>diasHasta(diaDeRutina(a))-diasHasta(diaDeRutina(b)));
    const sugeridaId=sorted.find(r=>diaDeRutina(r)!==999)?.id || null;

    list.innerHTML=sorted.map(r=>{
      const diaRut=diaDeRutina(r);
      const diasFalta=diasHasta(diaRut);
      const esSugerida=r.id===sugeridaId;

      if(runPlan && prescription && isRunRoutine191(r) && runDay191(r)){
        return renderRunCard191(r,{runPlan,prescription,esSugerida,diasFalta});
      }

      const exs=(r.exercises||[]).map(id=>getEx(id)).filter(Boolean);
      const ultsesion=sesiones.filter(s=>s.routineId===r.id).sort((a,b)=>b.date-a.date)[0];
      const ultstxt=ultsesion?'Último: '+fmtDate(ultsesion.date):'Sin sesiones aún';
      const esPlanFuerza=!!fuerzaPlan && isStrengthRoutine191(r);
      const cargas=fuerzaPlan?getCargasSemana(r.id):{};
      const tieneCarga=esPlanFuerza&&Object.keys(cargas).length>0;
      const borderColor=esSugerida?'var(--orange)':esPlanFuerza?'var(--green)':'var(--border2)';

      let diaTag='';
      if(diaRut!==999){
        const label=diasFalta===0?'HOY':diasFalta===1?'Mañana':title191(diasOrden[diaRut]);
        const bg=diasFalta===0?'var(--orange)':diasFalta===1?'var(--bg4)':'var(--bg3)';
        const col=diasFalta===0?'#fff':diasFalta===1?'var(--gold)':'var(--ink3)';
        diaTag=`<span style="background:${bg};color:${col};font-size:9px;padding:2px 8px;border-radius:4px;font-weight:700;letter-spacing:.5px;text-transform:uppercase">${label}</span>`;
      }
      const planTag=esPlanFuerza?`<span style="background:var(--green);color:#fff;font-size:9px;padding:2px 7px;border-radius:4px;font-weight:700;letter-spacing:.5px;text-transform:uppercase">Plan fuerza · Sem ${semG}</span>`:'';
      const cargaHint=tieneCarga?`<div style="background:var(--bg3);border-top:1px solid var(--border);padding:7px 16px;font-size:11px;color:var(--green)">
        ✦ Carga plan sem ${semG}: ${exs.filter(e=>cargas[e.id]).map(e=>`${e.name.split('(')[0].trim()} ${cargas[e.id]}kg`).join(' · ')}
      </div>`:'';
      const banner=esSugerida?`<div style="background:linear-gradient(90deg,rgba(37,99,235,.06),var(--bg2));padding:5px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:6px">
        <span style="font-size:10px;font-weight:700;color:var(--orange);letter-spacing:1px;text-transform:uppercase">✶ Sugerida — ${diasFalta===0?'HOY':diasFalta===1?'Mañana':diaRut!==999?title191(diasOrden[diaRut]):'Próxima'}</span>
      </div>`:'';
      return `<div class="rutina-card" style="border-color:${borderColor}">
        ${banner}
        <div class="rutina-head" onclick="openRutinaPreview('${r.id}')">
          <span class="rutina-emoji">${r.emoji||'◈'}</span>
          <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-bottom:2px">
            <div class="rutina-name">${r.name}</div>${diaTag}
          </div>
          <div class="rutina-meta">${exs.length} ejerc. · ${ultstxt}</div>
          ${planTag?`<div style="margin-top:4px">${planTag}</div>`:''}
        </div>
        ${cargaHint}
        <button onclick="iniciarRutina('${r.id}')"
          style="width:100%;padding:10px;background:${esSugerida||esPlanFuerza?'var(--p)':'var(--bg3)'};
          color:${esSugerida||esPlanFuerza?'#fff':'var(--ink2)'};border:none;font-family:var(--ff);
          font-size:11px;font-weight:700;letter-spacing:1px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;
          border-top:1px solid var(--border);border-radius:0 0 16px 16px;margin-top:auto">
          ▶ ${esPlanFuerza?'Iniciar (plan)':'Iniciar'}
        </button>
      </div>`;
    }).join('');

    const top=document.getElementById('train-topbar-right');
    if(top) top.innerHTML=`<button class="btn btn-p btn-sm" onclick="openNewRutina()">+ Nueva</button>`;
    document.getElementById('mq187-train-prescription')?.remove();
  };

  setTimeout(()=>{try{renderRutinas()}catch(e){console.warn('v191 renderRutinas error',e)}},600);
  console.info('MELQART v191: Entrenar corregido, carrera integrada y no marcada como fuerza');
})();



// ---------------------------------------------------------------
// MELQART v192 — Seguridad: no ocultar ni eliminar rutinas/sesiones de jueves
// ---------------------------------------------------------------
(function mq192NoHideThursdaySessions(){
  function norm192(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
  function title192(s){ return String(s||'').charAt(0).toUpperCase()+String(s||'').slice(1); }
  function getRunPlan192(){ try{return typeof getActiveRunningPlan187==='function'?getActiveRunningPlan187():null}catch(e){return null} }
  function pace192(){
    try{
      const m=typeof mq188RunningMetrics==='function'?mq188RunningMetrics():typeof mq187RunningMetrics==='function'?mq187RunningMetrics():null;
      return m?.currentPace?.paceSec || 460;
    }catch(e){return 460}
  }
  function hrFor192(plan, day){
    const phase=plan?.currentPhase || 'Base Aeróbica';
    const cfg=plan?.heartRateConfig || {};
    const defaults={
      'Base Aeróbica':{jueves:[140,148],domingo:[140,150]},
      'Desarrollo':{jueves:[145,155],domingo:[140,150]},
      'Específica':{jueves:[150,160],domingo:[140,152]}
    };
    return cfg?.[phase]?.[day==='domingo'?'sun':'thu'] || defaults[phase]?.[day] || [140,150];
  }
  function fallbackPrescription192(plan){
    if(!plan) return null;
    const week=Math.max(1,Number(plan.currentWeek||1));
    const phase=plan.currentPhase||'Base Aeróbica';
    const baseLong=8.5, inc=.25;
    const longKm=Math.min(12, Math.round((baseLong+(week-1)*inc)*10)/10);
    const thuKm=Math.max(4, Math.min(7, Math.round((longKm*.52)*10)/10));
    const p=pace192();
    const thuType=phase==='Base Aeróbica'?'EASY_RUN':phase==='Desarrollo'?'PROGRESSIVE_RUN':'TEMPO_RUN';
    return {
      planId:plan.id,
      week,
      phase,
      workouts:[
        {day:'jueves',type:thuType,targetDistanceKm:thuKm,estimatedTimeSec:thuKm*p,targetHeartRateRange:hrFor192(plan,'jueves'),
          description:phase==='Base Aeróbica'?'Rodaje controlado, cómodo y sin forzar.':phase==='Desarrollo'?'Rodaje progresivo moderado, cerrar controlado.':'Trabajo controlado cerca de ritmo objetivo.',
          structure:phase==='Base Aeróbica'?['Rodaje suave continuo']:[`1 km suave`,`${Math.max(1,Math.round((thuKm-2)*10)/10)} km controlado`,`1 km suave`]},
        {day:'domingo',type:'LONG_RUN',targetDistanceKm:longKm,estimatedTimeSec:longKm*p,targetHeartRateRange:hrFor192(plan,'domingo'),
          description:'Largo aeróbico. Priorizar completar distancia dentro de rango de FC.',structure:['Largo continuo aeróbico']}
      ]
    };
  }
  function getPrescription192(plan){
    try{ if(typeof getCurrentPrescription187==='function') return getCurrentPrescription187(plan); }catch(e){}
    return fallbackPrescription192(plan);
  }
  function isRunRoutine192(r){
    const n=norm192(r?.name||'');
    const exs=(r?.exercises||[]).map(id=>typeof getEx==='function'?getEx(id):null).filter(Boolean);
    return n.includes('cardio') || n.includes('trote') || n.includes('correr') || exs.some(e=>e.id==='ex_correr'||e.type==='run'||e.type==='hiit'||norm192(e.name).includes('carrera'));
  }
  function runDay192(r){
    const n=norm192(r?.name||'');
    if(n.includes('jueves')) return 'jueves';
    if(n.includes('domingo')) return 'domingo';
    return '';
  }
  function isStrengthRoutine192(r){
    const n=norm192(r?.name||'');
    if(isRunRoutine192(r)) return false;
    return n.includes('tren inferior a') || n.includes('tren inferior b') || n.includes('tren superior a') || n.includes('tren superior b');
  }
  function runName192(type,day){
    const t=String(type||'').toUpperCase();
    if(t==='LONG_RUN') return 'Largo aeróbico';
    if(t==='EASY_RUN') return 'Rodaje suave';
    if(t==='PROGRESSIVE_RUN') return 'Rodaje progresivo';
    if(t==='TEMPO_RUN') return 'Tempo controlado';
    if(t==='FARTLEK') return 'Fartlek';
    if(t==='RECOVERY_RUN') return 'Rodaje recuperación';
    return day==='domingo'?'Largo aeróbico':'Rodaje suave';
  }
  function renderRunCard192(r, opts){
    const {runPlan,prescription,esSugerida,diasFalta,isSecondaryRun}=opts;
    const day=runDay192(r);
    const w=(prescription?.workouts||[]).find(x=>x.day===day);
    if(!w) return '';
    const label=day==='domingo'?'Domingo':'Jueves';
    const tagTxt=diasFalta===0?'HOY':diasFalta===1?'MAÑANA':label.toUpperCase();
    const tagBg=diasFalta===0?'var(--orange)':diasFalta===1?'var(--bg4)':'var(--bg3)';
    const tagCol=diasFalta===0?'#fff':diasFalta===1?'var(--gold)':'var(--ink3)';
    const title=isSecondaryRun ? r.name : `${label} — ${runName192(w.type,day)}`;
    const subtitle=isSecondaryRun
      ? 'Rutina histórica de carrera · no se oculta'
      : `${w.targetDistanceKm} km · FC ${w.targetHeartRateRange[0]}-${w.targetHeartRateRange[1]}`;
    const banner=esSugerida?`<div style="background:linear-gradient(90deg,rgba(111,62,168,.08),var(--bg2));padding:5px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:6px">
      <span style="font-size:10px;font-weight:700;color:var(--p);letter-spacing:1px;text-transform:uppercase">✶ Sugerida — ${tagTxt==='HOY'?'Hoy':tagTxt==='MAÑANA'?'Mañana':title192(day)}</span>
    </div>`:'';
    return `<div class="rutina-card mq192-run-card" style="border-color:${esSugerida?'var(--orange)':isSecondaryRun?'var(--border2)':'var(--p)'}">
      ${banner}
      <div class="rutina-head" onclick="openRutinaPreview('${r.id}')">
        <span class="rutina-emoji">◎</span>
        <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-bottom:2px">
          <div class="rutina-name">${title}</div>
          <span style="background:${tagBg};color:${tagCol};font-size:9px;padding:2px 8px;border-radius:4px;font-weight:700;letter-spacing:.5px;text-transform:uppercase">${tagTxt}</span>
        </div>
        <div class="rutina-meta">${subtitle}</div>
        <div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap">
          ${isSecondaryRun
            ? `<span style="background:var(--bg3);color:var(--ink3);font-size:9px;padding:2px 7px;border-radius:4px;font-weight:800;letter-spacing:.5px;text-transform:uppercase">Carrera histórica</span>`
            : `<span style="background:var(--p);color:#fff;font-size:9px;padding:2px 7px;border-radius:4px;font-weight:800;letter-spacing:.5px;text-transform:uppercase">Plan carrera · Sem ${runPlan.currentWeek}/${runPlan.totalWeeks}</span>
               <span style="background:var(--bg3);color:var(--p);font-size:9px;padding:2px 7px;border-radius:4px;font-weight:800;letter-spacing:.5px;text-transform:uppercase">${runPlan.currentPhase}</span>`}
        </div>
        ${!isSecondaryRun?`<div style="font-size:12px;color:var(--ink3);margin-top:8px">${w.description||''}</div><div style="font-size:11px;color:var(--ink2);margin-top:5px">${(w.structure||[]).join(' · ')}</div>`:''}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;border-top:1px solid var(--border);margin-top:auto">
        <button onclick="event.stopPropagation();openRunJsonImporter()"
          style="padding:10px;background:var(--bg3);color:var(--p);border:none;border-right:1px solid var(--border);font-family:var(--ff);font-size:11px;font-weight:800;letter-spacing:1px;cursor:pointer">
          Cargar datos
        </button>
        <button onclick="event.stopPropagation();iniciarRutina('${r.id}')"
          style="padding:10px;background:${isSecondaryRun?'var(--bg3)':'var(--p)'};color:${isSecondaryRun?'var(--ink2)':'#fff'};border:none;font-family:var(--ff);font-size:11px;font-weight:800;letter-spacing:1px;cursor:pointer">
          ▶ Iniciar
        </button>
      </div>
    </div>`;
  }

  renderRutinas=function(){
    const list=document.getElementById('rutinas-list');
    const rutinas=forge.routines||[];
    if(!rutinas.length){
      list.innerHTML=`<div class="empty"><div class="empty-icon">▤</div><div class="empty-text">Sin rutinas</div><div class="empty-sub">Crea tu primera rutina.</div></div>`;
      return;
    }

    const fuerzaPlan=(forge.planes||[]).find(p=>p.activo);
    const semG=fuerzaPlan?semanaActualPlan(fuerzaPlan):0;
    const runPlan=getRunPlan192();
    const prescription=getPrescription192(runPlan);

    const ahora=new Date();
    const diasOrden=['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
    const diaHoyIdx=ahora.getDay();
    const inicioHoy=new Date(ahora); inicioHoy.setHours(0,0,0,0);
    const sesiones=(forge.sessions||[]);
    const yaEntrenoHoy=sesiones.some(s=>s.date>=inicioHoy.getTime()&&s.routineId);

    function diaDeRutina(r){
      const n=norm192(r.name);
      for(let i=0;i<diasOrden.length;i++){ if(n.includes(norm192(diasOrden[i]))) return i; }
      return 999;
    }
    function diasHasta(idx){
      if(idx===999||idx<0) return 999;
      let diff=idx-diaHoyIdx;
      if(diff<0) diff+=7;
      if(diff===0&&yaEntrenoHoy) diff=7;
      return diff;
    }

    // IMPORTANTE v192: NO filtramos rutinas. No se oculta ni elimina nada del jueves.
    const sorted=[...rutinas].sort((a,b)=>diasHasta(diaDeRutina(a))-diasHasta(diaDeRutina(b)));
    const sugeridaId=sorted.find(r=>diaDeRutina(r)!==999)?.id || null;
    const primaryRunSeen={jueves:false,domingo:false};

    list.innerHTML=sorted.map(r=>{
      const diaRut=diaDeRutina(r);
      const diasFalta=diasHasta(diaRut);
      const esSugerida=r.id===sugeridaId;

      if(runPlan && prescription && isRunRoutine192(r) && runDay192(r)){
        const d=runDay192(r);
        const isSecondary=!!primaryRunSeen[d];
        primaryRunSeen[d]=true;
        return renderRunCard192(r,{runPlan,prescription,esSugerida,diasFalta,isSecondaryRun:isSecondary});
      }

      const exs=(r.exercises||[]).map(id=>getEx(id)).filter(Boolean);
      const ultsesion=sesiones.filter(s=>s.routineId===r.id).sort((a,b)=>b.date-a.date)[0];
      const ultstxt=ultsesion?'Último: '+fmtDate(ultsesion.date):'Sin sesiones aún';
      const esPlanFuerza=!!fuerzaPlan && isStrengthRoutine192(r);
      const cargas=fuerzaPlan?getCargasSemana(r.id):{};
      const tieneCarga=esPlanFuerza&&Object.keys(cargas).length>0;
      const borderColor=esSugerida?'var(--orange)':esPlanFuerza?'var(--green)':'var(--border2)';
      let diaTag='';
      if(diaRut!==999){
        const label=diasFalta===0?'HOY':diasFalta===1?'Mañana':title192(diasOrden[diaRut]);
        const bg=diasFalta===0?'var(--orange)':diasFalta===1?'var(--bg4)':'var(--bg3)';
        const col=diasFalta===0?'#fff':diasFalta===1?'var(--gold)':'var(--ink3)';
        diaTag=`<span style="background:${bg};color:${col};font-size:9px;padding:2px 8px;border-radius:4px;font-weight:700;letter-spacing:.5px;text-transform:uppercase">${label}</span>`;
      }
      const planTag=esPlanFuerza?`<span style="background:var(--green);color:#fff;font-size:9px;padding:2px 7px;border-radius:4px;font-weight:700;letter-spacing:.5px;text-transform:uppercase">Plan fuerza · Sem ${semG}</span>`:'';
      const cargaHint=tieneCarga?`<div style="background:var(--bg3);border-top:1px solid var(--border);padding:7px 16px;font-size:11px;color:var(--green)">
        ✦ Carga plan sem ${semG}: ${exs.filter(e=>cargas[e.id]).map(e=>`${e.name.split('(')[0].trim()} ${cargas[e.id]}kg`).join(' · ')}
      </div>`:'';
      const banner=esSugerida?`<div style="background:linear-gradient(90deg,rgba(37,99,235,.06),var(--bg2));padding:5px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:6px">
        <span style="font-size:10px;font-weight:700;color:var(--orange);letter-spacing:1px;text-transform:uppercase">✶ Sugerida — ${diasFalta===0?'HOY':diasFalta===1?'Mañana':diaRut!==999?title192(diasOrden[diaRut]):'Próxima'}</span>
      </div>`:'';
      return `<div class="rutina-card" style="border-color:${borderColor}">
        ${banner}
        <div class="rutina-head" onclick="openRutinaPreview('${r.id}')">
          <span class="rutina-emoji">${r.emoji||'◈'}</span>
          <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-bottom:2px">
            <div class="rutina-name">${r.name}</div>${diaTag}
          </div>
          <div class="rutina-meta">${exs.length} ejerc. · ${ultstxt}</div>
          ${planTag?`<div style="margin-top:4px">${planTag}</div>`:''}
        </div>
        ${cargaHint}
        <button onclick="iniciarRutina('${r.id}')"
          style="width:100%;padding:10px;background:${esSugerida||esPlanFuerza?'var(--p)':'var(--bg3)'};
          color:${esSugerida||esPlanFuerza?'#fff':'var(--ink2)'};border:none;font-family:var(--ff);font-size:11px;font-weight:700;letter-spacing:1px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;border-top:1px solid var(--border);border-radius:0 0 16px 16px;margin-top:auto">
          ▶ ${esPlanFuerza?'Iniciar (plan)':'Iniciar'}
        </button>
      </div>`;
    }).join('');

    const top=document.getElementById('train-topbar-right');
    if(top) top.innerHTML=`<button class="btn btn-p btn-sm" onclick="openNewRutina()">+ Nueva</button>`;
    document.getElementById('mq187-train-prescription')?.remove();
  };

  window.mq192DiagnosticoRutinas=function(){
    return (forge.routines||[]).map(r=>({
      id:r.id,
      name:r.name,
      isRun:isRunRoutine192(r),
      runDay:runDay192(r),
      isStrength:isStrengthRoutine192(r),
      exerciseIds:r.exercises||[]
    }));
  };

  setTimeout(()=>{try{renderRutinas()}catch(e){console.warn('v192 renderRutinas error',e)}},600);
  console.info('MELQART v192: no se ocultan rutinas/sesiones de jueves; carrera no es fuerza');
})();
