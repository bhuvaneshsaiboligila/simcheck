#!/usr/bin/env bash
# Run once from the simcheck repo root.
set -e
mkdir -p refs .claude/agents
[ -d refs/gmsh ]          || git clone --depth 1 https://gitlab.onelab.info/gmsh/gmsh.git refs/gmsh
[ -d refs/meshio ]        || git clone --depth 1 https://github.com/nschloe/meshio.git refs/meshio
[ -d refs/OpenFOAM-dev ]  || git clone --depth 1 https://github.com/OpenFOAM/OpenFOAM-dev.git refs/OpenFOAM-dev
TMP=$(mktemp -d)
git clone --depth 1 https://github.com/VoltAgent/awesome-claude-code-subagents.git "$TMP/volt"
for a in typescript-pro frontend-developer performance-engineer code-reviewer deployment-engineer; do
  f=$(find "$TMP/volt" -name "$a.md" | head -n 1)
  if [ -n "$f" ]; then cp "$f" .claude/agents/; echo "added $a"; else echo "NOT FOUND: $a"; fi
done
rm -rf "$TMP"
echo "Agents:"; ls .claude/agents
