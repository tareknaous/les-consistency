(() => {
  "use strict";

  const STORE_PREFIX = "turing:v3:";
  const URL_LIST = new URLSearchParams(location.search).get("list");
  const SYNC_URL = (window.SYNC_URL || "").trim();
  const $ = (id) => document.getElementById(id);

  let items = [];
  let NSIM = 1;            // simulators per context (rotation size)          // from data.json
  let byId = {};
  let user = null;
  let state = null;        // { order: [ids], answers: {id: {...}}, pos: int }
  let shownAt = 0;

  // ---------- storage ----------
  function storeKey(u) { return STORE_PREFIX + u; }
  function loadLocal(u) {
    try { return JSON.parse(localStorage.getItem(storeKey(u)) || "null"); } catch (e) { return null; }
  }
  function saveLocal() {
    try { localStorage.setItem(storeKey(user), JSON.stringify(state)); } catch (e) { /* private mode */ }
  }

  // Seeded shuffle so every annotator gets their own, stable item order.
  function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function shuffled(ids, seed) {
    let a = seed || 1;
    const rand = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const out = ids.slice();
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
  }

  // ---------- central sync (optional) ----------
  function setSync(text, cls) { const el = $("sync-status"); el.textContent = text; el.className = "sync " + (cls || ""); }

  async function pullRemote() {
    if (!SYNC_URL) { setSync("saved in this browser"); return; }
    setSync("loading…");
    try {
      const res = await fetch(SYNC_URL + "?user=" + encodeURIComponent(user));
      const data = await res.json();
      for (const row of data.rows || []) {
        const mine = state.answers[row.item_id];
        if (!mine || (row.updated_at || "") > (mine.updated_at || "")) {
          state.answers[row.item_id] = {
            choice: row.choice || undefined, confidence: row.confidence || undefined,
            cand: row.cand || undefined, list: row.list,
            note: row.note || "",
            step1_at: row.step1_at || undefined,
            step1_seconds: row.step1_seconds ? Number(row.step1_seconds) : undefined,
            updated_at: row.updated_at,
          };
        }
      }
      saveLocal();
      setSync("synced", "ok");
    } catch (e) {
      setSync("offline — saved in this browser", "err");
    }
  }

  async function pushRemote(id) {
    if (!SYNC_URL) { setSync("saved in this browser"); return; }
    setSync("saving…");
    try {
      // text/plain avoids a CORS preflight, which Apps Script does not answer.
      await fetch(SYNC_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ user, item_id: id, ...state.answers[id] }) });
      setSync("synced", "ok");
    } catch (e) {
      setSync("not synced — saved in this browser", "err");
    }
  }

  // ---------- rendering ----------
  function md(text) {
    const html = window.marked ? marked.parse(text, { breaks: true }) : text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    return window.DOMPurify ? DOMPurify.sanitize(html) : html;
  }
  function turnEl(t) {
    const d = document.createElement("div");
    d.className = "turn " + (t.role === "user" ? "user-turn" : "assistant-turn");
    const r = document.createElement("div"); r.className = "role"; r.textContent = t.role === "user" ? "User" : "Assistant";
    const c = document.createElement("div");
    if (t.role === "user") { c.className = "content plain"; c.textContent = t.content; }
    else { c.className = "content md"; c.innerHTML = md(t.content); }
    d.append(r, c);
    return d;
  }

  // Candidate keys shown as [A, B] for this annotator's list: the human ("h") and
  // the simulator assigned to this context in this list ("s" + (c + list) % NSIM).
  function sides(it) {
    const sim = "s" + ((it.c + state.list) % NSIM);
    return it.human_left[String(state.list)] ? ["h", sim] : [sim, "h"];
  }
  const isDone = (id) => !!(state.answers[id] && state.answers[id].step1_at);

  function updateProgress() {
    const n = state.order.filter(isDone).length;
    $("progress-bar").style.width = (100 * n / state.order.length) + "%";
    $("progress-text").textContent = n + " / " + state.order.length + " done";
    return n;
  }

  function setRadios(form, name, value) {
    for (const el of form.querySelectorAll(`input[name="${name}"]`)) el.checked = value !== undefined && String(el.value) === String(value);
  }
  function getRadio(form, name) {
    const el = form.querySelector(`input[name="${name}"]:checked`);
    return el ? el.value : undefined;
  }

  function render() {
    const id = state.order[state.pos];
    const it = byId[id];
    const ans = state.answers[id] || {};
    $("item-title").textContent = `Item ${state.pos + 1} of ${state.order.length}` + (isDone(id) ? "  ✓" : "");
    $("prev-btn").disabled = state.pos === 0;
    $("next-btn").disabled = state.pos === state.order.length - 1;

    const hist = it.history;
    const earlier = hist.slice(0, -2);
    $("earlier").classList.toggle("hidden", earlier.length === 0);
    $("earlier-turns").classList.add("hidden");
    $("earlier-turns").replaceChildren(...earlier.map(turnEl));
    $("earlier-btn").textContent = `Show earlier conversation (${earlier.length} messages)`;

    $("last-user").textContent = hist[hist.length - 2].content;
    $("last-assistant").innerHTML = md(hist[hist.length - 1].content);
    const [a, b] = sides(it);
    $("cand-a").textContent = it.cands[a];
    $("cand-b").textContent = it.cands[b];

    const s1 = $("step1");
    $("step1-msg").textContent = "";
    setRadios(s1, "choice", ans.choice);
    const allDone = updateProgress() === state.order.length;
    $("all-done").classList.toggle("hidden", !allDone);
    if (allDone) $("done-text").textContent = SYNC_URL
      ? "Your answers have been saved. You can also download a copy below."
      : "Please download your answers and send the file to the study organiser.";
    shownAt = Date.now();
    state.lastPos = state.pos; saveLocal();
    window.scrollTo({ top: 0 });
  }

  function go(pos) { state.pos = Math.max(0, Math.min(state.order.length - 1, pos)); render(); }
  function nextUnfinished() {
    const n = state.order.length;
    for (let k = 1; k <= n; k++) { const p = (state.pos + k) % n; if (!isDone(state.order[p])) return go(p); }
    render();
  }

  // ---------- events ----------
  async function login() {
    const u = $("username").value.trim().toLowerCase().replace(/\s+/g, "_");
    if (!/^[a-z0-9_.-]{2,40}$/.test(u)) { $("login-msg").textContent = "Use 2–40 letters, numbers, dots, dashes or underscores."; return; }
    user = u;
    try { localStorage.setItem(STORE_PREFIX + "last", u); } catch (e) {}
    state = loadLocal(u) || { order: shuffled(items.map((x) => x.id), hash(u)), answers: {}, pos: 0 };
    if (state.list === undefined) state.list = (URL_LIST !== null && /^[0-9]$/.test(URL_LIST)) ? Number(URL_LIST) % NSIM : hash(u) % NSIM;
    // Items added later (should not happen) go to the end of the order.
    for (const x of items) if (!state.order.includes(x.id)) state.order.push(x.id);
    state.order = state.order.filter((id) => byId[id]);
    $("who-name").textContent = u;
    $("login").classList.add("hidden");
    $("app").classList.remove("hidden");
    await pullRemote();
    const firstOpen = state.order.findIndex((id) => !isDone(id));
    state.pos = firstOpen === -1 ? (state.lastPos || 0) : firstOpen;
    render();
    if (!Object.keys(state.answers).length) $("guide").showModal();
  }

  function stamp() { return new Date().toISOString(); }

  $("step1").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target;
    const v = { choice: getRadio(f, "choice") };
    if (!v.choice) { $("step1-msg").textContent = "Please choose Message A or Message B."; return; }
    const id = state.order[state.pos];
    const [a, b] = sides(byId[id]);
    v.cand = v.choice === "A" ? a : b; v.list = state.list;
    state.answers[id] = { ...(state.answers[id] || {}), ...v,
      step1_at: stamp(), step1_seconds: Math.round((Date.now() - shownAt) / 1000), updated_at: stamp() };
    saveLocal(); pushRemote(id); nextUnfinished();
  });

  function exportAnswers() {
    const blob = new Blob([JSON.stringify({ username: user, list: state.list, exported_at: stamp(), answers: state.answers }, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `turing_${user}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  $("login-btn").addEventListener("click", login);
  $("username").addEventListener("keydown", (e) => { if (e.key === "Enter") login(); });
  $("logout-btn").addEventListener("click", () => { $("app").classList.add("hidden"); $("login").classList.remove("hidden"); $("username").value = ""; user = null; state = null; });
  $("prev-btn").addEventListener("click", () => go(state.pos - 1));
  $("next-btn").addEventListener("click", () => go(state.pos + 1));
  $("jump-btn").addEventListener("click", nextUnfinished);
  $("earlier-btn").addEventListener("click", () => {
    const el = $("earlier-turns"); el.classList.toggle("hidden");
    $("earlier-btn").textContent = (el.classList.contains("hidden") ? "Show" : "Hide") + ` earlier conversation (${el.children.length} messages)`;
  });
  $("guide-btn").addEventListener("click", () => $("guide").showModal());
  $("guide-close").addEventListener("click", () => $("guide").close());
  $("export-btn").addEventListener("click", exportAnswers);
  $("export-btn-2").addEventListener("click", exportAnswers);

  fetch("data.json?v=3").then((r) => r.json()).then((data) => {
    items = data; NSIM = Object.keys(items[0].cands).filter((k) => k[0] === "s").length; byId = Object.fromEntries(items.map((x) => [x.id, x]));
    try { const last = localStorage.getItem(STORE_PREFIX + "last"); if (last) $("username").value = last; } catch (e) {}
  }).catch(() => { $("login-msg").textContent = "Could not load the items. Please open this page through its web address, not as a local file."; $("login-btn").disabled = true; });
})();
