import { expect } from "vitest";

/** Assert actual is within relTol relative difference of expected (default 0.1%). */
export function expectClose(
  actual: number,
  expected: number,
  relTol = 1e-3,
): void {
  const diff = Math.abs(actual - expected);
  const scale = Math.max(Math.abs(expected), 1e-300);
  expect(diff / scale).toBeLessThanOrEqual(relTol);
}
