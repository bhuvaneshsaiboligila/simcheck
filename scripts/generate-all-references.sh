#!/bin/bash
# Generate reference JSON for all test meshes
# This script processes fixtures and benchmark meshes through the reference pipeline

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$REPO_ROOT/scripts/reference-pipeline.sh"

# Meshes to process: 4 pure-tet fixtures + 2 benchmarks
# Skip surface-only.msh and mixed-prism.msh (no volume cells)
declare -A MESHES=(
  ["tests/fixtures/single-tet.msh"]="tests/reference/single-tet.json"
  ["tests/fixtures/two-tets-orthogonal.msh"]="tests/reference/two-tets-orthogonal.json"
  ["tests/fixtures/two-tets-skewed.msh"]="tests/reference/two-tets-skewed.json"
  ["tests/fixtures/inverted-tet.msh"]="tests/reference/inverted-tet.json"
  ["meshes/bench-100k.msh"]="tests/reference/bench-100k.json"
  ["meshes/bench-1m.msh"]="tests/reference/bench-1m.json"
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

  if "$SCRIPT" "$mesh" "$output"; then
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
