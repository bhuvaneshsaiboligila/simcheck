#!/bin/bash
# SimCheck reference pipeline: Gmsh .msh → gmshToFoam → checkMesh → JSON
# Usage: ./scripts/reference-pipeline.sh <mesh-file> <output-json> [hash-mesh-file]
# Example: ./scripts/reference-pipeline.sh tests/fixtures/single-tet.msh tests/reference/single-tet.json
#
# hash-mesh-file (optional, defaults to mesh-file): the file whose sha256
# is recorded in the output JSON as `meshSha256` (decisions.md #37). This
# is the file packages/core/test/metrics.test.ts actually parses -- for
# the higher-order pair that's the original higher-order mesh, not the
# linearised sibling passed as mesh-file (gmshToFoam only reads linear
# tets, decisions.md #31), so the two differ there.

set -eu

MESH_FILE="${1:-}"
OUTPUT_JSON="${2:-}"
HASH_MESH_FILE="${3:-$MESH_FILE}"

if [[ -z "$MESH_FILE" || -z "$OUTPUT_JSON" ]]; then
  echo "Usage: $0 <mesh-file> <output-json>"
  echo "Example: $0 tests/fixtures/single-tet.msh tests/reference/single-tet.json"
  exit 1
fi

# Get absolute paths
MESH_ABS="$(cd "$(dirname "$MESH_FILE")" && pwd)/$(basename "$MESH_FILE")"
OUTPUT_ABS="$(cd "$(dirname "$OUTPUT_JSON")" && pwd)/$(basename "$OUTPUT_JSON")"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CASE_TEMPLATE="$REPO_ROOT/scripts/case-template"

# Verify inputs
if [[ ! -f "$MESH_ABS" ]]; then
  echo "Error: Mesh file not found: $MESH_ABS"
  exit 1
fi

if [[ ! -d "$CASE_TEMPLATE" ]]; then
  echo "Error: Case template not found: $CASE_TEMPLATE"
  exit 1
fi

# Create temp working directory
WORK_DIR=$(mktemp -d)
trap "rm -rf '$WORK_DIR'" EXIT

# Copy case template
cp -r "$CASE_TEMPLATE"/* "$WORK_DIR/"

# Run gmshToFoam and checkMesh inside Docker
# Mounts:
#   - mesh file directory
#   - working directory (case)
docker run --rm \
  --user "$(id -u):$(id -g)" \
  -v "$(dirname "$MESH_ABS"):/meshes:ro" \
  -v "$WORK_DIR:/case" \
  opencfd/openfoam-default:2512 \
  bash -c "
    set -e
    cd /case

    # Convert mesh: gmshToFoam reads /meshes/$(basename "$MESH_ABS") and writes to constant/polyMesh
    gmshToFoam -case . /meshes/$(basename "$MESH_ABS") 2>&1 || {
      echo 'gmshToFoam failed'
      exit 1
    }

    # Run checkMesh with all field output
    # Note: -writeAllFields writes per-cell/per-face fields directly into
    # the case's current time directory (constant/, since gmshToFoam left
    # no prior time data), not into postProcessing/.
    checkMesh -case . -writeAllFields 2>&1

    # Also run checkMesh without -writeAllFields to capture summary to stdout
    # (some versions may have different output behavior)
    checkMesh -case . 2>&1
  " > "$WORK_DIR/checkmesh-output.txt" 2>&1

# Check if polyMesh was created (gmshToFoam succeeded)
if [[ ! -d "$WORK_DIR/constant/polyMesh" ]]; then
  echo "{\"error\": \"gmshToFoam failed or produced no mesh\", \"mesh\": \"$MESH_FILE\"}" > "$OUTPUT_ABS"
  echo "Warning: gmshToFoam failed for $MESH_FILE, written error marker to JSON"
  exit 0
fi

# Convert checkMesh output to JSON using Node script
HASH_MESH_ABS="$(cd "$(dirname "$HASH_MESH_FILE")" && pwd)/$(basename "$HASH_MESH_FILE")"

node "$REPO_ROOT/scripts/format-reference-json.js" \
  "$WORK_DIR/checkmesh-output.txt" \
  "$WORK_DIR/constant/polyMesh" \
  "$WORK_DIR" \
  "$MESH_FILE" \
  "$HASH_MESH_ABS" \
  > "$OUTPUT_ABS"

echo "Generated reference JSON: $OUTPUT_ABS"
