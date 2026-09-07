"use strict";
const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const path = require("path");
const {
  db,
  ENERGY_MAX,
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
  evolveCard,
  getQuests,
  bumpQuest,
  allQuestsClaimed,
  questBonusClaimed,
  claimBonusQuest,
  flashOffer,
  getLeaderboard,
  POSITIONS
} = require("./db");

const app = express();
const PORT = process.env.PORT || 8080;
const BCRYPT_ROUNDS = 10;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PKG_PRICE = 1000;
const PACK_ODDS = [
  { tier: "Silver", chance: 0.75, min: 70, max: 79 },
  { tier: "Gold", chance: 0.2, min: 80, max: 89 },
  { tier: "Elite", chance: 0.05, min: 90, max: 99 }
];
const WIN_COINS = 250;
const LOSE_COINS = 50;
const QUEST_REWARD = 150;
const BONUS_REWARD = 500;

// ---------------- Auth helpers ----------------
function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions (token, user_id, created_at) VALUES (?,?,?)").run(token, userId, Date.now());
  return token;
}

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Not authenticated" });
  const session = db.prepare("SELECT user_id FROM sessions WHERE token = ?").get(token);
  if (!session) return res.status(401).json({ error: "Invalid session" });
  const user = findUserById(session.user_id);
  if (!user) return res.status(401).json({ error: "User not found" });
  req.user = user;
  req.sessionToken = token;
  next();
}

function saveUser(row) {
  db.prepare(
    "UPDATE users SET game_coins = ?, energy = ?, energy_last_updated = ?, daily_streak = ?, last_daily_claim = ? WHERE id = ?"
  ).run(row.game_coins, row.energy, row.energy_last_updated, row.daily_streak, row.last_daily_claim, row.id);
}

// ---------------- Pack roll helper ----------------
function rollTier() {
  let r = Math.random();
  let acc = 0;
  for (const o of PACK_ODDS) {
    acc += o.chance;
    if (r < acc) return o.tier;
  }
  return "Silver";
}

// sport can be a specific sport; tier restricts which rarities are eligible.
function pick({ sport, tier } = {}) {
  const tierList = tier ? [tier] : PACK_ODDS.map((o) => o.tier);
  let pool;
  if (sport) {
    pool = db.prepare(
      `SELECT id, player_name, sport, position, ovr, rarity FROM cards WHERE sport = ? AND rarity IN (${tierList.map(() => "?").join(",")})`
    ).all(sport, ...tierList);
  } else {
    pool = db.prepare(
      `SELECT id, player_name, sport, position, ovr, rarity FROM cards WHERE rarity IN (${tierList.map(() => "?").join(",")})`
    ).all(...tierList);
  }
  return pool[Math.floor(Math.random() * pool.length)] ||
    db.prepare("SELECT * FROM cards ORDER BY RANDOM() LIMIT 1").get();
}

function grantCard(userId, picked) {
  const now = Date.now();
  const info = db.prepare("INSERT INTO user_cards (user_id, card_id, ovr_bonus, acquired_at) VALUES (?,?,0,?)")
    .run(userId, picked.id, now);
  return {
    uid_card: info.lastInsertRowid,
    card_id: picked.id,
    player_name: picked.player_name,
    sport: picked.sport,
    position: picked.position,
    ovr: picked.ovr,
    rarity: picked.rarity
  };
}

// ---------------- Routes ----------------
app.get("/api/health", (req, res) => res.json({ ok: true }));

app.get("/api/config", (req, res) => {
  res.json({
    packPrice: PKG_PRICE,
    packOdds: PACK_ODDS,
    energyMax: ENERGY_MAX,
    winCoins: WIN_COINS,
    loseCoins: LOSE_COINS,
    positions: POSITIONS,
    questReward: QUEST_REWARD,
    questBonusReward: BONUS_REWARD,
    flashMs: 4 * 60 * 60 * 1000
  });
});

app.post("/api/auth/signup", async (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");
  if (username.length < 3) return res.status(400).json({ error: "Username must be at least 3 characters" });
  if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
  if (db.prepare("SELECT id FROM users WHERE username = ?").get(username))
    return res.status(409).json({ error: "Username already taken" });

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const now = Date.now();
  const info = db
    .prepare("INSERT INTO users (username, password_hash, game_coins, energy, energy_last_updated, daily_streak, last_daily_claim, created_at) VALUES (?,?,?,?,?,?,?,?)")
    .run(username, hash, 100, 5, now, 0, null, now);
  const userId = info.lastInsertRowid;
  grantStarterPack(userId);
  const token = createSession(userId);
  res.status(201).json({
    token,
    user: publicUser(findUserById(userId)),
    collection: getCollection(userId),
    lineups: getLineups(userId),
    rosters: getRosters(userId),
    quests: getQuests(userId)
  });
});

app.post("/api/auth/login", async (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");
  const row = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!row) return res.status(401).json({ error: "Invalid username or password" });
  if (!(await bcrypt.compare(password, row.password_hash)))
    return res.status(401).json({ error: "Invalid username or password" });
  const token = createSession(row.id);
  const user = publicUser(refreshEnergy(row));
  persistEnergy(user);
  res.json({ token, user, collection: getCollection(row.id), lineups: getLineups(row.id), rosters: getRosters(row.id), quests: getQuests(row.id) });
});

app.post("/api/auth/logout", auth, (req, res) => {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(req.sessionToken);
  res.json({ ok: true });
});

app.get("/api/me", auth, (req, res) => {
  const u = refreshEnergy(req.user);
  persistEnergy(u);
  res.json({
    user: publicUser(u),
    collection: getCollection(u.id),
    lineups: getLineups(u.id),
    rosters: getRosters(u.id),
    quests: getQuests(u.id),
    questBonusClaimed: questBonusClaimed(u.id),
    questAllClaimed: allQuestsClaimed(u.id)
  });
});

// ---------------- Lineups ----------------
app.post("/api/lineups/set", auth, (req, res) => {
  const { sport, position, userCardId } = req.body;
  if (!(POSITIONS[sport] || []).includes(position))
    return res.status(400).json({ error: "Invalid sport/position" });
  const owned = db
    .prepare("SELECT uc.id, c.sport, c.position FROM user_cards uc JOIN cards c ON c.id=uc.card_id WHERE uc.user_id=? AND uc.id=?")
    .get(req.user.id, userCardId);
  if (!owned) return res.status(400).json({ error: "You do not own that card" });
  if (owned.sport !== sport || owned.position !== position)
    return res.status(400).json({ error: "Card does not match this slot" });
  db.prepare("INSERT OR REPLACE INTO lineups (user_id, sport, position, user_card_id) VALUES (?,?,?,?)")
    .run(req.user.id, sport, position, userCardId);
  res.json({ lineups: getLineups(req.user.id), rosters: getRosters(req.user.id) });
});

// ---------------- Evolve / Fusion ----------------
app.post("/api/cards/evolve", auth, (req, res) => {
  const { cardId } = req.body;
  const result = evolveCard(req.user.id, cardId);
  res.json({ result, collection: getCollection(req.user.id), lineups: getLineups(req.user.id) });
});

// ---------------- Shop ----------------
app.post("/api/shop/buy", auth, (req, res) => {
  let u = refreshEnergy(req.user);
  if (u.game_coins < PKG_PRICE) return res.status(400).json({ error: "Not enough Game Coins" });
  u.game_coins -= PKG_PRICE;
  const tier = rollTier();
  const picked = pick({ tier });
  const pulled = grantCard(req.user.id, picked);
  setCoins(req.user.id, u.game_coins);
  bumpQuest(req.user.id, "pack", 1);
  res.json({
    pulled,
    tier,
    user: publicUser(u),
    collection: getCollection(req.user.id),
    quests: getQuests(req.user.id)
  });
});

// Flash Shop — discounted sport pack, refreshes every 4 hours
app.get("/api/flash", auth, (req, res) => {
  res.json({ ...flashOffer(PKG_PRICE), user: publicUser(refreshEnergy(req.user)) });
});

app.post("/api/shop/flash-buy", auth, (req, res) => {
  let u = refreshEnergy(req.user);
  const offer = flashOffer(PKG_PRICE);
  if (u.game_coins < offer.price) return res.status(400).json({ error: "Not enough Game Coins" });
  u.game_coins -= offer.price;
  const tier = rollTier();
  const picked = pick({ sport: offer.sport, tier });
  const pulled = grantCard(req.user.id, picked);
  setCoins(u.id, u.game_coins);
  bumpQuest(req.user.id, "pack", 1);
  res.json({ flash: offer, pulled, tier, user: publicUser(u), collection: getCollection(req.user.id), quests: getQuests(req.user.id) });
});

// ---------------- Vs AI Match ----------------
app.post("/api/match", auth, (req, res) => {
  const sport = req.body.sport;
  if (!POSITIONS[sport]) return res.status(400).json({ error: "Invalid sport" });
  let u = refreshEnergy(req.user);
  if (u.energy < 1) return res.status(400).json({ error: "Not enough Energy (max 5, +1 per 30min)" });

  const userTeam = db
    .prepare(`SELECT c.sport, c.position, c.player_name, (c.ovr + uc.ovr_bonus) AS ovr, c.rarity
       FROM lineups l JOIN user_cards uc ON uc.id=l.user_card_id JOIN cards c ON c.id=uc.card_id
       WHERE l.user_id = ? AND l.sport = ?`)
    .all(req.user.id, sport);

  const aiTeam = buildAITeam(sport, userTeam);
  const result = simulateMatch(userTeam, aiTeam, sport);
  u.energy -= 1;
  const reward = result.userWon ? WIN_COINS : LOSE_COINS;
  u.game_coins += reward;
  persistEnergy(u);
  setCoins(u.id, u.game_coins);

  bumpQuest(req.user.id, "play", 1);
  bumpQuest(req.user.id, "earn", reward);
  if (result.userWon) bumpQuest(req.user.id, "win", 1, sport);

  res.json({
    sport,
    userTeam,
    aiTeam,
    ...result,
    reward,
    user: publicUser(u),
    winCoins: WIN_COINS,
    loseCoins: LOSE_COINS,
    quests: getQuests(req.user.id)
  });
});

// ---------------- Ads ----------------
app.post("/api/ads/energy", auth, (req, res) => {
  let u = refreshEnergy(req.user);
  if (u.energy < ENERGY_MAX) {
    u.energy = ENERGY_MAX;
    db.prepare("UPDATE users SET energy = ?, energy_last_updated = ? WHERE id = ?").run(u.energy, Date.now(), u.id);
  }
  bumpQuest(req.user.id, "ad", 1);
  res.json({ user: publicUser(u), granted: 1, message: "+1 Energy refilled", quests: getQuests(req.user.id) });
});

app.post("/api/ad/coins", auth, (req, res) => {
  let u = refreshEnergy(req.user);
  const AD_COINS = 100;
  u.game_coins += AD_COINS;
  setCoins(u.id, u.game_coins);
  bumpQuest(req.user.id, "ad", 1);
  bumpQuest(req.user.id, "earn", AD_COINS);
  res.json({ user: publicUser(u), granted: AD_COINS, message: `+${AD_COINS} Coins`, quests: getQuests(req.user.id) });
});

// ---------------- Daily ----------------
app.post("/api/daily/claim", auth, (req, res) => {
  let u = refreshEnergy(req.user);
  const now = Date.now();
  if (u.last_daily_claim && now - u.last_daily_claim < 24 * 60 * 60 * 1000)
    return res.status(400).json({ error: "Already claimed today", user: publicUser(u) });
  u.game_coins += 500;
  u.daily_streak += 1;
  u.last_daily_claim = now;
  saveUser(u);
  bumpQuest(req.user.id, "earn", 500);
  res.json({ user: publicUser(u), reward: 500, message: "+500 Coins & streak incremented", quests: getQuests(req.user.id) });
});

// ---------------- Daily Quests ----------------
app.get("/api/quests", auth, (req, res) => {
  res.json({
    quests: getQuests(req.user.id),
    reward: QUEST_REWARD,
    bonusReward: BONUS_REWARD,
    bonusClaimed: questBonusClaimed(req.user.id),
    allClaimed: allQuestsClaimed(req.user.id)
  });
});

app.post("/api/quests/claim", auth, (req, res) => {
  const { slot } = req.body;
  let u = refreshEnergy(req.user);
  const quests = getQuests(req.user.id);
  const q = quests.find((x) => x.slot === slot);
  if (!q) return res.status(400).json({ error: "Quest not found" });
  if (!q.done) return res.status(400).json({ error: "Quest not complete yet" });
  if (q.claimed) return res.status(400).json({ error: "Quest already claimed" });
  u.game_coins += QUEST_REWARD;
  setCoins(u.id, u.game_coins);
  const date = new Date().toISOString().slice(0, 10);
  db.prepare("UPDATE daily_quests SET claimed = 1 WHERE user_id = ? AND quest_date = ? AND slot = ?").run(u.id, date, slot);
  res.json({ user: publicUser(u), quests: getQuests(u.id), claimedSlot: slot });
});

app.post("/api/quests/bonus", auth, (req, res) => {
  let u = refreshEnergy(req.user);
  if (!allQuestsClaimed(u.id)) return res.status(400).json({ error: "Claim all 3 quests first" });
  if (questBonusClaimed(u.id)) return res.status(400).json({ error: "Bonus pack already awarded today" });
  claimBonusQuest(u.id);
  // Bonus Quest Pack — guaranteed Gold or Elite
  const tier = Math.random() < 0.5 ? "Gold" : "Elite";
  const picked = pick({ tier });
  const pulled = grantCard(u.id, picked);
  res.json({ pulled, tier, bonusClaimed: true, collection: getCollection(u.id), quests: getQuests(u.id) });
});

// ---------------- Leaderboard ----------------
app.get("/api/leaderboard", auth, (req, res) => {
  const lb = getLeaderboard(50);
  const myRank = lb.list.find((r) => r.user_id === req.user.id) || null;
  res.json({ ...lb, me: myRank ? { rank: myRank.rank, total: myRank.total } : null });
});

// Generic 404 for unknown api
app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

// Centralized error handler
app.use((err, req, res, next) => {
  console.error("[server] error:", err && err.stack ? err.stack : err);
  res.status(err.status || 500).json({ error: err.message || "Unexpected server error. Please try again." });
});

const server = app.listen(PORT, () => {
  console.log(`All-Sport Manager running at http://localhost:${PORT}`);
});