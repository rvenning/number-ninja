// Generate icons/ — a masked ninja against a night-purple dojo, with a gold
// blade slash across it.
// Run: node tools/make-icons.js  (from the number-ninja folder)
const fs = require("fs");
const path = require("path");
const { makeCanvas, downsample, encodePNG } = require("../lib/tools/png.js");

const OUT = path.join(__dirname, "..", "icons");
fs.mkdirSync(OUT, { recursive: true });

function paint(size, pad) {
  const SS = 4, big = size * SS;
  const cv = makeCanvas(big);
  const u = big / 100;               // 1 unit = 1% of the icon

  const NIGHT = "#150f33", PLUM = "#2f2168", GLOW = "#463090";
  const CLOTH = "#1b1440", BAND = "#ffb648", SKIN = "#f3d7b5";
  const INK = "#0d0824", GOLD = "#ffe066";

  // night sky, brighter toward the top
  cv.fillRect(0, 0, big, big, NIGHT);
  cv.fillRect(0, 0, big, 62 * u, PLUM);
  cv.fillCircle(50 * u, 26 * u, 24 * u, GLOW);   // paper moon

  // maskable art stays inside the safe centre (~72%)
  const s = pad ? 0.78 : 1;
  const at = (v) => 50 * u + (v - 50) * u * s;
  const sz = (v) => v * u * s;
  const cx = 50 * u;

  // shoulders
  cv.fillCircle(cx, at(94), sz(34), CLOTH);
  // head
  cv.fillCircle(cx, at(56), sz(24), CLOTH);
  // eye band
  cv.fillRect(cx - sz(24), at(50), sz(48), sz(11), SKIN);
  // eyes
  cv.fillCircle(cx - sz(9), at(55), sz(3.6), INK);
  cv.fillCircle(cx + sz(9), at(55), sz(3.6), INK);
  // headband tie streaming left
  cv.fillRect(cx - sz(40), at(40), sz(80), sz(7), BAND);
  cv.fillRect(cx - sz(52), at(38), sz(16), sz(5), BAND);
  cv.fillRect(cx - sz(58), at(45), sz(14), sz(5), BAND);

  // the slash — a bright diagonal across the whole icon
  for (let i = 0; i < 78; i++) {
    const t = i / 78;
    const x = 8 * u + t * 84 * u;
    const y = 84 * u - t * 68 * u;
    const w = (2.2 + Math.sin(t * Math.PI) * 4.4) * u;
    cv.fillCircle(x, y, w, GOLD);
  }

  return encodePNG(size, size, downsample(cv.px, big, SS));
}

fs.writeFileSync(path.join(OUT, "icon-192.png"), paint(192, false));
fs.writeFileSync(path.join(OUT, "icon-512.png"), paint(512, false));
fs.writeFileSync(path.join(OUT, "maskable-512.png"), paint(512, true));
console.log("icons written to", OUT);
