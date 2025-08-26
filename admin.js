const sb = supabase.createClient(window.__SB_URL__, window.__SB_ANON__);

async function mustAdmin() {
  const { data:{ user } } = await sb.auth.getUser();
  if (!user) { location.href = './'; return; }
  const { data: p } = await sb.from('profiles')
    .select('is_admin').eq('user_id', user.id).maybeSingle();
  if (!p?.is_admin) { alert('관리자만 접근 가능합니다.'); location.href='./'; }
}

async function loadPending() {
  const wrap = document.getElementById('pending-list');
  wrap.innerHTML = '로딩...';
  const { data, error } = await sb.rpc('admin_list_pending');
  if (error) { wrap.textContent = '오류: '+error.message; return; }
  if (!data || data.length===0) { wrap.textContent = '대기 중인 가입이 없습니다.'; return; }

  wrap.innerHTML = data.map(r => `
    <div class="row">
      <div>${r.nickname || '(무명)'}</div>
      <div>${r.class_code || '-'}</div>
      <div>${new Date(r.created_at).toLocaleString()}</div>
      <div class="actions">
        <button data-uid="${r.user_id}" data-admin="false">승인</button>
        <button data-uid="${r.user_id}" data-admin="true" class="warn">승인+운영자</button>
      </div>
    </div>
  `).join('');

  wrap.querySelectorAll('button').forEach(b=>{
    b.addEventListener('click', async ()=>{
      const uid = b.dataset.uid, makeAdmin = (b.dataset.admin==='true');
      const { error } = await sb.rpc('admin_approve_user', { p_user_id: uid, p_make_admin: makeAdmin });
      if (error) return alert('승인 실패: '+error.message);
      await loadPending();
      alert('처리 완료');
    });
  });
}

const GRADE = [
  {v:null, t:'일반(100%)'}, {v:1,t:'1등급(109%)'}, {v:2,t:'2등급(107%)'},
  {v:3,t:'3등급(105%)'}, {v:4,t:'4등급(103%)'}, {v:5,t:'5등급(101%)'},
  {v:6,t:'6등급(99%)'}, {v:7,t:'7등급(97%)'}, {v:8,t:'8등급(95%)'},
  {v:9,t:'9등급(93%)'}, {v:10,t:'10등급(91%)'}
];

async function searchMembers(q){
  // 운영진은 전체 보이게, 간단히 프로필에서 검색
  const { data, error } = await sb.from('profiles')
    .select('user_id,nickname,class_code,approved')
    .ilike('nickname', `%${q}%`)
    .limit(50);
  if (error) throw error;
  return data||[];
}

async function renderSearch(){
  const q = document.getElementById('search-nick').value.trim();
  const wrap = document.getElementById('search-result');
  wrap.innerHTML = '검색 중...';
  const rows = await searchMembers(q||'');
  if (rows.length===0){ wrap.textContent = '결과 없음'; return; }
  wrap.innerHTML = rows.map(r=>{
    const sel = `<select data-uid="${r.user_id}" class="grade">
      ${GRADE.map(g=>`<option value="${g.v??''}">${g.t}</option>`).join('')}
    </select>`;
    return `<div class="row">
      <div>${r.nickname}</div><div>${r.class_code||'-'}</div>
      <div>${r.approved? '승인됨':'대기'}</div>
      <div class="actions">${sel}<button data-uid="${r.user_id}" class="set">적용</button></div>
    </div>`;
  }).join('');

  wrap.querySelectorAll('button.set').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const uid = btn.dataset.uid;
      const gradeSel = wrap.querySelector(`select.grade[data-uid="${uid}"]`);
      const grade = gradeSel.value===''? null : Number(gradeSel.value);
      const { error } = await sb.rpc('admin_set_eval_grade', { p_user_id: uid, p_season: null, p_grade: grade });
      if (error) return alert('설정 실패: '+error.message);
      alert('적용 완료');
    });
  });
}

document.getElementById('btn-search').addEventListener('click', renderSearch);

mustAdmin().then(loadPending);
