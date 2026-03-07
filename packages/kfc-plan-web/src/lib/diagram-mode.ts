export type DiagramMode = "required" | "auto" | "hidden";

export interface DiagramModeResolution {
  mode: DiagramMode;
  explicit: boolean;
  valid: boolean;
  raw: string;
}

export function resolveDiagramMode(value: unknown): DiagramModeResolution {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) {
    return {
      mode: "auto",
      explicit: false,
      valid: true,
      raw: ""
    };
  }
  if (raw === "required" || raw === "auto" || raw === "hidden") {
    return {
      mode: raw,
      explicit: true,
      valid: true,
      raw
    };
  }
  return {
    mode: "auto",
    explicit: true,
    valid: false,
    raw
  };
}
