// ---------- Supabase ----------
const sb = supabase.createClient(window.__SB_URL__, window.__SB_ANON__);

// ---------- DOM 헬퍼 ----------
const $ = (sel, p = document) => p.querySelector(sel);
const $$ = (sel, p = document) => [...p.querySelectorAll(sel)];

// ---------- 엘리먼트 캐시 ----------
const $authForm   = $('#auth-form');
const $email      = $('#auth-email');
const $pass       = $('#auth-pass');
const $btnSignup  = $('#btn-signup');
const $btnLogout  = $('#btn-logout');
const $btnKakao   = $('#btn-login-kakao');
const $meSpan     = $('#me');

const $dlg        = $('#dlg-signup');
const $suEmail    = $('#su-email');
const $suPass     = $('#su-pass');
const $suPass2    = $('#su-pass2');
const $suNick     = $('#su-nick');
const $suClassSel = $('#su-class');
const $suSubmit   = $('#su-submit');
const $suCancel   = $('#dlg-signup .ghost');

const $meRankBP = $('#me-rank-bp');
const $meLevel  = $('#me-level');
const $meBP     = $('#me-bp');
const $meNick   = $('#me-nick');
const $meAttend = $('#me-attend');

const $authArea = document.getElementById('auth-area');
const $promo    = document.getElementById('promo');

const $btnToggle = $('#btn-toggle-upsert');
const $btnSave   = $('#btn-save');
const $form      = $('#form-upsert');
const $saveMsg   = $('#save-msg');

const $tabs      = $('.tabs');
const $board     = $('#hof-board');

// ---------- 클래스 이미지 매핑 ----------
const CLASS_IMG = {
  '환영검사':'환영검사.png','심연추방자':'심연추방자.png','주문각인사':'주문각인사.png',
  '집행관':'집행관.png','태양감시자':'태양감시자.png','향사수':'향사수.png'
};
const CLASS_FALLBACK = '윈둥자.png'; // 데이터 없을 때 placeholder
const classImgPath = (label) => `assets/${CLASS_IMG[label] || CLASS_FALLBACK}`;
const placeText = (n)=> n===1?'1st':n===2?'2nd':n===3?'3rd':n===4?'4th':'5th';

// ---------- 유틸 ----------
const num  = v => (v===''||v==null)?null:Number(v);
const numf = v => (v===''||v==null)?null:Number(v);

// ---------- 초기화 ----------
init();
function init(){
  // 로그인
  $authForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const { error } = await sb.auth.signInWithPassword({
      email: $email.value.trim(),
      password: $pass.value
    });
    if (error) return alert('로그인 실패: '+error.message);
    await afterLogin();
  });

  // 최초가입 모달 열기
  $btnSignup.addEventListener('click', async ()=>{
    $suEmail.value = $email.value.trim();
    $suPass.value = $suPass2.value = '';
    $suNick.value = '';
    await loadClassCodes();
    if (typeof $dlg.showModal === 'function') $dlg.showModal();
    else $dlg.setAttribute('open','');
  });

  // 모달 취소
  $suCancel.addEventListener('click', ()=>{
    if ($dlg.open) $dlg.close();
    else $dlg.removeAttribute('open');
  });
  // 모달 바깥 클릭 닫기
  $dlg.addEventListener('click', (e)=>{ if (e.target === $dlg) $dlg.close(); });

  // 가입 제출
  $suSubmit.addEventListener('click', handleSignup);

  // 카카오는 준비중
  $btnKakao.addEventListener('click', ()=> alert('Kakao 로그인 기능은 준비 중입니다.'));

  // 로그아웃
  $btnLogout.addEventListener('click', async ()=>{
    await sb.auth.signOut();
    location.reload();
  });

  // 스탯 폼 토글/저장
  $btnToggle.addEventListener('click', ()=>{
    const show = $form.style.display === 'none';
    $form.style.display = show ? 'block' : 'none';
    $btnSave.style.display = show ? 'inline-block' : 'none';
  });
  $btnSave.addEventListener('click', saveStats);

  // 탭
  $tabs.addEventListener('click', (e)=>{
    if (e.target.tagName !== 'BUTTON') return;
    $$('.tabs button').forEach(b=>b.classList.remove('active'));
    e.target.classList.add('active');
    mode = e.target.dataset.tab;
    loadTop5();
  });

  // 세션 감시
  sb.auth.onAuthStateChange((_e)=>refreshSessionUI());
  refreshSessionUI();
}

// ---------- 회원가입 ----------
async function handleSignup(){
  const email = $suEmail.value.trim();
  const pass  = $suPass.value;
  const pass2 = $suPass2.value;
  const nick  = $suNick.value.trim();
  const cls   = $suClassSel.value || null;

  if (!email || !pass || !pass2 || !nick) return alert('모든 값을 입력해주세요.');
  if (pass !== pass2) return alert('비밀번호 확인이 일치하지 않습니다.');

  const { error: signErr } = await sb.auth.signUp({ email, password: pass });
  if (signErr) return alert('가입 실패: '+signErr.message);

  await sb.rpc('ensure_profile').catch(()=>{});
  const { data:{ user } } = await sb.auth.getUser();
  if (user){
    await sb.from('profiles').update({ nickname: nick, class_code: cls }).eq('user_id', user.id).catch(()=>{});
  }

  if ($dlg.open) $dlg.close();
  await afterLogin(true);
  alert('가입 완료! 운영진 승인 후 랭킹에 반영됩니다.');
}

// ---------- 클래스 목록 ----------
async function loadClassCodes(){
  const { data, error } = await sb.from('class_codes')
    .select('code,label').eq('is_active', true).order('label', { ascending: true });
  $suClassSel.innerHTML = '<option value="">(선택)</option>';
  if (error) return;
  (data||[]).forEach(row=>{
    const opt = document.createElement('option');
    opt.value = row.code;
    opt.textContent = row.label;
    $suClassSel.appendChild(opt);
  });
}

// ---------- 로그인 이후 ----------
async function afterLogin(){
  await sb.rpc('ensure_profile').catch(()=>{});
  await refreshSessionUI();
}

// ---------- 세션 UI 토글 ----------
async function refreshSessionUI(){
  const { data:{ user } } = await sb.auth.getUser();

  if (user){
    // 헤더
    $authForm.style.display = 'none';
    $btnLogout.style.display = 'inline-block';
    $meSpan.textContent = user.email || '로그인됨';

    // 왼쪽 카드: 기능 보이기 / 영상 숨김
    if ($authArea) $authArea.style.display = '';
    if ($promo)    $promo.style.display = 'none';
    const v = document.getElementById('promo-video'); if (v){ try{ v.pause(); }catch(_){} }

    await loadMe();
    await loadTop5();
  }else{
    // 헤더
    $authForm.style.display = '';
    $btnLogout.style.display = 'none';
    $meSpan.textContent = '';

    // 왼쪽 카드: 기능 숨김 / 영상 노출
    if ($authArea) $authArea.style.display = 'none';
    if ($promo)    $promo.style.display = 'flex';

    await loadTop5();
  }
}

// ---------- 내 정보/스탯 ----------
async function loadMe(){
  const { data, error } = await sb.from('v_my_rank_current').select('*').maybeSingle();
  if (error || !data){ 
    $meRankBP.textContent = '-';
    $meLevel.textContent  = '-';
    $meBP.textContent     = '-';
    $meNick.textContent   = '스탠더';
    $meAttend.textContent = 0;
    return;
  }
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
  await loadMe(); 
  await loadTop5();
  setTimeout(()=>{ $saveMsg.textContent=''; }, 2000);
}

// ---------- 랭킹 Top5 ----------
let mode = 'total';

async function loadTop5(){
  const { data, error } = await sb.rpc('rank_list_public', {
    p_season:null, p_basis:mode, p_class_code:null, p_page:1, p_page_size:5
  });
  renderTop5(!error && Array.isArray(data) ? data : []);
}

function renderTop5(rows){
  $board.innerHTML = '';
  co
