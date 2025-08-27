/* The Wind — app.js (auth 전환 고정 + HOF 5장 패딩 + 오탐 얼럿 제거) */

const SB_URL  = window.__SB_URL__  || "https://zxmihqapcemjmzoagpjm.supabase.co";
const SB_ANON = window.__SB_ANON__ || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4bWlocWFwY2Vtam16b2FncGptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYxOTE5MDEsImV4cCI6MjA3MTc2NzkwMX0.byvaKSk5JovNr5WmXFXCp9LKqAhEDub642thN5j9fwA";

const { createClient } = window.supabase;
const supabase = createClient(SB_URL, SB_ANON, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
});

const $ = (s)=>document.querySelector(s);

/* 헤더 DOM */
const authBar  = $('.auth-bar');
const emailInp = $('#email');
const passInp  = $('#password');
const loginBtn = $('#loginBtn');
const logoutBtn= $('#logoutBtn');
const meBadge  = $('#meBadge');
const adminLink= $('#adminLink');

/* 본문 DOM */
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

/* 가입 모달 */
const signupModal = $('#signupModal');
const signupOpen  = $('#signupOpen');
const signupClose = $('#signupClose');
const signupForm  = $('#signupForm');
const suEmail = $('#su_email');
const suPw    = $('#su_pw');
const suPw2   = $('#su_pw2');
const suNick  = $('#su_nick');
const suClass = $('#su_class');

const toast = (m)=> alert(m);

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

/* ---------- 렌더 ---------- */
function renderHeader(user, isAdmin){
  if (user) authBar?.classList.add('authed'); else authBar?.classList.remove('authed');

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

function renderHOF(listRaw) {
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

  // 항상 5장을 채운다(부족분은 null → 플레이스홀더)
  const list = Array.isArray(listRaw) ? [...listRaw] : [];
  while (list.length < 5) list.push(null);

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

/* ---------- 데이터 ---------- */
async function loadMe() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user:null, isAdmin:false };
  const { data } = await supabase.from('profiles')
    .select('is_admin,approved').eq('user_id', user.id).maybeSingle();
  return { user, isAdmin: !!data?.is_admin };
}
async function loadMyRank() {
  const { data } = await supabase.from('v_my_rank_current')
    .select('level,battle_power,nickname,attend,rank_total_by_battle_power')
    .maybeSingle();
  return data || null;
}
let hofBasis = 'bp';
async function loadHOF() {
  const basis = hofBasis === 'total' ? 'total' : 'bp';
  const { data, error } = await supabase.rpc('rank_list_public', {
    p_season: null, p_basis: basis, p_class_code: null, p_page: 1, p_page_size: 5
  });
  if (error) { console.warn('rank_list_public', error.message); return []; }
  return data || [];
}

async function ensureHealthySession() {
  const { data: s } = await supabase.auth.getSession();
  if (!s?.session) return false;
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) { await supabase.auth.signOut(); clearSessionHard(); return false; }
  // profiles 접근 중 JWT 문제 시 복구
  const test = await supabase.from('profiles').select('user_id').limit(1);
  if (test.error && /JWT|auth/i.test(test.error.message)) {
    await supabase.auth.signOut(); clearSessionHard(); return false;
  }
  return true;
}

/* ---------- 액션 ---------- */
async function doLogin(ev){
  ev?.preventDefault?.();
  const email = emailInp?.value?.trim(); const password = passInp?.value || '';
  if (!email || !password) return toast('이메일/비밀번호를 입력하세요.');

  loginBtn.disabled = true; loginBtn.dataset.prev = loginBtn.textContent; loginBtn.textContent='로그인 중...';

  // 오탐 방지를 위해 try/catch 미사용. 오류가 있을 때만 error로 처리.
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    loginBtn.disabled=false; loginBtn.textContent=loginBtn.dataset.prev || '로그인';
    return toast(error.message || '로그인 실패');
  }
  await supabase.rpc('ensure_profile').catch(()=>{});
  sessionStorage.setItem('tw_just_signed_in','1');
  location.reload(); // 전환 확정
}

async function doLogout(){
  logoutBtn.disabled = true; const pv = logoutBtn.textContent; logoutBtn.textContent='로그아웃 중...';
  await supabase.auth.signOut().catch(()=>{});
  clearSessionHard();
  sessionStorage.setItem('tw_just_signed_out','1');
  location.reload();
}

async function doSaveStats(ev){
  ev?.preventDefault?.();
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
  btn.disabled = true; const pv = btn.textContent; btn.textContent='저장 중...'; saveNote.textContent='';

  const { error } = await supabase.rpc('self_upsert_stats', payload);
  if (error) { saveNote.textContent = '실패: '+(error.message||'오류'); btn.disabled=false; btn.textContent=pv; return; }
  saveNote.textContent = '저장 완료';

  const myRank = await loadMyRank(); renderStatsCard(myRank);
  btn.disabled=false; btn.textContent=pv;
}

/* 가입 */
function openSignup(){ signupModal?.showModal(); }
function closeSignup(){ signupModal?.close(); }
async function doSignup(ev){
  ev?.preventDefault?.();
  if (suPw.value !== suPw2.value) { toast('비밀번호 확인이 일치하지 않습니다.'); return; }
  const submit = $('#signupDo'); submit.disabled=true; const pv=submit.textContent; submit.textContent='요청 중...';

  const { error } = await supabase.auth.signUp({ email: suEmail.value.trim(), password: suPw.value });
  if (error) { submit.disabled=false; submit.textContent=pv; return toast(error.message||'가입 실패'); }
  await supabase.rpc('ensure_profile').catch(()=>{});
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await supabase.from('profiles').update({
      nickname: suNick.value || null, class_code: suClass.value || null
    }).eq('user_id', user.id);
  }
  toast('가입 요청 완료. 이메일 확인 및 승인 후 이용 가능합니다.');
  submit.disabled=false; submit.textContent=pv; closeSignup();
}

/* ---------- UI 리프레시 ---------- */
async function refreshUI(){
  try{
    if (sessionStorage.getItem('tw_just_signed_in'))  { sessionStorage.removeItem('tw_just_signed_in');  toast('로그인 성공'); }
    if (sessionStorage.getItem('tw_just_signed_out')) { sessionStorage.removeItem('tw_just_signed_out'); toast('로그아웃 완료'); }

    const healthy = await ensureHealthySession();
    const { user, isAdmin } = await loadMe();
    renderHeader(user, isAdmin);

    if (user && healthy) {
      videoWrap.style.display = 'none';
      statsWrap.style.display = 'block';
      const myRank = await loadMyRank();
      renderStatsCard(myRank);
    } else {
      videoWrap.style.display = 'block';
      statsWrap.style.display = 'none';
    }

    const hof = await loadHOF();
    renderHOF(hof);
  } catch(e){
    console.error('[refreshUI]', e);
    const hof = await loadHOF().catch(()=>[]);
    renderHOF(hof);
  }
}

/* 이벤트 */
document.addEventListener('DOMContentLoaded', refreshUI);
document.querySelector('#authForm')?.addEventListener('submit', doLogin);
passInp?.addEventListener('keydown', (e)=>{ if (e.key==='Enter') doLogin(e); });
loginBtn?.addEventListener('click', doLogin);
logoutBtn?.addEventListener('click', doLogout);
statsForm?.addEventListener('submit', doSaveStats);
tabBp?.addEventListener('click', ()=>{ hofBasis='bp';   tabBp.classList.add('on'); tabTotal.classList.remove('on');  loadHOF().then(renderHOF); });
tabTotal?.addEventListener('click', ()=>{ hofBasis='total';tabTotal.classList.add('on'); tabBp.classList.remove('on');    loadHOF().then(renderHOF); });

signupOpen?.addEventListener('click', openSignup);
signupClose?.addEventListener('click', closeSignup);
signupForm?.addEventListener('submit', doSignup);

supabase.auth.onAuthStateChange((ev)=>{ if (ev==='TOKEN_REFRESHED') refreshUI(); });
console.info('[TW] app ready (fix-auth-hof-2)');
