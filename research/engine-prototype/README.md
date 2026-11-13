# Engine prototype (Python, reference only)

Built by the medical/actuarial reviewer to test the spec's calculation method. **Not production code.**
The TypeScript engine must match `v4.py` on the persona table (±0.01) – see `docs/engine.md` §13.

## Files

- `engine.py` – Gompertz-Makeham life table fitted to CBS anchors (e0 80.8/85.0, e65 19.6/22.2, e80 9.2/10.4). Replace with the real CBS single-age table when available.
- **`v4.py` – engine per `docs/engine.md` (v4).** Sections are mirrored in comments. Contains:
  - `PARAMS_SPEC` (literal values from `docs/engine.md`) and `PARAMS` (calibrated values, `PARAMS_CAL`, see log below);
  - Appendix B HRs in `F` (never tuned) and the placeholder prevalence `PREV_BASE`;
  - per-single-age `C[sex][age]` (18–100) by Monte Carlo (fixed seed, N = 20,000 per sex, common random numbers across ages, Illinois root-finding), isotonic non-increasing smoothing, cached in `v4_C.json` (keyed by a hash of parameters + HRs + prevalence + N + seed; delete the file to force a rebuild, ~13 s per parameter set);
  - quit tiers with age-at-quit `rho(Q)`, attenuation on the capped cluster, range formula, actions (§6), `hoursPerDay`, `credited_gain`, `display`, `what_if`.
- **`v4_tests.py`** – anchors A1–A9 (§11), structural tests (§12), half-width check, persona table. Prints a PASS/FAIL table.
- **`export_for_ts.py`** – writes `/config/*.json`, `/data/life-tables/IL-placeholder-gm.json` and `packages/engine/test/fixtures/prototype.json` for the TypeScript engine. Re-run after any change here.
- `v3.py`, `v3_*.py`, `v3_C.json` – previous version (spec v3), kept for comparison.

## Run

```
pip install numpy
python v4_tests.py           # calibrated parameters (PARAMS)
python v4_tests.py --spec    # literal docs/engine.md parameters (PARAMS_SPEC) – shows what fails before calibration
python v4_tests.py --raw     # diagnostics: unsmoothed C instead of isotonic
```
Runtime ≈ 25 s with a warm `v4_C.json` cache (both parameter sets are cached in the committed file).

## Interpretation choices (INTERP in the code)

- **Prevalence:** v3 placeholder values for every 10-year group, linearly interpolated (§1). Only age variation added: ex-smoker feasibility – `q>15` ramps from 0 at age 25 to full at 35, `q5-15` from 0 at 18 to full at 25; removed mass goes to `never`. Sex X = 50/50 mix of the M and F marginals. Factors assumed independent; hookah (4b) and waist are not sampled.
- **Ex-smoker `HR_ref` at CI bounds:** `HR_ref` scaled by the CI ratio of level 10–19.
- **4b "sometimes":** static HR of `q5-15` (ongoing use, not a quit date), only if Q4 is not already worse.
- **"Don't know" + one-level actions (diet, alcohol):** dk is treated as the best level whose HR is ≥ the mean HR, then moved one level.
- **Diet actions** (`veg_each_meal`, `legumes_nuts`, `swap_sweet_drink`) share one engine action `diet_up` (one level up, §6).
- **A5b** is evaluated from **20+** (Jha's average smoker, HR≈3); the literal 10–19 reading is printed as INFO (provably infeasible at ages 30 and 40, see log).

## v4 calibration log (only engine parameters changed; no evidence HR touched)

| parameter | docs/engine.md | calibrated | why |
|---|---|---|---|
| `rho(Q)` 35–44 | 0.1 | **0.025** | A5b @40 F ≥ 7.5 needs ρ ≤ 0.045 |
| `rho(Q)` 45–54 | 0.3 | **0.1** | A5 (quit @45 from 10–19, 5–6.5): ρ=0.3 gives 4.2 M / 3.8 F; 0.1 gives 6.15 / 5.43 |
| `rho(Q)` 55+ | 0.5 | **0.25** | 0.5 gives A5b @60 = 2.3 / 2.2 (< 2.5) and **negative** quit gains for `<10` smokers ≥ 82 (1.70 + 0.5·1.0 > 2.0); needs ρ ≤ 0.30. 0.25 also keeps the (re-worded) smoker guard ≥ 2 at 65–74 with margin |
| `w_o` start | 60 | **55** | A7b M (35+ drinks) = 5.12 > 5; alcohol HRs are fixed, so only alcohol attenuation can move it. A7 F (≥ 2) and A7b M (≤ 5) are jointly feasible only in a narrow band (margins 0.02) |
| `k` (cluster) | 0.75 | **0.80** | margin for A6 F (1.30 → 1.36) after the `w_o` change; A9 M stays ≤ 22 (21.65) |
| `L`, `HR_ref`, `w_s`, 0.06 | ln 3, 2.5, 80→90 0.7, 0.06 | unchanged | |

Anchors that cannot pass with any engine parameters (targets look wrong):
- **A3 women** (Li, 12–14): across 160 random parameter sets A3F/A3M = 0.86–0.88 and A3F/A9M = 0.50–0.53; max A3F with A9M ≤ 22 is 11.6. Sex-neutral HRs on the female table always give women a smaller gap; Li's F > M comes from sex-specific HRs.
- **A5b women @30** (8.5–11.5): F quit@30 / A4 M = 0.804–0.811 over 120 random parameter sets; max with A4 M ≤ 10.5 is 8.497. Jha's 10/9/6/4 are for both sexes combined.
- **A5b from 10–19 @30/@40**: the quit gain at 30 has ρ = 0 already, so it is fixed by the evidence tiers (7.9 M / 6.8 F) and below the 8.5 floor.
- **Smoker guard ≥ 4 at 25–74**: at 74 it needs ρ(55+) ≈ 0, but A5b @60 ≤ 5.5 needs ρ(55+) ≥ ~0.12. Evidence (Taylor 2002: quitting at 65 gains 1.4–2.0 y in men, 2.7–3.7 in women) also says ≥ 4 at 74 is too high.
- **Birthday for ex-smokers**: Q = a − t₀ moves with the user's age, so each step in ρ costs 1–1.9 years at one birthday. Storing the quit age once (Q fixed, t grows) removes every drop (tested as a proposal).
