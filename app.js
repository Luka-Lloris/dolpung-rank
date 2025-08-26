// =========================
// Supabase Client
// =========================
const sb = supabase.createClient(window.__SB_URL__, window.__SB_ANON__);

// =========================
// DOM 참조
// =========================
const $formAuth  = document.getElementById('auth-form');
const $email     = document.getElementById('auth-email');
const $pass      = document.getElementById('auth-pass');
const $btnSignup = document.getElementById('btn-signup');
const $btnLogout = document.getElementById('btn-logout');
const $btnKakao  = document.getElementById('btn-login-kakao');
const $btnAdmin  = document.getElementById('btn-admin');
const $me        = document.getElementById('me');

const teaserWrap = document.getElementById('teaser-wrap');
const myQuick    = document.getElementById('my-quick');
const actions    = document.getElementById('actions');
const form       = document.getElementById('form-upsert');
const attendance = document.getElementById('attendance');

const $meRankBP  = document.getElementById('me-rank-bp');
const $meLevel   = document.getElementById('me-level');
const $meBP      = document.getElementById('me-bp');
const $meNick    = document.getElementById('me-nick');
const $meAttend  = document.getElementById('me-attend');

const $btnSave   = document.getElementById('btn-save');
const $saveMsg   = document.getElementById('save-msg');

// Signup modal
const dlgSignup  = document.getElementById('dlg-signup');
const $suEmail   = document.getElementById('su-email');
const $suPass    = document.getElementById('su-pass');
const $suPass2   = document.getElementById('su-pass2');
const $suNick    = document.getElementById('su-nick');
const $suClass   = document.getElementById('su-class');
const $suSubmit  = document.getElementById('su-submit');
const $suCancel  = document.getElementById('su-cancel');

// =========================
// 유틸
// =========================
const num  = v => (v===''||v==null)?null:Number(v);
const numf = v => (v===''||v==null)?null:Number(v);

function showLoggedInUI(isLoggedIn){
  teaserWrap.style.display = isLoggedIn ? 'none'  : 'block';
  myQuick.style.display    = isLoggedIn ? 'grid'  : 'none';
  actions.style.display    = isLoggedIn ? 'flex'  : 'none';
  form.style.display       = isLoggedIn ? 'block' : 'none';
  attendance.style.display = isLoggedIn ? 'block' : 'none';
}

// 클래스 목록 드롭다운 채우기
async function loadClassesIntoSignup(){
  const { data, error } = await sb.from('class_codes').select('code,label').eq('is_active', true).order('label');
  if (error) return; // 조용히 무시
  $suClass.innerHTML = '<option value="">(선택)</option>' +
    (data||[]).map(c => `<option value="${c.code}">${c.label}</option>`).join('');
}

// =========================
/* Auth */
// =========================
$formAuth.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const email = $email.value.trim();
  const password = $pass.value;
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return alert('로그인 실패: ' + error.message);
  await afterLogin();
});

$btnSignup.addEventListener('click', async ()=>{
  await loadClassesIntoSignup();
  dlgSignup.showModal();
});

$suCancel.addEventListener('click', ()=> dlgSignup.close());

$suSubmit.addEventListener('click', async ()=>{
  const email = $suEmail.value.trim();
  const pw1   = $suPass.value;
  const pw2   = $suPass2.value;
  const nick  = $suNick.value.trim();
  const cls   = $suClass.value || null;

  if (!email || !pw1 || !pw2 || !nick) return alert('모든 필드를 채워주세요.');
  if (pw1 !== pw2) return alert('비밀번호 확인이 일치하지 않습니다.');

  // 현재 페이지로 돌아오게 설정(메일 컨펌 켜져 있어도 안전)
  const redirectTo = window.location.origin + window.location.pathname;

  const { data, error } = await sb.auth.signUp({
    email,
    password: pw1,
    options: { emailRedirectTo: redirectTo }
  });
  if (error) return alert('가입 실패: ' + error.message);

  // 세션이 즉시 생긴 경우만 프로필 초기화
  try { await sb.rpc('ensure_profile'); } catch {}
  try {
    const { data: me } = await sb.auth.getUser();
    if (me?.user?.id) {
      await sb.from('profiles')
        .update({ nickname: nick, class_code: cls })
        .eq('user_id', me.user.id);
    }
  } catch {}

  dlgSignup.close();
  alert('가입 요청 완료! 이메일 인증이 필요한 경우, 받은 편지함을 확인하세요.');
  await refreshSessionUI();
});

$btnKakao.addEventListener('click', ()=>{
  alert('Kakao 로그인은 준비 중입니다.');
});

$btnLogout.addEventListener('click', async ()=>{
  await sb.auth.signOut();
  await refreshSessionUI();
});

$btnAdmin.addEventListener('click', ()=>{
  // TODO: 관리자 페이지 연결 시 경로 지정
  alert('관리자 페이지는 별도 구현 예정입니다.');
});

// 이메일 링크로 돌아온 경우 세션 반영
sb.auth.onAuthStateChange((_event)=>refreshSessionUI());
refreshSessionUI();

// =========================
/* After Login */
// =========================
async function afterLogin(){
  // 프로필 보장
  try { await sb.rpc('ensure_profile'); } catch {}
  await refreshSessionUI();
}

// 로그인 상태에 따라 UI/데이터
async function refreshSessionUI(){
  const { data:{ user } } = await sb.auth.getUser();

  if (user){
    // 인증 폼 숨김
    $formAuth.style.display = 'none';
    $btnLogout.style.display = 'inline-block';
    $me.textContent = user.email || '로그인됨';

    // 본인 프로필 읽어서 admin 여부 체크
    let isAdmin = false;
    try {
      const { data: mep } = await sb
        .from('profiles')
        .select('is_admin, approved, nickname')
        .eq('user_id', user.id)
        .maybeSingle();
      isAdmin = !!mep?.is_admin;
      if (mep?.nickname) $meNick.textContent = mep.nickname;
    } catch {}

    $btnAdmin.style.display = isAdmin ? 'inline-block' : 'none';

    showLoggedInUI(true);
    await loadMe();
    await loadTop5();
  } else {
    // 로그아웃 상태
    $formAuth.style.display = 'flex';
    $btnLogout.style.display = 'none';
    $btnAdmin.style.display = 'none';
    $me.textContent = '';

    showLoggedInUI(false);
  }
}

// =========================
/* 내 전투력/출석 */
// =========================
async function loadMe(){
  const { data, error } = await sb.from('v_my_rank_current').select('*').maybeSingle();
  if (error || !data){
    // 조용히 초기화
    $meRankBP.textContent = '-';
    $meLevel.textContent  = '-';
    $meBP.textContent     = '-';
    $meAttend.textContent = '0';
    return;
  }
  $meRankBP.textContent = data.rank_total_by_battle_power ?? '-';
  $meLevel.textContent  = data.level ?? '-';
  $meBP.textContent     = data.battle_power ?? '-';
  $meNick.textContent   = data.nickname ?? $meNick.textContent;
  $meAttend.textContent = data.attend ?? 0;

  // 폼에 현재값 채우기
  fillForm(data);
}

function fillForm(d){
  form.level.value      = d.level ?? '';
  form.attack.value     = d.attack ?? '';
  form.defence.value    = d.defence ?? '';
  form.accuracy.value   = d.accuracy ?? '';
  form.memory_pct.value = d.memory_pct ?? '';
  form.subjugate.value  = d.subjugate ?? '';
}

$btnSave.addEventListener('click', async ()=>{
  const fd = new FormData(form);
  const body = {
    p_season: null,
    p_level:      num(fd.get('level')),
    p_attack:     num(fd.get('attack')),
    p_defence:    num(fd.get('defence')),
    p_accuracy:   num(fd.get('accuracy')),
    p_memory_pct: numf(fd.get('memory_pct')),
    p_subjugate:  num(fd.get('subjugate')),
    p_attend: null // 출석은 운영진만
  };
  const { error } = await sb.rpc('self_upsert_stats', body);
  if (error){
    $saveMsg.textContent = '저장 실패';
    return;
  }
  $saveMsg.textContent = '저장 완료';
  await loadMe();
  await loadTop5();
});

// =========================
/* 명예의 전당 Top5 */
// =========================
const CLASS_IMG = {
  '환영검사':'환영검사.png',
  '심연추방자':'심연추방자.png',
  '주문각인사':'주문각인사.png',
  '집행관':'집행관.png',
  '태양감시자':'태양감시자.png',
  '향사수':'향사수.png'
};
const CLASS_FALLBACK = '윈둥자.png';

let mode = 'total';
document.querySelector('.tabs').addEventListener('click', (e)=>{
  if (e.target.tagName !== 'BUTTON') return;
  document.querySelectorAll('.tabs button').forEach(b=>b.classList.remove('active'));
  e.target.classList.add('active');
  mode = e.target.dataset.tab;
  loadTop5();
});

function classImgPath(label){
  const file = CLASS_IMG[label] || CLASS_FALLBACK;
  return `assets/${file}`;
}

async function loadTop5(){
  const board = document.getElementById('hof-board');
  board.innerHTML = '';

  const { data, error } = await sb.rpc('rank_list_public', {
    p_season: null,
    p_basis: mode,
    p_class_code: null,
    p_page: 1,
    p_page_size: 5
  });

  const rows = (!error && Array.isArray(data)) ? data : [];
  renderTop5(rows);
}

function renderTop5(rows){
  const board = document.getElementById('hof-board');
  board.innerHTML = '';
  const places = ['first','second','third','fourth','fifth'];
  const items = Array.from({length:5}, (_, i) => rows[i] ?? { nickname:'', class_label:null });

  items.forEach((r, i)=>{
    const div = document.createElement('div');
    div.className = `hof-card ${places[i]}`;
    const imgSrc = classImgPath(r.class_label);
    div.innerHTML = `
      <div class="place">${placeText(i+1)}</div>
      <img alt="${r.class_label || 'placeholder'}" />
      <div class="name">${r.nickname || '&nbsp;'}</div>
    `;
    const img = div.querySelector('img');
    img.src = imgSrc;
    img.onerror = ()=>{ img.src = `assets/${CLASS_FALLBACK}`; };
    board.appendChild(div);
  });
}

function placeText(n){
  return n===1?'1st':n===2?'2nd':n===3?'3rd':n===4?'4th':'5th';
}
