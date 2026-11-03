# What else could Imperial's new logo have bought?

**An open, sourced "what if" about Imperial College London's 2024 logo and brand refresh**

In February 2024 Imperial College London replaced its "Imperial College London" logo with a new "Imperial" wordmark. The College's own Freedom of Information disclosure puts the cost at **£434,801.47**. This repository works out what else that money could have bought, from beef and cows to PhD studentships, centrifuges, cell lines, culture medium, GPT tokens and new labs, and puts it all on one interactive page.

🌐 **Interactive page:** <https://sthsci.github.io/imperial-logo-whatif/> (pick a budget, change the prices, fill your own basket)

🧮 **Every calculation, step by step:** [`docs/CALCULATIONS.md`](docs/CALCULATIONS.md)

![What £434,801 buys instead](figures/overview.png)

## The bill

| | Amount | Status |
|---|---:|---|
| **Paid in total** (agencies, typeface, new signage, video and lanyards) | **£434,801.47** | Official ([Imperial FOI disclosure, March 2024](https://www.imperial.ac.uk/media/imperial-college/administration-and-support-services/secretariat/public/information-governance/Imperial-Brand-Project-FOI.pdf)) |
| The same in September 2026 money (ONS CPI) | £467,923 | Calculated |
| **The logo itself**: brand agencies plus the bespoke typeface | ≈ £299,800 | Our estimate |
| **Replacing the signs** ("decoration") across the campuses | ≈ £100,000 (£50k–£170k) | Our estimate |
| Promotional extras: brand animation video, lanyards | ≈ £35,000 | Our estimate |

- **Imperial will not say what the signs cost.** It refused to give the amount paid to each supplier under section 43 of the FOI Act ([reply of 26 March 2024](https://www.whatdotheyknow.com/request/cost_of_re_design_for_new_imperi)). So the split is a bottom-up estimate, and the page lets you move every slice.
- **Plot twist.** The 2002 rebrand, which introduced the "Imperial College London" logotype, cost £298,300 ([FOI reply, 2009](https://www.whatdotheyknow.com/request/re_branding_of_imperial_college)). That is **£573,134** in today's money, 22% more than the 2024 refresh. Together the two rebrands come to **£1.04 million** in today's money.

## What £434,801.47 buys instead

Default price first; the alternatives are selectable on the page. Every price links to its source in [`data/parameters.toml`](data/parameters.toml).

**Food and farm**
- 🥩 **40,000 kg of beef mince** (ONS average £10.87/kg). That is 352,734 quarter-pound burgers, or 4.2 years of everything Taste Imperial bought before it took beef off its menus in October 2024. Steak instead: 18,855 kg.
- 🐄 **181 finished beef steers** at £2,392 a head (AHDB deadweight price × average carcase), one for every 132 students. Or 143 freshly calved dairy heifers.
- 🍛 **Free food:** 64,130 hot meals at the £6.78 student price. That is enough for **every one of Imperial's 23,920 students to eat free 2.7 times**, or for **427 students to get free lunch every weekday of the teaching year**. With the £4 meal deal instead, 724 students get a year of lunches.

**Students and researchers**
- 🛏️ **56 student-years of hall rent** at the median £199 a week for 39 weeks. That is 74 at the cheapest room and 26 at the priciest.
- 🎓 **3.2 fully funded four-year PhD studentships** in London at 2026/27 UKRI rates (£34,043 a year: stipend, London weighting, fees and research costs), or one year of funding for 12 students. Over 3.5 years it is 3.6 studentships.
- 🧑‍🔬 8.6 years of an Imperial research associate's salary.

**In the lab**
- 🌀 **45 refrigerated benchtop centrifuges** (Eppendorf 5810 R, £9,498), 166 microcentrifuges, or 5.4 ultracentrifuges.
- 🧫 **1,009 vials of authenticated cell lines** (ATCC HEK-293 or HeLa, $577): a new line every working day for four years.
- 🧴 **25,758 bottles of DMEM** (12,879 litres). Stacked, they would stand 5.2 km tall, which is 59 Queen's Towers and higher than Mont Blanc. Or 1,184 bottles of fetal bovine serum.
- 🔬 **1.3 new 75 m² Containment Level 2 labs** at about £4,500 per m² before fittings and kit (2.1 small or 0.64 large ones). Or 10 start-up packages for new group leaders.
- 💧 1,739 pipettes · 📄 79 open-access papers in *Nature Communications*.

**AI**
- 🤖 **11.7 billion GPT-6 Astra output tokens** (OpenAI's flagship, $50 per million), enough to write 109,508 PhD theses. Or 58.3 billion input tokens, or 1.17 trillion output tokens from the cheapest model.
- 💬 **21,750 months of ChatGPT Plus**: 28 days for every Imperial student, or 1,813 years for one very patient PhD student.

**Perspective**
- £18.18 per Imperial student. £54 per signature on the petition against the logo (8,000+).
- Imperial's 2024/25 income (£1.49 bn) covers the bill in **2 h 33 min**: 0.03% of a year.
- 🍺 112,935 pints at the Union's £3.85 value price.

## Reproduce

```bash
pip install -r requirements.txt
make analysis   # results/, figures/, docs/data/site.json, docs/CALCULATIONS.md
make test       # pytest suite
make site       # serve the page at http://localhost:8766
```

## Repository layout

| Path | Contents |
|---|---|
| `data/` | Every input with its source: `brand_costs.csv` (official figures), `parameters.toml` (unit prices, the estimated split, fixed assumptions), `imperial_facts.csv`, `cpi_d7bt.csv` (ONS CPI), `landmarks.csv` |
| `src/logowhatif/` | `model.py` (inflation, split, conversions), `report.py` (results, page data, CALCULATIONS.md, figure) |
| `scripts/run_all.py` | Runs everything |
| `results/` | `key_numbers.json`, `conversions.csv` (every price option) |
| `docs/` | The GitHub Pages site (`index.html`, `assets/`, `data/site.json`) and `CALCULATIONS.md` |
| `tests/` | `pytest` suite: the split adds up, prices have sources, USD prices use one exchange rate, page data matches the model |

## Method in brief

- **The bill.** The total is Imperial's own figure. The split is an estimate. Signage is sized bottom-up (identification signs, lettering and banners at the main campuses). The typeface and promotional items are sized from typical commission costs. The agencies get the remainder.
- **Today's money.** ONS CPI (D7BT): 2024 average 133.9; 2002–03 average 75.0; September 2026 144.1.
- **Conversions.** Budget ÷ unit price. Prices are UK list or average prices from 2026 where one exists. US list prices (ATCC, the ultracentrifuge, OpenAI) are converted at the ECB rate of 30 October 2026 ($1 = £0.74633).

## Limitations

- The split of the £434,801.47 is our estimate. Only Imperial knows what the signs cost. If you know better, open an issue.
- Money is not interchangeable in practice. The brand was paid for from central budgets, not research grants, and a studentship or a lab needs people, space and running costs.
- The lab cost is a build cost (shell and core). It leaves out fit-out and equipment, so a working lab costs more.
- No public UK price was found for ECACC cell lines or for an ultracentrifuge. The ATCC price is the list price, not the non-profit one.
- Prices move, especially cattle, beef and AI tokens. Each input says when it was read.

## Citation and licence

See `CITATION.cff`. Code: MIT. Text and figures: CC BY 4.0. Data are © their original publishers (sources listed in each file). Not an official Imperial College London publication.
Built with the help of an AI assistant (Claude, Anthropic); every input is traceable to a cited source.
