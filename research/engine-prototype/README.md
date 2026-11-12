# Engine prototype (Python, reference only)

Built by the medical/actuarial reviewer in rounds 2–3 to test the spec's calculation method.
**Not production code.** It implements spec v3 (`v3.py`), not the current `docs/engine.md` (v4).

- `engine.py` – Gompertz-Makeham life table fitted to CBS anchors (e0 80.8/85.0, e65 19.6/22.2, e80 9.2/10.4). Replace with the real CBS single-age table when available.
- `v3.py` – engine per spec v3, with interpretation switches in `OPTS`. Caches normalisation constants in `v3_C.json` (created on first run).
- `v3_tests.py` – calibration anchors; `v3_mand.py` / `v3_mono.py` – mandatory and monotonicity tests; `v3_personas.py` – persona table; `v3_quit.py` – quit-age gradient; `v3_sens.py` – sensitivity to ambiguous choices.

Run: `pip install numpy && python v3_tests.py` (from this directory).

Next step (see `docs/engine.md` §13): update to v4 and make all anchors pass before writing the TypeScript engine.
