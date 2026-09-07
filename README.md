# Ultra Grid League — Multi-Sport Ultimate Team Manager

A responsive, mobile-first, multi-user full-stack web game. Build your Ultimate Team across **5 sports**, battle an AI simulator, open packs, watch ads, and claim daily rewards — all in a dark cyberpunk aesthetic.

## Tech Stack
- **Backend:** Node.js + Express, SQLite (`better-sqlite3`)
- **Auth:** bcrypt password hashing + token sessions
- **Frontend:** Vanilla JS SPA (no build step) — mobile-optimized responsive UI

## Run it
```bash
npm install
npm start
# → http://localhost:8080
```

The SQLite database is created automatically at `data/league.db` on first run (seeded with a mock
athlete database). No external services required.

## Features

### 1. Authentication & Balances
- Signup / login with hashed passwords + session tokens.
- Every user tracks: **Game Coins**, **Energy (max 5/5, +1 every 30 min)**, and a **Daily Streak**.

### 2. Five Sport Franchises (Tabs)
- Tabs: **NBA, NFL, MLB, NHL, Soccer**.
- Each sport has 3 active roster slots:
  - NBA: Guard / Forward / Center
  - NFL: Quarterback / Wide Receiver / Running Back
  - MLB: Pitcher / Catcher / Outfielder
  - NHL: Forward / Defender / Goalie
  - Soccer: Forward / Midfielder / Goalkeeper
- Tap any slot to open a drawer and swap in any owned card of that sport+position.

### 3. Player Card Database
- Seeded with real athletes across all 5 sports.
- Each card shows **Name, Sport, Position, OVR (60–99)** and a rarity border.
- New users auto-receive a **Bronze Starter Pack**: a full 60–65 OVR roster for all 5 sports.

### 4. Battle Simulator (Vs AI Match)
- Costs **1 Energy**.
- AI opponent built to a similar average team OVR as your active team.
- Each slot resolved by **win probability = PlayerA.OVR / (PlayerA.OVR + PlayerB.OVR)**; a random
  roll decides the slot winner. **Best of 3 slots wins.**
- **Win: +250 Coins · Lose: +50 Coins.**

### 5. Pack Shop & Reward Ads
- **Premium Pack** for 1,000 Coins. Odds: **75% Silver (70–79), 20% Gold (80–89), 5% Elite (90–99)**.
- **Watch Ad → Refill 1 Energy** and **Watch Ad → Earn 100 Coins**. A simulated ad overlay calls a
  completion callback that persists the reward to the database immediately.

### 6. Daily Rewards
- **Daily Claim** widget: after 24h, claim **+500 Coins** and increment your streak.

### 7. Theme
- Dark cyberpunk: deep charcoal background, neon cyan/magenta/gold accents, glowing neon-bordered
  player cards (Bronze = brown, Silver = gray, Gold = yellow, Elite = glowing neon purple).

## API (quick reference)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/signup` | Register + starter pack |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/me` | User stats + collection + lineups |
| GET | `/api/config` | Pack odds, positions, costs |
| POST | `/api/lineups/set` | Assign card to a slot |
| POST | `/api/shop/buy` | Buy a Premium Pack |
| POST | `/api/match` | Play a Vs match (costs energy) |
| POST | `/api/ads/energy` | Refill 1 energy (after ad) |
| POST | `/api/ad/coins` | +100 coins (after ad) |
| POST | `/api/daily/claim` | Claim daily reward |

> **Note:** Ad rewards are exposed as real API endpoints for testability; the frontend wraps them in
> a simulated ad-network overlay before calling the completion callback. Swap the mock for a real ad
> SDK by calling these endpoints from your rewarded-ad callback.