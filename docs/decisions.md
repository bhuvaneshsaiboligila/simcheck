# Decisions

Settled. Agents do not re-open these; add new lines at the bottom with the date.

| # | Date | Decision | Why |
| --- | --- | --- | --- |
| 1 | 2026-11-04 | Static web app, no backend, GitHub Pages, MIT licence | Free, private, simple |
| 2 | 2026-11-04 | TypeScript monorepo: `packages/core` (no DOM) + `packages/web` | Core testable in Node, reusable later |
| 3 | 2026-11-04 | v0.1 = flow calculator only, shipped before any mesh work | Early feedback, low risk |
| 4 | 2026-11-04 | One model: turbulent flat-plate 1/7-power law for Cf and δ (White, verify) | Consistent first-cell height and thickness |
| 5 | 2026-11-04 | Air: ideal gas density (R = 287.05 J/kg/K), Sutherland viscosity (μ0 = 1.716e-5 Pa·s, T0 = 273.15 K, S = 110.4 K); default p = 101 325 Pa | Standard, documented |
| 6 | 2026-11-04 | Solver selector: cell-centred → first cell height 2y; vertex-based → y | y+ measured at cell centre vs node |
| 7 | 2026-11-04 | Regime: Re_x < 5e5 laminar warning; 5e5 to 3e6 transitional warning; flat-plate note always | Correlation only valid for turbulent flat plate |
| 8 | 2026-11-04 | r given N solved by bisection; r = 1 uses T = N·h | No closed form; avoid divide by zero |
| 9 | 2026-11-04 | v0.2 = pure linear tets only; mixed meshes rejected with a message | Correct adjacency; prisms are v0.3 |
| 10 | 2026-11-04 | Cells = highest-dimension elements only; error if none | Gmsh files mix dimensions; missing volume group |
| 11 | 2026-11-04 | Byte scanner, chunked reading, flat typed arrays | Memory and speed on 8 GB laptops |
| 12 | 2026-11-04 | Face adjacency via radix sort on 3 Int32 parts | Keys exceed 53 bits; comparator sort too slow |
| 13 | 2026-11-04 | Mesh metrics use OpenFOAM checkMesh definitions; checkMesh is the test oracle | Users compare against checkMesh |
| 14 | 2026-11-04 | Non-ortho and skewness are face metrics, stats over faces; worst faces reported by owner cell | Matches checkMesh |
| 15 | 2026-11-04 | Tolerance vs checkMesh: 1e-4 relative on printed max/mean, 1e-6 on written fields, exact on counts | checkMesh prints ~6 digits |
| 16 | 2026-11-04 | Compare statistics, not cell IDs | gmshToFoam renumbers cells |
| 17 | 2026-11-04 | Aspect ratio histogram uses log bins | Heavy-tailed |
| 18 | 2026-11-04 | Worst cells reported as Gmsh tag + centroid + physical group name | Actionable without a 3D viewer |
| 19 | 2026-11-04 | Cell size = volume^(1/3) | Meaningful CFL suggestion |
| 20 | 2026-11-04 | If skewness diff fails by end of metrics milestone, ship v0.2 without it | Don't block release |
| 21 | 2026-11-04 | Not before v0.3: prisms, pyramids, hexes, FEM metrics, binary .msh, STL/polyMesh, 3D viewer, CLI | Scope control |

## Open (needs Bhuvanesh)

- OpenFOAM fork and version for the reference pipeline (milestone 6).
- Confirm sources for the "verify" items: Cf and δ attribution, checkMesh thresholds (70°, 4, 1000).
