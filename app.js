// ─────────────────────────────────────────────────────────────
// Supabase
// ─────────────────────────────────────────────────────────────
const supabase = window.supabase.createClient(window.__SB_URL__, window.__SB_ANON__);
const $ = (s) => document.querySelector(s);
const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v ?? "-"; };
const toInt = (v) => (v === "" || v === null || v === undefined) ? 0 : parseInt(v, 10);
const toNum = (v) => (v === "" || v === null || v === undefined) ? 0 : Number(v);

// ─────────────────────────────────────────────────────────────
// Auth 상태 반영
// ─────────────────────────────────────────────────────────────
async function reflectSession() {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    $("#authSignedOut").style.display = "flex";
    $("#authSignedIn").style.display = "none";
    $("#authedBoard").style.display = "none";
    $("#guestBoard").style.display = "grid";
    renderHofPlaceholders("hofGuest");
    return;
  }

  $("#authSignedOut").style.display = "none";
  $("#authSignedIn").style.display = "flex";
  $("#guestBoard").style.display = "none";
  $("#authedBoard").style.display = "grid";
  $("#whoami").textContent = session.user.email;

  await supabase.rpc("ensure_profile").catch(()=>{});

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin, approved")
    .eq("user_id", session.user.id)
    .single();

  document.getElementById("adminLink").style.display = (profile?.is_admin) ? "inline-block" : "none";

  await renderMine();
  await renderTop5("bp");
}

// ─────────────────────────────────────────────────────────────
// HOF
// ─────────────────────────────────────────────────────────────
function renderHofPlaceholders(targetId) {
  const wrap = document.getElementById(targetId);
  const ph = () => `<div class="card"><img src="assets/윈둥자.png" alt="placeholder"></div>`;
  wrap.innerHTML = `
    <div class="card big"><img src="assets/윈둥자.png" alt="placeholder"></div>
    ${ph()}${ph()}${ph()}${ph()}
  `;
}

async function renderTop5(basis = "bp") {
  const wrap = document.getElementById("hof");
  if (!wrap) return;

  const { data, error } = await supabase.rpc("rank_list_public", {
    p_season: null,      // current
    p_basis: basis,      // 'bp' | 'total'
    p_class_code: null,
    p_page: 1,
    p_page_size: 5
  });

  if (error || !data || data.length === 0) {
    renderHofPlaceholders("hof");
    return;
  }

  const cardImg = () => `<img src="assets/윈둥이.png" alt="rank">`;
  const first = data[0];
  const rest = data.slice(1);

  wrap.innerHTML = `
    <div class="card big">${cardImg(first)}</div>
    ${rest.map(cardImg).map(html => `<div class="card">${html}</div>`).join("")}
  `;
}

// ─────────────────────────────────────────────────────────────
// 내 스탯/랭크/출석
// ─────────────────────────────────────────────────────────────
async function renderMine() {
  const { data: my } = await supabase
    .from("v_my_rank_current")
    .select("*")
    .maybeSingle();

  setText("rank", my?.rank_total_by_battle_power ?? "-");
  setText("levelLabel", my?.level ?? "-");
  setText("bpLabel", my?.battle_power ?? "-");

  document.getElementById("level").value      = my?.level        ?? 0;
  document.getElementById("attack").value     = my?.attack       ?? 0;
  document.getElementById("defence").value    = my?.defence      ?? 0;
  document.getElementById("accuracy").value   = my?.accuracy     ?? 0;
  document.getElementById("memory_pct").value = my?.memory_pct   ?? 0;
  document.getElementById("subjugate").value  = my?.subjugate    ?? 0;

  const n = my?.attend ?? 0;
  document.getElementById("attendLine").textContent =
    `이번 시즌 스탠더님은...\n${n}회 출석 중입니다.`;
}

async function saveStats() {
  $("#saveResult").textContent = "저장 중...";

  const payload = {
    p_season: null,
    p_level: toInt(document.getElementById("level").value),
    p_attack: toInt(document.getElementById("attack").value),
    p_defence: toInt(document.getElementById("defence").value),
    p_accuracy: toInt(document.getElementById("accuracy").value),
    p_memory_pct: toNum(document.getElementById("memory_pct").value),
    p_subjugate: toInt(document.getElementById("subjugate").value),
    p_attend: null
  };

  const { error } = await supabase.rpc("self_upsert_stats", payload);

  if (error) {
    $("#saveResult").textContent = `실패: ${error.message}`;
    console.error(error);
    return;
  }

  $("#saveResult").textContent = "저장 완료!";
  await renderMine();
  await renderTop5("bp");
}

// ─────────────────────────────────────────────────────────────
// 최초가입 모달
// ─────────────────────────────────────────────────────────────
function openFirstJoin() {
  $("#firstJoinModal").style.display = "block";
  $("#firstJoinMsg").textContent = "";
  // 클래스 목록 로드
  loadClassCodes();
}
function closeFirstJoin() {
  $("#firstJoinModal").style.display = "none";
}

async function loadClassCodes() {
  const sel = $("#firstJoinClass");
  if (!sel) return;
  // 한 번 채웠으면 다시 안 채움
  if (sel.dataset.loaded === "1") return;

  const { data, error } = await supabase
    .from("class_codes")
    .select("code,label")
    .eq("is_active", true)
    .order("label");

  if (!error && Array.isArray(data)) {
    for (const row of data) {
      const opt = document.createElement("option");
      opt.value = row.code;
      opt.textContent = row.label || row.code;
      sel.appendChild(opt);
    }
    sel.dataset.loaded = "1";
  }
}

async function submitFirstJoin() {
  const email = $("#firstJoinEmail").value.trim();
  const pw    = $("#firstJoinPassword").value;
  const nickname = $("#firstJoinNickname").value.trim();
  const classCode = $("#firstJoinClass").value || null;

  if (!email || !pw) {
    $("#firstJoinMsg").textContent = "이메일/비밀번호를 입력해 주세요.";
    return;
  }

  $("#firstJoinMsg").textContent = "요청 중...";

  // 1) supabase auth signUp
  const { error: sErr } = await supabase.auth.signUp({
    email, password: pw
    // (필요 시) options: { emailRedirectTo: location.origin }
  });
  if (sErr) {
    $("#firstJoinMsg").textContent = `실패: ${sErr.message}`;
    return;
  }

  // 2) 안내 문구 (메일 인증 후 관리자 승인)
  $("#firstJoinMsg").textContent = "가입 요청 완료. 메일 인증 후 운영진 승인을 기다려주세요.";
}

// ─────────────────────────────────────────────────────────────
// 이벤트 바인딩 & 부트
// ─────────────────────────────────────────────────────────────
function bindEvents() {
  // 로그인
  $("#loginBtn").addEventListener("click", async () => {
    const email = $("#email").value.trim();
    const password = $("#password").value;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
  });

  // 로그아웃
  $("#logoutBtn").addEventListener("click", async () => {
    await supabase.auth.signOut();
  });

  // 스탯 저장
  $("#saveStats").addEventListener("click", saveStats);

  // HOF 탭
  $("#tabScore").addEventListener("click", async () => {
    $("#tabScore").classList.add("on");
    $("#tabTotal").classList.remove("on");
    await renderTop5("bp");
  });
  $("#tabTotal").addEventListener("click", async () => {
    $("#tabTotal").classList.add("on");
    $("#tabScore").classList.remove("on");
    await renderTop5("total");
  });

  // 최초가입 모달
  $("#firstJoinBtn").addEventListener("click", openFirstJoin);
  $("#twModalClose").addEventListener("click", closeFirstJoin);
  $("#firstJoinModal").addEventListener("click", (e) => {
    if (e.target.id === "firstJoinModal") closeFirstJoin();
  });
  $("#firstJoinSubmit").addEventListener("click", submitFirstJoin);

  // 세션 변경 반영
  supabase.auth.onAuthStateChange(() => reflectSession());
}

bindEvents();
reflectSession();
