/* Ethan Hunt survival engine. Mirrors src/simulate.py exactly. */
(function (root) {
  'use strict';
  var G0 = 9.81;
  var P = { g50: 140, gs: 0.35, v50: 41.5, vs: 8, blast50: 240, blasts: 0.3,
            apneaT50: 120, apneaS: 25, apneaFatal: 0.5 };
  var SIGMA = { phys: 0.25, prob: 0.7, count: 0.3 };

  function sig(x) { return 1 / (1 + Math.exp(-x)); }
  function clamp(p) { return Math.min(Math.max(p, 0), 0.999999); }

  function overpressureKPa(kg, m) {
    var Z = m / Math.cbrt(kg);
    var a = 808 * (1 + Math.pow(Z / 4.5, 2));
    var b = Math.sqrt(1 + Math.pow(Z / 0.048, 2)) * Math.sqrt(1 + Math.pow(Z / 0.32, 2)) *
            Math.sqrt(1 + Math.pow(Z / 1.35, 2));
    return 101.325 * a / b;
  }
  function pFromG(g) { return sig((Math.log(g) - Math.log(P.g50)) / P.gs); }

  /* Returns {p, g, kPa}: per-event fatality probability and the physical quantity behind it. */
  function physics(model, p1, p2) {
    var g = null, kPa = null, p;
    if (model === 'fall') { g = p1 / p2; p = pFromG(g); }
    else if (model === 'impact') {
      var v = p1 / 3.6; g = (v * v) / (2 * p2 * G0); p = pFromG(g);
    }
    else if (model === 'vehicle') { p = sig((p1 - P.v50) / P.vs); }
    else if (model === 'blast') {
      kPa = overpressureKPa(p1, p2);
      p = sig((Math.log(kPa) - Math.log(P.blast50)) / P.blasts);
    }
    else if (model === 'apnea') { p = P.apneaFatal * sig((p1 - P.apneaT50) / P.apneaS); }
    else { p = p1; } /* fixed, lightning, melee: probability per event */
    return { p: p, g: g, kPa: kPa };
  }

  /* Accumulated damage: within a film, the j-th earlier hit multiplies later hazard by (1 + alpha*j). */
  function evaluate(rows, alpha) {
    var film = null, k = 0, H = 0, events = [], films = [], f = null;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r.film !== film) {
        film = r.film; k = 0;
        f = { film: film, year: r.year, H: 0, events: 0, hits: 0 };
        films.push(f);
      }
      var ph = physics(r.model, r.p1, r.p2);
      var n = r.count;
      var h1 = -Math.log(1 - clamp(ph.p));
      var Hev = h1 * (n * (1 + alpha * k) + alpha * n * (n - 1) / 2);
      events.push({ row: r, p: ph.p, g: ph.g, kPa: ph.kPa, h1: h1, n: n, H: Hev, priorHits: k });
      k += n; f.H += Hev; f.events += 1; f.hits += n; H += Hev;
    }
    for (var j = 0; j < films.length; j++) films[j].S = Math.exp(-films[j].H);
    return { H: H, S: Math.exp(-H), events: events, films: films };
  }

  function mulberry32(seed) {
    var a = seed | 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(rnd) {
    var u1 = rnd(), u2 = rnd();
    return Math.sqrt(-2 * Math.log(1 - u1)) * Math.cos(2 * Math.PI * u2);
  }

  function perturb(rows, rnd, scale) {
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var za = gauss(rnd), zb = gauss(rnd), zc = gauss(rnd);
      var p1 = r.p1, p2 = r.p2, m = r.model, sp = SIGMA.phys * scale, sq = SIGMA.prob * scale;
      if (m === 'fall' || m === 'impact' || m === 'blast') {
        p1 = p1 * Math.exp(sp * za); p2 = p2 * Math.exp(sp * zb);
      } else if (m === 'vehicle' || m === 'apnea') {
        p1 = p1 * Math.exp(sp * za);
      } else {
        p1 = Math.min(0.95, p1 * Math.exp(sq * za));
      }
      var n = Math.max(0, Math.floor(r.count * Math.exp(SIGMA.count * scale * zc) + 0.5));
      out.push({ film: r.film, year: r.year, model: m, p1: p1, p2: p2, count: n });
    }
    return out;
  }

  /* Returns sorted array of log10(1/S) for each trial. */
  function monteCarlo(rows, alpha, trials, seed, scale) {
    var rnd = mulberry32(seed), L = [];
    for (var t = 0; t < trials; t++) {
      var res = evaluate(perturb(rows, rnd, scale), alpha);
      L.push(res.H / Math.LN10);
    }
    L.sort(function (a, b) { return a - b; });
    return L;
  }
  function percentile(sorted, q) { return sorted[Math.floor(q * (sorted.length - 1))]; }

  function parseCSV(text) {
    var lines = text.trim().split(/\r?\n/), head = lines[0].split(','), rows = [];
    for (var i = 1; i < lines.length; i++) {
      var c = lines[i].split(','), o = {};
      for (var j = 0; j < head.length; j++) o[head[j]] = c[j];
      rows.push({ id: +o.id, film: o.film, year: +o.year, stunt: o.stunt, model: o.model,
                  p1: parseFloat(o.p1), p2: o.p2 === '' ? NaN : parseFloat(o.p2), count: +o.count,
                  confidence: o.confidence, basis: o.basis, verified: o.verified });
    }
    return rows;
  }

  var api = { P: P, SIGMA: SIGMA, physics: physics, evaluate: evaluate, perturb: perturb,
              monteCarlo: monteCarlo, percentile: percentile, parseCSV: parseCSV,
              mulberry32: mulberry32, overpressureKPa: overpressureKPa };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Engine = api;
})(typeof window !== 'undefined' ? window : this);
