// Seed card database for Ultra Grid League.
// Each sport has 3 active roster positions. Players span Bronze/Silver/Gold/Elite rarities.
// The "starter" flag marks the Bronze (60-65 OVR) players given to new users as a Starter Pack.

const POSITIONS = {
  NBA: ["Guard", "Forward", "Center"],
  NFL: ["Quarterback", "Wide Receiver", "Running Back"],
  MLB: ["Pitcher", "Catcher", "Outfielder"],
  NHL: ["Forward", "Defender", "Goalie"],
  Soccer: ["Forward", "Midfielder", "Goalkeeper"]
};

// [name, sport, position, ovr, starter(boolean)]
// One starter per position per sport (60-65). The rest populate Premium Packs.
const PLAYERS = [
  // ================= NBA =================
  ["Stephen Curry", "NBA", "Guard", 88],
  ["Luka Dončić", "NBA", "Guard", 94],
  ["Anthony Edwards", "NBA", "Guard", 85],
  ["Trae Young", "NBA", "Guard", 75],
  ["Derrick White", "NBA", "Guard", 72],
  ["Cole Anthony", "NBA", "Guard", 65, true],
  ["Kendall Black", "NBA", "Guard", 63],
  ["Tyrese Halloway", "NBA", "Guard", 61],

  ["LeBron James", "NBA", "Forward", 93],
  ["Giannis Antetokounmpo", "NBA", "Forward", 94],
  ["Jayson Tatum", "NBA", "Forward", 88],
  ["Brandon Ingram", "NBA", "Forward", 74],
  ["Kay Barnes", "NBA", "Forward", 64, true],
  ["Micah Randle", "NBA", "Forward", 62],
  ["Dax Jenkins", "NBA", "Forward", 60],

  ["Nikola Jokić", "NBA", "Center", 96],
  ["Joel Embiid", "NBA", "Center", 92],
  ["Bam Adebayo", "NBA", "Center", 78],
  ["Moe Bamba", "NBA", "Center", 63, true],
  ["Sasha Petrova", "NBA", "Center", 61],

  // ================= MLB =================
  ["Shohei Ohtani", "MLB", "Pitcher", 99],
  ["Jacob deGrom", "MLB", "Pitcher", 90],
  ["Zack Wheeler", "MLB", "Pitcher", 85],
  ["Hunter Greene", "MLB", "Pitcher", 78],
  ["Cole Ramos", "MLB", "Pitcher", 72],
  ["Rex Calloway", "MLB", "Pitcher", 64, true],
  ["Billy Tanner", "MLB", "Pitcher", 61],

  ["Adley Rutschman", "MLB", "Catcher", 82],
  ["J.T. Realmuto", "MLB", "Catcher", 80],
  ["Kyle Stingray", "MLB", "Catcher", 64, true],
  ["Marco Diaz", "MLB", "Catcher", 60],

  ["Aaron Judge", "MLB", "Outfielder", 91],
  ["Mike Trout", "MLB", "Outfielder", 90],
  ["Ronald Acuña Jr.", "MLB", "Outfielder", 88],
  ["Corbin Carroll", "MLB", "Outfielder", 82],
  ["Tyler O'Neill", "MLB", "Outfielder", 76],
  ["Zane Porter", "MLB", "Outfielder", 65, true],
  ["Luke Fontaine", "MLB", "Outfielder", 62],

  // ================= NFL =================
  ["Patrick Mahomes", "NFL", "Quarterback", 96],
  ["Josh Allen", "NFL", "Quarterback", 93],
  ["Lamar Jackson", "NFL", "Quarterback", 90],
  ["Joe Burrow", "NFL", "Quarterback", 86],
  ["Caleb Williams", "NFL", "Quarterback", 79],
  ["Mason Blake", "NFL", "Quarterback", 64, true],
  ["Cody Sterling", "NFL", "Quarterback", 61],

  ["Tyreek Hill", "NFL", "Wide Receiver", 88],
  ["Justin Jefferson", "NFL", "Wide Receiver", 87],
  ["Ja'Marr Chase", "NFL", "Wide Receiver", 84],
  ["A.J. Brown", "NFL", "Wide Receiver", 80],
  ["Rico Vance", "NFL", "Wide Receiver", 64, true],
  ["Silas Moore", "NFL", "Wide Receiver", 60],

  ["Christian McCaffrey", "NFL", "Running Back", 89],
  ["Bijan Robinson", "NFL", "Running Back", 85],
  ["Derrick Henry", "NFL", "Running Back", 82],
  ["Rashad Boone", "NFL", "Running Back", 64, true],
  ["Trey Kimble", "NFL", "Running Back", 62],

  // ================= NHL =================
  ["Connor McDavid", "NHL", "Forward", 94],
  ["Auston Matthews", "NHL", "Forward", 88],
  ["Nathan MacKinnon", "NHL", "Forward", 90],
  ["Brock Faber", "NHL", "Forward", 76],
  ["Pavel Orlov", "NHL", "Forward", 64, true],
  ["Sven Kask", "NHL", "Forward", 61],

  ["Cale Makar", "NHL", "Defender", 90],
  ["Victor Hedman", "NHL", "Defender", 85],
  ["Brett Marcell", "NHL", "Defender", 64, true],
  ["Owen Draper", "NHL", "Defender", 62],

  ["Andrei Vasilevskiy", "NHL", "Goalie", 89],
  ["Igor Shesterkin", "NHL", "Goalie", 88],
  ["Linus Ullmark", "NHL", "Goalie", 80],
  ["Tomas Hedlund", "NHL", "Goalie", 63, true],
  ["Erik Dahl", "NHL", "Goalie", 60],

  // ================= Soccer =================
  ["Lionel Messi", "Soccer", "Forward", 93],
  ["Kylian Mbappé", "Soccer", "Forward", 90],
  ["Erling Haaland", "Soccer", "Forward", 92],
  ["Vinícius Júnior", "Soccer", "Forward", 85],
  ["Mateo Cruz", "Soccer", "Forward", 65, true],
  ["Ayo Bakare", "Soccer", "Forward", 62],

  ["Kevin De Bruyne", "Soccer", "Midfielder", 91],
  ["Jude Bellingham", "Soccer", "Midfielder", 89],
  ["Luka Modrić", "Soccer", "Midfielder", 82],
  ["Pablo Vega", "Soccer", "Midfielder", 64, true],
  ["Sani Traoré", "Soccer", "Midfielder", 61],

  ["Thibaut Courtois", "Soccer", "Goalkeeper", 90],
  ["Alisson Becker", "Soccer", "Goalkeeper", 88],
  ["Marcos Silva", "Soccer", "Goalkeeper", 64, true],
  ["Nico Ferreira", "Soccer", "Goalkeeper", 60]
];

// Rarity tiers by OVR
function rarityFor(ovr) {
  if (ovr >= 90) return "Elite";
  if (ovr >= 80) return "Gold";
  if (ovr >= 70) return "Silver";
  return "Bronze";
}

// Normalize a player row into a card object
function buildCards() {
  return PLAYERS.map((p, i) => {
    const [name, sport, position, ovr, starter] = p;
    return {
      id: i + 1,
      player_name: name,
      sport,
      position,
      ovr,
      starter: !!starter,
      rarity: rarityFor(ovr)
    };
  });
}

module.exports = { POSITIONS, PLAYERS, buildCards, rarityFor };