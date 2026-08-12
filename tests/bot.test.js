"use strict";
// Headless balance bots. These drive the REAL engine (js/game.js touches no
// DOM, canvas, audio or clock) through every belt, so the numbers below are
// what a player actually meets.
//
// The cast, and why each one is here:
//
//   sensei   — knows every fact, cuts precisely, never touches a decoy. The
//              guardrail: no belt may be unwinnable by it.
//   rosalie  — the tuning target. An eight-year-old learning her tables: solid
//              on the 2s/5s/10s, patchy in the 6-7-8-9 core, slower on the hard
//              ones, and occasionally reaching for the plausible wrong number
//              rather than the right one. Crucially she LEARNS — seeing a fact
//              makes her likelier to know it next time — because the one thing
//              this game has to prove is that it teaches.
//   idle     — the control. Never swipes. Must win nothing.
//   slasher  — the other control, and the important one here: cutting every
//              number in the air is the obvious cheat in a slicing game, and it
//              must be strictly worse than not playing.
//
//   cd number-ninja && node --test
//   CD_REPORT=1 node --test tests/bot.test.js      # the per-belt table

const path = require("node:path");
const { loadScripts } = require("../lib/tools/test-harness.js");

const ROOT = path.join(__dirname, "..");
const S = loadScripts({
  baseDir: ROOT,
  files: ["tests/seed.js", "js/facts.js", "js/creatures.js", "js/belts.js", "js/game.js"],
  exports: ["Game", "BELTS", "TEST", "PRACTICE", "GRADE", "FACTS", "FACT_BY_KEY",
            "Mastery", "OPERAND_LOAD", "TABLES", "tableFacts",
            "LW", "LH", "SLICE_Y", "OBJ_R", "MIN_LIVE_ARC", "LAUNCH_Y",
            "segCircleHit", "gradeRun", "accuracyOf", "__reseed", "__rand"],
});
const { Game, BELTS, TEST, Mastery } = S;
const rnd = () => S.__rand();

/* ========================================================================== *
 * Cutting, the way a person cuts
 * ========================================================================== */

function liveObjs(G) {
  return G.objs.filter((o) => o.delay <= 0 && !o.sliced && !o.spent && o.y <= S.SLICE_Y);
}

// A short blade stroke through one number's middle. Anything whose centre lies
// within a radius of that stroke goes with it — exactly as it would for a
// finger — which is what makes "would this also cut something else?" a real
// question the bots have to answer.
function cut(G, o) { return G.swipe(o.x - 4, o.y, o.x + 4, o.y); }

function wouldAlsoCut(G, o) {
  return liveObjs(G).some((x) => x !== o && S.segCircleHit(o.x - 4, o.y, o.x + 4, o.y, x.x, x.y, x.r));
}

/* ========================================================================== *
 * The bots
 * ========================================================================== */

function senseiBrain() {
  let blocked = 0;
  return (G, dt) => {
    if (!G.running) return;
    if (G.wave.type === "multiples") {
      for (const o of liveObjs(G)) if (o.good && !wouldAlsoCut(G, o)) cut(G, o);
      return;
    }
    const q = G.q;
    if (!q || q.done) { blocked = 0; return; }
    const target = liveObjs(G).find((o) => o.qid === q.id && o.good);
    if (!target) return;
    // Two discs briefly on top of each other: wait a moment for the fan to
    // open rather than take a wrong one with it. Not forever, though — a bot
    // that can deadlock reports a hang that isn't there.
    if (wouldAlsoCut(G, target)) { blocked += dt; if (blocked < 0.7) return; }
    blocked = 0;
    cut(G, target);
  };
}

const idleBrain = () => () => {};

const slasherBrain = () => (G) => {
  if (!G.running) return;
  for (const o of liveObjs(G)) cut(G, o);
};

// How well she knows a fact right now: a floor set by how hard the fact is,
// plus whatever she has picked up from meeting it. `learn` is the bot's OWN
// model of her head — deliberately not the game's mastery object, so an
// assertion about teaching isn't just the game grading its own homework.
function makeLearner() {
  return {
    learn: {},
    BASE: [0.96, 0.88, 0.74, 0.6, 0.48, 0.38, 0.3],
    knows(key, load) { return Math.min(0.985, this.BASE[load] + (this.learn[key] || 0)); },
    saw(key, right) {
      this.learn[key] = Math.min(0.92, (this.learn[key] || 0) + (right ? 0.16 : 0.09));
    },
  };
}

function rosalieBrain(head) {
  let plan = null;
  const decided = new Map();

  const react = (load) => 0.34 + load * 0.11 + rnd() * 0.28;

  return (G, dt) => {
    if (!G.running) return;

    /* ---- recognition rounds: is this one in the table or not? ---- */
    if (G.wave.type === "multiples") {
      const t = G.streamTable;
      const hard = S.OPERAND_LOAD[t] || 0;
      for (const o of liveObjs(G)) {
        if (!decided.has(o.id)) {
          // For a real multiple this is how likely she is to spot it; for a
          // decoy it is how likely she is to cut it anyway — a false alarm on
          // a number sitting one away from a real multiple, much likelier in
          // the hard tables than in the 2s and 10s.
          const p = o.good
            ? head.knows(o.factKey, S.FACT_BY_KEY[o.factKey] ? S.FACT_BY_KEY[o.factKey].load : 2)
            : 0.03 + hard * 0.03;
          decided.set(o.id, { go: rnd() < p, at: G.elapsed + react(hard) });
        }
        const d = decided.get(o.id);
        if (d.go && G.elapsed >= d.at && !wouldAlsoCut(G, o)) {
          cut(G, o);
          if (o.good) head.saw(o.factKey, true);
        }
      }
      if (decided.size > 400) decided.clear();
      return;
    }

    /* ---- recall rounds ---- */
    const q = G.q;
    if (!q || q.done) { plan = null; return; }
    if (!plan || plan.qid !== q.id) {
      plan = {
        qid: q.id, tried: 0,
        knows: rnd() < head.knows(q.key, q.load),
        at: G.elapsed + react(q.load),
      };
    }
    if (G.elapsed < plan.at) return;

    const mine = liveObjs(G).filter((o) => o.qid === q.id);
    if (!mine.length) return;

    // After a first wrong guess she often works it out — the wrong one has gone,
    // and being wrong once is itself a prompt.
    // With one option eliminated and the prompt of having just been wrong, a
    // second guess is a good deal better than chance but far from certain.
    const goRight = plan.knows || (plan.tried >= 1 && rnd() < 0.6);
    // Even knowing it, a hurried swipe sometimes lands on the number next door.
    const slip = goRight && rnd() < 0.035;

    let target;
    if (goRight && !slip) {
      target = mine.find((o) => o.good);
    } else {
      const wrong = mine.filter((o) => !o.good);
      // She reaches for the plausible one, not a random one.
      target = wrong.sort((a, b) => Math.abs(a.val - q.answer) - Math.abs(b.val - q.answer))[0]
        || mine.find((o) => o.good);
    }
    if (!target) return;
    if (wouldAlsoCut(G, target)) { plan.at += dt; return; }

    cut(G, target);
    head.saw(q.key, target.good);
    plan.tried++;
    plan.at = G.elapsed + 0.3 + rnd() * 0.4;      // a beat to reconsider
  };
}

/* ========================================================================== *
 * Drivers
 * ========================================================================== */

const CAP = 60 * 600;      // ten minutes of simulated play is a hang, not a belt

function drive(brain) {
  let f = 0;
  while (Game.running && f < CAP) { Game.update(1 / 60); brain(Game, 1 / 60); f++; }
  const hung = Game.running;
  if (hung) Game.quit();
  return { ...Game.result, seconds: f / 60, hung };
}

function playBelt(i, brain, mastery) {
  Game.start({ mode: "belt", beltIdx: i, mastery: mastery || {} });
  return drive(brain);
}

function playTest(brain, mastery) {
  Game.start({ mode: "test", mastery: mastery || {} });
  return drive(brain);
}

// One bot, fresh, through the whole campaign in order — each belt once, with
// whatever it learned from the last one. "Level 30 with the starting loadout"
// is a situation nobody meets; neither is "the 9s belt knowing nothing".
function campaign(makeBrain, seed, opts = {}) {
  S.__reseed(seed);
  const mastery = {};
  const head = makeLearner();
  const brain = makeBrain(head);
  const rows = [];
  for (let i = 0; i < BELTS.length; i++) {
    rows.push(playBelt(i, brain, opts.freshMastery ? {} : mastery));
    if (opts.stopOnLoss && !rows[rows.length - 1].won) break;
  }
  return { rows, mastery, head };
}

/* ========================================================================== *
 * Runs (once, shared by the report and the assertions)
 * ========================================================================== */

// The perfect and control bots are deterministic given a seed, so one run each
// says everything. The LEARNER is not — she guesses — and a single-seed table
// measures the shuffle rather than the design, so she is replayed over a fixed
// spread of seeds and every claim about her is an aggregate.
const SEEDS = [20260812, 7, 19, 314, 1001, 55, 883, 4242,
               31337, 606, 8, 271828, 99, 1234, 57, 40404];

const sensei = campaign(() => senseiBrain(), 20260812, { freshMastery: true });
const idle = campaign(() => idleBrain(), 20260812, { freshMastery: true });
const slasher = campaign(() => slasherBrain(), 20260812, { freshMastery: true });
const learners = SEEDS.map((s) => campaign((h) => rosalieBrain(h), s));

const wins = (r) => r.rows.filter((x) => x.won).length;
const stars = (r) => r.rows.reduce((s, x) => s + (x.stars || 0), 0);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

// How often a learner passes each belt first time, across the whole spread.
const passRate = BELTS.map((_, i) => mean(learners.map((r) => (r.rows[i] && r.rows[i].won ? 1 : 0))));
const meanWins = mean(learners.map(wins));
const meanStars = mean(learners.map(stars));

function testRuns(makeBrain) {
  return SEEDS.map((s) => { S.__reseed(s); return playTest(makeBrain(), {}); });
}
const senseiTests = testRuns(() => senseiBrain());
const learnerTests = testRuns(() => rosalieBrain(makeLearner()));
S.__reseed(77);
const idleTest = playTest(idleBrain(), {});
S.__reseed(77);
const slasherTest = playTest(slasherBrain(), {});
const senseiTest = senseiTests[0];

/* ========================================================================== *
 * Report
 * ========================================================================== */

if (process.env.CD_REPORT) {
  console.log("\nbelt                    sensei      idle     slash   rosalie(x" + SEEDS.length + ")");
  BELTS.forEach((b, i) => {
    const cell = (r) => {
      const x = r.rows[i];
      if (!x) return "-".padStart(10);
      return `${x.won ? x.stars + "*" : "LOSS"}`.padStart(10);
    };
    const rs = learners.map((r) => r.rows[i]).filter(Boolean);
    const avgStars = mean(rs.map((x) => x.stars || 0)).toFixed(1);
    const avgW = Math.round(mean(rs.map((x) => x.wrongs)));
    console.log(
      `${String(i + 1).padStart(2)} ${b.name.padEnd(16)}${cell(sensei)}${cell(idle)}${cell(slasher)}` +
      `   pass ${String(Math.round(passRate[i] * 100)).padStart(3)}%  ${avgStars}*  ${avgW}w  ${b.hearts}❤`);
  });
  console.log(`\nsensei    wins ${wins(sensei)}/12  stars ${stars(sensei)}/36  ` +
    `${Math.round(sensei.rows.reduce((s, x) => s + x.seconds, 0))}s total`);
  console.log(`rosalie   wins ${meanWins.toFixed(1)}/12 (${learners.map(wins).join(",")})  stars ${meanStars.toFixed(1)}/36`);
  console.log(`idle      wins ${wins(idle)}   slasher wins ${wins(slasher)}`);
  const hung = [sensei, idle, slasher, ...learners].reduce((s, r) => s + r.rows.filter((x) => x.hung).length, 0);
  console.log(`hung: ${hung}`);

  console.log("\nSensei's Test");
  console.log(`  sensei    score ${Math.round(mean(senseiTests.map((r) => r.score)))}  ` +
    `${mean(senseiTests.map((r) => r.answered)).toFixed(1)} asked  ${mean(senseiTests.map((r) => r.seconds)).toFixed(0)}s`);
  console.log(`  rosalie   score ${Math.round(mean(learnerTests.map((r) => r.score)))}  ` +
    `${mean(learnerTests.map((r) => r.answered)).toFixed(1)} asked  (${learnerTests.map((r) => r.answered).join(",")})`);
  console.log(`  idle      score ${idleTest.score}  ${idleTest.answered} asked`);
  console.log(`  slash     score ${slasherTest.score}  ${slasherTest.answered} asked`);

  console.log(`\nmastery after one campaign: ${learners.map((r) => Mastery.mastered(r.mastery)).join(", ")} of 66`);
  console.log(`belt seconds (sensei): ${sensei.rows.map((r) => Math.round(r.seconds)).join(", ")}`);
  return;
}

/* ========================================================================== *
 * Assertions
 * ========================================================================== */

const { test } = require("node:test");
const assert = require("node:assert");

test("nothing hangs — every belt ends by itself for every bot", () => {
  const hung = [];
  const all = [["sensei", sensei], ["idle", idle], ["slasher", slasher],
               ...learners.map((r, i) => [`rosalie#${i}`, r])];
  for (const [name, r] of all) {
    r.rows.forEach((x, i) => { if (x.hung) hung.push(`${name} @ ${BELTS[i].name}`); });
  }
  assert.deepEqual(hung, []);
});

test("every belt is winnable, with three stars, by someone who knows their tables", () => {
  const bad = sensei.rows.map((r, i) => (r.won && r.stars === 3 ? null : `${BELTS[i].name} (${r.won ? r.stars + "*" : "LOSS"})`)).filter(Boolean);
  assert.deepEqual(bad, []);
});

test("a belt is a session, not an evening", () => {
  // Measured against the bot, which answers the instant it can. A child adds a
  // second or two of thinking to every question, so these roughly double.
  const long = sensei.rows.map((r, i) => (r.seconds > 210 ? `${BELTS[i].name} ${Math.round(r.seconds)}s` : null)).filter(Boolean);
  const short = sensei.rows.map((r, i) => (r.seconds < 35 ? `${BELTS[i].name} ${Math.round(r.seconds)}s` : null)).filter(Boolean);
  assert.deepEqual(long, [], "these belts drag");
  assert.deepEqual(short, [], "these belts are over before they start");
});

test("doing nothing wins nothing at all", () => {
  assert.equal(wins(idle), 0, "the idle bot passed a belt");
  assert.equal(stars(idle), 0);
  assert.equal(idle.rows.reduce((s, r) => s + r.score, 0), 0, "the idle bot scored");
  assert.equal(idleTest.score, 0);
});

test("slicing everything is strictly worse than playing — the obvious cheat must not work", () => {
  assert.equal(wins(slasher), 0, "the slash-everything bot passed a belt");
  // And it must not merely fail: it has to fail FAST, or it is a viable way to
  // farm score off the answers it happens to catch.
  const early = slasher.rows.every((r) => r.hearts === 0);
  assert.ok(early, "the slasher survived a belt with hearts to spare");
  assert.ok(slasherTest.score < senseiTest.score * 0.2,
    `slashing scored ${slasherTest.score} against ${senseiTest.score} for real play`);
});

test("an eight-year-old learning her tables gets a real way through the campaign", () => {
  assert.ok(meanWins >= 5.5, `the learner averaged ${meanWins.toFixed(1)}/${BELTS.length} belts first time — too punishing`);
  assert.ok(meanWins <= 11, `the learner averaged ${meanWins.toFixed(1)}/${BELTS.length} first time — nothing to come back for`);
  assert.ok(meanStars < BELTS.length * 3 * 0.7,
    `the learner averaged ${meanStars.toFixed(1)} stars — the grades are being handed out`);
});

test("the on-ramp is gentle: the first four belts fall on nearly every attempt", () => {
  const weak = passRate.slice(0, 4)
    .map((p, i) => (p < 0.85 ? `${BELTS[i].name} ${Math.round(p * 100)}%` : null)).filter(Boolean);
  assert.deepEqual(weak, [], "a learner should not be bouncing off the 2s, 5s, 10s and 3s");
});

test("the back half is a real challenge, not a formality", () => {
  const hard = passRate.slice(6).filter((p) => p <= 0.7).length;
  assert.ok(hard >= 2,
    `only ${hard} of the last six belts made a learner work for it — the campaign has no teeth`);
  assert.ok(passRate.some((p) => p > 0.9), "not one belt is a reliable win — that is a wall, not a curve");
});

test("the game TEACHES: a belt she fails is one she can come back and pass", () => {
  // The anti-stuck guarantee, and the whole point of the thing. She starts
  // knowing nothing beyond her age, and retries the 7s belt. Her own knowledge
  // and the game's targeting of her weak facts both persist between attempts,
  // so the belt has to fall within a handful of goes.
  S.__reseed(4242);
  const RED = BELTS.findIndex((b) => b.tables.length === 1 && b.tables[0] === 7);
  assert.ok(RED > 0, "there is no single-table belt for the 7s");
  const head = makeLearner();
  const brain = rosalieBrain(head);
  const mastery = {};
  let attempts = 0, won = false;
  while (attempts < 8 && !won) {
    attempts++;
    won = playBelt(RED, brain, mastery).won;
  }
  assert.ok(won, `eight attempts at ${BELTS[RED].name} and still stuck — the game does not teach`);
  assert.ok(attempts <= 5, `it took ${attempts} attempts to pass the 7s — too grindy`);

  const sevens = S.tableFacts(7);
  const strong = sevens.filter((f) => Mastery.strength(mastery, f.key) >= 0.6).length;
  assert.ok(strong >= 6, `only ${strong}/11 of the 7s facts got strong — the drill isn't landing`);
});

test("Sensei's Test ends by itself, even for a player who never gets one wrong", () => {
  const hung = senseiTests.filter((r) => r.hung).length;
  assert.equal(hung, 0, "endless never ended for a perfect player — there is no score to put on a board");
  const asked = mean(senseiTests.map((r) => r.answered));
  assert.ok(asked >= 25, `a perfect run lasted only ${asked.toFixed(1)} questions`);
  assert.ok(asked <= 80, `a perfect run reached ${asked.toFixed(1)} questions — too long to retry`);
  const secs = mean(senseiTests.map((r) => r.seconds));
  assert.ok(secs >= 40 && secs <= 240, `a perfect run took ${Math.round(secs)}s`);
});

test("what ends it is the throw itself, not a hidden timer", () => {
  // The arc shrinks with no floor, so past a certain question a number never
  // rises into play at all and the miss is forced. If a floor ever crept back
  // in, a flawless player would run forever and this is the assertion that
  // would notice.
  const n = senseiTest.answered + 6;
  assert.ok(TEST.arcAt(n) < S.MIN_LIVE_ARC,
    `by question ${n} the arc is still ${Math.round(TEST.arcAt(n))}, above the ${S.MIN_LIVE_ARC} needed to reach the blade`);
  assert.ok(TEST.arcAt(0) > S.MIN_LIVE_ARC * 3, "the test opens too tight to be fair");
});

test("Sensei's Test separates knowing your tables from not, and still gives a learner a go", () => {
  const good = mean(senseiTests.map((r) => r.score));
  const learning = mean(learnerTests.map((r) => r.score));
  assert.ok(good > learning * 1.4,
    `a perfect run scored ${Math.round(good)} against ${Math.round(learning)} for a learner — the score says nothing`);
  assert.ok(learning > 0, "a learner scored nothing at all on the test");
  const asked = mean(learnerTests.map((r) => r.answered));
  assert.ok(asked >= 9, `a learner's test lasted ${asked.toFixed(1)} questions — too abrupt to be worth trying`);
});

test("practice never ends, never grades, and still teaches", () => {
  S.__reseed(5);
  const mastery = {};
  Game.start({ mode: "practice", table: 7, mastery });
  const brain = senseiBrain();
  for (let f = 0; f < 60 * 200 && Game.running; f++) { Game.update(1 / 60); brain(Game, 1 / 60); }
  assert.ok(Game.running, "practice ended on its own — it is supposed to be a safe place");
  assert.equal(Game.hearts, Infinity, "practice can take hearts");
  assert.ok(Game.answered > 40, `only ${Game.answered} questions in 200 seconds of practice`);
  const strong = S.tableFacts(7).filter((f) => Mastery.strength(mastery, f.key) >= 0.85).length;
  assert.ok(strong >= 8, `practice left only ${strong}/11 of the 7s mastered`);
  Game.quit();
  assert.equal(Game.result.stars, 0, "practice awarded stars");
  assert.equal(Game.result.won, false);
});

test("a belt only ever asks about its own tables", () => {
  const fails = [];
  BELTS.forEach((b, i) => {
    S.__reseed(500 + i);
    const allowed = new Set(b.tables);
    Game.start({ mode: "belt", beltIdx: i, mastery: {} });
    const brain = senseiBrain();
    const seen = new Set();
    for (let f = 0; f < CAP && Game.running; f++) {
      if (Game.q && !Game.q.done) seen.add(Game.q.key);
      if (Game.wave.type === "multiples") seen.add("T" + Game.streamTable);
      Game.update(1 / 60); brain(Game, 1 / 60);
    }
    for (const k of seen) {
      if (k[0] === "T") { if (!allowed.has(+k.slice(1))) fails.push(`${b.name}: stream on the ${k.slice(1)}s`); continue; }
      const [x, y] = k.split("x").map(Number);
      if (!allowed.has(x) && !allowed.has(y)) fails.push(`${b.name}: asked ${k}`);
    }
  });
  assert.deepEqual(fails, []);
});

test("the campaign covers all eleven tables between them", () => {
  const covered = new Set();
  for (const b of BELTS) for (const t of b.tables) covered.add(t);
  assert.deepEqual([...covered].sort((a, b) => a - b), S.TABLES);
  // And no belt is unreachable behind a belt nobody can pass.
  assert.ok(BELTS.every((b) => b.waves.length >= 3), "a belt with fewer than three rounds is a formality");
});

test("grades reward being right, not being quick", () => {
  // Same bot, same belt, one of them dawdling to the last possible moment.
  // A slower player who is still right must still be able to three-star.
  S.__reseed(31);
  const slowBrain = () => {
    const fast = senseiBrain();
    let hold = 0;
    return (G, dt) => {
      hold += dt;
      if (hold < 0.9) return;      // think about it for the best part of a second
      hold = 0;
      fast(G, dt);
    };
  };
  const r = playBelt(6, slowBrain(), {});
  assert.ok(r.won && r.stars === 3, `a slow but accurate player got ${r.won ? r.stars + "*" : "a loss"}`);
});

test("the first wrong answer is a free think, the second is not", () => {
  S.__reseed(88);
  Game.start({ mode: "belt", beltIdx: 0, mastery: {} });
  while (!(Game.q && !Game.q.done && liveObjs(Game).length >= 2)) Game.update(1 / 60);
  const hearts = Game.hearts;
  const wrongOnes = liveObjs(Game).filter((o) => o.qid === Game.q.id && !o.good);
  cut(Game, wrongOnes[0]);
  assert.equal(Game.hearts, hearts, "the first wrong answer cost a heart");
  assert.equal(Game.q.done, false, "the question closed after one wrong answer");
  assert.equal(Game.combo, 0, "a wrong answer kept the chain");
  cut(Game, wrongOnes[1]);
  assert.equal(Game.hearts, hearts - 1, "the second wrong answer was free too");
  Game.quit();
});

test("a long clean chain buys a heart back, but never above the belt's own limit", () => {
  S.__reseed(99);
  Game.start({ mode: "belt", beltIdx: 7, mastery: {} });
  Game.hearts = 1;
  const brain = senseiBrain();
  let f = 0;
  while (Game.running && Game.hearts < 2 && f < CAP) { Game.update(1 / 60); brain(Game, 1 / 60); f++; }
  assert.ok(Game.hearts >= 2, "a flawless run never recovered a heart");
  assert.ok(Game.hearts <= BELTS[7].hearts, "hearts climbed past the belt's maximum");
  Game.quit();
});
