// The campaign: twelve belts, white to grandmaster.
//
// The ramp is deliberately NOT mostly speed. Speed caps out fast for an
// eight-year-old and then just becomes a wall; what actually gets harder here
// is which tables are in play (2s and 10s, then the 3s and 4s, then the 6-7-8-9
// core), how many wrong answers are flying alongside the right one, and which
// direction the question is asked in. `arc` (how high a number is thrown, and
// therefore how long it hangs in the air) moves only gently across the whole
// campaign.
//
// Three kinds of wave:
//   answer      7 x 8 = ?          slice 56          — recall, the main drill
//   factor      ? x 8 = 56         slice 7           — the division direction
//   multiples   "multiples of 7"   slice 42, 56, 63  — recognition, high volume
//
// A `multiples` wave with no `table` of its own rotates through the belt's
// tables so a two-table belt covers both.

const BELTS = [
  {
    id: "white", name: "White Belt", icon: "🤍", tint: "#f2f4f8",
    tables: [2, 10], hearts: 7, arc: 470, gap: 0.55, opts: 3,
    blurb: "Doubles and tens — the two easiest tables there are.",
    waves: [
      { type: "answer", n: 8 },
      { type: "multiples", table: 2, n: 12 },
      { type: "answer", n: 8 },
      { type: "multiples", table: 10, n: 12 },
    ],
  },
  {
    id: "yellow", name: "Yellow Belt", icon: "💛", tint: "#ffd94a",
    tables: [5, 2], hearts: 7, arc: 465, gap: 0.55, opts: 3,
    blurb: "Fives join in. Every answer ends in 5 or 0.",
    waves: [
      { type: "answer", n: 9, tables: [5] },
      { type: "multiples", table: 5, n: 12 },
      { type: "answer", n: 9 },
      { type: "factor", n: 7, tables: [5, 2] },
    ],
  },
  {
    id: "orange", name: "Orange Belt", icon: "🧡", tint: "#ff9f45",
    tables: [2, 5, 10], hearts: 6, arc: 460, gap: 0.52, opts: 4,
    blurb: "All three easy tables at once — and backwards questions.",
    waves: [
      { type: "answer", n: 10 },
      { type: "factor", n: 8 },
      { type: "multiples", n: 14 },
      { type: "answer", n: 10 },
    ],
  },
  {
    id: "green", name: "Green Belt", icon: "💚", tint: "#5fd48a",
    tables: [3], hearts: 6, arc: 450, gap: 0.5, opts: 4,
    blurb: "The three times table, on its own, until it sticks.",
    waves: [
      { type: "answer", n: 10 },
      { type: "multiples", n: 14 },
      { type: "factor", n: 8 },
      { type: "answer", n: 10 },
    ],
  },
  {
    id: "blue", name: "Blue Belt", icon: "💙", tint: "#4fb8ff",
    tables: [4], hearts: 6, arc: 445, gap: 0.5, opts: 4,
    blurb: "Fours. Double a double — Padfoot will show you.",
    waves: [
      { type: "answer", n: 10 },
      { type: "multiples", n: 14 },
      { type: "factor", n: 8 },
      { type: "answer", n: 10 },
    ],
  },
  {
    id: "purple", name: "Purple Belt", icon: "💜", tint: "#a97bff",
    tables: [3, 4, 5], hearts: 5, arc: 435, gap: 0.48, opts: 4,
    blurb: "Threes, fours and fives shuffled together.",
    waves: [
      { type: "answer", n: 11 },
      { type: "factor", n: 9 },
      { type: "multiples", n: 14 },
      { type: "answer", n: 11 },
    ],
  },
  {
    id: "brown", name: "Brown Belt", icon: "🤎", tint: "#b87a4a",
    tables: [6], hearts: 5, arc: 430, gap: 0.46, opts: 4,
    blurb: "Sixes. Half of them you already know from the threes.",
    waves: [
      { type: "answer", n: 11 },
      { type: "multiples", n: 14 },
      { type: "factor", n: 9 },
      { type: "answer", n: 11 },
    ],
  },
  {
    id: "red", name: "Red Belt", icon: "❤️", tint: "#ff5f6d",
    tables: [7], hearts: 5, arc: 425, gap: 0.45, opts: 5,
    blurb: "Sevens — the hardest table in the whole game. Take your time.",
    waves: [
      { type: "answer", n: 11 },
      { type: "multiples", n: 14 },
      { type: "factor", n: 9 },
      { type: "answer", n: 11 },
    ],
  },
  {
    id: "black", name: "Black Belt", icon: "🖤", tint: "#3b4152",
    tables: [8], hearts: 4, arc: 420, gap: 0.44, opts: 5,
    blurb: "Eights. Double the fours, then double again.",
    waves: [
      { type: "answer", n: 12 },
      { type: "multiples", n: 14 },
      { type: "factor", n: 10 },
      { type: "answer", n: 12 },
    ],
  },
  {
    id: "black2", name: "Black Belt II", icon: "🥋", tint: "#5a6274",
    tables: [9], hearts: 4, arc: 415, gap: 0.43, opts: 5,
    blurb: "Nines. The digits of every answer add up to nine.",
    waves: [
      { type: "answer", n: 12 },
      { type: "multiples", n: 14 },
      { type: "factor", n: 10 },
      { type: "answer", n: 12 },
    ],
  },
  {
    id: "silver", name: "Silver Sash", icon: "🥈", tint: "#c3ccdd",
    // Five rounds rather than four, because it covers two tables — so each one
    // is shorter, or this belt is half as long again as anything before it and
    // the hearts have to stretch across all of it.
    tables: [11, 12], hearts: 6, arc: 410, gap: 0.42, opts: 5,
    blurb: "Elevens and twelves — the last two, and Draco is waiting.",
    waves: [
      { type: "answer", n: 10 },
      { type: "multiples", table: 11, n: 10 },
      { type: "multiples", table: 12, n: 10 },
      { type: "factor", n: 8 },
      { type: "answer", n: 10 },
    ],
  },
  {
    id: "grand", name: "Grandmaster", icon: "🏆", tint: "#ffd93b",
    // The longest belt with the fewest hearts. By the time she gets here the
    // campaign has taught her most of the bank, so what is left to test is
    // holding it together over sixty-odd questions rather than any one fact.
    tables: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], hearts: 3, arc: 405, gap: 0.4, opts: 5,
    blurb: "Everything, all at once. The whole dojo is watching.",
    waves: [
      { type: "answer", n: 16 },
      { type: "factor", n: 14 },
      { type: "multiples", n: 18 },
      { type: "answer", n: 16 },
    ],
  },
];

const BELT_BY_ID = Object.fromEntries(BELTS.map((b) => [b.id, b]));

// Grades are accuracy, never speed. A careful player who thinks about every
// question can three-star the whole campaign; a fast, sloppy one cannot.
const GRADE = { pass: 0.6, two: 0.8, three: 0.93 };

// hits / (targets + wrongs): a wrong slice hurts as much as a missed one, and
// correcting yourself after a wrong slice still leaves the wrong slice counted.
function accuracyOf(st) {
  const denom = st.targets + st.wrongs;
  return denom ? st.hits / denom : 0;
}

function gradeRun(st) {
  const hitRate = st.targets ? st.hits / st.targets : 0;
  const won = st.hearts > 0 && hitRate >= GRADE.pass;
  const acc = accuracyOf(st);
  let stars = 0;
  if (won) stars = acc >= GRADE.three ? 3 : acc >= GRADE.two ? 2 : 1;
  return { won, stars, accuracy: acc, hitRate };
}

// Sensei's Test — the endless mode, and the only thing on the family
// leaderboard, because a score is the one number everybody can compare.
//
// The arc shrinks geometrically with NO floor, which is what makes the mode
// terminate for a player who never gets one wrong: once a throw's apex drops
// below the slice line the number never rises into play at all and the miss is
// forced. A floor here would mean a flawless player runs forever and there is
// no score to put on a board.
const TEST = {
  hearts: 5,
  arc0: 470,
  arcDecay: 0.973,
  gap: 0.42,
  opts: 5,
  tables: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  arcAt(n) { return this.arc0 * Math.pow(this.arcDecay, n); },
};

// Free practice on one table. No hearts, no score, no ending — just the drill,
// with the mastery model still recording every answer. This is where a wall in
// the campaign is meant to be solved.
const PRACTICE = { arc: 480, gap: 0.5, opts: 4 };
