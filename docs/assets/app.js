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
    let raf = 0;
    window.addEventListener("resize", () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        drawDotplot();
        drawSkyline();
        drawDumbbell();
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
