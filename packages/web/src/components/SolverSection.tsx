import type { SolverType } from "@simcheck/core";
import { SelectField } from "./SelectField";

interface SolverSectionProps {
  solver: SolverType;
  onChange: (solver: SolverType) => void;
}

export function SolverSection({ solver, onChange }: SolverSectionProps) {
  return (
    <section className="panel solver-panel">
      <SelectField
        id="solver"
        label="Solver type"
        value={solver}
        onChange={(v) => onChange(v as SolverType)}
        options={[
          { value: "cell-centred", label: "Cell-centred (OpenFOAM, Fluent, STAR-CCM+) — first cell height = 2y" },
          { value: "vertex-based", label: "Vertex-based (SU2) — first cell height = y" },
        ]}
      />
    </section>
  );
}
