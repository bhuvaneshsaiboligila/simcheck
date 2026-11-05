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
gmsh bench-cube.geo -3 -format msh41 -clmax 0.0355 -o bench-100k.msh
gmsh bench-cube.geo -3 -format msh41 -clmax 0.0165 -o bench-1m.msh
```

These `-clmax` values are tuned by trial to land near the target counts;
exact counts vary slightly by gmsh version:

| File | clmax | tets (actual) |
| --- | --- | --- |
| `bench-100k.msh` | 0.0355 | 110,841 |
| `bench-1m.msh` | 0.0165 | 1,016,007 |

Both local-only files stay in this directory and are gitignored.

## Higher-order tet meshes (decisions.md #31)

`clean-order2.msh` / `clean-order3.msh`: the same `bench-cube.geo` unit cube,
meshed at order 2 (type 11, 10-node tets) and order 3 (type 29, 20-node
tets) directly by Gmsh's own 3D mesher — consistently oriented by
construction, used as the strict checkMesh-comparison gate for higher-order
corner extraction (`packages/core/test/metrics.test.ts`'s `higherOrderCases`).

```sh
export PATH="$HOME/.local/bin:$PATH"
gmsh bench-cube.geo -3 -order 2 -clmax 0.3 -format msh2 -o clean-order2.msh
gmsh bench-cube.geo -3 -order 3 -clmax 0.3 -format msh2 -o clean-order3.msh
```

Each needs a linearised sibling for the reference pipeline, since
`gmshToFoam` only reads Gmsh element type 4 (linear tet):

```sh
python3 -c "
import gmsh
gmsh.initialize()
gmsh.open('clean-order2.msh')   # or clean-order3.msh
gmsh.model.mesh.setOrder(1)
gmsh.option.setNumber('Mesh.SaveAll', 1)
gmsh.option.setNumber('Mesh.MshFileVersion', 2.2)
gmsh.write('clean-order2-linear.msh')   # or clean-order3-linear.msh
gmsh.finalize()
"
```

`cylinder_3d.msh`: a real, externally-sourced higher-order (type 29) tet
mesh of a channel with a cylindrical obstacle, provided directly (not
generated from a `.geo` in this repo — a deliberate, documented exception
to this directory's "`.geo` scripts only" convention, since there is no
`.geo` that reproduces this specific external mesh). It has a genuine
per-cell orientation defect baked into the source file: every even-indexed
element has negative signed corner volume, every odd-indexed element
positive (confirmed by hand, not a parsing bug) — `sum(|volume|)` over all
cells is 0.41615, matching the channel-minus-cylinder domain, so the
*geometry* is a valid tessellation; only the per-cell *winding* is
inconsistent. `gmshToFoam` and OpenFOAM's own downstream face/cell
construction resolve this orientation ambiguity differently from Gmsh's own
documented convention for a different subset of cells (confirmed: checkMesh
reports 6411 negative-volume cells and 25544 incorrectly-oriented faces,
not the 4896 this file's raw connectivity implies), so a checkMesh numeric
comparison is not meaningful for this file — it is used only as a
defect-detection smoke test (`packages/core/test/findings.test.ts`), not in
the reference pipeline.

Not regenerable from a script; keep the original file if this directory is
ever cleaned out. All of these `.msh` files stay local-only and gitignored.
