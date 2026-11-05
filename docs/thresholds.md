# OpenFOAM reference: fork, version, thresholds

## Fork and version

- Fork: ESI/OpenCFD OpenFOAM (openfoam.com), not the FOAM Extend / `.org` community fork.
- Version: **v2512**, the latest release with an official Docker image as of 2026-11-04.
- Source: tag `OpenFOAM-v2512` at `https://gitlab.com/openfoam/core/openfoam` (commit `87ed40d256d22ea38fcc648dfc82a22162427b18`). Checked out read-only into `refs/OpenFOAM-v2512` (gitignored, not committed), replacing `refs/OpenFOAM-dev`.
- Docker image: `opencfd/openfoam-default:2512` (confirmed against Docker Hub's API tag list directly: `latest` → `2512`, pushed 2026-01-23).

Decision recorded: `docs/decisions.md` #25.

## checkMesh capabilities (v2512)

Source: `refs/OpenFOAM-v2512/applications/utilities/mesh/manipulation/checkMesh/checkMesh.C`.

- Supports `-writeFields '(<fieldName>)'` (write named per-cell/per-face fields) and `-writeAllFields` (write every available check field), implemented via `writeFields.C`/`writeFields.H` in the same directory.
- `-writeAllFields` combined with `-writeAllSurfaceFields` also writes face (surface) fields.
- This means the reference pipeline (milestone 6, PLAN.md v0.2 "Reference" step 3) can use `-writeFields`/`-writeAllFields` for a true per-cell comparison against SimCheck's own metrics, not just checkMesh's printed summary statistics (decision #16 on comparing statistics rather than cell IDs still applies, since `gmshToFoam` renumbers cells).

## checkMesh metric definitions and thresholds (v2512, plain `checkMesh`, no `-meshQuality` dict)

Source: `refs/OpenFOAM-v2512/src/OpenFOAM/meshes/primitiveMesh/primitiveMeshCheck/primitiveMeshCheck.C` and `primitiveMeshTools.C`. All four hard-coded defaults below are `static scalar` members with no dict involved for a plain `checkMesh` run (no `-meshQuality` flag).

**Correction to the earlier guess**: aspect ratio threshold is **1000**, skewness threshold is **4** — these were swapped in the original guess ("70°, 4, 1000" was read in the wrong order). Confirmed from source, not memory.

| Metric | Formula source | Threshold | Outcome if exceeded |
| --- | --- | --- | --- |
| Volume | `primitiveMeshCheck.C` `checkCellVolumes()`; volume via face-pyramid decomposition in `primitiveMeshTools::makeCellCentresAndVols` | `vol < VSMALL` (≈1e-300) | Hard FAIL — `***Zero or negative cell volume detected` |
| Aspect ratio | `primitiveMeshTools::cellClosedness()`: per-cell max/min Cartesian-component face-area-sum ratio, and (3D) `(1/6)·ΣA/V^(2/3)`, take the max of the two | `aspectThreshold_ = 1000` (`primitiveMeshCheck.C:40`) | Hard FAIL — `***High aspect ratio cells found` |
| Non-orthogonality | `primitiveMeshTools::faceOrthogonality()`: cos(angle) between owner→neighbour centroid vector and face area vector; **internal faces only** | `nonOrthThreshold_ = 70°` (`primitiveMeshCheck.C:41`) | Two tiers on the same 70° gate: `cos(70°) ≤ ortho` → OK; `ortho < cos(70°)` and `ortho > SMALL` (angle 70°–~90°) → WARNING only ("severely non-orthogonal", does not fail); `ortho ≤ SMALL` (angle ≥~90°) → hard FAIL ("non-orthogonality errors") |
| Skewness | `primitiveMeshTools::faceSkewness()` (internal) / `boundaryFaceSkewness()` (boundary, mirrors the missing neighbour across the face plane); same single threshold for both | `skewThreshold_ = 4` (`primitiveMeshCheck.C:42`) | Hard FAIL — `***Max skewness = ... highly skew faces detected` |

Note: the separate `-meshQuality` dict path (not used by plain `checkMesh`, so not relevant to the default reference pipeline) has different values: `maxNonOrtho 65`, `maxInternalSkewness 4`, `maxBoundarySkewness 20`, and no aspect-ratio entry at all. SimCheck's reference pipeline runs plain `checkMesh` with no dict, so the table above is the one that applies.

Printed precision: checkMesh's `Info<<` console output uses `writePrecision 6` (6 significant digits, `etc/controlDict`), giving ~1e-6 relative rounding error — well inside decision #15's 1e-4 relative tolerance for comparing SimCheck's computed statistics against checkMesh's printed max/mean values. No correction needed there.

**Correction**: `writePrecision` also governs checkMesh's ASCII *field file* output (`-writeAllFields`), not just console log output — the reference pipeline's case template originally inherited the default `writePrecision 6`, so `tests/reference/*.json`'s `perCellFields` values only carried ~6 significant digits, which cannot satisfy decision #15's 1e-6 relative tolerance on written fields regardless of implementation correctness (milestone 7 hit this directly: every metric overshot 1e-6 by a small, uniform ~2-3x margin, consistent with 6-sig-fig rounding, not a formula bug). Fixed by setting `writePrecision 17` in `scripts/case-template/system/controlDict` (round-trips a full IEEE double) and regenerating all 6 reference JSON files — decision #15's tolerance itself was kept exactly as-is, not loosened (decision #27).

**Largest observed error after the fix**: across all 8 reference meshes now committed under `tests/reference/` (the 4 tiny fixtures, `bench-100k`/`bench-1m`, and the two higher-order siblings `clean-order2`/`clean-order3` added for decision #31), all 4 metrics (`cellVolume`, `aspectRatio`, `nonOrthoAngle`, `skewness`), and all 3 statistics (min/max/mean) — 96 comparisons total — the largest relative error between SimCheck's computed value and checkMesh's `perCellFields` value is **3.39e-13** (`bench-1m`, `skewness`, min: got `0.019833880596501492`, checkMesh `0.019833880596508213`). The higher-order pair's own largest error is smaller, 1.2e-14 (decision #31). Both are ordinary IEEE double floating-point rounding noise, at least 6 orders of magnitude inside the 1e-6 relative tolerance — not a sign of any remaining formula or precision gap.

Decisions recorded: `docs/decisions.md` #26, #27, #28.

## Reference pipeline

Scripts (not CLAUDE.md byte-scanner-restricted code — plain shell/Node glue, not `packages/core`):

- `scripts/case-template/` — minimal OpenFOAM case (`system/controlDict`, `fvSchemes`, `fvSolution`) reused for every mesh; `gmshToFoam` fills in `constant/polyMesh`.
- `scripts/reference-pipeline.sh <mesh.msh> <output.json>` — runs `opencfd/openfoam-default:2512` via Docker as the host UID/GID (not root, so files stay host-owned and cleanup doesn't orphan temp dirs), does `gmshToFoam` then `checkMesh -writeAllFields` then `checkMesh` (plain, for the clean stdout summary), and shapes the result into JSON via `scripts/format-reference-json.js`.
- `scripts/generate-all-references.sh` — runs the above over the 6 processable meshes (the 4 pure-tet fixtures with volume cells, plus `meshes/bench-100k.msh` and `meshes/bench-1m.msh`; `surface-only.msh` and `mixed-prism.msh` are skipped — no volume cells / not pure-tet, same as SimCheck's own parser would reject).

Output: `tests/reference/<mesh-name>.json`, committed (76–80 KB total for all 6). Each file has:
- `checkMesh.stdout` — the full raw log (gmshToFoam + `checkMesh -writeAllFields` + plain `checkMesh`), for audit/debugging.
- `checkMesh.summary` — regex-extracted volume/aspect-ratio/skewness/counts from checkMesh's own printed summary (6 significant figures).
- `polyMesh` — `pointCount`/`cellCount`/`faceCount`/`internalFaceCount`, parsed from the `owner` file's `FoamFile` `note` field (`"nPoints:N nCells:N nFaces:N nInternalFaces:N"`) — the only reliable source, since `points`/`faces`/`owner` list bodies use OpenFOAM's run-length-compressed syntax for uniform values (e.g. a 1-cell mesh's `owner` list is written as `4{0}`, not four lines), so counting non-comment lines in the list body is wrong by construction for any mesh with repeated values, not just an off-by-one on the header.
- `perCellFields` — one entry per mesh-quality field written by `-writeAllFields` into the case's `constant/` directory (`aspectRatio`, `cellAspectRatio`, `cellDeterminant`, `cellShapes`, `cellVolume`, `cellVolumeRatio`, `faceWeight`, `minPyrVolume`, `minTetVolume`, `nonOrthoAngle`, `skewness`; `wallDistance` only when a wall patch exists). Each is reduced to `{count, min, max, mean}` computed from the field's full double-precision values (not checkMesh's 6-sig-fig printed summary) — not the raw per-cell values, since decision #16 means per-cell IDs aren't comparable against SimCheck's own output anyway (`gmshToFoam` renumbers cells), and storing ~1M raw values per field would make the committed JSON huge for no benefit. (`-writeAllFields` writes directly into the case's current time directory, `constant/` here, not into a `postProcessing/` directory — there is no `postProcessing/` step in this pipeline.)

Verified end-to-end on all 6 meshes, including the 1M-tet benchmark mesh (1,016,007 cells, matching the milestone 5 benchmark mesh exactly).

## Higher-order tets (decisions.md #31)

`gmshToFoam` only reads Gmsh element type 4 (linear tet, confirmed: `MSHTET = 4` hardcoded in `gmshToFoam.C`, no case for types 11/29/30/31). So the reference pipeline for a higher-order mesh needs a linearised sibling, generated via the Gmsh Python API (not the `gmsh` CLI's `-order` flag, which only applies during fresh mesh generation and does not downgrade an already-higher-order file):

```python
import gmsh
gmsh.initialize()
gmsh.open("higher-order-mesh.msh")
gmsh.model.mesh.setOrder(1)
gmsh.option.setNumber("Mesh.SaveAll", 1)
gmsh.option.setNumber("Mesh.MshFileVersion", 2.2)
gmsh.write("higher-order-mesh-linear.msh")
gmsh.finalize()
```

The checkMesh reference for a higher-order mesh is generated from this linear sibling; SimCheck's own metrics are computed directly on the original higher-order file (exercising its real corner-extraction code path). See `meshes/README.md` for the exact commands used for `clean-order2.msh`/`clean-order3.msh`, and decisions.md #31 for why `cylinder_3d.msh` is not part of this comparison.
