// Persistence — gamekit storage configured for Number Ninja.
// nn_* localStorage keys, "numberninja" Firestore collection.
//
// Almost everything here is monotonic (best score, lifetime counts, best stars
// per belt), so a field-wise max() merge is right. The exception is `mastery`,
// which is the only thing in any of the family games whose numbers legitimately
// go DOWN — a fact's strength drops when she gets it wrong. max()-merging that
// would resurrect a strength she has since lost and quietly stop the game ever
// showing her that fact again, so it has its own reconcile in Mastery.merge().

const PROGRESS = {
  blank: () => ({
    belts: {},        // belt id -> best stars (0-3)
    mastery: {},      // fact key -> { r, w, s }
    best: 0,          // best Sensei's Test score — the leaderboard headline
    bestCombo: 0,
    answered: 0,      // lifetime questions met
    correct: 0,       // lifetime first-time-right
    runs: 0,
    updated: 0,
  }),

  merge: (a, b) => {
    const belts = {};
    for (const k of new Set([...Object.keys(a.belts || {}), ...Object.keys(b.belts || {})])) {
      belts[k] = Math.max((a.belts || {})[k] || 0, (b.belts || {})[k] || 0);
    }
    return {
      // Spread first so a field a newer client added survives an older client's
      // merge, then pin everything we know how to reconcile.
      ...a, ...b,
      belts,
      mastery: Mastery.merge(a.mastery || {}, b.mastery || {}),
      best: Math.max(a.best || 0, b.best || 0),
      bestCombo: Math.max(a.bestCombo || 0, b.bestCombo || 0),
      answered: Math.max(a.answered || 0, b.answered || 0),
      correct: Math.max(a.correct || 0, b.correct || 0),
      runs: Math.max(a.runs || 0, b.runs || 0),
    };
  },
};

const Storage = GK.createStorage({
  prefix: "nn",
  collection: "numberninja",
  firebaseConfig: window.FIREBASE_CONFIG,
  blankProgress: PROGRESS.blank,
  mergeProgress: PROGRESS.merge,
});

Object.assign(Storage, {
  // Fold one finished session into the profile. The engine has already mutated
  // the mastery object in place, so this only has to bank the records around it.
  recordRun(profileId, res, mastery) {
    const prog = this.getProgress(profileId);
    prog.mastery = mastery;
    prog.runs = (prog.runs || 0) + 1;
    prog.answered = (prog.answered || 0) + (res.targets || 0);
    prog.correct = (prog.correct || 0) + (res.hits || 0);
    prog.bestCombo = Math.max(prog.bestCombo || 0, res.bestCombo || 0);
    if (res.mode === "test") prog.best = Math.max(prog.best || 0, res.score || 0);
    if (res.mode === "belt" && res.won) {
      const id = BELTS[res.beltIdx].id;
      prog.belts = prog.belts || {};
      prog.belts[id] = Math.max(prog.belts[id] || 0, res.stars || 0);
    }
    this.saveProgress(profileId, prog);
    return prog;
  },

  // Practice never touches records — it exists so a wall in the campaign can be
  // solved without the solving itself being graded.
  recordPractice(profileId, mastery) {
    const prog = this.getProgress(profileId);
    prog.mastery = mastery;
    this.saveProgress(profileId, prog);
    return prog;
  },
});

/* ------------------------------- unlocking -------------------------------- */

// One belt at a time, and passing at all is enough — stars are for pride, never
// for the gate. Being stuck is the one failure this game must not have.
function beltUnlocked(prog, i) {
  if (i <= 0) return true;
  return ((prog.belts || {})[BELTS[i - 1].id] || 0) >= 1;
}

function beltStars(prog, i) { return (prog.belts || {})[BELTS[i].id] || 0; }

function totalStars(prog) {
  return BELTS.reduce((s, b, i) => s + beltStars(prog, i), 0);
}

function highestUnlocked(prog) {
  let i = 0;
  while (i + 1 < BELTS.length && beltUnlocked(prog, i + 1)) i++;
  return i;
}
