import type { Result } from "@simcheck/core";
import { NumberField } from "./NumberField";
import { ResultRow } from "./ResultRow";
import { ErrorNotice } from "./ErrorNotice";
import { REFERENCES } from "../lib/flow";
import type { FlowUiState } from "../lib/flow";

interface CflSectionProps {
  state: FlowUiState;
  update: (patch: Partial<FlowUiState>) => void;
  cfl: Result<number>;
}

export function CflSection({ state, update, cfl }: CflSectionProps) {
  return (
    <section className="panel">
      <h2>CFL / time step</h2>
      <NumberField
        id="cellSizeM"
        label="Cell size"
        unit="m"
        value={state.cellSizeM}
        onChange={(v) => update({ cellSizeM: v })}
      />
      <NumberField
        id="cflNumber"
        label="CFL number"
        value={state.cflNumber}
        onChange={(v) => update({ cflNumber: v })}
      />
      <p className="field-hint">Uses the freestream velocity entered above.</p>

      {cfl.ok ? (
        <ResultRow
          label="Maximum time step (Δt_max)"
          value={cfl.value}
          unit="s"
          formula={REFERENCES.cfl}
        />
      ) : (
        <ErrorNotice error={cfl.error} />
      )}
    </section>
  );
}
