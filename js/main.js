// App shell — splash, roster, the dojo hub, the Den, practice, results and the
// family leaderboard. Profiles, PINs, sync and install all come from gamekit;
// this file only decides what goes on each screen.

const AVATARS = ["🥷", "🦊", "🐱", "🐼", "🦋", "🐙", "🐝", "🐲", "⭐", "🌈", "🐧", "🦉"];

const App = {
  profile: null,
  mastery: {},

  el(id) { return document.getElementById(id); },

  init() {
    const settings = Storage.getSettings();
    Sfx.enabled = settings.sound !== false;
    Music.enabled = settings.music !== false;

    GK.UI.onScreenChange = (name) => {
      Game.active = name === "game";
      if (name !== "game") Music.stop();
      if (name === "splash") this.refreshSplash();
    };
    GK.UI.bindSoundToggle(Storage);

    GK.Profiles.init({
      storage: Storage,
      avatars: AVATARS,
      meta: (p, prog) => {
        const m = prog.mastery || {};
        return `🥋 ${totalStars(prog)}★ · 🧠 ${Mastery.mastered(m)}/${FACTS.length} facts · ⚡ ${(prog.best || 0).toLocaleString()}`;
      },
      onEnter: (p) => { this.profile = p; this.showDojo(); },
      addLabel: "New Ninja",
    });

    GK.initPWA({ appName: "Number Ninja" });
    Render.boot();
    if (typeof GK.Debug !== "undefined") {
      GK.Debug.init({ storage: Storage, title: "NUMBER NINJA" })
        .action("+heart", () => { if (Game.running && Game.hearts !== Infinity) Game.hearts++; })
        .action("skip wave", () => { if (Game.running && Game.mode === "belt") Game.nextWave(); })
        .jump("belt", BELTS.length, (n) => this.startBelt(n - 1));
    }

    this.showScreen("splash");
    Storage.initFirebase().then((ok) => {
      this.el("sync-badge").textContent = ok ? "☁️ family sync on" : "📴 offline";
      if (ok && GK.UI.screen === "profiles") GK.Profiles.renderList();
      if (ok && GK.UI.screen === "splash") this.refreshSplash();
      if (ok && GK.UI.screen === "dojo") this.showDojo();
      if (ok && GK.UI.screen === "leaderboard") this.showLeaderboard(true);
    });
  },

  showScreen(name) { GK.UI.showScreen(name); },

  /* ------------------------------- splash -------------------------------- */
  refreshSplash() {
    const last = GK.Profiles.lastProfile();
    const cont = this.el("btn-continue-as"), start = this.el("btn-start");
    if (last) {
      cont.style.display = "";
      cont.textContent = `🥷 Continue as ${last.avatar} ${last.name}`;
      cont.onclick = () => { Sfx.init(); GK.Profiles.select(last); };
      start.className = "btn ghost";
      start.textContent = "👥 Switch Ninja";
    } else {
      cont.style.display = "none";
      start.className = "btn big green";
      start.textContent = "🥷 Enter the Dojo";
    }
  },

  play() {
    Sfx.init(); Sfx.click();
    GK.Profiles.renderList();
    this.showScreen("profiles");
  },

  /* -------------------------------- dojo --------------------------------- */
  showDojo() {
    if (!this.profile) return this.play();
    const prog = Storage.getProgress(this.profile.id);
    const m = prog.mastery || {};
    this.el("dojo-player").innerHTML = `${this.profile.avatar} <b>${GK.util.esc(this.profile.name)}</b>`;
    this.el("dojo-stars").textContent = `${totalStars(prog)}★`;

    const mastered = Mastery.mastered(m);
    this.el("stat-facts").textContent = `${mastered}/${FACTS.length}`;
    this.el("stat-best").textContent = (prog.best || 0).toLocaleString();
    const den = denSummary(m);
    this.el("stat-den").textContent = `${den.hatched}/${CREATURES.length}`;
    this.el("fact-fill").style.width = Math.round((mastered / FACTS.length) * 100) + "%";

    this.el("belt-list").innerHTML = BELTS.map((b, i) => {
      const open = beltUnlocked(prog, i);
      const st = beltStars(prog, i);
      const stars = "★★★".slice(0, st) + "☆☆☆".slice(0, 3 - st);
      const tables = b.tables.length > 4 ? "all tables" : b.tables.map((t) => "×" + t).join(" ");
      return `<button class="belt${open ? "" : " locked"}${st ? " done" : ""}"
        ${open ? `onclick="App.startBelt(${i})"` : "disabled"}
        aria-label="${GK.util.esc(b.name)}, ${open ? tables : "locked"}">
        <span class="belt-icon" style="--tint:${b.tint}">${open ? b.icon : "🔒"}</span>
        <span class="belt-body">
          <span class="belt-name">${GK.util.esc(b.name)}</span>
          <span class="belt-sub">${open ? GK.util.esc(b.blurb) : "Pass " + GK.util.esc(BELTS[i - 1].name) + " to unlock"}</span>
        </span>
        <span class="belt-stars">${open ? stars : ""}</span>
      </button>`;
    }).join("");

    const top = highestUnlocked(prog);
    this.el("btn-test").disabled = top < 2;
    this.el("test-note").textContent = top < 2
      ? "Pass the Yellow Belt to unlock Sensei's Test."
      : `Best: ${(prog.best || 0).toLocaleString()}`;
    this.showScreen("dojo");
  },

  /* -------------------------------- sessions ------------------------------ */
  beginSession(cfg, spirit) {
    Sfx.init(); Sfx.click();
    const prog = Storage.getProgress(this.profile.id);
    this.mastery = prog.mastery || {};
    Game.start({ ...cfg, mastery: this.mastery });
    Game.active = true;
    Render.spirit = spirit || null;
    Render.blade = [];
    this.showScreen("game");
    Render.resize();        // the stage only has a size once it is visible
    Render.hud();
    if (Music.enabled) Music.start("dojo");
  },

  startBelt(i) {
    const prog = Storage.getProgress(this.profile.id);
    if (!beltUnlocked(prog, i)) return;
    const b = BELTS[i];
    // The spirit watching from the mat is the one whose table this belt is
    // about; a mixed belt gets Prism, since the 7s are what it really tests.
    const t = b.tables.length > 4 ? 7 : b.tables[b.tables.length - 1];
    this.beginSession({ mode: "belt", beltIdx: i }, CREATURE_BY_TABLE[t].icon);
  },

  startTest() {
    this.beginSession({ mode: "test" }, "🏮");
  },

  startPractice(t) {
    this.beginSession({ mode: "practice", table: t }, CREATURE_BY_TABLE[t].icon);
  },

  /* -------------------------------- pause -------------------------------- */
  togglePause() { Game.paused ? this.resume() : this.pause(); },
  pause() {
    if (!Game.running) return;
    Game.paused = true;
    Music.stop();
    GK.UI.openModal("modal-pause");
  },
  resume() {
    Game.paused = false;
    GK.UI.closeModal("modal-pause");
    Render._last = performance.now();
    if (Music.enabled) Music.start("dojo");
  },
  quitRun() {
    GK.UI.closeModal("modal-pause");
    Game.paused = false;
    Game.quit();
  },

  toggleMusic() {
    const on = Music.toggle();
    this.el("btn-music").textContent = on ? "🎵 Music: On" : "🔇 Music: Off";
    const s = Storage.getSettings();
    s.music = on;
    Storage.saveSettings(s);
    if (on && Game.running && !Game.paused) Music.start("dojo");
    Sfx.click();
  },

  /* ------------------------------- results ------------------------------- */
  sessionOver(res) {
    Game.active = false;
    Music.stop();

    // Practice is never graded and never banked as a run — it only teaches.
    if (res.mode === "practice") {
      Storage.recordPractice(this.profile.id, this.mastery);
      this.showPractice();
      return;
    }

    const prevBest = (Storage.getProgress(this.profile.id).best) || 0;
    const saved = Storage.recordRun(this.profile.id, res, this.mastery);
    if (res.reason === "quit") { this.showDojo(); return; }

    const evos = evolutions(res.masteryBefore, this.mastery);
    const diff = sessionDiff(res.masteryBefore, this.mastery);

    if (res.mode === "belt") {
      this.el("res-emoji").textContent = res.won ? BELTS[res.beltIdx].icon : "💥";
      this.el("res-title").textContent = res.won ? `${BELTS[res.beltIdx].name} passed!` : "Out of hearts";
      this.el("res-stars").textContent = res.won ? "★★★".slice(0, res.stars) + "☆☆☆".slice(0, 3 - res.stars) : "";
      this.el("res-score").textContent = res.score.toLocaleString();
      this.el("res-sub").textContent = res.won
        ? `${Math.round(res.accuracy * 100)}% right first time`
        : `You got ${res.hits} of ${res.targets} — have another go.`;
    } else {
      const newBest = res.score > prevBest;
      this.el("res-emoji").textContent = newBest ? "🏆" : "⚡";
      this.el("res-title").textContent = newBest ? "NEW BEST!" : "Sensei's Test";
      this.el("res-stars").textContent = "";
      this.el("res-score").textContent = res.score.toLocaleString();
      this.el("res-sub").textContent = newBest
        ? `Beat your old best of ${prevBest.toLocaleString()}`
        : `Best: ${(saved.best || 0).toLocaleString()}`;
      if (newBest) setTimeout(() => Sfx.newBest(), 350);
    }

    this.el("res-stats").innerHTML = [
      `✅ ${res.hits} sliced`,
      `❌ ${res.wrongs} wrong`,
      `💨 ${res.misses} missed`,
      `🔥 best chain ${res.bestCombo}`,
    ].map((b) => `<div>${b}</div>`).join("");

    // The most useful line on the screen: exactly which facts to look at next.
    const note = this.el("res-note");
    if (diff.missed.length) {
      const list = diff.missed.slice(0, 5).map((f) => `${f.a} × ${f.b} = ${f.product}`).join(" · ");
      note.innerHTML = `<b>Worth another look:</b><br>${list}`;
      note.className = "res-note work";
    } else if (res.targets) {
      note.innerHTML = "🎯 Every single one right. Sensei bows.";
      note.className = "res-note perfect";
    } else {
      note.innerHTML = "";
      note.className = "res-note";
    }

    this.el("res-evo").innerHTML = evos.length
      ? evos.map((e) => `<div class="evo">${e.icon} <b>${GK.util.esc(e.name)}</b> grew to ${GK.util.esc(e.to.name)}!</div>`).join("")
      : "";
    if (evos.length) setTimeout(() => Sfx.hatch(), 700);
    else if (res.mode === "belt") setTimeout(() => (res.won ? Sfx.beltWon(res.stars) : Sfx.gameover()), 200);

    const again = this.el("btn-again");
    again.textContent = res.mode === "belt" ? "↻ Try again" : "↻ Test again";
    again.onclick = () => (res.mode === "belt" ? this.startBelt(res.beltIdx) : this.startTest());

    this.showScreen("results");
  },

  /* --------------------------------- den ---------------------------------- */
  showDen() {
    Sfx.click();
    const prog = Storage.getProgress(this.profile.id);
    const m = prog.mastery || {};
    const den = denSummary(m);
    this.el("den-sub").textContent =
      `${den.hatched} of ${CREATURES.length} awake · ${den.masters} fully grown`;
    this.el("den-grid").innerHTML = den.all.map((c) => {
      const pct = Math.round(c.progress * 100);
      return `<div class="pet stage-${c.stage.id}">
        <div class="pet-icon" style="--hue:${c.hue}">${c.icon}</div>
        <div class="pet-name">${GK.util.esc(c.name)}</div>
        <div class="pet-tag">×${c.t} · ${GK.util.esc(c.why)}</div>
        <div class="pet-bar"><i style="width:${pct}%; background:${c.hue}"></i></div>
        <div class="pet-stage">${GK.util.esc(c.stage.name)} · ${pct}%</div>
      </div>`;
    }).join("");
    this.showScreen("den");
  },

  /* ------------------------------- practice ------------------------------- */
  showPractice() {
    const prog = Storage.getProgress(this.profile.id);
    const m = prog.mastery || {};
    this.el("prac-grid").innerHTML = TABLES.map((t) => {
      const c = CREATURE_BY_TABLE[t];
      const pct = Math.round(Mastery.tableProgress(m, t) * 100);
      return `<button class="prac" onclick="App.startPractice(${t})" aria-label="Practise the ${t} times table">
        <span class="prac-n">×${t}</span>
        <span class="prac-icon">${creatureState(m, t).icon}</span>
        <span class="prac-bar"><i style="width:${pct}%; background:${c.hue}"></i></span>
      </button>`;
    }).join("");
    this.showScreen("practice");
  },

  /* ----------------------------- leaderboard ------------------------------ */
  showLeaderboard(silent) {
    if (!silent) Sfx.click();
    GK.Profiles.renderLeaderboard("lb-rows", {
      cols: (r) => {
        const m = r.progress.mastery || {};
        return `<span class="lb-stat">🥋 ${totalStars(r.progress)}★</span>
          <span class="lb-stat">🧠 ${Mastery.mastered(m)}</span>
          <span class="lb-stat">⚡ ${(r.progress.best || 0).toLocaleString()}</span>`;
      },
      sort: (a, b) => (b.progress.best || 0) - (a.progress.best || 0)
        || totalStars(b.progress) - totalStars(a.progress),
      meId: this.profile?.id,
      empty: "No ninjas yet — tap Play!",
    });
    this.showScreen("leaderboard");
  },
};

// Init on DOMContentLoaded rather than inline at the bottom of <body>: a first
// render before layout settles resolves viewport-relative clamp() font sizes to
// the inherited value, and only on that first screen.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => App.init());
} else {
  App.init();
}
