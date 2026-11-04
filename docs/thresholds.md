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

Printed precision: checkMesh's `Info<<` output uses `writePrecision 6` (6 significant digits, `etc/controlDict`), giving ~1e-6 relative rounding error — well inside decision #15's 1e-4 relative tolerance for comparing SimCheck's computed statistics against checkMesh's printed max/mean values. No correction needed to decision #15.

Decision recorded: `docs/decisions.md` #26.

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
