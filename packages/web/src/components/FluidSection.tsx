import { DEFAULT_PRESSURE_PA, type InputError } from "@simcheck/core";
import { NumberField } from "./NumberField";
import { SelectField } from "./SelectField";
import { ErrorNotice } from "./ErrorNotice";
import type { FlowUiState } from "../lib/flow";

interface FluidSectionProps {
  state: FlowUiState;
  update: (patch: Partial<FlowUiState>) => void;
  error?: InputError | undefined;
}

export function FluidSection({ state, update, error }: FluidSectionProps) {
  return (
    <section className="panel">
      <h2>Fluid</h2>
      <SelectField
        id="fluidKind"
        label="Fluid"
        value={state.fluidKind}
        onChange={(v) => update({ fluidKind: v as FlowUiState["fluidKind"] })}
        options={[
          { value: "air", label: "Air (ideal gas + Sutherland)" },
          { value: "water", label: "Water (0-80 °C table)" },
          { value: "custom", label: "Custom (density + viscosity)" },
        ]}
      />

      {state.fluidKind === "air" && (
        <>
          <NumberField
            id="airTempC"
            label="Temperature"
            unit="°C"
            value={state.airTempC}
            onChange={(v) => update({ airTempC: v })}
          />
          <NumberField
            id="airPressurePa"
            label={`Pressure (blank = ${DEFAULT_PRESSURE_PA} Pa)`}
            unit="Pa"
            value={state.airPressurePa}
            onChange={(v) => update({ airPressurePa: v })}
          />
        </>
      )}

      {state.fluidKind === "water" && (
        <NumberField
          id="waterTempC"
          label="Temperature (0-80 °C)"
          unit="°C"
          value={state.waterTempC}
          onChange={(v) => update({ waterTempC: v })}
        />
      )}

      {state.fluidKind === "custom" && (
        <>
          <NumberField
            id="customDensity"
            label="Density"
            unit="kg/m³"
            value={state.customDensity}
            onChange={(v) => update({ customDensity: v })}
          />
          <NumberField
            id="customViscosity"
            label="Dynamic viscosity"
            unit="Pa·s"
            value={state.customViscosity}
            onChange={(v) => update({ customViscosity: v })}
          />
        </>
      )}

      {error && <ErrorNotice error={error} />}
    </section>
  );
}
