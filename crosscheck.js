/* Runs the JS engine and the Python reference on the same data and seed, then compares. */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const E = require('../src/engine.js');

const root = path.join(__dirname, '..');
const rows = E.parseCSV(fs.readFileSync(path.join(root, 'data', 'ethan_stunts.csv'), 'utf8'));
const alpha = 0.01, trials = 5000, seed = 42, scale = 1;

const js = E.evaluate(rows, alpha);
const js0 = E.evaluate(rows, 0);
const L = E.monteCarlo(rows, alpha, trials, seed, scale);
const jsMc = { p5: E.percentile(L, 0.05), p50: E.percentile(L, 0.5), p95: E.percentile(L, 0.95) };

const py = JSON.parse(execFileSync('python3', [path.join(root, 'src', 'simulate.py'), '--json',
  '--alpha', String(alpha), '--trials', String(trials), '--seed', String(seed)]).toString());

let bad = 0;
function check(name, a, b) {
  const rel = Math.abs(a - b) / Math.max(1e-12, Math.abs(b));
  const ok = rel < 1e-9;
  if (!ok) bad++;
  console.log((ok ? 'ok   ' : 'FAIL ') + name.padEnd(28) + a.toPrecision(12) + '  ' + b.toPrecision(12));
}
check('total hazard (alpha)', js.H, py.H);
check('total hazard (alpha=0)', js0.H, py.H0);
js.films.forEach((f, i) => check('film: ' + f.film, f.H, py.films[i].H));
['p5', 'p50', 'p95'].forEach(k => check('monte carlo ' + k, jsMc[k], py.mc[k]));
console.log(bad ? bad + ' mismatches' : 'JS and Python agree');
process.exit(bad ? 1 : 0);
