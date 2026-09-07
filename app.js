"use strict";

// ---------- State ----------
let TOKEN = localStorage.getItem("ug_token") || null;
let USER = null;
let COLLECTION = [];
let LINEUPS = null;      // initialized to full 5-key object on boot (see boot())
let CONFIG = null;
let currentTab = "NBA";
let sportActive = "NBA";     // for match picker

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const SPORT_ICON = { NBA: "🏀", NFL: "🏈", MLB: "⚾", NHL: "🏒", Soccer: "⚽" };
const RARITY_ORDER = ["Bronze", "Silver", "Gold", "Elite"];
// Fallback positions (used if /api/config hasn't loaded yet so the roster always renders)
const DEFAULT_POSITIONS = {
  NBA: ["Guard", "Forward", "Center"],
  NFL: ["Quarterback", "Wide Receiver", "Running Back"],
  MLB: ["Pitcher", "Catcher", "Outfielder"],
  NHL: ["Forward", "Defender", "Goalie"],
  Soccer: ["Forward", "Midfielder", "Goalkeeper"]
};
function posFor(sport) { return (CONFIG && CONFIG.positions && CONFIG.positions[sport]) || DEFAULT_POSITIONS[sport] || []; }

// ---------- API ----------
async function api(method, path, body) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(TOKEN ? { Authorization: "Bearer " + TOKEN } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (_) {
    throw new Error("Can't reach the server. Check your internet / preview URL.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed (" + res.status + ")");
  return data;
}

// ---------- Toasts ----------
let toastTimer;
function toast(msg, ms = 2400) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), ms);
}

// ---------- Card renderer ----------
// Sport-specific vector "player face" silhouettes (drawn with currentColor so they pick up
// the card's rarity accent). Act as each athlete's portrait in the card image container.
const SPORT_FACE = {
  NBA: `<svg viewBox="0 0 100 100" class="face-svg"><g fill="currentColor"><circle cx="50" cy="35" r="11"/><path d="M34 46 a16 16 0 0 1 32 0 v50 H34 Z"/><path d="M37 38 L22 33 L12 40 L26 50 Z"/><path d="M63 38 L78 33 L88 40 L74 50 Z"/></g><circle cx="50" cy="15" r="13" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M50 3 a17 17 0 0 1 0 24 M50 3 a17 17 0 0 0 0 24 M42 12 h16 M44 20 h12" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
  NFL: `<svg viewBox="0 0 100 100" class="face-svg"><g fill="currentColor"><path d="M40 19 a10 10 0 0 1 20 0 l6 26 H34 Z"/><circle cx="50" cy="16" r="10"/><path d="M33 48 a17 17 0 0 1 34 0 v48 H33 Z"/></g><ellipse cx="74" cy="58" rx="11" ry="6" transform="rotate(-18 74 58)" fill="currentColor"/><path d="M56 70 h26 l2 8 h-26 Z" fill="currentColor"/><circle cx="64" cy="42" r="3" fill="currentColor"/></svg>`,
  MLB: `<svg viewBox="0 0 100 100" class="face-svg"><g fill="currentColor"><circle cx="50" cy="30" r="12"/><path d="M30 30 h40 l6 8 h-48 Z"/><path d="M33 46 a17 17 0 0 1 34 0 v48 H33 Z"/></g><path d="M60 42 L92 22 L98 30 L66 52 Z" fill="currentColor"/><circle cx="26" cy="24" r="5" fill="currentColor"/></svg>`,
  NHL: `<svg viewBox="0 0 100 100" class="face-svg"><g fill="currentColor"><path d="M40 19 a10 10 0 0 1 20 0 v12 H40 Z"/><circle cx="50" cy="16" r="10"/><path d="M33 46 a17 17 0 0 1 34 0 v50 H33 Z"/></g><path d="M38 62 h52 l-4 26 H42 Z" fill="currentColor"/><path d="M38 88 h-12 l4 -26 Z" fill="currentColor"/><ellipse cx="76" cy="88" rx="8" ry="3" fill="currentColor"/></svg>`,
  Soccer: `<svg viewBox="0 0 100 100" class="face-svg"><g fill="currentColor"><circle cx="50" cy="29" r="12"/><path d="M33 46 a17 17 0 0 1 34 0 l4 54 H29 Z"/><path d="M34 40 L16 56 l-6 2 Z"/></g><circle cx="72" cy="80" r="9" fill="currentColor"/><path d="M72 70 a15 15 0 0 1 0 20 M72 70 a15 15 0 0 0 0 20 M60 80 h24 M65 72 l14 14 M79 72 l-14 14" fill="none" stroke="#0b0e14" stroke-width="2"/></svg>`
};
function sportFace(sport) {
  return SPORT_FACE[sport] || SPORT_FACE.NBA;
}

function cardEl(c, { selectable = true, inline = false, small = false } = {}) {
  const cls = "card" + (inline ? " card-inline" : "") + (small ? " card-small" : "");
  const el = document.createElement("div");
  el.className = cls;
  el.dataset.rarity = c.rarity || "Silver";
  if (selectable) el.addEventListener("click", c._onclick || (() => {}));
  const ovr = c.rating ?? c.ovr;
  const evo = (c.ovr_bonus > 0) ? `<span class="evo-badge">+${c.ovr_bonus}</span>` : "";
  const copies = (c.copies > 1) ? `<span class="copy-badge">×${c.copies}</span>` : "";
  el.innerHTML = `
    <div class="card-face" data-sport="${escapeHtml(c.sport || "")}">${sportFace(c.sport)}</div>
    <div class="card-top">
      <div class="card-ovr">${ovr}${evo}${copies}</div>
      <div class="card-name">${escapeHtml(c.player_name)}</div>
      <div class="card-sub">${c.position}</div>
      <div class="card-tag">${c.rarity}</div>
    </div>`;
  return el;
}
function miniCardEl(c, side) {
  const el = document.createElement("div");
  el.className = "mini-card";
  el.innerHTML = `
    <div class="ovr" style="color:var(--rc)"></div>
    <div class="info"><div>${escapeHtml(c.player_name)}</div><div class="pos">${c.position}</div></div>`;
  const ovr = el.querySelector(".ovr");
  ovr.style.color = rarityColor(c.rarity);
  ovr.textContent = c.ovr;
  return el;
}
function rarityColor(r) {
  return { Bronze: "var(--bronze)", Silver: "var(--silver)", Gold: "var(--gold)", Elite: "var(--elite)" }[r] || "var(--silver)";
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

// ---------- State helpers ----------
function setUser(u) {
  USER = u;
  $("#coins-val").textContent = formatNum(u.game_coins);
  $("#streak-val").textContent = u.daily_streak;
  updateEnergy();
}
function updateEnergy() {
  const e = $("#energy-val");
  e.textContent = `${USER.energy}/${USER.energy_max || 5}`;
  $("#energy-fill").style.width = ((USER.energy / (USER.energy_max || 5)) * 100) + "%";
}
function formatNum(n) { return n.toLocaleString(); }

function lineupFor(sport) {
  return Object.values((LINEUPS && LINEUPS[sport]) || {});
}
function teamOVR(sport) {
  const arr = lineupFor(sport);
  return arr.length ? Math.round(arr.reduce((s, c) => s + c.ovr, 0) / arr.length) : 0;
}

// ---------- Views ----------
function showView(name) {
  $("#roster-view").classList.toggle("hidden", name !== "roster");
  $("#match-view").classList.toggle("hidden", name !== "match");
  $("#shop-view").classList.toggle("hidden", name !== "shop");
  $("#leaderboard-view").classList.toggle("hidden", name !== "leaderboard");
}
function setTab(tab) {
  currentTab = tab;
  $$(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  if (tab === "Match") { renderMatchPicker(); renderMatch(); showView("match"); }
  else if (tab === "Shop") { refreshFlash(); showView("shop"); }
  else if (tab === "Leaderboard") { refreshLeaderboard(); showView("leaderboard"); }
  else { showView("roster"); renderRoster(tab); }
}

// ---------- Daily Quests ----------
let QUESTS = null;
async function refreshQuests() {
  try {
    const r = await api("GET", "/api/quests");
    QUESTS = r;
    renderQuests(r);
  } catch (e) { /* non-fatal */ }
}
function renderQuests(r) {
  const list = $("#quest-list");
  list.innerHTML = "";
  (r.quests || []).forEach((q) => {
    const pct = Math.min(100, (q.progress / q.target) * 100);
    const row = document.createElement("div");
    row.className = "quest" + (q.done ? " done" : "") + (q.claimed ? " claimed" : "");
    row.innerHTML = `
      <div class="q-label">${escapeHtml(q.label)}</div>
      <div class="q-bar"><i style="width:${pct}%"></i></div>
      <div class="q-meta">${q.progress}/${q.target} · +${q.reward} ◈</div>
      <button class="btn btn-sm q-btn" ${q.done && !q.claimed ? "" : "disabled"}>${q.claimed ? "Claimed" : q.done ? "Claim" : "Locked"}</button>`;
    const btn = row.querySelector(".q-btn");
    if (q.done && !q.claimed) {
      btn.addEventListener("click", async () => {
        try {
          const res = await api("POST", "/api/quests/claim", { slot: q.slot });
          setUser(res.user);
          await refreshQuests();
          toast(`✓ Quest complete! +${q.reward} ◈`);
        } catch (e) { toast("✕ " + e.message); }
      });
    }
    list.appendChild(row);
  });
  const bonus = $("#quests-bonus-btn");
  bonus.disabled = !(r.allClaimed && !r.bonusClaimed);
  bonus.textContent = r.bonusClaimed ? "Bonus Claimed ✓" : "Bonus Quest Pack";
}

// ---------- Flash Shop ----------
let FLASH = null;
let flashTick = null;
async function refreshFlash() {
  try {
    const r = await api("GET", "/api/flash");
    FLASH = r;
    renderFlash();
  } catch (e) { /* non-fatal */ }
}
function renderFlash() {
  if (!FLASH) return;
  $("#flash-desc").innerHTML = `${FLASH.sport} <b>${FLASH.position}</b> Pack — <b>${Math.round(FLASH.discount * 100)}% OFF</b> (${formatNum(FLASH.regularPrice)} → <b>${formatNum(FLASH.price)} ◈</b>)`;
  const btn = $("#flash-buy-btn");
  btn.textContent = `BUY ${FLASH.sport} PACK — ${formatNum(FLASH.price)} ◈`;
  updateFlashTimer();
}
function updateFlashTimer() {
  const el = $("#flash-timer");
  if (!FLASH || !el) return;
  let s = Math.max(0, FLASH.secondsLeft || 0);
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  el.textContent = `${h}:${m}:${sec}`;
  FLASH.secondsLeft = s - 1;
  if (s <= 0) refreshFlash(); // refresh the offer when the window turns over
}

// ---------- Leaderboard ----------
async function refreshLeaderboard() {
  try {
    const r = await api("GET", "/api/leaderboard");
    renderLeaderboard(r);
  } catch (e) { /* non-fatal */ }
}
function renderLeaderboard(r) {
  const list = $("#lb-list");
  list.innerHTML = "";
  $("#lb-empty").classList.toggle("hidden", (r.list || []).length > 0);
  (r.list || []).forEach((u) => {
    const row = document.createElement("div");
    row.className = "lb-row" + (r.me && r.me.rank === u.rank ? " me" : "");
    const rankCls = u.rank === 1 ? " gold" : u.rank === 2 ? " silver" : u.rank === 3 ? " bronze" : "";
    const sports = Object.keys(u.sports || {}).map((s) => `<span>${SPORT_ICON[s] || s} ${u.sports[s]}</span>`).join("");
    row.innerHTML = `
      <div class="lb-rank${rankCls}">${u.rank}</div>
      <div>
        <div class="lb-name">${escapeHtml(u.username)}${r.me && r.me.rank === u.rank ? " <span class='lb-you'>you</span>" : ""}</div>
        <div class="lb-sports">${sports}</div>
      </div>
      <div class="lb-total">${formatNum(u.total)}</div>`;
    list.appendChild(row);
  });
}

// ---------- Evolve result toast ----------
function showEvolve(res) {
  if (!res) return;
  const el = $("#evo-toast");
  el.classList.remove("hidden");
  el.innerHTML = `
    <div class="reveal-tier">⬆ EVOLVED</div>
    <div class="card" data-rarity="${res.rarity}">
      <div class="card-face"></div>
      <div class="card-top">
        <div class="card-ovr">${res.new_ovr}</div>
        <div class="card-name">${escapeHtml(res.player_name)}</div>
        <div class="card-sub">+3 OVR fused</div>
        <div class="card-tag">${res.rarity}</div>
      </div>
    </div>
    <p class="sub">${res.old_ovr} → ${res.new_ovr} OVR</p>
    <button class="btn btn-ghost" onclick="document.getElementById('evo-toast').classList.add('hidden')">Dismiss</button>`;
}

// ---------- Roster ----------
function renderRoster(sportId) {
  $("#roster-title").textContent = `${SPORT_ICON[sportId]} ${sportId} — Active Roster`;
  const grid = $("#roster-grid");
  grid.innerHTML = "";
  const slots = posFor(sportId);
  slots.forEach((pos) => {
    const slot = document.createElement("div");
    slot.className = "slot";
    slot.innerHTML = `<div class="slot-label">${pos}</div>`;
    const active = ((LINEUPS || {})[sportId] || {})[pos];
    if (active) {
      const card = cardEl(active, { small: true });
      slot.appendChild(card);
    } else {
      const empty = document.createElement("div");
      empty.className = "slot-empty";
      empty.textContent = "Empty slot — tap to assign";
      slot.appendChild(empty);
    }
    slot.addEventListener("click", () => openSwap(sportId, pos));
    grid.appendChild(slot);
  });
  $("#team-ovr").textContent = teamOVR(sportId);
}

// ---------- Swap drawer ----------
let swapContext = null;
function openSwap(sportId, position) {
  swapContext = { sport: sportId, position };
  $("#swap-title").textContent = `${sportId} — ${position}`;
  $("#swap-sub").textContent = "Tap a card to set it active in this slot.";
  const grid = $("#swap-grid");
  grid.innerHTML = "";
  const candidates = COLLECTION.filter((c) => c.sport === sportId && c.position === position)
    .sort((a, b) => (b.rating ?? b.ovr) - (a.rating ?? a.ovr));
  $("#swap-empty").classList.toggle("hidden", candidates.length > 0);
  candidates.forEach((c) => {
    const wrap = document.createElement("div");
    wrap.className = "swap-item";
    const el = cardEl(c);
    el.addEventListener("click", async () => {
      try {
        const r = await api("POST", "/api/lineups/set", { sport: sportId, position, userCardId: c.instance_id });
        LINEUPS = indexLineups(r.lineups);
        renderRoster(sportId);
        if (currentTab === "Match") renderMatch();
        closeSwap();
        toast(`✓ ${c.player_name} is now your ${position}`);
      } catch (e) { toast("✕ " + e.message); }
    });
    wrap.appendChild(el);
    if (c.can_evolve) {
      const evoBtn = document.createElement("button");
      evoBtn.className = "btn btn-sm evo-btn";
      evoBtn.textContent = `⬆ Evolve +3 (×${c.copies})`;
      evoBtn.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        try {
          const r = await api("POST", "/api/cards/evolve", { cardId: c.card_id });
          COLLECTION = r.collection;
          LINEUPS = indexLineups(r.lineups);
          renderRoster(sportId);
          if (currentTab === "Match") renderMatch();
          openSwap(sportId, position); // re-render drawer
          refreshLeaderboard();
          showEvolveResult(r.result);
        } catch (e) { toast("✕ " + e.message); }
      });
      wrap.appendChild(evo);
    }
    grid.appendChild(wrap);
  });
  $("#swap-drawer").classList.remove("hidden");
}
function closeSwap() { $("#swap-drawer").classList.add("hidden"); }

// Build a lineup map that always contains every sport key (NBA/NFL/MLB/NHL/Soccer),
// each pointing to an object of filled slots (or {}). Accepts the server's `rosters`
// object (all keys present) OR the older flat `lineups` array.
function normalizeRosters(rosters) {
  const map = {};
  for (const s of Object.keys(DEFAULT_POSITIONS)) map[s] = {};
  if (Array.isArray(rosters)) {
    for (const l of rosters) {
      map[l.sport] = map[l.sport] || {};
      map[l.sport][l.position] = l;
    }
    return map;
  }
  if (rosters && typeof rosters === "object") {
    for (const s of Object.keys(rosters)) {
      map[s] = map[s] || {};
      const slots = rosters[s] || {};
      for (const p of Object.keys(slots)) map[s][p] = slots[p];
    }
  }
  return map;
}
function indexLineups(arr) { return normalizeRosters(arr); }

// ---------- Match ----------
function renderMatchPicker() {
  const picker = $("#match-sport-picker");
  picker.innerHTML = "";
  Object.keys(window.POSITIONS || DEFAULT_POSITIONS).forEach((s) => {
    const b = document.createElement("button");
    b.className = "sport-chip" + (s === sportActive ? " active" : "");
    b.textContent = SPORT_ICON[s] + " " + s;
    b.addEventListener("click", () => {
      sportActive = s;
      renderMatchPicker();
      renderMatch();
    });
    picker.appendChild(b);
  });
}
function renderMatch() {
  renderMatchPicker();
  const userTeam = ((LINEUPS || {})[sportActive] || {});
  const slots = (window.POSITIONS || DEFAULT_POSITIONS)[sportActive] || [];
  const myEl = $("#your-team");
  const aiEl = $("#ai-team");
  myEl.innerHTML = ""; aiEl.innerHTML = "";
  slots.forEach((pos) => {
    const u = userTeam[pos];
    const myCard = u
      ? miniCardEl({ player_name: u.player_name, position: pos, ovr: u.ovr, rarity: u.rarity })
      : miniCardEl({ player_name: "Empty", position: pos, ovr: "-", rarity: "Silver" });
    myEl.appendChild(myCard);
    // AI placeholder
    const ai = miniCardEl({ player_name: "AI Opponent", position: pos, ovr: "?", rarity: "Silver" });
    aiEl.appendChild(ai);
  });
  $("#play-match-btn").disabled = (USER.energy < 1);
}
async function playMatch() {
  const btn = $("#play-match-btn");
  btn.disabled = true;
  try {
    const r = await api("POST", "/api/match", { sport: sportActive });
    setUser(r.user);
    renderResult(r);
    updateEnergy();
    refreshQuests();
    // refresh lineups (unchanged) + collection
    if (currentTab === "Match") renderMatch();
  } catch (e) {
    toast("✕ " + e.message);
  } finally {
    btn.disabled = false;
  }
}
function renderResult(r) {
  const box = $("#match-result");
  box.className = "match-result " + (r.userWon ? "win" : "lose");
  let html = `<div class="result-title">${r.userWon ? "VICTORY" : "DEFEAT"}</div>`;
  html += `<div class="result-coin">You earned <b>${r.reward} ◈</b> Game Coins</div>`;
  html += `<div class="result-coin">Slots won: <b>${r.userWins}</b> / ${r.userWins + r.aiWins}</div>`;
  html += `<div class="slot-results">`;
  r.slots.forEach((s) => {
    html += `<div class="slot-row">
        <span>${s.position}</span>
        <span>You <b>${s.userOVR}</b> ${s.userWon ? "✓" : "✕"} ${s.aiOVR} <b>AI</b></span>
      </div>`;
  });
  html += `</div>`;
  box.innerHTML = html;
  box.classList.remove("hidden");
}

// ---------- Shop ----------
async function buyPack() {
  const err = $("#shop-error");
  err.textContent = "";
  const reveal = $("#pack-reveal");
  reveal.classList.add("hidden");
  try {
    const r = await api("POST", "/api/shop/buy");
    setUser(r.user);
    COLLECTION = r.collection;
    refreshQuests();
    reveal.innerHTML = "";
    const tier = document.createElement("div");
    tier.className = "reveal-tier";
    tier.textContent = "PULLED — " + r.pulled.rarity.toUpperCase();
    reveal.appendChild(tier);
    reveal.appendChild(cardEl(r.pulled));
    reveal.classList.remove("hidden");
    toast(`🎁 ${r.pulled.rarity} ${r.pulled.player_name} (${r.pulled.ovr})`);
  } catch (e) {
    err.textContent = e.message;
  }
}

async function buyFlashPack() {
  const err = $("#flash-error");
  err.textContent = "";
  const reveal = $("#pack-reveal");
  reveal.classList.remove("hidden");
  try {
    const r = await api("POST", "/api/shop/flash-buy");
    setUser(r.user);
    COLLECTION = r.collection;
    refreshQuests();
    reveal.innerHTML = "";
    const tier = document.createElement("div");
    tier.className = "reveal-tier";
    tier.textContent = "FLASH PULL — " + r.pulled.rarity.toUpperCase() + " · " + r.pulled.sport;
    reveal.appendChild(tier);
    reveal.appendChild(cardEl(r.pulled));
    toast(`⚡ ${r.pulled.rarity} ${r.pulled.player_name} (${r.pulled.ovr})`);
  } catch (e) {
    err.textContent = e.message;
    reveal.classList.add("hidden");
  }
}

async function claimBonusPack() {
  try {
    const r = await api("POST", "/api/quests/bonus");
    COLLECTION = r.collection;
    refreshQuests();
    const reveal = $("#pack-reveal");
    reveal.classList.remove("hidden");
    reveal.innerHTML = `<div class="reveal-tier">🎁 BONUS QUEST PACK — ${r.tier}</div>`;
    reveal.appendChild(cardEl(r.pulled));
    toast(`🎁 Bonus Pack: ${r.pulled.rarity} ${r.pulled.player_name} (${r.pulled.ovr})`);
  } catch (e) {
    toast("✕ " + e.message);
  }
}
function watchAdEnergy() {
  return mockAd(() => api("POST", "/api/ads/energy").then((r) => { setUser(r.user); updateEnergy(); refreshQuests(); toast("✓ " + r.message); }));
}
function watchAdCoins() {
  return mockAd(() => api("POST", "/api/ad/coins").then((r) => { setUser(r.user); refreshQuests(); toast("✓ " + r.message); }));
}

// ---------- Mock Ad Network ----------
// Safely simulates an ad network: shows a fake "Ad" overlay + countdown, then calls
// the completion callback which persists the reward to the backend immediately.
function mockAd(complete, seconds = 5) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "ad-overlay";
    let s = seconds;
    let tick = null;
    overlay.innerHTML = `<div class="ad-box glass">
        <div class="ad-close" title="Skip">SKIP</div>
        <div class="ad-title">🎬 REWARDED VIDEO</div>
        <div class="ad-sub">Watching this short ad unlocks your reward…</div>
        <div class="ad-stage"><span class="ad-spark">▶</span></div>
        <div class="ad-count">${s}s</div>
        <div class="ad-bar"><i id="ad-fill"></i></div>
        <div class="ad-note">Your reward is granted automatically when the video ends.</div>
      </div>`;
    document.body.appendChild(overlay);

    function completeAd() {
      if (!overlay.isConnected) return;
      clearInterval(tick);
      // Success state, then close + persist the reward to the backend.
      overlay.innerHTML = `<div class="ad-box glass ad-success">
        <div class="ad-check">✓</div>
        <div class="ad-title">AD COMPLETE</div>
        <div class="ad-note">Reward granted! Updating your account…</div>
      </div>`;
      setTimeout(() => {
        overlay.remove();
        complete().then(resolve); // persists balance/energy to the DB immediately
      }, 900);
    }

    overlay.querySelector(".ad-close").addEventListener("click", completeAd);
    const fill = overlay.querySelector("#ad-fill");
    const count = overlay.querySelector(".ad-count");
    tick = setInterval(() => {
      s -= 1;
      count.textContent = Math.max(0, s) + "s";
      fill.style.width = ((seconds - s) / seconds * 100) + "%";
      if (s <= 0) completeAd();
    }, 1000);
  });
}

// ---------- Daily ----------
async function claimDaily() {
  try {
    const r = await api("POST", "/api/daily/claim");
    setUser(r.user);
    refreshQuests();
    toast(`🎉 ${r.message} — Streak ${r.user.daily_streak}`);
  } catch (e) {
    toast("✕ " + e.message);
  }
}

// ---------- Auth ----------
let authMode = "login";
function setAuthMode(m) {
  authMode = m;
  $$(".auth-tab").forEach((b) => b.classList.toggle("active", b.dataset.mode === m));
  $("#auth-submit").textContent = m === "login" ? "Enter the League" : "Create Coach Account";
  $("#auth-password").autocomplete = m === "login" ? "current-password" : "new-password";
}
async function loadConfig() {
  try { CONFIG = await api("GET", "/api/config"); } catch (_) { CONFIG = { positions: DEFAULT_POSITIONS }; }
  window.POSITIONS = (CONFIG && CONFIG.positions) || DEFAULT_POSITIONS;
  return CONFIG;
}

async function submitAuth(e) {
  e.preventDefault();
  const username = $("#auth-username").value.trim();
  const password = $("#auth-password").value;
  $("#auth-error").textContent = "";
  const submit = $("#auth-submit");
  submit.disabled = true;
  try {
    await loadConfig(); // ensure positions + pricing exist before rendering
    const r = await api("POST", "/api/auth/" + authMode, { username, password });
    TOKEN = r.token;
    localStorage.setItem("ug_token", TOKEN);
    USER = r.user;
    COLLECTION = r.collection;
    LINEUPS = indexLineups(r.lineups);
    enterApp();
  } catch (err) {
    $("#auth-error").textContent = err.message;
  } finally {
    submit.disabled = false;
  }
}
async function logout() {
  try { await api("POST", "/api/auth/logout"); } catch (_) {}
  TOKEN = null;
  localStorage.removeItem("ug_token");
  location.reload();
}

// ---------- App boot ----------
function enterApp() {
  $("#auth-screen").classList.add("hidden");
  $("#app-screen").classList.remove("hidden");
  setUser(USER);
  setTab("NBA");
  refreshQuests();
  refreshFlash();
}

function startFlashTimer() {
  if (flashTick) clearInterval(flashTick);
  flashTick = setInterval(updateFlashTimer, 1000);
}

async function loadConfigAndMe() {
  await loadConfig();
  try {
    const r = await api("GET", "/api/me");
    USER = r.user;
    COLLECTION = r.collection;
    LINEUPS = indexLineups(r.lineups);
    enterApp();
  } catch (e) {
    // not logged in
    showAuth();
  }
}

function showAuth() {
  $("#app-screen").classList.add("hidden");
  $("#auth-screen").classList.remove("hidden");
}

// ---------- Wire up ----------
document.addEventListener("DOMContentLoaded", () => {
  // Start with a clean, fully-initialized roster so no sport-key read can crash
  LINEUPS = normalizeRosters(null);
  // auth tabs
  $$(".auth-tab").forEach((b) => b.addEventListener("click", () => setAuthMode(b.dataset.mode)));
  $("#auth-form").addEventListener("submit", submitAuth);
  $$(".nav-btn").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));
  $("#play-match-btn").addEventListener("click", playMatch);
  $("#buy-pack-btn").addEventListener("click", buyPack);
  $("#ad-energy-btn").addEventListener("click", watchAdEnergy);
  $("#ad-coins-btn").addEventListener("click", watchAdCoins);
  $("#daily-claim-btn").addEventListener("click", claimDaily);
  $("#logout-btn").addEventListener("click", logout);
  $("#flash-buy-btn").addEventListener("click", buyFlashPack);
  $("#quests-bonus-btn").addEventListener("click", claimBonusPack);
  // Dismiss footer banner ad
  const bannerClose = document.querySelector("#banner-ad .banner-close");
  if (bannerClose) bannerClose.addEventListener("click", () => $("#banner-ad").classList.add("dismissed"));
  $("#swap-close").addEventListener("click", closeSwap);

  startFlashTimer();
  loadConfigAndMe();
});