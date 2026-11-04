import type { InputError } from "@simcheck/core";

export function ErrorNotice({ error }: { error: InputError }) {
  return (
    <p className="error-notice" role="alert">
      {error.message}
    </p>
  );
}
