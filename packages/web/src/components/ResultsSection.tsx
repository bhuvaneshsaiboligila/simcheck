import type { Result, WallDistanceResult, Finding, SolverType } from "@simcheck/core";
import { ResultRow } from "./ResultRow";
import { ErrorNotice } from "./ErrorNotice";
import { FindingsList } from "./FindingsList";
import { REFERENCES } from "../lib/flow";

interface ResultsSectionProps {
  wallDistance: Result<WallDistanceResult>;
  boundaryLayerM: number | null;
  regime: Finding[];
  solver: SolverType;
}

export function ResultsSection({ wallDistance, boundaryLayerM, regime, solver }: ResultsSectionProps) {
  return (
    <section className="panel results-panel">
      <h2>Results</h2>

      {!wallDistance.ok ? (
        <ErrorNotice error={wallDistance.error} />
      ) : (
        <>
          <ResultRow
            label="Reynolds number (Re_x)"
            value={wallDistance.value.reynoldsX}
            formula={REFERENCES.reynolds}
          />
          <ResultRow
            label="Skin-friction coefficient (Cf)"
            value={wallDistance.value.cf}
            formula={REFERENCES.cf}
            note={REFERENCES.cfNote}
          />
          <ResultRow
            label="Wall shear stress (τw)"
            value={wallDistance.value.wallShearPa}
            unit="Pa"
            formula={REFERENCES.tauW}
          />
          <ResultRow
            label="Friction velocity (uτ)"
            value={wallDistance.value.frictionVelocityMS}
            unit="m/s"
            formula={REFERENCES.uTau}
          />
          <ResultRow
            label="Wall distance (y)"
            value={wallDistance.value.wallDistanceM}
            unit="m"
            formula={REFERENCES.y}
          />
          <ResultRow
            label={`First cell height (${solver === "cell-centred" ? "2y" : "y"})`}
            value={wallDistance.value.firstCellHeightM}
            unit="m"
            formula={REFERENCES.firstCellHeight}
          />
          {boundaryLayerM !== null && (
            <ResultRow
              label="Boundary layer thickness (δ)"
              value={boundaryLayerM}
              unit="m"
              formula={REFERENCES.delta}
            />
          )}

          <h3>Regime</h3>
          <FindingsList findings={regime} />
        </>
      )}
    </section>
  );
}
