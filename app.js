/* =========================================
   The Wind — app.js (supabase-js v2, hardened)
   - 모든 요청 { data, error } 패턴
   - 실패 시 UI 멈춤 방지 (finally 보장)
   - 세션 토큰 꼬임 자동 복구
   - 로그인 후 ensure_profile()
   ========================================= */

const SB_URL  = window.__SB_URL__  || "https://zxmihqapcemjmzoagpjm.supabase.co";
const SB_ANON = window.__SB_ANON__ || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4bWlocWFwY2Vtam16b2FncGptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYxOTE5MDEsImV4cCI6MjA3MTc2NzkwMX0.byvaKSk5JovNr5WmXFXCp9LKqAhEDub642thN5j9fwA";

const { createClient } = window.supabase;
const supabase = createClient(SB_URL, SB_ANON, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

/* ---------- DOM 찾기 ---------- */
const $ = (s) => document.querySelector(s);
const pick = (...sels) => sels.map((s) => $(s)).find(Boolean);

const emailInp  = pick('#email', '#login-email', 'input[name="email"]');
const passInp   = pick('#password', '#login-password', 'input[name="password"]');
const loginBtn  = pick('#loginBtn', 'button[data-action="login"]');
const logoutBtn = pick('#logoutBtn', 'button[data-action="logout"]');
const meBadge   = pick('#meBadge', '[data-role="me-badge"]');
const adminLink = pick('#adminLink', 'a[data-role="admin-link"]');

/* 좌측 스탯 */
const statsForm = pick('#statsForm', 'form[data-role="stats-form"]');
const levelInp  = pick('#level', 'input[name="level"]');
const atkInp    = pick('#attack', 'input[name="attack"]');
const defInp    = pick('#defence', 'input[name="defence"]');
const accInp    = pick('#accuracy', 'input[name="accuracy"]');
const memInp    = pick('#memory_pct', 'input[name="memory_pct"]');
const subInp    = pick('#subjugate', 'input[name="subjugate"]');

/* HOF */
const hofWrap   = pick('#hofWrap', '[data-role="hof"]');

/* ---------- UI 유틸 ---------- */
function toast(msg) { alert(msg); }
function setBusy(el, yes, txt = '처리 중...') {
  if (!el) return;
  el.disabled = !!yes;
  if (yes) {
    el.dataset.prevText ??= el.textContent;
    el.textContent = txt;
  } else {
    el.textContent = el.dataset.prevText ?? el.textContent;
  }
}

/* ---------- 세션 토큰 정리 ---------- */
function projectAuthKey() {
  // 이 프로젝트 로컬스토리지 키 자동 탐색
  const ref = new URL(SB_URL).host.split('.')[0]; // zxmihqapcemjmzoagpjm
  const cand = Object.keys(localStorage).find(k => k.includes(ref) && k.includes('auth-token'));
  return cand || `sb-${ref}-auth-token`;
}
function clearSbSession() {
  try {
    localStorage.removeItem(projectAuthKey());
    // sb-* 쿠키도 정리 (없으면 무시)
    document.cookie.split(';').forEach(c=>{
      const k=c.trim().split('=')[0];
      if (k.startsWith('sb-')) document.cookie=`${k}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    });
  } catch (_) {}
}

/* ---------- 세션 건강검사 (초기/저장후) ---------- */
async function ensureHealthySession() {
  const { data: s } = await supabase.auth.getSession();
  if (!s?.session) return false; // 비로그인 OK

  // user 조회 실패 / 권한 에러면 세션 초기화
  const { data: u, error: ue } = await supabase.auth.getUser();
  if (ue || !u?.user) {
    console.warn('[auth] invalid user; clearing session', ue?.message);
    await supabase.auth.signOut();
    clearSbSession();
    return false;
  }

  // 아주 가벼운 쿼리로 토큰 유효성 재확인
  const { error: pe } = await supabase
    .from('profiles').select('user_id').eq('user_id', u.user.id).limit(1);
  if (pe && /JWT|auth/i.test(pe.message)) {
    console.warn('[auth] jwt broken; clearing session', pe.message);
    await supabase.auth.signOut();
    clearSbSession();
    return false;
  }
  return true;
}

/* ---------- 데이터 로더 ---------- */
async function loadMe() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('nickname,is_admin,approved')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    console.warn('profiles load error:', error.message);
    return { user, profile: null };
  }
  return { user, profile: data };
}

async function loadMyRank() {
  const { data, error } = await supabase
    .from('v_my_rank_current')
    .select('level,battle_power,nickname,attend,rank_total_by_battle_power')
    .maybeSingle();
  if (error) {
    console.warn('v_my_rank_current error:', error.message);
    return null;
  }
  return data;
}

async function loadHOF() {
  const { data, error } = await supabase.rpc('rank_list_public', {
    p_season: null, p_basis: 'bp', p_class_code: null, p_page: 1, p_page_size: 5
  });
  if (error) {
    console.warn('rank_list_public error:', error.message);
    return [];
  }
  return data || [];
}

/* ---------- 렌더 ---------- */
function renderHeader(me) {
  if (meBadge) {
    meBadge.textContent = me?.user?.email || '';
    meBadge.style.display = me ? 'inline-flex' : 'none';
  }
  if (logoutBtn) logoutBtn.style.display = me ? 'inline-flex' : 'none';
  if (loginBtn)  loginBtn.style.display  = me ? 'none'       : 'inline-flex';

  if (adminLink) {
    const isAdmin = !!me?.profile?.is_admin;
    adminLink.style.display = me && isAdmin ? 'inline-flex' : 'none';
  }
}

function renderStatsCard(myRank) {
  const rEl = pick('#rankBadge','[data-role="rank"]');
  const lEl = pick('#levelBadge','[data-role="level"]');
  const bEl = pick('#bpBadge','[data-role="bp"]');
  if (rEl) rEl.textContent = myRank?.rank_total_by_battle_power ?? '-';
  if (lEl) lEl.textContent = myRank?.level ?? '-';
  if (bEl) bEl.textContent = myRank?.battle_power ?? '-';
}

function renderHOF(list) {
  if (!hofWrap) return;
  const placeholder = './assets/윈둥자.png';
  const map = {
    illusion_swordsman: './assets/환영검사.png',
    abyss_banisher:     './assets/심연추방자.png',
    spell_engraver:     './assets/주문각인사.png',
    executor:           './assets/집행관.png',
    sun_sentinel:       './assets/태양감시자.png',
    aroma_archer:       './assets/향사수.png',
  };
  const imgOf = (c) => map[c] || placeholder;

  const top1 = list[0];
  const rest = list.slice(1, 5);

  const card = (item, big=false) => `
    <div class="hof-card ${big?'big':''}">
      <div class="hof-img"><img src="${item ? imgOf(item.class_code) : placeholder}" alt=""></div>
      <div class="hof-name">${item?.nickname ?? '-'}</div>
    </div>`;

  hofWrap.innerHTML = `
    <div class="hof-grid">
      <div class="hof-col1">${card(top1, true)}</div>
      <div class="hof-col2">${rest.map(x=>card(x)).join('')}</div>
    </div>`;
}

/* ---------- 액션 ---------- */
async function doLogin() {
  if (!emailInp || !passInp) return toast('로그인 입력창을 찾을 수 없습니다.');
  const email = emailInp.value.trim();
  const password = passInp.value;
  if (!email || !password) return toast('이메일/비밀번호를 입력해주세요.');

  setBusy(loginBtn, true, '로그인 중...');
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return toast(error.message || '로그인 실패');

    // 프로필 확보 (실패해도 앱 계속 진행)
    const { error: ep } = await supabase.rpc('ensure_profile');
    if (ep) console.warn('ensure_profile warn:', ep.message);

    await refreshUI();
    toast('로그인 성공');
  } catch (e) {
    console.error(e);
    toast('로그인 중 오류');
  } finally {
    setBusy(loginBtn, false);
  }
}

async function doLogout() {
  setBusy(logoutBtn, true, '로그아웃 중...');
  try {
    await supabase.auth.signOut();
    clearSbSession(); // 혹시 토큰 꼬임 방지
    await refreshUI();
  } catch (e) {
    console.error(e);
    toast('로그아웃 실패');
  } finally {
    setBusy(logoutBtn, false);
  }
}

async function doSaveStats(e) {
  e?.preventDefault?.();
  if (!statsForm) return;

  const asInt = (el) => (el && el.value !== '' ? parseInt(el.value, 10) : null);
  const asNum = (el) => (el && el.value !== '' ? Number(el.value) : null);

  const payload = {
    p_season: null,
    p_level: asInt(levelInp),
    p_attack: asInt(atkInp),
    p_defence: asInt(defInp),
    p_accuracy: asInt(accInp),
    p_memory_pct: asNum(memInp),
    p_subjugate: asInt(subInp),
    p_attend: null,
  };

  const saveBtn = statsForm.querySelector('button[type="submit"],button[data-action="save"]');
  setBusy(saveBtn, true, '저장 중...');
  try {
    const { error } = await supabase.rpc('self_upsert_stats', payload);
    if (error) {
      console.error('save error:', error);
      return toast('저장 실패: ' + (error.message || '서버 오류'));
    }
    toast('저장 완료');
    // 저장 직후 세션 꼬임 감지 → 자동 복구
    await ensureHealthySession();
    await refreshUI();
  } catch (e) {
    console.error(e);
    toast('저장 중 오류');
  } finally {
    setBusy(saveBtn, false);
  }
}

/* ---------- 메인 리프레시 ---------- */
async function refreshUI() {
  try {
    const ok = await ensureHealthySession(); // 로그인/비로그인 모두 안전 상태 보장
    const me = await loadMe();
    renderHeader(me);

    if (me && statsForm) {
      statsForm.style.display = 'block';
      const myRank = await loadMyRank();   // 실패해도 앱 지속
      renderStatsCard(myRank);
    } else if (statsForm) {
      statsForm.style.display = 'none';
    }

    const hof = await loadHOF();
    renderHOF(hof);
  } catch (e) {
    console.error('[refreshUI]', e);
    // 치명적이면 세션 초기화하고 최소한 HOF만이라도 보이게
    clearSbSession();
    const hof = await loadHOF().catch(()=>[]);
    renderHOF(hof);
  }
}

/* ---------- 이벤트 연결 ---------- */
if (loginBtn)  loginBtn.addEventListener('click', doLogin);
if (logoutBtn) logoutBtn.addEventListener('click', doLogout);
if (statsForm) statsForm.addEventListener('submit', doSaveStats);

if (passInp) passInp.addEventListener('keydown', (e)=>{ if (e.key==='Enter') doLogin(); });

supabase.auth.onAuthStateChange((ev)=> {
  if (ev === 'SIGNED_IN' || ev === 'SIGNED_OUT' || ev === 'TOKEN_REFRESHED') {
    refreshUI();
  }
});

document.addEventListener('DOMContentLoaded', refreshUI);
console.info('[TW] app booted (hardened)');
