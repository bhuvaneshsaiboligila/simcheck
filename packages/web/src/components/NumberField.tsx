import type { InputError } from "@simcheck/core";

interface NumberFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  unit?: string;
  step?: string;
  error?: InputError | undefined;
}

export function NumberField({ id, label, value, onChange, unit, step, error }: NumberFieldProps) {
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {unit ? ` (${unit})` : ""}
      </label>
      <input
        id={id}
        type="number"
        step={step ?? "any"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? "true" : "false"}
      />
      {error && <p className="field-error">{error.message}</p>}
    </div>
  );
}
