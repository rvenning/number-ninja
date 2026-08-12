// The Den — one spirit per times table, 2 through 12.
//
// This is the whole meta-game, and it is deliberately not a currency: a
// creature's growth IS her mastery of that table, read straight off the fact
// model. There is nothing to buy, nothing to grind that isn't maths, and no way
// to advance one except by knowing its table. Practise the 8s and Inkling grows
// — and so, a little, does Prism, because 7x8 belongs to both of them.
//
// Each spirit's animal is a mnemonic for its own number (a butterfly has two
// wings, an octopus has eight arms, a cat has nine lives), so the Den is
// quietly a second way of remembering which table is which.

const CREATURES = [
  { t: 2,  name: "Flutter",  icon: "🦋", hue: "#8ee6ff", why: "two wings" },
  { t: 3,  name: "Trill",    icon: "🐦", hue: "#a4e57a", why: "three little hops" },
  { t: 4,  name: "Padfoot",  icon: "🐕", hue: "#ffc46b", why: "four paws" },
  { t: 5,  name: "Starla",   icon: "⭐", hue: "#ffe45e", why: "five points" },
  { t: 6,  name: "Buzzwing", icon: "🐝", hue: "#ffd23f", why: "six legs" },
  { t: 7,  name: "Prism",    icon: "🌈", hue: "#ff8fd0", why: "seven colours" },
  { t: 8,  name: "Inkling",  icon: "🐙", hue: "#c78bff", why: "eight arms" },
  { t: 9,  name: "Nina",     icon: "🐈", hue: "#ff9a6b", why: "nine lives" },
  { t: 10, name: "Digit",    icon: "🐼", hue: "#dfe7f2", why: "ten fingers" },
  { t: 11, name: "Skipper",  icon: "🐧", hue: "#7ac6ff", why: "eleven on a team" },
  { t: 12, name: "Draco",    icon: "🐲", hue: "#7ee6b0", why: "twelve months" },
];

const CREATURE_BY_TABLE = Object.fromEntries(CREATURES.map((c) => [c.t, c]));

// Four stages. The thresholds are strengths, not answer counts, so a spirit
// cannot be hatched by spamming the two facts she already knows — every one of
// its eleven facts has to carry some of the average.
const STAGES = [
  { id: "egg",     name: "Egg",       at: 0,    icon: "🥚", blurb: "Not stirring yet." },
  { id: "hatch",   name: "Hatchling", at: 0.25, icon: null, blurb: "Just woken up!" },
  { id: "adept",   name: "Adept",     at: 0.6,  icon: null, blurb: "Getting strong." },
  { id: "master",  name: "Master",    at: 0.9,  icon: null, blurb: "Fully grown. 👑" },
];

function stageFor(progress) {
  let s = STAGES[0];
  for (const st of STAGES) if (progress >= st.at) s = st;
  return s;
}

function stageIndex(progress) {
  return STAGES.indexOf(stageFor(progress));
}

// Everything a screen needs about one spirit, in one call.
function creatureState(mastery, t) {
  const c = CREATURE_BY_TABLE[t];
  const p = Mastery.tableProgress(mastery, t);
  const st = stageFor(p);
  const next = STAGES[STAGES.indexOf(st) + 1] || null;
  return {
    ...c,
    progress: p,
    stage: st,
    stageIdx: STAGES.indexOf(st),
    icon: st.id === "egg" ? "🥚" : c.icon,
    next,
    toNext: next ? Math.max(0, next.at - p) : 0,
  };
}

function denSummary(mastery) {
  const all = CREATURES.map((c) => creatureState(mastery, c.t));
  return {
    all,
    hatched: all.filter((c) => c.stageIdx >= 1).length,
    masters: all.filter((c) => c.stageIdx >= 3).length,
  };
}

// Spirits that grew a stage as a result of one session — used for the "🎉 Prism
// hatched!" line on the results screen. Compared against a snapshot taken
// before the session, because the mastery object is mutated in place.
function evolutions(before, after) {
  const out = [];
  for (const c of CREATURES) {
    const a = stageIndex(Mastery.tableProgress(before, c.t));
    const b = stageIndex(Mastery.tableProgress(after, c.t));
    if (b > a) out.push({ ...CREATURE_BY_TABLE[c.t], from: STAGES[a], to: STAGES[b] });
  }
  return out;
}
