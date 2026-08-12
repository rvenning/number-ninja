"use strict";
// Save-data tests. These cover the code that can permanently ruin a player's
// progress rather than merely annoy her: the cross-device merge, which runs
// unattended whenever two iPads sync.
//
// This game has one field no other family game has — `mastery`, whose numbers
// legitimately go DOWN. Everywhere else a max() merge is obviously right; here
// it would quietly resurrect a strength she has lost and stop the game ever
// asking her the one fact she most needs. Most of what follows is about that.
//
//   cd number-ninja && node --test

const { test } = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { loadScripts } = require("../lib/tools/test-harness.js");

const ROOT = path.join(__dirname, "..");

// Fresh sandbox per call: gk-storage keeps state and localStorage is faked per
// sandbox, so tests can't leak into each other.
function load() {
  return loadScripts({
    baseDir: ROOT,
    files: ["lib/gk-util.js", "lib/gk-storage.js", "js/facts.js", "js/creatures.js",
            "js/belts.js", "js/storage.js"],
    exports: ["Storage", "PROGRESS", "BELTS", "Mastery", "FACTS", "tableFacts",
              "beltUnlocked", "beltStars", "totalStars", "highestUnlocked"],
    browser: true,
  });
}

/* ---------------------------------- merge --------------------------------- */

test("merge keeps the best stars for every belt, including one only this device has", () => {
  const { PROGRESS } = load();
  const a = { ...PROGRESS.blank(), belts: { white: 3, yellow: 1 } };
  const b = { ...PROGRESS.blank(), belts: { yellow: 2, orange: 1 } };
  const m = PROGRESS.merge(a, b);
  assert.deepEqual(m.belts, { white: 3, yellow: 2, orange: 1 });
});

test("merge keeps the better test score and the longer chain", () => {
  const { PROGRESS } = load();
  const a = { ...PROGRESS.blank(), best: 4000, bestCombo: 9, runs: 12 };
  const b = { ...PROGRESS.blank(), best: 2500, bestCombo: 21, runs: 8 };
  const m = PROGRESS.merge(a, b);
  assert.equal(m.best, 4000);
  assert.equal(m.bestCombo, 21);
  assert.equal(m.runs, 12);
});

test("merge keeps a field a newer build added", () => {
  const { PROGRESS } = load();
  const a = { ...PROGRESS.blank(), futureField: "keep me" };
  const m = PROGRESS.merge(a, PROGRESS.blank());
  assert.equal(m.futureField, "keep me");
});

test("a sync with a stale device cannot un-forget a fact she has started failing", () => {
  const { PROGRESS } = load();
  // The iPad remembers her knowing 7x8 cold. On the phone she has since got it
  // wrong twice. A max() merge on strength would hand back the 0.9, the fact
  // would stop being drilled, and the game would silently give up on the exact
  // thing she needs most.
  const ipad = { ...PROGRESS.blank(), mastery: { "7x8": { r: 4, w: 0, s: 0.9 } } };
  const phone = { ...PROGRESS.blank(), mastery: { "7x8": { r: 4, w: 2, s: 0.24 } } };
  assert.equal(PROGRESS.merge(ipad, phone).mastery["7x8"].s, 0.24);
  assert.equal(PROGRESS.merge(phone, ipad).mastery["7x8"].s, 0.24,
    "the merge changed its mind when the arguments swapped");
});

test("merging two devices keeps every fact either of them has practised", () => {
  const { PROGRESS, tableFacts, Mastery } = load();
  const ipad = { ...PROGRESS.blank(), mastery: {} };
  const phone = { ...PROGRESS.blank(), mastery: {} };
  for (const f of tableFacts(3)) Mastery.record(ipad.mastery, f.key, true, 500);
  for (const f of tableFacts(8)) Mastery.record(phone.mastery, f.key, true, 500);
  const m = PROGRESS.merge(ipad, phone).mastery;
  assert.ok(Mastery.tableProgress(m, 3) > 0, "the iPad's 3s were lost");
  assert.ok(Mastery.tableProgress(m, 8) > 0, "the phone's 8s were lost");
});

/* -------------------------------- recording ------------------------------- */

test("passing a belt records its stars, and a worse replay never overwrites a better one", () => {
  const { Storage, BELTS } = load();
  Storage.recordRun("p1", { mode: "belt", beltIdx: 0, won: true, stars: 3, score: 900, targets: 30, hits: 29, bestCombo: 11 }, {});
  const prog = Storage.recordRun("p1", { mode: "belt", beltIdx: 0, won: true, stars: 1, score: 200, targets: 30, hits: 20, bestCombo: 3 }, {});
  assert.equal(prog.belts[BELTS[0].id], 3, "a weaker replay overwrote the best result");
  assert.equal(prog.bestCombo, 11);
});

test("losing a belt records no stars and unlocks nothing", () => {
  const { Storage, BELTS, beltUnlocked } = load();
  const prog = Storage.recordRun("p2", { mode: "belt", beltIdx: 0, won: false, stars: 0, score: 120, targets: 30, hits: 9 }, {});
  assert.deepEqual(prog.belts, {});
  assert.equal(beltUnlocked(prog, 1), false);
  assert.ok(prog.answered > 0, "a lost belt still has to count toward her lifetime practice");
});

test("only Sensei's Test sets the leaderboard score", () => {
  const { Storage } = load();
  let prog = Storage.recordRun("p3", { mode: "belt", beltIdx: 0, won: true, stars: 3, score: 5000, targets: 30, hits: 30 }, {});
  assert.equal(prog.best, 0, "a belt score leaked onto the leaderboard");
  prog = Storage.recordRun("p3", { mode: "test", won: false, stars: 0, score: 1800, targets: 20, hits: 17 }, {});
  assert.equal(prog.best, 1800);
  prog = Storage.recordRun("p3", { mode: "test", won: false, stars: 0, score: 900, targets: 12, hits: 9 }, {});
  assert.equal(prog.best, 1800, "a worse test overwrote the best");
});

test("practice banks what she learned and nothing else", () => {
  const { Storage, Mastery, tableFacts } = load();
  const before = Storage.getProgress("p4");
  const mastery = {};
  for (const f of tableFacts(7)) Mastery.record(mastery, f.key, true, 500);
  const prog = Storage.recordPractice("p4", mastery);
  assert.ok(Mastery.tableProgress(prog.mastery, 7) > 0, "practice taught nothing");
  assert.equal(prog.runs, before.runs || 0, "practice counted as a run");
  assert.equal(prog.best, 0, "practice touched the leaderboard");
});

test("what she learns survives a save and reload", () => {
  const { Storage, Mastery } = load();
  const mastery = {};
  Mastery.record(mastery, "7x8", true, 500);
  Storage.recordPractice("p5", mastery);
  assert.ok(Mastery.strength(Storage.getProgress("p5").mastery, "7x8") > 0);
});

/* -------------------------------- unlocking ------------------------------- */

test("belts unlock one at a time, and passing at all is enough", () => {
  const { Storage, BELTS, beltUnlocked, highestUnlocked } = load();
  let prog = Storage.getProgress("p6");
  assert.equal(beltUnlocked(prog, 0), true, "the first belt must always be open");
  assert.equal(beltUnlocked(prog, 1), false);
  // One star — the barest pass — has to be enough. Stars are for pride; being
  // stuck is the one failure this game must not have.
  prog = Storage.recordRun("p6", { mode: "belt", beltIdx: 0, won: true, stars: 1, score: 100, targets: 30, hits: 20 }, {});
  assert.equal(beltUnlocked(prog, 1), true);
  assert.equal(beltUnlocked(prog, 2), false);
  assert.equal(highestUnlocked(prog), 1);
  assert.ok(BELTS.length >= 10, "the campaign got shorter without this test noticing");
});

test("total stars counts the whole campaign", () => {
  const { Storage, totalStars, BELTS } = load();
  let prog = Storage.getProgress("p7");
  assert.equal(totalStars(prog), 0);
  prog = Storage.recordRun("p7", { mode: "belt", beltIdx: 0, won: true, stars: 3, score: 1, targets: 1, hits: 1 }, {});
  prog = Storage.recordRun("p7", { mode: "belt", beltIdx: 1, won: true, stars: 2, score: 1, targets: 1, hits: 1 }, {});
  assert.equal(totalStars(prog), 5);
  assert.ok(totalStars(prog) <= BELTS.length * 3);
});
