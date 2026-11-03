"""Run the whole analysis: results/, docs/data/site.json, docs/CALCULATIONS.md, figures/."""
from __future__ import annotations

import os
import sys
from pathlib import Path

# The matrices are tiny; multi-threaded BLAS only adds overhead.
for var in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS", "VECLIB_MAXIMUM_THREADS"):
    os.environ.setdefault(var, "1")

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from logowhatif import report  # noqa: E402
from logowhatif.report import gbp, num  # noqa: E402


def main() -> None:
    kn = report.run()
    b = kn["budget"]
    c = kn["conversions_official"]
    print(f"2024 bill {gbp(b['official'], True)}; today {gbp(b['real_today'])}; 2002 rebrand today {gbp(b['rebrand2002_real_today'])}")
    print(f"Logo itself ≈ {gbp(kn['logo_itself_central'])}; signs ≈ {gbp(kn['split_central']['signage'])}; promo ≈ {gbp(kn['split_central']['promo'])}")
    for key, r in c.items():
        print(f"  {key:<11} {num(r['n']):>16}  ({r['option']})")
    print("Did the brand work? Placebo-calibrated effect, open-minded prior (median, 95% interval, P(effect > 0)):")
    for key, r in kn["impact"]["outcomes"].items():
        po = r["posterior_open"]
        print(f"  {key:<16} {po['median_pct']:+6.1f}%  [{po['lo_pct']:+6.1f}%, {po['hi_pct']:+6.1f}%]  P = {po['p_pos']:.2f}")
    po = kn["impact"]["pooled"]["open"]
    print(f"  {'all together':<16} {po['median_pct']:+6.1f}%  [{po['lo_pct']:+6.1f}%, {po['hi_pct']:+6.1f}%]  P = {po['p_pos']:.2f}")


if __name__ == "__main__":
    main()
