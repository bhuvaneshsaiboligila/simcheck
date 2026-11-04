#!/usr/bin/env node
/**
 * Format checkMesh output and per-cell quality fields into JSON reference data.
 * Usage: node format-reference-json.js <checkmesh-output> <polymesh-dir> <case-dir> <mesh-name>
 */

const fs = require('fs');
const path = require('path');

const [, , checkMeshOutput, polyMeshDir, caseDir, meshName] = process.argv;

if (!checkMeshOutput || !polyMeshDir) {
  console.error('Usage: node format-reference-json.js <checkmesh-output> <polymesh-dir> <case-dir> <mesh-name>');
  process.exit(1);
}

// Parse checkMesh text output
function parseCheckMeshOutput(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const result = {
    mesh: meshName || 'unknown',
    timestamp: new Date().toISOString(),
    checkMesh: {
      stdout: content,
      summary: {}
    }
  };

  // Extract summary statistics using regex patterns
  // checkMesh outputs lines like:
  // "Mesh non-orthogonality Min: 0 average: 0 Max: 0"
  // "Mesh aspect ratio : Min: 1 average: 1.5 Max: 2"

  // Extract metrics from checkMesh output
  // Format: "Min <val>. Max <val>. <label>"
  const volumeMatch = content.match(/Min volume = ([\d.e+\-]+)\. Max volume = ([\d.e+\-]+)\./i);
  if (volumeMatch) {
    result.checkMesh.summary.volume = {
      min: parseFloat(volumeMatch[1]),
      max: parseFloat(volumeMatch[2])
    };
  }

  const aspectRatioMatch = content.match(/Max aspect ratio = ([\d.e+\-]+)/i);
  if (aspectRatioMatch) {
    result.checkMesh.summary.maxAspectRatio = parseFloat(aspectRatioMatch[1]);
  }

  const skewnessMatch = content.match(/Max skewness = ([\d.e+\-]+)/i);
  if (skewnessMatch) {
    result.checkMesh.summary.maxSkewness = parseFloat(skewnessMatch[1]);
  }

  // Non-orthogonality: checkMesh doesn't always print it in "Checking geometry"
  // but may have it in field output or as "Non-orthogonality check OK"
  const nonOrthoMatch = content.match(/non-orthogonality.*?Min:\s*([\d.e+\-]+)\s+.*?Max:\s*([\d.e+\-]+)/i);
  if (nonOrthoMatch) {
    result.checkMesh.summary.nonOrthogonality = {
      min: parseFloat(nonOrthoMatch[1]),
      max: parseFloat(nonOrthoMatch[2])
    };
  }

  // Extract cell/face/point counts from "Mesh stats" section
  // Format: "    cells:            N"
  const cellCountMatch = content.match(/^\s+cells:\s+(\d+)/m);
  const faceCountMatch = content.match(/^\s+faces:\s+(\d+)/m);
  const pointCountMatch = content.match(/^\s+points:\s+(\d+)/m);

  if (cellCountMatch) result.checkMesh.summary.cellCount = parseInt(cellCountMatch[1], 10);
  if (faceCountMatch) result.checkMesh.summary.faceCount = parseInt(faceCountMatch[1], 10);
  if (pointCountMatch) result.checkMesh.summary.pointCount = parseInt(pointCountMatch[1], 10);

  return result;
}

// Read polyMesh properties from the `owner` file's FoamFile `note` field,
// e.g. `note "nPoints:4  nCells:1  nFaces:4  nInternalFaces:0";`. This is
// the only reliable source: `points`/`faces`/`owner` list bodies use
// OpenFOAM's compressed run-length syntax for uniform values (e.g. a
// single-tet owner list is written as `4{0}`, one line, not one line per
// entry), so counting non-comment lines in the list body undercounts
// almost every mesh and is wrong by construction, not just off-by-one on
// the header.
function readPolyMesh(polyMeshDir) {
  const result = {};

  try {
    const ownerFile = path.join(polyMeshDir, 'owner');
    if (fs.existsSync(ownerFile)) {
      const ownerContent = fs.readFileSync(ownerFile, 'utf-8');
      const noteMatch = ownerContent.match(
        /note\s+"nPoints:(\d+)\s+nCells:(\d+)\s+nFaces:(\d+)\s+nInternalFaces:(\d+)"/,
      );
      if (noteMatch) {
        result.pointCount = parseInt(noteMatch[1], 10);
        result.cellCount = parseInt(noteMatch[2], 10);
        result.faceCount = parseInt(noteMatch[3], 10);
        result.internalFaceCount = parseInt(noteMatch[4], 10);
      }
    }
  } catch (e) {
    // Silently fail if files don't exist or can't be read
  }

  return result;
}

// `checkMesh -writeAllFields` writes each mesh-quality field (aspectRatio,
// skewness, nonOrthoAngle, cellVolume, ...) as a plain OpenFOAM field file
// directly in the case's current time directory -- here always `constant`,
// since gmshToFoam leaves the case with no prior time data and checkMesh
// resolves `startFrom latestTime` to `constant`. There is no
// `postProcessing/` directory involved.
const QUALITY_FIELD_NAMES = [
  'aspectRatio', 'cellAspectRatio', 'cellDeterminant', 'cellShapes',
  'cellVolume', 'cellVolumeRatio', 'faceWeight', 'minPyrVolume',
  'minTetVolume', 'nonOrthoAngle', 'skewness', 'wallDistance',
];

// Parses an OpenFOAM `internalField` entry -- either
// `uniform <value>;` or `nonuniform List<scalar> N(v1 v2 ...);` /
// `nonuniform List<scalar>\nN\n(\nv1\nv2\n...\n)\n;` -- into a value array.
// Returns null for non-scalar fields (e.g. cellShapes, which is a label
// list of enum codes, not something min/max/mean is meaningful for).
function parseInternalField(content) {
  const uniform = content.match(/internalField\s+uniform\s+([-\d.eE+]+)\s*;/);
  if (uniform) return [parseFloat(uniform[1])];

  const nonuniform = content.match(
    /internalField\s+nonuniform\s+List<scalar>\s*\n?\s*(\d+)\s*\(([\s\S]*?)\)\s*;/,
  );
  if (nonuniform) {
    const values = nonuniform[2].trim().split(/\s+/).filter(Boolean).map(parseFloat);
    return values;
  }

  return null;
}

// Reads each mesh-quality field written by `-writeAllFields` and reduces
// it to min/max/mean/count rather than storing every per-cell value --
// decision #16 means per-cell IDs aren't comparable against SimCheck's own
// output anyway (gmshToFoam renumbers cells), and committed reference JSON
// must stay small even for the 1M-cell benchmark mesh. These stats are
// computed from the field's full double precision, not from checkMesh's
// 6-significant-figure printed summary.
function readPerCellFields(caseDir) {
  const fields = {};
  if (!caseDir) return fields;

  const fieldDir = path.join(caseDir, 'constant');
  if (!fs.existsSync(fieldDir)) return fields;

  for (const name of QUALITY_FIELD_NAMES) {
    const filePath = path.join(fieldDir, name);
    if (!fs.existsSync(filePath)) continue;

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const values = parseInternalField(content);
      if (!values || values.length === 0) continue;

      // Not Math.min(...values)/Math.max(...values): spreading ~1M
      // elements into call arguments exceeds V8's argument-count limit and
      // throws, which the catch below would then silently swallow for
      // every genuinely per-cell field on the 1M-tet benchmark mesh.
      let min = Infinity;
      let max = -Infinity;
      let sum = 0;
      for (const v of values) {
        if (v < min) min = v;
        if (v > max) max = v;
        sum += v;
      }
      fields[name] = { count: values.length, min, max, mean: sum / values.length };
    } catch (e) {
      console.error(`Warning: could not parse field ${name} at ${filePath}: ${e.message}`);
    }
  }

  return fields;
}

try {
  const result = parseCheckMeshOutput(checkMeshOutput);
  const polyMeshProps = readPolyMesh(polyMeshDir);
  const fields = readPerCellFields(caseDir);

  result.polyMesh = polyMeshProps;
  if (Object.keys(fields).length > 0) {
    result.perCellFields = fields;
  }

  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error('Error formatting reference JSON:', error.message);
  console.log(JSON.stringify({
    error: error.message,
    mesh: meshName
  }, null, 2));
  process.exit(1);
}
