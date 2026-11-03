/* The Logo, Converted: interactive companion page.
   Reads data/site.json, written by scripts/run_all.py. Every price in it carries its source. */
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  // Sentences are built from ["plain", {b: "bold"}, {a: "link", href}] parts, never innerHTML.
  function rich(node, parts) {
    node.replaceChildren();
    for (const p of parts) {
      if (p == null || p === "") continue;
      if (typeof p === "string") node.append(document.createTextNode(p));
      else if (p.b != null) node.append(el("b", null, p.b));
      else if (p.a != null) {
        const a = el("a", null, p.a);
        a.href = p.href;
        a.rel = "noopener";
        node.append(a);
      }
    }
    return node;
  }

  // ---------- formatting ----------
  const GBP0 = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
  const GBP2 = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const N0 = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
  const fmt = {
    gbp: (x) => GBP0.format(Math.round(x)),
    gbp2: (x) => GBP2.format(x),
    price: (x) => (x < 100 && Math.round(x * 100) % 100 !== 0 ? GBP2.format(x) : GBP0.format(x)),
    short(x) {
      if (x >= 1e9) return "£" + (x / 1e9).toFixed(2) + "bn";
      if (x >= 1e6) return "£" + (x / 1e6).toFixed(2) + "m";
      if (x >= 1e4) return "£" + Math.round(x / 1e3) + "k";
      return GBP0.format(Math.round(x));
    },
    count(x) {
      if (!isFinite(x)) return "–";
      if (x >= 1e12) return (x / 1e12).toFixed(2) + " trillion";
      if (x >= 1e9) return (x / 1e9).toFixed(x >= 1e11 ? 0 : 1) + " billion";
      if (x >= 1e6) return (x / 1e6).toFixed(x >= 1e8 ? 0 : 1) + " million";
      if (x >= 10) return N0.format(Math.floor(x));
      if (x >= 1) return x.toFixed(1);
      return x.toFixed(2);
    },
    tick(v) {
      const units = [[1e12, "tn"], [1e9, "bn"], [1e6, "M"], [1e3, "K"]];
      for (const [u, s] of units) if (v >= u) return N0.format(v / u) + s;
      return v >= 1 ? N0.format(v) : String(v);
    },
    years(y) {
      if (y >= 1.95) return y.toFixed(1) + " years";
      if (y >= 0.95) return y.toFixed(1) + " year" + (y.toFixed(1) === "1.0" ? "" : "s");
      const m = y * 12;
      if (m >= 1) return Math.round(m) + " month" + (Math.round(m) === 1 ? "" : "s");
      return Math.max(1, Math.round(y * 52)) + " weeks";
    },
    duration(hours) {
      if (hours >= 48) return (hours / 24).toFixed(1) + " days";
      if (hours >= 1) return Math.floor(hours) + " h " + Math.round((hours % 1) * 60) + " min";
      return Math.max(1, Math.round(hours * 60)) + " min";
    },
    days(d) {
      if (d >= 60) return fmt.years(d / 365);
      if (d >= 1.5) return Math.round(d) + " days";
      if (d >= 1) return "a day";
      return Math.max(1, Math.round(d * 24)) + " hours";
    },
    pct: (x) => (x >= 10 ? x.toFixed(0) : x >= 1 ? x.toFixed(1) : x.toFixed(2)) + "%",
  };
  const plural = (noun, n) => (n === 1 ? noun : noun.endsWith("s") ? noun : noun + "s");

  // ---------- state ----------
  let S = null;
  const state = { pot: "official", custom: 434801.47, split: {}, choice: {}, meals: 3, basket: {} };
  const updaters = [];

  const GENEROSITY = [
    { label: "One free hot meal each", meals: 1, say: "one free hot meal each" },
    { label: "A week of free lunches (5)", meals: 5, say: "a week of free lunches (5)" },
    { label: "A term of free lunches (55)", meals: 55, say: "a whole term of free lunches (11 weeks × 5)" },
    { label: "A year of free lunches (150)", meals: 150, say: "free lunch every weekday of the teaching year (30 weeks × 5)" },
    { label: "Every meal for a year (1,095)", meals: 1095, say: "all three meals, every day, for a year" },
  ];

  function budget() {
    const b = S.budget;
    switch (state.pot) {
      case "real": return b.real_today;
      case "both": return b.both_real_today;
      case "signage": return splitValue("signage");
      case "custom": return state.custom;
      default: return b.official;
    }
  }
  const item = (key) => S.items.find((it) => it.key === key);
  const opt = (it) => it.options[state.choice[it.key]];

  // ---------- the bill: estimated split ----------
  function splitParts() {
    const total = S.budget.official;
    let fixed = 0;
    for (const c of S.split) if (!c.residual) fixed += state.split[c.key];
    return S.split.map((c) => ({ ...c, value: c.residual ? Math.max(0, total - fixed) : state.split[c.key] }));
  }
  const splitValue = (key) => splitParts().find((p) => p.key === key).value;

  function buildBill() {
    const ctr = $("#splitControls");
    for (const c of S.split) {
      if (c.residual) continue;
      const wrap = el("div", "control");
      const lab = el("label");
      lab.htmlFor = "split-" + c.key;
      const out = el("output");
      lab.append(document.createTextNode(c.label), out);
      const r = el("input");
      r.type = "range";
      r.id = "split-" + c.key;
      r.min = 0;
      r.max = c.max;
      r.step = 1000;
      r.value = state.split[c.key];
      r.addEventListener("input", () => {
        const others = S.split.filter((o) => !o.residual && o.key !== c.key).reduce((s, o) => s + state.split[o.key], 0);
        const v = Math.min(Number(r.value), S.budget.official - others);
        state.split[c.key] = v;
        if (Number(r.value) !== v) r.value = v;
        renderBill();
        if (state.pot === "signage") refreshAll();
        else renderPots();
      });
      wrap.append(lab, r);
      ctr.append(wrap);
    }
    const reset = el("button", "btn", "Reset to our estimate");
    reset.type = "button";
    reset.addEventListener("click", () => {
      for (const c of S.split) if (!c.residual) state.split[c.key] = c.central;
      for (const c of S.split) if (!c.residual) $("#split-" + c.key).value = c.central;
      renderBill();
      if (state.pot === "signage") refreshAll();
      else renderPots();
    });
    ctr.append(reset);
    renderBill();
  }

  function renderBill() {
    const parts = splitParts();
    const v = (k) => parts.find((p) => p.key === k).value;
    const sig = S.split.find((c) => c.key === "signage");
    const tiles = [
      { l1: "Paid in total", tag: ["official", "Official"], v: fmt.gbp2(S.budget.official),
        l: "Imperial’s FOI disclosure, March 2024: strategy, logo, typeface, signs and promotional material, all in." },
      { l1: "The logo itself", tag: ["est", "Estimate"], v: "≈ " + fmt.gbp(v("agencies") + v("font")),
        l: "Brand agencies (strategy, identity, templates, training, accessibility research) plus the bespoke typeface." },
      { l1: "Replacing the signs", tag: ["est", "Estimate"], v: "≈ " + fmt.gbp(v("signage")),
        l: `“New signage across Campuses”, the part of the bill that replaced the old logo on walls and banners. Our plausible range is ${fmt.short(sig.low)}–${fmt.short(sig.high)}.` },
      { l1: "Promotional extras", tag: ["est", "Estimate"], v: "≈ " + fmt.gbp(v("promo")),
        l: "The brand animation video, lanyards and other launch material." },
    ];
    const host = $("#billTiles");
    host.replaceChildren(...tiles.map((t) => {
      const d = el("div", "tile");
      const l1 = el("div", "l1", t.l1);
      l1.append(el("span", "tag " + t.tag[0], t.tag[1]));
      d.append(l1, el("div", "v", t.v), el("div", "l", t.l));
      return d;
    }));

    const total = S.budget.official;
    const bar = $("#splitBar");
    bar.replaceChildren(...parts.filter((p) => p.value > 0).map((p) => {
      const s = el("div", "seg");
      s.style.flex = `${p.value} 1 0`;
      s.style.background = `var(--${p.color})`;
      s.tabIndex = 0;
      s.setAttribute("aria-label", `${p.label}: about ${fmt.gbp(p.value)} (${fmt.pct((p.value / total) * 100)})`);
      tip(s, () => [fmt.gbp(p.value), `${p.label} · ${fmt.pct((p.value / total) * 100)} · ${p.residual ? "what is left over" : "estimate"}`]);
      return s;
    }));
    $("#splitLegend").replaceChildren(...parts.map((p) => {
      const k = el("span", "key");
      const sw = el("span", "sw");
      sw.style.background = `var(--${p.color})`;
      k.append(sw, document.createTextNode(p.label + " "), el("strong", null, "≈ " + fmt.short(p.value)));
      return k;
    }));
    for (const c of S.split) {
      if (c.residual) continue;
      $("#split-" + c.key).previousElementSibling.querySelector("output").textContent = fmt.gbp(state.split[c.key]);
    }

    const rc = $("#receipt");
    rc.replaceChildren(el("div", "r-head", "IMPERIAL BRAND PROJECT · 2023–24"));
    for (const p of parts) {
      const line = el("div", "r-line");
      line.append(el("span", "name", p.receipt), el("span", "dots"), el("span", "amt", "≈ " + fmt.gbp(p.value)));
      rc.append(line);
    }
    const tot = el("div", "r-line r-total");
    tot.append(el("span", "name", "TOTAL (official)"), el("span", "dots"), el("span", "amt", fmt.gbp2(total)));
    rc.append(tot, el("div", "r-foot", "Line items: our estimates. Supplier amounts withheld under FOI s.43."));
  }

  // ---------- budget selector ----------
  function pots() {
    const b = S.budget;
    return [
      { key: "official", name: "The 2024 bill", sub: fmt.gbp2(b.official) },
      { key: "real", name: "In today’s money", sub: `${fmt.gbp(b.real_today)} (${b.cpi_to_label} prices)` },
      { key: "signage", name: "Just the new signs", sub: `≈ ${fmt.gbp(splitValue("signage"))} (estimate)` },
      { key: "both", name: "Both rebrands, 2002 + 2024", sub: `${fmt.gbp(b.both_real_today)} in today’s money` },
      { key: "custom", name: "Custom", sub: "choose an amount" },
    ];
  }
  function buildPots() {
    const fs = $("#pots");
    for (const p of pots()) {
      const lab = el("label", "pot");
      const inp = el("input");
      inp.type = "radio";
      inp.name = "pot";
      inp.value = p.key;
      inp.checked = p.key === state.pot;
      inp.addEventListener("change", () => {
        state.pot = p.key;
        $("#customWrap").hidden = p.key !== "custom";
        refreshAll();
      });
      const span = el("span");
      span.append(document.createTextNode(p.name), el("small", null, p.sub));
      span.dataset.pot = p.key;
      lab.append(inp, span);
      fs.append(lab);
    }
    const r = $("#customRange");
    r.value = state.custom;
    r.addEventListener("input", () => {
      state.custom = Number(r.value);
      refreshAll();
    });
  }
  function renderPots() {
    for (const p of pots()) {
      const span = $(`span[data-pot="${p.key}"]`);
      if (span) span.querySelector("small").textContent = p.sub;
    }
    $("#customOut").textContent = fmt.gbp(state.custom);
    $("#budgetChip").textContent = "Budget: " + fmt.short(budget());
  }

  // ---------- conversions ----------
  // Each returns the number bought (n), the headline, a sentence and a pictogram.
  function compute(it, o, M) {
    const F = S.facts;
    const C = S.constants;
    const src = (s) => s;
    switch (it.key) {
      case "beef": {
        const kg = M / o.price;
        const burgers = kg / C.burger_kg;
        return { n: kg, big: fmt.count(kg), unit: "kg",
          say: [`of ${o.short} at ${fmt.price(o.price)} a kg. That is `, { b: fmt.count(burgers) },
            " quarter-pound burgers, or ", { b: fmt.years(kg / F.beef_kg_per_year) },
            " of all the beef Taste Imperial bought before it took beef off the menu in October 2024."],
          icon: ["🍔", burgers, "burger"], row: "kg of beef" };
      }
      case "cows": {
        const n = M / o.price;
        return { n, big: fmt.count(n), unit: plural(o.noun, n),
          say: [`${o.say} at about ${fmt.gbp(o.price)} each: `, { b: "one for every " + N0.format(F.students / n) },
            " Imperial students."],
          icon: ["🐄", n, "cow"], row: o.noun + "s" };
      }
      case "food": {
        const g = GENEROSITY[state.meals];
        const students = M / (o.price * g.meals);
        const times = students / F.students;
        return { n: students, big: fmt.count(students), unit: "students",
          say: [`get ${g.say}, at ${fmt.price(o.price)} a meal (${o.short}). `,
            times >= 1 ? { b: `That covers all ${N0.format(F.students)} Imperial students ${times >= 10 ? N0.format(times) : times.toFixed(1)} times over.` }
              : { b: `That is ${fmt.pct(times * 100)} of Imperial’s ${N0.format(F.students)} students.` }],
          icon: ["🧑‍🎓", students, "student"], row: "students fed (" + g.meals + (g.meals === 1 ? " meal)" : " meals)") };
      }
      case "rent": {
        const n = M / o.price;
        return { n, big: fmt.count(n), unit: "student-years",
          say: [`of rent in ${o.short} at ${fmt.price(o.weekly)} a week for ${o.weeks} weeks (${fmt.gbp(o.price)} a year). `,
            { b: `Free rooms for ${N0.format(Math.floor(n))} students for a whole year.` }],
          icon: ["🛏️", n, "student-year"], row: "student-years of hall rent" };
      }
      case "phd": {
        const n = M / o.price;
        const funded = M / o.annual;
        return { n, big: fmt.count(n), unit: "studentships",
          say: [`fully funded ${o.years}-year PhD positions in London at ${fmt.gbp(o.annual)} a year (${o.short}). `,
            "Or one year of funding for ", { b: N0.format(Math.floor(funded)) + " PhD students" }, "."],
          icon: ["🎓", n, "studentship"], row: "PhD studentships" };
      }
      case "centrifuge": {
        const n = M / o.price;
        const labs = F.labs;
        const ratio = n >= labs ? `one for each of Imperial’s ${N0.format(labs)}+ labs` : `one for every ${N0.format(labs / n)} of Imperial’s ${N0.format(labs)}+ labs`;
        return { n, big: fmt.count(n), unit: plural("centrifuge", Math.floor(n)),
          say: [`${o.say} at about ${fmt.gbp(o.price)} each: `, { b: ratio }, "."],
          icon: ["🌀", n, "centrifuge"], row: o.noun };
      }
      case "cells": {
        const n = M / o.price;
        return { n, big: fmt.count(n), unit: "vials",
          say: [`of authenticated cell lines from ${o.short} at ${fmt.gbp(o.price)} a vial. A brand-new cell line every working day for `,
            { b: fmt.years(n / C.working_days) }, "."],
          icon: ["🧫", n, "vial"], row: "cell-line vials" };
      }
      case "medium": {
        const n = M / o.price;
        const h = n * C.bottle_height_m;
        const qt = S.landmarks.find((l) => l.key === "queens_tower");
        return { n, big: fmt.count(n), unit: "bottles",
          say: [`of ${o.short} (500 mL) at ${fmt.price(o.price)} each: ${N0.format(n * 0.5)} litres. Stacked, they would stand `,
            { b: N0.format(h) + " m tall" }, `, ${h / qt.m >= 10 ? N0.format(h / qt.m) : (h / qt.m).toFixed(1)} times the Queen’s Tower.`],
          icon: ["🧴", n, "bottle"], row: "bottles of " + o.noun };
      }
      case "lab": {
        const n = M / o.price;
        const pis = M / C.pi_startup_gbp;
        return { n, big: fmt.count(n), unit: "labs",
          say: [`${o.say}, sized at Imperial’s ${C.lab_m2_per_workplace} m² per lab worker and built for about ${fmt.gbp(C.lab_cost_per_m2)} per m² (${fmt.short(o.price)} each, before fittings and kit). Or `,
            { b: fmt.count(pis) + " start-up packages" }, ` for new group leaders (≈ ${fmt.short(C.pi_startup_gbp)} each).`],
          icon: ["🔬", n, "lab"], row: "new labs (" + o.m2 + " m²)" };
      }
      case "tokens": {
        const n = (M / o.price) * 1e6;
        const theses = n / (C.thesis_words * C.tokens_per_word);
        return { n, big: fmt.count(n), unit: "tokens",
          say: [`${o.say} at ${fmt.price(o.price)} per million. Enough to write `, { b: fmt.count(theses) + " PhD theses" },
            ` of ${N0.format(C.thesis_words)} words: `, { b: N0.format(theses / F.pgr) + " each" }, ` for all ${N0.format(F.pgr)} of Imperial’s research students.`],
          icon: ["🤖", n, "token"], row: o.row };
      }
      case "plus": {
        const n = M / o.price;
        const days = (n / F.students) * (365 / 12);
        return { n, big: fmt.count(n), unit: "months",
          say: [`of ${o.say} at ${fmt.price(o.price)} a month. Shared out, `, { b: `every Imperial student gets ${fmt.days(days)}` },
            `. Or one very patient PhD student keeps it for `, { b: N0.format(n / 12) + " years" }, "."],
          icon: ["💬", n, "month"], row: "months of ChatGPT Plus" };
      }
      default: {
        const n = M / o.price;
        const fun = o.fun === "per_student" ? ` That is ${(n / F.students).toFixed(1)} each for every Imperial student.`
          : o.fun === "per_lab" ? ` About ${(n / F.labs).toFixed(1)} for each of Imperial’s labs.`
            : o.fun === "projects" ? ` Enough to staff ${N0.format(Math.floor(n / 3))} three-year research projects.` : "";
        return { n, big: fmt.count(n), unit: plural(o.noun, Math.floor(n) === 1 ? 1 : 2),
          say: [`${o.say} at ${fmt.price(o.price)} each.`, fun ? { b: fun } : null],
          icon: [it.emoji, n, o.noun], row: plural(o.noun, 2) };
      }
    }
  }

  function makeSelect(id, label, labels, value, onChange) {
    const wrap = el("div", "opt");
    const lab = el("label", null, label);
    lab.htmlFor = id;
    const s = el("select");
    s.id = id;
    labels.forEach((t, i) => {
      const o = el("option", null, t);
      o.value = i;
      s.append(o);
    });
    s.value = value;
    s.addEventListener("change", () => onChange(Number(s.value)));
    wrap.append(lab, s);
    return wrap;
  }

  function drawPicto(box, keyEl, icon) {
    const [emoji, n, noun] = icon;
    let per = 1;
    while (n / per > 200) per *= 10;
    const units = n / per;
    const full = Math.floor(units + 1e-9);
    const frac = units - full;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < full; i++) frag.append(el("span", "i", emoji));
    if (frac >= 0.05) {
      const p = el("span", "i part", emoji);
      p.style.width = (frac * 1.25).toFixed(3) + "em";
      frag.append(p);
    }
    box.replaceChildren(frag);
    keyEl.textContent = per === 1 ? `Each ${emoji} = 1 ${noun}` : `Each ${emoji} = ${fmt.tick(per)} ${plural(noun, 2)}`;
  }

  function buildCard(it) {
    const host = $("#cards-" + it.group);
    const card = el("article", "conv");
    card.id = "card-" + it.key;
    const top = el("div", "top");
    top.append(el("span", "emo", it.emoji), el("span", null, it.title));
    const big = el("div", "big");
    const say = el("p", "say");
    card.append(top, big, say);
    if (it.options.length > 1) {
      card.append(makeSelect("opt-" + it.key, it.choose || "Price", it.options.map((o) => o.label), state.choice[it.key], (v) => {
        state.choice[it.key] = v;
        update();
        refreshShared();
      }));
    }
    if (it.key === "food") {
      card.append(makeSelect("opt-food-gen", "How generous?", GENEROSITY.map((g) => g.label), state.meals, (v) => {
        state.meals = v;
        update();
        refreshShared();
      }));
    }
    const picto = el("div", "picto");
    picto.setAttribute("aria-hidden", "true");
    const key = el("div", "picto-key");
    const src = el("div", "src");
    if (it.group !== "extra") card.append(picto, key);
    card.append(src);
    host.append(card);
    function update() {
      const o = opt(it);
      const r = compute(it, o, budget());
      big.replaceChildren(document.createTextNode(r.big), el("span", "unit", r.unit));
      rich(say, r.say);
      if (it.group !== "extra") drawPicto(picto, key, r.icon);
      rich(src, ["Price: ", { a: o.source, href: o.url }, o.date ? ` (${o.date})` : ""]);
    }
    updaters.push(update);
    update();
  }

  function rows() {
    const M = budget();
    return S.items.map((it) => {
      const o = opt(it);
      const r = compute(it, o, M);
      return { key: it.key, emoji: it.emoji, label: r.row, n: r.n, o, it };
    });
  }

  // ---------- tooltip ----------
  const tipEl = () => $("#tooltip");
  function showTip(target, lines) {
    const t = tipEl();
    t.replaceChildren(el("div", "tv", lines[0]), ...lines.slice(1).map((l) => el("div", "tl", l)));
    t.hidden = false;
    const r = target.getBoundingClientRect();
    const w = t.offsetWidth;
    const h = t.offsetHeight;
    let x = r.left + r.width / 2 - w / 2;
    x = Math.max(8, Math.min(window.innerWidth - w - 8, x));
    let y = r.top - h - 10;
    if (y < 8) y = r.bottom + 10;
    t.style.left = x + "px";
    t.style.top = y + "px";
  }
  function tip(node, lines) {
    node.addEventListener("pointerenter", () => showTip(node, lines()));
    node.addEventListener("focus", () => showTip(node, lines()));
    node.addEventListener("pointerleave", hideTip);
    node.addEventListener("blur", hideTip);
  }
  function hideTip() { tipEl().hidden = true; }
  window.addEventListener("scroll", hideTip, { passive: true });

  // ---------- dot plot (log scale) ----------
  function drawDotplot() {
    const host = $("#dotplot");
    const data = rows().filter((r) => r.n > 0).sort((a, b) => b.n - a.n);
    const lo = Math.floor(Math.log10(Math.min(...data.map((d) => d.n))));
    const hi = Math.ceil(Math.log10(Math.max(...data.map((d) => d.n))));
    const span = Math.max(1, hi - lo);
    const pos = (v) => ((Math.log10(v) - lo) / span) * 100;
    const narrow = host.clientWidth < 600;
    host.replaceChildren();
    for (const d of data) {
      const row = el("div", "dp-row");
      const lab = el("div", "dp-label", `${d.emoji} ${d.label}`);
      lab.title = d.label;
      const track = el("div", "dp-track");
      for (let e = lo; e <= hi; e++) {
        const g = el("div", "dp-grid");
        g.style.left = ((e - lo) / span) * 100 + "%";
        track.append(g);
      }
      const p = pos(d.n);
      const dot = el("div", "dp-dot");
      dot.style.left = p + "%";
      dot.tabIndex = 0;
      dot.setAttribute("role", "img");
      dot.setAttribute("aria-label", `${d.label}: ${fmt.count(d.n)}`);
      tip(dot, () => [fmt.count(d.n), d.label, `at ${fmt.price(d.o.price)} ${d.o.per || "each"}`]);
      const val = el("div", "dp-val", fmt.count(d.n));
      if (p > 72) val.style.right = `calc(${100 - p}% + 12px)`;
      else val.style.left = `calc(${p}% + 12px)`;
      track.append(dot, val);
      row.append(lab, track);
      host.append(row);
    }
    const axis = el("div", "dp-axis");
    const ticks = el("div", "dp-ticks");
    for (let e = lo; e <= hi; e++) {
      if (narrow && span > 6 && (e - lo) % 2 === 1) continue;
      const t = el("span", null, fmt.tick(Math.pow(10, e)));
      t.style.left = ((e - lo) / span) * 100 + "%";
      if (e === hi) t.style.transform = "translateX(-100%)";
      ticks.append(t);
    }
    axis.append(el("div"), ticks);
    host.append(axis);
  }

  // ---------- skyline: the stack of medium bottles against London landmarks ----------
  function drawSkyline() {
    const it = item("medium");
    const o = opt(it);
    const bottles = budget() / o.price;
    const H = bottles * S.constants.bottle_height_m;
    // The two landmarks just below the stack, the next one above it, and always the Queen's Tower.
    const lms = S.landmarks.slice().sort((a, b) => a.m - b.m);
    const shown = lms.filter((l) => l.m < H).slice(-2);
    const next = lms.find((l) => l.m >= H);
    if (next) shown.push(next);
    const qt = lms.find((l) => l.key === "queens_tower");
    if (!shown.includes(qt)) shown.unshift(qt);
    const cols = [...shown.map((l) => ({ name: l.name, m: l.m })), { name: "The stack", m: H, hot: true }].sort((a, b) => a.m - b.m);
    const max = Math.max(...cols.map((c) => c.m));
    const host = $("#skyline");
    const avail = Math.max(60, host.clientHeight - 34 - 22);
    host.replaceChildren();
    const names = el("div", "sky-names");
    for (const c of cols) {
      const col = el("div", "sky-col");
      const bar = el("div", "sky-bar" + (c.hot ? " hot" : ""));
      bar.style.height = Math.max(2, (c.m / max) * avail) + "px";
      col.append(el("div", "sky-val", N0.format(c.m) + " m"), bar);
      host.append(col);
      names.append(el("div", null, c.name));
    }
    host.nextElementSibling?.classList.contains("sky-names") && host.nextElementSibling.remove();
    host.after(names);
    host.setAttribute("aria-label", cols.map((c) => `${c.name}: ${N0.format(c.m)} m`).join("; "));
    rich($("#stackSub"), [`${fmt.count(bottles)} bottles of ${o.noun}, each about ${Math.round(S.constants.bottle_height_m * 100)} cm tall, stacked one on top of another and drawn to scale next to some landmarks.`]);
  }

  // ---------- picture tiles ----------
  function renderPictureTiles() {
    const M = budget();
    const F = S.facts;
    const perHour = F.income / (365 * 24);
    const meal = item("food").options[0].price;
    const tiles = [
      { l1: "Per Imperial student", v: fmt.gbp2(M / F.students), l: `About ${Math.round(M / F.students / meal)} campus hot meals each, shared across ${N0.format(F.students)} students.` },
      { l1: "Imperial earns it back in", v: fmt.duration(M / perHour), l: `At its ${F.income_year} income of ${fmt.short(F.income)} a year, about ${fmt.gbp(perHour)} an hour.` },
      { l1: "Share of a year’s income", v: fmt.pct((M / F.income) * 100), l: `Of ${fmt.short(F.income)} (${F.income_year}). Small for Imperial, large for a lab.` },
      { l1: "Per petition signature", v: fmt.gbp(M / F.petition_signatures), l: `${N0.format(F.petition_signatures)}+ people signed the petition to replace the logo.` },
    ];
    $("#pictureTiles").replaceChildren(...tiles.map((t) => {
      const d = el("div", "tile");
      d.append(el("div", "l1", t.l1), el("div", "v", t.v), el("div", "l", t.l));
      return d;
    }));
  }

  // ---------- basket ----------
  function buildBasket() {
    const list = $("#basketList");
    for (const b of S.basket) {
      state.basket[b.key] = 0;
      const row = el("div", "b-row");
      const nm = el("div", "nm", b.name);
      nm.append(el("small", null, `${fmt.price(b.price)} ${b.per}`));
      const step = el("div", "stepper");
      const minus = el("button", null, "−");
      minus.type = "button";
      minus.setAttribute("aria-label", "Remove one: " + b.name);
      const inp = el("input");
      inp.type = "number";
      inp.min = 0;
      inp.step = 1;
      inp.value = 0;
      inp.inputMode = "numeric";
      inp.setAttribute("aria-label", "Quantity: " + b.name);
      inp.id = "bq-" + b.key;
      const plus = el("button", null, "+");
      plus.type = "button";
      plus.setAttribute("aria-label", "Add one: " + b.name);
      const set = (q) => {
        state.basket[b.key] = Math.max(0, Math.floor(Number(q) || 0));
        updateBasket();
      };
      minus.addEventListener("click", () => set(state.basket[b.key] - 1));
      plus.addEventListener("click", () => set(state.basket[b.key] + 1));
      inp.addEventListener("change", () => set(inp.value));
      step.append(minus, inp, plus);
      const sub = el("div", "sub");
      sub.id = "bs-" + b.key;
      row.append(el("div", "emo", b.emoji), nm, step, sub);
      list.append(row);
    }
    $("#basketReset").addEventListener("click", () => {
      for (const k in state.basket) state.basket[k] = 0;
      updateBasket();
    });
    $("#basketPhd").addEventListener("click", () => {
      for (const k in state.basket) state.basket[k] = 0;
      for (const [k, q] of Object.entries(S.basket_presets.phd)) state.basket[k] = q;
      updateBasket();
    });
    $("#basketRandom").addEventListener("click", () => {
      for (const k in state.basket) state.basket[k] = 0;
      let left = budget();
      const pool = S.basket.slice();
      for (let guard = 0; guard < 400 && pool.length; guard++) {
        const i = Math.floor(Math.random() * pool.length);
        const b = pool[i];
        const can = Math.floor(left / b.price);
        if (can < 1) {
          pool.splice(i, 1);
          continue;
        }
        const q = Math.max(1, Math.floor(Math.random() * Math.min(can, Math.max(1, can * 0.35))));
        state.basket[b.key] += q;
        left -= q * b.price;
      }
      updateBasket();
    });
  }

  function updateBasket() {
    const M = budget();
    let spent = 0;
    for (const b of S.basket) {
      const q = state.basket[b.key];
      spent += q * b.price;
      $("#bq-" + b.key).value = q;
      $("#bs-" + b.key).textContent = q ? fmt.gbp(q * b.price) : "";
    }
    const over = spent > M + 0.005;
    const meter = $("#basketMeter");
    meter.classList.toggle("over", over);
    meter.setAttribute("aria-valuemax", Math.round(M));
    meter.setAttribute("aria-valuenow", Math.round(spent));
    $("#basketFill").style.width = Math.min(100, (spent / M) * 100) + "%";
    $("#basketSpent").textContent = fmt.gbp(spent);
    $("#basketOf").textContent = "of " + fmt.gbp(M);
    const left = $("#basketLeft");
    left.classList.toggle("over", over);
    if (over) {
      left.replaceChildren(el("span", "ico", "!"), document.createTextNode(`Over budget by ${fmt.gbp(spent - M)}`));
    } else {
      const rest = M - spent;
      const fit = S.basket.filter((b) => b.price <= rest).sort((a, b) => b.price - a.price)[0];
      const k = fit ? Math.floor(rest / fit.price) : 0;
      const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);
      left.textContent = !fit ? `${fmt.gbp(rest)} left`
        : k === 1 ? `${fmt.gbp(rest)} left: still enough for ${lower(fit.name)}`
          : `${fmt.gbp(rest)} left: still enough for ${N0.format(k)} more ${fit.unit}`;
    }
  }

  // ---------- plot twist: two rebrands, then and now ----------
  function drawDumbbell() {
    const b = S.budget;
    const data = [
      { label: "2002 rebrand", sub: "“Imperial College London” logotype", then: b.rebrand2002, now: b.rebrand2002_real_today, when: "2002–03" },
      { label: "2024 refresh", sub: "“Imperial” wordmark", then: b.official, now: b.real_today, when: "2024" },
    ];
    const max = Math.ceil((Math.max(...data.map((d) => Math.max(d.then, d.now))) * 1.05) / 1e5) * 1e5;
    const x = (v) => (v / max) * 100;
    const host = $("#dumbbell");
    host.replaceChildren();
    for (const d of data) {
      const row = el("div", "db-row");
      const lab = el("div", "db-label", d.label);
      lab.append(el("small", null, d.sub));
      const track = el("div", "db-track");
      for (let v = 0; v <= max; v += 1e5) {
        const g = el("div", "db-gridline");
        g.style.left = x(v) + "%";
        track.append(g);
      }
      const line = el("div", "db-line");
      line.style.left = x(Math.min(d.then, d.now)) + "%";
      line.style.width = x(Math.abs(d.now - d.then)) + "%";
      const a = el("div", "db-dot then");
      a.style.left = x(d.then) + "%";
      a.tabIndex = 0;
      a.setAttribute("aria-label", `${d.label}, paid at the time (${d.when}): ${fmt.gbp(d.then)}`);
      tip(a, () => [fmt.gbp(d.then), `${d.label}: paid at the time (${d.when})`]);
      const c = el("div", "db-dot now");
      c.style.left = x(d.now) + "%";
      c.tabIndex = 0;
      c.setAttribute("aria-label", `${d.label}, in ${b.cpi_to_label} prices: ${fmt.gbp(d.now)}`);
      tip(c, () => [fmt.gbp(d.now), `${d.label}: in ${b.cpi_to_label} prices`]);
      const va = el("div", "db-val below", fmt.short(d.then));
      va.style.left = x(d.then) + "%";
      const vc = el("div", "db-val above", fmt.short(d.now));
      vc.style.left = x(d.now) + "%";
      track.append(line, a, c, va, vc);
      row.append(lab, track);
      host.append(row);
    }
    const axis = el("div", "db-axis");
    const ticks = el("div", "db-ticks");
    const narrow = host.clientWidth < 520;
    for (let v = 0; v <= max; v += 1e5) {
      if (narrow && (v / 1e5) % 2 === 1) continue;
      const t = el("span", null, v === 0 ? "£0" : "£" + v / 1e3 + "k");
      t.style.left = x(v) + "%";
      if (v + 1e5 > max) t.style.transform = "translateX(-100%)";
      ticks.append(t);
    }
    axis.append(el("div"), ticks);
    host.append(axis);

    const lg = $("#twistLegend");
    const k1 = el("span", "key");
    const d1 = el("span", "dotkey");
    d1.style.background = "var(--seq250)";
    k1.append(d1, document.createTextNode("Paid at the time"));
    const k2 = el("span", "key");
    const d2 = el("span", "dotkey");
    d2.style.background = "var(--s1)";
    k2.append(d2, document.createTextNode(`In ${b.cpi_to_label} prices`));
    lg.replaceChildren(k1, k2);
  }

  // ---------- table view ----------
  function renderTable() {
    const t = $("#convTable");
    const M = budget();
    const head = el("thead");
    const hr = el("tr");
    [["Item", ""], ["Price basis", ""], ["Unit price", "num"], ["How many", "num"], ["Source", ""]].forEach(([h, c]) => hr.append(el("th", c, h)));
    head.append(hr);
    const body = el("tbody");
    for (const r of rows()) {
      const tr = el("tr");
      const src = el("td");
      rich(src, [{ a: r.o.source, href: r.o.url }, r.o.date ? ` (${r.o.date})` : ""]);
      tr.append(el("td", null, `${r.emoji} ${r.label}`), el("td", null, r.o.label), el("td", "num", `${fmt.price(r.o.price)} ${r.o.per || "each"}`), el("td", "num", fmt.count(r.n)), src);
      body.append(tr);
    }
    const cap = el("caption");
    cap.className = "muted";
    cap.style.textAlign = "left";
    cap.style.captionSide = "bottom";
    cap.style.paddingTop = "8px";
    cap.textContent = `Budget: ${fmt.gbp(M)}. “How many” = budget ÷ unit price (special cases explained above and in CALCULATIONS.md).`;
    t.replaceChildren(head, body, cap);
  }

  // ---------- did it work? ----------
  // Effects are in log points (0.05 ≈ +5%). The posterior maths repeats src/logowhatif/impact.py.
  const IM = { prior: "open", m: 0, s: 0.1, twin: "attention", bayes: "pooled" };
  const GRID_N = 4001;
  const GRIDX = Array.from({ length: GRID_N }, (_, i) => -2 + (4 * i) / (GRID_N - 1));
  const METHOD_KEYS = ["its", "did", "scm", "bsc"];
  const METHOD_SHORT = { its: "Imperial's own trend", did: "Difference-in-differences", scm: "Synthetic control", bsc: "Bayesian synthetic control" };
  const METHOD_COLOR = { its: "var(--s1)", did: "var(--s2)", scm: "var(--s3)", bsc: "var(--s4)" };
  const FLAT_SD = 10;
  const SVGNS = "http://www.w3.org/2000/svg";

  const toPct = (x) => Math.expm1(x) * 100;
  function signed(v, d) {
    const r = Math.abs(v).toFixed(d);
    return (Number(r) === 0 ? "" : v > 0 ? "+" : "−") + r;
  }
  const pctTxt = (x, d) => {
    const v = toPct(x);
    return signed(v, d ?? (Math.abs(v) < 9.95 ? 1 : 0)) + "%";
  };
  const probTxt = (p) => (p > 0.995 ? ">99%" : p < 0.005 ? "<1%" : Math.round(p * 100) + "%");
  // "14% above" / "3.8% below": a gap in words
  const relTxt = (x) => {
    const v = toPct(x);
    const r = Math.abs(v).toFixed(Math.abs(v) < 9.95 ? 1 : 0);
    return Number(r) === 0 ? "level with" : `${r}% ${v > 0 ? "above" : "below"}`;
  };
  function svg(tag, attrs, parent) {
    const n = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v);
    if (parent) parent.append(n);
    return n;
  }
  function svgText(parent, x, y, text, cls, anchor) {
    const t = svg("text", { x, y, class: cls || "tick", "text-anchor": anchor || "middle" }, parent);
    t.textContent = text;
    return t;
  }

  // Student-t and normal densities (Lanczos log-gamma), on the same grid as the Python model.
  function lgamma(z) {
    const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
      12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
    z -= 1;
    let x = c[0];
    for (let i = 1; i < 9; i++) x += c[i] / (z + i);
    const t = z + 7.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
  }
  const tpdf = (x, df) => Math.exp(lgamma((df + 1) / 2) - lgamma(df / 2) - 0.5 * Math.log(df * Math.PI) - ((df + 1) / 2) * Math.log(1 + (x * x) / df));
  const npdf = (x, m, s) => Math.exp(-0.5 * ((x - m) / s) ** 2) / (s * Math.sqrt(2 * Math.PI));
  function interp(x, xs, ys) {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
    let lo = 0;
    let hi = xs.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] <= x) lo = mid;
      else hi = mid;
    }
    const f = xs[hi] === xs[lo] ? 0 : (x - xs[lo]) / (xs[hi] - xs[lo]);
    return ys[lo] + f * (ys[hi] - ys[lo]);
  }
  // Normalise a density on the grid and summarise it.
  function summarise(dens, m, s, be) {
    let area = 0;
    const cdf = new Float64Array(GRID_N);
    for (let i = 1; i < GRID_N; i++) {
      area += ((dens[i] + dens[i - 1]) / 2) * (GRIDX[i] - GRIDX[i - 1]);
      cdf[i] = area;
    }
    for (let i = 0; i < GRID_N; i++) {
      dens[i] /= area;
      cdf[i] /= area;
    }
    const q = (p) => interp(p, cdf, GRIDX);
    const above = (x) => 1 - interp(x, GRIDX, cdf);
    return {
      dens, above, median: q(0.5), lo: q(0.025), hi: q(0.975), p_pos: above(0),
      p_be: be == null ? null : above(be),
      bf10: s >= FLAT_SD ? null : npdf(0, m, s) / interp(0, GRIDX, dens),
    };
  }
  const likAt = (lik, x) => tpdf((lik.d - x) / lik.scale, lik.df) / lik.scale;
  function posteriorFor(o, m, s) {
    const dens = new Float64Array(GRID_N);
    for (let i = 0; i < GRID_N; i++) dens[i] = likAt(o.lik, GRIDX[i]) * npdf(GRIDX[i], m, s);
    return summarise(dens, m, s, o.breakeven ? o.breakeven.log : null);
  }
  // Random-effects pooling over a grid of between-outcome spreads (omega), as in impact.pooled().
  function pooledFor(m, s) {
    const I = S.impact;
    const liks = I.pooled_keys.map((k) => I.outcomes.find((o) => o.key === k).lik);
    const d = liks.map((l) => l.d);
    const v = liks.map((l) => (l.scale ** 2 * l.df) / (l.df - 2));
    const sd0 = I.omega_sd;
    const comps = [];
    for (let i = 0; i < 161; i++) {
      const om = (4 * sd0 * i) / 160;
      const dk = v.map((x) => x + om * om);
      const a = dk.reduce((acc, x) => acc + 1 / x, 0);
      const prec = 1 / s ** 2 + a;
      const mu = (m / s ** 2 + d.reduce((acc, x, k) => acc + x / dk[k], 0)) / prec;
      const r = d.map((x) => x - m);
      const sr = r.reduce((acc, x, k) => acc + x / dk[k], 0);
      const quad = r.reduce((acc, x, k) => acc + (x * x) / dk[k], 0) - (s ** 2 * sr * sr) / (1 + s ** 2 * a);
      const logdet = dk.reduce((acc, x) => acc + Math.log(x), 0) + Math.log(1 + s ** 2 * a);
      const lw = -0.5 * (quad + logdet) + Math.log(Math.sqrt(2 / Math.PI) / sd0) - (om * om) / (2 * sd0 * sd0);
      comps.push({ mu, sd: Math.sqrt(1 / prec), lw });
    }
    const top = Math.max(...comps.map((c) => c.lw));
    const tot = comps.reduce((acc, c) => acc + Math.exp(c.lw - top), 0);
    const dens = new Float64Array(GRID_N);
    for (const c of comps) {
      const w = Math.exp(c.lw - top) / tot;
      if (w < 1e-12) continue;
      for (let i = 0; i < GRID_N; i++) dens[i] += w * npdf(GRIDX[i], c.mu, c.sd);
    }
    return summarise(dens, m, s, null);
  }
  function priorNow() {
    const p = S.impact.priors[IM.prior];
    if (IM.prior === "flat") return { m: 0, s: FLAT_SD, label: "Data only" };
    if (IM.prior === "custom") return { m: IM.m, s: IM.s, label: "Your own" };
    return { m: p.m, s: p.s, label: p.label };
  }
  let postCache = null;
  function posteriors() {
    const key = `${IM.prior}|${IM.m}|${IM.s}`;
    if (postCache && postCache.key === key) return postCache;
    const { m, s } = priorNow();
    const out = { key, pooled: pooledFor(m, s) };
    for (const o of S.impact.outcomes) out[o.key] = posteriorFor(o, m, s);
    postCache = out;
    return out;
  }
  const outcome = (key) => S.impact.outcomes.find((o) => o.key === key);
  function verdictOf(p) {
    if (p.lo > 0) return { word: "Up", ar: "▲" };
    if (p.hi < 0) return { word: "Down", ar: "▼" };
    if (p.p_pos >= 0.8) return { word: "No clear change, leans up", ar: "●" };
    if (p.p_pos <= 0.2) return { word: "No clear change, leans down", ar: "●" };
    return { word: "No clear change", ar: "●" };
  }
  function bfWords(bf) {
    if (bf == null) return "not defined without a prior";
    if (bf >= 10) return "strong evidence of an effect";
    if (bf >= 3) return "moderate evidence of an effect";
    if (bf > 1 / 3) return "no real evidence either way";
    if (bf > 1 / 10) return "moderate evidence of no effect";
    return "strong evidence of no effect";
  }

  // Verdict tiles: one per claim, from the placebo-calibrated Bayesian model under the chosen prior.
  const VERDICTS = [
    { claim: "All four claims together", pooled: true, measure: "Average effect across outcomes" },
    { claim: "Students", key: "applicants", measure: "Undergraduate applicants" },
    { claim: "Students from abroad", key: "intl_applicants", measure: "International applicants" },
    { claim: "Funding", key: "wellcome", measure: "Wellcome grant money" },
    { claim: "Partners", key: "innovate", measure: "Innovate UK industry projects" },
    { claim: "Attention", key: "attention", measure: "Wikipedia page views" },
    { claim: "Staff", untested: true },
  ];
  function renderVerdicts() {
    const P = posteriors();
    const host = $("#verdictTiles");
    host.replaceChildren();
    for (const v of VERDICTS) {
      const t = el("div", "tile" + (v.untested ? " untested" : "") + (v.pooled ? " pooled" : ""));
      if (v.untested) {
        t.append(el("div", "l1", "Staff"), el("div", "v", "Not tested"),
          el("div", "l", "We found no open source that counts staff the same way at every university and can be downloaded by a script. HESA's staff record would do, but its site blocks automated downloads."));
        host.append(t);
        continue;
      }
      const p = v.pooled ? P.pooled : P[v.key];
      const vd = verdictOf(p);
      const pill = el("span", "verdict");
      pill.append(el("span", "ar", vd.ar), document.createTextNode(vd.word));
      t.append(
        el("div", "l1", v.claim),
        el("div", "measure", v.measure),
        el("div", "v", pctTxt(p.median)),
        el("div", "l", `95% range ${pctTxt(p.lo)} to ${pctTxt(p.hi)}`),
        el("div", "l", `Chance it helped: ${probTxt(p.p_pos)}`),
        pill,
      );
      host.append(t);
    }
    const pr = priorNow();
    rich($("#verdictNote"), [
      "Effect = how much higher Imperial is than it would have been without the new brand, from the Bayesian model calibrated on placebo rebrands, starting from the ",
      { b: `“${pr.label}”` },
      " belief. The data are weak, so a confident starting belief mostly survives them. ",
      { a: "Try another starting belief", href: "#bayesCard" },
      ".",
    ]);
  }

  // Forest plot: every method's estimate for every outcome.
  const FP_LO = Math.log(0.15);
  const FP_HI = Math.log(3);
  const FP_TICKS = [-0.8, -0.5, -0.25, 0, 0.25, 0.5, 1, 2];
  const fpX = (x) => ((Math.min(Math.max(x, FP_LO), FP_HI) - FP_LO) / (FP_HI - FP_LO)) * 100;
  function methodLines(o, m) {
    const r = o.methods[m];
    const lines = [pctTxt(r.est), `${METHOD_SHORT[m]}: ${o.label}`, `95% interval ${pctTxt(r.lo)} to ${pctTxt(r.hi)}`];
    if (m === "its") lines.push(`t-test p = ${r.p.toFixed(2)}`);
    if (m === "did") lines.push(`placebo p = ${r.p.toFixed(2)}`);
    if (m === "scm") lines.push(`placebo p = ${r.p.toFixed(2)} · gap ranks ${r.rank} of ${r.n}`);
    if (m === "bsc") lines.push(`P(effect > 0) = ${probTxt(r.p_pos)}`);
    return lines;
  }
  function drawForest() {
    const host = $("#forest");
    host.replaceChildren();
    const lg = $("#forestLegend");
    lg.replaceChildren(...METHOD_KEYS.map((m) => {
      const k = el("span", "key");
      const d = el("span", "dotkey");
      d.style.background = METHOD_COLOR[m];
      k.append(d, document.createTextNode(METHOD_SHORT[m]));
      return k;
    }));
    const narrow = host.clientWidth < 560;
    for (const o of S.impact.outcomes) {
      const row = el("div", "fp-row");
      const lab = el("div", "fp-label", o.label);
      lab.append(el("small", null, o.claim));
      const track = el("div", "fp-track");
      for (const t of FP_TICKS) {
        const g = el("div", t === 0 ? "fp-zero" : "fp-grid");
        g.style.left = fpX(Math.log1p(t)) + "%";
        track.append(g);
      }
      METHOD_KEYS.forEach((m, j) => {
        const r = o.methods[m];
        const y = 8 + j * 16;
        const line = el("div", "fp-line");
        line.style.top = y + "px";
        line.style.left = fpX(r.lo) + "%";
        line.style.width = Math.max(0, fpX(r.hi) - fpX(r.lo)) + "%";
        line.style.background = METHOD_COLOR[m];
        track.append(line);
        for (const [end, side] of [[r.lo, "lo"], [r.hi, "hi"]]) {
          if ((side === "lo" && end < FP_LO) || (side === "hi" && end > FP_HI)) {
            const a = el("div", "fp-arrow " + side);
            a.style.top = y + "px";
            a.style.left = (side === "lo" ? 0 : 100) + "%";
            a.style.color = METHOD_COLOR[m];
            track.append(a);
          }
        }
        const dot = el("div", "fp-dot");
        dot.style.top = y + "px";
        dot.style.left = fpX(r.est) + "%";
        dot.style.background = METHOD_COLOR[m];
        dot.tabIndex = 0;
        dot.setAttribute("role", "img");
        dot.setAttribute("aria-label", methodLines(o, m).join(", "));
        tip(dot, () => methodLines(o, m));
        track.append(dot);
      });
      row.append(lab, track);
      host.append(row);
    }
    const axis = el("div", "fp-axis");
    const ticks = el("div", "fp-ticks");
    for (const t of FP_TICKS) {
      if (narrow && (t === -0.25 || t === 0.25)) continue;
      const s = el("span", null, t === 0 ? "0" : (t > 0 ? "+" : "−") + Math.abs(t * 100) + "%");
      s.style.left = fpX(Math.log1p(t)) + "%";
      ticks.append(s);
    }
    axis.append(el("div"), ticks);
    host.append(axis);
    const at = el("div", "fp-axis");
    at.append(el("div"), el("div", "axis-title", "Effect of the brand (log scale)"));
    host.append(at);
  }
  function renderForestTable() {
    const t = $("#forestTable");
    const head = el("thead");
    const hr = el("tr");
    [["Outcome", ""], ["Method", ""], ["Effect", "num"], ["95% interval", "num"], ["p or probability", "num"]].forEach(([h, c]) => hr.append(el("th", c, h)));
    head.append(hr);
    const body = el("tbody");
    for (const o of S.impact.outcomes) {
      for (const m of METHOD_KEYS) {
        const r = o.methods[m];
        const tr = el("tr");
        const pv = m === "bsc" ? `P(>0) = ${probTxt(r.p_pos)}` : `p = ${r.p.toFixed(2)}`;
        tr.append(el("td", null, o.label), el("td", null, METHOD_SHORT[m]), el("td", "num", pctTxt(r.est)),
          el("td", "num", `${pctTxt(r.lo)} to ${pctTxt(r.hi)}`), el("td", "num", pv));
        body.append(tr);
      }
    }
    t.replaceChildren(head, body);
  }

  // Segmented outcome buttons.
  function buildSeg(host, items, current, onPick) {
    host.replaceChildren();
    for (const [key, label] of items) {
      const b = el("button", null, label);
      b.type = "button";
      b.setAttribute("aria-pressed", String(key === current()));
      b.addEventListener("click", () => {
        onPick(key);
        host.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      });
      host.append(b);
    }
  }

  function niceStep(span, target) {
    const raw = span / target;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    for (const f of [1, 2, 2.5, 5, 10]) if (raw <= f * mag) return f * mag;
    return 10 * mag;
  }
  function rawValue(o, v) {
    if (o.key === "wellcome") return fmt.short(v);
    return N0.format(v) + " " + o.noun;
  }
  function periodName(o, p) {
    if (o.key === "attention") {
      const [y, m] = p.split("-");
      return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
    }
    if (o.key === "wellcome") return `Mar ${p}–Feb ${Number(p) + 1}`;
    if (o.key === "innovate") return `Competition year ${p}`;
    return `${p} cycle`;
  }

  // Imperial against its Bayesian synthetic twin, with a crosshair tooltip.
  function drawTwin() {
    const o = outcome(IM.twin);
    const host = $("#twinChart");
    host.replaceChildren();
    const W = Math.max(280, host.clientWidth);
    const H = W < 560 ? 230 : 270;
    const M = { l: 40, r: 12, t: 22, b: 26 };
    const n = o.periods.length;
    const ix = o.index;
    const all = [...ix.y, ...ix.lo, ...ix.hi];
    const step = niceStep(Math.max(...all) - Math.min(...all), 5);
    const y0 = Math.floor(Math.min(...all) / step) * step;
    const y1 = Math.ceil(Math.max(...all) / step) * step;
    const X = (i) => M.l + (i / (n - 1)) * (W - M.l - M.r);
    const Y = (v) => H - M.b - ((v - y0) / (y1 - y0)) * (H - M.t - M.b);
    const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `${o.label}: Imperial against its synthetic twin, index with the pre-launch average at 100` }, host);
    for (let v = y0; v <= y1 + 1e-9; v += step) {
      svg("line", { x1: M.l, x2: W - M.r, y1: Y(v), y2: Y(v), class: "gridline" }, s);
      svgText(s, M.l - 6, Y(v) + 4, String(Math.round(v)), "tick", "end");
    }
    svg("line", { x1: M.l, x2: W - M.r, y1: H - M.b, y2: H - M.b, class: "axisline" }, s);
    // x ticks
    const monthly = o.key === "attention";
    const every = monthly ? (W < 560 ? 36 : 24) : W < 560 && n > 8 ? 2 : 1;
    o.periods.forEach((p, i) => {
      const show = monthly ? p.endsWith("-01") && (Number(p.slice(0, 4)) - 2016) % (every / 12) === 0 : (n - 1 - i) % every === 0;
      if (show) svgText(s, X(i), H - 8, monthly ? p.slice(0, 4) : p);
    });
    const pts = (arr) => arr.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
    svg("polygon", { points: pts(ix.hi) + " " + ix.lo.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).reverse().join(" "), class: "band" }, s);
    svg("polyline", { points: pts(ix.cf), class: "twin" }, s);
    svg("polyline", { points: pts(ix.y), class: "imperial" }, s);
    const xl = (X(o.pre[1]) + X(o.post[0])) / 2;
    svg("line", { x1: xl, x2: xl, y1: M.t - 6, y2: H - M.b, class: "launch" }, s);
    svgText(s, xl - 4, M.t - 10, "New brand", "lab strong", "end");
    // crosshair
    const cross = svg("line", { y1: M.t, y2: H - M.b, class: "cross", visibility: "hidden" }, s);
    const hd = svg("circle", { r: 5, class: "hover-dot", visibility: "hidden" }, s);
    const hit = svg("rect", { x: M.l, y: M.t, width: W - M.l - M.r, height: H - M.t - M.b, class: "hit", tabindex: 0 }, s);
    let cur = n - 1;
    const show = (i) => {
      cur = Math.max(0, Math.min(n - 1, i));
      const x = X(cur);
      cross.setAttribute("x1", x);
      cross.setAttribute("x2", x);
      hd.setAttribute("cx", x);
      hd.setAttribute("cy", Y(ix.y[cur]));
      cross.setAttribute("visibility", "visible");
      hd.setAttribute("visibility", "visible");
      const gap = Math.log(ix.y[cur] / ix.cf[cur]);
      const phase = cur >= o.post[0] ? "after the launch" : cur <= o.pre[1] ? "before the launch" : "launch month (not used)";
      showTip(hd, [`${periodName(o, o.periods[cur])}`, `Imperial: ${rawValue(o, o.imperial[cur])}`,
        `Index ${ix.y[cur].toFixed(0)} vs twin ${ix.cf[cur].toFixed(0)} (95% band ${ix.lo[cur].toFixed(0)}–${ix.hi[cur].toFixed(0)})`,
        `Gap ${pctTxt(gap)}, ${phase}`]);
    };
    const hide = () => {
      cross.setAttribute("visibility", "hidden");
      hd.setAttribute("visibility", "hidden");
      hideTip();
    };
    hit.addEventListener("pointermove", (e) => {
      const r = s.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * W;
      show(Math.round(((px - M.l) / (W - M.l - M.r)) * (n - 1)));
    });
    hit.addEventListener("pointerleave", hide);
    hit.addEventListener("focus", () => show(cur));
    hit.addEventListener("blur", hide);
    hit.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        show(cur + (e.key === "ArrowRight" ? 1 : -1));
      }
    });

    const lg = $("#twinLegend");
    const k1 = el("span", "key");
    const l1 = el("span", "linekey");
    l1.style.borderColor = "var(--s1)";
    k1.append(l1, document.createTextNode("Imperial"));
    const k2 = el("span", "key");
    const l2 = el("span", "linekey dash");
    l2.style.borderColor = "var(--ink2)";
    k2.append(l2, document.createTextNode("Synthetic twin (no new brand)"));
    const k3 = el("span", "key");
    k3.append(el("span", "bandkey"), document.createTextNode("95% credible band"));
    lg.replaceChildren(k1, k2, k3);

    rich($("#twinSub"), [{ b: o.question + " " }, o.note, " Index: Imperial's pre-launch average = 100. Source: ", { a: o.source, href: o.source_url }, "."]);
    const b = o.methods.bsc;
    const blend = o.weights.map((w) => `${w.name} ${Math.round(w.w * 100)}%`).join(", ");
    rich($("#twinNote"), [
      "After the launch Imperial was ", { b: relTxt(b.est) }, ` its Bayesian twin (95% interval ${pctTxt(b.lo)} to ${pctTxt(b.hi)}). `,
      `The twin is a regression on all ${o.n_donors} comparison universities, shrunk towards their plain average; the classic synthetic control blends ${blend}. `,
      "The band shows how sure the model is about the twin. Whether a gap like this is unusual is a different question, answered by the placebo test below.",
    ]);
    drawPlacebo(o);
  }

  // Placebo strip: every university's synthetic-control gap if it had "rebranded" on the same date.
  function drawPlacebo(o) {
    const host = $("#placeboStrip");
    host.replaceChildren();
    const pts = [...o.placebo.map((p) => ({ ...p, hot: false })), { name: "Imperial", est: o.methods.scm.est, hot: true }];
    const W = Math.max(280, host.clientWidth);
    const lo = Math.min(...pts.map((p) => p.est));
    const hi = Math.max(...pts.map((p) => p.est));
    const pad = (hi - lo) * 0.08 + 0.02;
    const x0 = lo - pad;
    const x1 = hi + pad;
    const M = { l: 12, r: 12 };
    const X = (v) => M.l + ((v - x0) / (x1 - x0)) * (W - M.l - M.r);
    // simple beeswarm: put each dot in the lowest row where it does not touch another
    const rows = [];
    const placed = [...pts].sort((a, b) => a.est - b.est).map((p) => {
      const x = X(p.est);
      let r = 0;
      while ((rows[r] || []).some((q) => Math.abs(q - x) < 13)) r++;
      (rows[r] = rows[r] || []).push(x);
      return { ...p, x, r };
    });
    const nRows = rows.length;
    const top = 34;
    const H = top + nRows * 14 + 30;
    const base = top + nRows * 14;
    const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `Synthetic-control gaps for Imperial and ${o.placebo.length} placebo universities` }, host);
    // ticks in percent
    const tk = [-0.8, -0.5, -0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3, 0.5, 1, 2].map((t) => ({ t, x: Math.log1p(t) })).filter((t) => t.x >= x0 && t.x <= x1);
    const minGap = W < 560 ? 44 : 34;
    let last = -1e9;
    for (const t of tk) {
      const x = X(t.x);
      svg("line", { x1: x, x2: x, y1: top - 8, y2: base + 4, class: t.t === 0 ? "zero" : "gridline" }, s);
      if (x - last >= minGap) {
        svgText(s, x, base + 20, t.t === 0 ? "0" : (t.t > 0 ? "+" : "−") + Math.abs(Math.round(t.t * 100)) + "%");
        last = x;
      }
    }
    for (const p of placed) {
      const y = base - 8 - p.r * 14;
      const c = svg("circle", { cx: p.x, cy: y, r: p.hot ? 7 : 6, class: "dot" + (p.hot ? " hot" : ""), tabindex: 0, role: "img", "aria-label": `${p.name}: ${pctTxt(p.est)}` }, s);
      tip(c, () => [pctTxt(p.est), p.hot ? "Imperial (new brand)" : `${p.name} (placebo)`]);
      if (p.hot) {
        svg("line", { x1: p.x, x2: p.x, y1: 16, y2: y - 9, class: "cross" }, s);
        const anchor = p.x > W - 40 ? "end" : p.x < 40 ? "start" : "middle";
        svgText(s, p.x, 12, "Imperial", "lab strong", anchor);
      }
    }
    const r = o.methods.scm;
    const bigger = r.rank - 1;
    rich($("#placeboSub"), [
      `Each dot is one university's synthetic-control gap, as if it had rebranded on the same date. Imperial's gap (${pctTxt(r.est)}) ranks `,
      { b: `${r.rank} of ${r.n}` }, ` by size: ${bigger === 0 ? "no other university" : bigger === 1 ? "one other university" : `${bigger} other universities`} drifted further. `,
      `That gives a placebo p-value of ${r.p.toFixed(2)}: ${r.p <= 0.05 ? "unusual" : "a gap like this is common at other universities"}.`,
    ]);
  }

  // Prior, likelihood and posterior for one outcome (or the pooled average).
  function buildPriorControls() {
    const host = $("#priorPots");
    const P = S.impact.priors;
    const opts = [...Object.entries(P).map(([k, p]) => [k, p.label, `${signed(p.m * 100, 0)}% ± ${Math.round(p.s * 200)}%`]),
      ["flat", "Data only", "no prior"], ["custom", "Your own", "set below"]];
    for (const [key, label, sub] of opts) {
      const lab = el("label", "pot");
      const inp = el("input");
      inp.type = "radio";
      inp.name = "prior";
      inp.value = key;
      inp.checked = key === IM.prior;
      inp.addEventListener("change", () => {
        IM.prior = key;
        renderPriorControls();
        refreshImpact();
      });
      const sp = el("span", null, label);
      sp.append(el("small", null, sub));
      lab.append(inp, sp);
      host.append(lab);
    }
    const ctr = $("#priorControls");
    const mk = (id, label, min, max, stepv, get, set) => {
      const wrap = el("div", "control");
      const lab = el("label");
      lab.htmlFor = id;
      const out = el("output");
      lab.append(document.createTextNode(label), out);
      const r = el("input");
      r.type = "range";
      r.id = id;
      r.min = min;
      r.max = max;
      r.step = stepv;
      r.value = get();
      const show = () => (out.textContent = id === "priorMean" ? signed(Number(r.value), 1) + "%" : "± " + (2 * Number(r.value)).toFixed(0) + "%");
      r.addEventListener("input", () => {
        set(Number(r.value));
        show();
        renderPriorControls();
        refreshImpact();
      });
      show();
      wrap.append(lab, r);
      return wrap;
    };
    ctr.append(
      mk("priorMean", "Your best guess", -15, 15, 0.5, () => IM.m * 100, (v) => (IM.m = v / 100)),
      mk("priorSd", "How sure (95% of belief within)", 1, 40, 0.5, () => IM.s * 100, (v) => (IM.s = v / 100)),
    );
    renderPriorControls();
  }
  function renderPriorControls() {
    $("#priorControls").hidden = IM.prior !== "custom";
    const p = S.impact.priors[IM.prior];
    const note = IM.prior === "flat"
      ? "No starting belief: the result is what the data alone say (a flat prior)."
      : IM.prior === "custom"
        ? `Your belief: most likely ${signed(IM.m * 100, 1)}%, and 95% sure it is between ${signed((IM.m - 2 * IM.s) * 100, 0)}% and ${signed((IM.m + 2 * IM.s) * 100, 0)}%.`
        : p.note;
    $("#priorNote").textContent = note;
  }
  function drawBayes() {
    const P = posteriors();
    const pooled = IM.bayes === "pooled";
    const o = pooled ? null : outcome(IM.bayes);
    const post = pooled ? P.pooled : P[IM.bayes];
    const pr = priorNow();
    const flat = IM.prior === "flat";
    const data = pooled ? pooledFor(0, FLAT_SD) : posteriorFor(o, 0, FLAT_SD);
    // x range: where any curve has mass, within -80%..+200%
    const lo = Math.max(Math.log(0.2), Math.min(data.lo, post.lo, flat ? 0 : pr.m - 2.6 * pr.s) - 0.05);
    const hi = Math.min(Math.log(3), Math.max(data.hi, post.hi, flat ? 0 : pr.m + 2.6 * pr.s) + 0.05);
    const host = $("#bayesChart");
    host.replaceChildren();
    const W = Math.max(280, host.clientWidth);
    const H = W < 560 ? 200 : 240;
    const M = { l: 12, r: 12, t: 22, b: 28 };
    const X = (v) => M.l + ((v - lo) / (hi - lo)) * (W - M.l - M.r);
    const sel = [];
    for (let i = 0; i < GRID_N; i += 4) if (GRIDX[i] >= lo && GRIDX[i] <= hi) sel.push(i);
    const priorD = sel.map((i) => (flat ? 0 : npdf(GRIDX[i], pr.m, pr.s)));
    const dataD = sel.map((i) => data.dens[i]);
    const postD = sel.map((i) => post.dens[i]);
    const ymax = Math.max(...priorD, ...dataD, ...postD) * 1.08;
    const Y = (v) => H - M.b - (v / ymax) * (H - M.t - M.b);
    const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `Prior, data and posterior for ${pooled ? "the average brand effect" : o.label}` }, host);
    const tk = [-0.8, -0.6, -0.5, -0.4, -0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3, 0.5, 1, 2].filter((t) => Math.log1p(t) >= lo && Math.log1p(t) <= hi);
    let last = -1e9;
    for (const t of tk) {
      const x = X(Math.log1p(t));
      if (x - last < (W < 560 ? 42 : 36)) continue;
      last = x;
      svg("line", { x1: x, x2: x, y1: M.t, y2: H - M.b, class: t === 0 ? "zero" : "gridline" }, s);
      svgText(s, x, H - 8, t === 0 ? "0" : (t > 0 ? "+" : "−") + Math.round(Math.abs(t) * 100) + "%");
    }
    svg("line", { x1: M.l, x2: W - M.r, y1: H - M.b, y2: H - M.b, class: "axisline" }, s);
    const path = (arr) => sel.map((i, k) => `${k ? "L" : "M"}${X(GRIDX[i]).toFixed(1)},${Y(arr[k]).toFixed(1)}`).join("");
    svg("path", { d: path(postD) + `L${X(GRIDX[sel[sel.length - 1]]).toFixed(1)},${Y(0)}L${X(GRIDX[sel[0]]).toFixed(1)},${Y(0)}Z`, class: "postfill" }, s);
    if (!flat) svg("path", { d: path(priorD), class: "prior" }, s);
    svg("path", { d: path(dataD), class: "like" }, s);
    svg("path", { d: path(postD), class: "post" }, s);
    const be = o && o.breakeven ? o.breakeven.log : null;
    if (be != null && be > lo && be < hi) {
      svg("line", { x1: X(be), x2: X(be), y1: M.t - 4, y2: H - M.b, class: "bkeven" }, s);
      svgText(s, X(be) + 4, M.t - 8, "pays for itself", "lab", "start");
    }
    // crosshair: chance the effect is above x
    const cross = svg("line", { y1: M.t, y2: H - M.b, class: "cross", visibility: "hidden" }, s);
    const hd = svg("circle", { r: 5, class: "hover-dot", visibility: "hidden" }, s);
    const hit = svg("rect", { x: M.l, y: M.t, width: W - M.l - M.r, height: H - M.t - M.b, class: "hit", tabindex: 0 }, s);
    let cur = 0;
    const show = (xv) => {
      cur = Math.max(lo, Math.min(hi, xv));
      const x = X(cur);
      cross.setAttribute("x1", x);
      cross.setAttribute("x2", x);
      hd.setAttribute("cx", x);
      hd.setAttribute("cy", Y(interp(cur, GRIDX, post.dens)));
      cross.setAttribute("visibility", "visible");
      hd.setAttribute("visibility", "visible");
      const lines = [`Effect above ${pctTxt(cur)}`, `Updated belief: ${probTxt(post.above(cur))}`, `Data alone: ${probTxt(data.above(cur))}`];
      if (!flat) lines.push(`Starting belief: ${probTxt(1 - 0.5 * (1 + erf((cur - pr.m) / (pr.s * Math.SQRT2))))}`);
      showTip(hd, lines);
    };
    const hide = () => {
      cross.setAttribute("visibility", "hidden");
      hd.setAttribute("visibility", "hidden");
      hideTip();
    };
    hit.addEventListener("pointermove", (e) => {
      const r = s.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * W;
      show(lo + ((px - M.l) / (W - M.l - M.r)) * (hi - lo));
    });
    hit.addEventListener("pointerleave", hide);
    hit.addEventListener("focus", () => show(cur));
    hit.addEventListener("blur", hide);
    hit.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        show(cur + (e.key === "ArrowRight" ? 0.01 : -0.01));
      }
    });

    const lg = $("#bayesLegend");
    const key = (cls, color, text) => {
      const k = el("span", "key");
      const l = el("span", "linekey" + (cls ? " " + cls : ""));
      l.style.borderColor = color;
      k.append(l, document.createTextNode(text));
      return k;
    };
    const keys = [];
    if (!flat) keys.push(key("dash", "var(--ink2)", `Starting belief (${pr.label})`));
    keys.push(key("", "var(--s2)", "What the data say"), key("", "var(--s1)", "Updated belief"));
    lg.replaceChildren(...keys);

    const tiles = $("#bayesTiles");
    tiles.replaceChildren();
    const tile = (l1, v, l) => {
      const t = el("div", "tile");
      t.append(el("div", "l1", l1), el("div", "v", v));
      if (l) t.append(el("div", "l", l));
      tiles.append(t);
    };
    tile("Updated estimate", pctTxt(post.median), `95% credible range ${pctTxt(post.lo)} to ${pctTxt(post.hi)}`);
    tile("Chance the brand helped", probTxt(post.p_pos), "Probability that the effect is above zero");
    if (post.p_be != null) tile("Chance it paid for itself", probTxt(post.p_be), `Effect above ${pctTxt(be, 2)} for one year`);
    tile("Bayes factor for an effect", post.bf10 == null ? "–" : post.bf10.toFixed(2), post.bf10 == null ? "Needs a starting belief" : bfWords(post.bf10));
  }
  function erf(x) {
    // Abramowitz and Stegun 7.1.26
    const s = Math.sign(x);
    const a = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * a);
    const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
    return s * y;
  }

  // Break-even against the smallest effect the placebo-calibrated test could detect.
  function drawPower() {
    const host = $("#powerChart");
    host.replaceChildren();
    const lo = Math.log10(0.05);
    const hi = Math.log10(500);
    const X = (pctv) => ((Math.log10(pctv) - lo) / (hi - lo)) * 100;
    for (const o of S.impact.outcomes) {
      const row = el("div", "pw-row");
      const lab = el("div", "pw-label", o.label);
      lab.append(el("small", null, o.claim));
      const track = el("div", "pw-track");
      for (let e = -1; e <= 2; e++) {
        const g = el("div", "fp-grid");
        g.style.left = X(Math.pow(10, e)) + "%";
        track.append(g);
      }
      const mde = toPct(o.mde);
      const be = o.breakeven ? toPct(o.breakeven.log) : null;
      if (be != null) {
        const line = el("div", "pw-line");
        line.style.left = X(be) + "%";
        line.style.width = X(mde) - X(be) + "%";
        track.append(line);
        const d = el("div", "pw-mark be");
        d.style.left = X(be) + "%";
        d.tabIndex = 0;
        const beLines = () => [fmt.pct(be), `Enough to pay for the brand: ${o.label}`, o.breakeven.basis];
        d.setAttribute("aria-label", beLines().join(", "));
        tip(d, beLines);
        const v = el("div", "pw-val below", fmt.pct(be));
        v.style.left = X(be) + "%";
        track.append(d, v);
      } else {
        const none = el("div", "pw-none", "no money value");
        none.style.left = "2px";
        track.append(none);
      }
      const c = el("div", "pw-mark mde");
      c.style.left = X(mde) + "%";
      c.tabIndex = 0;
      const mdeLines = () => [fmt.pct(mde), `Smallest effect the data could reliably detect: ${o.label}`, `${Math.round(S.impact.power * 100)}% power, 5% false alarms`];
      c.setAttribute("aria-label", mdeLines().join(", "));
      tip(c, mdeLines);
      const v = el("div", "pw-val above", fmt.pct(mde));
      v.style.left = X(mde) + "%";
      track.append(c, v);
      row.append(lab, track);
      host.append(row);
    }
    const axis = el("div", "fp-axis");
    const ticks = el("div", "fp-ticks");
    for (const t of [0.1, 1, 10, 100]) {
      const s = el("span", null, (t < 1 ? t.toFixed(1) : t) + "%");
      s.style.left = X(t) + "%";
      ticks.append(s);
    }
    axis.append(el("div"), ticks);
    host.append(axis);
    const at = el("div", "fp-axis");
    at.append(el("div"), el("div", "axis-title", "Size of effect (log scale)"));
    host.append(at);

    const lg = $("#powerLegend");
    const k1 = el("span", "key");
    const d1 = el("span", "diakey");
    d1.style.background = "var(--s3)";
    k1.append(d1, document.createTextNode("Enough to pay for the brand (one year)"));
    const k2 = el("span", "key");
    const d2 = el("span", "dotkey");
    d2.style.background = "var(--s1)";
    k2.append(d2, document.createTextNode("Smallest effect the data could reliably detect"));
    lg.replaceChildren(k1, k2);

    const ia = outcome("intl_applicants");
    const wc = outcome("wellcome");
    const ratio = toPct(ia.mde) / toPct(ia.breakeven.log);
    rich($("#powerSub"), [
      "To pay for itself, the brand only had to lift international applications, and with them Imperial's international intake, by ",
      { b: fmt.pct(toPct(ia.breakeven.log)) },
      ` (about ${Math.round(ia.breakeven.student_years)} student-years at ${fmt.gbp(S.impact.fee.overseas_ug_fee_gbp)} a year), or its Wellcome money by `,
      { b: fmt.pct(toPct(wc.breakeven.log)) },
      " for one year. The smallest change these data could reliably pick up is ",
      { b: fmt.pct(toPct(ia.mde)) },
      ` for international applicants, about ${Math.round(ratio)} times bigger. So the data were never going to show whether the brand paid for itself.`,
    ]);
  }

  // Plain-language summary, from the numbers.
  function fillImpactSummary() {
    const I = S.impact;
    const ap = outcome("applicants");
    const ia = outcome("intl_applicants");
    const wc = outcome("wellcome");
    const iu = outcome("innovate");
    const at = outcome("attention");
    const open = I.priors.open;
    const pool = pooledFor(open.m, open.s);
    const n = (k) => (k === 0 ? "none" : k === 1 ? "one" : String(k));
    rich($("#sumStudents"), [
      { b: "Students: no sign of a change. " },
      `In the 2025 UCAS cycle, the first after the launch, Imperial had ${N0.format(ap.imperial_post)} undergraduate applicants, ${relTxt(ap.methods.scm.est)} its synthetic twin. International applicants were ${relTxt(ia.methods.scm.est)} theirs. `,
      `Gaps that size are routine: ${n(ap.methods.scm.rank - 1)} and ${n(ia.methods.scm.rank - 1)} of the ${ap.n_donors} comparison universities drifted further.`,
    ]);
    rich($("#sumMoney"), [
      { b: "Funding and partners: too noisy to call. " },
      `Wellcome money is so lumpy that only a change of about ${fmt.pct(toPct(wc.mde))} would stand out. `,
      `Imperial joined ${iu.imperial.slice(iu.post[0], iu.post[1] + 1).join(" and ")} Innovate UK industry projects in the two competition years after the launch, ${relTxt(iu.methods.scm.est)} its twin. But ${n(iu.methods.scm.rank - 1)} of the ${iu.n_donors} comparison universities saw bigger gaps, and the latest year is still being filled in.`,
    ]);
    rich($("#sumAttention"), [
      { b: "Attention: the one hopeful sign. " },
      `Since the launch, Imperial's Wikipedia article has had ${Math.abs(toPct(at.methods.scm.est)).toFixed(0)}% ${at.methods.scm.est >= 0 ? "more" : "fewer"} readers than its synthetic twin. Yet ${n(at.methods.scm.rank - 1)} other universities drifted further, and Imperial's jump to second in the QS World University Rankings in June 2024 would draw readers too.`,
    ]);
    rich($("#sumAll"), [
      { b: "Altogether: " },
      `starting from an open mind, the best estimate of the brand's average effect is ${pctTxt(pool.median)} (95% range ${pctTxt(pool.lo)} to ${pctTxt(pool.hi)}). That is a ${probTxt(pool.p_pos)} chance that it helped at all, close to a coin toss. `,
      "The data neither show that the £434,801 paid for itself nor rule it out. What you conclude depends mostly on what you believed before.",
    ]);
  }

  function refreshImpact() {
    postCache = null;
    renderVerdicts();
    drawBayes();
  }
  function buildImpact() {
    if (!S.impact) return;
    document.querySelectorAll('[data-k="launchLabel"]').forEach((n) => (n.textContent = S.impact.launch_label));
    const tabs = S.impact.outcomes.map((o) => [o.key, o.short]);
    buildSeg($("#outcomeTabs"), tabs, () => IM.twin, (k) => {
      IM.twin = k;
      drawTwin();
    });
    buildSeg($("#bayesTabs"), [["pooled", "All four together"], ...tabs], () => IM.bayes, (k) => {
      IM.bayes = k;
      drawBayes();
    });
    buildPriorControls();
    renderForestTable();
    fillImpactSummary();
    drawImpactCharts();
    renderVerdicts();
  }
  function drawImpactCharts() {
    if (!S.impact) return;
    drawForest();
    drawTwin();
    drawBayes();
    drawPower();
  }

  // ---------- orchestration ----------
  function refreshShared() {
    drawDotplot();
    drawSkyline();
    renderTable();
  }
  function refreshAll() {
    renderPots();
    for (const u of updaters) u();
    renderPictureTiles();
    refreshShared();
    updateBasket();
  }

  function fillText() {
    const b = S.budget;
    const set = (k, v) => document.querySelectorAll(`[data-k="${k}"]`).forEach((n) => (n.textContent = v));
    set("rebrand2002", fmt.gbp(b.rebrand2002));
    set("rebrand2002Real", fmt.gbp(b.rebrand2002_real_today));
    set("realToday", fmt.gbp(b.real_today));
    set("bothReal", fmt.short(b.both_real_today));
    set("cpiLabel", b.cpi_to_label);
    set("twistPct", fmt.pct((b.rebrand2002_real_today / b.real_today - 1) * 100));
    set("cpi2024", b.cpi_2024.toFixed(1));
    set("cpi2002", b.cpi_2002.toFixed(1));
    set("cpiNow", b.cpi_to.toFixed(1));
    set("generated", S.meta.generated);
    $("#byline").textContent = `${S.meta.author} · Imperial College London · data generated ${S.meta.generated}`;
    $("#footCite").textContent = `Cite as: ${S.meta.author} (2026). ${S.meta.title}. ${S.meta.repo}`;
  }

  function setupTheme() {
    const btn = $("#themeBtn");
    const root = document.documentElement;
    let stored = null;
    try { stored = localStorage.getItem("logo-theme"); } catch (e) { /* storage may be blocked */ }
    if (stored === "dark" || stored === "light") root.dataset.theme = stored;
    const isDark = () => root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    const label = () => (btn.textContent = isDark() ? "Light mode" : "Dark mode");
    label();
    btn.addEventListener("click", () => {
      root.dataset.theme = isDark() ? "light" : "dark";
      try { localStorage.setItem("logo-theme", root.dataset.theme); } catch (e) { /* ignore */ }
      label();
    });
    matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", label);
  }

  function setupNav() {
    const links = [...document.querySelectorAll("nav.toc a")];
    const map = new Map(links.map((a) => [a.getAttribute("href").slice(1), a]));
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          links.forEach((a) => a.classList.remove("active"));
          map.get(e.target.id)?.classList.add("active");
        }
      }
    }, { rootMargin: "-45% 0px -50% 0px" });
    document.querySelectorAll("section.block").forEach((s) => io.observe(s));
    $("#budgetChip").addEventListener("click", () => $("#buys").scrollIntoView());
  }

  function init(data) {
    S = data;
    state.custom = Math.round(S.budget.official);
    for (const c of S.split) if (!c.residual) state.split[c.key] = c.central;
    for (const it of S.items) state.choice[it.key] = it.default || 0;
    fillText();
    buildBill();
    buildPots();
    S.items.forEach(buildCard);
    buildBasket();
    drawDumbbell();
    refreshAll();
    buildImpact();
    let raf = 0;
    window.addEventListener("resize", () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        drawDotplot();
        drawSkyline();
        drawDumbbell();
        drawImpactCharts();
      });
    });
  }

  setupTheme();
  setupNav();
  fetch("data/site.json")
    .then((r) => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(init)
    .catch((err) => {
      const p = el("p", "note", `Could not load data/site.json (${err.message}). Serve the docs/ folder over HTTP, e.g. python3 -m http.server --directory docs.`);
      $("#bill .wrap").append(p);
    });
})();
