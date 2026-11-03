PYTHON ?= python3
export PYTHONPATH := src

.PHONY: all analysis test site fetch clean

all: analysis test

## Run the model: results/, docs/data/site.json, docs/CALCULATIONS.md, figures/
analysis:
	$(PYTHON) scripts/run_all.py

test:
	$(PYTHON) -m pytest -q

## Re-download the open data behind "Did it work?" (needs internet; raw files go to data/impact/raw/)
fetch:
	$(PYTHON) scripts/fetch_impact_data.py pageviews ucas innovate_uk wellcome

## Serve the interactive page at http://localhost:8766
site:
	$(PYTHON) -m http.server 8766 --directory docs

clean:
	rm -rf results/* figures/* docs/data/site.json docs/CALCULATIONS.md
