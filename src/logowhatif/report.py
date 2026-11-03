"""Writes results/, docs/data/site.json, docs/CALCULATIONS.md and the README figure."""
from __future__ import annotations

import csv
import json
import math
from datetime import date
from pathlib import Path

import numpy as np

from . import impact, model
from .impact import pct
from .model import ROOT, GENEROSITY, budgets, fact, split

META = {
    "title": "What else could Imperial's new logo have bought? An open what-if",
    "author": "Jiggle Marsian",
    "repo": "https://github.com/sthsci/imperial-logo-whatif",
    "page": "https://sthsci.github.io/imperial-logo-whatif/",
}


def gbp(x: float, pence: bool = False) -> str:
    return f"£{x:,.2f}" if pence else f"£{x:,.0f}"


def num(x: float) -> str:
    """Counts as the page shows them: whole items from 10 up (rounded down), decimals below."""
    if x >= 1e12:
        return f"{x / 1e12:,.2f} trillion"
    if x >= 1e9:
        return f"{x / 1e9:,.{0 if x >= 1e11 else 1}f} billion"
    if x >= 1e6:
        return f"{x / 1e6:,.{0 if x >= 1e8 else 1}f} million"
    if x >= 10:
        return f"{math.floor(x):,}"
    return f"{x:.1f}" if x >= 1 else f"{x:.2f}"


def site_data(inp: dict, generated: str, imp: dict | None = None) -> dict:
    p = inp["params"]
    income_row = inp["facts"]["total_income"]
    out = {
        "meta": {**META, "generated": generated},
        "budget": {k: v for k, v in budgets(inp).items()},
        "split": [
            {"key": k, "label": c["label"], "receipt": c["receipt"], "color": c["color"],
             "residual": bool(c.get("residual")), "central": c.get("central"), "low": c.get("low"),
             "high": c.get("high"), "max": c.get("max")}
            for k, c in p["split"].items()
        ],
        "facts": {
            "students": fact(inp, "students"),
            "pgr": fact(inp, "pgr"),
            "labs": fact(inp, "labs"),
            "income": fact(inp, "total_income"),
            "income_year": income_row["year"].replace("-", "/"),
            "beef_kg_per_year": fact(inp, "beef_t_per_year") * 1000,
            "petition_signatures": fact(inp, "petition_signatures"),
        },
        "constants": p["constants"],
        "items": p["items"],
        "landmarks": [{"key": r["key"], "name": r["name"], "m": float(r["height_m"])} for r in inp["landmarks"]],
        "basket": p["basket"],
        "basket_presets": p["basket_presets"],
    }
    if imp:
        out["impact"] = impact_site(imp)
    return out


# --------------------------------------------------------------------- did the brand work?

METHODS = ("its", "did", "scm", "bsc")
METHOD_NAMES = {
    "its": "Imperial's own trend (interrupted time series)",
    "did": "Difference-in-differences",
    "scm": "Synthetic control",
    "bsc": "Bayesian synthetic control",
}


def _r(x: float, nd: int = 4) -> float:
    return round(float(x), nd)


def impact_site(imp: dict) -> dict:
    """Everything the page's "Did it work?" section draws; effects in log points."""
    des = imp["design"]
    outcomes = []
    for o in des["outcomes"]:
        r = imp["results"][o["key"]]
        b = r["bsc"]
        span = lambda m: [int(m.nonzero()[0][0]), int(m.nonzero()[0][-1])]  # noqa: E731
        methods = {m: {"est": _r(r[m]["est"]), "lo": _r(r[m]["lo"]), "hi": _r(r[m]["hi"])} for m in METHODS}
        for m in ("its", "did", "scm"):
            methods[m]["p"] = _r(r[m]["p"])
        methods["scm"].update(rank=r["scm"]["rank"], n=len(r["names"]))
        methods["bsc"]["p_pos"] = _r(b["p_pos"])
        be = r["breakeven"]
        outcomes.append({
            **{k: o[k] for k in ("key", "claim", "label", "short", "noun", "question", "period_label", "note", "source", "source_url")},
            "periods": r["periods"], "pre": span(r["pre"]), "post": span(r["post"]),
            "imperial": [_r(v, 0) for v in r["Y"][0]],
            "index": {
                "y": [_r(100 * math.exp(v), 1) for v in b["y"]],
                "cf": [_r(100 * math.exp(v), 1) for v in b["cf"]],
                "lo": [_r(100 * math.exp(v - w), 1) for v, w in zip(b["cf"], b["band"])],
                "hi": [_r(100 * math.exp(v + w), 1) for v, w in zip(b["cf"], b["band"])],
            },
            "methods": methods,
            "placebo": [{"name": n, "est": _r(e)} for n, e in zip(r["names"][1:], r["scm"]["placebo"])],
            "weights": [{"name": n, "w": _r(w, 3)} for w, n in sorted(zip(r["scm"]["weights"], r["names"][1:]), reverse=True) if w >= 0.05],
            "lik": {"d": _r(r["lik"]["d"]), "scale": _r(r["lik"]["scale"]), "df": r["lik"]["df"]},
            "mde": _r(r["mde"]),
            "breakeven": None if not be else {k: (_r(v, 6) if isinstance(v, float) else v) for k, v in be.items()},
            "imperial_pre": _r(r["imperial_pre"], 0), "imperial_post": _r(r["imperial_post"], 0),
            "n_donors": len(r["names"]) - 1,
        })
    return {
        "launch": des["launch"], "launch_label": des["launch_label"],
        "interval": des["interval"], "power": des["power"], "omega_sd": des["omega_sd"],
        "priors": des["priors"], "pooled_keys": des["pooled"], "fee": des["fee"],
        "pooled": {k: {kk: _r(vv) for kk, vv in v.items()} for k, v in imp["pooled"].items()},
        "reference": {o["key"]: {k: {kk: _r(vv) for kk, vv in v.items()} for k, v in imp["results"][o["key"]]["priors"].items()}
                      for o in des["outcomes"]},
        "methods": METHOD_NAMES,
        "outcomes": outcomes,
    }


def impact_csv(imp: dict, path: Path) -> None:
    """One row per outcome and method: the estimated brand effect in percent with its 95% interval."""
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["outcome", "method", "estimate_pct", "lo_pct", "hi_pct", "p_value", "posterior_p_positive"])
        for k, r in imp["results"].items():
            for m in METHODS:
                x = r[m]
                w.writerow([k, m, f"{pct(x['est']):.2f}", f"{pct(x['lo']):.2f}", f"{pct(x['hi']):.2f}",
                            f"{x['p']:.3f}" if "p" in x else "", f"{x['p_pos']:.3f}" if "p_pos" in x else ""])
            for pk, po in r["priors"].items():
                w.writerow([k, f"calibrated_bayes_{pk}", f"{pct(po['median']):.2f}", f"{pct(po['lo']):.2f}", f"{pct(po['hi']):.2f}", "", f"{po['p_pos']:.3f}"])
        for pk, po in imp["pooled"].items():
            w.writerow(["pooled", f"calibrated_bayes_{pk}", f"{pct(po['median']):.2f}", f"{pct(po['lo']):.2f}", f"{pct(po['hi']):.2f}", "", f"{po['p_pos']:.3f}"])


def key_numbers(inp: dict, imp: dict | None = None) -> dict:
    b = budgets(inp)
    s = split(inp)
    lo, hi = split(inp, which="low"), split(inp, which="high")
    conv = model.all_conversions(inp, b["official"], meals=1)
    year = model.all_conversions(inp, b["official"], meals=GENEROSITY["year_lunches"])
    out = {
        "budget": b,
        "split_central": s,
        "split_low": {k: v for k, v in lo.items() if k != "agencies"},
        "split_high": {k: v for k, v in hi.items() if k != "agencies"},
        "logo_itself_central": s["agencies"] + s["font"],
        "conversions_official": {c["key"]: c for c in conv},
        "food_year_of_lunches": next(c for c in year if c["key"] == "food"),
        "per_student": b["official"] / fact(inp, "students"),
        "per_petition_signature": b["official"] / fact(inp, "petition_signatures"),
        "income_clock": model.income_clock(inp, b["official"]),
    }
    if imp:
        out["impact"] = {
            "outcomes": {
                k: {
                    **{m: {"est_pct": pct(r[m]["est"]), "lo_pct": pct(r[m]["lo"]), "hi_pct": pct(r[m]["hi"])} for m in METHODS},
                    "calibrated_pct": pct(r["lik"]["d"]),
                    "posterior_open": {"median_pct": pct(r["priors"]["open"]["median"]), "lo_pct": pct(r["priors"]["open"]["lo"]),
                                       "hi_pct": pct(r["priors"]["open"]["hi"]), "p_pos": r["priors"]["open"]["p_pos"],
                                       "bf10": r["priors"]["open"]["bf10"]},
                    "mde_pct": pct(r["mde"]),
                    "breakeven_pct": 100 * r["breakeven"]["share"] if r["breakeven"] else None,
                }
                for k, r in imp["results"].items()
            },
            "pooled": {k: {"median_pct": pct(v["median"]), "lo_pct": pct(v["lo"]), "hi_pct": pct(v["hi"]), "p_pos": v["p_pos"]}
                       for k, v in imp["pooled"].items()},
        }
    return out


def write_results(inp: dict, outdir: Path) -> None:
    outdir.mkdir(parents=True, exist_ok=True)
    rows = model.all_conversions(inp, budgets(inp)["official"], every_option=True)
    fields = ["group", "title", "key", "option", "price", "per", "n"]
    with open(outdir / "conversions.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow({**r, "price": f"{r['price']:.2f}", "n": f"{r['n']:.6g}"})


def _p(x: float) -> str:
    return f"{pct(x):+.1f}%"


def impact_md(imp: dict) -> str:
    """Section 7 of CALCULATIONS.md: the brand test, with every estimate."""
    des = imp["design"]
    lvl = round(100 * des["interval"])
    L = []
    a = L.append
    a("## 7. Did the brand work?\n")
    a(f"Imperial says the brand launched on {des['launch_label']} will help it attract students, staff, funding and partners. "
      "We compare Imperial with the other 23 Russell Group universities before and after the launch. "
      "Every outcome is analysed on the log scale, so an effect of 0.05 log points is about +5%. "
      f"A comparison university is used if it has no zero values and a pre-launch average of at least {des['min_donor_scale']:.0%} of Imperial's. "
      "Inputs and their sources are in `data/impact/`; the design is in `data/impact/design.toml`; the code is `src/logowhatif/impact.py`. "
      "Staff are not tested: HESA's staff record is the only comparable source and its site blocks automated downloads.\n")
    a("### Outcomes\n")
    a("| Outcome | Claim | Periods before → after | Comparison universities | Source |")
    a("|---|---|---|---:|---|")
    span = lambda p: p[0] if p[0] == p[1] else f"{p[0]} to {p[1]}"  # noqa: E731
    for o in des["outcomes"]:
        r = imp["results"][o["key"]]
        a(f"| {o['label']} | {o['claim']} | {span(o['pre'])} → {span(o['post'])} ({o['period_label']}) | "
          f"{len(r['names']) - 1} | [{o['source']}]({o['source_url']}) |")
    a("")
    a("### Methods\n")
    a("- **Imperial's own trend (interrupted time series).** Fit log(y) = a + b·t (plus month effects for monthly data) to Imperial before the launch, "
      "extend it, and average the gap after. Standard error from the regression, widened for first-order autocorrelation; t-test.")
    a("- **Difference-in-differences.** Imperial's change in mean log value (after minus before) minus the average change at the comparison universities. "
      "Each comparison university is then treated as if it had rebranded (a placebo) and compared with the rest. "
      f"The {lvl}% interval is estimate ± t × SD(placebos) × √(1 + 1/J); the p-value is the share of placebos at least as large (counting Imperial).")
    a("- **Synthetic control.** Weights w ≥ 0 with Σw = 1 that make a blend of comparison universities track Imperial's pre-launch path "
      "(logs minus each university's pre-launch mean). The effect is the average gap after the launch; placebos as above.")
    a("- **Bayesian synthetic control.** Conjugate regression of Imperial on the comparison universities before the launch: "
      "y = α + Σ βⱼ yⱼ + ε, βⱼ ~ N(1/J, σ²/λ), α ~ N(0, 100σ²), p(σ²) ∝ 1/σ². λ (between 0.1 and 10,000) maximises the marginal likelihood. "
      "The posterior predictive gives the counterfactual and its credible band. Its interval assumes the regression is right, so it is narrower than the placebo-based ones.")
    a("- **Placebo-calibrated Bayesian model (used for the verdicts).** Treat the synthetic-control gaps of the J placebo universities as draws eⱼ ~ N(μ, σ²) "
      "and Imperial's as e₀ ~ N(μ + δ, σ²). With p(μ, σ²) ∝ 1/σ², the likelihood for the brand effect δ is Student-t with J − 1 degrees of freedom, "
      "centre e₀ − ē and scale SD(e)·√(1 + 1/J). Combined with a normal prior on a grid; the Bayes factor for 'any effect' is the Savage–Dickey ratio prior(0) / posterior(0).")
    a(f"- **Pooled.** One outcome per claim ({', '.join(des['pooled'])}): dₖ ~ N(Δ, vₖ + ω²), ω ~ half-normal({des['omega_sd']}), "
      "vₖ the variance of each calibrated likelihood. Δ is the average brand effect.")
    a(f"- **Smallest detectable effect** = (t₀.₉₇₅ + t₀.₈₀) × scale of the calibrated likelihood: the effect this test would catch {des['power']:.0%} of the time.")
    a("- **Break-even** = the bill ÷ what a 100% rise in one year of the outcome would be worth: for international applicants, one year's international intake "
      f"(UCAS accepted applicants) × the overseas fee ({gbp(des['fee']['overseas_ug_fee_gbp'])} a year, {des['fee']['years']} years); "
      "for money, Imperial's average yearly amount over the last three years before the launch.\n")
    for o in des["outcomes"]:
        r = imp["results"][o["key"]]
        a(f"### {o['label']}\n")
        a(f"{o['note']} Imperial: {r['imperial_pre']:,.0f} a {o['period_label']} before the launch (geometric mean), {r['imperial_post']:,.0f} after.")
        w = sorted(zip(r["scm"]["weights"], r["names"][1:]), reverse=True)
        a("Synthetic-control blend: " + ", ".join(f"{n} {x:.0%}" for x, n in w if x >= 0.05) + ".\n")
        a(f"| Method | Effect | {lvl}% interval | p |")
        a("|---|---:|---:|---:|")
        for m in METHODS:
            x = r[m]
            pv = f"{x['p']:.2f}" if "p" in x else f"P(effect > 0) = {x['p_pos']:.2f}"
            a(f"| {METHOD_NAMES[m]} | {_p(x['est'])} | {_p(x['lo'])} to {_p(x['hi'])} | {pv} |")
        s = r["scm"]
        a(f"\nImperial's synthetic-control gap ranks {s['rank']} of {len(r['names'])} in size (1 = largest); "
          f"post/pre fit ratio p = {s['p_ratio']:.2f}. Calibrated likelihood: centre {_p(r['lik']['d'])}, scale {r['lik']['scale']:.3f}, {r['lik']['df']} df. "
          f"Smallest detectable effect: {pct(r['mde']):.0f}%.")
        be = r["breakeven"]
        if be:
            a(f"Break-even: {100 * be['share']:.2f}% ({be['basis']}).")
        a("")
        a(f"| Prior | Posterior median | {lvl}% credible interval | P(effect > 0) | Bayes factor for an effect |" + (" P(pays for itself) |" if be else ""))
        a("|---|---:|---:|---:|---:|" + ("---:|" if be else ""))
        for pk, po in r["priors"].items():
            pr = des["priors"][pk]
            a(f"| {pr['label']}: N({pr['m']:+.2f}, {pr['s']:.3f}) | {_p(po['median'])} | {_p(po['lo'])} to {_p(po['hi'])} | {po['p_pos']:.2f} | {po['bf10']:.2f} |"
              + (f" {po['p_breakeven']:.2f} |" if be else ""))
        a("")
    a("### Read with care\n")
    q = des["context"]["qs"]
    a(f"- **Other things happened to Imperial too.** {q['fact']} Source: {q['source']} ({q['source_url']}). "
      "Anything that changed for Imperial alone after the launch is mixed in with the brand's effect.")
    a("- **It is early.** One UCAS cycle and one or two years of grants after the launch; the previous logo lasted 22 years.")
    a("- **Proxies.** Applicants are not students; Wellcome is one funder; Innovate UK projects are one kind of industry partnership; page views measure attention.")
    a("- **Innovate UK 2025/26 is still being filled in** (the sector total is half the previous year's).\n")
    a("### All outcomes together\n")
    a(f"| Prior | Average brand effect | {lvl}% credible interval | P(effect > 0) |")
    a("|---|---:|---:|---:|")
    for pk, po in imp["pooled"].items():
        lab = des["priors"][pk]["label"] if pk in des["priors"] else "Flat (data only)"
        a(f"| {lab} | {_p(po['median'])} | {_p(po['lo'])} to {_p(po['hi'])} | {po['p_pos']:.2f} |")
    a("")
    return "\n".join(L)


def calculations_md(inp: dict, kn: dict, imp: dict | None = None) -> str:
    b = kn["budget"]
    p = inp["params"]
    c = p["constants"]
    s, lo, hi = kn["split_central"], kn["split_low"], kn["split_high"]
    conv = kn["conversions_official"]
    cost = inp["costs"]
    L = []
    a = L.append
    a("# Every calculation, step by step\n")
    a("Generated by `scripts/run_all.py` from the inputs in `data/`. Money is in GBP. "
      "“How many” always means *budget ÷ unit price*. Some cards then put that number in context.\n")
    a("## 1. The bill\n")
    a(f"- **Official total, 2024 brand refresh: {gbp(b['official'], True)}.** Source: {cost['rebrand_2024_total']['source']} "
      f"({cost['rebrand_2024_total']['source_url']}). The total covers the external agencies (brand strategy; verbal and visual identity; "
      "design assets for launch; templating; training; accessibility and inclusivity assessment), a bespoke font, new signage across campuses, "
      "and promotional materials, including a brand animation video and lanyards.")
    a(f"- **No breakdown.** {cost['rebrand_2024_s43_refusal']['note']} ({cost['rebrand_2024_s43_refusal']['source_url']})")
    a(f"- **2002 rebrand: {gbp(b['rebrand2002'])}**, “spread over two years”. Source: {cost['rebrand_2002_total']['source']} "
      f"({cost['rebrand_2002_total']['source_url']}).\n")
    a("## 2. Today's money\n")
    a(f"ONS CPI index (D7BT, 2015 = 100): 2024 average = {b['cpi_2024']:.1f}; 2002–03 average = {b['cpi_2002']:.1f}; "
      f"{b['cpi_to_label']} = {b['cpi_to']:.1f}.\n")
    a(f"- 2024 refresh: {gbp(b['official'], True)} × {b['cpi_to']:.1f} / {b['cpi_2024']:.1f} = **{gbp(b['real_today'])}**")
    a(f"- 2002 rebrand: {gbp(b['rebrand2002'])} × {b['cpi_to']:.1f} / {b['cpi_2002']:.1f} = **{gbp(b['rebrand2002_real_today'])}**")
    a(f"- In real terms the 2002 rebrand cost {b['twist_pct']:.0f}% more than the 2024 refresh. Together: **{gbp(b['both_real_today'])}**.\n")
    a("## 3. The split (our estimate)\n")
    a("Imperial gave only the total. We estimate three slices bottom-up; the agencies get the remainder. "
      "On the page, sliders change every slice.\n")
    a("| Slice | Central | Range | Basis |")
    a("|---|---:|---:|---|")
    for k, comp in p["split"].items():
        rng = "remainder" if comp.get("residual") else f"{gbp(lo[k])}–{gbp(hi[k])}"
        a(f"| {comp['label']} | {gbp(s[k])} | {rng} | {comp['basis']} |")
    a(f"\n- **The logo itself** (agencies + typeface) ≈ **{gbp(kn['logo_itself_central'])}**")
    a(f"- **Replacing the signs (“decoration”)** ≈ **{gbp(s['signage'])}** (range {gbp(lo['signage'])}–{gbp(hi['signage'])})")
    a(f"- **Promotional extras** ≈ **{gbp(s['promo'])}**\n")
    a(f"## 4. Conversions at the official {gbp(b['official'], True)}\n")
    a("Default price for each card; every alternative price is in `results/conversions.csv`.\n")
    items = {it["key"]: it for it in p["items"]}
    students = fact(inp, "students")
    for key, it in items.items():
        o = model.option(it)
        r = conv[key]
        a(f"### {it['emoji']} {it['title']}\n")
        a(f"Price: {o['label']} = {gbp(r['price'], r['price'] < 100)} {r['per']}. Source: {o['source']} ({o['url']}){', ' + o['date'] if o.get('date') else ''}.")
        if o.get("note"):
            a(f"Note: {o['note']}")
        a("")
        M = b["official"]
        if key == "food":
            a(f"- Meals = {gbp(M, True)} / {gbp(r['price'], True)} = {num(r['meals'])}")
            a(f"- One meal each: {num(r['n'])} students = {r['share_of_students'] * 100:.0f}% of Imperial's {students:,.0f} students "
              f"({r['meals'] / students:.1f} meals per student).")
            y = kn["food_year_of_lunches"]
            a(f"- A year of weekday lunches (150 each): {num(y['n'])} students.")
        elif key == "tokens":
            a(f"- Price: ${o['usd']} per million × {c['usd_gbp']} = {gbp(r['price'], True)} per million")
            a(f"- Tokens = {gbp(M, True)} / {gbp(r['price'], True)} per million × 10⁶ = **{num(r['n'])}**")
            a(f"- PhD theses: {num(r['n'])} / ({c['thesis_words']:,} words × {c['tokens_per_word']} tokens per word) = {num(r['theses'])}, "
              f"or {r['theses_per_research_student']:.0f} for each of Imperial's {fact(inp, 'pgr'):,.0f} research students")
        elif key == "plus":
            a(f"- Months = {gbp(M, True)} / {gbp(r['price'], True)} = **{num(r['n'])}**")
            a(f"- Shared by all {students:,.0f} students: {num(r['n'])} / {students:,.0f} months × 365/12 = {r['days_all_students']:.1f} days each")
            a(f"- Or one person for {r['years_one_person']:,.0f} years")
        elif key == "rent":
            a(f"- Rent per student-year = {gbp(float(o['weekly']), True)} × {o['weeks']} weeks = {gbp(r['price'])}")
            a(f"- Student-years = {gbp(M, True)} / {gbp(r['price'])} = **{num(r['n'])}**")
        elif key == "phd":
            a(f"- Cost per year = {o['annual_note']} = {gbp(float(o['annual']))}; × {o['years']} years = {gbp(r['price'])}")
            a(f"- Studentships = {gbp(M, True)} / {gbp(r['price'])} = **{num(r['n'])}**; one-year places = {num(r['phd_years'])}")
        elif key == "lab":
            a(f"- Lab = {o['m2']} m² ({o['people']} people × {c['lab_m2_per_workplace']} m² per workplace) × {gbp(c['lab_cost_per_m2'])}/m² = {gbp(r['price'])}")
            a(f"- Labs = {gbp(M, True)} / {gbp(r['price'])} = **{num(r['n'])}**; start-up packages at {gbp(c['pi_startup_gbp'])} = {num(r['pi_startups'])}")
        else:
            a(f"- {gbp(M, True)} / {gbp(r['price'], r['price'] < 100)} = **{num(r['n'])}**")
            if key == "beef":
                a(f"- Quarter-pound burgers (0.1134 kg): {num(r['burgers'])}; years of Taste Imperial's beef "
                  f"({fact(inp, 'beef_t_per_year')} t a year): {r['imperial_beef_years']:.1f}")
            if key == "cows":
                a(f"- One cow for every {r['students_per_cow']:.0f} Imperial students")
            if key == "cells":
                a(f"- At one new line per working day ({c['working_days']} a year): {r['working_years']:.1f} years")
            if key == "medium":
                a(f"- {num(r['litres'])} litres; stacked at {c['bottle_height_m']} m per bottle = {r['stack_m']:,.0f} m = "
                  f"{r['queens_towers']:.0f} × the Queen's Tower")
        a("")
    a("## 5. Context\n")
    ic = kn["income_clock"]
    a(f"- Per student: {gbp(b['official'], True)} / {students:,.0f} = {gbp(kn['per_student'], True)}")
    a(f"- Imperial's {inp['facts']['total_income']['year']} income: {gbp(fact(inp, 'total_income'))} "
      f"= {gbp(ic['per_hour'])} an hour, so the bill equals {ic['hours']:.2f} hours of income ({ic['share_pct']:.3f}% of the year).")
    a(f"- Per petition signature ({fact(inp, 'petition_signatures'):,.0f}+): {gbp(kn['per_petition_signature'], True)}\n")
    a("## 6. Fixed assumptions\n")
    a("| Constant | Value | Source |")
    a("|---|---:|---|")
    for k, v in p["constants"].items():
        a(f"| `{k}` | {v:,} | {p['constant_sources'].get(k, '')} |")
    a("")
    if imp:
        a(impact_md(imp))
    return "\n".join(L)


def figure(inp: dict, kn: dict, path: Path) -> None:
    """A single overview figure for the README: counts bought with the official bill, log scale."""
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import matplotlib.ticker

    names = {it["key"]: it for it in inp["params"]["items"]}
    rows = []
    for key, r in kn["conversions_official"].items():
        o = model.option(names[key])
        label = {
            "food": "free hot meals",
            "rent": "student-years of hall rent",
            "phd": f"{o.get('years')}-year PhD studentships",
            "cells": "cell-line vials",
            "lab": f"new {o.get('m2')} m² CL2 labs",
            "cows": "beef cattle",
            "medium": f"bottles of {o.get('noun')}",
            "plus": "months of ChatGPT Plus",
        }.get(key) or o.get("row") or (o["noun"] + "s" if o.get("noun") and not o["noun"].endswith("s") else o.get("noun")) or names[key]["title"]
        rows.append((label, r["n"]))
    rows.sort(key=lambda t: t[1])
    plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 10})
    fig, ax = plt.subplots(figsize=(8, 5.6), dpi=150)
    fig.patch.set_facecolor("#fcfcfb")
    ax.set_facecolor("#fcfcfb")
    y = range(len(rows))
    ax.hlines(y, 0.1, [v for _, v in rows], color="#e1e0d9", lw=1, zorder=1)
    ax.scatter([v for _, v in rows], y, s=60, color="#2a78d6", zorder=3, edgecolors="#fcfcfb", linewidths=2)
    for i, (_, v) in enumerate(rows):
        ax.annotate(num(v), (v, i), xytext=(9, 0), textcoords="offset points", va="center", fontsize=9, color="#52514e")
    ax.set_yticks(list(y), [n for n, _ in rows])
    ax.set_xscale("log")
    ax.set_xlim(0.1, max(v for _, v in rows) * 60)
    ax.xaxis.set_major_formatter(matplotlib.ticker.FuncFormatter(
        lambda v, _: next((f"{v / u:g}{s}" for u, s in ((1e9, "bn"), (1e6, "M"), (1e3, "K")) if v >= u), f"{v:g}")))
    ax.grid(axis="x", color="#e1e0d9", lw=0.8)
    ax.set_axisbelow(True)
    for s in ("top", "right", "left"):
        ax.spines[s].set_visible(False)
    ax.spines["bottom"].set_color("#c3c2b7")
    ax.tick_params(colors="#52514e", length=0)
    fig.suptitle(f"What Imperial's {gbp(kn['budget']['official'])} logo refresh could have bought instead",
                 x=0.02, ha="left", fontsize=12, color="#0b0b0b", fontweight="bold")
    ax.set_xlabel("How many (log scale)", color="#52514e")
    fig.tight_layout()
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path, facecolor=fig.get_facecolor())
    plt.close(fig)


def impact_figure(imp: dict, path: Path) -> None:
    """README figure: Imperial against its Bayesian synthetic twin, and every method's estimate."""
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    des = imp["design"]
    outs = des["outcomes"]
    ink, ink2, grid, axis, bg = "#0b0b0b", "#52514e", "#e1e0d9", "#c3c2b7", "#fcfcfb"
    colors = {"its": "#2a78d6", "did": "#eb6834", "scm": "#1baf7a", "bsc": "#6250d6"}
    plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 9})
    fig = plt.figure(figsize=(11, 7.4), dpi=150)
    fig.patch.set_facecolor(bg)
    gs = fig.add_gridspec(2, len(outs), height_ratios=[1, 1.15], hspace=0.42, wspace=0.38)

    def style(ax):
        ax.set_facecolor(bg)
        for sp in ("top", "right"):
            ax.spines[sp].set_visible(False)
        for sp in ("left", "bottom"):
            ax.spines[sp].set_color(axis)
        ax.tick_params(colors=ink2, length=0)
        ax.grid(color=grid, lw=0.7)
        ax.set_axisbelow(True)

    for i, o in enumerate(outs):
        r = imp["results"][o["key"]]
        b = r["bsc"]
        ax = fig.add_subplot(gs[0, i])
        style(ax)
        x = np.arange(len(r["periods"]))
        ax.fill_between(x, 100 * np.exp(b["cf"] - b["band"]), 100 * np.exp(b["cf"] + b["band"]), color="#86b6ef", alpha=0.35, lw=0)
        ax.plot(x, 100 * np.exp(b["cf"]), color=ink2, lw=1.4, ls=(0, (4, 2)), label="Synthetic twin")
        ax.plot(x, 100 * np.exp(b["y"]), color="#2a78d6", lw=1.8, label="Imperial")
        first_post = int(r["post"].nonzero()[0][0])
        ax.axvline(first_post - 0.5, color=ink, lw=0.8)
        ticks = [0, len(x) - 1]
        ax.set_xticks(ticks, [r["periods"][t] for t in ticks])
        ax.set_title(o["short"].replace("International ", "International\n"), loc="left", fontsize=9.5, color=ink, fontweight="bold")
        if i == 0:
            ax.set_ylabel("Index, pre-launch average = 100", color=ink2)
            fig.legend(*ax.get_legend_handles_labels(), frameon=False, fontsize=8.5, ncol=2, loc="upper right", bbox_to_anchor=(0.98, 0.955))

    ax = fig.add_subplot(gs[1, :])
    style(ax)
    ax.grid(axis="y", visible=False)
    lo_clip, hi_clip = math.log(0.12), math.log(3.0)
    for i, o in enumerate(outs):
        r = imp["results"][o["key"]]
        for j, m in enumerate(METHODS):
            y = i + (j - 1.5) * 0.17
            est, lo, hi = (min(max(r[m][k], lo_clip), hi_clip) for k in ("est", "lo", "hi"))
            ax.plot([lo, hi], [y, y], color=colors[m], lw=1.6, solid_capstyle="round")
            for end, raw, mk in ((lo, r[m]["lo"], "<"), (hi, r[m]["hi"], ">")):
                if raw != end:  # interval runs off the chart
                    ax.plot(end, y, mk, color=colors[m], ms=5)
            ax.plot(est, y, "o", color=colors[m], ms=6, mec=bg, mew=1.5, label=METHOD_NAMES[m] if i == 0 else None)
    ax.axvline(0, color=ink, lw=0.9)
    ticks = [-0.8, -0.5, -0.25, 0, 0.25, 0.5, 1, 2]
    ax.set_xticks([math.log1p(t) for t in ticks], [f"{t:+.0%}" if t else "0" for t in ticks])
    ax.set_xlim(lo_clip, hi_clip)
    ax.set_yticks(range(len(outs)), [o["label"] for o in outs])
    ax.invert_yaxis()
    ax.set_xlabel(f"Estimated effect of the brand, with {round(100 * des['interval'])}% intervals (log scale)", color=ink2)
    ax.legend(frameon=False, fontsize=8, ncol=4, loc="lower center", bbox_to_anchor=(0.5, 1.0))
    fig.suptitle("Did Imperial's new brand attract more? Imperial vs the other 23 Russell Group universities",
                 x=0.02, ha="left", fontsize=12, color=ink, fontweight="bold")
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path, facecolor=fig.get_facecolor(), bbox_inches="tight")
    plt.close(fig)


def run(root: Path = ROOT, generated: str | None = None) -> dict:
    generated = generated or date.today().isoformat()
    inp = model.load(root / "data")
    imp = impact.analyse(float(inp["costs"]["rebrand_2024_total"]["value_gbp"]), root / "data")
    kn = key_numbers(inp, imp)
    (root / "results").mkdir(exist_ok=True)
    with open(root / "results" / "key_numbers.json", "w", encoding="utf-8") as f:
        json.dump(kn, f, indent=2, ensure_ascii=False)
    write_results(inp, root / "results")
    impact_csv(imp, root / "results" / "impact_estimates.csv")
    (root / "docs" / "data").mkdir(parents=True, exist_ok=True)
    with open(root / "docs" / "data" / "site.json", "w", encoding="utf-8") as f:
        json.dump(site_data(inp, generated, imp), f, indent=1, ensure_ascii=False)
    (root / "docs" / "CALCULATIONS.md").write_text(calculations_md(inp, kn, imp), encoding="utf-8")
    figure(inp, kn, root / "figures" / "overview.png")
    impact_figure(imp, root / "figures" / "impact.png")
    return kn
