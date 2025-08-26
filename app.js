const sb = supabase.createClient(window.__SB_URL__, window.__SB_ANON__);

/* =======================
   AUTH (이메일/비번 + 카카오)
======================= */
const $formAuth  = document.getElementById('auth-form');
const $email     = document.getElementById('auth-email');
const $pass      = document.getElementById('auth-pass');
const $btnSignup = document.getElementById('btn-signup');
const $btnLogout = document.getElementById('btn-logout');
const $btnKakao  = document.getElementById('btn-login-kakao');
const $me        = document.getElementById('me');

$formAuth.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const { error } = await sb.auth.signInWithPassword({
    email: $email.value.trim(),
    password: $pass.value
  });
  if (error) return alert('로그인 실패: ' + error.message);
  await afterLogin();
});

$btnSignup?.addEventListener('click', async ()=>{
  const email = $email.value.trim(), password = $pass.value;
  if (!email || !password) return alert('이메일/비밀번호 입력');
  const { error } = await sb.auth.signUp({ email, password });
  if (error) return alert('가입 실패: ' + error.message);
  await afterLogin(true);
  alert('가입 완료!');
});

$btnKakao?.addEventListener('click', async ()=>{
  await sb.auth.signInWithOAuth({
    provider: 'kakao',
    options: { redirectTo: window.location.href }
  });
});

$btnLogout?.addEventListener('click', async ()=>{
  await sb.auth.signOut();
  location.reload();
});

async function afterLogin(){
  // 소셜/이메일 공통: 프로필 자동 생성 보장 (idempotent)
  await sb.rpc('ensure_profile').catch(()=>{});
  await refreshSessionUI();
}

async function refreshSessionUI(){
  const { data: { user } } = await sb.auth.getUser();
  if (user){
    await sb.rpc('ensure_profile').catch(()=>{});
    document.getElementById('auth-form').style.display = 'none';
    document.getElementById('btn-logout').style.display = 'inline-block';
    $me.textContent = user.email || '로그인됨';
    await loadMe();
    await loadTop5();
  } else {
    $me.textContent = '';
  }
}
sb.auth.onAuthStateChange(()=>refreshSessionUI());
refreshSessionUI();

/* =======================
   내 전투력/출석 (보기전용)
======================= */
const $meRankBP = document.getElementById('me-rank-bp');
const $meLevel  = document.getElementById('me-level');
const $meBP     = document.getElementById('me-bp');
const $meNick   = document.getElementById('me-nick');
const $meAttend = document.getElementById('me-attend');

async function loadMe(){
  const { data, error } = await sb.from('v_my_rank_current').select('*').maybeSingle();
  if (error || !data) return;
  $meRankBP.textContent = data.rank_total_by_battle_power ?? '-';
  $meLevel.textContent  = data.level ?? '-';
  $meBP.textContent     = data.battle_power ?? '-';
  $meNick.textContent   = data.nickname ?? '스탠더';
  $meAttend.textContent = data.attend ?? 0;
  fillForm(data);
}

/* =======================
   스탯 업데이트 (출석 제외)
======================= */
const $btnToggle = document.getElementById('btn-toggle-upsert');
const $btnSave   = document.getElementById('btn-save');
const $form      = document.getElementById('form-upsert');
const $saveMsg   = document.getElementById('save-msg');

$btnToggle?.addEventListener('click', ()=>{
  const show = $form.style.display === 'none';
  $form.style.display    = show ? 'block' : 'none';
  $btnSave.style.display = show ? 'inline-block' : 'none';
});

$btnSave?.addEventListener('click', async ()=>{
  const fd = new FormData($form);
  const body = {
    p_season     : null,
    p_level      : num(fd.get('level')),
    p_attack     : num(fd.get('attack')),
    p_defence    : num(fd.get('defence')),
    p_accuracy   : num(fd.get('accuracy')),
    p_memory_pct : numf(fd.get('memory_pct')),
    p_subjugate  : num(fd.get('subjugate')),
    p_attend     : null // 출석은 운영진만
  };
  const { error } = await sb.rpc('self_upsert_stats', body);
  if (error){ $saveMsg.textContent = '저장 실패'; return; }
  $saveMsg.textContent = '저장 완료';
  await loadMe(); await loadTop5();
});

const num  = v => (v===''||v==null) ? null : Number(v);
const numf = v => (v===''||v==null) ? null : Number(v);
function fillForm(d){
  if (!$form) return;
  $form.level.value      = d.level ?? '';
  $form.attack.value     = d.attack ?? '';
  $form.defence.value    = d.defence ?? '';
  $form.accuracy.value   = d.accuracy ?? '';
  $form.memory_pct.value = d.memory_pct ?? '';
  $form.subjugate.value  = d.subjugate ?? '';
}

/* =======================
   명예의 전당 Top5 (탭)
======================= */
const CLASS_IMG = {
  '환영검사':'환영검사.png','심연추방자':'심연추방자.png','주문각인사':'주문각인사.png',
  '집행관':'집행관.png','태양감시자':'태양감시자.png','향사수':'향사수.png'
};
const CLASS_FALLBACK = '윈둥자.png'; // ★ 데이터 없거나 매칭 실패 시

function classImgPath(label){
  const file = CLASS_IMG[label] || CLASS_FALLBACK;
  return `assets/${file}`;
}

let mode = 'total';
const $tabs = document.querySelector('.tabs');
$tabs?.addEventListener('click',(e)=>{
  if (e.target.tagName !== 'BUTTON') return;
  document.querySelectorAll('.tabs button').forEach(b=>b.classList.remove('active'));
  e.target.classList.add('active');
  mode = e.target.dataset.tab; // 'total' | 'bp'
  loadTop5();
});

async function loadTop5(){
  const { data, error } = await sb.rpc('rank_list_public', {
    p_season:null, p_basis:mode, p_class_code:null, p_page:1, p_page_size:5
  });
  // 에러거나 데이터 없음 → 빈 배열로 렌더(아래가 자동으로 윈둥자 채움)
  renderTop5(!error && Array.isArray(data) ? data : []);
}

function renderTop5(rows){
  const board = document.getElementById('hof-board');
  board.innerHTML = '';
  const places = ['first','second','third','fourth','fifth'];

  // 항상 5칸 만들고, 모자라면 placeholder
  const items = Array.from({length:5}, (_, i) => rows[i] ?? { nickname:'', class_label:null });

  items.forEach((r,i)=>{
    const div = document.createElement('div');
    div.className = `hof-card ${places[i]}`;
    const imgSrc = classImgPath(r.class_label); // 라벨 없으면 폴백(윈둥자)
    div.innerHTML = `
      <div class="place">${placeText(i+1)}</div>
      <img alt="${r.class_label || 'placeholder'}">
      <div class="name">${r.nickname || '&nbsp;'}</div>
    `;
    const img = div.querySelector('img');
    img.src = imgSrc;
    img.onerror = () => { img.src = classImgPath(null); }; // 파일 누락시 폴백
    board.appendChild(div);
  });
}

const placeText = n => n===1?'1st':n===2?'2nd':n===3?'3rd':n===4?'4th':'5th';
