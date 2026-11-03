"""Download the open data behind the "Did it work?" analysis into data/impact/.

Run once (needs internet); the analysis itself only reads the saved CSVs.
    python3 scripts/fetch_impact_data.py pageviews ucas innovate_uk wellcome
"""
from __future__ import annotations

import csv
import io
import json
import sys
import time
import urllib.parse
import urllib.request
import zipfile
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "impact"
RAW = OUT / "raw"  # large downloads, not committed
UA = "imperial-logo-whatif/1.1 (https://github.com/sthsci/imperial-logo-whatif)"

# The 24 Russell Group universities: Imperial plus its 23 natural comparators.
RUSSELL_GROUP = {
    "Imperial": "Imperial_College_London",
    "Birmingham": "University_of_Birmingham",
    "Bristol": "University_of_Bristol",
    "Cambridge": "University_of_Cambridge",
    "Cardiff": "Cardiff_University",
    "Durham": "Durham_University",
    "Edinburgh": "University_of_Edinburgh",
    "Exeter": "University_of_Exeter",
    "Glasgow": "University_of_Glasgow",
    "King's College London": "King's_College_London",
    "Leeds": "University_of_Leeds",
    "Liverpool": "University_of_Liverpool",
    "LSE": "London_School_of_Economics",
    "Manchester": "University_of_Manchester",
    "Newcastle": "Newcastle_University",
    "Nottingham": "University_of_Nottingham",
    "Oxford": "University_of_Oxford",
    "Queen Mary": "Queen_Mary_University_of_London",
    "Queen's Belfast": "Queen's_University_Belfast",
    "Sheffield": "University_of_Sheffield",
    "Southampton": "University_of_Southampton",
    "UCL": "University_College_London",
    "Warwick": "University_of_Warwick",
    "York": "University_of_York",
}


# UCAS provider codes for the same 24 universities.
UCAS_CODES = {
    "I50": "Imperial", "B32": "Birmingham", "B78": "Bristol", "C05": "Cambridge", "C15": "Cardiff",
    "D86": "Durham", "E56": "Edinburgh", "E84": "Exeter", "G28": "Glasgow", "K60": "King's College London",
    "L23": "Leeds", "L41": "Liverpool", "L72": "LSE", "M20": "Manchester", "N21": "Newcastle",
    "N84": "Nottingham", "O33": "Oxford", "Q50": "Queen Mary", "Q75": "Queen's Belfast", "S18": "Sheffield",
    "S27": "Southampton", "U80": "UCL", "W20": "Warwick", "Y50": "York",
}


def download(url: str, path: Path) -> Path:
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=600) as r, path.open("wb") as f:
            while chunk := r.read(1 << 20):
                f.write(chunk)
    return path


# Names used for the same universities in the Innovate UK and Wellcome lists (normalised: lower case, no "the").
IUK_NAMES = {
    "Imperial": ["imperial college london", "imperial college of science, technology and medicine"],
    "Birmingham": ["university of birmingham"], "Bristol": ["university of bristol"],
    "Cambridge": ["university of cambridge", "chancellor, masters, and scholars of university of cambridge"],
    "Cardiff": ["cardiff university"], "Durham": ["durham university", "university of durham"],
    "Edinburgh": ["university of edinburgh"], "Exeter": ["university of exeter"], "Glasgow": ["university of glasgow"],
    "King's College London": ["king's college london"], "Leeds": ["university of leeds"],
    "Liverpool": ["university of liverpool"],
    "LSE": ["london school of economics & pol sci", "london school of economics and political science",
            "london school of economics and political science (lse)", "london school of economics"],
    "Manchester": ["university of manchester"],
    "Newcastle": ["newcastle university", "university of newcastle upon tyne", "university of newcastle"],
    "Nottingham": ["university of nottingham"], "Oxford": ["university of oxford"],
    "Queen Mary": ["queen mary university of london", "queen mary, university of london"],
    "Queen's Belfast": ["queen's university belfast", "queen's university of belfast"],
    "Sheffield": ["university of sheffield", "university of sheffield (amrc)"],
    "Southampton": ["university of southampton"], "UCL": ["university college london"],
    "Warwick": ["university of warwick"], "York": ["university of york"],
}


def norm(name: str) -> str:
    n = " ".join(str(name).replace("\u2019", "'").lower().split())
    return n[4:] if n.startswith("the ") else n


def get_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def pageviews(start: str = "2015070100", end: str = "2026103100") -> None:
    """Monthly English Wikipedia views by people (agent=user, all access methods)."""
    base = "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia.org/all-access/user/{}/monthly/{}/{}"
    rows = []
    for uni, title in RUSSELL_GROUP.items():
        d = get_json(base.format(urllib.parse.quote(title, safe=""), start, end))
        for it in d["items"]:
            ts = it["timestamp"]
            rows.append((f"{ts[:4]}-{ts[4:6]}", uni, title, it["views"]))
        time.sleep(0.2)
    path = OUT / "wikipedia_pageviews_monthly.csv"
    with path.open("w", newline="") as f:
        f.write(f"# Monthly English Wikipedia page views (agent=user, all-access) of each Russell Group university's article. Downloaded {date.today()}.\n")
        f.write("# Wikimedia Pageviews REST API: https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia.org/all-access/user/<title>/monthly/<start>/<end>\n")
        w = csv.writer(f)
        w.writerow(["month", "university", "article", "views"])
        w.writerows(rows)
    print(f"wrote {len(rows)} rows to {path.relative_to(ROOT)}")


def ucas() -> None:
    """Main-scheme undergraduate applicants, offers and acceptances by provider and domicile, 2016-2025 cycles."""
    url = "https://www.ucas.com/media/223376/download"  # provider-level end of cycle 2025 csv files (190 MB zip)
    zpath = download(url, RAW / "ucas_eoc2025_provider.zip")
    name = "UCAS end of cycle 2025 - Provider summary domicile - main scheme applicants applications offers acceptances.csv"
    with zipfile.ZipFile(zpath) as z, z.open(name) as f:
        rows = list(csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")))
    keep = []
    for r in rows:
        code = r["Provider name"].split(" ", 1)[0]
        if code in UCAS_CODES and r["Domicile"] == "All":
            group = {"All": "all", "UK": "uk", "International": "international"}[r["Domicile UK International"]]
            keep.append((int(r["Year"]), UCAS_CODES[code], code, group,
                         r["Main scheme applicants"], r["Main scheme applications"],
                         r["Main scheme offers"], r["Accepted applicants"]))
    keep.sort()
    path = OUT / "ucas_applications.csv"
    with path.open("w", newline="") as f:
        f.write(f"# UCAS undergraduate end of cycle 2025, provider-level data: main scheme applicants, applications, offers and accepted applicants by domicile group (UK / international / all). Downloaded {date.today()}.\n")
        f.write(f"# {url} ('Download the provider-level resource csv files'), file '{name}'. Counts are rounded to the nearest 5 by UCAS. A cycle is named after its entry year: the 2025 cycle opened in Sep 2024.\n")
        w = csv.writer(f)
        w.writerow(["cycle", "university", "ucas_code", "domicile", "applicants", "applications", "offers", "accepted"])
        w.writerows(keep)
    print(f"wrote {len(keep)} rows to {path.relative_to(ROOT)}")


def innovate_uk() -> None:
    """Innovate UK projects (industry-led collaborations) that each university joined, by competition year."""
    import openpyxl  # only needed here

    url = "https://www.ukri.org/wp-content/uploads/2022/03/IUK-121026-FundedProjectsFinancialYear2016To2017ToPresent.xlsx"
    xpath = download(url, RAW / "iuk_funded_projects_2016_present.xlsx")
    lookup = {n: uni for uni, names in IUK_NAMES.items() for n in names}
    rows = openpyxl.load_workbook(xpath, read_only=True).worksheets[0].iter_rows(values_only=True)
    ix = {h: i for i, h in enumerate(next(rows))}
    projects, award = {}, {}
    for r in rows:
        uni = lookup.get(norm(r[ix["Participant Name"]] or ""))
        if not uni or r[ix["Participant Withdrawn From Project"]] == "Withdrawn":
            continue
        key = (r[ix["Competition Year"]], uni)
        projects.setdefault(key, set()).add(r[ix["Project Number"]])
        award[key] = award.get(key, 0) + float(r[ix["Award Offered (£)"]] or 0)
    years = sorted({y for y, _ in projects})
    path = OUT / "innovate_uk_projects.csv"
    with path.open("w", newline="") as f:
        f.write(f"# Innovate UK funded projects (industry-led collaborative R&D) in which each Russell Group university is a participant, by competition year (April-March). Downloaded {date.today()}.\n")
        f.write(f"# UKRI, 'Innovate UK funded projects since 2004', file for financial year 2016 to 2017 to present (updated 12 Oct 2026): {url}. Withdrawn participants excluded; award = grant offered to the university.\n")
        w = csv.writer(f)
        w.writerow(["competition_year", "university", "projects", "award_gbp"])
        for y in years:
            for uni in IUK_NAMES:
                w.writerow([y, uni, len(projects.get((y, uni), ())), round(award.get((y, uni), 0))])
    print(f"wrote {len(years) * len(IUK_NAMES)} rows to {path.relative_to(ROOT)}")


def wellcome() -> None:
    """Wellcome grants awarded to each university, by month of award."""
    import openpyxl

    url = "https://cms.wellcome.org/sites/default/files/2026-09/Wellcome-grants-awarded-1-October-2000-to-9-September-2026.xlsx"
    xpath = download(url, RAW / "wellcome_grants_2000_2026.xlsx")
    lookup = {n: uni for uni, names in IUK_NAMES.items() for n in names}
    rows = openpyxl.load_workbook(xpath, read_only=True).worksheets[0].iter_rows(values_only=True)
    ix = {h: i for i, h in enumerate(next(rows))}
    grants, amount = {}, {}
    for r in rows:
        uni, d = lookup.get(norm(r[ix["Recipient Org:Name"]] or "")), r[ix["Award Date"]]
        if not uni or d is None or d.year < 2014:
            continue
        key = (f"{d.year}-{d.month:02d}", uni)
        grants[key] = grants.get(key, 0) + 1
        amount[key] = amount.get(key, 0) + float(r[ix["Amount Awarded"]] or 0)
    months = sorted({m for m, _ in grants})
    path = OUT / "wellcome_grants_monthly.csv"
    with path.open("w", newline="") as f:
        f.write(f"# Wellcome grants awarded to each Russell Group university (lead recipient organisation), by month of award, Jan 2014 to Aug 2026. Downloaded {date.today()}.\n")
        f.write(f"# Wellcome, 'Grants awarded 1 October 2000 to 9 September 2026' (360Giving format, CC BY 4.0): {url}\n")
        w = csv.writer(f)
        w.writerow(["month", "university", "grants", "amount_gbp"])
        for m in months:
            for uni in IUK_NAMES:
                w.writerow([m, uni, grants.get((m, uni), 0), round(amount.get((m, uni), 0))])
    print(f"wrote {len(months) * len(IUK_NAMES)} rows to {path.relative_to(ROOT)}")


if __name__ == "__main__":
    for what in sys.argv[1:] or ["pageviews"]:
        globals()[what]()
