"""Ethan Hunt survival simulator, Python reference. Mirrors src/engine.js exactly.

Usage:
    python src/simulate.py                      # summary table
    python src/simulate.py --alpha 0.02 --trials 5000 --seed 42
    python src/simulate.py --json               # machine-readable, used by tests/crosscheck.js
"""
import argparse
import csv
import json
import math
import os

G0 = 9.81
P = dict(g50=140, gs=0.35, v50=41.5, vs=8, blast50=240, blasts=0.3,
         apneaT50=120, apneaS=25, apneaFatal=0.5)
SIGMA = dict(phys=0.25, prob=0.7, count=0.3)
M32 = 0xFFFFFFFF


def sig(x):
    return 1 / (1 + math.exp(-x))


def clamp(p):
    return min(max(p, 0.0), 0.999999)


def overpressure_kpa(kg, m):
    z = m / kg ** (1 / 3)
    a = 808 * (1 + (z / 4.5) ** 2)
    b = (math.sqrt(1 + (z / 0.048) ** 2) * math.sqrt(1 + (z / 0.32) ** 2)
         * math.sqrt(1 + (z / 1.35) ** 2))
    return 101.325 * a / b


def p_from_g(g):
    return sig((math.log(g) - math.log(P["g50"])) / P["gs"])


def physics(model, p1, p2):
    if model == "fall":
        return p_from_g(p1 / p2)
    if model == "impact":
        v = p1 / 3.6
        return p_from_g(v * v / (2 * p2 * G0))
    if model == "vehicle":
        return sig((p1 - P["v50"]) / P["vs"])
    if model == "blast":
        return sig((math.log(overpressure_kpa(p1, p2)) - math.log(P["blast50"])) / P["blasts"])
    if model == "apnea":
        return P["apneaFatal"] * sig((p1 - P["apneaT50"]) / P["apneaS"])
    return p1  # fixed, lightning, melee


def evaluate(rows, alpha):
    film, k, total = None, 0, 0.0
    films = []
    for r in rows:
        if r["film"] != film:
            film, k = r["film"], 0
            films.append({"film": film, "H": 0.0})
        p = physics(r["model"], r["p1"], r["p2"])
        n = r["count"]
        h1 = -math.log(1 - clamp(p))
        h = h1 * (n * (1 + alpha * k) + alpha * n * (n - 1) / 2)
        k += n
        films[-1]["H"] += h
        total += h
    return total, films


def mulberry32(seed):
    a = seed & M32

    def rnd():
        nonlocal a
        a = (a + 0x6D2B79F5) & M32
        t = ((a ^ (a >> 15)) * (1 | a)) & M32
        t = (((t + (((t ^ (t >> 7)) * (61 | t)) & M32)) & M32) ^ t)
        return ((t ^ (t >> 14)) & M32) / 4294967296
    return rnd


def gauss(rnd):
    u1, u2 = rnd(), rnd()
    return math.sqrt(-2 * math.log(1 - u1)) * math.cos(2 * math.pi * u2)


def perturb(rows, rnd, scale):
    out = []
    for r in rows:
        za, zb, zc = gauss(rnd), gauss(rnd), gauss(rnd)
        p1, p2, m = r["p1"], r["p2"], r["model"]
        sp, sq = SIGMA["phys"] * scale, SIGMA["prob"] * scale
        if m in ("fall", "impact", "blast"):
            p1 = p1 * math.exp(sp * za)
            p2 = p2 * math.exp(sp * zb)
        elif m in ("vehicle", "apnea"):
            p1 = p1 * math.exp(sp * za)
        else:
            p1 = min(0.95, p1 * math.exp(sq * za))
        n = max(0, math.floor(r["count"] * math.exp(SIGMA["count"] * scale * zc) + 0.5))
        out.append({"film": r["film"], "model": m, "p1": p1, "p2": p2, "count": n})
    return out


def monte_carlo(rows, alpha, trials, seed, scale):
    rnd = mulberry32(seed)
    vals = []
    for _ in range(trials):
        total, _ = evaluate(perturb(rows, rnd, scale), alpha)
        vals.append(total / math.log(10))
    vals.sort()
    return vals


def percentile(sorted_vals, q):
    return sorted_vals[int(math.floor(q * (len(sorted_vals) - 1)))]


def load(path=None):
    path = path or os.path.join(os.path.dirname(__file__), "..", "data", "ethan_stunts.csv")
    rows = []
    with open(path, newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            rows.append({"film": r["film"], "stunt": r["stunt"], "model": r["model"],
                         "p1": float(r["p1"]), "p2": float(r["p2"]) if r["p2"] else float("nan"),
                         "count": int(r["count"])})
    return rows


def odds_text(h):
    x = math.exp(h)
    return f"1 in {x:,.0f}" if x < 1e9 else f"1 in {x:.2e}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--alpha", type=float, default=0.01)
    ap.add_argument("--trials", type=int, default=5000)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--scale", type=float, default=1.0)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    rows = load()
    total, films = evaluate(rows, args.alpha)
    base0, _ = evaluate(rows, 0.0)
    L = monte_carlo(rows, args.alpha, args.trials, args.seed, args.scale)
    q = {k: percentile(L, v) for k, v in (("p5", 0.05), ("p50", 0.5), ("p95", 0.95))}

    if args.json:
        print(json.dumps({"H": total, "H0": base0, "films": films, "mc": q}))
        return

    print(f"Combined survival, alpha={args.alpha}: {odds_text(total)}")
    print(f"Combined survival, no accumulation:  {odds_text(base0)}")
    for f in films:
        print(f"  {f['film']:<26} {odds_text(f['H'])}")
    print(f"Monte Carlo ({args.trials} trials, seed {args.seed}): "
          f"median 1 in 10^{q['p50']:.2f}, 5th-95th pct 10^{q['p5']:.2f} to 10^{q['p95']:.2f}")


if __name__ == "__main__":
    main()
