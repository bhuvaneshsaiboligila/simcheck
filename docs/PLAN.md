# SimCheck: Project Plan

Nov 4, 2026 · Bhuvanesh

## 1. What we are building

SimCheck is a free, open-source web app that checks a CFD setup before you run it. It ships in small releases, so real users see it early.

**v0.1: flow setup calculator.** It beats existing y+ calculators because it:

- picks y or 2y automatically from the solver type (cell-centred like OpenFOAM/Fluent, vertex-based like SU2)
- gives boundary-layer total thickness, number of layers, and growth ratio
- warns about the flow regime with reasons (laminar, transitional, flat-plate estimate only)
- explains every number and where its formula comes from

**v0.2: mesh checker for pure-tet 3D Gmsh meshes.** Drop in a `.msh`, get volume, aspect ratio, non-orthogonality and skewness using checkMesh definitions, verified against checkMesh itself.

**v0.3 (later): prism boundary layers.** This is when the two halves connect: the layers the calculator designs can then be checked.

Everything runs in the browser. No server, no upload, no install.

**Who it is for:** CFD students and engineers using OpenFOAM, Fluent or SU2. v0.2 mainly serves student and teaching meshes, and the README says so. FEM users are not a target until FEM metrics exist.

**Success signal for v0.1:** at least 3 people you don't know give feedback (GitHub issue or comment) within 4 weeks of release. If that doesn't happen, v0.2 still gets built for the portfolio, but we change how we share it before building more.

## 2. How we approach it

Ship the small, useful part first, then build the hard part against a real reference. All physics and parsing live in a pure TypeScript core that is tested in Node before any UI exists.

**Seven rules we follow:**

1. **Ship small, early.** The flow calculator goes live first; the mesh checker does not block it.
2. **checkMesh is the reference.** Every mesh metric must match OpenFOAM's `checkMesh` on the same mesh. One pinned OpenFOAM version, run in Docker.
3. **Core before UI.** Physics and parsing are tested with Vitest before they get a UI.
4. **Treat TypeScript like C.** Mesh data lives in flat typed arrays; the file is read as bytes, not text.
5. **Return summaries, not per-cell objects.** Histograms, min/max/mean, and the worst 50 cells only.
6. **Heavy work in a Web Worker,** so the page never freezes.
7. **Reject clearly, never skip silently.** Unsupported input gets a clear message telling the user what to change.

**Key decisions:**

| Decision | Choice | Reason |
| --- | --- | --- |
| Language | TypeScript | One language for core and UI |
| Backend | None, static site | Free hosting, data never leaves the machine |
| Mesh storage | Flat typed arrays | 1M tets ≈ 25 MB of arrays |
| File reading | Byte scanner, chunked | Avoids millions of strings |
| Reference | OpenFOAM checkMesh in Docker, one pinned version | Users will compare against it |
| Test meshes | `.geo` scripts, meshed by Gmsh in CI | Big meshes can't live in Git |
| Tests | Vitest | Works for Node and browser code |
| Hosting | GitHub Pages | Free |
| Licence | MIT | Easiest to use and contribute |

## 3. Scope

**v0.1: flow calculator**

- Fluids: air from pressure (default 101 325 Pa) and temperature, with Sutherland's law for viscosity; water from a table; or custom density and viscosity
- Reynolds number
- First wall distance for a target y+, with a solver selector (cell-centred: first cell height = 2y; vertex-based: first cell height = y)
- Boundary layer: total thickness δ, number of layers for a growth ratio, or growth ratio for a number of layers
- CFL maximum time step from a cell size the user enters
- Regime warnings with reasons: laminar, transitional, flat-plate estimate only
- An explanation and source for every output

**v0.2: mesh checker**

- Gmsh `.msh` v4.1 and v2.2, ASCII
- Cells = elements of the highest dimension only (surface triangles, lines and points are ignored)
- Pure linear tetrahedra only. Mixed meshes (prisms, pyramids, hexes) are **rejected with a clear message**, not partly checked
- Clear error when the file has no volume cells (usual cause: missing volume physical group)
- Handles real Gmsh files: parametric nodes, sparse node tags, CRLF line endings, floats like `1.e-05`; ignores `$Periodic` and partition sections
- Metrics with checkMesh definitions: volume, aspect ratio, non-orthogonality, skewness (internal and boundary faces)
- Output: histograms (log bins for aspect ratio), min/max/mean, findings, and the worst 50 cells as Gmsh element tag + centroid coordinates + physical group name (read from the `$PhysicalNames` section)
- Smallest and median cell size, defined as volume^(1/3), so the user can use it for the CFL step

**Not before v0.3:** prisms, pyramids, hexes, FEM metrics (Jacobian, minimum angle), binary `.msh`, STL or `polyMesh` import, 3D viewer, CLI, any backend.

## 4. Milestones and steps

Work runs milestone by milestone (see `CLAUDE.md`). Each milestone ends at a gate that must pass before the next starts.

| # | Work | Gate |
| --- | --- | --- |
| 1 | Repo, pnpm workspace, TypeScript, Vitest, CI, Vite shell, GitHub Pages deploy | Empty page live, CI green |
| 2 | `fluids`, `reynolds`, `yplus`, `blayer`, `cfl`, `regime`, solver selector, tests | All values in `docs/hand-calcs.md` within 0.1% |
| 3 | Flow UI, explanations, README, feedback link, **ship v0.1** | Live, tagged v0.1.0 |
| 4 | Parser v4.1 + v2.2: max-dimension filter, 0-cell error, mixed-mesh rejection, parametric nodes, sparse tags, CRLF | Fixtures exact; 1M tets parse < 3 s |
| 5 | Face adjacency + benchmark | Fixture face counts exact; 1M tets < 2 s |
| 6 | OpenFOAM in Docker, `gmshToFoam` + `checkMesh` scripts, read checkMesh source for exact definitions | Reference numbers for fixtures + 2 larger meshes |
| 7 | Volume, aspect ratio, non-orthogonality, skewness with checkMesh definitions | Diff vs. checkMesh within preset tolerance |
| 8 | Worker, progress bar, histograms, worst-cell table, error messages, docs, outside tester, **ship v0.2** | 1M mesh in browser, no freeze; tester succeeds without help |

**Fallback rules:**

- Adjacency benchmark fails → fix it (radix sort on face keys) before milestone 6.
- Skewness diff fails at milestone 7 → drop skewness from v0.2 and ship volume, aspect ratio and non-orthogonality.
- The parser (4) and the reference + metrics work (6–7) are the most likely to take longer than expected.

### v0.1 steps

1. Create repo `simcheck` (MIT), pnpm workspace with `packages/core` and `packages/web`, TypeScript strict, Vitest, GitHub Actions for tests and Pages deploy.
2. `fluids.ts`: air density from pressure and temperature (ideal gas), air viscosity by Sutherland's law, water from a table; custom input.
3. `reynolds.ts`, `yplus.ts` (with solver type), `blayer.ts` (δ, layers, growth ratio), `cfl.ts`, `regime.ts`.
4. Tests with the hand calculation written out in each test, including edge cases: r = 1, r given N, laminar and transitional Re.
5. Flow page: solver selector at the top, inputs left, results with explanations right.
6. README with screenshot, a GitHub Issues link on the page, tag v0.1.0, post with one specific question (e.g. "what does your y+ workflow still miss?").

### v0.2 steps

**Parser**

1. Byte scanner over `Uint8Array` chunks; numbers split across chunk borders handled.
2. Read `$MeshFormat`; support 4.1 and 2.2.
3. `$Nodes` → `Float64Array` coords; dense tag lookup using the header's min/max tag (not a `Map`).
4. `$Elements` → keep only highest-dimension elements; reject the file if any are not linear tets; error if none.
5. Float parsing tolerance fixed up front: values within 1e-12 relative of `parseFloat`.
6. Benchmark script: time and peak memory (RSS) on 100k and 1M tets.

**Adjacency**

1. Each tet has 4 triangular faces; key = its 3 sorted node indices.
2. Sort faces by key with a radix sort over the three Int32 parts (keys don't fit in one Float64), keeping the face → cell link.
3. Equal neighbours = internal face (owner, neighbour); unpaired = boundary face.

**Reference**

1. Docker image with one pinned OpenFOAM version (write the fork and version in `thresholds.md`).
2. Script: `.geo` → Gmsh → `.msh` → `gmshToFoam` → `checkMesh` → JSON of reference statistics.
3. Use per-cell fields if that version supports `-writeFields`/`-writeAllFields`; otherwise compare summary statistics.
4. Read checkMesh's source for exact definitions of each metric and its thresholds.

**Metrics**

1. Volume (fail if ≤ 0), after checking Gmsh's tet node ordering on a single known tet.
2. Aspect ratio, non-orthogonality, skewness (internal and boundary), each with checkMesh's formula.
3. Compare statistics, not cell IDs, because `gmshToFoam` renumbers cells.

**UI and release**

1. Worker reads the `File`, reports progress, returns summaries.
2. Mesh page: drop zone, progress, histograms, findings, worst-cell table (tag, coordinates, physical group).
3. Docs, test meshes from `.geo` in CI, outside tester, tag v0.2.0.

## 5. Physics and definitions

These are the formulas the code implements. Items marked *verify* are from memory and get checked against the source before release. Constants are in `docs/decisions.md`; golden values in `docs/hand-calcs.md`.

**Reynolds number:**

```
Re_x = ρ U x / μ
```

**x** is the distance from the leading edge where the user wants the target y+ (default: the full length L). Shown with the result: "y+ will be higher upstream of x."

**Wall distance for a target y+** (turbulent flat plate, 1/7-power law, White, *verify*):

```
Cf = 0.026 · Re_x^(-1/7)
τw = ½ · Cf · ρ · U²
uτ = sqrt(τw / ρ)
y  = y+ · μ / (ρ · uτ)
```

| Solver type | Examples | y+ is measured at | First cell height |
| --- | --- | --- | --- |
| Cell-centred finite volume | OpenFOAM, Fluent, STAR-CCM+ | first cell centre | 2y |
| Vertex-based | SU2 | first node | y |

**Boundary-layer thickness** (turbulent flat plate, same 1/7-power law as Cf, White, *verify*):

```
δ ≈ 0.16 · x · Re_x^(-1/7)
```

**Layers:** first height h, growth ratio r, N layers give total thickness T. The app solves for N given r, or r given N, so that T ≈ δ. N given r is direct; r given N has no closed form, so it is solved by bisection. When r = 1 the formula divides by zero, so T = N·h is used.

```
T = h · (r^N − 1) / (r − 1)
```

**CFL maximum time step:**

```
Δt_max = CFL · Δx / |U|
```

**Regime warnings:**

| Condition | Message |
| --- | --- |
| Re_x < 5×10⁵ | Laminar: the turbulent correlation does not apply |
| 5×10⁵ ≤ Re_x < 3×10⁶ | Transitional: estimate is uncertain |
| Always | Flat-plate estimate; for internal or bluff-body flows, check y+ after the first run |

**Mesh metrics (v0.2):** every metric uses checkMesh's definition, taken from the pinned OpenFOAM version's source. For pure tets, the cell centroid is the average of the 4 nodes, which is the same as OpenFOAM's volume-weighted centroid.

| Metric | Definition | checkMesh threshold (*verify*) |
| --- | --- | --- |
| Volume | Signed tet volume | fail if ≤ 0 |
| Aspect ratio | checkMesh's formula (face areas vs. volume), not edge ratio | 1000 |
| Non-orthogonality | Angle between owner→neighbour centroid vector and face area vector | 70° |
| Skewness | checkMesh's face skewness; separate formula for boundary faces | 4 |

**Faces vs. cells:** volume and aspect ratio are cell metrics. Non-orthogonality and skewness are face metrics, so their statistics are computed over faces, as checkMesh does. A bad face is reported in the worst list by its owner cell.

**Reference pipeline:** check that the pinned `gmshToFoam` reads `.msh` v4.1. If not, export v2.2 for the reference pipeline only; the geometry is identical.

**Comparison tolerance, fixed before any results:** 1e-4 relative on max and mean when comparing checkMesh's printed output (it prints about 6 significant digits), 1e-6 only when comparing written fields; exact match on counts above threshold. We compare statistics, not cell IDs.

## 6. Architecture and repo layout

Flow checks are tiny and run directly in the UI. Mesh parsing and checks run in a Web Worker and send back only histograms, summaries, and worst-cell IDs.

```
Flow form ──► Flow checks (Re, y+, CFL) ──► Results view
                                               ▲
.msh file ──► [Web Worker: Byte parser ──► Typed arrays ──► Mesh checks] ─┘  (results only)
```

**Repo layout:**

```
simcheck/
├─ packages/
│  ├─ core/
│  │  ├─ src/
│  │  │  ├─ types.ts          # Check, Finding, Mesh, Severity
│  │  │  ├─ registry.ts       # registers and runs checks
│  │  │  ├─ fluids.ts         # air/water properties
│  │  │  ├─ checks/flow/      # reynolds, yplus, blayer, cfl, regime
│  │  │  ├─ checks/mesh/      # volume, aspectRatio, nonOrtho, skewness
│  │  │  ├─ geometry/         # centroids, face normals, adjacency (radix sort)
│  │  │  └─ parsers/gmsh.ts   # byte scanner, v2.2 + v4.1
│  │  ├─ test/
│  │  └─ bench/               # parse + adjacency benchmarks
│  └─ web/                    # Vite + React UI, worker.ts
├─ tests/fixtures/            # tiny hand-checkable meshes
├─ meshes/                    # .geo scripts only; .msh generated in CI
├─ reference/                 # Dockerfile (pinned OpenFOAM), checkMesh scripts, reference JSON
├─ docs/                      # PLAN, decisions, hand-calcs, thresholds, adding-a-check, later
├─ CLAUDE.md
└─ README.md
```

**Core types:**

```ts
type Severity = "pass" | "warn" | "fail";
type SolverType = "cell-centred" | "vertex-based";

interface Finding {
  severity: Severity;
  title: string;
  message: string;    // what was found, with numbers
  why: string;        // why it matters
  fix?: string;       // what the user should change
  reference?: string; // source of the formula or threshold
}

interface Mesh {
  coords: Float64Array;   // x,y,z per node
  conn: Int32Array;       // 4 node indices per tet
  tags: Int32Array;       // Gmsh element tag per cell
  physical: Int32Array;   // physical group per cell
}

interface MetricResult {
  histogram: Uint32Array; // 20 bins (log bins for aspect ratio)
  binEdges: Float64Array;
  min: number; max: number; mean: number;
  worst: { tag: number; centroid: [number, number, number]; physical: number; value: number }[]; // up to 50
  findings: Finding[];
}
```

## 7. Risks and how we handle them

| Risk | What happens | How we handle it |
| --- | --- | --- |
| Numbers differ from checkMesh | OpenFOAM users stop trusting the tool | checkMesh definitions from source, diff gate with preset tolerance, version pinned |
| OpenFOAM setup and C++ reading take long | v0.2 slips | Docker image, drop skewness if its diff fails |
| Face adjacency too slow | Checks take minutes | Radix sort on 3-part keys, benchmarked early |
| Messy real Gmsh files | Silent misparsing | Explicit handling list (section 3), reject anything unsupported with a clear message |
| Wrong tet node ordering | Every cell flagged as inverted | Test on one known tet first (`tests/fixtures`) |
| v0.1 too similar to existing calculators | No feedback | Solver selector, layers, regime warnings, explanations; feedback link with a specific question |
| Calculator and checker serve different users until prisms | Weak story | Said openly in README; prisms are the first v0.3 item |
| Test meshes too big for Git | Push blocked | Commit `.geo` only, mesh in CI |
| Scope creep | Never ships | Anything outside section 3 goes to `docs/later.md` |

## 8. Definition of done

**v0.1 is done when:**

- [ ] All flow outputs match `docs/hand-calcs.md` within 0.1%, for both solver types
- [ ] Regime warnings appear at the right Reynolds numbers
- [ ] Live on GitHub Pages, tagged v0.1.0, README with screenshot and feedback link
- [ ] Posted with one specific feedback question

**v0.2 is done when:**

- [ ] All fixtures in `tests/fixtures` give their expected values
- [ ] 1M tets parse in under 3 s and adjacency builds in under 2 s (Node benchmark)
- [ ] Mixed meshes and surface-only meshes get clear error messages
- [ ] Metric statistics match checkMesh within the preset tolerance
- [ ] A 1M-cell mesh is checked in the browser without freezing
- [ ] `thresholds.md` names the OpenFOAM fork and version and the source of every threshold
- [ ] An outside tester uses it without help

**You own correctness:** read and approve every formula and threshold, especially the checkMesh ones. Agents write the code.
