// Deterministic Math.random for the tests, so a failure means a real balance
// change and not a bad roll. __reseed(n) restarts the stream for a fresh run.
//
// __rand is exported as well because the seeded generator only exists INSIDE
// the vm sandbox — a bot living in Node's own realm would otherwise make its
// mistakes from a different, unseeded stream and the suite would pass and fail
// at random.
let __rand0 = mulberry32(12345);
Math.random = () => __rand0();
function __reseed(seed) { __rand0 = mulberry32(seed >>> 0); }
function __rand() { return __rand0(); }

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
