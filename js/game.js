// The Number Ninja engine.
//
// Numbers are thrown up from below the screen in arcs. You swipe to slice the
// ones the banner asks for and let the rest fall. That's it — the whole game is
// "which of these flying numbers is the right one", asked sixty times a
// session, which is the point: fluency comes from volume, not from ceremony.
//
// This file is simulation ONLY — no DOM, no canvas, no audio, no timers. It is
// driven by update(dt) and swipe(x0,y0,x1,y1) and nothing else, which is what
// lets tests/bot.test.js play the entire campaign headlessly with the real
// engine rather than a model of it. Anything the outside world needs to react
// to (a hit, a heart lost, a wave cleared) is pushed onto Game.events for
// render.js to drain.
//
// The one piece of geometry that carries real weight: a number is only
// sliceable once it has risen above SLICE_Y. A throw whose apex is lower than
// that never enters play at all, and that — not a timer — is what ends an
// endless run for a player who never gets one wrong.

const LW = 320, LH = 480;              // fixed logical stage, portrait
// Gravity is the pacing dial for the whole game, and the right one: it stretches
// every flight — and therefore how long she has to read five numbers and pick
// one — without moving a single piece of geometry. Raising the arcs instead
// would buy the same time and throw the numbers off the top of the screen.
// Dropped from 620 on 2026-08-13; Robert reported it playing slightly too fast.
// Note MIN_LIVE_ARC below is purely geometric, so this does not touch what ends
// an endless run.
const GRAV = 430;                      // px/s^2
const LAUNCH_Y = LH + 34;              // numbers start just off the bottom
const SLICE_Y = LH - 86;               // above this line a number is in play
// A disc's radius is what decides whether two numbers can be told apart by a
// swipe: any centre within OBJ_R of the blade is cut. Five options across the
// stage at this radius leaves a real gap between neighbours, so choosing one is
// always a maths decision and never a dexterity one.
const OBJ_R = 20;
const X_PAD = 26;

// Apex needed to reach the slice line at all. Below this a throw is a dud by
// construction — used by the endless mode as its ending, and asserted in tests.
const MIN_LIVE_ARC = LAUNCH_Y - SLICE_Y;

function segCircleHit(x0, y0, x1, y1, cx, cy, r) {
  const dx = x1 - x0, dy = y1 - y0;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((cx - x0) * dx + (cy - y0) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = x0 + dx * t, py = y0 + dy * t;
  const ex = cx - px, ey = cy - py;
  return ex * ex + ey * ey <= r * r;
}

const Game = {
  running: false, paused: false, active: false,
  rng: Math.random,
  events: [],
  objs: [],

  /* ============================== lifecycle ============================== */

  // cfg: { mode: "belt" | "test" | "practice", beltIdx, table, mastery }
  // `mastery` is mutated in place as she answers — main.js hands in the
  // profile's own object and saves it afterwards.
  start(cfg) {
    this.rng = Math.random;            // re-grab so a reseeded test stays put
    this.mode = cfg.mode;
    this.mastery = cfg.mastery || {};
    this.masteryBefore = JSON.parse(JSON.stringify(this.mastery));

    if (this.mode === "belt") {
      this.beltIdx = cfg.beltIdx | 0;
      this.belt = BELTS[this.beltIdx];
      this.tables = this.belt.tables;
      this.hearts = this.maxHearts = this.belt.hearts;
      this.optCount = this.belt.opts;
      this.gap = this.belt.gap;
      this.arc = this.belt.arc;
    } else if (this.mode === "test") {
      this.belt = null;
      this.tables = TEST.tables;
      this.hearts = this.maxHearts = TEST.hearts;
      this.optCount = TEST.opts;
      this.gap = TEST.gap;
      this.arc = TEST.arc0;
    } else {
      this.belt = null;
      this.table = cfg.table;
      this.tables = [cfg.table];
      this.hearts = this.maxHearts = Infinity;
      this.optCount = PRACTICE.opts;
      this.gap = PRACTICE.gap;
      this.arc = PRACTICE.arc;
    }

    this.objs = [];
    this.events = [];
    this.elapsed = 0;
    this.score = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.targets = 0;
    this.hits = 0;
    this.wrongs = 0;
    this.answered = 0;
    this.recent = [];
    this.q = null;
    this.beat = 0.6;
    this.result = null;
    this.nextId = 1;
    this.waveIdx = -1;
    this.running = true;
    this.paused = false;

    if (this.mode === "belt") this.nextWave();
    else {
      // Endless and practice are one open-ended question wave.
      this.wave = { type: this.mode === "test" ? "mixed" : "mixed", n: Infinity };
      this.thrown = 0;
      this.asked = 0;
      this.emit({ type: "wave", index: 0, total: 0, wave: this.wave });
    }
  },

  quit() {
    if (!this.running) return;
    this.finish("quit");
  },

  nextWave() {
    this.waveIdx++;
    if (this.waveIdx >= this.belt.waves.length) { this.finish("done"); return; }
    const w = this.belt.waves[this.waveIdx];
    this.wave = w;
    this.thrown = 0;
    this.asked = 0;
    this.q = null;
    this.beat = 0.75;
    if (w.type === "multiples") {
      // A wave with no table of its own rotates the belt's tables, so a
      // two-table belt covers both without the data repeating itself.
      this.streamTable = w.table || this.belt.tables[this.waveIdx % this.belt.tables.length];
    }
    this.emit({ type: "wave", index: this.waveIdx, total: this.belt.waves.length, wave: w, table: this.streamTable });
  },

  finish(why) {
    this.running = false;
    const st = { targets: this.targets, hits: this.hits, wrongs: this.wrongs, hearts: this.hearts };
    const g = this.mode === "belt" ? gradeRun(st) : { won: false, stars: 0, accuracy: accuracyOf(st), hitRate: st.targets ? st.hits / st.targets : 0 };
    this.result = {
      mode: this.mode,
      beltIdx: this.beltIdx,
      table: this.table,
      reason: why,
      won: why === "done" && g.won,
      stars: why === "done" ? g.stars : 0,
      accuracy: g.accuracy,
      hitRate: g.hitRate,
      score: this.score,
      targets: this.targets,
      hits: this.hits,
      wrongs: this.wrongs,
      misses: Math.max(0, this.targets - this.hits),
      answered: this.answered,
      bestCombo: this.bestCombo,
      hearts: Math.max(0, this.hearts === Infinity ? 0 : this.hearts),
      masteryBefore: this.masteryBefore,
    };
    this.emit({ type: "end", result: this.result });
  },

  emit(e) { this.events.push(e); },

  /* ================================ throwing ============================== */

  // Every number in the air is one of these. `good` is the only thing the
  // engine ever branches on — a decoy and an answer are identical in every
  // visible respect, which is the whole point.
  makeObj(val, good, opts) {
    const o = Object.assign({
      id: this.nextId++,
      x: LW / 2, y: LAUNCH_Y, vx: 0, vy: 0, r: OBJ_R,
      val, good,
      qid: 0, factKey: null,
      delay: 0, born: this.elapsed,
      sliced: false, spent: false, sliceT: 0,
      spin: (this.rng() - 0.5) * 0.6, spinV: (this.rng() - 0.5) * 1.4,
    }, opts || {});
    o.vy = -Math.sqrt(2 * GRAV * (o.arc !== undefined ? o.arc : this.arc));
    this.objs.push(o);
    return o;
  },

  // Fan of x positions for k numbers thrown together: evenly spread across the
  // playable width so they never launch on top of each other, then jittered.
  // Fan of x positions for k numbers thrown together. Jitter is kept small on
  // purpose: two overlapping discs would make an answer uncuttable without also
  // cutting a wrong one, which turns a maths question into a dexterity one.
  fanX(i, k) {
    const span = LW - X_PAD * 2;
    return X_PAD + (span * (i + 0.5)) / k + (this.rng() - 0.5) * 10;
  },

  askQuestion() {
    const wt = this.wave.type;
    // The campaign names the direction; endless and practice alternate, so both
    // directions get drilled without a mode switch.
    const kind = wt === "factor" ? "factor"
      : wt === "answer" ? "answer"
      : (this.asked % 2 === 1 ? "factor" : "answer");

    const tables = this.wave.tables || this.tables;
    const f = pickFact(this.mastery, tables, this.rng, this.recent);
    const { a, b } = orientFact(f, this.rng);
    const product = a * b;

    const arc = this.mode === "test" ? TEST.arcAt(this.asked) : this.arc;
    const answer = kind === "answer" ? product : a;
    const wrongs = kind === "answer"
      ? distractors(a, b, this.optCount - 1, this.rng)
      : factorDistractors(a, b, this.optCount - 1, this.rng);

    const q = {
      id: this.nextId++,
      kind, a, b, product, answer, key: f.key, load: f.load,
      prompt: kind === "answer" ? `${a} × ${b} = ?` : `? × ${b} = ${product}`,
      born: this.elapsed, hit: false, errored: false, errors: 0, done: false, arc,
    };
    this.q = q;
    this.asked++;
    this.answered++;
    this.targets++;
    this.recent = [f.key, ...this.recent].slice(0, 4);

    const vals = [answer, ...wrongs];
    // Shuffle so the answer isn't reliably in the same slot.
    for (let i = vals.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [vals[i], vals[j]] = [vals[j], vals[i]];
    }
    vals.forEach((v, i) => {
      const x = this.fanX(i, vals.length);
      this.makeObj(v, v === answer, {
        qid: q.id, factKey: f.key, arc, x,
        // The fan OPENS as it rises — outer numbers drift outward — so two
        // discs can never converge into each other mid-flight.
        vx: (x - LW / 2) * 0.05,
        delay: this.rng() * 0.18,
      });
    });
    this.emit({ type: "ask", q });
  },

  throwStream() {
    const t = this.streamTable;
    const good = this.rng() < 0.48;
    let val, key = null;
    if (good) {
      const f = pickFact(this.mastery, [t], this.rng, this.recent);
      val = f.product;
      key = f.key;
      this.recent = [f.key, ...this.recent].slice(0, 4);
      this.targets++;
    } else {
      val = nonMultiple(t, this.rng);
    }
    this.thrown++;
    this.makeObj(val, good, {
      factKey: key,
      x: X_PAD + this.rng() * (LW - X_PAD * 2),
      vx: (this.rng() - 0.5) * 40,
      arc: this.arc * (0.9 + this.rng() * 0.2),
    });
  },

  /* ================================ scoring ============================== */

  multiplier() { return Math.min(6, 1 + Math.floor(this.combo / 4)); },

  logFact(key, right, ms) {
    if (!key) return;
    Mastery.record(this.mastery, key, right, ms);
  },

  scoreHit(load) {
    const depth = this.mode === "test" ? 1 + this.answered * 0.02 : 1;
    const pts = Math.round((8 + load * 3) * this.multiplier() * depth);
    this.score += pts;
    return pts;
  },

  bumpCombo() {
    this.combo++;
    if (this.combo > this.bestCombo) this.bestCombo = this.combo;
    // A long clean chain buys a heart back (never above the belt's own limit).
    // It is the only way to recover one, so a good run can survive an early
    // wobble without the whole thing being decided in the first minute.
    if (this.combo % 15 === 0 && this.hearts < this.maxHearts) {
      this.hearts++;
      this.emit({ type: "heal", hearts: this.hearts });
    }
  },

  loseHeart(x, y) {
    this.combo = 0;
    if (this.hearts === Infinity) return;
    this.hearts--;
    this.emit({ type: "hurt", hearts: this.hearts, x, y });
    if (this.hearts <= 0) this.finish("out");
  },

  /* ================================= input =============================== */

  // One swipe, in logical stage coordinates. Returns everything it cut, so the
  // renderer can spray the right colour of juice at the right place.
  //
  // Deliberately cuts EVERY object the segment crosses, including several from
  // the same question: a player who slashes across the whole fan gets the one
  // right answer and three wrong ones, and three wrong ones costs three hearts.
  // That is what stops "slice everything" being a strategy.
  swipe(x0, y0, x1, y1) {
    if (!this.running || this.paused) return [];
    const cut = [];
    for (const o of this.objs) {
      if (o.delay > 0 || o.sliced || o.spent) continue;
      if (o.y > SLICE_Y) continue;                 // not in play yet
      if (!segCircleHit(x0, y0, x1, y1, o.x, o.y, o.r)) continue;
      cut.push(o);
    }
    for (const o of cut) this.onSlice(o);
    return cut;
  },

  // Tap support: an eight-year-old's first instinct on a touchscreen is to
  // poke, and both paths ending in the same call costs nothing.
  tap(x, y) { return this.swipe(x - 1, y - 1, x + 1, y + 1); },

  onSlice(o) {
    o.sliced = true;
    o.sliceT = 0;
    const ms = (this.elapsed - o.born) * 1000;

    if (this.wave.type === "multiples") {
      if (o.good) {
        this.bumpCombo();
        this.hits++;
        this.logFact(o.factKey, true, ms);
        const pts = this.scoreHit(FACT_BY_KEY[o.factKey] ? FACT_BY_KEY[o.factKey].load : 2);
        this.emit({ type: "hit", x: o.x, y: o.y, val: o.val, pts, combo: this.combo });
      } else {
        this.wrongs++;
        this.emit({ type: "wrong", x: o.x, y: o.y, val: o.val });
        this.loseHeart(o.x, o.y);
      }
      return;
    }

    const q = this.q;
    if (!q || o.qid !== q.id || q.done) return;   // a straggler from a dead set

    if (o.good) {
      q.hit = true;
      q.done = true;
      this.hits++;
      // Mastery only hears about the FIRST outcome: correcting yourself after a
      // wrong slice still means you didn't know it, and the fact has to come
      // back round.
      if (!q.errored) this.logFact(q.key, true, (this.elapsed - q.born) * 1000);
      this.bumpCombo();
      const pts = this.scoreHit(q.load);
      for (const x of this.objs) if (x.qid === q.id && x !== o) x.spent = true;
      this.emit({ type: "hit", x: o.x, y: o.y, val: o.val, pts, combo: this.combo, q });
      this.beat = this.gap;
    } else {
      if (!q.errored) {
        q.errored = true;
        this.logFact(q.key, false, (this.elapsed - q.born) * 1000);
      }
      q.errors++;
      this.wrongs++;
      this.combo = 0;
      // The FIRST wrong answer to a question is a free think. It still costs
      // the chain and it still counts against her stars, but it does not cost a
      // heart, and the question stays open so she can go and find the right
      // one. This is the difference between a game that teaches the 7s and a
      // game that ends after three of them — and it is not a soft option,
      // because slashing at the whole fan racks up four wrongs on one question
      // and burns three hearts in a second.
      const free = q.errors === 1;
      this.emit({ type: "wrong", x: o.x, y: o.y, val: o.val, q, free });
      if (!free) this.loseHeart(o.x, o.y);
    }
  },

  /* ================================== loop =============================== */

  update(dt) {
    if (!this.running || this.paused) return;
    if (dt > 0.05) dt = 0.05;
    this.elapsed += dt;

    for (const o of this.objs) {
      if (o.delay > 0) { o.delay -= dt; continue; }
      if (o.sliced) { o.sliceT += dt; }
      o.vy += GRAV * dt;
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      o.spin += o.spinV * dt;
    }

    const keep = [];
    for (const o of this.objs) {
      if (o.delay <= 0 && o.y > LH + 80 && o.vy > 0) this.onFall(o);
      else keep.push(o);
    }
    this.objs = keep;

    if (!this.running) return;
    if (this.wave.type === "multiples") this.tickStream(dt);
    else this.tickQuestions(dt);
  },

  tickQuestions(dt) {
    if (this.q && !this.q.done) return;             // waiting on the player
    this.beat -= dt;
    if (this.beat > 0) return;
    if (this.mode === "belt" && this.asked >= this.wave.n) {
      if (this.objs.length === 0) this.nextWave();
      return;
    }
    this.askQuestion();
  },

  tickStream(dt) {
    if (this.thrown < this.wave.n) {
      this.beat -= dt;
      if (this.beat <= 0) {
        this.throwStream();
        // Streams breathe more than question sets do — a 2s flight with a 0.5s
        // gap would put four numbers in the air at once and stop being readable.
        // The multiplier came down with the gravity change: flights are longer
        // now, so the same multiplier would have left the dojo half empty.
        this.beat = this.gap * 1.3;
      }
    } else if (this.objs.length === 0) {
      this.nextWave();
    }
  },

  onFall(o) {
    if (o.sliced || o.spent) return;
    if (this.wave.type === "multiples") {
      if (!o.good) return;                          // letting a decoy go is correct
      this.combo = 0;
      this.logFact(o.factKey, false, 9999);
      this.emit({ type: "miss", x: o.x, val: o.val });
      return;
    }
    const q = this.q;
    if (!q || o.qid !== q.id || q.done || !o.good) return;
    q.done = true;
    this.combo = 0;
    if (!q.errored) this.logFact(q.key, false, 9999);
    for (const x of this.objs) if (x.qid === q.id) x.spent = true;
    this.emit({ type: "miss", x: o.x, val: o.val, q });
    this.beat = this.gap;
    // Endless is not survivable on hesitation alone — a missed question there
    // costs a heart, which is what makes the shrinking arc lethal.
    if (this.mode === "test") this.loseHeart(o.x, LH - 60);
  },
};
