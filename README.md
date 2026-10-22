# Should Ethan Hunt Be Dead?

A survival simulator for the Mission: Impossible stunts. Each stunt becomes a per-event chance of death from a simple physical model, and the chances multiply across seven films.

Baseline result: about **1 in 1,700** to survive every stunt, or about 1 in 1,300 with no accumulated damage. A 5,000-trial uncertainty run puts the median near **1 in 64,000**, with a 5th-to-95th percentile range of roughly 1 in 1,000 to 1 in 50 million. The estimate depends heavily on guessed vehicle-crash speeds and event counts.

## What is in the repo

```
index.html               Interactive simulator (single file, no build needed to open)
data/ethan_stunts.csv    34 stunt entries across 7 films
src/engine.js            Simulation engine used by the page
src/simulate.py          Python reference implementation of the same engine
src/template.html        Page source; src/build.py inlines the engine and data into index.html
tests/crosscheck.js      Runs both engines on the same seed and checks they agree
LICENSE                  MIT
```

## Run it

Open `index.html` in a browser.

Python summary, with optional settings:

```
python3 src/simulate.py
python3 src/simulate.py --alpha 0.02 --trials 5000 --seed 42
```

Check that the JavaScript and Python engines agree (needs Node and Python 3):

```
node tests/crosscheck.js
```

Rebuild `index.html` after editing the CSV, engine or template:

```
python3 src/build.py
```

## Models

| Stunt type | Model |
|---|---|
| Fall, wall slam | Peak load = height / stopping distance. Logistic in log(g), centered at 140 g (about a 14 m fall onto a hard surface). |
| Struck by a vehicle | Logistic in speed, centered near 41 mph, shaped like pedestrian-crash data. |
| Explosion | Kinney-Graham overpressure for a TNT-equivalent charge, then a logistic in log pressure centered near 240 kPa. |
| Breath-hold | Logistic in seconds underwater, centered at 120 s. Half of blackouts are assumed fatal. |
| Fights | 0.12% chance per blow of a lethal head injury. |
| Fixed-rate events | A stated probability per event (lightning, BASE jump, grip loss and similar). |

**Accumulated damage.** Within a film, the hazard of each later hit is multiplied by 1 + alpha times the number of earlier hits.

**Uncertainty run.** Each trial perturbs speeds, distances and base rates with lognormal noise and jitters the event counts, then recomputes the combined odds. The generator is a seeded Mulberry32, so the JavaScript and Python runs match.

## Data dictionary

| Column | Meaning |
|---|---|
| `id` | Row number |
| `film`, `year` | Film and release year |
| `stunt` | Short description |
| `model` | `fall`, `impact`, `vehicle`, `blast`, `apnea`, `lightning`, `melee` or `fixed` |
| `p1`, `p2` | Model inputs: fall height (m) and stop distance (m); impact speed (km/h) and stop distance (m); vehicle speed (mph); charge (kg) and distance (m); seconds underwater; or a probability per event for `fixed`, `lightning` and `melee` |
| `count` | Times the event occurs (blows for `melee`) |
| `confidence` | How solid the inputs are: `low` or `medium` |
| `basis` | Where the numbers come from |
| `verified` | Whether checked against the film. All rows are currently `no`. |

## Limits

- Event counts, speeds and distances are estimates from memory of the films. None has been checked against footage.
- The model curves are stylized fits to widely quoted figures. References have not been verified.
- The films are treated as independent, and the model has no recovery between films.
- Scope is the seven films from Mission: Impossible (1996) through Dead Reckoning (2023).

## Publish the live demo with GitHub Pages

1. Push the repo to GitHub.
2. Open Settings, then Pages.
3. Under Build and deployment, choose Deploy from a branch, pick `main` and `/ (root)`, and save.
4. The demo appears at `https://<your-username>.github.io/<repo-name>/`.

## License

MIT. See `LICENSE`.
