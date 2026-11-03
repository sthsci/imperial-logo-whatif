import json
import math
import shutil

import pytest

from logowhatif import model, report
from logowhatif.model import ROOT


@pytest.fixture(scope="module")
def inp():
    return model.load()


def test_official_total_is_the_foi_figure(inp):
    assert model.budgets(inp)["official"] == pytest.approx(434801.47)


def test_cpi_uplift(inp):
    b = model.budgets(inp)
    assert b["real_today"] == pytest.approx(434801.47 * 144.1 / 133.9)
    assert b["rebrand2002_real_today"] == pytest.approx(298300 * 144.1 / 75.0)
    # the plot twist: in real terms the 2002 rebrand cost more
    assert b["rebrand2002_real_today"] > b["real_today"]
    assert b["both_real_today"] == pytest.approx(b["real_today"] + b["rebrand2002_real_today"])


@pytest.mark.parametrize("which", ["central", "low", "high"])
def test_split_adds_up_to_the_total(inp, which):
    s = model.split(inp, which=which)
    assert sum(s.values()) == pytest.approx(434801.47)
    assert all(v >= 0 for v in s.values())


def test_split_ranges_bracket_the_central_estimate(inp):
    for k, c in inp["params"]["split"].items():
        if c.get("residual"):
            continue
        assert c["low"] <= c["central"] <= c["high"] <= c["max"]


def test_every_option_has_a_price_and_a_source(inp):
    for item in inp["params"]["items"]:
        assert 0 <= item.get("default", 0) < len(item["options"])
        for o in item["options"]:
            assert float(o["price"]) > 0, (item["key"], o["label"])
            assert o["source"] and o["url"].startswith("http"), (item["key"], o["label"])


def test_basic_conversion_is_budget_over_price(inp):
    items = {it["key"]: it for it in inp["params"]["items"]}
    cows = model.convert(inp, items["cows"], model.option(items["cows"]), 434801.47)
    assert cows["n"] == pytest.approx(434801.47 / float(model.option(items["cows"])["price"]))


def test_special_conversions(inp):
    items = {it["key"]: it for it in inp["params"]["items"]}
    c = inp["params"]["constants"]
    M = 434801.47
    food = model.convert(inp, items["food"], model.option(items["food"]), M, meals=150)
    assert food["n"] * 150 == pytest.approx(food["meals"])
    tok = model.convert(inp, items["tokens"], model.option(items["tokens"]), M)
    assert tok["n"] == pytest.approx(M / float(model.option(items["tokens"])["price"]) * 1e6)
    assert tok["theses"] == pytest.approx(tok["n"] / (c["thesis_words"] * c["tokens_per_word"]))
    rent = model.option(items["rent"])
    assert float(rent["price"]) == pytest.approx(float(rent["weekly"]) * rent["weeks"], rel=1e-6)
    phd = model.option(items["phd"])
    assert float(phd["price"]) == pytest.approx(float(phd["annual"]) * phd["years"], rel=1e-6)
    for o in items["lab"]["options"]:
        assert float(o["price"]) == pytest.approx(o["m2"] * c["lab_cost_per_m2"], rel=1e-6)
        assert o["m2"] == pytest.approx(o["people"] * c["lab_m2_per_workplace"])
    plus = model.convert(inp, items["plus"], model.option(items["plus"]), M)
    assert plus["days_all_students"] == pytest.approx(M / 19.99 / 23920 * 365 / 12)


def test_usd_prices_use_one_exchange_rate(inp):
    rate = inp["params"]["constants"]["usd_gbp"]
    seen = 0
    for item in inp["params"]["items"]:
        for o in item["options"]:
            if "usd" in o:
                assert float(o["price"]) == pytest.approx(o["usd"] * rate, rel=1e-4), o["label"]
                seen += 1
    assert seen >= 5


def test_basket_items_match_card_prices(inp):
    prices = {o["label"]: float(o["price"]) for it in inp["params"]["items"] for o in it["options"]}
    for b in inp["params"]["basket"]:
        assert b["price"] > 0
        if b.get("from"):
            assert prices[b["from"]] * b.get("multiple", 1) == pytest.approx(b["price"]), b["key"]
    keys = {b["key"] for b in inp["params"]["basket"]}
    assert set(inp["params"]["basket_presets"]["phd"]) <= keys


def test_phd_preset_fits_the_budget(inp):
    price = {b["key"]: b["price"] for b in inp["params"]["basket"]}
    spent = sum(q * price[k] for k, q in inp["params"]["basket_presets"]["phd"].items())
    assert spent <= 434801.47


def test_pipeline_writes_consistent_site_json(tmp_path):
    # run on a copy so the test never overwrites the published outputs
    shutil.copytree(ROOT / "data", tmp_path / "data", ignore=shutil.ignore_patterns("raw"))
    kn = report.run(root=tmp_path, generated="2000-01-01")
    site = json.loads((tmp_path / "docs" / "data" / "site.json").read_text(encoding="utf-8"))
    assert site["meta"]["generated"] == "2000-01-01"
    assert site["budget"]["official"] == pytest.approx(kn["budget"]["official"])
    assert {s["key"] for s in site["split"]} == {"agencies", "font", "signage", "promo"}
    assert sum(1 for s in site["split"] if s["residual"]) == 1
    for it in site["items"]:
        assert it["group"] in {"food", "people", "lab", "ai", "extra"}
    assert all(math.isfinite(r["n"]) and r["n"] > 0 for r in kn["conversions_official"].values())
    assert (tmp_path / "docs" / "CALCULATIONS.md").read_text(encoding="utf-8").startswith("# Every calculation")
    assert (tmp_path / "figures" / "overview.png").stat().st_size > 10_000
    assert (tmp_path / "figures" / "impact.png").stat().st_size > 10_000
    assert "## 7. Did the brand work?" in (tmp_path / "docs" / "CALCULATIONS.md").read_text(encoding="utf-8")
    assert {o["key"] for o in site["impact"]["outcomes"]} == set(kn["impact"]["outcomes"])


def test_published_site_json_matches_the_model():
    site = json.loads((ROOT / "docs" / "data" / "site.json").read_text(encoding="utf-8"))
    inp = model.load()
    assert site["budget"]["official"] == pytest.approx(model.budgets(inp)["official"])
    assert [it["key"] for it in site["items"]] == [it["key"] for it in inp["params"]["items"]]
    for a, b in zip(site["items"], inp["params"]["items"]):
        assert [o["price"] for o in a["options"]] == [o["price"] for o in b["options"]], a["key"]
