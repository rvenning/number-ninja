"use strict";
// The maths, tested as maths.
//
// Everything a player is ever asked comes out of js/facts.js, so a bug here is
// not a glitch — it is the game teaching her something untrue. The two that
// would actually do damage: a "wrong" option that is secretly also right, and a
// decoy in a multiples round that IS a multiple. Both are asserted below over
// the whole space rather than on a sample.
//
//   cd number-ninja && node --test

const { test } = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { loadScripts } = require("../lib/tools/test-harness.js");

const ROOT = path.join(__dirname, "..");
const S = loadScripts({
  baseDir: ROOT,
  files: ["tests/seed.js", "js/facts.js", "js/creatures.js"],
  exports: ["FACTS", "FACT_BY_KEY", "TABLES", "T_MIN", "T_MAX", "Mastery",
            "factKey", "factLoad", "tableFacts", "errorCandidates",
            "distractors", "factorDistractors", "nonMultiple",
            "pickFact", "orientFact", "sessionDiff",
            "CREATURES", "STAGES", "creatureState", "denSummary", "evolutions",
            "stageFor", "__reseed", "__rand"],
});
const { FACTS, Mastery, distractors, factorDistractors, nonMultiple, pickFact } = S;

const rng = () => S.__rand();

/* ------------------------------- the bank -------------------------------- */

test("the bank is exactly the 66 unique facts of the 2-12 tables", () => {
  assert.equal(FACTS.length, 66);
  const keys = new Set(FACTS.map((f) => f.key));
  assert.equal(keys.size, 66, "duplicate fact keys");
  for (const f of FACTS) {
    assert.ok(f.a >= 2 && f.a <= 12 && f.b >= 2 && f.b <= 12, `${f.key} out of range`);
    assert.equal(f.product, f.a * f.b);
    assert.ok(f.a <= f.b, `${f.key} is not stored in sorted order`);
  }
});

test("7x8 and 8x7 are the same fact", () => {
  assert.equal(S.factKey(7, 8), S.factKey(8, 7));
  assert.equal(S.factKey(7, 8), "7x8");
});

test("every table has its eleven facts, and they overlap between tables", () => {
  for (const t of S.TABLES) {
    assert.equal(S.tableFacts(t).length, 11, `table ${t} has the wrong number of facts`);
  }
  const shared = S.tableFacts(7).filter((f) => f.a === 8 || f.b === 8);
  assert.equal(shared.length, 1, "7x8 should belong to both the 7s and the 8s");
});

test("difficulty ranks the tables the way children actually learn them", () => {
  const load = (a, b) => S.factLoad(a, b);
  assert.ok(load(2, 5) < load(7, 8), "2x5 should be easier than 7x8");
  assert.ok(load(10, 3) < load(6, 7), "10x3 should be easier than 6x7");
  assert.ok(load(7, 7) < load(7, 8), "a square should be a touch easier than its neighbour");
  const fails = FACTS.filter((f) => f.load < 0 || f.load > 6).map((f) => f.key);
  assert.deepEqual(fails, []);
});

/* ------------------------------ distractors ------------------------------- */

test("no wrong answer is ever secretly the right answer", () => {
  S.__reseed(1);
  const fails = [];
  for (const f of FACTS) {
    for (let n = 2; n <= 4; n++) {
      for (let rep = 0; rep < 12; rep++) {
        const d = distractors(f.a, f.b, n, rng);
        if (d.length !== n) fails.push(`${f.key}: asked for ${n}, got ${d.length}`);
        if (d.includes(f.product)) fails.push(`${f.key}: distractor equals the answer`);
        if (new Set(d).size !== d.length) fails.push(`${f.key}: duplicate distractors`);
        if (d.some((v) => v <= 0 || !Number.isInteger(v))) fails.push(`${f.key}: ${d}`);
      }
    }
  }
  assert.deepEqual(fails.slice(0, 8), []);
});

test("the wrong answers are the mistakes a child actually makes", () => {
  // A row either side has to be reachable for every fact — that is the mistake
  // this whole game exists to catch. Random numbers in the same ballpark would
  // let her pick by "which looks about right" and drill nothing.
  const fails = [];
  for (const f of FACTS) {
    const cands = S.errorCandidates(f.a, f.b).map((c) => c.v);
    if (!cands.includes(f.product - f.a) && !cands.includes(f.product - f.b))
      fails.push(`${f.key}: no row-below error available`);
    if (!cands.includes(f.product + f.a) && !cands.includes(f.product + f.b))
      fails.push(`${f.key}: no row-above error available`);
  }
  assert.deepEqual(fails, []);
});

test("a whole question set is a menu of distinct numbers, one of them right", () => {
  S.__reseed(9);
  const fails = [];
  for (const f of FACTS) {
    for (let rep = 0; rep < 20; rep++) {
      const opts = [f.product, ...distractors(f.a, f.b, 4, rng)];
      if (new Set(opts).size !== opts.length) fails.push(`${f.key}: ${opts.join(",")}`);
      if (opts.filter((v) => v === f.product).length !== 1) fails.push(`${f.key}: not exactly one right answer`);
    }
  }
  assert.deepEqual(fails.slice(0, 8), []);
});

test("the missing-factor direction offers only sensible factors", () => {
  S.__reseed(3);
  const fails = [];
  for (const f of FACTS) {
    for (const [a, b] of [[f.a, f.b], [f.b, f.a]]) {
      for (let rep = 0; rep < 12; rep++) {
        const d = factorDistractors(a, b, 4, rng);
        if (d.length !== 4) fails.push(`${a}x${b}: got ${d.length} options`);
        if (d.includes(a)) fails.push(`${a}x${b}: a distractor IS the answer`);
        if (new Set(d).size !== d.length) fails.push(`${a}x${b}: duplicates`);
        if (d.some((v) => v < 2 || v > 12)) fails.push(`${a}x${b}: ${d} outside 2-12`);
      }
    }
  }
  assert.deepEqual(fails.slice(0, 8), []);
});

test("a decoy in a multiples round is never actually a multiple", () => {
  S.__reseed(11);
  const fails = [];
  for (const t of S.TABLES) {
    for (let rep = 0; rep < 400; rep++) {
      const v = nonMultiple(t, rng);
      if (v % t === 0) fails.push(`${t}: ${v} IS a multiple`);
      if (v < 2) fails.push(`${t}: ${v} is not a sensible number to show`);
    }
  }
  assert.deepEqual(fails.slice(0, 8), []);
});

test("decoys sit close to real multiples, so they can't be dismissed at a glance", () => {
  S.__reseed(12);
  let near = 0, total = 0;
  for (const t of [6, 7, 8, 9]) {
    for (let rep = 0; rep < 300; rep++) {
      const v = nonMultiple(t, rng);
      const nearest = Math.round(v / t) * t;
      if (Math.abs(v - nearest) <= 3) near++;
      total++;
    }
  }
  assert.ok(near / total > 0.95, `only ${Math.round(near / total * 100)}% of decoys were near a multiple`);
});

/* -------------------------------- mastery --------------------------------- */

test("strength climbs on a right answer and drops harder on a wrong one", () => {
  const m = {};
  Mastery.record(m, "7x8", true, 900);
  const quick = Mastery.strength(m, "7x8");
  const m2 = {};
  Mastery.record(m2, "7x8", true, 4000);
  assert.ok(quick > Mastery.strength(m2, "7x8"), "a quick answer should be worth more than a slow one");

  const m3 = {};
  for (let i = 0; i < 3; i++) Mastery.record(m3, "7x8", true, 900);
  const before = Mastery.strength(m3, "7x8");
  Mastery.record(m3, "7x8", false, 3000);
  assert.ok(Mastery.strength(m3, "7x8") < before - 0.3, "one wrong answer barely moved the needle");
  assert.ok(Mastery.strength(m3, "7x8") >= 0);
});

test("strength is bounded, so nothing can be over-learned into a corner", () => {
  const m = {};
  for (let i = 0; i < 50; i++) Mastery.record(m, "3x4", true, 500);
  assert.equal(Mastery.strength(m, "3x4"), 1);
  for (let i = 0; i < 50; i++) Mastery.record(m, "3x4", false, 5000);
  assert.equal(Mastery.strength(m, "3x4"), 0);
});

test("weak facts come round far more often than solid ones", () => {
  S.__reseed(21);
  const m = {};
  for (let i = 0; i < 10; i++) Mastery.record(m, "7x8", true, 500);   // solid
  // everything else in the 7s left at zero
  const counts = {};
  for (let i = 0; i < 4000; i++) {
    const f = pickFact(m, [7], rng, []);
    counts[f.key] = (counts[f.key] || 0) + 1;
  }
  const solid = counts["7x8"] || 0;
  const others = Object.keys(counts).filter((k) => k !== "7x8");
  const avgWeak = others.reduce((s, k) => s + counts[k], 0) / others.length;
  assert.ok(avgWeak > solid * 3,
    `a mastered fact came up ${solid} times against ${Math.round(avgWeak)} for a weak one — the drill isn't targeted`);
  assert.ok(solid > 0, "a mastered fact never came up at all — solid facts must stay in circulation");
});

test("the same fact does not come round twice in a row", () => {
  S.__reseed(22);
  const m = {};
  let repeats = 0;
  let recent = [];
  for (let i = 0; i < 2000; i++) {
    const f = pickFact(m, [7], rng, recent);
    if (recent[0] === f.key) repeats++;
    recent = [f.key, ...recent].slice(0, 4);
  }
  assert.ok(repeats / 2000 < 0.02, `${repeats} immediate repeats in 2000 draws`);
});

test("a merge from a stale device cannot resurrect a strength she has lost", () => {
  // The one thing max() would get wrong. She used to know 7x8 cold on the iPad;
  // on the phone she has since got it wrong twice. The phone has more evidence,
  // so the phone's (lower) strength has to win, or the game stops ever asking
  // her the one fact she needs most.
  const ipad = { "7x8": { r: 4, w: 0, s: 0.9 } };
  const phone = { "7x8": { r: 4, w: 2, s: 0.3 } };
  assert.equal(Mastery.merge(ipad, phone)["7x8"].s, 0.3);
  assert.equal(Mastery.merge(phone, ipad)["7x8"].s, 0.3, "the merge must not depend on argument order");
});

test("a merge keeps facts only one device has ever seen", () => {
  const a = { "2x3": { r: 3, w: 0, s: 0.6 } };
  const b = { "9x9": { r: 1, w: 1, s: 0.1 } };
  const m = Mastery.merge(a, b);
  assert.equal(Object.keys(m).length, 2);
  assert.equal(m["2x3"].s, 0.6);
  assert.equal(m["9x9"].s, 0.1);
});

test("mastered counts only facts she really has", () => {
  const m = {};
  assert.equal(Mastery.mastered(m), 0);
  for (let i = 0; i < 3; i++) Mastery.record(m, "2x3", true, 500);
  assert.equal(Mastery.mastered(m), 1);
});

/* ------------------------------- creatures -------------------------------- */

test("there is exactly one spirit per table, 2 through 12", () => {
  assert.equal(S.CREATURES.length, 11);
  assert.deepEqual(S.CREATURES.map((c) => c.t), S.TABLES);
  const names = new Set(S.CREATURES.map((c) => c.name));
  assert.equal(names.size, 11, "two spirits share a name");
});

test("a spirit is an egg until its table is really being learned, and grows all the way", () => {
  const m = {};
  assert.equal(S.creatureState(m, 7).stage.id, "egg");
  for (const f of S.tableFacts(7)) for (let i = 0; i < 3; i++) Mastery.record(m, f.key, true, 500);
  const grown = S.creatureState(m, 7);
  assert.equal(grown.stage.id, "master");
  assert.equal(Math.round(grown.progress * 100), 100);
});

test("no spirit can be hatched by hammering one easy fact", () => {
  const m = {};
  for (let i = 0; i < 40; i++) Mastery.record(m, "7x10", true, 400);
  const c = S.creatureState(m, 7);
  assert.ok(c.progress < 0.25, `one fact carried the whole table to ${c.progress}`);
  assert.equal(c.stage.id, "egg");
});

test("practising the 8s grows the 7s spirit too — that is the point of one shared fact bank", () => {
  const m = {};
  for (let i = 0; i < 3; i++) Mastery.record(m, "7x8", true, 500);
  assert.ok(Mastery.tableProgress(m, 7) > 0, "the 7s saw nothing from 7x8");
  assert.ok(Mastery.tableProgress(m, 8) > 0, "the 8s saw nothing from 7x8");
});

test("evolutions report only spirits that actually grew a stage", () => {
  const before = {};
  const after = JSON.parse(JSON.stringify(before));
  for (const f of S.tableFacts(3)) Mastery.record(after, f.key, true, 500);
  const evos = S.evolutions(before, after);
  assert.equal(evos.length, 1);
  assert.equal(evos[0].t, 3);
  assert.deepEqual(S.evolutions(after, after), [], "nothing changed but something evolved");
});

test("the results screen names the facts she actually got wrong", () => {
  const before = { "7x8": { r: 2, w: 0, s: 0.5 } };
  const after = JSON.parse(JSON.stringify(before));
  Mastery.record(after, "7x8", false, 3000);
  Mastery.record(after, "6x6", true, 500);
  const d = S.sessionDiff(before, after);
  assert.deepEqual(d.missed.map((f) => f.key), ["7x8"]);
  assert.deepEqual(d.learned.map((f) => f.key), ["6x6"]);
});
