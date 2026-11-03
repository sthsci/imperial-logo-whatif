"""Checks on the brand test: each method on data with a known answer, the inputs, and the page data."""
import csv
import json
import math

import numpy as np
import pytest
from scipy import stats

from logowhatif import impact
from logowhatif.model import ROOT, _rows

COST = 434801.47


@pytest.fixture(scope="module")
def res():
    return impact.analyse(COST)


def _panel(effect=0.0, n_donors=12, n_pre=10, n_post=2, noise=0.02, seed=1):
    """Log-scale panel: donors share a trend; Imperial is a fixed blend of three of them plus `effect` after launch."""
    rng = np.random.default_rng(seed)
    T = n_pre + n_post
    common = np.cumsum(rng.normal(0.03, 0.05, T))
    donors = common + rng.normal(0, 0.1, (n_donors, 1)) * np.arange(T) / T + rng.normal(0, noise, (n_donors, T))
    imperial = 0.5 * donors[0] + 0.3 * donors[1] + 0.2 * donors[2]
    imperial = imperial + np.r_[np.zeros(n_pre), np.full(n_post, effect)]
    L = np.vstack([imperial, donors]) + 10
    pre = np.r_[np.ones(n_pre, bool), np.zeros(n_post, bool)]
    return L, pre, ~pre


def test_synthetic_weights_are_a_blend():
    rng = np.random.default_rng(0)
    X = rng.normal(size=(30, 6))
    w_true = np.array([0.5, 0.3, 0.2, 0, 0, 0])
    w = impact.synth_weights(X, X @ w_true)
    assert w.min() >= 0 and w.sum() == pytest.approx(1)
    assert w == pytest.approx(w_true, abs=1e-6)


@pytest.mark.parametrize("effect", [0.0, 0.2])
def test_synthetic_control_recovers_a_known_effect(effect):
    L, pre, post = _panel(effect)
    r = impact.scm(L, pre, post, 0.95)
    assert r["est"] == pytest.approx(effect, abs=0.04)
    assert r["weights"][:3].sum() > 0.8
    assert len(r["placebo"]) == len(L) - 1


def test_did_placebos_average_zero_and_find_a_shift():
    L, pre, post = _panel(0.3)
    r = impact.did(L, pre, post, 0.95)
    assert r["placebo"].mean() == pytest.approx(0, abs=1e-12)
    assert r["est"] > 0.15


def test_its_finds_a_step_on_a_straight_line():
    t = np.arange(12.0)
    pre = t < 9
    y = 1 + 0.05 * t + np.where(pre, 0, 0.1) + np.r_[0.001, -0.001] .repeat(6)
    r = impact.its(y, pre, ~pre, None, 0.95)
    assert r["est"] == pytest.approx(0.1, abs=0.01)
    assert r["lo"] < r["est"] < r["hi"]


def test_bayesian_synthetic_control_without_an_effect():
    L, pre, post = _panel(0.0)
    r = impact.bsc(L, pre, post, None, 0.95)
    assert r["lo"] < 0 < r["hi"]
    assert 0.1 <= r["lambda"] <= 1e4
    assert len(r["band"]) == L.shape[1] and (r["band"] > 0).all()


def test_flat_prior_posterior_is_the_placebo_t_interval():
    lik = {"d": 0.1, "scale": 0.05, "df": 20}
    p = impact.posterior(lik, 0.0, 10.0)
    q = stats.t.ppf(0.975, 20) * 0.05
    assert p["median"] == pytest.approx(0.1, abs=1e-3)
    assert p["lo"] == pytest.approx(0.1 - q, abs=2e-3)
    assert p["hi"] == pytest.approx(0.1 + q, abs=2e-3)


def test_bayes_factor_points_the_right_way():
    near_zero = impact.posterior({"d": 0.0, "scale": 0.01, "df": 20}, 0.0, 0.1)
    far_off = impact.posterior({"d": 0.2, "scale": 0.02, "df": 20}, 0.0, 0.1)
    assert near_zero["bf10"] < 1 / 3
    assert far_off["bf10"] > 10
    # Savage-Dickey with a normal likelihood has a closed form
    lik_n = {"d": 0.05, "scale": 0.03, "df": 10_000}
    m, s = 0.0, 0.1
    v = s ** 2 * lik_n["scale"] ** 2 / (s ** 2 + lik_n["scale"] ** 2)
    mu = v * lik_n["d"] / lik_n["scale"] ** 2
    expected = stats.norm.pdf(0, m, s) / stats.norm.pdf(0, mu, math.sqrt(v))
    assert impact.posterior(lik_n, m, s)["bf10"] == pytest.approx(expected, rel=0.01)


def test_pooled_without_spread_is_the_precision_weighted_mean():
    liks = [{"d": 0.1, "scale": 0.05, "df": 1000}, {"d": -0.05, "scale": 0.1, "df": 1000}]
    p = impact.pooled(liks, 0.0, 10.0, omega_sd=1e-6)
    w = np.array([1 / 0.05 ** 2, 1 / 0.1 ** 2])
    assert p["median"] == pytest.approx(float(w @ [0.1, -0.05] / w.sum()), abs=2e-3)


def test_inputs_cover_every_university_and_period():
    des = impact.design()
    for o in des["outcomes"]:
        periods, unis, Y = impact.panel(o)
        pre, post = impact.masks(o, periods)
        assert unis[0] == "Imperial" and len(unis) == 24, o["key"]
        assert pre.sum() >= 7 and post.sum() >= 1, o["key"]
        assert (Y[0] > 0).all(), o["key"]
        with open(ROOT / "data" / "impact" / o["file"], encoding="utf-8") as f:
            head = f.readline() + f.readline()
        assert "http" in head, f"{o['file']} must name its source"


def test_breakeven_for_students_is_the_fee_arithmetic(res):
    des = impact.design()
    be = res["results"]["intl_applicants"]["breakeven"]
    intake = next(float(r["accepted"]) for r in _rows(ROOT / "data" / "impact" / "ucas_applications.csv")
                  if r["university"] == "Imperial" and r["domicile"] == "international" and r["cycle"] == "2024")
    assert be["share"] == pytest.approx(COST / (intake * des["fee"]["overseas_ug_fee_gbp"] * des["fee"]["years"]))


def test_every_estimate_is_finite_and_ordered(res):
    for k, r in res["results"].items():
        for m in ("its", "did", "scm", "bsc"):
            assert r[m]["lo"] < r[m]["est"] < r[m]["hi"], (k, m)
        for p in r["priors"].values():
            assert p["lo"] < p["median"] < p["hi"] and 0 <= p["p_pos"] <= 1 and p["bf10"] > 0
        assert r["mde"] > 0


def test_published_impact_matches_the_model(res):
    site = json.loads((ROOT / "docs" / "data" / "site.json").read_text(encoding="utf-8"))["impact"]
    for o in site["outcomes"]:
        r = res["results"][o["key"]]
        assert o["methods"]["scm"]["est"] == pytest.approx(r["scm"]["est"], abs=1e-4)
        assert o["lik"]["d"] == pytest.approx(r["lik"]["d"], abs=1e-4)
        assert site["reference"][o["key"]]["open"]["median"] == pytest.approx(r["priors"]["open"]["median"], abs=1e-4)
    assert site["pooled"]["open"]["median"] == pytest.approx(res["pooled"]["open"]["median"], abs=1e-4)
    with open(ROOT / "results" / "impact_estimates.csv", encoding="utf-8") as f:
        assert len(list(csv.DictReader(f))) == 5 * (4 + 3) + 4
