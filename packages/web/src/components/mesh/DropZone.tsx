import { useRef, useState, type ChangeEvent, type DragEvent } from "react";

interface DropZoneProps {
  onFile: (file: File) => void;
  fileName: string | null;
  disabled: boolean;
}

export function DropZone({ onFile, fileName, disabled }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    if (disabled) return;
    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onFile(file);
    event.target.value = "";
  };

  const classes = [
    "drop-zone",
    isDragOver ? "drop-zone-active" : "",
    disabled ? "drop-zone-disabled" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      role="button"
      tabIndex={0}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(event) => {
        if (!disabled && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".msh"
        disabled={disabled}
        onChange={handleChange}
        style={{ display: "none" }}
      />
      <p>{fileName ? `Selected: ${fileName}` : "Drop a .msh file here, or click to browse"}</p>
    </div>
  );
}
