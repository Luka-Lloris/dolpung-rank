/* The Wind — admin.js (닉네임 검색/선택 → 열정등급 적용) */

const { createClient } = window.supabase;
const supabase = createClient(window.__SB_URL__, window.__SB_ANON__, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
});

const $ = (s)=>document.querySelector(s);
const pendingBox = $('#pendingBox');

const gradeForm  = $('#gradeForm');
const gNick      = $('#g_nick');
const gUserId    = $('#g_user_id');
const gSeason    = $('#g_season');
const gGrade     = $('#g_grade');
const gNote      = $('#g_note');
const nickSuggest= $('#nickSuggest');

function toast(m){ alert(m); }
function htmlEscape(s){ return (s||'').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }

async function mustAdmin() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { toast('로그인이 필요합니다.'); location.href='./index.html'; return false; }
  const { data, error } = await supabase.from('profiles')
    .select('is_admin,approved').eq('user_id', user.id).maybeSingle();
  if (error || !data?.is_admin) { toast('관리자 권한이 없습니다.'); location.href='./index.html'; return false; }
  return true;
}

/* ---- 가입 대기 목록 ---- */
async function loadPending() {
  if (!pendingBox) return;
  pendingBox.textContent = '불러오는 중...';
  const { data, error } = await supabase.rpc('admin_list_pending');
  if (error) { pendingBox.textContent = '오류: ' + error.message; return; }
  if (!data || !data.length) { pendingBox.textContent = '대기중인 가입 요청이 없습니다.'; return; }

  pendingBox.innerHTML = '';
  data.forEach(row=>{
    const el = document.createElement('div');
    el.className = 'pending-row';
    el.style.cssText = 'display:flex;gap:10px;align-items:center;padding:8px;border:1px solid #444;border-radius:10px;margin:6px 0;background:#0f0f0f;';
    el.innerHTML = `
      <span style="min-width:260px">${htmlEscape(row.nickname || '(닉없음)')}</span>
      <span style="min-width:160px">${htmlEscape(row.class_code || '-')}</span>
      <button class="approve">승인</button>
      <button class="approve-admin">승인+관리자</button>
    `;
    el.querySelector('.approve').addEventListener('click', async ()=>{
      el.querySelector('.approve').disabled = true;
      const { error: e } = await supabase.rpc('admin_approve_user', { p_user_id: row.user_id, p_make_admin: false });
      if (e) { toast('실패: '+e.message); el.querySelector('.approve').disabled=false; return; }
      toast('승인 완료'); loadPending();
    });
    el.querySelector('.approve-admin').addEventListener('click', async ()=>{
      el.querySelector('.approve-admin').disabled = true;
      const { error: e } = await supabase.rpc('admin_approve_user', { p_user_id: row.user_id, p_make_admin: true });
      if (e) { toast('실패: '+e.message); el.querySelector('.approve-admin').disabled=false; return; }
      toast('승인+관리자 완료'); loadPending();
    });
    pendingBox.appendChild(el);
  });
}

/* ---- 닉네임 자동완성 ---- */
let suggestAbort = null;
async function suggestNicknames(query) {
  if (!nickSuggest) return;
  nickSuggest.innerHTML = '';
  if (!query || query.trim().length === 0) return;

  // 이전 요청 취소
  if (suggestAbort) try { suggestAbort.abort(); } catch(_) {}
  suggestAbort = new AbortController();

  const { data, error } = await supabase
    .from('profiles')
    .select('user_id,nickname,class_code')
    .ilike('nickname', `%${query.trim()}%`)
    .order('nickname', { ascending: true })
    .limit(10);

  if (error) { return; }
  if (!data || !data.length) return;

  const list = document.createElement('div');
  list.style.cssText = `
    position:absolute; left:0; right:0; max-height:220px; overflow:auto;
    background:#0e0e0e; border:1px solid #444; border-radius:10px; z-index:30;
  `;
  data.forEach(row=>{
    const item = document.createElement('div');
    item.style.cssText = 'padding:8px 10px; cursor:pointer; border-bottom:1px solid #222;';
    item.innerHTML = `<strong>${htmlEscape(row.nickname || '(닉없음)')}</strong>
                      <span style="color:#9aa"> — ${htmlEscape(row.class_code || '-')}</span>`;
    item.addEventListener('click', ()=>{
      gUserId.value = row.user_id;
      gNick.value = row.nickname || '';
      nickSuggest.innerHTML = '';
      gNote.textContent = `선택됨: ${row.nickname} (${row.class_code||'-'})`;
    });
    list.appendChild(item);
  });
  nickSuggest.innerHTML = '';
  nickSuggest.appendChild(list);
}

/* ---- 열정등급 적용 ---- */
async function applyGrade(ev){
  ev.preventDefault();
  gNote.textContent = '';

  // 1) user_id 확정
  let userId = gUserId.value || null;
  const nick = (gNick.value || '').trim();

  if (!userId) {
    if (!nick) { gNote.textContent = '닉네임을 입력하거나 목록에서 선택하세요.'; return; }
    // 닉네임으로 조회
    const { data, error } = await supabase
      .from('profiles')
      .select('user_id,nickname')
      .ilike('nickname', nick)      // 부분 일치 허용
      .limit(11);
    if (error) { gNote.textContent = '조회 실패: '+error.message; return; }
    if (!data || data.length === 0) { gNote.textContent = '해당 닉네임을 찾을 수 없습니다.'; return; }
    if (data.length > 1) { gNote.textContent = '복수 일치: 목록에서 정확한 대상을 선택하세요.'; return; }
    userId = data[0].user_id;
  }

  // 2) 파라미터
  const season = gSeason.value ? parseInt(gSeason.value,10) : null;
  const grade  = gGrade.value ? parseInt(gGrade.value,10) : null;

  // 3) RPC 실행
  const { error } = await supabase.rpc('admin_set_eval_grade', {
    p_user_id: userId, p_season: season, p_grade: grade
  });
  if (error) { gNote.textContent = '실패: ' + error.message; return; }
  gNote.textContent = '적용 완료';
}

/* ---- 이벤트/부팅 ---- */
document.addEventListener('DOMContentLoaded', async ()=>{
  const ok = await mustAdmin();
  if (!ok) return;
  await loadPending();
});

if (gradeForm) gradeForm.addEventListener('submit', applyGrade);

// 닉네임 입력 → 제안
if (gNick) {
  gNick.addEventListener('input', () => {
    gUserId.value = ''; // 입력이 바뀌면 선택 해제
    suggestNicknames(gNick.value);
  });
  // 포커스 밖으로 나가면 제안 닫기(선택은 유지)
  gNick.addEventListener('blur', () => setTimeout(()=>{ if(nickSuggest) nickSuggest.innerHTML=''; }, 150));
}
console.info('[TW] admin ready (nickname-based grade)');
