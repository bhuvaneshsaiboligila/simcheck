import { useMemo, useState } from "react";
import { VERSION } from "@simcheck/core";
import { computeFlow, type FlowUiState } from "./lib/flow";
import { SolverSection } from "./components/SolverSection";
import { FluidSection } from "./components/FluidSection";
import { FlowInputsSection } from "./components/FlowInputsSection";
import { LayersSection } from "./components/LayersSection";
import { CflSection } from "./components/CflSection";
import { ResultsSection } from "./components/ResultsSection";

// Defaults match hand-calcs.md Case A (air, 20 C, 10 m/s, x = 1 m, y+ = 1,
// cell-centred), so the page shows a known-good example on first load.
const INITIAL_STATE: FlowUiState = {
  fluidKind: "air",
  airTempC: "20",
  airPressurePa: "",
  waterTempC: "20",
  customDensity: "",
  customViscosity: "",

  solver: "cell-centred",

  velocityMS: "10",
  xM: "1",
  targetYPlus: "1",

  layerMode: "n-given-r",
  layerFirstHeightM: "",
  layerGrowthRatio: "1.2",
  layerNumLayers: "20",
  layerTargetThicknessM: "",

  cflNumber: "1",
  cellSizeM: "0.001",
};

function App() {
  const [state, setState] = useState<FlowUiState>(INITIAL_STATE);

  const update = (patch: Partial<FlowUiState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  };

  const computation = useMemo(() => computeFlow(state), [state]);

  const computedFirstCellHeightM = computation.wallDistance.ok
    ? computation.wallDistance.value.firstCellHeightM
    : null;

  return (
    <main>
      <header className="app-header">
        <h1>SimCheck</h1>
        <p>
          A pre-flight checker for CFD setups — flow calculator (v{VERSION}). Every number below
          comes with its formula and source.
        </p>
      </header>

      <SolverSection solver={state.solver} onChange={(solver) => update({ solver })} />

      <div className="layout">
        <div className="inputs-column">
          <FluidSection
            state={state}
            update={update}
            error={computation.fluid.ok ? undefined : computation.fluid.error}
          />
          <FlowInputsSection state={state} update={update} />
          <LayersSection
            state={state}
            update={update}
            layers={computation.layers}
            computedFirstCellHeightM={computedFirstCellHeightM}
            computedDeltaM={computation.boundaryLayerM}
          />
          <CflSection state={state} update={update} cfl={computation.cfl} />
        </div>

        <div className="results-column">
          <ResultsSection
            wallDistance={computation.wallDistance}
            boundaryLayerM={computation.boundaryLayerM}
            regime={computation.regime}
            solver={state.solver}
          />
        </div>
      </div>

      <footer className="app-footer">
        <p>
          SimCheck is open source.{" "}
          <a href="https://github.com/bhuvaneshsaiboligila/simcheck/issues" target="_blank" rel="noreferrer">
            Found a bug, or does your y+ workflow need something this doesn't cover? Open an issue.
          </a>
        </p>
      </footer>
    </main>
  );
}

export default App;
