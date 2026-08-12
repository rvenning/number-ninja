// Sound — gamekit's synth core plus Number Ninja's own noises, and a small
// lookahead music scheduler (a setInterval per note drifts, and browsers
// throttle background tabs to ~1Hz, which turns a tune into a machine gun on
// return).
//
// One deliberate design rule: a wrong slice must not sound like a buzzer. She
// is learning her tables and will get plenty of them wrong; the noise for it is
// a soft wooden clack, warm and quick, and then the game moves on.

const Sfx = GK.Sfx;

Object.assign(Sfx, {
  // A clean slice — a short bright shing that rises with the combo, so a chain
  // audibly climbs.
  slice(step = 0) {
    const base = 720 + Math.min(8, step) * 55;
    this.noise({ dur: 0.05, vol: 0.1 });
    this.tone({ freq: base, type: "triangle", dur: 0.09, vol: 0.14, slide: 260 });
    this.tone({ freq: base * 1.5, type: "sine", dur: 0.07, vol: 0.06, when: 0.03 });
  },
  // Wrong number. Low, soft, over in a moment.
  clack() {
    this.tone({ freq: 190, type: "square", dur: 0.09, vol: 0.13, slide: -70 });
    this.tone({ freq: 120, type: "sine", dur: 0.16, vol: 0.1, slide: -40 });
  },
  // A required number fell past — an airy whiff, not a punishment.
  whiff() {
    this.noise({ dur: 0.14, vol: 0.07 });
    this.tone({ freq: 420, type: "sine", dur: 0.16, vol: 0.06, slide: -180 });
  },
  heart() {
    [523, 784, 1047].forEach((f, i) =>
      this.tone({ freq: f, type: "sine", dur: 0.14, vol: 0.13, when: i * 0.06 }));
  },
  waveUp() {
    [392, 523, 659].forEach((f, i) =>
      this.tone({ freq: f, type: "triangle", dur: 0.14, vol: 0.12, when: i * 0.07 }));
  },
  beltWon(stars = 1) {
    const notes = [523, 659, 784, 1047, 1319];
    notes.slice(0, 2 + stars).forEach((f, i) =>
      this.tone({ freq: f, type: "square", dur: 0.2, vol: 0.16, when: i * 0.1 }));
    this.noise({ dur: 0.3, vol: 0.09, when: 0.1 });
  },
  gameover() {
    [392, 311, 262, 196].forEach((f, i) =>
      this.tone({ freq: f, type: "sawtooth", dur: 0.3, vol: 0.18, when: i * 0.15 }));
  },
  hatch() {
    [659, 880, 1047, 1319, 1568].forEach((f, i) =>
      this.tone({ freq: f, type: "sine", dur: 0.22, vol: 0.15, when: i * 0.1 }));
    this.noise({ dur: 0.2, vol: 0.08, when: 0.2 });
  },
  newBest() {
    [659, 784, 988, 1319, 1568].forEach((f, i) =>
      this.tone({ freq: f, type: "square", dur: 0.2, vol: 0.16, when: i * 0.11 }));
  },
});

/* ------------------------------------------------------------------ music */
// Semitone offsets from the root; null = rest. One step is an eighth note.
// A light, bouncy pentatonic dojo theme — pentatonic so nothing can clash with
// the slice tones playing over the top of it.
const TRACKS = {
  dojo: {
    root: 57,                        // A
    bpm: 116,
    bass: [0, null, null, 0, null, 7, null, null, 5, null, null, 5, null, 0, null, null],
    lead: [12, null, 14, null, 16, null, 19, null, 16, null, 14, null, 12, null, null, null,
           19, null, 16, null, 14, null, 12, null, 9, null, 12, null, 14, null, null, null],
  },
};

const midiHz = (n) => 440 * Math.pow(2, (n - 69) / 12);

const Music = {
  enabled: true, track: null, step: 0, nextT: 0, timer: null, LOOKAHEAD: 0.6,

  start(name) {
    const t = TRACKS[name];
    if (!t || !Sfx.ctx) return;
    if (this.track === t && this.timer) return;
    this.track = t;
    this.step = 0;
    this.nextT = Sfx.ctx.currentTime + 0.12;
    if (!this.timer) this.timer = setInterval(() => this.pump(), 110);
  },

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.track = null;
  },

  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled) this.stop();
    return this.enabled;
  },

  pump() {
    const t = this.track;
    if (!t || !this.enabled || !Sfx.enabled || !Sfx.ctx) return;
    const now = Sfx.ctx.currentTime;
    const spb = 60 / t.bpm / 2;
    // After a hitch (a backgrounded tab), skip the missed steps rather than
    // firing them all at once.
    if (this.nextT < now - 0.25) this.nextT = now + 0.05;
    while (this.nextT < now + this.LOOKAHEAD) {
      const when = this.nextT - now;
      const b = t.bass[this.step % t.bass.length];
      if (b !== null && b !== undefined)
        Sfx.tone({ freq: midiHz(t.root + b), type: "triangle", dur: spb * 0.9, vol: 0.06, when });
      const l = t.lead[this.step % t.lead.length];
      if (l !== null && l !== undefined)
        Sfx.tone({ freq: midiHz(t.root + 12 + l), type: "sine", dur: spb * 0.55, vol: 0.038, when });
      this.step++;
      this.nextT += spb;
    }
  },
};
