import { err, ok, type Result } from "../../types.js";

/**
 * delta = 0.16 * x * Re_x^(-1/7).
 *
 * No input validation here: the caller has already validated xM and
 * reynoldsX upstream via reynoldsX()/yplus.ts.
 */
export function boundaryLayerThickness(xM: number, reynoldsX: number): number {
  return 0.16 * xM * Math.pow(reynoldsX, -1 / 7);
}

export interface LayerInputsNGivenR {
  mode: "n-given-r";
  firstHeightM: number;
  growthRatio: number; // r
  targetThicknessM: number; // delta, or user-entered target
}

export interface LayerInputsRGivenN {
  mode: "r-given-n";
  firstHeightM: number;
  numLayers: number; // N, positive integer
  targetThicknessM: number;
}

export interface LayerInputsFixedR1 {
  mode: "r-equals-one";
  firstHeightM: number;
  numLayers: number;
}

export type LayerInputs =
  | LayerInputsNGivenR
  | LayerInputsRGivenN
  | LayerInputsFixedR1;

export interface LayerResult {
  numLayers?: number; // present for n-given-r, r-equals-one
  growthRatio?: number; // present for r-given-n (and trivially 1 for r-equals-one, echoed back)
  totalThicknessM: number;
}

const BISECTION_RELATIVE_TOLERANCE = 1e-6;
const BISECTION_MAX_ITERATIONS = 100;

function totalThicknessForRatio(h: number, r: number, n: number): number {
  if (r === 1) {
    return n * h;
  }
  return (h * (Math.pow(r, n) - 1)) / (r - 1);
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function solveNGivenR(inputs: LayerInputsNGivenR): Result<LayerResult> {
  const { firstHeightM, growthRatio, targetThicknessM } = inputs;

  if (firstHeightM <= 0) {
    return err("firstHeightM", "first height must be greater than 0 m");
  }
  if (targetThicknessM <= 0) {
    return err("targetThicknessM", "target thickness must be greater than 0 m");
  }
  if (growthRatio <= 0) {
    return err("growthRatio", "growth ratio must be greater than 0");
  }
  if (growthRatio === 1) {
    return err(
      "growthRatio",
      "growth ratio of exactly 1 must use mode \"r-equals-one\", not \"n-given-r\"",
    );
  }

  // N = ceil( ln(1 + target*(r-1)/h) / ln(r) )
  const raw =
    Math.log(1 + (targetThicknessM * (growthRatio - 1)) / firstHeightM) /
    Math.log(growthRatio);
  let n = Math.ceil(raw);
  if (n < 1) {
    n = 1;
  }

  // Floating-point ceil on a log can be off by one at exact boundaries;
  // verify with the closed-form T(N) and bump up until it actually covers
  // the target.
  while (totalThicknessForRatio(firstHeightM, growthRatio, n) < targetThicknessM) {
    n += 1;
  }

  return ok({
    numLayers: n,
    totalThicknessM: totalThicknessForRatio(firstHeightM, growthRatio, n),
  });
}

function solveRGivenN(inputs: LayerInputsRGivenN): Result<LayerResult> {
  const { firstHeightM, numLayers, targetThicknessM } = inputs;

  if (firstHeightM <= 0) {
    return err("firstHeightM", "first height must be greater than 0 m");
  }
  if (targetThicknessM <= 0) {
    return err("targetThicknessM", "target thickness must be greater than 0 m");
  }
  if (!isPositiveInteger(numLayers)) {
    return err("numLayers", "number of layers must be a positive integer");
  }

  const flatThickness = numLayers * firstHeightM;

  if (targetThicknessM < flatThickness) {
    const relDiff = (flatThickness - targetThicknessM) / flatThickness;
    if (relDiff > BISECTION_RELATIVE_TOLERANCE) {
      return err(
        "targetThicknessM",
        "target thickness is smaller than N layers at the first height; reduce N or increase target",
      );
    }
  }

  const relDiffAtOne =
    Math.abs(targetThicknessM - flatThickness) / flatThickness;
  if (relDiffAtOne < BISECTION_RELATIVE_TOLERANCE) {
    return ok({ growthRatio: 1, totalThicknessM: flatThickness });
  }

  // Bisection on r in (1, hi), expanding hi until T(hi) >= target.
  let lo = 1;
  let hi = 2;
  let iterations = 0;
  while (
    totalThicknessForRatio(firstHeightM, hi, numLayers) < targetThicknessM &&
    iterations < BISECTION_MAX_ITERATIONS
  ) {
    hi *= 2;
    iterations += 1;
  }
  if (totalThicknessForRatio(firstHeightM, hi, numLayers) < targetThicknessM) {
    return err(
      "targetThicknessM",
      "could not find a growth ratio reaching the target thickness within the iteration limit",
    );
  }

  let mid = (lo + hi) / 2;
  let converged = false;
  for (let i = 0; i < BISECTION_MAX_ITERATIONS; i++) {
    mid = (lo + hi) / 2;
    const t = totalThicknessForRatio(firstHeightM, mid, numLayers);

    if (t < targetThicknessM) {
      lo = mid;
    } else {
      hi = mid;
    }

    const relativeWidth = (hi - lo) / mid;
    if (relativeWidth < BISECTION_RELATIVE_TOLERANCE) {
      converged = true;
      break;
    }
  }

  if (!converged) {
    return err(
      "targetThicknessM",
      "growth ratio bisection did not converge within the iteration limit",
    );
  }

  return ok({
    growthRatio: mid,
    totalThicknessM: totalThicknessForRatio(firstHeightM, mid, numLayers),
  });
}

function solveFixedR1(inputs: LayerInputsFixedR1): Result<LayerResult> {
  const { firstHeightM, numLayers } = inputs;

  if (firstHeightM <= 0) {
    return err("firstHeightM", "first height must be greater than 0 m");
  }
  if (!isPositiveInteger(numLayers)) {
    return err("numLayers", "number of layers must be a positive integer");
  }

  return ok({
    numLayers,
    growthRatio: 1,
    totalThicknessM: numLayers * firstHeightM,
  });
}

export function solveLayers(inputs: LayerInputs): Result<LayerResult> {
  switch (inputs.mode) {
    case "n-given-r":
      return solveNGivenR(inputs);
    case "r-given-n":
      return solveRGivenN(inputs);
    case "r-equals-one":
      return solveFixedR1(inputs);
  }
}
