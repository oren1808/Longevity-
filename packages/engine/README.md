# @longevity/engine

TypeScript port of `research/engine-prototype/v4.py` – the engine spec in `docs/engine.md` (v4.1). Pure, no runtime deps, runs in the browser; reused by the Phase A page and meant for Phase B (`/packages/engine` in spec §15.1).

```ts
import { createEngine, toEngineAnswers, pickActions } from '@longevity/engine';
const engine = createEngine();                     // default data from /config and /data (all placeholders)
const ans = toEngineAnswers(questionnaireAnswers);  // spec Appendix A → engine levels (§2)
const res = engine.assess(ans, age, sex, gate);     // point, range, actions, potential, display, biggestLever
const cards = pickActions(res, ans, { age, gateYes, smokingTalk, isCurrentSmoker });
```

**Data** (`/config/*.json`, `/data/life-tables/*.json`) is exported from the prototype by `research/engine-prototype/export_for_ts.py`, which also writes `test/fixtures/prototype.json`. Every value is `status: "placeholder"` until the medical advisor signs off.

**Tests** (`npm test`):
- `parity.test.ts` – 458 cases (personas, sweeps, 300 random incl. "hard to know", hookah, stored quit age, gates), what-if and quit gains match the prototype within ±0.01.
- `structural.test.ts` – anchors A3–A9 (§11) and §12: monotonicity, quit gain ≥ 0, smoker guard, birthday, range/width/hours bounds, display, credit, placeholder flag, questionnaire mapping, action-card rules.

**Differences from the prototype (deliberate, spec-driven):**
- With diet sub-answers (`dietScores`), the three diet actions (`veg_each_meal`, `legumes_nuts`, `swap_sweet_drink`) each raise one sub-answer and are hidden when the gain is 0 (engine.md §6). Without sub-answers the engine falls back to the prototype's single `diet_up`.
- Action `gainLow/gainHigh` are widened to contain `gainYears` (engine.md §6).
- `contributions()` ("what already works for you", design.md screen 9) is new.

**Not ported:** the Monte Carlo calibration of `C` (`scripts/calibrate.ts` in spec §15.1). `C` is read from `config/normalization.json`; regenerate it with the Python prototype when factors, prevalence or the life table change.
