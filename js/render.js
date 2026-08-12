// Canvas, input and the frame loop. Everything that touches a pixel, a pointer
// or the DOM lives here so js/game.js can stay a pure simulation.
//
// Draw space is the fixed 320x480 logical stage. The real canvas is nearly
// always taller, so the dojo is painted out past the stage edges to the true
// canvas bounds — more wall and more floor, never letterbox bars, and the
// playfield is then identical on every device, which is what makes a family
// leaderboard fair.

const Render = {
  cv: null, ctx: null, DPR: 1, scale: 1, viewLW: LW, viewLH: LH, offX: 0, offY: 0,
  blade: [], lastPt: null, moved: 0, downPt: null,
  clock: 0, bannerT: 0, banner: "", flashCombo: 0,

  /* ============================== boot / canvas ========================== */
  boot() {
    this.cv = document.getElementById("cv");
    this.ctx = this.cv.getContext("2d");
    this.resize();
    const re = () => this.resize();
    window.addEventListener("resize", re);
    // iOS settles its viewport lazily (toolbars, rotation, standalone launch),
    // so measure again well after the event as well as on it.
    window.addEventListener("orientationchange", () => setTimeout(re, 350));
    if (window.visualViewport) window.visualViewport.addEventListener("resize", re);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && Game.running && !Game.paused) App.pause();
    });
    this.bindInput();
    this._last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  },

  resize() {
    const wrap = this.cv.parentElement;
    const w = wrap.clientWidth, h = wrap.clientHeight;
    // The game screen is display:none until it is shown, which measures 0x0 —
    // retry rather than caching a broken layout.
    if (w < 50 || h < 50) { setTimeout(() => this.resize(), 200); return; }
    this.DPR = Math.min(window.devicePixelRatio || 1, 2);
    // A canvas is a replaced element: the width/height ATTRIBUTES are the
    // backing store. css/style.css pins the DISPLAY size to 100%/100% so it can
    // never disagree with the stage; only the backing store is set here.
    this.cv.width = Math.round(w * this.DPR);
    this.cv.height = Math.round(h * this.DPR);
    this.scale = Math.min(w / LW, h / LH);
    this.viewLW = w / this.scale;
    this.viewLH = h / this.scale;
    this.offX = (this.viewLW - LW) / 2;
    this.offY = (this.viewLH - LH) / 2;
    this.W = w; this.H = h;
  },

  toLogical(cssX, cssY) {
    return [cssX / this.scale - this.offX, cssY / this.scale - this.offY];
  },

  /* ================================= input =============================== */
  // A swipe is a chain of short segments, each tested against every number in
  // play, so a fast flick can't tunnel past one between frames.
  bindInput() {
    const stage = document.querySelector(".game-stage");
    const pt = (e) => {
      const r = stage.getBoundingClientRect();
      return this.toLogical(e.clientX - r.left, e.clientY - r.top);
    };

    const down = (e) => {
      e.preventDefault();
      GK.Sfx.init();
      // Set the gesture state BEFORE capturing: setPointerCapture throws
      // NotFoundError for a pointer the browser doesn't consider active, and
      // ?. does not protect against the throw — it would take the rest of this
      // handler with it.
      this.lastPt = pt(e);
      this.downPt = this.lastPt;
      this.moved = 0;
      this.blade = [{ x: this.lastPt[0], y: this.lastPt[1], t: this.clock }];
      try { stage.setPointerCapture?.(e.pointerId); } catch { /* not capturable */ }
    };

    const move = (e) => {
      if (!this.lastPt) return;
      // PointerEvent.pressure is ZERO for ordinary touch on iOS, so never gate
      // on it — ask what kind of pointer it is instead.
      if (e.pointerType !== "touch" && e.pointerType !== "pen" && !e.buttons) return;
      e.preventDefault();
      const p = pt(e);
      this.moved += Math.hypot(p[0] - this.lastPt[0], p[1] - this.lastPt[1]);
      this.cutSegment(this.lastPt, p);
      this.lastPt = p;
      this.blade.push({ x: p[0], y: p[1], t: this.clock });
      if (this.blade.length > 22) this.blade.shift();
    };

    const up = (e) => {
      // A poke is a legitimate way to play — an eight-year-old's first instinct
      // on a touchscreen — and both paths end in the same engine call.
      if (this.downPt && this.moved < 7) {
        const cut = Game.tap(this.downPt[0], this.downPt[1]);
        if (cut.length) this.onCut(cut);
      }
      this.lastPt = null;
      this.downPt = null;
    };

    stage.addEventListener("pointerdown", down, { passive: false });
    stage.addEventListener("pointermove", move, { passive: false });
    stage.addEventListener("pointerup", up);
    stage.addEventListener("pointercancel", up);
    // Some iOS builds are stingy with pointermove during a fast flick.
    stage.addEventListener("touchmove", (e) => {
      if (!this.lastPt || !e.touches.length) return;
      e.preventDefault();
      const r = stage.getBoundingClientRect();
      const p = this.toLogical(e.touches[0].clientX - r.left, e.touches[0].clientY - r.top);
      this.moved += Math.hypot(p[0] - this.lastPt[0], p[1] - this.lastPt[1]);
      this.cutSegment(this.lastPt, p);
      this.lastPt = p;
      this.blade.push({ x: p[0], y: p[1], t: this.clock });
      if (this.blade.length > 22) this.blade.shift();
    }, { passive: false });
    stage.addEventListener("contextmenu", (e) => e.preventDefault());

    window.addEventListener("keydown", (e) => {
      if (!Game.active) return;
      if (e.code === "Escape" || e.code === "KeyP") { e.preventDefault(); App.togglePause(); }
    });
    // iOS ignores user-scalable=no for pinch; block the gesture at the source.
    document.addEventListener("gesturestart", (e) => e.preventDefault());
    document.addEventListener("gesturechange", (e) => e.preventDefault());
  },

  cutSegment(a, b) {
    const cut = Game.swipe(a[0], a[1], b[0], b[1]);
    if (cut.length) this.onCut(cut);
  },

  onCut(cut) {
    for (const o of cut) {
      o.cutA = this.lastPt && this.downPt
        ? Math.atan2(this.lastPt[1] - o.y, this.lastPt[0] - o.x)
        : Math.random() * Math.PI;
    }
  },

  /* ================================== loop =============================== */
  loop(t) {
    const dt = Math.min(0.05, (t - this._last) / 1000);
    this._last = t;
    this.clock += dt;

    if (Game.active) {
      const live = Game.running && !Game.paused;
      if (live) { Game.update(dt); Fx.update(dt); }

      // Drain OUTSIDE the live branch, always. The "end" event is emitted by
      // the very act of the run stopping, so gating the drain on the sim being
      // live means the app is never told it is over and the game screen sits
      // there forever. Two ways in: quitting from the pause sheet (emitted
      // while paused), and the last heart going on a wrong slice (emitted from
      // the pointer handler, so `running` is already false by the next frame).
      // It only ever appeared to work because a run that ends inside update()
      // is drained later in the same iteration.
      this.drain();

      // drain() can hand over to the results screen, which clears Game.active.
      if (Game.active) {
        if (live) { this.draw(dt); this.hud(); } else { this.draw(0); }
        // A stage can resize with no resize event — a web font landing, the HUD
        // row growing. Notice the drift rather than hunting every cause.
        const b = this.cv.parentElement.getBoundingClientRect();
        if (b.width > 50 && Math.abs(b.width - this.W) > 1) this.resize();
      }
    }
    if (typeof GK.Debug !== "undefined") GK.Debug.frame(dt);
    requestAnimationFrame((t2) => this.loop(t2));
  },

  drain() {
    const evs = Game.events;
    if (!evs.length) return;
    Game.events = [];
    for (const e of evs) {
      if (e.type === "hit") {
        Sfx.slice(Math.floor(e.combo / 4));
        Fx.burst(e.x, e.y, "#ffe066", 14, 190, 0.6, 3);
        Fx.text(e.x, e.y - 6, "+" + e.pts, { color: "#ffe066", size: 15 });
        if (e.combo >= 4 && e.combo % 4 === 0) {
          this.flashCombo = 0.6;
          Fx.text(LW / 2, 150, "x" + Game.multiplier() + " CHAIN!", { color: "#7ee6b0", size: 20 });
        }
      } else if (e.type === "wrong") {
        Sfx.clack();
        Fx.burst(e.x, e.y, "#ff6b81", e.free ? 10 : 16, 170, 0.55, 3);
        Fx.addShake(e.free ? 4 : 8);
        // A free think looks like a nudge; a heart lost looks like a hit.
        if (e.free) Fx.text(e.x, e.y - 8, "have another think", { color: "#ffd6a0", size: 12 });
        else Fx.addFlash(0.3, "#ff4d6d");
      } else if (e.type === "miss") {
        Sfx.whiff();
      } else if (e.type === "heal") {
        Sfx.heart();
        Fx.text(LW / 2, 190, "❤️ HEART BACK", { color: "#ff8fb0", size: 17 });
      } else if (e.type === "hurt") {
        // covered by the wrong/miss juice above
      } else if (e.type === "wave") {
        if (e.total) {
          Sfx.waveUp();
          this.setBanner(this.waveTitle(e));
        }
      } else if (e.type === "end") {
        App.sessionOver(e.result);
      }
    }
  },

  waveTitle(e) {
    const w = e.wave;
    if (w.type === "multiples") return `Round ${e.index + 1} — slice the ${e.table}s`;
    if (w.type === "factor") return `Round ${e.index + 1} — find the missing one`;
    return `Round ${e.index + 1} — slice the answer`;
  },

  setBanner(text) { this.banner = text; this.bannerT = 2.2; },

  /* ================================== HUD ================================ */
  hud() {
    const el = (id) => document.getElementById(id);
    const hearts = Game.hearts === Infinity ? "∞" : "❤️".repeat(Math.max(0, Game.hearts));
    el("hud-hearts").textContent = hearts;
    el("hud-score").textContent = Game.score.toLocaleString();
    const c = el("hud-combo");
    c.textContent = Game.combo >= 2 ? `🔥 ${Game.combo}` : "";
    c.classList.toggle("hot", Game.combo >= 8);
    el("hud-round").textContent = Game.mode === "belt"
      ? `${Game.belt.icon} ${Game.waveIdx + 1}/${Game.belt.waves.length}`
      : Game.mode === "test" ? `⚡ ${Game.answered}` : "🧘 practice";
  },

  /* ================================ drawing ============================== */
  draw(dt) {
    const ctx = this.ctx;
    if (!ctx || !this.W) return;
    if (this.bannerT > 0) this.bannerT -= dt;
    if (this.flashCombo > 0) this.flashCombo -= dt;

    const s = this.scale * this.DPR;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.translate(this.offX, this.offY);

    const L = -this.offX, T = -this.offY;
    const R = LW + this.offX, B = LH + this.offY;

    this.drawDojo(ctx, L, T, R, B);

    const [shx, shy] = Fx.shakeOffset();
    ctx.save();
    ctx.translate(shx, shy);

    for (const o of Game.objs) this.drawNumber(ctx, o);
    this.drawBlade(ctx);
    Fx.render(ctx);
    ctx.restore();

    if (Fx.flash > 0) {
      ctx.globalAlpha = Math.min(1, Fx.flash);
      ctx.fillStyle = Fx.flashColor;
      ctx.fillRect(L, T, R - L, B - T);
      ctx.globalAlpha = 1;
    }

    this.drawPrompt(ctx, L, R, T);
    this.drawFirstHint(ctx);
    if (this.bannerT > 0) this.drawBanner(ctx, L, R);
  },

  // Nobody has told a first-time player what to do with a flying number, and
  // .keys-hint on the splash is `@media (pointer: fine)` — so it shows in a
  // desktop preview and is hidden on the iPad this is actually played on. This
  // sits on the canvas until she cuts her first number and then never appears
  // again.
  drawFirstHint(ctx) {
    if (!(Game.mode === "belt" && Game.beltIdx === 0 && Game.waveIdx === 0 && Game.hits === 0)) return;
    ctx.save();
    ctx.globalAlpha = 0.6 + Math.sin(this.clock * 3) * 0.2;
    ctx.fillStyle = "#ffe9b8";
    ctx.font = "700 15px 'Baloo 2', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("👆 swipe across the right number", LW / 2, SLICE_Y - 26);
    ctx.restore();
  },

  drawDojo(ctx, L, T, R, B) {
    const g = ctx.createLinearGradient(0, T, 0, B);
    g.addColorStop(0, "#1a1440");
    g.addColorStop(0.55, "#241a55");
    g.addColorStop(1, "#150f33");
    ctx.fillStyle = g;
    ctx.fillRect(L, T, R - L, B - T);

    // Paper screens on the back wall — a lattice of warm rectangles, static so
    // they read as architecture rather than as anything to slice.
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = "#ffd9a0";
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 3; j++) {
        const x = L + 14 + i * ((R - L - 28) / 4);
        const y = T + 58 + j * 66;
        ctx.fillRect(x + 4, y, (R - L - 28) / 4 - 8, 56);
      }
    }
    ctx.restore();

    // A big paper moon behind the action.
    ctx.save();
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = "#fff3d6";
    ctx.beginPath();
    ctx.arc(LW * 0.5, 186, 96, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // The floor. Its top edge IS the slice line, so she can see numbers rising
    // into play rather than guessing where "in play" starts.
    ctx.fillStyle = "#3b2417";
    ctx.fillRect(L, SLICE_Y, R - L, B - SLICE_Y);
    ctx.fillStyle = "#4a2e1d";
    for (let x = Math.floor(L / 46) * 46; x < R; x += 46) {
      ctx.fillRect(x + 2, SLICE_Y + 4, 42, B - SLICE_Y);
    }
    ctx.fillStyle = "#c9a227";
    ctx.fillRect(L, SLICE_Y - 3, R - L, 3);
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "#ffe9a8";
    ctx.fillRect(L, SLICE_Y - 5, R - L, 2);
    ctx.restore();

    // The dojo spirit watching from the mat.
    if (this.spirit) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.font = "30px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const bob = Math.sin(this.clock * 2.2) * 4;
      ctx.fillText(this.spirit, LW - 34, SLICE_Y + 34 + bob);
      ctx.restore();
    }
  },

  // Every number looks exactly the same until it is cut. A decoy that could be
  // told from an answer by anything other than the maths would drill nothing.
  drawNumber(ctx, o) {
    if (o.delay > 0) return;
    const dim = o.spent && !o.sliced;
    ctx.save();
    ctx.globalAlpha = dim ? 0.35 : 1;

    if (o.sliced) {
      // Two halves parting along the cut, spinning away and fading.
      const a = o.cutA !== undefined ? o.cutA : 0.4;
      const sep = Math.min(26, o.sliceT * 90);
      const fade = Math.max(0, 1 - o.sliceT * 1.5);
      ctx.globalAlpha = fade;
      for (const sgn of [-1, 1]) {
        ctx.save();
        ctx.translate(o.x + Math.cos(a + Math.PI / 2) * sep * sgn,
                      o.y + Math.sin(a + Math.PI / 2) * sep * sgn);
        ctx.rotate(o.spin + sgn * o.sliceT * 2.2);
        ctx.beginPath();
        ctx.arc(0, 0, o.r, a + (sgn > 0 ? 0 : Math.PI), a + (sgn > 0 ? Math.PI : Math.PI * 2));
        ctx.closePath();
        ctx.fillStyle = o.good ? "#2fbf7a" : "#8b3a4a";
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
      return;
    }

    ctx.translate(o.x, o.y);
    ctx.rotate(Math.sin(o.spin) * 0.14);

    ctx.beginPath();
    ctx.arc(0, 3, o.r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fill();

    const g = ctx.createLinearGradient(0, -o.r, 0, o.r);
    g.addColorStop(0, "#fff6df");
    g.addColorStop(1, "#e8cfa0");
    ctx.beginPath();
    ctx.arc(0, 0, o.r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#8a5a2b";
    ctx.stroke();

    ctx.fillStyle = "#2a1b10";
    const txt = String(o.val);
    ctx.font = `800 ${txt.length > 2 ? 19 : 22}px 'Baloo 2', system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(txt, 0, 1);
    ctx.restore();
  },

  drawBlade(ctx) {
    if (this.blade.length < 2) return;
    const now = this.clock;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = 1; i < this.blade.length; i++) {
      const p = this.blade[i - 1], q = this.blade[i];
      const age = now - q.t;
      if (age > 0.32) continue;
      const a = 1 - age / 0.32;
      ctx.globalAlpha = a * 0.9;
      ctx.strokeStyle = "#bff4ff";
      ctx.lineWidth = 1 + a * 7;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
    }
    ctx.restore();
    while (this.blade.length && now - this.blade[0].t > 0.32) this.blade.shift();
  },

  // The question, on a plaque at the top. Big, because reading it is half the
  // work and she is doing it while five numbers are in the air.
  drawPrompt(ctx, L, R, T) {
    let text = "";
    if (Game.wave && Game.wave.type === "multiples") {
      text = `multiples of ${Game.streamTable}`;
    } else if (Game.q && !Game.q.done) {
      text = Game.q.prompt;
    } else if (Game.q) {
      text = Game.q.kind === "answer"
        ? `${Game.q.a} × ${Game.q.b} = ${Game.q.product}`
        : `${Game.q.a} × ${Game.q.b} = ${Game.q.product}`;
    }
    if (!text) return;

    ctx.save();
    ctx.font = "800 27px 'Baloo 2', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const w = Math.max(150, ctx.measureText(text).width + 44);
    const y = 34;
    ctx.fillStyle = "rgba(10,7,28,0.82)";
    this.roundRect(ctx, LW / 2 - w / 2, y - 25, w, 50, 16);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,224,102,0.5)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = Game.q && Game.q.done ? "#9ee8b8" : "#ffe9b8";
    ctx.fillText(text, LW / 2, y + 1);
    ctx.restore();
  },

  drawBanner(ctx, L, R) {
    const a = Math.min(1, this.bannerT / 0.4);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = "rgba(10,7,28,0.9)";
    ctx.fillRect(L, 196, R - L, 46);
    ctx.fillStyle = "#ffe066";
    ctx.font = "800 19px 'Baloo 2', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.banner, LW / 2, 219);
    ctx.restore();
  },

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  },
};
