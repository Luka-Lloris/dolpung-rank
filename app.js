const sb = supabase.createClient(window.__SB_URL__, window.__SB_ANON__);

/* ====== AUTH ELEMENTS ====== */
const $formAuth = document.getElementById('auth-form');
const $email = document.getElementById('auth-email');
const $pass = document.getElementById('auth-pass');
const $btnSignup = document.getElementById('btn-signup');
const $btnLogout = document.getElementById('btn-logout');
const $btnKakao = document.getElementById('btn-login-kakao');
const $me = document.getElementById('me');
const $adminBtn = document.getElementById('btn-admin');

/* ====== SIGNUP MODAL ====== */
const $dlgSignup = document.getElementById('dlg-signup');
const $suEmail = document.getElementById('su-email');
const $suPass = document.getElementById('su-pass');
const $suPass2 = document.getElementById('su-pass2');
const $suNick = document.getElementById('su-nick');
const $suClass = document.getElementById('su-class');
const $suSubmit = document.getElementById('su-submit');
const $suCancel = document.getElementById('su-cancel');

/* ====== LEFT PANEL ====== */
const $authedPanel = document.getElementById('authed-panel');
const $guestVideo = document.getElementById('guest-video');

const $meRankBP = document.getElementById('me-rank-bp');
const $meLevel  = document.getElementById('me-level');
const $meBP     = document.getElementById('me-bp');
const $meNick   = document.getElementById('me-nick');
const $meAttend = document.getElementById('me-attend');

const $btnToggle = document.getElementById('btn-toggle-upsert');
const $btnSave   = document.getElementById('btn-save');
const $formUp    = document.getElementById('form-upsert');
const $saveMsg   = document.getElementById('save-msg');

/* ====== RIGHT (HOF) ====== */
const $tabs = document.querySelector('.tabs');
const $hof = document.getElementById('hof-board');
const $firstSlot = $hof.querySelector('.first');
const $othersSlot = $hof.querySelector('.others');

const CLASS_IMG = {
  '환영검사':'환영검사.png','심연추방자':'심연추방자.png','주문각인사':'주문각인사.png',
  '집행관':'집행관.png','태양감시자':'태양감시자.png','향사수':'향사수.png'
};
const CLASS_FALLBACK = '윈둥자.png';
let mode = 'total';

/* ====== AUTH HANDLERS ====== */
$formAuth.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const { error } = await sb.auth.signInWithPassword({
    email: $email.value.trim(), password: $pass.value
  });
  if (error) return alert('로그인 실패: '+error.message);
  await afterLogin();
});

$btnSignup.addEventListener('click', async ()=>{
  await loadClassCodes();
  $dlgSignup.showModal();
});

$suCancel.addEventListener('click', ()=> $dlgSignup.close());

$suSubmit.addEventListener('click', async ()=>{
  const email = $suEmail.value.trim();
  const pw = $suPass.value;
  const pw2 = $suPass2.value;
  const nick = $suNick.value.trim();
  const cls = $suClass.value || null;

  if (!email || !pw || !nick) return alert('필수 항목을 채워주세요.');
  if (pw !== pw2) return alert('비밀번호 확인이 일치하지 않습니다.');

  const { error: e1 } = await sb.auth.signUp({ email, password: pw });
  if (e1) return alert('가입 실패: '+e1.message);

  // 바로 로그인 시도 (이메일 확인 없이 진행하는 환경 가정)
  const { error: e2 } = await sb.auth.signInWithPassword({ email, password: pw });
  if (e2) return alert('로그인 실패: '+e2.message);

  // 프로필 보장 + 닉/클래스 세팅
  await sb.rpc('ensure_profile').catch(()=>{});
  const { data:{ user } } = await sb.auth.getUser();
  if (user){
    await sb.from('profiles').update({ nickname: nick, class_code: cls }).eq('user_id', user.id);
  }
  $dlgSignup.close();
  alert('가입 완료! 운영진 승인 후 이용 가능합니다.');
  await afterLogin();
});

$btnKakao.addEventListener('click', ()=>{
  alert('Kakao 로그인은 준비 중입니다.');
});

$btnLogout.addEventListener('click', async ()=>{
  await sb.auth.signOut();
  location.reload();
});

async function afterLogin(){
  await sb.rpc('ensure_profile').catch(()=>{});
  await refreshSessionUI();
}

async function refreshSessionUI(){
  const { data:{ user } } = await sb.auth.getUser();

  if (user){
    $formAuth.style.display='none';
    $btnLogout.style.display='inline-block';
    $me.textContent = user.email || '로그인됨';

    // 권한 체크
    const { data:p } = await sb.from('profiles')
      .select('is_admin, approved, nickname').eq('user_id', user.id).maybeSingle();
    $adminBtn.style.display = (p?.is_admin===true) ? 'inline-block' : 'none';

    // 로그인 UI 전환
    $guestVideo.style.display = 'none';
    $authedPanel.style.display = 'block';

    await loadMe();
    await loadTop5();
  }else{
    $me.textContent='';
    $btnLogout.style.display='none';
    $formAuth.style.display='flex';
    $adminBtn.style.display='none';

    // 비로그인 UI 전환
    $guestVideo.style.display = 'block';
    $authedPanel.style.display = 'none';
  }
}
sb.auth.onAuthStateChange(()=>refreshSessionUI());
refreshSessionUI();

/* ====== SIGNUP: 클래스 드롭다운 ====== */
async function loadClassCodes(){
  const { data, error } = await sb.from('class_codes').select('code,label').eq('is_active', true).order('label');
  if (error) return;
  $suClass.innerHTML = `<option value="">(선택)</option>` + (data||[])
    .map(r=> `<option value="${r.code}">${r.label}</option>`).join('');
}

/* ====== 내 정보/업서트 ====== */
async function loadMe(){
  const { data, error } = await sb.from('v_my_rank_current').select('*').maybeSingle();
  if (error || !data) return;

  $meRankBP.textContent = data.rank_total_by_battle_power ?? '-';
  $meLevel.textContent = data.level ?? '-';
  $meBP.textContent = data.battle_power ?? '-';
  $meNick.textContent = data.nickname ?? '스탠더';
  $meAttend.textContent = data.attend ?? 0;

  // 폼 채우기
  fillForm(data);
}
function fillForm(d){
  $formUp.level.value      = d.level ?? '';
  $formUp.attack.value     = d.attack ?? '';
  $formUp.defence.value    = d.defence ?? '';
  $formUp.accuracy.value   = d.accuracy ?? '';
  $formUp.memory_pct.value = d.memory_pct ?? '';
  $formUp.subjugate.value  = d.subjugate ?? '';
}

$btnToggle.addEventListener('click', ()=>{
  const show = $formUp.style.display === 'none';
  $formUp.style.display = show ? 'block' : 'none';
  $btnSave.style.display = show ? 'inline-block' : 'none';
});
$btnSave.addEventListener('click', async ()=>{
  const fd = new FormData($formUp);
  const body = {
    p_season: null,
    p_level: num(fd.get('level')),
    p_attack: num(fd.get('attack')),
    p_defence: num(fd.get('defence')),
    p_accuracy: num(fd.get('accuracy')),
    p_memory_pct: numf(fd.get('memory_pct')),
    p_subjugate: num(fd.get('subjugate')),
    p_attend: null
  };
  const { error } = await sb.rpc('self_upsert_stats', body);
  if (error){ $saveMsg.textContent = '저장 실패'; return; }
  $saveMsg.textContent = '저장 완료';
  await loadMe(); await loadTop5();
});
const num  = v => (v===''||v==null)?null:Number(v);
const numf = v => (v===''||v==null)?null:Number(v);

/* ====== HOF TOP5 ====== */
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

function classImgPath(label){
  const file = CLASS_IMG[label] || CLASS_FALLBACK;
  return `assets/${file}`;
}
function renderTop5(rows){
  // 항상 5칸 채우기
  const items = Array.from({length:5}, (_,i)=> rows[i] ?? { nickname:'', class_label:null });

  // 첫 카드
  $firstSlot.innerHTML = cardHTML(items[0], 1, 'first');

  // 나머지 4장
  $othersSlot.innerHTML = '';
  ['second','third','fourth','fifth'].forEach((cls, idx)=>{
    const r = items[idx+1];
    const div = document.createElement('div');
    div.className = 'hof-card '+cls;
    div.innerHTML = cardInnerHTML(r, idx+2);
    const img = div.querySelector('img');
    img.onerror = ()=> img.src = classImgPath(null);
    $othersSlot.appendChild(div);
  });
}
function cardHTML(r, place, extraClass=''){
  const div = document.createElement('div');
  div.className = 'hof-card '+extraClass;
  div.innerHTML = cardInnerHTML(r, place);
  const img = div.querySelector('img');
  img.onerror = ()=> img.src = classImgPath(null);
  return div.outerHTML;
}
function cardInnerHTML(r, place){
  const imgSrc = classImgPath(r.class_label);
  return `
    <div class="place">${placeText(place)}</div>
    <img alt="${r.class_label||'placeholder'}" src="${imgSrc}">
    <div class="name">${r.nickname || '&nbsp;'}</div>
  `;
}
const placeText = (n)=> n===1?'1st':n===2?'2nd':n===3?'3rd':n===4?'4th':'5th';
