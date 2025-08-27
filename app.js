/* =========================================
   The Wind — app.js (v2 + hard reload on auth)
   ========================================= */

const SB_URL  = window.__SB_URL__  || "https://zxmihqapcemjmzoagpjm.supabase.co";
const SB_ANON = window.__SB_ANON__ || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4bWlocWFwY2Vtam16b2FncGptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYxOTE5MDEsImV4cCI6MjA3MTc2NzkwMX0.byvaKSk5JovNr5WmXFXCp9LKqAhEDub642thN5j9fwA";

const { createClient } = window.supabase;
const supabase = createClient(SB_URL, SB_ANON, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
});

/* ---------- DOM ---------- */
const $ = s => document.querySelector(s);
const pick = (...sels) => sels.map(s=>$(s)).find(Boolean);

const emailInp  = pick('#email', '#login-email', 'input[name="email"]');
const passInp   = pick('#password', '#login-password', 'input[name="password"]');
const loginBtn  = pick('#loginBtn', 'button[data-action="login"]');
const logoutBtn = pick('#logoutBtn', 'button[data-action="logout"]');
const meBadge   = pick('#meBadge', '[data-role="me-badge"]');
const adminLink = pick('#adminLink', 'a[data-role="admin-link"]');

const statsForm = pick('#statsForm', 'form[data-role="stats-form"]');
const levelInp  = pick('#level', 'input[name="level"]');
const atkInp    = pick('#attack', 'input[name="attack"]');
const defInp    = pick('#defence', 'input[name="defence"]');
const accInp    = pick('#accuracy', 'input[name="accuracy"]');
const memInp    = pick('#memory_pct', 'input[name="memory_pct"]');
const subInp    = pick('#subjugate', 'input[name="subjugate"]');

const hofWrap   = pick('#hofWrap', '[data-role="hof"]');

/* ---------- Utils ---------- */
const projKey = (() => {
  const ref = new URL(SB_URL).host.split('.')[0]; // zxmihqapcemjmzoagpjm
  return `sb-${ref}-auth-token`;
})();
function clearSession() {
  try { localStorage.removeItem(projKey); } catch {}
  try {
    document.cookie.split(';').forEach(c=>{
      const k=c.trim().split('=')[0];
      if (k.startsWith('sb-')) document.cookie=`${k}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    });
  } catch {}
}
function busy(el, on, txt='처리 중...') {
  if (!el) return;
  el.disabled = !!on;
  if (on) {
    el.dataset.prevText ??= el.textContent;
    el.textContent = txt;
  } else {
    el.textContent = el.dataset.prevText ?? el.textContent;
  }
}
function toast(s){ alert(s); }

/* ---------- Loaders ---------- */
async function loadMe() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles').select('nickname,is_admin,approved').eq('user_id', user.id).maybeSingle();
  if (error) { console.warn('profiles error:', error.message); }
  return { user, profile: data || null };
}
async function loadMyRank() {
  const { data, error } = await supabase
    .from('v_my_rank_current')
    .select('level,battle_power,nickname,attend,rank_total_by_battle_power')
    .maybeSingle();
  if (error) { console.warn('rank view error:', error.message); return null; }
  return data;
}
async function loadHOF() {
  const { data, error } = await supabase.rpc('rank_list_public', {
    p_season: null, p_basis: 'bp', p_class_code: null, p_page: 1, p_page_size: 5
  });
  if (error) { console.warn('rank_list_public error:', error.message); return []; }
  return data || [];
}

/* ---------- Render ---------- */
function renderHeader(me){
  if (meBadge){ meBadge.textContent = me?.user?.email || ''; meBadge.style.display = me ? 'inline-flex' : 'none'; }
  if (logoutBtn) logoutBtn.style.display = me ? 'inline-flex' : 'none';
  if (loginBtn)  loginBtn.style.display  = me ? 'none'       : 'inline-flex';
  if (adminLink) adminLink.style.display = me?.profile?.is_admin ? 'inline-flex' : 'none';
}
function renderStatsCard(myRank){
  const r = pick('#rankBadge','[data-role="rank"]');
  const l = pick('#levelBadge','[data-role="level"]');
  const b = pick('#bpBadge','[data-role="bp"]');
  if (r) r.textContent = myRank?.rank_total_by_battle_power ?? '-';
  if (l) l.textContent = myRank?.level ?? '-';
  if (b) b.textContent = myRank?.battle_power ?? '-';
}
function renderHOF(list){
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
  const top = list[0]; const rest = list.slice(1,5);
  const card = (x, big=false)=>`
    <div class="hof-card ${big?'big':''}">
      <div class="hof-img"><img src="${x?img(x.class_code):ph}" alt=""></div>
      <div class="hof-name">${x?.nickname ?? '-'}</div>
    </div>`;
  hofWrap.innerHTML = `
    <div class="hof-grid">
      <div class="hof-col1">${card(top,true)}</div>
      <div class="hof-col2">${rest.map(card).join('')}</div>
    </div>`;
}

/* ---------- Auth Actions (강제 새로고침 포함) ---------- */
async function doLogin(){
  if (!emailInp || !passInp) return toast('이메일/비밀번호 입력창을 찾지 못했습니다.');
  const email = emailInp.value.trim(), password = passInp.value;
  if (!email || !password) return toast('이메일/비밀번호를 입력하세요.');
  busy(loginBtn, true, '로그인 중...');
  try{
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return toast(error.message || '로그인 실패');

    // 프로필 보장(실패해도 무시)
    await supabase.rpc('ensure_profile').catch(()=>{});

    // **핵심: 상태 꼬임 방지용 강제 전환**
    sessionStorage.setItem('tw_just_signed_in','1');
    location.reload();
  }catch(e){
    console.error(e); toast('로그인 중 오류');
  }finally{ busy(loginBtn,false); }
}
async function doLogout(){
  busy(logoutBtn, true, '로그아웃 중...');
  try{
    await supabase.auth.signOut();
    clearSession();
    sessionStorage.setItem('tw_just_signed_out','1');
    location.reload();
  }catch(e){
    console.error(e); toast('로그아웃 실패');
  }finally{ busy(logoutBtn,false); }
}

/* ---------- Save ---------- */
async function doSaveStats(e){
  e?.preventDefault?.();
  if (!statsForm) return;
  const i = el => (el&&el.value!==''?parseInt(el.value,10):null);
  const f = el => (el&&el.value!==''?Number(el.value):null);

  const payload = {
    p_season:null, p_level:i(levelInp), p_attack:i(atkInp), p_defence:i(defInp),
    p_accuracy:i(accInp), p_memory_pct:f(memInp), p_subjugate:i(subInp), p_attend:null
  };
  const btn = statsForm.querySelector('button[type="submit"],button[data-action="save"]');
  busy(btn,true,'저장 중...');
  try{
    const { error } = await supabase.rpc('self_upsert_stats', payload);
    if (error) return toast('저장 실패: '+(error.message||'서버 오류'));

    // 저장 성공 → UI 갱신
    toast('저장 완료');
    const myRank = await loadMyRank(); renderStatsCard(myRank);
  }catch(e){ console.error(e); toast('저장 중 오류'); }
  finally{ busy(btn,false); }
}

/* ---------- UI Refresh ---------- */
async function refreshUI(){
  try{
    // 방금 로그인/로그아웃한 경우, 알림만 띄우고 플래그 제거
    if (sessionStorage.getItem('tw_just_signed_in')) {
      sessionStorage.removeItem('tw_just_signed_in');
      toast('로그인 성공');
    }
    if (sessionStorage.getItem('tw_just_signed_out')) {
      sessionStorage.removeItem('tw_just_signed_out');
      toast('로그아웃 완료');
    }

    const { data: s } = await supabase.auth.getSession();
    if (s?.session){
      // 로그인 상태
      const me = await loadMe();
      renderHeader(me);
      if (statsForm) statsForm.style.display = 'block';
    }else{
      // 비로그인 상태
      renderHeader(null);
      if (statsForm) statsForm.style.display = 'none';
    }

    const hof = await loadHOF();
    renderHOF(hof);

    // 내 카드
    if (s?.session){
      const r = await loadMyRank();
      renderStatsCard(r);
    }
  }catch(e){
    console.error('[refreshUI]', e);
  }
}

/* ---------- Events ---------- */
if (loginBtn)  loginBtn.addEventListener('click', doLogin);
if (logoutBtn) logoutBtn.addEventListener('click', doLogout);
if (statsForm) statsForm.addEventListener('submit', doSaveStats);
if (passInp)   passInp.addEventListener('keydown',(e)=>{ if(e.key==='Enter') doLogin(); });

supabase.auth.onAuthStateChange((ev)=> {
  // 얘는 보조. 실제 전환은 강제 새로고침으로 처리
  if (ev==='TOKEN_REFRESHED') refreshUI();
});

document.addEventListener('DOMContentLoaded', refreshUI);
console.info('[TW] app boot (hard reload auth)');
