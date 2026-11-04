# Flow calculator implementation spec (v0.1 / milestone 2)

Written by `cfd-physics` for `typescript-pro` to implement. This spec does not contain
code; it is the contract. All numeric golden values live in `docs/hand-calcs.md` and
must be reproduced within 0.1%. All constants and thresholds must be echoed into
`docs/thresholds.md` with a source, per `CLAUDE.md`.

## 0. Status of "verify" items — read before implementing

**Boundary-layer thickness formula — CONFIRMED.**
`δ ≈ 0.16 · x · Re_x^(-1/7)` is the standard turbulent flat-plate, 1/7-power-law
result, cross-confirmed against multiple independent engineering references
(classic textbook/study-guide treatments of the "one-seventh-power law" turbulent
boundary layer). Implement exactly as written in `docs/decisions.md` #4 and
`PLAN.md` §5. No change needed.

**Skin-friction coefficient formula — RESOLVED: 0.027 (2026-11-04).**
`PLAN.md` §5 and `docs/hand-calcs.md` originally used `Cf = 0.026 · Re_x^(-1/7)`.
Every independent source checked for the matching 1/7-power-law *local*
skin-friction correlation (same -1/7 exponent, paired with the 0.16 thickness
formula) gave **0.027**, not 0.026, attributed to Prandtl's power-law friction
formulation as used by White. No source — textbook, lecture note, or
calculator — independently corroborated 0.026 once the underlying page content
was checked directly (one web-search summary appeared to show 0.026 attributed
to a y+ calculator site, but fetching that page directly showed a different
formula, `Cf ≈ 0.058·Re^-0.2`, so that summary was not reliable).

Bhuvanesh has approved switching to **0.027** (`docs/decisions.md` #4, updated
2026-11-04). `PLAN.md` §5, `docs/decisions.md`, and `docs/hand-calcs.md` (Cases
A–D) have all been updated and recomputed to match. **The coefficient value
itself is no longer "verify"** — only the exact citation (edition and equation
number in White's *Fluid Mechanics*) remains "verify", since the physical book
was not consulted directly; `docs/decisions.md` #4 records that caveat.

### 0.1 Note for frontend-developer (UI explanation text, not UI code)

When building the explanation string for the Cf/y+ result, include a short
note along these lines, since some published y+ calculators use the other
coefficient and a user may notice the difference against them:

> "This uses Cf = 0.027·Re_x^(-1/7) (White, 1/7-power-law flat plate). Some
> other y+ calculators use 0.026 instead of 0.027 here, which gives a first
> cell height about 2% smaller — both are flat-plate estimates, not exact for
> your geometry."

This is only a note for later UI copy; no UI code is written here.

## 1. Independent recomputation of `docs/hand-calcs.md`

I recomputed every number in Cases A–D and the layers/CFL numbers from the stated
constants and formulas (Python, double precision, not by hand), using the
approved coefficient `Cf = 0.027·Re_x^(-1/7)`. **Every value in the current
`docs/hand-calcs.md` matches this recomputation to the stated precision. No
discrepancies found.** This includes:

- Air density and Sutherland viscosity for all four cases (unaffected by the
  Cf change).
- Re_x for all four cases, including the regime classification text
  (unaffected by the Cf change).
- Cf, τw, uτ, y, 2y for all four cases at the new coefficient 0.027. δ is
  unaffected by Cf (it has its own independent 0.16 coefficient), so δ is
  unchanged from the original hand-calcs for all four cases.
- Layers, Case A, recomputed with the new h = 2y = 6.75367e-5 m (cell-centred):
  `r = 1.2 → N = 24, T = 0.0265071 m` (smallest N with T ≥ δ);
  `N = 20, T = δ → r = 1.25144` (bisection, confirmed independently);
  `r = 1, N = 10 → T = 6.75367e-4 m`.
- CFL: `Δt_max = 1.0e-4 s` — unaffected by the Cf change (CFL does not use Cf).
- Case E (water, 20 °C, 2 m/s, x = 0.5 m, y+ = 1): confirmed independently,
  `Re_x = 9.96208e5` (transitional), `Cf = 3.75368e-3`, `τw = 7.49384 Pa`,
  `uτ = 0.0866450 m/s`, `y = 1.15853e-5 m`, `2y = 2.31706e-5 m`,
  `δ = 0.0111220 m`.

No hand-calc values are to be changed further as a result of this spec.

## 2. Water property table — APPROVED (2026-11-04)

Bhuvanesh approved the table source and interpolation method, widened to
0–80 °C in 5 °C steps (17 points) from the original 3-point proposal.
`docs/decisions.md` #23 records this.

### Approved table (water, 1 atm, IAPWS/NIST-consistent)

| T (°C) | T (K) | ρ (kg/m³) | μ (Pa·s) |
| --- | --- | --- | --- |
| 0 | 273.15 | 999.8 | 1.792e-3 |
| 5 | 278.15 | 999.9 | 1.519e-3 |
| 10 | 283.15 | 999.7 | 1.307e-3 |
| 15 | 288.15 | 999.1 | 1.138e-3 |
| 20 | 293.15 | 998.2 | 1.002e-3 |
| 25 | 298.15 | 997.0 | 8.90e-4 |
| 30 | 303.15 | 995.7 | 7.975e-4 |
| 35 | 308.15 | 994.0 | 7.19e-4 |
| 40 | 313.15 | 992.2 | 6.53e-4 |
| 45 | 318.15 | 990.2 | 5.96e-4 |
| 50 | 323.15 | 988.0 | 5.47e-4 |
| 55 | 328.15 | 985.7 | 5.04e-4 |
| 60 | 333.15 | 983.2 | 4.67e-4 |
| 65 | 338.15 | 980.5 | 4.33e-4 |
| 70 | 343.15 | 977.7 | 4.04e-4 |
| 75 | 348.15 | 974.8 | 3.78e-4 |
| 80 | 353.15 | 971.6 | 3.55e-4 |

**Source (approved as source of record):** standard engineering "properties of
water" appendix values, consistent with the IAPWS-IF97 water formulation /
NIST webbook within about 0.1–0.2% at each listed temperature. This is the
same family of table used in White's *Fluid Mechanics*, Munson et al.
*Fundamentals of Fluid Mechanics*, and Cengel's *Fluid Mechanics* appendices.
**The exact textbook table/edition/page number is still marked "verify"** —
it was not confirmed against a physical book; the IAPWS/NIST cross-check is
the source of record until that citation is supplied.

**Interpolation strategy (approved):**
- ρ(T): linear interpolation between adjacent table points (5 °C apart).
  Density vs. temperature is close to linear over 5 °C spans in this range,
  so linear interpolation error is negligible.
- μ(T): **log-linear** interpolation — linear interpolation of `ln(μ)` against
  T, then exponentiate. Viscosity is strongly non-linear (closer to Arrhenius)
  in T; log-linear interpolation is standard practice and keeps error small
  over 5 °C spacing (well under 1% in this range).
- Outside [0 °C, 80 °C]: return an `InputError` (`"temperature outside water
  table range [0, 80] °C; use custom fluid or extend the table"`), never
  silently extrapolate.

`docs/hand-calcs.md` Case E (water, 20 °C) uses the exact 20 °C table row
directly (no interpolation needed, since 20 °C is a table point) as the golden
value for the water path.

## 3. Implementation spec

Package: `packages/core/src/fluids.ts`, `checks/flow/reynolds.ts`,
`checks/flow/yplus.ts`, `checks/flow/blayer.ts`, `checks/flow/cfl.ts`,
`checks/flow/regime.ts`. No DOM, no UI code; pure functions, unit-tested in
Node with Vitest per `PLAN.md` §2 rule 3.

### 3.0 Shared result / error type

Flow inputs can be invalid in ways that should never reach the physics (U = 0,
negative density, etc.). This is a different concept from `Finding` (§6 of
`PLAN.md`), which describes something *found* about an otherwise-valid
computation (e.g. a regime warning). Propose a small, separate type for input
validation, since `Finding` has no "this input makes no sense" case and
stretching it there would blur the two concepts:

```ts
export interface InputError {
  kind: "input-error";
  field: string;    // e.g. "velocityMS", "temperatureK"
  message: string;  // human-readable, says what to change
}

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: InputError };
```

Every function below that can receive invalid input returns `Result<T>`, never
`NaN`, `Infinity`, or a silently clamped value. `U = 0` or `U < 0` is always an
`InputError` with `field: "velocityMS"` — this must be checked explicitly at the
top of every function that takes velocity, not left to propagate into a
division.

### 3.1 `fluids.ts`

```ts
export const SUTHERLAND_MU0 = 1.716e-5;   // Pa·s, source: decisions.md #5
export const SUTHERLAND_T0 = 273.15;      // K
export const SUTHERLAND_S = 110.4;        // K
export const IDEAL_GAS_R_AIR = 287.05;    // J/(kg·K)
export const DEFAULT_PRESSURE_PA = 101325;

export interface FluidProperties {
  densityKgM3: number;
  dynamicViscosityPaS: number;
  kinematicViscosityM2S: number; // = mu / rho, derived, not independently input
  source: string;                // for Finding.reference, e.g. "ideal gas + Sutherland"
}

export function airProperties(
  temperatureK: number,
  pressurePa?: number, // default DEFAULT_PRESSURE_PA
): Result<FluidProperties>;

export function waterProperties(
  temperatureK: number,
): Result<FluidProperties>; // table + interpolation, §2 above; InputError if out of range

export function customFluid(
  densityKgM3: number,
  dynamicViscosityPaS: number,
): Result<FluidProperties>; // InputError if either is <= 0

export type FluidInput =
  | { kind: "air"; temperatureK: number; pressurePa?: number }
  | { kind: "water"; temperatureK: number }
  | { kind: "custom"; densityKgM3: number; dynamicViscosityPaS: number };

export function resolveFluid(input: FluidInput): Result<FluidProperties>;
```

Validation:
- `temperatureK <= 0` → `InputError` (field `"temperatureK"`), for air and water.
- `pressurePa <= 0` → `InputError` (field `"pressurePa"`).
- `densityKgM3 <= 0` or `dynamicViscosityPaS <= 0` → `InputError` for custom fluid.
- Air: ideal gas `ρ = p / (R·T)`, Sutherland `μ = μ0·(T/T0)^1.5·(T0+S)/(T+S)`,
  exactly as in `docs/hand-calcs.md`.

### 3.2 `checks/flow/reynolds.ts`

```ts
export interface ReynoldsInputs {
  densityKgM3: number;
  dynamicViscosityPaS: number;
  velocityMS: number;
  lengthM: number; // x, distance from leading edge
}

export function reynoldsX(inputs: ReynoldsInputs): Result<number>;
```
`Re_x = ρ·U·x/μ`. Validation: `velocityMS <= 0` → `InputError("velocityMS", ...)`
(this is the canonical place U = 0/negative is caught — every caller downstream,
including `yplus.ts`, must go through this and propagate the error, not
recompute Re_x itself). `lengthM <= 0`, `densityKgM3 <= 0`,
`dynamicViscosityPaS <= 0` → `InputError` likewise.

### 3.3 `checks/flow/yplus.ts`

```ts
export const CF_COEFFICIENT = 0.027; // White, Fluid Mechanics, 1/7-power-law flat plate (decisions.md #4/#22); exact edition/equation number verify, see docs/flow-spec.md §0

export type SolverType = "cell-centred" | "vertex-based";

export interface WallDistanceInputs {
  densityKgM3: number;
  dynamicViscosityPaS: number;
  velocityMS: number;
  xM: number;
  targetYPlus: number;
  solver: SolverType;
}

export interface WallDistanceResult {
  reynoldsX: number;
  cf: number;
  wallShearPa: number;
  frictionVelocityMS: number;
  wallDistanceM: number;     // y — distance from wall to first cell centre (CC) or node (vertex-based)
  firstCellHeightM: number;  // solver === "cell-centred" ? 2*y : y   (decision #6)
}

export function wallDistanceForYPlus(
  inputs: WallDistanceInputs,
): Result<WallDistanceResult>;
```
Formula chain exactly as in `PLAN.md` §5 / `docs/hand-calcs.md`:
`Re_x → Cf = CF_COEFFICIENT·Re_x^(-1/7) → τw = ½·Cf·ρ·U² → uτ = √(τw/ρ) →
y = y+·μ/(ρ·uτ)`. `firstCellHeightM` is derived purely from `solver`, per
decision #6; do not special-case it inside the Cf/τw/uτ chain. Validation:
`targetYPlus <= 0` → `InputError`; velocity/x/density/viscosity validation
delegated to `reynoldsX` and surfaced unchanged (do not re-wrap the message).

This function does **not** itself attach regime findings — it returns the
Re_x it computed so the caller (the UI layer, or a thin `flow.ts` orchestrator)
can pass it to `regime.ts` and show both results together. Keeping `yplus.ts`
regime-agnostic matches "one consistent model" in `decisions.md` #4 without
duplicating the Re_x thresholds in two files.

### 3.4 `checks/flow/blayer.ts`

```ts
export function boundaryLayerThickness(xM: number, reynoldsX: number): number;
// δ = 0.16 * xM * reynoldsX ** (-1/7)   — no input validation needed here;
// caller already validated xM and reynoldsX upstream via reynoldsX()/yplus.ts.
```

Layer solving, three modes per decision #8:

```ts
export interface LayerInputsNGivenR {
  mode: "n-given-r";
  firstHeightM: number;
  growthRatio: number;     // r
  targetThicknessM: number; // δ, or user-entered target
}

export interface LayerInputsRGivenN {
  mode: "r-given-n";
  firstHeightM: number;
  numLayers: number;        // N, positive integer
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
  numLayers?: number;     // present for n-given-r, r-equals-one
  growthRatio?: number;   // present for r-given-n (and trivially 1 for r-equals-one, echoed back)
  totalThicknessM: number;
}

export function solveLayers(inputs: LayerInputs): Result<LayerResult>;
```

- **`n-given-r`:** direct formula. `h, r, T` given, `r != 1`. Solve for the
  smallest integer `N` with `T(N) = h·(r^N−1)/(r−1) ≥ targetThicknessM`:
  `N = ceil( ln(1 + target·(r−1)/h) / ln(r) )`, then clamp `N` up by 1 if
  rounding put it just under target (verify with the closed-form `T(N)`, since
  floating-point `ceil` on a log can be off by one at exact boundaries — this
  matches the hand-calc comment "smallest N with T ≥ δ", Case A: N = 24). Reject
  (`InputError`) `growthRatio <= 0`; `growthRatio === 1` is a distinct error
  telling the caller to use `"r-equals-one"` mode instead, not silently handled
  here, so the "divide by zero" case (decision #8) never reaches this branch
  in production.
- **`r-given-n`:** no closed form — bisection, per decision #8. `h, N, T`
  given, solve `T(r) = h·(r^N−1)/(r−1) = target` for `r`.
  - If `target < N·h`: no `r ≥ 1` solves it (shrinking layers would be needed)
    → `InputError` ("target thickness is smaller than N layers at the first
    height; reduce N or increase target").
  - If `target === N·h` (within the same 1e-6 relative tolerance as the
    bisection below): return `r = 1` directly, skip bisection.
  - Else bisection on `r ∈ (1, hi)`, expanding `hi` (e.g. doubling from 2
    upward) until `T(hi) >= target`, then bisecting. **Stop condition: relative
    width `(hi - lo) / mid < 1e-6`**, matching `docs/hand-calcs.md`'s "converges
    to 1e-6 relative". **Max-iteration safeguard: 100 iterations** (bisection
    on a reasonable bracket converges in `log2(range/tol) ≈ 30–40` iterations;
    100 is a safety margin). If not converged within 100 iterations, return an
    `InputError` describing non-convergence rather than returning a possibly-bad
    midpoint silently. Confirmed against hand-calc Case A (N=20, target=δ,
    h=2y=6.75367e-5 m at the approved Cf=0.027): bisection converges to
    `r = 1.25144`.
- **`r-equals-one`:** `T = N · h` directly (decision #8, avoids the `r−1`
  division by zero). `numLayers` must be a positive integer → `InputError`
  otherwise.

Shared validation across all three modes: `firstHeightM <= 0` → `InputError`;
`targetThicknessM <= 0` → `InputError`; `numLayers` (where applicable) must be
a positive integer, not just positive (reject `12.5`, reject `0`).

### 3.5 `checks/flow/cfl.ts`

```ts
export interface CflInputs {
  cfl: number;
  cellSizeM: number;
  velocityMS: number;
}

export function maxTimestep(inputs: CflInputs): Result<number>;
// delta_t_max = cfl * cellSizeM / |velocityMS|
```
Validation: `cfl <= 0`, `cellSizeM <= 0` → `InputError`. `velocityMS === 0` →
`InputError` (division by zero; note CFL uses `|U|`, so a *negative* velocity
is physically meaningful here — flow direction — unlike `reynoldsX`, where
negative U has no meaning for a boundary-layer correlation. Do **not** reuse
`reynoldsX`'s "velocity must be > 0" rule here; only reject exactly `U = 0`).

### 3.6 `checks/flow/regime.ts`

```ts
export function regimeFindings(reynoldsX: number): Finding[];
```
Uses the real `Finding` type from `PLAN.md` §6 (these are findings *about* a
valid Re_x, not input errors). Thresholds exactly as decision #7 /
`PLAN.md` §5 table, with exact boundary semantics (must match the table's
stated inequalities, not "approximately"):

| Condition (exact) | Severity | Message |
| --- | --- | --- |
| `reynoldsX < 5e5` | `"warn"` | Laminar: the turbulent correlation does not apply |
| `5e5 <= reynoldsX < 3e6` | `"warn"` | Transitional: estimate is uncertain |
| always, regardless of regime | `"pass"` | Flat-plate estimate; for internal or bluff-body flows, check y+ after the first run |

Note on the "always" row: `Finding.severity` only has `pass`/`warn`/`fail`, no
neutral "info" level. This spec picks `"pass"` for the always-shown note since
it is a disclosure, not a problem — flagging this choice explicitly so the lead
session / code-reviewer can confirm it reads correctly in the UI (a "pass"
finding with no numeric value might look odd next to warn/fail findings; if so,
consider widening `Severity` to include `"info"`, which would need a `PLAN.md`
§6 type change and sign-off, not a unilateral change here).

**Boundary cases to test exactly (per hand-calcs.md):**
- `reynoldsX === 5e5` exactly → falls into the *transitional* band (`5e5 <= Re`
  is true), not laminar. The laminar condition is strict `<`.
- `reynoldsX === 3e6` exactly → falls into *neither* laminar nor transitional
  (`< 3e6` is false) — only the always-on flat-plate note applies, no warn.
- Case D (`Re_x = 5.31232e6`) must produce zero warn findings besides the
  always-on note, per `docs/hand-calcs.md`.

### 3.7 Edge cases to cover in tests (per `docs/hand-calcs.md` + this spec)

- `r = 1` layers, no division by zero (§3.4).
- `r` given `N` via bisection, converges to 1e-6 relative, matches hand-calc
  Case A value `r = 1.25144`; also test the max-iteration safeguard path with
  a deliberately pathological input (e.g. `target` far outside any reachable
  range) and confirm it returns an `InputError`, not a wrong number.
- `reynoldsX` exactly `5e5` and exactly `3e6` (regime boundaries, §3.6).
- `velocityMS = 0` and `velocityMS < 0` in `reynoldsX` → `InputError`, not
  `NaN`/`Infinity`; separately, `velocityMS = 0` in `cfl.ts` → `InputError`,
  but `velocityMS < 0` in `cfl.ts` is valid (uses `|U|`).
- Water `temperatureK` outside the approved [0, 80] °C table range →
  `InputError`, no silent extrapolation (§2).
- Water path, Case E (water, 20 °C, 2 m/s, x = 0.5 m, y+ = 1): golden values
  in `docs/hand-calcs.md` — `Re_x = 9.96208e5`, `Cf = 3.75368e-3`,
  `y = 1.15853e-5 m`, `2y = 2.31706e-5 m`, `δ = 0.0111220 m`.
- `CF_COEFFICIENT` constant is imported from `yplus.ts`, not hard-coded again
  in tests, so that if/when §0's 0.026-vs-0.027 question is resolved, exactly
  one line changes and no test file needs editing to match a new constant value.

## 4. Open items for Bhuvanesh (do not resolve unilaterally)

1. ~~Cf coefficient: 0.026 vs 0.027.~~ **Resolved 2026-11-04: 0.027.** See §0.
   The exact textbook citation (edition, equation number in White's
   *Fluid Mechanics*) is still "verify" and needs a page reference eventually,
   but no longer blocks implementation.
2. ~~Water table approval.~~ **Resolved 2026-11-04: approved, 0–80 °C, 5 °C
   steps, IAPWS/NIST source.** See §2. The exact textbook table/page citation
   is still "verify" and needs a page reference eventually, but no longer
   blocks implementation.
3. **Regime "always" finding severity = `"pass"`.** See §3.6 — flagging the
   choice, not asking to change the `Finding` type. Still open.
