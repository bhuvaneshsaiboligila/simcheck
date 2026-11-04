// Core shared types. See PLAN.md §6 for Finding/Severity/SolverType,
// and docs/flow-spec.md §3.0 for InputError/Result.

export type Severity = "pass" | "warn" | "fail";

export type SolverType = "cell-centred" | "vertex-based";

export interface Finding {
  severity: Severity;
  title: string;
  message: string; // what was found, with numbers
  why: string; // why it matters
  fix?: string; // what the user should change
  reference?: string; // source of the formula or threshold
}

/**
 * Describes invalid input that should never reach the physics (e.g. U = 0,
 * negative density). Distinct from Finding, which describes something found
 * about an otherwise-valid computation.
 */
export interface InputError {
  kind: "input-error";
  field: string; // e.g. "velocityMS", "temperatureK"
  message: string; // human-readable, says what to change
}

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: InputError };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<T>(field: string, message: string): Result<T> {
  return { ok: false, error: { kind: "input-error", field, message } };
}
