import type { Result, LayerResult } from "@simcheck/core";
import { NumberField } from "./NumberField";
import { SelectField } from "./SelectField";
import { ResultRow } from "./ResultRow";
import { ErrorNotice } from "./ErrorNotice";
import { REFERENCES } from "../lib/flow";
import type { FlowUiState } from "../lib/flow";

interface LayersSectionProps {
  state: FlowUiState;
  update: (patch: Partial<FlowUiState>) => void;
  layers: Result<LayerResult> | null;
  computedFirstCellHeightM: number | null;
  computedDeltaM: number | null;
}

export function LayersSection({
  state,
  update,
  layers,
  computedFirstCellHeightM,
  computedDeltaM,
}: LayersSectionProps) {
  return (
    <section className="panel">
      <h2>Boundary layer</h2>
      <SelectField
        id="layerMode"
        label="Solve for"
        value={state.layerMode}
        onChange={(v) => update({ layerMode: v as FlowUiState["layerMode"] })}
        options={[
          { value: "n-given-r", label: "Number of layers N, given growth ratio r" },
          { value: "r-given-n", label: "Growth ratio r, given number of layers N" },
          { value: "r-equals-one", label: "Fixed r = 1 (uniform layers)" },
        ]}
      />

      <NumberField
        id="layerFirstHeightM"
        label="First layer height (h)"
        unit="m"
        value={state.layerFirstHeightM}
        onChange={(v) => update({ layerFirstHeightM: v })}
      />
      {computedFirstCellHeightM !== null && (
        <button
          type="button"
          className="fill-button"
          onClick={() => update({ layerFirstHeightM: String(computedFirstCellHeightM) })}
        >
          Use computed first cell height ({computedFirstCellHeightM.toExponential(5)} m)
        </button>
      )}

      {state.layerMode !== "r-equals-one" && (
        <NumberField
          id="layerTargetThicknessM"
          label="Target total thickness (T)"
          unit="m"
          value={state.layerTargetThicknessM}
          onChange={(v) => update({ layerTargetThicknessM: v })}
        />
      )}
      {state.layerMode !== "r-equals-one" && computedDeltaM !== null && (
        <button
          type="button"
          className="fill-button"
          onClick={() => update({ layerTargetThicknessM: String(computedDeltaM) })}
        >
          Use computed δ ({computedDeltaM.toExponential(5)} m)
        </button>
      )}

      {state.layerMode === "n-given-r" && (
        <NumberField
          id="layerGrowthRatio"
          label="Growth ratio (r)"
          value={state.layerGrowthRatio}
          onChange={(v) => update({ layerGrowthRatio: v })}
        />
      )}

      {(state.layerMode === "r-given-n" || state.layerMode === "r-equals-one") && (
        <NumberField
          id="layerNumLayers"
          label="Number of layers (N)"
          value={state.layerNumLayers}
          onChange={(v) => update({ layerNumLayers: v })}
          step="1"
        />
      )}

      {layers === null ? (
        <p className="field-hint">Enter a first layer height to compute.</p>
      ) : layers.ok ? (
        <div className="layer-results">
          {layers.value.numLayers !== undefined && (
            <ResultRow label="Number of layers (N)" value={layers.value.numLayers} />
          )}
          {layers.value.growthRatio !== undefined && (
            <ResultRow label="Growth ratio (r)" value={layers.value.growthRatio} />
          )}
          <ResultRow
            label="Total thickness (T)"
            value={layers.value.totalThicknessM}
            unit="m"
            formula={REFERENCES.layers}
          />
        </div>
      ) : (
        <ErrorNotice error={layers.error} />
      )}
    </section>
  );
}
