# SimCheck: instructions for Claude Code

SimCheck is an open-source, browser-based pre-flight checker for CFD setups. v0.1 = flow calculator. v0.2 = pure-tet Gmsh mesh checker verified against OpenFOAM checkMesh.

## Read first, every session

| File | What it is | When to read |
| --- | --- | --- |
| `docs/PLAN.md` | Full plan: scope, formulas, gates. **Source of truth.** | Before any task |
| `docs/decisions.md` | Settled decisions. Do not re-open them. | Before proposing anything |
| `docs/hand-calcs.md` | Golden values for flow tests | Before writing flow code or tests |
| `tests/fixtures/README.md` | Tiny meshes with exact expected values | Before parser or metric work |
| `docs/later.md` | Ideas parked for after v0.2 | When you want to add something new |

Reference source code (read-only, not in Git) is in `refs/`:
- `refs/gmsh` – `.msh` format docs and source (`doc/texinfo/gmsh.texi`, section "MSH file format")
- `refs/meshio` – a working `.msh` parser to compare against (`src/meshio/gmsh/`)
- `refs/OpenFOAM-dev` – checkMesh definitions (`src/OpenFOAM/meshes/primitiveMesh/primitiveMeshCheck/`, `primitiveMeshTools`)

Prefer reading these over guessing or web search.

## Team

The main session is the lead: it splits work into small tasks, delegates, and checks gates.

| Agent | Owns | Never |
| --- | --- | --- |
| `cfd-physics` | Formulas, thresholds, checkMesh definitions, tolerances, physics tests | Changes a tolerance to pass a test |
| `typescript-pro` | Core code, parser, geometry, adjacency | Replaces byte scanner/typed arrays |
| `performance-engineer` | Benchmarks, memory, speed | Optimises before a test passes |
| `frontend-developer` | Vite + React UI, Web Worker | Writes physics code |
| `deployment-engineer` | GitHub Actions, Pages, Gmsh in CI, OpenFOAM Docker | Pushes secrets |
| `code-reviewer` | Reviews each milestone against PLAN + decisions | Writes code |

Order inside a milestone: cfd-physics defines → typescript-pro / frontend-developer build → performance-engineer measures (if relevant) → code-reviewer reviews → commit.

## Milestones and gates

Stop at every gate. Print the result with numbers and wait for Bhuvanesh to approve.

1. **Setup** – pnpm workspace (`packages/core`, `packages/web`), TypeScript strict, Vitest, GitHub Actions (test + Pages deploy). Gate: empty page live, CI green.
2. **v0.1 core** – fluids, Reynolds, y+, boundary layer, layers, CFL, regime (PLAN §3, §5). Gate: every value in `docs/hand-calcs.md` reproduced within 0.1%, all edge cases tested.
3. **v0.1 release** – flow UI with explanations, README, feedback link, tag v0.1.0. Gate: live site, Bhuvanesh checks it by hand.
4. **Parser** – Gmsh v4.1 + v2.2 ASCII (PLAN §3 v0.2 rules). Gate: fixtures parse exactly; 1M tets < 3 s; report peak RSS.
5. **Adjacency** – radix sort on 3-part face keys. Gate: fixture face counts exact; 1M tets < 2 s.
6. **Reference** – OpenFOAM in Docker, `gmshToFoam` + `checkMesh` scripts, reference JSON for fixtures + 2 larger meshes. **Stop and ask before choosing the OpenFOAM version.**
7. **Metrics** – volume, aspect ratio, non-orthogonality, skewness (checkMesh definitions). Gate: diff vs checkMesh within PLAN §5 tolerances. If a metric fails, report numbers and ask.
8. **v0.2 release** – worker, histograms, worst-cell table, docs, tag v0.2.0.

## Hard rules

- Byte scanner and flat typed arrays are required by the plan. Not over-engineering. Do not replace them with `split`/`parseFloat` per token or arrays of objects.
- Never change a formula, constant, threshold or tolerance without asking. Anything from memory is marked "verify".
- Reject unsupported meshes with a clear message. Never skip cells silently.
- Nothing outside PLAN §3. New ideas go in `docs/later.md`.
- When a decision is made, add one line to `docs/decisions.md`.
- Commit `.geo` files only; `.msh` files are generated (fixtures under 50 KB may be committed).
- Small commits, one per finished task. Tests must pass before every commit.

## Commands

- `pnpm install`, `pnpm test`, `pnpm -r build`, `pnpm --filter web dev`
- Benchmarks: `pnpm --filter core bench`

# Code Style & Commit Guidelines
- NEVER include attribution, signatures, AI watermarks, or references to Claude/Anthropic in code comments, commit messages, PR descriptions, or documentation.
- Maintain a clean, human-written style across all output.
