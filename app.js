const sb = supabase.createClient(window.__SB_URL__, window.__SB_ANON__);

const $login = document.getElementById('btn-login');
const $logout = document.getElementById('btn-logout');
const $me = document.getElementById('me');
const $leaderboard = document.getElementById('leaderboard');
const $myRank = document.getElementById('my-rank');
const $tabs = document.querySelector('.tabs');
const $form = document.getElementById('form-upsert');
const $saveMsg = document.getElementById('save-msg');

let mode = 'total'; // 'total' | 'bp'

async function refreshSessionUI(){
  const { data: { user } } = await sb.auth.getUser();
  if (user){
    $login.style.display='none';
    $logout.style.display='inline-block';
    $me.textContent = user.email || user.user_metadata?.user_name || '로그인됨';
    await loadMyRank();
    await loadLeaderboard();
  } else {
    $login.style.display='inline-block';
    $logout.style.display='none';
    $me.textContent = '';
    $myRank.textContent = '로그인 필요';
    $leaderboard.innerHTML = '';
  }
}

$login.addEventListener('click', async ()=>{
  // GitHub OAuth 사용 (Supabase Auth의 GitHub 프로바이더 활성화 필요)
  await sb.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: window.location.href }});
});
$logout.addEventListener('click', async ()=>{
  await sb.auth.signOut();
  await refreshSessionUI();
});

$tabs.addEventListener('click', (e)=>{
  if (e.target.tagName !== 'BUTTON') return;
  document.querySelectorAll('.tabs button').forEach(b=>b.classList.remove('active'));
  e.target.classList.add('active');
  mode = e.target.dataset.tab;
  loadLeaderboard();
});

async function loadMyRank(){
  const { data, error } = await sb.from('v_my_rank_current').select('*').maybeSingle();
  if (error){ $myRank.textContent = '조회 오류'; return; }
  if (!data){ $myRank.textContent = '데이터 없음'; return; }
  $myRank.innerHTML = `
    <div class="lb-row">
      <div class="lb-name">${data.nickname} (${data.class_code})</div>
      <div class="lb-metrics">
        <span class="badge ok">총점랭크 ${data.rank_total_by_total_score ?? '-'}</span>
        <span class="badge">BP랭크 ${data.rank_total_by_battle_power ?? '-'}</span>
        <span class="badge">BP ${data.battle_power ?? 0}</span>
        <span class="badge ok">TS ${data.total_score ?? 0}</span>
      </div>
    </div>
  `;
}

async function loadLeaderboard(){
  const body = {
    p_season: null,          // null이면 current_season()
    p_basis: mode,           // 'total' or 'bp'
    p_class_code: null,      // 특정 클래스만 보고 싶으면 코드 넣기
    p_page: 1,
    p_page_size: 5
  };
  const { data, error } = await sb.rpc('rank_list_public', body);
  if (error){ $leaderboard.textContent = '조회 오류'; return; }
  renderLB(data || []);
}
function renderLB(rows){
  $leaderboard.innerHTML = '';
  rows.forEach(r=>{
    const row = document.createElement('div');
    row.className = 'lb-row';
    row.innerHTML = `
      <div class="lb-rank">${r.rank_num ?? '-'}</div>
      <div class="lb-name">${r.nickname ?? '(익명)'}</div>
      <div class="lb-metrics">
        <span class="badge">BP ${r.battle_power ?? 0}</span>
        <span class="badge ok">TS ${r.total_score ?? 0}</span>
      </div>
    `;
    $leaderboard.appendChild(row);
  });
}

$form.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const fd = new FormData($form);
  const body = {
    p_season: null,
    p_level: num(fd.get('level')),
    p_attack: num(fd.get('attack')),
    p_defence: num(fd.get('defence')),
    p_accuracy: num(fd.get('accuracy')),
    p_memory_pct: numf(fd.get('memory_pct')),
    p_subjugate: num(fd.get('subjugate')),
    p_attend: num(fd.get('attend'))
  };
  const { data, error } = await sb.rpc('self_upsert_stats', body);
  if (error){ $saveMsg.textContent = '저장 실패'; return; }
  $saveMsg.textContent = '저장 완료';
  await loadMyRank();
  await loadLeaderboard();
});
const num = v => (v===''||v==null)?null:Number(v);
const numf = v => (v===''||v==null)?null:Number(v);

sb.auth.onAuthStateChange(()=>refreshSessionUI());
refreshSessionUI();
