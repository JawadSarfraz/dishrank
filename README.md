# DishRank — planning kit

This repo starts as the planning kit for DishRank (dish-first restaurant rankings for Pakistan).
`CLAUDE.md`, `docs/` and `seed/` sit at the repo root; Claude Code builds the app around them.

## 1. Set up the repo

```bash
cd dishrank            # the repo root: CLAUDE.md, README.md, docs/, seed/, .nvmrc
git init && git add . && git commit -m "docs: dishrank kit"
```

Open the folder in VS Code and start Claude Code.

## 2. Read order (for you, 30 minutes)

1. `CLAUDE.md` — rules Claude Code must follow
2. `docs/01-PRODUCT-SPEC.md` — scope, screens, success metrics
3. `docs/02-ARCHITECTURE.md` — diagrams, directory structure, ADRs
4. `docs/03-DATA-MODEL.md` — ERD + full Prisma schema
5. `docs/04-RANKING.md` — the score, eligibility, abuse rules
6. `docs/05-DISH-TAXONOMY.md` — dish list rules + matching pipeline
7. `docs/06-API-SPEC.md` — endpoints, rate limits
8. `docs/07-DATA-PIPELINES.md` — how restaurants/dishes get in (Google seed, menu photos, owners)
9. `docs/08-IMPLEMENTATION-PLAN.md` — phases with acceptance criteria
10. `docs/09-CLAUDE-CODE-PROMPTS.md` — **the prompts to paste, in order**
11. `docs/10-DEPLOYMENT.md` — accounts, env vars, crons, costs
12. `docs/11-REVIEW-CHECKLIST.md` — tick after every phase

## 3. Build

Paste Prompt 0 from `docs/09`, answer its questions, then Prompts 1–7 one phase at a time.
Run the acceptance checks after each phase. Use the Fix prompt for bugs and the Audit prompt before launch.

## 4. Files

```
CLAUDE.md
README.md
docs/
  01-PRODUCT-SPEC.md 02-ARCHITECTURE.md 03-DATA-MODEL.md 04-RANKING.md 05-DISH-TAXONOMY.md
  06-API-SPEC.md 07-DATA-PIPELINES.md 08-IMPLEMENTATION-PLAN.md 09-CLAUDE-CODE-PROMPTS.md
  10-DEPLOYMENT.md 11-REVIEW-CHECKLIST.md OPEN-QUESTIONS.md KICKOFF-REVIEW.md
  diagrams/*.mmd   (Mermaid sources; render with the VS Code Mermaid extension or mermaid.live)
seed/
  cities.json areas.json dish-categories.json dishes.json variant-tags.json meat-words.json
```

## 5. When something is missing

Every doc is the source of truth for its area. If the code and a doc disagree, fix the doc first
(or the code, if the doc was right), then re-run the relevant phase prompt with the Fix template.
Log decisions in `docs/OPEN-QUESTIONS.md`.
