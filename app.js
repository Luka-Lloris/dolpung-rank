// Supabase Client
const sb = supabase.createClient(window.__SB_URL__, window.__SB_ANON__);

// ----- DOM -----
const $authForm   = document.getElementById('auth-form');
const $email      = document.getElementById('auth-email');
const $pass       = document.getElementById('auth-pass');
const $btnSignup  = document.getElementById('btn-signup');
const $btnLogout  = document.getElementById('btn-logout');
const $btnKakao   = document.getElementById('btn-login-kakao');
const $meSpan     = document.getElementById('me');
const $adminLink  = document.getElementById('admin-link');

const $dlgSignup  = document.getElementById('dlg-signup');
const $suEmail    = document.getElementById('su-email');
const $suPass     = document.getElementById('su-pass');
const $suPass2    = document.getElementById('su-pass2');
const $suNick     = document.getElementById('su-nick');
const $suClass    = document.getElementById('su-class');
const $suSubmit   = document.getElementById('su-submit');
const $suCancel   = document.getElementById('su-cancel');

const $teaserWrap = document.getElementById('teaser');
const $meArea     = document.getElementById('me-area');

const $meRankBP = document.getElementById('me-rank-bp');
const $meLevel  = document.getElementById('me-level');
const $meBP     = document.getElementById('me-bp');
const $meNick   = document.getElementById('me-nick');
const $meAttend = document.getElementById('me-attend');

const $btnToggle = document.getElementById('btn-toggle-upsert');
const $btnSave   = document.getElementById('btn-save');
const $form      = document.getElementById('form-upsert');
const $saveMsg   = document.getElementById('save-msg');

const $tabs      = document.querySelector('.tabs');
const $hofBoard  = document.getElementById('hof-board');

// ----- Helpers -----
const num  = v => (v===''||v==null)?null:Number(v);
const numf = v => (v===''||v==null)?null:Number(v);

const CLASS_IMG = {
  '환영검사':'환영검사.png','심연추방자':'심연추방자.png','주문각인사':'주문각인사.png',
  '집행관':'집행관.png','태양감시자':'태양감시자.png','향사수':'향사수.png'
};
const CLASS_FALLBACK = '윈둥자.png';
const classImgPath = (label) => `assets/${CLASS_IMG[label] || CLASS_FALLBACK}`;
const placeText = (n)=> n===1?'1st':n===2?'2nd':n===3?'3rd':n===4?'4th':'5th';

// ----- Auth Flow -----
$authForm.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const { error } = await sb.auth.signInWithPassword({ email:$email.value.trim(), password:$pass.value });
  if (error) return alert('로그인 실패: '+error.message);
  await afterLogin();
});

$btnSignup.addEventListener('click', async ()=>{
  // 클래스 목록 로딩
  await loadClassCodes();
  // 이메일/비번 자동 채움 (있다면)
  $suEmail.value = $email.value.trim();
  $dlgSignup.showModal();
});

$suCancel.addEventListener('click', (e)=>{ e.preventDefault(); $dlgSignup.close(); });

$suSubmit.addEventListener('click', async ()=>{
  if ($suPass.value !== $suPass2.value) return alert('비밀번호가 일치하지 않습니다.');
  if (!$suClass.value) return alert('주 클래스를 선택해주세요.');

  // 가입
  const { data, error } = await sb.auth.signUp({
    email: $suEmail.value.trim(),
    password: $suPass.value
  });
  if (error) return alert('가입 실패: '+error.message);

  // 프로필 보장 + 닉네임/클래스 설정
  await sb.rpc('ensure_profile').catch(()=>{});
  const { data:{ user } } = await sb.auth.getUser();
  if (user) {
    await sb.from('profiles')
      .update({ nickname: $suNick.value.trim(), class_code: $suClass.value })
      .eq('user_id', user.id);
  }

  alert('가입 완료! (운영진 승인 후 이용 가능)');
  $dlgSignup.close();
  await afterLogin();
});

$btnKakao.addEventListener('click', ()=>{
  alert('Kakao 로그인 기능은 준비 중에 있습니다');
});

$btnLogout.addEventListener('click', async ()=>{
  await sb.auth.signOut();
  location.reload();
});

async function afterLogin(){
  // 소셜/일반 동일 경로
  await sb.rpc('ensure_profile').catch(()=>{});
  await refreshSessionUI();
}

sb.auth.onAuthStateChange((_e)=>refreshSessionUI());
refreshSessionUI();

// ----- UI -----
async function refreshSessionUI(){
  const { data:{ user } } = await sb.auth.getUser();

  if (user){
    document.getElementById('auth-form').style.display='none';
    document.getElementById('btn-logout').style.display='inline-block';
    $meSpan.textContent = user.email || '로그인됨';

    // 티저 숨기고 내영역 표시
    $teaserWrap.style.display='none';
    $meArea.style.display='block';

    await loadMe();
    await loadTop5();
    await toggleAdminLink();
  }else{
    $meSpan.textContent='';
    $teaserWrap.style.display='block';
    $meArea.style.display='none';
    await loadTop5(); // 비로그인도 명예의전당 표시(빈칸은 윈둥자)
    $adminLink.style.display='none';
  }
}

async function toggleAdminLink(){
  const { data, error } = await sb.from('profiles').select('is_admin').maybeSingle();
  if (!error && data && data.is_admin === true){
    $adminLink.style.display = 'inline-block';
  }else{
    $adminLink.style.display = 'none';
  }
}

// ----- 클래스 드롭다운 -----
async function loadClassCodes(){
  const { data, error } = await sb.from('class_codes').select('code,label').eq('is_active', true).order('label');
  if (error) return;
  $suClass.innerHTML = '<option value="">(선택)</option>' +
    (data||[]).map(r=>`<option value="${r.code}">${r.label}</option>`).join('');
}

// ----- 내 전투력/출석 -----
async function loadMe(){
  const { data, error } = await sb.from('v_my_rank_current').select('*').maybeSingle();
  if (error || !data){ return; }
  $meRankBP.textContent = data.rank_total_by_battle_power ?? '-';
  $meLevel.textContent  = data.level ?? '-';
  $meBP.textContent     = data.battle_power ?? '-';
  $meNick.textContent   = data.nickname ?? '스탠더';
  $meAttend.textContent = data.attend ?? 0;
  fillForm(data);
}

function fillForm(d){
  $form.level.value      = d.level ?? '';
  $form.attack.value     = d.attack ?? '';
  $form.defence.value    = d.defence ?? '';
  $form.accuracy.value   = d.accuracy ?? '';
  $form.memory_pct.value = d.memory_pct ?? '';
  $form.subjugate.value  = d.subjugate ?? '';
}

// 스탯 토글/저장
$btnToggle.addEventListener('click', ()=>{
  const show = $form.style.display === 'none';
  $form.style.display = show ? 'block' : 'none';
  $btnSave.style.display = show ? 'inline-block' : 'none';
});
$btnSave.addEventListener('click', saveStats);

async function saveStats(){
  const fd = new FormData($form);
  const body = {
    p_season: null,
    p_level: num(fd.get('level')),
    p_attack: num(fd.get('attack')),
    p_defence: num(fd.get('defence')),
    p_accuracy: num(fd.get('accuracy')),
    p_memory_pct: numf(fd.get('memory_pct')),
    p_subjugate: num(fd.get('subjugate')),
    p_attend: null // 출석은 운영진만
  };
  const { error } = await sb.rpc('self_upsert_stats', body);
  if (error){ $saveMsg.textContent = '저장 실패'; return; }
  $saveMsg.textContent = '저장 완료';
  await loadMe(); await loadTop5();
}

// ----- 명예의 전당 -----
let mode = 'total';
$tabs.addEventListener('click',(e)=>{
  if (e.target.tagName!=='BUTTON') return;
  document.querySelectorAll('.tabs button').forEach(b=>b.classList.remove('active'));
  e.target.classList.add('active');
  mode = e.target.dataset.tab;
  loadTop5();
});

async function loadTop5(){
  const { data, error } = await sb.rpc('rank_list_public', {
    p_season:null, p_basis:mode, p_class_code:null, p_page:1, p_page_size:5
  });
  renderTop5(!error && Array.isArray(data) ? data : []);
}

function renderTop5(rows){
  $hofBoard.innerHTML = '';
  const items = Array.from({length:5}, (_, i) => rows[i] ?? { nickname:'', class_label:null });

  const places = ['first','second','third','fourth','fifth'];
  items.forEach((r,i)=>{
    const div = document.createElement('div');
    div.className = `hof-card ${places[i]}`;
    const imgSrc = classImgPath(r.class_label);
    div.innerHTML = `
      <div class="place">${placeText(i+1)}</div>
      <img alt="${r.class_label || 'placeholder'}">
      <div class="name">${r.nickname || '&nbsp;'}</div>
    `;
    const img = div.querySelector('img');
    img.src = imgSrc;
    img.onerror = ()=>{ img.src = classImgPath(null); };
    $hofBoard.appendChild(div);
  });
}
