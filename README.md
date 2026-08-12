# Number Ninja 🥷

Numbers fly up from the dojo floor. Slice the right ones, let the rest fall.
A times-tables arcade that drills every fact from 2×2 to 12×12 — and grows
eleven dojo spirits while it does it.

**Play it:** https://rvenning.github.io/number-ninja/

## How it plays

Three kinds of round, so both directions of every fact get drilled:

| Round | The banner says | You slice |
|---|---|---|
| **Answer** | `7 × 8 = ?` | `56`, from a fan of five |
| **Missing factor** | `? × 8 = 56` | `7` |
| **Multiples** | `multiples of 7` | every multiple in a rising stream, and nothing else |

The wrong answers are the wrong answers a child actually gives — a row out
(`7 × 8 → 63`), an addition slip (`→ 15`), a transposition (`56 → 65`) — so you
cannot pick by "which one looks about right".

**The first wrong answer to a question is a free think.** It costs your chain
and it costs your stars, but not a heart, and the question stays open so you can
go and find the right one. Slashing wildly at the whole fan is not a shortcut:
four wrong answers on one question burns three hearts in a second.

## Features

- **Twelve belts**, white to grandmaster, one table at a time and then all of
  them. Passing at all unlocks the next — stars are for pride, never for the
  gate.
- **Eleven dojo spirits**, one per table, from Flutter the butterfly (two wings)
  to Draco the dragon (twelve months). A spirit grows purely as its table is
  mastered — nothing to buy, no currency, only maths. Because `7 × 8` belongs to
  both, practising the 8s grows the 7s spirit too.
- **A mastery model per player.** Every one of the 66 unique facts carries a
  strength that rises when she answers it quickly, rises less when she is slow,
  and falls when she is wrong. Weak facts come round far more often, so the drill
  aims itself at whatever she does not know yet.
- **Sensei's Test** — an endless mixed run that gets tighter with every question
  until the throws stop reaching the blade. The only mode on the family
  leaderboard, because a score is the one number everyone can compare.
- **Practice** — pick a table, no hearts, no score, no ending. Where a belt that
  beat you gets solved.
- **A results screen that names the facts to look at next**, rather than just a
  grade.
- Family profiles with PINs, cross-device sync, offline play, installable.

## Built on gamekit

Profiles, storage/sync, sound, screens, particles and PWA install all come from
[gamekit](https://github.com/rvenning/gamekit), vendored into `lib/`. To pull in
a newer version:

```
node ../gamekit/tools/sync-to-game.js "<path to number-ninja>"
```

Never edit `lib/` by hand — the next sync overwrites it.

## Local development

No build step. Serve the folder:

```bash
npx http-server . -p 8116 -c-1
```

Run the tests (Node only, no framework):

```bash
node --test
```

`tests/facts.test.js` covers the maths itself — that no wrong answer is secretly
right, that no decoy in a multiples round is actually a multiple, and that the
mastery model behaves. `tests/bot.test.js` plays the whole campaign headlessly
with four bots, including a learner who improves as she is drilled, which is how
"the game teaches" is asserted rather than assumed. `tests/storage.test.js`
covers the cross-device merge.

```bash
CD_REPORT=1 node --test tests/bot.test.js    # per-belt balance table
```

## PWA files

`manifest.json`, `sw.js` (bump `CACHE` on any shell change), `icons/` (generate
with `node tools/make-icons.js`).

## Storage

localStorage prefix `nn_*`, Firestore collection `numberninja` in the shared
family project. The Firebase config in `js/firebase-config.js` is a client
config, not a secret — the key is restricted to the Cloud Firestore API and to
the games' own origins.

One field is unlike anything else in the family games: `mastery` is the only
saved value that legitimately goes **down**, so it cannot be max()-merged across
devices. A stale iPad that remembers her knowing `7 × 8` must not overwrite a
phone that has watched her get it wrong twice — the side with more attempts
wins the record. See `Mastery.merge` in `js/facts.js`.
