// Thin UI-layer orchestrator (docs/flow-spec.md §3.3): sequences calls into
// @simcheck/core and assembles a view of the results. No physics lives here —
// every formula and threshold is in packages/core.

import {
  resolveFluid,
  wallDistanceForYPlus,
  boundaryLayerThickness,
  solveLayers,
  maxTimestep,
  regimeFindings,
  type FluidInput,
  type FluidProperties,
  type Result,
  type SolverType,
  type WallDistanceResult,
  type LayerInputs,
  type LayerResult,
  type Finding,
  type InputError,
} from "@simcheck/core";

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function missingField(field: string, label: string): Result<never> {
  return {
    ok: false,
    error: { kind: "input-error", field, message: `${label} is required and must be a number` },
  };
}

/** Parses a text field into a number, or returns a Result-shaped error for display. */
export function parseField<T extends string>(
  value: string,
  field: T,
  label: string,
): Result<number> {
  if (value.trim() === "") {
    return missingField(field, label);
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return missingField(field, label);
  }
  return ok(n);
}

export interface FlowUiState {
  fluidKind: "air" | "water" | "custom";
  airTempC: string;
  airPressurePa: string;
  waterTempC: string;
  customDensity: string;
  customViscosity: string;

  solver: SolverType;

  velocityMS: string;
  xM: string;
  targetYPlus: string;

  layerMode: LayerInputs["mode"];
  layerFirstHeightM: string;
  layerGrowthRatio: string;
  layerNumLayers: string;
  layerTargetThicknessM: string;

  cflNumber: string;
  cellSizeM: string;
}

export interface FlowComputation {
  fluid: Result<FluidProperties>;
  wallDistance: Result<WallDistanceResult>;
  boundaryLayerM: number | null;
  regime: Finding[];
  layers: Result<LayerResult> | null;
  cfl: Result<number>;
}

function buildFluidInput(state: FlowUiState): Result<FluidInput> {
  switch (state.fluidKind) {
    case "air": {
      const temp = parseField(state.airTempC, "airTempC", "air temperature");
      if (!temp.ok) return temp as Result<never>;
      if (state.airPressurePa.trim() !== "") {
        const p = parseField(state.airPressurePa, "airPressurePa", "air pressure");
        if (!p.ok) return p as Result<never>;
        return ok({
          kind: "air",
          temperatureK: temp.value + 273.15,
          pressurePa: p.value,
        });
      }
      return ok({ kind: "air", temperatureK: temp.value + 273.15 });
    }
    case "water": {
      const temp = parseField(state.waterTempC, "waterTempC", "water temperature");
      if (!temp.ok) return temp as Result<never>;
      return ok({ kind: "water", temperatureK: temp.value + 273.15 });
    }
    case "custom": {
      const density = parseField(state.customDensity, "customDensity", "density");
      if (!density.ok) return density as Result<never>;
      const viscosity = parseField(
        state.customViscosity,
        "customViscosity",
        "dynamic viscosity",
      );
      if (!viscosity.ok) return viscosity as Result<never>;
      return ok({
        kind: "custom",
        densityKgM3: density.value,
        dynamicViscosityPaS: viscosity.value,
      });
    }
  }
}

function asFailure<T>(error: InputError): Result<T> {
  return { ok: false, error };
}

function computeFluid(state: FlowUiState): Result<FluidProperties> {
  const input = buildFluidInput(state);
  if (!input.ok) return input as Result<FluidProperties>;
  return resolveFluid(input.value);
}

function computeWallDistance(
  state: FlowUiState,
  fluid: Result<FluidProperties>,
): Result<WallDistanceResult> {
  const velocity = parseField(state.velocityMS, "velocityMS", "velocity");
  const x = parseField(state.xM, "xM", "distance x");
  const yplus = parseField(state.targetYPlus, "targetYPlus", "target y+");

  // Surface the first problem found, in a stable order, rather than only the
  // fluid error, so the user always sees *a* reason, never a silent NaN.
  if (!fluid.ok) return asFailure(fluid.error);
  if (!velocity.ok) return velocity as Result<WallDistanceResult>;
  if (!x.ok) return x as Result<WallDistanceResult>;
  if (!yplus.ok) return yplus as Result<WallDistanceResult>;

  return wallDistanceForYPlus({
    densityKgM3: fluid.value.densityKgM3,
    dynamicViscosityPaS: fluid.value.dynamicViscosityPaS,
    velocityMS: velocity.value,
    xM: x.value,
    targetYPlus: yplus.value,
    solver: state.solver,
  });
}

function computeLayers(state: FlowUiState): Result<LayerResult> | null {
  const firstHeight = parseField(
    state.layerFirstHeightM,
    "layerFirstHeightM",
    "first layer height",
  );
  if (!firstHeight.ok) return null;

  if (state.layerMode === "n-given-r") {
    const growthRatio = parseField(state.layerGrowthRatio, "layerGrowthRatio", "growth ratio");
    const target = parseField(
      state.layerTargetThicknessM,
      "layerTargetThicknessM",
      "target thickness",
    );
    if (!growthRatio.ok) return growthRatio as Result<LayerResult>;
    if (!target.ok) return target as Result<LayerResult>;
    return solveLayers({
      mode: "n-given-r",
      firstHeightM: firstHeight.value,
      growthRatio: growthRatio.value,
      targetThicknessM: target.value,
    });
  }

  if (state.layerMode === "r-given-n") {
    const numLayers = parseField(state.layerNumLayers, "layerNumLayers", "number of layers");
    const target = parseField(
      state.layerTargetThicknessM,
      "layerTargetThicknessM",
      "target thickness",
    );
    if (!numLayers.ok) return numLayers as Result<LayerResult>;
    if (!target.ok) return target as Result<LayerResult>;
    return solveLayers({
      mode: "r-given-n",
      firstHeightM: firstHeight.value,
      numLayers: numLayers.value,
      targetThicknessM: target.value,
    });
  }

  // r-equals-one
  const numLayers = parseField(state.layerNumLayers, "layerNumLayers", "number of layers");
  if (!numLayers.ok) return numLayers as Result<LayerResult>;
  return solveLayers({
    mode: "r-equals-one",
    firstHeightM: firstHeight.value,
    numLayers: numLayers.value,
  });
}

function computeCfl(state: FlowUiState): Result<number> {
  const cfl = parseField(state.cflNumber, "cflNumber", "CFL number");
  const cellSize = parseField(state.cellSizeM, "cellSizeM", "cell size");
  const velocity = parseField(state.velocityMS, "velocityMS", "velocity");
  if (!cfl.ok) return cfl as Result<number>;
  if (!cellSize.ok) return cellSize as Result<number>;
  if (!velocity.ok) return velocity as Result<number>;
  return maxTimestep({ cfl: cfl.value, cellSizeM: cellSize.value, velocityMS: velocity.value });
}

export function computeFlow(state: FlowUiState): FlowComputation {
  const fluid = computeFluid(state);
  const wallDistance = computeWallDistance(state, fluid);
  const boundaryLayerM = wallDistance.ok
    ? boundaryLayerThickness(Number(state.xM), wallDistance.value.reynoldsX)
    : null;
  const regime = wallDistance.ok ? regimeFindings(wallDistance.value.reynoldsX) : [];
  const layers = computeLayers(state);
  const cfl = computeCfl(state);

  return { fluid, wallDistance, boundaryLayerM, regime, layers, cfl };
}

export const REFERENCES = {
  reynolds: "Re_x = ρ·U·x/μ",
  cf: "Cf = 0.027·Re_x^(-1/7) (White, Fluid Mechanics, 1/7-power-law flat plate; docs/decisions.md #4/#22)",
  cfNote:
    "This uses Cf = 0.027·Re_x^(-1/7) (White, 1/7-power-law flat plate). Some other y+ calculators use 0.026 instead of 0.027 here, which gives a first cell height about 2% smaller — both are flat-plate estimates, not exact for your geometry.",
  tauW: "τw = ½·Cf·ρ·U²",
  uTau: "uτ = √(τw/ρ)",
  y: "y = y+·μ/(ρ·uτ)",
  firstCellHeight:
    "First cell height = 2y for cell-centred solvers (y+ at the first cell centre), y for vertex-based solvers (y+ at the first node). docs/decisions.md #6",
  delta:
    "δ ≈ 0.16·x·Re_x^(-1/7) (White, Fluid Mechanics, turbulent flat-plate 1/7-power-law; docs/decisions.md #4)",
  layers: "T = h·(r^N − 1)/(r − 1); r = 1 → T = N·h. docs/decisions.md #8",
  cfl: "Δt_max = CFL·Δx/|U|",
} as const;
