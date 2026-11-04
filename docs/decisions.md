# Decisions

Settled. Agents do not re-open these; add new lines at the bottom with the date.

| # | Date | Decision | Why |
| --- | --- | --- | --- |
| 1 | 2026-11-04 | Static web app, no backend, GitHub Pages, MIT licence | Free, private, simple |
| 2 | 2026-11-04 | TypeScript monorepo: `packages/core` (no DOM) + `packages/web` | Core testable in Node, reusable later |
| 3 | 2026-11-04 | v0.1 = flow calculator only, shipped before any mesh work | Early feedback, low risk |
| 4 | 2026-11-04 | One model: turbulent flat-plate 1/7-power law for Cf and δ. Cf = 0.027·Re_x^(-1/7) (not 0.026), δ = 0.16·x·Re_x^(-1/7). Source: White, *Fluid Mechanics*, turbulent flat-plate / 1/7-power-law section (exact equation number and edition marked *verify* — not confirmed against the physical book) | Consistent first-cell height and thickness; 0.026 could not be independently confirmed, 0.027 is the value corroborated by every source checked |
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

| 22 | 2026-11-04 | Cf coefficient resolved to 0.027 (was 0.026); δ unchanged at 0.16. All of `PLAN.md` §5, `docs/hand-calcs.md`, `docs/flow-spec.md` updated to match. Citation page/equation number in White still marked *verify* | Bhuvanesh approved after cfd-physics flagged the mismatch; every independently checked source gave 0.027, none gave 0.026 |
| 23 | 2026-11-04 | Water property table approved: 0–80 °C in 5 °C steps (17 points), density linear interpolation, viscosity log-linear interpolation, IAPWS/NIST-consistent values as source of record (exact textbook table/page still marked *verify*); temperatures outside [0, 80] °C are an input error, never extrapolated | Bhuvanesh approved cfd-physics's proposal, widened from the initial 3-point (10/20/30 °C) proposal |
| 24 | 2026-11-04 | The always-on flat-plate disclosure finding uses `severity: "pass"` (green badge), not a new `Severity` value; checked against the live v0.1 screenshot, it reads clearly next to amber "warn" regime badges | Avoids widening the `Finding.severity` type for one disclosure note; confirmed visually before v0.1.0 tag |
| 25 | 2026-11-04 | OpenFOAM fork/version for the reference pipeline: ESI/OpenCFD OpenFOAM v2512, source tag `OpenFOAM-v2512` at `gitlab.com/openfoam/core/openfoam`, Docker image `opencfd/openfoam-default:2512`. `refs/OpenFOAM-dev` replaced with `refs/OpenFOAM-v2512` (same tag's checkout). checkMesh in this version supports both `-writeFields '(<fieldName>)'` and `-writeAllFields`, so per-cell field comparison is available, not just summary statistics. Details in `docs/thresholds.md` | Bhuvanesh approved; v2512 is the latest release with an official `opencfd/openfoam-default` Docker image (confirmed against Docker Hub's tag list directly, not search-engine summaries) |
| 26 | 2026-11-04 | checkMesh (plain run, no `-meshQuality` dict) default thresholds confirmed from `primitiveMeshCheck.C` source: non-orthogonality 70° (single threshold, warning tier then hard-fail at ≥~90°), skewness 4 (same for internal and boundary faces), aspect ratio 1000. The earlier guess had aspect ratio and skewness swapped ("4" and "1000" reversed) — corrected. Full formulas and source lines in `docs/thresholds.md` | cfd-physics read the actual v2512 source rather than relying on memory; resolves the "still need confirming" item below |

## Open (needs Bhuvanesh)

- Confirm exact citation (edition, equation number / table page) for Cf = 0.027·Re_x^(-1/7) in White, and for the water property table.
