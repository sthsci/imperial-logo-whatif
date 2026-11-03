"""Run the whole analysis: results/, docs/data/site.json, docs/CALCULATIONS.md, figures/."""
from __future__ import annotations

import sys
from pathlib import Path

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


if __name__ == "__main__":
    main()
