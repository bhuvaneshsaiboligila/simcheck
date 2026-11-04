import { useState } from "react";
import type { WorstCell } from "@simcheck/core";

// decisions.md #18/#29: worst cells shown as Gmsh tag + centroid + physical
// group name; physical === 0 means no physical group was assigned.
function physicalGroupLabel(physical: number): string {
  return physical === 0 ? "no physical group" : `group ${physical}`;
}

interface WorstCellTableProps {
  worst: WorstCell[];
  valueLabel: string;
}

const PREVIEW_COUNT = 10;

export function WorstCellTable({ worst, valueLabel }: WorstCellTableProps) {
  const [expanded, setExpanded] = useState(false);

  if (worst.length === 0) {
    return null;
  }

  const shown = expanded ? worst : worst.slice(0, PREVIEW_COUNT);

  return (
    <div className="worst-cell-table-wrap">
      <table className="worst-cell-table">
        <thead>
          <tr>
            <th>Tag</th>
            <th>Centroid (x, y, z)</th>
            <th>Physical group</th>
            <th>{valueLabel}</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((cell) => (
            <tr key={cell.tag}>
              <td>{cell.tag}</td>
              <td>
                ({cell.centroid[0].toPrecision(4)}, {cell.centroid[1].toPrecision(4)},{" "}
                {cell.centroid[2].toPrecision(4)})
              </td>
              <td>{physicalGroupLabel(cell.physical)}</td>
              <td>{cell.value.toPrecision(4)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {worst.length > PREVIEW_COUNT && (
        <button type="button" className="fill-button" onClick={() => setExpanded((e) => !e)}>
          {expanded ? "Show fewer" : `Show all ${worst.length}`}
        </button>
      )}
    </div>
  );
}
