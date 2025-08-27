// ---------- Supabase Client ----------
const supabase = window.supabase.createClient(window.__SB_URL__, window.__SB_ANON__, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

// ---------- Helpers ----------
const $ = (s) => document.querySelector(s);
const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v ?? "-"; };
const toInt = (v) => (v === "" || v === null || v === undefined) ? 0 : parseInt(v, 10);
const toNum = (v) => (v === "" || v === null || v === undefined) ? 0 : Number(v);
const escapeHTML = (s)=>String(s??"").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// 상태
let hofBasis = "bp";
let CURRENT_SEASON = null;

// ---------- Auth Flow ----------
supabase.auth.onAuthStateChange((_evt, _session) => reflect());
reflect();

async function reflect() {
  try {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      // 비로그인 UI
      $("#authSignedOut").style.display = "flex";
      $("#authSignedIn").style.display  = "none";
      $("#guestPanel").style.display    = "flex";
      $("#mePanel").style.display       = "none";
      renderHofPlaceholders("hof");
      return;
    }

    // 로그인 UI
    $("#authSignedOut").style.display = "none";
    $("#authSignedIn").style.display  = "flex";
    $("#guestPanel").style.display    = "none";
    $("#mePanel").style.display       = "block";
    $("#whoami").textContent          = session.user.email;

    // 프로필 보장 (오류 무시)
    try { await supabase.rpc("ensure_profile"); } catch (_) {}

    // 관리자 링크 노출 로직
    let isAdmin = false;
    try {
      const { data: me, error } = await supabase
        .from("profiles")
        .select("is_admin,nickname,class_code")
        .eq("user_id", session.user.id)
        .single();
      if (error) throw error;
      isAdmin = !!me?.is_admin;
    } catch (e) {
      // RLS 등으로 실패 시 관리자 전용 RPC를 호출해 권한 체크
      try {
        const { error: adminErr } = await supabase.rpc("admin_list_pending");
        if (!adminErr) isAdmin = true;
      } catch {}
    }
    document.getElementById("adminLink").style.display = isAdmin ? "inline-block" : "none";

    await renderMine();         // 이 안에서 CURRENT_SEASON을 셋업
    await renderTop5(hofBasis);
  } catch (e) {
    console.error("reflect() failed:", e);
  }
}

// ---------- HOF ----------
function renderHofPlaceholders(targetId) {
  const wrap = document.getElementById(targetId);
  wrap.innerHTML = `
    <div class="hof-card first"><img src="assets/윈둥자.png" alt=""><div class="name">-</div></div>
    <div class="hof-card second"><img src="assets/윈둥자.png" alt=""><div class="name">-</div></div>
    <div class="hof-card third"><img src="assets/윈둥자.png" alt=""><div class="name">-</div></div>
    <div class="hof-card fourth"><img src="assets/윈둥자.png" alt=""><div class="name">-</div></div>
    <div class="hof-card fifth"><img src="assets/윈둥자.png" alt=""><div class="name">-</div></div>
  `;
}

async function renderTop5(basis = "bp") {
  hofBasis = basis;
  const wrap = document.getElementById("hof");
  try {
    const { data, error } = await supabase.rpc("rank_list_public", {
      p_season: null,
      p_basis: basis,        // 'bp' | 'total'
      p_class_code: null,
      p_page: 1,
      p_page_size: 5
    });
    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];

    const draw = (slot, row) => `
      <div class="hof-card ${slot}">
        <img src="assets/윈둥이.png" alt="">
        <div class="name">${escapeHTML(row?.nickname ?? "-")}</div>
      </div>`;

    wrap.innerHTML = [
      draw("first",  rows[0]),
      draw("second", rows[1]),
      draw("third",  rows[2]),
      draw("fourth", rows[3]),
      draw("fifth",  rows[4])
    ].join("");
  } catch (e) {
    console.error("renderTop5 failed:", e);
    renderHofPlaceholders("hof");
  }
}

// ---------- My Stats ----------
async function renderMine() {
  try {
    const { data: my, error } = await supabase.from("v_my_rank_current").select("*").maybeSingle();
    if (error) throw error;

    CURRENT_SEASON = my?.season ?? CURRENT_SEASON;

    setText("rank",        my?.rank_total_by_battle_power ?? "-");
    setText("levelLabel",  my?.level ?? "-");
    setText("bpLabel",     my?.battle_power ?? "-");

    document.getElementById("level").value      = my?.level ?? 0;
    document.getElementById("attack").value     = my?.attack ?? 0;
    document.getElementById("defence").value    = my?.defence ?? 0;
    document.getElementById("accuracy").value   = my?.accuracy ?? 0;
    document.getElementById("memory_pct").value = my?.memory_pct ?? 0;
    document.getElementById("subjugate").value  = my?.subjugate ?? 0;

    const n = my?.attend ?? 0;
    document.getElementById("attendLine").textContent = `이번 시즌 스탠더님은...\n${n}회 출석 중입니다.`;
  } catch (e) {
    console.error("renderMine failed:", e);
  }
}

async function ensureSeason() {
  if (CURRENT_SEASON) return CURRENT_SEASON;
  try {
    const { data } = await supabase.from("v_my_rank_current").select("season").maybeSingle();
    CURRENT_SEASON = data?.season ?? null;
  } catch {}
  return CURRENT_SEASON;
}

async function saveStats() {
  const result = $("#saveResult");
  result.textContent = "저장 중...";

  try {
    const season = await ensureSeason(); // ← 반드시 시즌 값을 채워서 전달
    const payload = {
      p_season:     season, // null이면 일부 스키마에서 오류 → 최대한 채워 넣음
      p_level:      toInt(document.getElementById("level").value),
      p_attack:     toInt(document.getElementById("attack").value),
      p_defence:    toInt(document.getElementById("defence").value),
      p_accuracy:   toInt(document.getElementById("accuracy").value),
      p_memory_pct: toNum(document.getElementById("memory_pct").value),
      p_subjugate:  toInt(document.getElementById("subjugate").value),
      p_attend:     null  // 일반 유저는 무시됨
    };

    const { error } = await supabase.rpc("self_upsert_stats", payload);
    if (error) throw error;

    result.textContent = "저장 완료!";
  } catch (e) {
    console.error("saveStats failed:", e);
    result.textContent = "실패: " + (e?.message ?? e);
  } finally {
    await renderMine();
    await renderTop5(hofBasis);
  }
}

// ---------- First Join (Sign-up) ----------
const dlg = document.getElementById("firstJoinModal");

function openFirstJoin() {
  document.getElementById("firstJoinMsg").textContent = "";
  try { dlg.showModal(); } catch { dlg.show(); }
  loadClassCodes();
}

async function loadClassCodes() {
  const sel = document.getElementById("firstJoinClass");
  if (sel.dataset.loaded === "1") return;
  try {
    const { data, error } = await supabase
      .from("class_codes").select("code,label").eq("is_active", true).order("label");
    if (error) throw error;
    (data || []).forEach(r => {
      const opt = document.createElement("option");
      opt.value = r.code; opt.textContent = r.label || r.code;
      sel.appendChild(opt);
    });
    sel.dataset.loaded = "1";
  } catch (e) {
    console.error("loadClassCodes failed:", e);
  }
}

async function submitFirstJoin() {
  const email = document.getElementById("firstJoinEmail").value.trim();
  const pw1   = document.getElementById("firstJoinPassword").value;
  const pw2   = document.getElementById("firstJoinPassword2").value;
  const nickname = document.getElementById("firstJoinNickname").value.trim();
  const classCode = document.getElementById("firstJoinClass").value;
  const msg = document.getElementById("firstJoinMsg");

  if (!email || !pw1 || !pw2 || !nickname || !classCode) { msg.textContent = "모든 항목을 입력해 주세요."; return; }
  if (pw1 !== pw2) { msg.textContent = "비밀번호가 일치하지 않습니다."; return; }

  msg.textContent = "요청 중...";
  try {
    const { error } = await supabase.auth.signUp({ email, password: pw1 });
    if (error) throw error;
    localStorage.setItem("tw_firstjoin", JSON.stringify({ nickname, class_code: classCode }));
    msg.textContent = "가입 요청 완료. 메일 인증 후 운영진 승인을 기다려주세요.";
  } catch (e) {
    msg.textContent = (e && e.message) ? e.message : String(e);
  }
}

// ---------- Events ----------
document.getElementById("loginBtn").addEventListener("click", async () => {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  } catch (e) {
    const msg = (e && e.message) ? e.message : String(e);
    if (msg === "Failed to fetch") {
      alert([
        "로그인 요청이 차단되었습니다.",
        "Supabase Auth 설정 확인:",
        "- Allowed CORS Origins: https://luka-lloris.github.io, https://luka-lloris.github.io/<repo>",
        "- Additional Redirect URLs / Logout URLs 동일하게 추가",
        "- __SB_URL__/__SB_ANON__ 값 확인"
      ].join("\n"));
    } else { alert(msg); }
  }
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  try { await supabase.auth.signOut(); } catch (e) { console.error(e); }
  // 일부 환경에서 onAuthStateChange가 지연/유실되는 문제 대비
  await reflect();
});

document.getElementById("firstJoinBtn").addEventListener("click", openFirstJoin);
document.getElementById("firstJoinClose").addEventListener("click", () => dlg.close());
document.getElementById("firstJoinSubmit").addEventListener("click", submitFirstJoin);

document.getElementById("saveStats").addEventListener("click", saveStats);

document.getElementById("kakaoBtn").addEventListener("click", () => {
  alert("카카오 로그인은 준비 중입니다.");
});

document.getElementById("tabScore").addEventListener("click", async () => {
  document.getElementById("tabScore").classList.add("on");
  document.getElementById("tabTotal").classList.remove("on");
  await renderTop5("bp");
});
document.getElementById("tabTotal").addEventListener("click", async () => {
  document.getElementById("tabTotal").classList.add("on");
  document.getElementById("tabScore").classList.remove("on");
  await renderTop5("total");
});
