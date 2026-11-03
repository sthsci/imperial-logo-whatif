"""Did the new brand help Imperial attract students, funding and partners?

Imperial launched its new brand on 27 February 2024 and said it would help the College attract
students, staff, funding and partners. This module tests that with open data for Imperial and the
other 23 Russell Group universities (data/impact/, design in data/impact/design.toml).

Four estimates of the brand effect, all on the log scale (0.05 ≈ +5%):

* its - interrupted time series: Imperial's own pre-launch trend, extended past the launch
* did - difference-in-differences against the plain average of the other universities
* scm - synthetic control: the blend of other universities that best tracked Imperial before
* bsc - Bayesian synthetic control: a conjugate regression on the other universities, shrunk
        towards their plain average, giving a posterior for what Imperial would have done

and two Bayesian summaries:

* calibrated - Imperial's synthetic-control gap set against the gaps of every other university
               given a placebo "rebrand". This gives a likelihood for the effect that any prior
               can be combined with (the web page does it live).
* pooled     - a random-effects combination of one outcome per claim.

Uncertainty for did and scm also comes from the placebos: with a single treated university,
textbook standard errors do not apply.
"""
from __future__ import annotations

import math
import tomllib
from pathlib import Path

import numpy as np
from scipy import optimize, stats

from .model import DATA, _rows

GRID = np.linspace(-2.0, 2.0, 4001)  # effect grid for posteriors, log points
_trapz = getattr(np, "trapezoid", None) or np.trapz


# ---------------------------------------------------------------------------------- data

def design(data_dir: Path = DATA) -> dict:
    with open(data_dir / "impact" / "design.toml", "rb") as f:
        return tomllib.load(f)


def _period_key(out: dict, r: dict) -> str:
    if out["period"] == "month":
        return r["month"]
    if out["period"] == "cycle":
        return r["cycle"]
    if out["period"] == "competition_year":
        return r["competition_year"]
    y, m = int(r["month"][:4]), int(r["month"][5:7])  # march_year: March to February
    return str(y if m >= 3 else y - 1)


def panel(out: dict, data_dir: Path = DATA, column: str | None = None) -> tuple[list[str], list[str], np.ndarray]:
    """(periods, universities, values[university, period]) for one outcome, Imperial first."""
    column = column or out["value"]
    vals: dict[tuple[str, str], float] = {}
    for r in _rows(data_dir / "impact" / out["file"]):
        if out.get("domicile") and r["domicile"] != out["domicile"]:
            continue
        key = (_period_key(out, r), r["university"])
        vals[key] = vals.get(key, 0.0) + float(r[column])
    lo, hi = out["pre"][0], out["post"][1]
    periods = sorted(p for p in {p for p, _ in vals} if lo <= p <= hi)
    unis = sorted({u for _, u in vals}, key=lambda u: (u != "Imperial", u))
    return periods, unis, np.array([[vals.get((p, u), 0.0) for p in periods] for u in unis])


def masks(out: dict, periods: list[str]) -> tuple[np.ndarray, np.ndarray]:
    """Pre- and post-launch periods. A launch month that is in neither is shown but not used."""
    pre = np.array([out["pre"][0] <= p <= out["pre"][1] for p in periods])
    post = np.array([out["post"][0] <= p <= out["post"][1] for p in periods])
    return pre, post


def donors(Y: np.ndarray, pre: np.ndarray, min_scale: float) -> list[int]:
    """Rows usable as comparisons: never zero, and not much smaller than Imperial before the launch."""
    floor = min_scale * Y[0, pre].mean()
    return [j for j in range(1, len(Y)) if (Y[j] > 0).all() and Y[j, pre].mean() >= floor]


# ------------------------------------------------------------------------------- helpers

def _ar1(resid: np.ndarray) -> float:
    r = resid - resid.mean()
    return float(max(0.0, (r[1:] @ r[:-1]) / (r @ r)))


def _ar1_factor(rho: float, n: int) -> float:
    """Variance of the mean of n AR(1) errors, relative to n independent ones."""
    return 1.0 + 2.0 * sum((1 - k / n) * rho ** k for k in range(1, n))


def _season(periods: list[str]) -> np.ndarray | None:
    return np.array([int(p[5:7]) for p in periods]) if len(periods[0]) == 7 and periods[0][4] == "-" else None


def _interval(est: float, scale: float, df: float, level: float) -> tuple[float, float]:
    q = stats.t.ppf(0.5 + level / 2, df)
    return est - q * scale, est + q * scale


# ------------------------------------------------------------------------------ methods

def its(y: np.ndarray, pre: np.ndarray, post: np.ndarray, season: np.ndarray | None, level: float) -> dict:
    """Interrupted time series: a linear trend (plus month effects) fitted before, extended after."""
    t = np.arange(len(y), dtype=float)
    cols = [np.ones_like(t), (t - t[pre].mean()) / (12 if season is not None else 1)]
    if season is not None:
        cols += [(season == m).astype(float) for m in range(2, 13)]
    X = np.column_stack(cols)
    Xp = X[pre]
    XtX_inv = np.linalg.inv(Xp.T @ Xp)
    beta = XtX_inv @ Xp.T @ y[pre]
    resid = y[pre] - Xp @ beta
    n, k = Xp.shape
    s2 = resid @ resid / (n - k)
    fit = X @ beta
    est = float((y - fit)[post].mean())
    n_post = int(post.sum())
    rho = _ar1(resid) if season is not None else 0.0
    xbar = X[post].mean(0)
    var = s2 * (_ar1_factor(rho, n_post) / n_post + (1 + rho) / (1 - rho) * xbar @ XtX_inv @ xbar)
    se = math.sqrt(var)
    lo, hi = _interval(est, se, n - k, level)
    return {"est": est, "lo": lo, "hi": hi, "p": float(2 * stats.t.sf(abs(est) / se, n - k)), "fit": fit, "rho": rho}


def did(L: np.ndarray, pre: np.ndarray, post: np.ndarray, level: float) -> dict:
    """Difference-in-differences against the average comparison university, with placebo inference."""
    change = L[:, post].mean(1) - L[:, pre].mean(1)
    J = len(L) - 1
    est = float(change[0] - change[1:].mean())
    placebo = np.array([change[j] - np.delete(change[1:], j - 1).mean() for j in range(1, J + 1)])
    scale = placebo.std(ddof=1) * math.sqrt(1 + 1 / J)
    lo, hi = _interval(est, scale, J - 1, level)
    p = (1 + int((np.abs(placebo) >= abs(est)).sum())) / (J + 1)
    return {"est": est, "lo": lo, "hi": hi, "p": p, "placebo": placebo}


def synth_weights(X: np.ndarray, y: np.ndarray) -> np.ndarray:
    """Non-negative weights summing to one that minimise ||y - X w|| (a small quadratic programme)."""
    J = X.shape[1]
    G, c = X.T @ X, X.T @ y
    res = optimize.minimize(
        lambda w: 0.5 * w @ G @ w - c @ w, np.full(J, 1.0 / J), jac=lambda w: G @ w - c,
        bounds=[(0.0, 1.0)] * J, constraints=[{"type": "eq", "fun": lambda w: w.sum() - 1.0, "jac": lambda w: np.ones(J)}],
        method="SLSQP", options={"ftol": 1e-12, "maxiter": 500},
    )
    w = np.clip(res.x, 0.0, None)
    return w / w.sum()


def _demean(L: np.ndarray, pre: np.ndarray) -> np.ndarray:
    return L - L[:, pre].mean(1, keepdims=True)


def scm(L: np.ndarray, pre: np.ndarray, post: np.ndarray, level: float) -> dict:
    """Synthetic control on pre-launch-demeaned logs, with every other university as a placebo."""
    D = _demean(L, pre)
    J = len(L) - 1
    pool = list(range(1, J + 1))

    def gap(i: int, units: list[int]) -> tuple[np.ndarray, np.ndarray]:
        w = synth_weights(D[units][:, pre].T, D[i, pre])
        return D[i] - w @ D[units], w

    def summary(g: np.ndarray) -> tuple[float, float]:
        pre_rmspe = math.sqrt((g[pre] ** 2).mean())
        return float(g[post].mean()), math.sqrt((g[post] ** 2).mean()) / max(pre_rmspe, 1e-9)

    g0, w0 = gap(0, pool)
    est, ratio = summary(g0)
    gaps = [gap(j, [k for k in pool if k != j])[0] for j in pool]
    placebo = np.array([summary(g)[0] for g in gaps])
    ratios = np.array([summary(g)[1] for g in gaps])
    scale = placebo.std(ddof=1) * math.sqrt(1 + 1 / J)
    lo, hi = _interval(est, scale, J - 1, level)
    return {
        "est": est, "lo": lo, "hi": hi,
        "p": (1 + int((np.abs(placebo) >= abs(est)).sum())) / (J + 1),
        "p_ratio": (1 + int((ratios >= ratio).sum())) / (J + 1),
        "rank": 1 + int((np.abs(placebo) > abs(est)).sum()),
        "weights": w0, "gap": g0, "placebo": placebo, "placebo_gaps": np.array(gaps),
        "pre_rmspe": math.sqrt((g0[pre] ** 2).mean()),
    }


def bsc(L: np.ndarray, pre: np.ndarray, post: np.ndarray, season: np.ndarray | None, level: float) -> dict:
    """Bayesian synthetic control: Imperial regressed on the other universities before the launch.

    Conjugate normal-inverse-gamma regression on pre-launch-demeaned logs. The weights' prior is
    centred on the plain average (1/J each) with precision lambda/sigma^2; lambda is picked by
    marginal likelihood (empirical Bayes). The posterior predictive gives the counterfactual.
    """
    D = _demean(L, pre)
    y, J = D[0], len(L) - 1
    X = np.column_stack([np.ones(D.shape[1]), D[1:].T])
    Xp, yp = X[pre], y[pre]
    n = len(yp)
    m0 = np.r_[0.0, np.full(J, 1.0 / J)]
    best = None
    for lam in np.logspace(-1, 4, 51):
        V0_inv = np.diag(np.r_[1 / 100.0, np.full(J, lam)])
        Vn = np.linalg.inv(V0_inv + Xp.T @ Xp)
        mn = Vn @ (V0_inv @ m0 + Xp.T @ yp)
        an = n / 2
        bn = 0.5 * (yp @ yp + m0 @ V0_inv @ m0 - mn @ (V0_inv + Xp.T @ Xp) @ mn)
        logml = 0.5 * np.linalg.slogdet(Vn)[1] + 0.5 * np.linalg.slogdet(V0_inv)[1] - an * math.log(bn) + math.lgamma(an)
        if best is None or logml > best[0]:
            best = (logml, lam, Vn, mn, an, bn)
    _, lam, Vn, mn, an, bn = best
    df, s2 = 2 * an, bn / an
    cf = X @ mn
    rho = _ar1(yp - Xp @ mn) if season is not None else 0.0
    n_post = int(post.sum())
    xbar = X[post].mean(0)
    scale = math.sqrt(s2 * (_ar1_factor(rho, n_post) / n_post + (1 + rho) / (1 - rho) * xbar @ Vn @ xbar))
    est = float((y - cf)[post].mean())
    lo, hi = _interval(est, scale, df, level)
    band = stats.t.ppf(0.5 + level / 2, df) * np.sqrt(s2 * (1 + np.einsum("ij,jk,ik->i", X, Vn, X)))
    return {
        "est": est, "lo": lo, "hi": hi, "p_pos": float(stats.t.cdf(est / scale, df)),
        "lambda": float(lam), "weights": mn[1:], "cf": cf, "band": band, "y": y, "rho": rho,
    }


# ------------------------------------------------------------------------------ Bayes

def calibrated(est: float, placebo: np.ndarray) -> dict:
    """Likelihood for the effect, calibrated on placebo gaps: a Student-t (Jeffreys prior on their mean and spread)."""
    J = len(placebo)
    return {"d": float(est - placebo.mean()), "scale": float(placebo.std(ddof=1) * math.sqrt(1 + 1 / J)), "df": J - 1}


def posterior(lik: dict, m: float, s: float, level: float = 0.95, breakeven: float | None = None) -> dict:
    """Posterior for the effect on GRID under a normal prior N(m, s); Savage-Dickey Bayes factor for 'any effect'."""
    like = stats.t.pdf((lik["d"] - GRID) / lik["scale"], lik["df"]) / lik["scale"]
    prior = stats.norm.pdf(GRID, m, s)
    post = like * prior
    post /= _trapz(post, GRID)
    cdf = np.concatenate([[0.0], np.cumsum((post[1:] + post[:-1]) / 2 * np.diff(GRID))])
    cdf /= cdf[-1]
    q = lambda p: float(np.interp(p, cdf, GRID))  # noqa: E731
    i0 = int(np.argmin(np.abs(GRID)))
    out = {
        "mean": float(_trapz(GRID * post, GRID)), "median": q(0.5),
        "lo": q(0.5 - level / 2), "hi": q(0.5 + level / 2),
        "p_pos": float(1 - np.interp(0.0, GRID, cdf)),
        "bf10": float(prior[i0] / post[i0]),
    }
    if breakeven is not None:
        out["p_breakeven"] = float(1 - np.interp(breakeven, GRID, cdf))
    return out


def pooled(liks: list[dict], m: float, s: float, omega_sd: float, level: float = 0.95) -> dict:
    """Random-effects pooling: d_k ~ N(Delta, v_k + omega^2), Delta ~ N(m, s), omega ~ half-normal(omega_sd).

    v_k is the variance of each calibrated Student-t likelihood. Returns the posterior of Delta,
    the average brand effect across outcomes, as a mixture over a grid of omega.
    """
    d = np.array([lk["d"] for lk in liks])
    v = np.array([lk["scale"] ** 2 * lk["df"] / (lk["df"] - 2) for lk in liks])
    omegas = np.linspace(0, 4 * omega_sd, 161)
    logw, means, sds = [], [], []
    for om in omegas:
        dk = v + om ** 2
        prec = 1 / s ** 2 + (1 / dk).sum()
        mu = (m / s ** 2 + (d / dk).sum()) / prec
        a = (1 / dk).sum()
        # marginal likelihood of d given omega: N(m 1, diag(dk) + s^2 11'), via Sherman-Morrison
        r = d - m
        quad = (r ** 2 / dk).sum() - s ** 2 * ((r / dk).sum()) ** 2 / (1 + s ** 2 * a)
        logdet = np.log(dk).sum() + math.log(1 + s ** 2 * a)
        logw.append(-0.5 * (quad + logdet) + stats.halfnorm.logpdf(om, scale=omega_sd))
        means.append(mu)
        sds.append(math.sqrt(1 / prec))
    w = np.exp(np.array(logw) - max(logw))
    w /= w.sum()
    dens = sum(wi * stats.norm.pdf(GRID, mu, sd) for wi, mu, sd in zip(w, means, sds))
    dens /= _trapz(dens, GRID)
    cdf = np.concatenate([[0.0], np.cumsum((dens[1:] + dens[:-1]) / 2 * np.diff(GRID))])
    cdf /= cdf[-1]
    q = lambda p: float(np.interp(p, cdf, GRID))  # noqa: E731
    return {"median": q(0.5), "lo": q(0.5 - level / 2), "hi": q(0.5 + level / 2),
            "p_pos": float(1 - np.interp(0.0, GRID, cdf)), "omega": float(w @ omegas),
            "bf10": float(stats.norm.pdf(0.0, m, s) / np.interp(0.0, GRID, dens))}


def mde(lik: dict, level: float, power: float) -> float:
    """Smallest effect the placebo-calibrated test would catch with the given power."""
    return float((stats.t.ppf(0.5 + level / 2, lik["df"]) + stats.t.ppf(power, lik["df"])) * lik["scale"])


# ----------------------------------------------------------------------------- analysis

def pct(x: float) -> float:
    """Log points to a percentage change."""
    return 100.0 * math.expm1(x)


def analyse_outcome(out: dict, des: dict, cost: float, data_dir: Path = DATA) -> dict:
    periods, unis, Y = panel(out, data_dir)
    pre, post = masks(out, periods)
    rows = [0] + donors(Y, pre, des["min_donor_scale"])
    Yk, names = Y[rows], [unis[i] for i in rows]
    L = np.log(Yk)
    level = des["interval"]
    season = _season(periods)
    r_its = its(L[0], pre, post, season, level)
    r_did = did(L, pre, post, level)
    r_scm = scm(L, pre, post, level)
    r_bsc = bsc(L, pre, post, season, level)
    lik = calibrated(r_scm["est"], r_scm["placebo"])
    be = breakeven(out, des, cost, data_dir, periods, pre)
    priors = {k: posterior(lik, p["m"], p["s"], level, be["log"] if be else None) for k, p in des["priors"].items()}
    flat = posterior(lik, 0.0, 10.0, level, be["log"] if be else None)
    return {
        "key": out["key"], "periods": periods, "pre": pre, "post": post, "names": names, "Y": Yk,
        "its": r_its, "did": r_did, "scm": r_scm, "bsc": r_bsc, "lik": lik, "priors": priors, "flat": flat,
        "mde": mde(lik, level, des["power"]), "breakeven": be,
        "imperial_pre": float(np.exp(L[0, pre].mean())), "imperial_post": float(np.exp(L[0, post].mean())),
        "imperial_last_pre": float(Yk[0, pre][-1]), "imperial_post_values": Yk[0, post].tolist(),
    }


def breakeven(out: dict, des: dict, cost: float, data_dir: Path, periods: list[str], pre: np.ndarray) -> dict | None:
    """Effect size (log points) at which one year of the effect repays the bill."""
    kind = out.get("breakeven")
    if kind == "students":
        f = des["fee"]
        ucas = {r["cycle"]: float(r["accepted"]) for r in _rows(data_dir / "impact" / out["file"])
                if r["university"] == "Imperial" and r["domicile"] == out["domicile"]}
        last = [p for p, is_pre in zip(periods, pre) if is_pre][-1]
        intake = ucas[last]
        value = intake * f["overseas_ug_fee_gbp"] * f["years"]
        students = cost / (f["overseas_ug_fee_gbp"] * f["years"])
        share = cost / value
        return {"share": share, "log": math.log1p(share), "students": students, "student_years": cost / f["overseas_ug_fee_gbp"],
                "intake": intake, "intake_cycle": last, "basis": "one year's international intake, at the overseas fee for a four-year degree"}
    if kind == "money":
        col = out.get("award", out["value"])
        p2, _, M = panel(out, data_dir, column=col)
        pre_vals = M[0, [i for i, p in enumerate(p2) if out["pre"][0] <= p <= out["pre"][1]]]
        annual = float(pre_vals[-3:].mean())
        share = cost / annual
        return {"share": share, "log": math.log1p(share), "annual_gbp": annual,
                "basis": "Imperial's average yearly amount over the last three years before the launch"}
    return None


def analyse(cost: float, data_dir: Path = DATA) -> dict:
    des = design(data_dir)
    results = {o["key"]: analyse_outcome(o, des, cost, data_dir) for o in des["outcomes"]}
    liks = [results[k]["lik"] for k in des["pooled"]]
    omega_sd = des.get("omega_sd", 0.1)
    pool = {k: pooled(liks, p["m"], p["s"], omega_sd, des["interval"]) for k, p in des["priors"].items()}
    pool["flat"] = pooled(liks, 0.0, 10.0, omega_sd, des["interval"])
    return {"design": des, "results": results, "pooled": pool}
