// Supabase
const supabase = window.supabase.createClient(window.__SB_URL__, window.__SB_ANON__);
const $ = (s) => document.querySelector(s);
const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v ?? "-"; };
const toInt = (v) => (v === "" || v === null || v === undefined) ? 0 : parseInt(v, 10);
const toNum = (v) => (v === "" || v === null || v === undefined) ? 0 : Number(v);

// 진입 & 세션 반영
supabase.auth.onAuthStateChange(() => reflect());
reflect();

async function reflect() {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    // 비로그인
    $("#authSignedOut").style.display = "flex";
    $("#authSignedIn").style.display = "none";
    $("#guestPanel").style.display = "flex";
    $("#mePanel").style.display = "none";
    renderHofPlaceholders("hof");
    return;
  }

  // 로그인
  $("#authSignedOut").style.display = "none";
  $("#authSignedIn").style.display = "flex";
  $("#guestPanel").style.display = "none";
  $("#mePanel").style.display = "block";
  $("#whoami").textContent = session.user.email;

  // 프로필 보장
  await supabase.rpc("ensure_profile").catch(()=>{});

  // 관리자 노출
  const { data: me } = await supabase
    .from("profiles")
    .select("is_admin,nickname,class_code")
    .eq("user_id", session.user.id)
    .single();
  document.getElementById("adminLink").style.display = (me?.is_admin) ? "inline-block" : "none";

  // 최초가입 데이터 자동 반영 (닉/클래스)
  try {
    const pending = JSON.parse(localStorage.getItem("tw_firstjoin") || "null");
    if (pending && (!me?.nickname || !me?.class_code)) {
      const upd = {};
      if (!me?.nickname && pending.nickname) upd.nickname = pending.nickname;
      if (!me?.class_code && pending.class_code) upd.class_code = pending.class_code;
      if (Object.keys(upd).length) await supabase.from("profiles").update(upd).eq("user_id", session.user.id);
      localStorage.removeItem("tw_firstjoin");
    }
  } catch (_) {}

  await renderMine();
  await renderTop5("bp");
}

/* =========================
   Hall of Fame
   ========================= */
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
  const wrap = document.getElementById("hof");
  const { data, error } = await supabase.rpc("rank_list_public", {
    p_season: null,         // current
    p_basis: basis,         // 'bp' | 'total'
    p_class_code: null,
    p_page: 1, p_page_size: 5
  });

  if (error || !data || data.length === 0) { renderHofPlaceholders("hof"); return; }

  const draw = (slot, row) => `
    <div class="hof-card ${slot}">
      <img src="assets/윈둥이.png" alt="">
      <div class="name">${escapeHTML(row?.nickname ?? "-")}</div>
    </div>`;

  wrap.innerHTML = [
    draw("first",  data[0]),
    draw("second", data[1]),
    draw("third",  data[2]),
    draw("fourth", data[3]),
    draw("fifth",  data[4])
  ].join("");
}

/* =========================
   My Stats
   ========================= */
async function renderMine() {
  const { data: my } = await supabase.from("v_my_rank_current").select("*").maybeSingle();

  setText("rank", my?.rank_total_by_battle_power ?? "-");
  setText("levelLabel", my?.level ?? "-");
  setText("bpLabel", my?.battle_power ?? "-");

  document.getElementById("level").value      = my?.level ?? 0;
  document.getElementById("attack").value     = my?.attack ?? 0;
  document.getElementById("defence").value    = my?.defence ?? 0;
  document.getElementById("accuracy").value   = my?.accuracy ?? 0;
  document.getElementById("memory_pct").value = my?.memory_pct ?? 0;
  document.getElementById("subjugate").value  = my?.subjugate ?? 0;

  const n = my?.attend ?? 0;
  document.getElementById("attendLine").textContent = `이번 시즌 스탠더님은...\n${n}회 출석 중입니다.`;
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
  if (error) { $("#saveResult").textContent = `실패: ${error.message}`; console.error(error); return; }
  $("#saveResult").textContent = "저장 완료!";
  await renderMine(); await renderTop5("bp");
}

/* =========================
   First Join (Sign up)
   ========================= */
const dlg = document.getElementById("firstJoinModal");

function openFirstJoin() {
  document.getElementById("firstJoinMsg").textContent = "";
  dlg.showModal();
  loadClassCodes();
}

async function loadClassCodes() {
  const sel = document.getElementById("firstJoinClass");
  if (sel.dataset.loaded === "1") return;
  const { data, error } = await supabase
    .from("class_codes")
    .select("code,label")
    .eq("is_active", true)
    .order("label");
  if (!error && Array.isArray(data)) {
    data.forEach(r => {
      const opt = document.createElement("option");
      opt.value = r.code; opt.textContent = r.label || r.code;
      sel.appendChild(opt);
    });
    sel.dataset.loaded = "1";
  }
}

async function submitFirstJoin() {
  const email = document.getElementById("firstJoinEmail").value.trim();
  const pw1   = document.getElementById("firstJoinPassword").value;
  const pw2   = document.getElementById("firstJoinPassword2").value;
  const nickname = document.getElementById("firstJoinNickname").value.trim();
  const classCode = document.getElementById("firstJoinClass").value;

  if (!email || !pw1 || !pw2 || !nickname || !classCode) {
    document.getElementById("firstJoinMsg").textContent = "모든 항목을 입력해 주세요.";
    return;
  }
  if (pw1 !== pw2) {
    document.getElementById("firstJoinMsg").textContent = "비밀번호가 일치하지 않습니다.";
    return;
  }

  document.getElementById("firstJoinMsg").textContent = "요청 중...";
  const { error } = await supabase.auth.signUp({ email, password: pw1 });
  if (error) { document.getElementById("firstJoinMsg").textContent = `실패: ${error.message}`; return; }

  // 로그인 후 자동 반영
  localStorage.setItem("tw_firstjoin", JSON.stringify({ nickname, class_code: classCode }));
  document.getElementById("firstJoinMsg").textContent = "가입 요청 완료. 메일 인증 후 운영진 승인을 기다려주세요.";
}

/* =========================
   Events
   ========================= */
document.getElementById("loginBtn").addEventListener("click", async () => {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) alert(error.message);
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await supabase.auth.signOut();
});

document.getElementById("firstJoinBtn").addEventListener("click", openFirstJoin);
document.getElementById("firstJoinClose").addEventListener("click", () => dlg.close());
document.getElementById("firstJoinSubmit").addEventListener("click", submitFirstJoin);

document.getElementById("saveStats").addEventListener("click", saveStats);

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

/* util */
function escapeHTML(s){return String(s??"").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
