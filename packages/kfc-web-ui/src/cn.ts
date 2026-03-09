type ClassPart = string | false | null | undefined | { value?: string | null | undefined };

function normalizeClassPart(part: ClassPart): string {
  if (typeof part === "string") {
    return part;
  }
  if (part && typeof part === "object" && typeof part.value === "string") {
    return part.value;
  }
  return "";
}

export function cn(...parts: ClassPart[]): string {
  return parts.map(normalizeClassPart).filter(Boolean).join(" ");
}
