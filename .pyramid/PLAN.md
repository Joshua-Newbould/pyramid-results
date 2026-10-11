# PLAN.md - results-site (round 4, final)

run_id: 20261011-r4 (one run shared by the five round-4 plans; node specs live in the Workflow call and the run's journal)
tier: build - four nodes: s0-collect, s1-content, s1b-prose, s2-design
routing basis: routing.md derived 2026-10-11T00:04Z (implement sonnet medium, write sonnet low, review sonnet medium); explore-pick: s1b-prose on haiku (explore)
compute: RTX 4080 SUPER shared with sibling nodes; PY=/home/josh/miniconda3/envs/annoflow/bin/python; data under ~/repos/data

## Goals
- One static page (index.html, style.css, main.js at the repo root, data/ collected from the four repos) presenting the four experiments: a chapter each with curves as inline SVG, artifacts as plates, facts, prose at most 80 words, a header and a colophon.
- Minimalist and artistic, gated by a browser-computed design lint; artifacts rendered large enough to read (each plate image at least half the chapter width, the gan strip scrolling at natural width).

## Success criteria
- [ ] `python tools/check.py all` exit 0: data, html, prose, browser, design (port 8770)
- [ ] line budgets: index.html 80, style.css 220, main.js 150, tools/check.py 140, tools/collect.py 30

## Approval
- [x] standing approval (user message 2026-10-10T23:12Z); plan written 2026-10-11T00:05:18Z

## Run log
| run | started | passed/total | re-runs | escalations | nodes USD | orchestrator USD | wall clock | notes |
|---|---|---|---|---|---|---|---|---|
| 20261011-r4 (shared) | 00:34Z | 4/4 | 0 | 0 | 0.382 | shared | 3.0 min | design lint passed; data re-collected and one prose sentence fixed after the gan escalation |

## Round 5 - interactivity (run 20261011-site-v2, one shared run with the four repos)
Goals: light/dark toggle; draw-a-digit classifier in the browser (CNN weights exported); GAN epoch scrubber and latent-walk scrubber; NGP loupe and training-step scrubber; Shakespeare generation in the browser (transformer weights exported); curve hover readouts; a method table per chapter; the folio design carried through by opus.
Nodes: mnist-export, gan-export, ngp-export, shakespeare-export (sonnet; shakespeare on haiku by explore pick; gates are the orchestrator's check_export.py) -> site-gates (sonnet, shared layer, exploration override) -> site-models (sonnet), site-widgets (sonnet) -> design (opus high, user preference).
Criteria: tools/check.py all (data, html, prose, browser, design in both schemes) and node tools/check_models.js (JS forward passes match the Python fixtures).
