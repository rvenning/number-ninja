// The times-table brain.
//
// Everything about WHAT gets asked lives here: the 66 unique facts of the 2-12
// tables, how hard each one is, what a plausible wrong answer looks like, and a
// per-player mastery model that decides which fact she meets next.
//
// Two things this file exists to get right:
//
//   1. Commutativity. 7x8 and 8x7 are ONE fact, not two, so the key is always
//      sorted. Practising the 8s therefore strengthens the 7s creature too,
//      which is both true and lovely.
//   2. Wrong answers have to be the wrong answers a child actually gives —
//      a row off (7x8 -> 63), an addition slip (7x8 -> 15), a transposition
//      (56 -> 65). Random numbers would make every question solvable by
//      eyeballing which one "looks about right", and drill nothing.
//
// Pure functions and plain data: no DOM, no canvas, no Math.random of its own
// (every random path takes an rng argument), so tests/facts.test.js can pin all
// of it.

const TABLES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const T_MIN = 2, T_MAX = 12;

// How much of a memory load each operand is, roughly in the order children
// actually acquire them: doubles and the 5s/10s patterns are nearly free, the
// middle of the 6-8 block is the hard core, and 12 is late because it is taught
// last. A square (7x7) is a touch easier than it looks — it has its own name in
// most children's heads — so it gets a discount.
const OPERAND_LOAD = { 2: 0, 3: 1, 4: 1, 5: 0, 6: 2, 7: 3, 8: 3, 9: 2, 10: 0, 11: 1, 12: 3 };

function factKey(a, b) {
  return Math.min(a, b) + "x" + Math.max(a, b);
}

function factLoad(a, b) {
  let h = (OPERAND_LOAD[a] || 0) + (OPERAND_LOAD[b] || 0);
  if (a === b) h -= 1;
  return Math.max(0, Math.min(6, h));
}

// The whole bank, built once. 66 entries — every unordered pair from 2..12.
const FACTS = (() => {
  const out = [];
  for (let a = T_MIN; a <= T_MAX; a++) {
    for (let b = a; b <= T_MAX; b++) {
      out.push({ key: factKey(a, b), a, b, product: a * b, load: factLoad(a, b) });
    }
  }
  return out;
})();

const FACT_BY_KEY = Object.fromEntries(FACTS.map((f) => [f.key, f]));

// The 11 facts that make up one table (t x 2 .. t x 12). Note these overlap
// between tables by design — that IS the shared-progress mechanic.
function tableFacts(t) {
  return FACTS.filter((f) => f.a === t || f.b === t);
}

/* ========================================================================== *
 * Wrong answers
 * ========================================================================== */

// Every plausible slip for a x b, strongest error modes first. Each candidate
// is tagged so tests can assert the important ones are actually reachable.
function errorCandidates(a, b) {
  const p = a * b;
  const out = [];
  const add = (v, why) => { if (Number.isInteger(v) && v > 0 && v !== p) out.push({ v, why }); };

  // A row off in either direction — by far the commonest mistake, and the one
  // that means "I counted up the table and lost my place".
  add(p - a, "row"); add(p + a, "row");
  add(p - b, "row"); add(p + b, "row");
  // Two rows off, for the child who is skip-counting and drifts further.
  add(p - 2 * a, "row2"); add(p + 2 * a, "row2");
  // Added instead of multiplied.
  add(a + b, "added");
  // Digit transposition of a two-digit product (56 -> 65).
  if (p >= 10 && p <= 99) {
    const t = (p % 10) * 10 + Math.floor(p / 10);
    if (t !== p && t > 0) add(t, "swap");
  }
  // Off by one — a counting slip rather than a recall slip.
  add(p - 1, "near"); add(p + 1, "near");
  // A product from somewhere else entirely in the same table.
  for (let k = T_MIN; k <= T_MAX; k++) { add(a * k, "same"); add(b * k, "same"); }
  return out;
}

// Pick `n` distinct wrong answers. Weighted toward the meaningful mistakes:
// a set of pure near-misses would let her slice by "roughly right" and a set of
// pure random numbers would let her slice by "obviously wrong".
function distractors(a, b, n, rng) {
  const p = a * b;
  const WEIGHT = { row: 6, row2: 3, swap: 3, same: 3, added: 2, near: 1 };
  const pool = [];
  const seen = new Set([p]);
  for (const c of errorCandidates(a, b)) {
    if (seen.has(c.v)) continue;
    seen.add(c.v);
    pool.push({ v: c.v, w: WEIGHT[c.why] || 1 });
  }

  const out = [];
  while (out.length < n && pool.length) {
    let total = 0;
    for (const c of pool) total += c.w;
    let r = rng() * total, i = 0;
    while (i < pool.length - 1 && (r -= pool[i].w) > 0) i++;
    out.push(pool[i].v);
    pool.splice(i, 1);
  }
  // Only if the bank somehow ran dry (it cannot for 2..12, but a data change
  // shouldn't be able to ship a question with too few options).
  let pad = p + 3;
  while (out.length < n) { if (!seen.has(pad)) { out.push(pad); seen.add(pad); } pad++; }
  return out;
}

// Wrong answers for the other direction — "? x 8 = 56", where the answer is a
// small number rather than a product. The mistakes here are different: reaching
// for the number that is already in the question, or landing a row either side.
function factorDistractors(a, b, n, rng) {
  const WEIGHT = {};
  for (let k = T_MIN; k <= T_MAX; k++) {
    if (k === a) continue;
    const near = Math.abs(k - a);
    WEIGHT[k] = near === 1 ? 6 : near === 2 ? 3 : 1;
  }
  if (b !== a && WEIGHT[b] !== undefined) WEIGHT[b] += 5;   // "I read the wrong one"

  const pool = Object.keys(WEIGHT).map((k) => ({ v: +k, w: WEIGHT[k] }));
  const out = [];
  while (out.length < n && pool.length) {
    let total = 0;
    for (const c of pool) total += c.w;
    let r = rng() * total, i = 0;
    while (i < pool.length - 1 && (r -= pool[i].w) > 0) i++;
    out.push(pool[i].v);
    pool.splice(i, 1);
  }
  return out;
}

// For a "slice the multiples of t" round: a number in the same range that is
// NOT a multiple of t, sitting close to one so it can't be dismissed at a
// glance. (For the 2s, 5s and 10s the last digit gives it away — that is fine,
// spotting that pattern IS the lesson at White Belt.)
function nonMultiple(t, rng) {
  const lo = t * 2, hi = t * 12;
  for (let tries = 0; tries < 40; tries++) {
    const base = t * (2 + Math.floor(rng() * 11));
    const off = [1, 2, 3, -1, -2, -3][Math.floor(rng() * 6)];
    const v = base + off;
    if (v > 1 && v <= hi + 3 && v >= lo - 3 && v % t !== 0) return v;
  }
  return t * 3 + 1;
}

/* ========================================================================== *
 * Mastery
 * ========================================================================== */

// A player's mastery is a plain object keyed by fact: { r, w, s }.
//   r  right answers ever
//   w  wrong answers ever
//   s  strength 0..1 — the number that decides how often she sees it again,
//      and what her creatures look like.
//
// Strength moves up faster when she answers quickly, because a slow correct
// answer is counting, not recall, and counting is exactly what this game is
// trying to replace. It drops harder than it climbs so one confident wrong
// answer brings a fact back into rotation immediately.
const Mastery = {
  QUICK_MS: 1600,

  blank() { return {}; },

  get(m, key) {
    const f = m && m[key];
    return f ? { r: f.r || 0, w: f.w || 0, s: f.s || 0 } : { r: 0, w: 0, s: 0 };
  },

  strength(m, key) { return this.get(m, key).s; },

  record(m, key, right, ms) {
    const f = this.get(m, key);
    if (right) {
      f.r++;
      f.s = Math.min(1, f.s + (ms <= this.QUICK_MS ? 0.34 : 0.2));
    } else {
      f.w++;
      f.s = Math.max(0, f.s - 0.42);
    }
    m[key] = f;
    return f;
  },

  // 0..1 across one table's 11 facts — this is what a creature's growth is.
  tableProgress(m, t) {
    const fs = tableFacts(t);
    let sum = 0;
    for (const f of fs) sum += this.strength(m, f.key);
    return fs.length ? sum / fs.length : 0;
  },

  overall(m) {
    let sum = 0;
    for (const f of FACTS) sum += this.strength(m, f.key);
    return sum / FACTS.length;
  },

  mastered(m) {
    return FACTS.filter((f) => this.strength(m, f.key) >= 0.85).length;
  },

  // Cross-device reconcile. A field-wise max() would be wrong here: strength
  // goes DOWN when she gets one wrong, so max() would quietly resurrect a fact
  // she has since started failing and stop the game ever showing it to her
  // again. Instead the side with more evidence (attempts) wins the whole
  // record, which is monotonic in attempts and so converges.
  merge(a, b) {
    const out = {};
    const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
    for (const k of keys) {
      const x = this.get(a || {}, k), y = this.get(b || {}, k);
      const nx = x.r + x.w, ny = y.r + y.w;
      out[k] = ny > nx ? y : nx > ny ? x : (y.s >= x.s ? y : x);
    }
    return out;
  },
};

/* ========================================================================== *
 * Choosing what she sees next
 * ========================================================================== */

// Weighted toward weak facts, but never to the point of only ever showing the
// worst one: the +0.16 floor keeps solid facts in circulation so they stay
// solid, and `recent` stops the same fact coming round twice in a row, which
// reads as the game being broken rather than as revision.
function pickFact(m, tables, rng, recent) {
  const pool = [];
  const seen = new Set();
  for (const t of tables) {
    for (const f of tableFacts(t)) {
      if (seen.has(f.key)) continue;
      seen.add(f.key);
      let w = Math.pow(1 - Mastery.strength(m, f.key), 1.5) + 0.16;
      if (recent && recent.includes(f.key)) w *= 0.12;
      pool.push({ f, w });
    }
  }
  let total = 0;
  for (const c of pool) total += c.w;
  let r = rng() * total, i = 0;
  while (i < pool.length - 1 && (r -= pool[i].w) > 0) i++;
  return pool[i].f;
}

// What one session actually changed, for the results screen. Read from the
// before/after snapshots rather than tracked in the engine, so it stays true
// even for a session that ended halfway through a question.
function sessionDiff(before, after) {
  const missed = [], learned = [];
  for (const f of FACTS) {
    const a = Mastery.get(before, f.key), b = Mastery.get(after, f.key);
    if (b.w > a.w) missed.push(f);
    else if (b.r > a.r) learned.push(f);
  }
  return { missed, learned };
}

// Which way round to ask it. Presenting 7x8 and 8x7 as different-looking
// questions is the cheapest way to make commutativity felt rather than told.
function orientFact(f, rng) {
  return rng() < 0.5 ? { a: f.a, b: f.b } : { a: f.b, b: f.a };
}
