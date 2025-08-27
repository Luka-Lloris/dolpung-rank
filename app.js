/* The Wind — app.js (full restore, supabase v2, 강제 전환 + 방어 로직) */

const SB_URL  = window.__SB_URL__  || "https://zxmihqapcemjmzoagpjm.supabase.co";
const SB_ANON = window.__SB_ANON__ || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4bWlocWFwY2Vtam16b2FncGptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYxOTE5MDEsImV4cCI6MjA3MTc2NzkwMX0.byvaKSk5JovNr5WmXFXCp9LKqAhEDub642thN5j9fwA";

const { createClient } = window.supabase;
const supabase = createClient(SB_URL, SB_ANON, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
});

/* ----- DOM ----- */
const $ = (s) => document.querySelector(s);

const authForm = $('#authForm');
const emailInp = $('#email');
const passInp  = $('#password');
const loginBtn = $('#loginBtn');
const logoutBtn= $('#logoutBtn');
const meBadge  = $('#meBadge');
const adminLink= $('#adminLink');

const statsWrap= $('#statsWrap');
const videoWrap= $('#videoWrap');
const statsForm= $('#statsForm');

const levelInp = $('#level');
const atkInp   = $('#attack');
const defInp   = $('#defence');
const accInp   = $('#accuracy');
const memInp   = $('#memory_pct');
const subInp   = $('#subjugate');
const saveNote = $('#saveNote');

const hofWrap  = $('#hofWrap');
const tabBp    = $('#tab-bp');
const tabTotal = $('#tab-total');
const signupModal = $('#signupModal');
const signupOpen  = $('#signupOpen');
const signupClose = $('#signupClose');
const signupForm  = $('#signupForm');
const suEmail = $('#su_email');
const suPw    = $('#su_pw');
const suPw2   = $('#su_pw2');
const suNick  = $('#su_nick');
const suClass = $('#su_class');

/* ----- 유틸 ----- */
const toast = (m)=> alert(m);
function busy(el, on, txt='처리 중...') {
  if (!el) return;
  el.disabled = !!on;
  if (on) { el.dataset.prev ??= el.textContent; el.textContent = txt; }
  else { el.textContent = el.dataset.prev ?? el.textContent; }
}
function projectAuthKey() {
  const ref = new URL(SB_URL).host.split('.')[0];
  return `sb-${ref}-auth-token`;
}
function clearSessionHard() {
  try { localStorage.removeItem(projectAuthKey()); } catch {}
  try {
    document.cookie.split(';').forEach(c=>{
      const k=c.trim().split('=')[0];
      if (k.startsWith('sb-')) document.cookie = `${k}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    });
  } catch {}
}

/* ----- 렌더 ----- */
function renderHeader(user, isAdmin){
  if (meBadge)  { meBadge.style.display = user ? 'inline' : 'none'; meBadge.textContent = user ? user.email : ''; }
  if (loginBtn) { loginBtn.style.display = user ? 'none' : 'inline-block'; }
  if (logoutBtn){ logoutBtn.style.display = user ? 'inline-block' : 'none'; }
  if (adminLink){ adminLink.style.display = (user && isAdmin) ? 'inline-block' : 'none'; }
}

function renderStatsCard(myRank) {
  const r = $('#rankBadge'); const l = $('#levelBadge'); const b = $('#bpBadge');
  if (r) r.textContent = myRank?.rank_total_by_battle_power ?? '-';
  if (l) l.textContent = myRank?.level ?? '-';
  if (b) b.textContent = myRank?.battle_power ?? '-';
}

function renderHOF(list) {
  if (!hofWrap) return;
  const ph = './assets/윈둥자.png';
  const map = {
    illusion_swordsman:'./assets/환영검사.png',
    abyss_banisher:'./assets/심연추방자.png',
    spell_engraver:'./assets/주문각인사.png',
    executor:'./assets/집행관.png',
    sun_sentinel:'./assets/태양감시자.png',
    aroma_archer:'./assets/향사수.png',
  };
  const img = c => map[c] || ph;

  const card = (x, big=false)=>`
    <div class="hof-card ${big?'big':''}">
      <div class="hof-img"><img src="${x?img(x.class_code):ph}" alt=""></div>
      <div class="hof-name">${x?.nickname ?? '-'}</div>
    </div>`;

  const top = list[0];
  const rest = list.slice(1, 5);

  hofWrap.innerHTML = `
    <div class="hof-grid">
      <div class="hof-col1">${card(top,true)}</div>
      <div class="hof-col2">${rest.map(x=>card(x)).join('')}</div>
    </div>`;
}

/* ----- 데이터 로더 ----- */
async function loadMe() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user:null, isAdmin:false };
  const { data, error } = await supabase.from('profiles')
    .select('is_admin,approved').eq('user_id', user.id).maybeSingle();
  if (error) console.warn('profiles error', error.message);
  return { user, isAdmin: !!data?.is_admin };
}
async function loadMyRank() {
  const { data, error } = await supabase.from('v_my_rank_current')
    .select('level,battle_power,nickname,attend,rank_total_by_battle_power')
    .maybeSingle();
  if (error) { console.warn('rank view error', error.message); return null; }
  return data;
}
let hofBasis = 'bp'; // 'bp' | 'total'
async function loadHOF() {
  const basis = hofBasis === 'total' ? 'total' : 'bp';
  const { data, error } = await supabase.rpc('rank_list_public', {
    p_season: null, p_basis: basis, p_class_code: null, p_page: 1, p_page_size: 5
  });
  if (error) { console.warn('rank_list_public', error.message); return []; }
  return data || [];
}

/* ----- 세션 건강검사 (토큰 꼬임 자동 복구) ----- */
async function ensureHealthySession() {
  const { data: s } = await supabase.auth.getSession();
  if (!s?.session) return false;
  const { data: u, error: ue } = await supabase.auth.getUser();
  if (ue || !u?.user) {
    await supabase.auth.signOut(); clearSessionHard(); return false;
  }
  const { error: pe } = await supabase.from('profiles').select('user_id').eq('user_id', u.user.id).limit(1);
  if (pe && /JWT|auth/i.test(pe.message)) { await supabase.auth.signOut(); clearSessionHard(); return false; }
  return true;
}

/* ----- 액션: 로그인/로그아웃/저장/가입 ----- */
async function doLogin(ev){
  ev?.preventDefault?.();
  const email = emailInp?.value?.trim(); const password = passInp?.value || '';
  if (!email || !password) return toast('이메일/비밀번호를 입력하세요.');
  busy(loginBtn, true, '로그인 중...');
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return toast(error.message || '로그인 실패');
    await supabase.rpc('ensure_profile').catch(()=>{});
    sessionStorage.setItem('tw_just_signed_in','1');
    location.reload(); // 전환 확정
  } catch(e){ console.error(e); toast('로그인 중 오류'); }
  finally{ busy(loginBtn,false); }
}

async function doLogout(){
  busy(logoutBtn, true, '로그아웃 중...');
  try{
    await supabase.auth.signOut(); clearSessionHard();
    sessionStorage.setItem('tw_just_signed_out','1');
    location.reload();
  } catch(e){ console.error(e); toast('로그아웃 실패'); }
  finally{ busy(logoutBtn,false); }
}

async function doSaveStats(ev){
  ev?.preventDefault?.();
  if (!statsForm) return;
  const i = (el)=> (el && el.value!=='' ? parseInt(el.value,10) : null);
  const f = (el)=> (el && el.value!=='' ? Number(el.value) : null);

  const payload = {
    p_season: null,
    p_level: i(levelInp),
    p_attack: i(atkInp),
    p_defence: i(defInp),
    p_accuracy: i(accInp),
    p_memory_pct: f(memInp),
    p_subjugate: i(subInp),
    p_attend: null
  };
  const btn = statsForm.querySelector('button[type="submit"]');
  busy(btn, true, '저장 중...');
  saveNote.textContent = '';
  try{
    const { error } = await supabase.rpc('self_upsert_stats', payload);
    if (error) { saveNote.textContent = '실패: '+(error.message||'오류'); return; }
    saveNote.textContent = '저장 완료';
    await ensureHealthySession();
    const myRank = await loadMyRank(); renderStatsCard(myRank);
  } catch(e){ console.error(e); saveNote.textContent = '저장 실패'; }
  finally{ busy(btn,false); }
}

function openSignup(){ if (signupModal) signupModal.showModal(); }
function closeSignup(){ if (signupModal) signupModal.close(); }
async function doSignup(ev){
  ev?.preventDefault?.();
  if (!suEmail || !suPw || !suPw2) return;
  if (suPw.value !== suPw2.value) { toast('비밀번호 확인이 일치하지 않습니다.'); return; }
  busy($('#signupDo'), true, '요청 중...');
  try {
    const { error } = await supabase.auth.signUp({ email: suEmail.value.trim(), password: suPw.value });
    if (error) return toast(error.message || '가입 실패');
    // 프로필 보장 + 선택값 반영(가능하면)
    await supabase.rpc('ensure_profile').catch(()=>{});
    // 닉/클래스 저장(선택사항)
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('profiles').update({
        nickname: suNick.value || null, class_code: suClass.value || null
      }).eq('user_id', user.id);
    }
    toast('가입 요청 완료. 이메일 확인 및 승인 후 이용 가능합니다.');
    closeSignup();
  } catch(e){ console.error(e); toast('가입 오류'); }
  finally { busy($('#signupDo'), false); }
}

/* ----- UI 리프레시 ----- */
async function refreshUI(){
  try{
    if (sessionStorage.getItem('tw_just_signed_in'))  { sessionStorage.removeItem('tw_just_signed_in');  toast('로그인 성공'); }
    if (sessionStorage.getItem('tw_just_signed_out')) { sessionStorage.removeItem('tw_just_signed_out'); toast('로그아웃 완료'); }

    const healthy = await ensureHealthySession();
    const { user, isAdmin } = await loadMe();

    renderHeader(user, isAdmin);

    if (user && healthy) {
      if (videoWrap) videoWrap.style.display = 'none';
      if (statsWrap) statsWrap.style.display = 'block';
      const myRank = await loadMyRank();
      renderStatsCard(myRank);
    } else {
      if (videoWrap) videoWrap.style.display = 'block';
      if (statsWrap) statsWrap.style.display = 'none';
    }

    const hof = await loadHOF();
    renderHOF(hof);
  } catch(e){
    console.error('[refreshUI]', e);
    // 심각한 경우에도 HOF만이라도 그려준다.
    const hof = await loadHOF().catch(()=>[]);
    renderHOF(hof);
  }
}

/* ----- 이벤트 바인딩 ----- */
if (authForm)  authForm.addEventListener('submit', doLogin);
if (loginBtn)  loginBtn.addEventListener('click', doLogin);
if (logoutBtn) logoutBtn.addEventListener('click', doLogout);
if (passInp)   passInp.addEventListener('keydown', (e)=>{ if (e.key==='Enter') doLogin(e); });

if (statsForm) statsForm.addEventListener('submit', doSaveStats);

if (tabBp)    tabBp.addEventListener('click', ()=>{ hofBasis='bp';   tabBp.classList.add('on'); tabTotal.classList.remove('on');  loadHOF().then(renderHOF); });
if (tabTotal) tabTotal.addEventListener('click', ()=>{ hofBasis='total';tabTotal.classList.add('on'); tabBp.classList.remove('on');    loadHOF().then(renderHOF); });

if (signupOpen) signupOpen.addEventListener('click', openSignup);
if (signupClose) signupClose.addEventListener('click', closeSignup);
if (signupForm)  signupForm.addEventListener('submit', doSignup);

/* auth state 보조 (주 전환은 강제 리로드로 해결) */
supabase.auth.onAuthStateChange((ev)=> { if (ev==='TOKEN_REFRESHED') refreshUI(); });

document.addEventListener('DOMContentLoaded', refreshUI);
console.info('[TW] app ready (full restore)');
