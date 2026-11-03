"""What else could Imperial's 2024 brand refresh have bought?

Reads the inputs in data/ (every row carries its source) and converts the disclosed cost
into counts of other things. Money is GBP throughout. The web page (docs/assets/app.js)
repeats these formulas so readers can change the budget and the prices; tests check that
both agree on the default numbers through docs/data/site.json.
"""
from __future__ import annotations

import csv
import tomllib
from pathlib import Path
from statistics import mean

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"

# How generous the free-food card is: meals per student (the page offers the same list).
GENEROSITY = {"one_meal": 1, "week": 5, "term": 55, "year_lunches": 150, "year_all_meals": 1095}


def _rows(path: Path) -> list[dict]:
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(line for line in f if not line.startswith("#")))


def load(data_dir: Path = DATA) -> dict:
    """All inputs: official costs, CPI, Imperial facts, landmarks and parameters.toml."""
    with open(data_dir / "parameters.toml", "rb") as f:
        params = tomllib.load(f)
    return {
        "costs": {r["key"]: r for r in _rows(data_dir / "brand_costs.csv")},
        "cpi": {r["period"]: float(r["index"]) for r in _rows(data_dir / "cpi_d7bt.csv")},
        "facts": {r["key"]: r for r in _rows(data_dir / "imperial_facts.csv")},
        "landmarks": _rows(data_dir / "landmarks.csv"),
        "params": params,
    }


def fact(inp: dict, key: str) -> float:
    return float(inp["facts"][key]["value"])


def to_today(amount: float, index_then: float, index_now: float) -> float:
    """Re-price an amount with the consumer price index (ONS D7BT)."""
    return amount * index_now / index_then


def budgets(inp: dict) -> dict:
    """The money pots: the 2024 bill, in today's prices, and the 2002 rebrand for comparison."""
    infl = inp["params"]["inflation"]
    cpi = inp["cpi"]
    official = float(inp["costs"]["rebrand_2024_total"]["value_gbp"])
    r2002 = float(inp["costs"]["rebrand_2002_total"]["value_gbp"])
    i2024 = mean(cpi[k] for k in infl["base_2024"])
    i2002 = mean(cpi[k] for k in infl["base_2002"])
    i_now = cpi[infl["today"]]
    real_today = to_today(official, i2024, i_now)
    r2002_today = to_today(r2002, i2002, i_now)
    return {
        "official": official,
        "real_today": real_today,
        "rebrand2002": r2002,
        "rebrand2002_real_today": r2002_today,
        "both_real_today": real_today + r2002_today,
        "cpi_2024": i2024,
        "cpi_2002": i2002,
        "cpi_to": i_now,
        "cpi_to_label": infl["today_label"],
        "twist_pct": (r2002_today / real_today - 1) * 100,
    }


def split(inp: dict, total: float | None = None, which: str = "central") -> dict:
    """Estimated split of the disclosed total. Agencies get whatever the other slices leave."""
    comps = inp["params"]["split"]
    total = float(inp["costs"]["rebrand_2024_total"]["value_gbp"]) if total is None else total
    out = {k: float(c[which]) for k, c in comps.items() if not c.get("residual")}
    residual = [k for k, c in comps.items() if c.get("residual")]
    assert len(residual) == 1, "exactly one residual slice"
    out[residual[0]] = total - sum(out.values())
    return out


def option(item: dict, index: int | None = None) -> dict:
    return item["options"][item.get("default", 0) if index is None else index]


def convert(inp: dict, item: dict, opt: dict, money: float, meals: int = 1) -> dict:
    """How many of `opt` the money buys, plus the secondary figures each card quotes."""
    c = inp["params"]["constants"]
    students = fact(inp, "students")
    price = float(opt["price"])
    key = item["key"]
    n = money / price
    extra: dict[str, float] = {}
    if key == "beef":
        extra = {"burgers": n / c["burger_kg"], "imperial_beef_years": n / (fact(inp, "beef_t_per_year") * 1000)}
    elif key == "cows":
        extra = {"students_per_cow": students / n}
    elif key == "food":
        n = money / (price * meals)
        extra = {"meals": money / price, "share_of_students": n / students}
    elif key == "phd":
        extra = {"phd_years": money / float(opt["annual"])}
    elif key == "cells":
        extra = {"working_years": n / c["working_days"]}
    elif key == "medium":
        height = n * c["bottle_height_m"]
        qt = next(float(r["height_m"]) for r in inp["landmarks"] if r["key"] == "queens_tower")
        extra = {"litres": n * 0.5, "stack_m": height, "queens_towers": height / qt}
    elif key == "lab":
        extra = {"pi_startups": money / c["pi_startup_gbp"]}
    elif key == "tokens":
        n = money / price * 1e6
        theses = n / (c["thesis_words"] * c["tokens_per_word"])
        extra = {"theses": theses, "theses_per_research_student": theses / fact(inp, "pgr")}
    elif key == "plus":
        extra = {"days_all_students": n / students * 365 / 12, "years_one_person": n / 12}
    return {"key": key, "option": opt["label"], "price": price, "per": opt.get("per", "each"), "n": n, **extra}


def all_conversions(inp: dict, money: float, meals: int = 1, every_option: bool = False) -> list[dict]:
    out = []
    for item in inp["params"]["items"]:
        idxs = range(len(item["options"])) if every_option else [item.get("default", 0)]
        for i in idxs:
            out.append({"group": item["group"], "title": item["title"], **convert(inp, item, option(item, i), money, meals)})
    return out


def income_clock(inp: dict, money: float) -> dict:
    income = fact(inp, "total_income")
    per_hour = income / (365 * 24)
    return {"per_hour": per_hour, "hours": money / per_hour, "share_pct": money / income * 100}
