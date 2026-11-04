# Hand calculations (golden test values)

Every flow test reproduces these numbers within 0.1%. They were computed with the exact formulas and constants in `docs/decisions.md` (#4, #5). **Bhuvanesh verifies these by hand before code is written.** If a formula changes, recompute all of them.

## Constants

- R = 287.05 J/(kg·K), p = 101 325 Pa
- Sutherland: μ = 1.716e-5 · (T/273.15)^1.5 · (273.15 + 110.4)/(T + 110.4)
- Cf = 0.026 · Re_x^(-1/7); τw = ½·Cf·ρ·U²; uτ = √(τw/ρ); y = y⁺·μ/(ρ·uτ)
- δ = 0.16 · x · Re_x^(-1/7)
- Layers: T = h·(r^N − 1)/(r − 1); r = 1 → T = N·h

## Case A – air, 20 °C, 10 m/s, x = 1 m, y⁺ = 1

| Quantity | Value |
| --- | --- |
| T | 293.15 K |
| ρ | 1.20412 kg/m³ |
| μ | 1.81332e-5 Pa·s |
| Re_x | 6.64040e5 |
| Regime | transitional warning (5e5 ≤ Re < 3e6) |
| Cf | 3.83029e-3 |
| τw | 0.230606 Pa |
| uτ | 0.437624 m/s |
| y | 3.44116e-5 m |
| First cell height, cell-centred (2y) | 6.88232e-5 m |
| First cell height, vertex-based (y) | 3.44116e-5 m |
| δ | 0.0235710 m |

Layers (cell-centred, h = 6.88232e-5 m):

| Input | Result |
| --- | --- |
| r = 1.2, cover δ | N = 24 (smallest N with T ≥ δ), T = 0.0270120 m |
| N = 20, T = δ | r = 1.24989 (bisection) |
| r = 1, N = 10 | T = 6.88232e-4 m |

CFL: CFL = 1, Δx = 1e-3 m → Δt_max = 1.0e-4 s.

## Case B – air, 20 °C, 50 m/s, x = 0.5 m, y⁺ = 30

| Quantity | Value |
| --- | --- |
| Re_x | 1.66010e6 (transitional warning) |
| Cf | 3.36034e-3 |
| τw | 5.05780 Pa |
| uτ | 2.04949 m/s |
| y | 2.20435e-4 m |
| 2y | 4.40870e-4 m |
| δ | 0.0103395 m |

## Case C – air, 15 °C, 2 m/s, x = 0.2 m, y⁺ = 1

| Quantity | Value |
| --- | --- |
| T | 288.15 K |
| ρ | 1.22501 kg/m³ |
| μ | 1.78930e-5 Pa·s |
| Re_x | 2.73853e4 |
| Regime | **laminar warning**: turbulent correlation does not apply (values still shown, flagged) |
| Cf | 6.04007e-3 |
| y | 1.32894e-4 m |
| δ | 7.43394e-3 m |

## Case D – air, 20 °C, 40 m/s, x = 2 m, y⁺ = 1 (fully turbulent, no regime warning)

| Quantity | Value |
| --- | --- |
| Re_x | 5.31232e6 |
| Cf | 2.84589e-3 |
| uτ | 1.50888 m/s |
| y | 9.98048e-6 m |
| δ | 0.0350264 m |

## Edge cases that must be tested

- r = 1 (no division by zero)
- r given N via bisection converges to 1e-6 relative
- Re exactly 5e5 and 3e6 (boundary of regime warnings)
- U = 0 or negative → input error, not NaN
- Water case: add values once the water property table is chosen (cfd-physics proposes table + source, Bhuvanesh approves)
