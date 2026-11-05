#!/bin/bash
# Generate reference JSON for all test meshes
# This script processes fixtures and benchmark meshes through the reference pipeline

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$REPO_ROOT/scripts/reference-pipeline.sh"

# Meshes to process: 4 pure-tet fixtures + 2 benchmarks + 2 clean
# higher-order meshes. Skip surface-only.msh and mixed-prism.msh (no
# volume cells). meshes/cylinder_3d.msh is NOT processed here -- it has a
# genuine per-cell orientation defect that makes a checkMesh numeric
# comparison ill-defined (decisions.md #31); it's covered by its own
# defect-detection smoke test instead (packages/core/test/findings.test.ts),
# which doesn't need reference JSON at all.
#
# meshes/clean-order{2,3}-linear.msh are the LINEARISED siblings of
# meshes/clean-order{2,3}.msh (decisions.md #31): gmshToFoam only
# recognises Gmsh element type 4 (linear tet), so each higher-order
# (type 11 / type 29) mesh is run through `gmsh.model.mesh.setOrder(1)`
# first -- see meshes/README.md for the exact commands. checkMesh's
# numbers on the linearised mesh are what SimCheck's own corner-node
# metrics (run directly on the original higher-order file) are compared
# against.
declare -A MESHES=(
  ["tests/fixtures/single-tet.msh"]="tests/reference/single-tet.json"
  ["tests/fixtures/two-tets-orthogonal.msh"]="tests/reference/two-tets-orthogonal.json"
  ["tests/fixtures/two-tets-skewed.msh"]="tests/reference/two-tets-skewed.json"
  ["tests/fixtures/inverted-tet.msh"]="tests/reference/inverted-tet.json"
  ["meshes/bench-100k.msh"]="tests/reference/bench-100k.json"
  ["meshes/bench-1m.msh"]="tests/reference/bench-1m.json"
  ["meshes/clean-order2-linear.msh"]="tests/reference/clean-order2.json"
  ["meshes/clean-order3-linear.msh"]="tests/reference/clean-order3.json"
)

# decisions.md #37: for the higher-order pair, the file hashed into the
# output JSON's `meshSha256` must be the ORIGINAL higher-order mesh (what
# packages/core/test/metrics.test.ts actually parses), not the linearised
# sibling above that gmshToFoam needs. Every other mesh hashes itself, so
# only these two need an override.
declare -A HASH_MESH=(
  ["tests/reference/clean-order2.json"]="meshes/clean-order2.msh"
  ["tests/reference/clean-order3.json"]="meshes/clean-order3.msh"
)

echo "Starting reference pipeline generation..."
echo "========================================="

SUCCESS=0
FAILED=0

for mesh in "${!MESHES[@]}"; do
  output="${MESHES[$mesh]}"
  echo ""
  echo "Processing: $mesh"
  echo "Output: $output"

  if "$SCRIPT" "$mesh" "$output" "${HASH_MESH[$output]:-$mesh}"; then
    echo "✓ Success"
    SUCCESS=$((SUCCESS + 1))
  else
    echo "✗ Failed"
    FAILED=$((FAILED + 1))
  fi
done

echo ""
echo "========================================="
echo "Summary: $SUCCESS succeeded, $FAILED failed"

if [[ $FAILED -gt 0 ]]; then
  exit 1
fi

exit 0
