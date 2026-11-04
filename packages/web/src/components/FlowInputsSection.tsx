import { NumberField } from "./NumberField";
import type { FlowUiState } from "../lib/flow";

interface FlowInputsSectionProps {
  state: FlowUiState;
  update: (patch: Partial<FlowUiState>) => void;
}

export function FlowInputsSection({ state, update }: FlowInputsSectionProps) {
  return (
    <section className="panel">
      <h2>Flow</h2>
      <NumberField
        id="velocityMS"
        label="Freestream velocity"
        unit="m/s"
        value={state.velocityMS}
        onChange={(v) => update({ velocityMS: v })}
      />
      <NumberField
        id="xM"
        label="Distance from leading edge (x)"
        unit="m"
        value={state.xM}
        onChange={(v) => update({ xM: v })}
      />
      <NumberField
        id="targetYPlus"
        label="Target y+"
        value={state.targetYPlus}
        onChange={(v) => update({ targetYPlus: v })}
      />
      <p className="field-hint">y+ will be higher upstream of x.</p>
    </section>
  );
}
