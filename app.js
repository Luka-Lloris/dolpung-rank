// ─────────────────────────────────────────────────────────────
// Supabase 초기화
// ─────────────────────────────────────────────────────────────
const supabase = window.supabase.createClient(window.__SB_URL__, window.__SB_ANON__);

// 공통 유틸
const $ = (sel) => document.querySelector(sel);
const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v ?? "-"; };
const toInt = (v) => (v === "" || v === null || v === undefined) ? 0 : parseInt(v, 10);
const toNum = (v) => (v === "" || v === null || v === undefined) ? 0 : Number(v);

// 로그인 상태 반영
async function reflectSession() {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    // 비로그인
    $("#authSignedOut").style.display = "flex";
    $("#authSignedIn").style.display = "none";
    $("#authedBoard").style.display = "none";
    $("#guestBoard").style.display = "grid";
    renderHofPlaceholders("hofGuest");
    return;
  }

  // 로그인
  $("#authSignedOut").style.display = "none";
  $("#authSignedIn").style.display = "flex";
  $("#guestBoard").style.display = "none";
  $("#authedBoard").style.display = "grid";
  $("#whoami").textContent = session.user.email;

  // 프로필 확정(없으면 생성)
  await supabase.rpc("ensure_profile").catch(()=>{});

  // 관리자/승인 상태
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin, approved")
    .eq("user_id", session.user.id)
    .single();

  // 헤더 관리자 메뉴 노출
  document.getElementById("adminLink").style.display = (profile?.is_admin) ? "inline-block" : "none";

  await renderMine();
  await renderTop5("battle_power");
}

// 명예의 전당: 플레이스홀더(로그아웃 시에도 동일 레이아웃)
function renderHofPlaceholders(targetId) {
  const wrap = document.getElementById(targetId);
  const ph = () => `<div class="card"><img src="assets/윈둥자.png" alt="placeholder"></div>`;
  wrap.innerHTML = `
    <div class="card big"><img src="assets/윈둥자.png" alt="placeholder"></div>
    ${ph()}${ph()}${ph()}${ph()}
  `;
}

// 명예의 전당: 실제 데이터 표출
async function renderTop5(basis = "battle_power") {
  const wrap = document.getElementById("hof");
  if (!wrap) return;

  // rank_list_public(p_season, p_basis, p_class_code, p_page, p_page_size)
  const { data, error } = await supabase.rpc("rank_list_public", {
    p_season: null,
    p_basis: basis,
    p_class_code: null,
    p_page: 1,
    p_page_size: 5
  });

  if (error || !data || data.length === 0) {
    renderHofPlaceholders("hof");
    return;
  }

  const cardImg = () => `<img src="assets/윈둥이.png" alt="rank">`; // 클래스별 매핑 필요 시 교체
  const first = data[0];
  const rest = data.slice(1);

  wrap.innerHTML = `
    <div class="card big">${cardImg(first)}</div>
    ${rest.map(cardImg).map(html => `<div class="card">${html}</div>`).join("")}
  `;
}

// 내 스탯/랭크/출석
async function renderMine() {
  // v_my_rank_current에 현재 시즌 사용자 1행이 나옴
  const { data: my, error } = await supabase
    .from("v_my_rank_current")
    .select("*")
    .maybeSingle();

  if (error) console.warn(error);

  setText("rank", my?.rank_total_by_battle_power ?? "-");
  setText("levelLabel", my?.level ?? "-");
  setText("bpLabel", my?.battle_power ?? "-");

  // 입력값 프리필
  document.getElementById("level").value      = my?.level        ?? 0;
  document.getElementById("attack").value     = my?.attack       ?? 0;
  document.getElementById("defence").value    = my?.defence      ?? 0;
  document.getElementById("accuracy").value   = my?.accuracy     ?? 0;
  document.getElementById("memory_pct").value = my?.memory_pct   ?? 0;
  document.getElementById("subjugate").value  = my?.subjugate    ?? 0;

  // 출석 문구 (요구사항: 줄바꿈 + 'n회 출석 중입니다')
  const n = my?.attendance_count ?? 0; // 뷰/함수에서 제공하지 않으면 0
  document.getElementById("attendLine").textContent =
    `이번 시즌 스탠더님은...\n${n}회 출석 중입니다.`;
}

// 저장
async function saveStats() {
  document.getElementById("saveResult").textContent = "저장 중...";

  const payload = {
    p_level: toInt(document.getElementById("level").value),
    p_attack: toInt(document.getElementById("attack").value),
    p_defence: toInt(document.getElementById("defence").value),
    p_accuracy: toInt(document.getElementById("accuracy").value),
    p_memory_pct: toNum(document.getElementById("memory_pct").value),
    p_subjugate: toInt(document.getElementById("subjugate").value)
  };

  // self_upsert_stats(...) 서명은 번들 기준 값에 맞춤.
  const { data, error } = await supabase.rpc("self_upsert_stats", payload);

  if (error) {
    // 저장 실패 시 원인 노출 (승인 전 RLS, 함수 파라미터 오류 등)
    document.getElementById("saveResult").textContent =
      `실패: ${error.message || "알 수 없는 오류"}`;
    console.error(error);
    return;
  }

  document.getElementById("saveResult").textContent = "저장 완료!";
  await renderMine();
  await renderTop5("battle_power");
}

// 이벤트 바인딩
function bindEvents() {
  // 로그인
  document.getElementById("loginBtn").addEventListener("click", async () => {
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return alert(error.message);
  });

  // 회원가입(이메일/비번)
  document.getElementById("signupBtn").addEventListener("click", async () => {
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) alert(error.message);
    else alert("가입 요청 완료. 메일 인증 후 관리자 승인을 기다려주세요.");
  });

  // 로그아웃
  document.getElementById("logoutBtn").addEventListener("click", async () => {
    await supabase.auth.signOut();
  });

  // 저장
  document.getElementById("saveStats").addEventListener("click", saveStats);

  // 탭(명예의 전당 기준 변경)
  document.getElementById("tabScore").addEventListener("click", async () => {
    document.getElementById("tabScore").classList.add("on");
    document.getElementById("tabTotal").classList.remove("on");
    await renderTop5("battle_power");
  });
  document.getElementById("tabTotal").addEventListener("click", async () => {
    document.getElementById("tabTotal").classList.add("on");
    document.getElementById("tabScore").classList.remove("on");
    await renderTop5("total_score");
  });

  // 세션 변경 감지(로그인/아웃/토큰갱신)
  supabase.auth.onAuthStateChange((_event, _session) => {
    reflectSession();
  });
}

// 부트
bindEvents();
reflectSession();
