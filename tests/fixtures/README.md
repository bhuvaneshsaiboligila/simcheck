# Mesh fixtures

Tiny Gmsh v2.2 ASCII meshes with exact expected values. Every parser and metric change must pass these first. v4.1 versions are generated from these with Gmsh (`gmsh file.msh -save -format msh41 -o file-v41.msh`) and must give identical results.

Element line format (v2.2): `id type nTags physical entity nodes...`. Type 4 = linear tet, 2 = triangle, 6 = prism.

| File | Expected |
| --- | --- |
| `single-tet.msh` | 1 cell, volume 1/6 = 0.166667; 4 faces, 0 internal, 4 boundary; centroid (0.25, 0.25, 0.25) |
| `two-tets-orthogonal.msh` | 2 cells, volumes 1/6 and 1/3; 7 faces, 1 internal, 6 boundary; internal face non-orthogonality 0°; internal-face skewness 0 (centroid line passes through face centre (1/3, 1/3, 1/3)) |
| `two-tets-skewed.msh` | 2 cells, volumes 1/6 and 1/3; 1 internal face; non-orthogonality 35.2644° for both cells (centroids (0.25,0.25,0.25) and (0.75,0.375,0.375), face normal (1,1,1)/√3); per-cell skewness (checkMesh's own max-over-the-cell's-faces field, not a single mesh-wide value) is 0.25 for cell 0 and 0.16958 for cell 1 — see `tests/reference/two-tets-skewed.json`'s `perCellFields.skewness` |
| `inverted-tet.msh` | 1 cell, volume −1/6 → volume check **fail** |
| `surface-only.msh` | 1 triangle, no tets → 2D-mesh error: "This is a 2D mesh (1 triangles). SimCheck checks 3D tetrahedral meshes — mesh a volume in Gmsh (Mesh → 3D)." |
| `rectangle-2d.msh` | A unit square meshed as 2 triangles, no tets → same 2D-mesh error, "2 triangles" |
| `mixed-prism.msh` | Contains a prism (type 6) → rejected: "Only tetrahedral meshes are supported in v0.2." |

A file with elements but none of dimension 3 gets a message naming what it actually has, not the generic physical-group hint — the hint is only shown when the file has no elements of any kind (e.g. an empty `$Elements` section). See `noVolumeCellsMessage` in `packages/core/src/parsers/gmsh.ts`.

Physical group 1 is used for all cells; there is no `$PhysicalNames` section, so the name shown is "group 1". Add a fixture with `$PhysicalNames` when that feature is built.

Large meshes (100k, 1M tets) are generated in CI from `.geo` files in `meshes/` and are never committed.
