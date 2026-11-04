# meshes/

`.geo` scripts only. The `.msh` files gmsh generates from them are not
committed (`meshes/**/*.msh` is gitignored) — they are either tiny fixtures
(kept under `tests/fixtures/` instead, see that directory's own README) or
large benchmark meshes regenerated locally/in CI.

## bench-cube.geo

Unit-cube volume, pure linear tets, used only by
`packages/core/bench/parse.bench.ts` (milestone 4 gate: 1M tets parse in
under 3 s). Not a CFD case — no boundary layers, just a Delaunay tet fill.

Generate the two benchmark meshes before running `pnpm --filter core bench`:

```sh
export PATH="$HOME/.local/bin:$PATH"   # or wherever gmsh is installed
gmsh bench-cube.geo -3 -format msh41 -clmax 0.0355  -o bench-100k.msh
gmsh bench-cube.geo -3 -format msh41 -clmax 0.01705 -o bench-1m.msh
```

These `-clmax` values are tuned by trial to land near the target counts;
exact counts vary slightly by gmsh version:

| File | clmax | tets (actual) |
| --- | --- | --- |
| `bench-100k.msh` | 0.0355 | 110,841 |
| `bench-1m.msh` | 0.01705 | 919,235 |

Both local-only files stay in this directory and are gitignored.
