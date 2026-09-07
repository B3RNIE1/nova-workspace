"use strict";
const path = require("path");
const Database = require("better-sqlite3");
const crypto = require("crypto");
const { POSITIONS, buildCards } = require("./seed-data");

const DB_PATH = path.join(__dirname, "data", "league.db");
const { mkdirSync } = require("fs");
mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

// ---------------- Schema ----------------
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  game_coins INTEGER NOT NULL DEFAULT 100,
  energy INTEGER NOT NULL DEFAULT 5,
  energy_last_updated INTEGER NOT NULL,
  daily_streak INTEGER NOT NULL DEFAULT 0,
  last_daily_claim INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_name TEXT NOT NULL,
  sport TEXT NOT NULL,
  position TEXT NOT NULL,
  ovr INTEGER NOT NULL,
  starter INTEGER NOT NULL DEFAULT 0,
  rarity TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  card_id INTEGER NOT NULL,
  ovr_bonus INTEGER NOT NULL DEFAULT 0,
  acquired_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(card_id) REFERENCES cards(id)
);

CREATE TABLE IF NOT EXISTS lineups (
  user_id INTEGER NOT NULL,
  sport TEXT NOT NULL,
  position TEXT NOT NULL,
  user_card_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, sport, position),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(user_card_id) REFERENCES user_cards(id)
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS daily_quests (
  user_id INTEGER NOT NULL,
  quest_date TEXT NOT NULL,
  slot INTEGER NOT NULL,
  qtype TEXT NOT NULL,
  sport TEXT,
  target INTEGER NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  claimed INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, quest_date, slot),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS quest_bonus (
  user_id INTEGER NOT NULL,
  quest_date TEXT NOT NULL,
  PRIMARY KEY (user_id, quest_date),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
`);

// Migration: ensure ovr_bonus exists on older DBs
try { db.exec("ALTER TABLE user_cards ADD COLUMN ovr_bonus INTEGER NOT NULL DEFAULT 0"); } catch (_) {}

// ---------------- Seed cards (idempotent) ----------------
const count = db.prepare("SELECT COUNT(*) AS c FROM cards").get().c;
if (count === 0) {
  const ins = db.prepare(
    "INSERT INTO cards (player_name, sport, position, ovr, starter, rarity) VALUES (?,?,?,?,?,?)"
  );
  const seed = db.transaction(() => {
    for (const c of buildCards()) {
      ins.run(c.player_name, c.sport, c.position, c.ovr, c.starter ? 1 : 0, c.rarity);
    }
  });
  seed();
}

// Energy regeneration constants
const ENERGY_MAX = 5;
const ENERGY_REGEN_MS = 30 * 60 * 1000; // 1 point per 30 minutes

// Rarity by OVR
function rarityFromOVR(ovr) {
  if (ovr >= 90) return "Elite";
  if (ovr >= 80) return "Gold";
  if (ovr >= 70) return "Silver";
  return "Bronze";
}
function effOVR(baseOvr, bonus) {
  return Math.min(99, (baseOvr || 0) + (bonus || 0));
}

// ---------------- Energy logic ----------------
function refreshEnergy(userRow) {
  if (userRow.energy >= ENERGY_MAX) return userRow;
  const now = Date.now();
  let energy = userRow.energy;
  let last = userRow.energy_last_updated;
  const gained = Math.floor((now - last) / ENERGY_REGEN_MS);
  if (gained > 0) {
    energy = Math.min(ENERGY_MAX, energy + gained);
    last = last + gained * ENERGY_REGEN_MS;
  }
  return { ...userRow, energy, energy_last_updated: last };
}

function persistEnergy(userRow) {
  db.prepare(
    "UPDATE users SET energy = ?, energy_last_updated = ? WHERE id = ?"
  ).run(userRow.energy, userRow.energy_last_updated, userRow.id);
}

function setCoins(userId, coins) {
  db.prepare("UPDATE users SET game_coins = ? WHERE id = ?").run(coins, userId);
}

// ---------------- User helpers ----------------
function findUserById(id) {
  return refreshEnergy(db.prepare("SELECT * FROM users WHERE id = ?").get(id));
}

function publicUser(row) {
  return {
    id: row.id,
    username: row.username,
    game_coins: row.game_coins,
    energy: row.energy,
    energy_max: ENERGY_MAX,
    energy_regen_ms: ENERGY_REGEN_MS,
    daily_streak: row.daily_streak,
    last_daily_claim: row.last_daily_claim
  };
}

// ---------------- Starter Pack ----------------
function grantStarterPack(userId) {
  const insert = db.prepare(
    "INSERT INTO user_cards (user_id, card_id, ovr_bonus, acquired_at) VALUES (?,?,0,?)"
  );
  const setLineup = db.prepare(
    "INSERT OR REPLACE INTO lineups (user_id, sport, position, user_card_id) VALUES (?,?,?,?)"
  );
  const stmt = db.prepare(
    "SELECT id, sport, position FROM cards WHERE starter = 1 AND ovr BETWEEN 60 AND 65"
  );
  const grant = db.transaction(() => {
    const now = Date.now();
    for (const c of stmt.all()) {
      const res = insert.run(userId, c.id, now);
      setLineup.run(userId, c.sport, c.position, res.lastInsertRowid);
    }
  });
  grant();
}

// ---------------- Collection ----------------
// Aggregated per unique player (grouped by card), with copy count + evolution info.
function getCollection(userId) {
  return db
    .prepare(
      `SELECT uc.card_id, COUNT(*) AS copies, MIN(uc.id) AS rep_id,
              MAX(uc.ovr_bonus) AS ovr_bonus,
              c.player_name, c.sport, c.position, c.ovr, c.rarity
       FROM user_cards uc JOIN cards c ON c.id = uc.card_id
       WHERE uc.user_id = ?
       GROUP BY uc.card_id
       ORDER BY (c.ovr + MAX(uc.ovr_bonus)) DESC, c.player_name`
    )
    .all(userId)
    .map((r) => {
      const ovr = effOVR(r.ovr, r.ovr_bonus);
      return {
        card_id: r.card_id,
        instance_id: r.rep_id,
        player_name: r.player_name,
        sport: r.sport,
        position: r.position,
        ovr: r.ovr,           // base rating
        ovr_bonus: r.ovr_bonus || 0,
        rating: ovr,          // effective rating (base + evolution)
        rarity: rarityFromOVR(ovr),
        copies: r.copies,
        can_evolve: r.copies > 1 && ovr < 99
      };
    });
}

function getLineups(userId) {
  return db
    .prepare(
      `SELECT l.sport, l.position, l.user_card_id,
              c.player_name, c.ovr, uc.ovr_bonus, c.rarity
       FROM lineups l
       JOIN user_cards uc ON uc.id = l.user_card_id
       JOIN cards c ON c.id = uc.card_id
       WHERE l.user_id = ?`
    )
    .all(userId)
    .map((r) => {
      const eff = effOVR(r.ovr, r.ovr_bonus);
      return { ...r, ovr: eff, rarity: rarityFromOVR(eff) };
    });
}

function indexLineups(list) {
  const map = {};
  for (const l of list) {
    map[l.sport] = map[l.sport] || {};
    map[l.sport][l.position] = l;
  }
  return map;
}

// Build a roster object that ALWAYS contains all 5 sport keys (NBA/NFL/MLB/NHL/Soccer),
// each holding that sport's filled lineup slots (or an empty map if a slot is unset).
function getRosters(userId) {
  const map = {};
  for (const sport of Object.keys(POSITIONS)) map[sport] = {};
  for (const l of getLineups(userId)) {
    if (!map[l.sport]) map[l.sport] = {};
    map[l.sport][l.position] = l;
  }
  return map;
}

// ---------------- Fusion / Evolve ----------------
// Fuse one duplicate copy into a "keeper" copy (the one in the lineup if any),
// permanently +3 OVR (capped at 99). Consumes one duplicate.
function evolveCard(userId, cardId) {
  const instances = db
    .prepare("SELECT * FROM user_cards WHERE user_id = ? AND card_id = ? ORDER BY id")
    .all(userId, cardId);
  if (instances.length < 2) {
    const err = new Error("You need duplicate copies of this player to Evolve.");
    err.status = 400;
    throw err;
  }
  const card = db.prepare("SELECT ovr FROM cards WHERE id = ?").get(cardId);
  const lineupInstance = db
    .prepare(
      `SELECT l.user_card_id AS id FROM lineups l JOIN user_cards uc ON uc.id = l.user_card_id
       WHERE l.user_id = ? AND uc.card_id = ? LIMIT 1`
    )
    .get(userId, cardId);

  const keeper = lineupInstance
    ? instances.find((i) => i.id === lineupInstance.id) || instances[0]
    : instances[0];
  const consumer = instances.find((i) => i.id !== keeper.id);

  db.prepare("DELETE FROM user_cards WHERE id = ?").run(consumer.id);
  const maxBonus = Math.max(0, 99 - card.ovr);
  const newBonus = Math.min(maxBonus, keeper.ovr_bonus + 3);
  db.prepare("UPDATE user_cards SET ovr_bonus = ? WHERE id = ?").run(newBonus, keeper.id);

  return {
    keeper_id: keeper.id,
    player_name: card.player_name,
    old_ovr: effOVR(card.ovr, keeper.ovr_bonus),
    new_ovr: effOVR(card.ovr, newBonus),
    rating: effOVR(card.ovr, newBonus),
    rarity: rarityFromOVR(effOVR(card.ovr, newBonus))
  };
}

// ---------------- Daily Quests ----------------
const DAY_MS = 24 * 60 * 60 * 1000;
const FLASH_MS = 4 * 60 * 60 * 1000;
const QUEST_POOL = [
  { qtype: "win", label: "Win {n} {sport} games", target: 2, sportNeeded: true },
  { qtype: "play", label: "Play {n} matches", target: 3 },
  { qtype: "pack", label: "Open {n} card pack(s)", target: 1 },
  { qtype: "ad", label: "Watch {n} ad(s)", target: 2 },
  { qtype: "earn", label: "Earn {n} Game Coins", target: 500 }
];
const QUEST_REWARD = 150;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function ensureDailyQuests(userId) {
  const date = todayKey();
  const existing = db.prepare(
    "SELECT * FROM daily_quests WHERE user_id = ? AND quest_date = ? ORDER BY slot"
  ).all(userId, date);
  if (existing.length >= 3) return existing;

  // generate 3 randomized quests (distinct types, random sports)
  const sports = Object.keys(POSITIONS);
  const shuffled = [...QUEST_POOL].sort(() => Math.random() - 0.5).slice(0, 3);
  const ins = db.prepare(
    "INSERT OR REPLACE INTO daily_quests (user_id, quest_date, slot, qtype, sport, target, progress, claimed) VALUES (?,?,?,?,?,?,0,0)"
  );
  const gen = db.transaction(() => {
    for (let slot = 0; slot < 3; slot++) {
      const q = shuffled[slot];
      const sport = q.sportNeeded ? (q.qtype === "win" ? sports[Math.floor(Math.random() * sports.length)] : null) : null;
      ins.run(userId, date, slot, q.qtype, sport, q.target);
    }
  });
  gen();
  return db.prepare(
    "SELECT * FROM daily_quests WHERE user_id = ? AND quest_date = ? ORDER BY slot"
  ).all(userId, date);
}

function getQuests(userId) {
  const rows = ensureDailyQuests(userId);
  return rows.map((r) => ({
    slot: r.slot,
    qtype: r.qtype,
    sport: r.sport,
    target: r.target,
    progress: r.progress,
    done: r.progress >= r.target,
    claimed: r.claimed,
    reward: QUEST_REWARD,
    label: questLabel(r)
  }));
}

function questLabel(q) {
  const tpl = QUEST_POOL.find((p) => p.qtype === q.qtype) || { label: "" };
  let s = tpl.label;
  if (q.sport) s = s.replace("{sport}", q.sport);
  s = s.replace("{n}", String(q.target));
  return s;
}

function questBonusClaimed(userId) {
  return !!db.prepare("SELECT 1 FROM quest_bonus WHERE user_id = ? AND quest_date = ?").get(userId, todayKey());
}

function bumpQuest(userId, qtype, amount, sport) {
  ensureDailyQuests(userId);
  const date = todayKey();
  const rows = db.prepare(
    "SELECT * FROM daily_quests WHERE user_id = ? AND quest_date = ? AND qtype = ? AND claimed = 0"
  ).all(userId, date, qtype);
  for (const q of rows) {
    if (q.sport && sport && q.sport !== sport) continue;
    const next = q.progress + amount;
    db.prepare("UPDATE daily_quests SET progress = ? WHERE user_id = ? AND quest_date = ? AND slot = ?")
      .run(next, userId, date, q.slot);
  }
}

function allQuestsClaimed(userId) {
  const qs = getQuests(userId);
  return qs.length === 3 && qs.every((q) => q.claimed);
}

// ---------------- Flash Shop ----------------
// Deterministic-but-random offer per 4-hour window (stable countdown within a window).
function flashOffer(packPrice) {
  const now = Date.now();
  const windowIdx = Math.floor(now / FLASH_MS);
  const windowStart = windowIdx * FLASH_MS;
  const secondsLeft = Math.floor((windowStart + FLASH_MS - now) / 1000);
  const sports = Object.keys(POSITIONS);
  const sport = sports[hashInt("flash" + windowIdx) % sports.length];
  const discount = 0.3;
  return {
    windowIdx,
    sport,
    position: POSITIONS[sport][hashInt("pos" + windowIdx) % POSITIONS[sport].length],
    discount,
    price: Math.round(packPrice * (1 - discount)),
    regularPrice: packPrice,
    secondsLeft
  };
}
function hashInt(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) >>> 0;
}

// ---------------- Leaderboard ----------------
// Ranks users by total combined franchise OVR across all 5 active lineups.
function getLeaderboard(limit) {
  const rows = db.prepare(
    `SELECT l.user_id, u.username, l.sport, SUM(c.ovr + uc.ovr_bonus) AS sport_total
     FROM lineups l
     JOIN user_cards uc ON uc.id = l.user_card_id
     JOIN cards c ON c.id = uc.card_id
     JOIN users u ON u.id = l.user_id
     GROUP BY l.user_id, l.sport`
  ).all();
  const byUser = {};
  for (const r of rows) {
    byUser[r.user_id] = byUser[r.user_id] || { user_id: r.user_id, username: r.username, sports: {}, total: 0 };
    byUser[r.user_id].sports[r.sport] = r.sport_total;
    byUser[r.user_id].total += r.sport_total;
  }
  const list = Object.values(byUser).sort((a, b) => b.total - a.total);
  const ranked = list.slice(0, limit).map((u, i) => ({ rank: i + 1, ...u }));
  return { list: ranked, total_users: list.length };
}

// ---------------- Match simulation ----------------
function simulateMatch(userTeam, aiTeam, sport) {
  const positions = POSITIONS[sport] || [];
  const slots = [];
  for (const pos of positions) {
    const userCard = userTeam.find((c) => c.position === pos);
    const aiCard = aiTeam.find((c) => c.position === pos);
    if (!userCard || !aiCard) continue;
    const uOVR = userCard.ovr;
    const aOVR = aiCard.ovr;
    const winProb = aOVR === 0 ? 1 : uOVR / (uOVR + aOVR);
    const roll = Math.random();
    const userWon = roll < winProb;
    slots.push({ position: pos, userOVR: uOVR, aiOVR: aOVR, userWinProb: winProb, roll, userWon });
  }
  const userWins = slots.filter((s) => s.userWon).length;
  const aiWins = slots.length - userWins;
  return { slots, userWins, aiWins, userWon: userWins >= 2 };
}

function buildAITeam(sport, userTeam) {
  const positions = POSITIONS[sport] || [];
  const avg = userTeam.length
    ? Math.round(userTeam.reduce((s, c) => s + c.ovr, 0) / userTeam.length)
    : 65;
  return positions.map((pos, idx) => {
    const jitter = idx === 0 ? 1 : idx === 1 ? 0 : idx === 2 ? -1 : 0;
    const ovr = Math.max(55, Math.min(99, avg + jitter + Math.floor(Math.random() * 3) - 1));
    return { position: pos, player_name: `AI ${pos}`, ovr };
  });
}

function claimBonusQuest(userId) {
  db.prepare("INSERT OR IGNORE INTO quest_bonus (user_id, quest_date) VALUES (?,?)").run(userId, todayKey());
  return true;
}

module.exports = {
  db,
  ENERGY_MAX,
  ENERGY_REGEN_MS,
  DAY_MS,
  FLASH_MS,
  refreshEnergy,
  persistEnergy,
  setCoins,
  findUserById,
  publicUser,
  grantStarterPack,
  simulateMatch,
  buildAITeam,
  getCollection,
  getLineups,
  getRosters,
  indexLineups,
  evolveCard,
  ensureDailyQuests,
  getQuests,
  questLabel,
  bumpQuest,
  allQuestsClaimed,
  questBonusClaimed,
  claimBonusQuest,
  flashOffer,
  getLeaderboard,
  POSITIONS
};