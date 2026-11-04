import { err, ok, type Result } from "./types.js";

export const SUTHERLAND_MU0 = 1.716e-5; // Pa·s, source: decisions.md #5
export const SUTHERLAND_T0 = 273.15; // K
export const SUTHERLAND_S = 110.4; // K
export const IDEAL_GAS_R_AIR = 287.05; // J/(kg·K)
export const DEFAULT_PRESSURE_PA = 101325;

export interface FluidProperties {
  densityKgM3: number;
  dynamicViscosityPaS: number;
  kinematicViscosityM2S: number; // = mu / rho, derived, not independently input
  source: string; // for Finding.reference, e.g. "ideal gas + Sutherland"
}

/**
 * Water property table, 1 atm, 0-80 degC in 5 degC steps.
 * Source of record: IAPWS/NIST-consistent engineering "properties of water"
 * appendix values (docs/decisions.md #23, docs/flow-spec.md §2).
 * Exact textbook table/edition/page is still "verify".
 */
const WATER_TABLE: ReadonlyArray<{
  temperatureK: number;
  densityKgM3: number;
  dynamicViscosityPaS: number;
}> = [
  { temperatureK: 273.15, densityKgM3: 999.8, dynamicViscosityPaS: 1.792e-3 },
  { temperatureK: 278.15, densityKgM3: 999.9, dynamicViscosityPaS: 1.519e-3 },
  { temperatureK: 283.15, densityKgM3: 999.7, dynamicViscosityPaS: 1.307e-3 },
  { temperatureK: 288.15, densityKgM3: 999.1, dynamicViscosityPaS: 1.138e-3 },
  { temperatureK: 293.15, densityKgM3: 998.2, dynamicViscosityPaS: 1.002e-3 },
  { temperatureK: 298.15, densityKgM3: 997.0, dynamicViscosityPaS: 8.9e-4 },
  { temperatureK: 303.15, densityKgM3: 995.7, dynamicViscosityPaS: 7.975e-4 },
  { temperatureK: 308.15, densityKgM3: 994.0, dynamicViscosityPaS: 7.19e-4 },
  { temperatureK: 313.15, densityKgM3: 992.2, dynamicViscosityPaS: 6.53e-4 },
  { temperatureK: 318.15, densityKgM3: 990.2, dynamicViscosityPaS: 5.96e-4 },
  { temperatureK: 323.15, densityKgM3: 988.0, dynamicViscosityPaS: 5.47e-4 },
  { temperatureK: 328.15, densityKgM3: 985.7, dynamicViscosityPaS: 5.04e-4 },
  { temperatureK: 333.15, densityKgM3: 983.2, dynamicViscosityPaS: 4.67e-4 },
  { temperatureK: 338.15, densityKgM3: 980.5, dynamicViscosityPaS: 4.33e-4 },
  { temperatureK: 343.15, densityKgM3: 977.7, dynamicViscosityPaS: 4.04e-4 },
  { temperatureK: 348.15, densityKgM3: 974.8, dynamicViscosityPaS: 3.78e-4 },
  { temperatureK: 353.15, densityKgM3: 971.6, dynamicViscosityPaS: 3.55e-4 },
];

const WATER_TABLE_MIN_K = WATER_TABLE[0]!.temperatureK;
const WATER_TABLE_MAX_K = WATER_TABLE[WATER_TABLE.length - 1]!.temperatureK;

function buildFluidProperties(
  densityKgM3: number,
  dynamicViscosityPaS: number,
  source: string,
): FluidProperties {
  return {
    densityKgM3,
    dynamicViscosityPaS,
    kinematicViscosityM2S: dynamicViscosityPaS / densityKgM3,
    source,
  };
}

export function airProperties(
  temperatureK: number,
  pressurePa: number = DEFAULT_PRESSURE_PA,
): Result<FluidProperties> {
  if (temperatureK <= 0) {
    return err("temperatureK", "temperature must be greater than 0 K");
  }
  if (pressurePa <= 0) {
    return err("pressurePa", "pressure must be greater than 0 Pa");
  }

  const densityKgM3 = pressurePa / (IDEAL_GAS_R_AIR * temperatureK);
  const dynamicViscosityPaS =
    SUTHERLAND_MU0 *
    Math.pow(temperatureK / SUTHERLAND_T0, 1.5) *
    ((SUTHERLAND_T0 + SUTHERLAND_S) / (temperatureK + SUTHERLAND_S));

  return ok(
    buildFluidProperties(densityKgM3, dynamicViscosityPaS, "ideal gas + Sutherland"),
  );
}

export function waterProperties(
  temperatureK: number,
): Result<FluidProperties> {
  if (temperatureK <= 0) {
    return err("temperatureK", "temperature must be greater than 0 K");
  }
  if (temperatureK < WATER_TABLE_MIN_K || temperatureK > WATER_TABLE_MAX_K) {
    return err(
      "temperatureK",
      "temperature outside water table range [0, 80] °C; use custom fluid or extend the table",
    );
  }

  // Find the bracketing table rows; WATER_TABLE is sorted ascending and
  // temperatureK is known to be within [min, max] at this point.
  let lowerIndex = 0;
  for (let i = 0; i < WATER_TABLE.length - 1; i++) {
    const next = WATER_TABLE[i + 1]!;
    if (temperatureK <= next.temperatureK) {
      lowerIndex = i;
      break;
    }
    lowerIndex = i;
  }

  const lower = WATER_TABLE[lowerIndex]!;
  const upper = WATER_TABLE[Math.min(lowerIndex + 1, WATER_TABLE.length - 1)]!;

  let densityKgM3: number;
  let dynamicViscosityPaS: number;

  if (upper.temperatureK === lower.temperatureK) {
    densityKgM3 = lower.densityKgM3;
    dynamicViscosityPaS = lower.dynamicViscosityPaS;
  } else {
    const frac =
      (temperatureK - lower.temperatureK) /
      (upper.temperatureK - lower.temperatureK);

    // Density: linear interpolation.
    densityKgM3 =
      lower.densityKgM3 + frac * (upper.densityKgM3 - lower.densityKgM3);

    // Viscosity: log-linear interpolation (linear in ln(mu) vs T).
    const lnLower = Math.log(lower.dynamicViscosityPaS);
    const lnUpper = Math.log(upper.dynamicViscosityPaS);
    dynamicViscosityPaS = Math.exp(lnLower + frac * (lnUpper - lnLower));
  }

  return ok(buildFluidProperties(densityKgM3, dynamicViscosityPaS, "water table"));
}

export function customFluid(
  densityKgM3: number,
  dynamicViscosityPaS: number,
): Result<FluidProperties> {
  if (densityKgM3 <= 0) {
    return err("densityKgM3", "density must be greater than 0 kg/m³");
  }
  if (dynamicViscosityPaS <= 0) {
    return err(
      "dynamicViscosityPaS",
      "dynamic viscosity must be greater than 0 Pa·s",
    );
  }

  return ok(buildFluidProperties(densityKgM3, dynamicViscosityPaS, "custom fluid"));
}

export type FluidInput =
  | { kind: "air"; temperatureK: number; pressurePa?: number }
  | { kind: "water"; temperatureK: number }
  | { kind: "custom"; densityKgM3: number; dynamicViscosityPaS: number };

export function resolveFluid(input: FluidInput): Result<FluidProperties> {
  switch (input.kind) {
    case "air":
      return airProperties(input.temperatureK, input.pressurePa);
    case "water":
      return waterProperties(input.temperatureK);
    case "custom":
      return customFluid(input.densityKgM3, input.dynamicViscosityPaS);
  }
}
