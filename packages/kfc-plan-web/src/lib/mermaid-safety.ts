export interface MermaidSafetyIssue {
  code: "unsafe_label_pipe";
  line: number;
  column: number;
  message: string;
  snippet: string;
  repairable: boolean;
}

export interface MermaidSafetyResult {
  valid: boolean;
  issues: MermaidSafetyIssue[];
  repaired_source: string;
  repaired: boolean;
}

const NODE_LABEL_PATTERNS: RegExp[] = [
  /(\b[A-Za-z_][\w-]*\s*\[\[)(.*?)(\]\])/g,
  /(\b[A-Za-z_][\w-]*\s*\(\()(.*?)(\)\))/g,
  /(\b[A-Za-z_][\w-]*\s*\{)(.*?)(\})/g,
  /(\b[A-Za-z_][\w-]*\s*\[)(.*?)(\])/g,
  /(\b[A-Za-z_][\w-]*\s*\()(.*?)(\))/g
];

function normalizeLabelPipes(input: string): string {
  return String(input || "")
    .replace(/\s*\|\s*/g, " / ")
    .replace(/\s+/g, " ")
    .trim();
}

function transformLine(line: string, lineNumber: number, issues: MermaidSafetyIssue[]): { line: string; changed: boolean } {
  let next = line;
  let changed = false;

  for (const pattern of NODE_LABEL_PATTERNS) {
    pattern.lastIndex = 0;
    next = next.replace(pattern, (match, prefix, label, suffix, offset) => {
      const rawLabel = String(label ?? "");
      if (!rawLabel.includes("|")) {
        return match;
      }
      const firstPipe = rawLabel.indexOf("|");
      issues.push({
        code: "unsafe_label_pipe",
        line: lineNumber,
        column: Number(offset) + String(prefix).length + firstPipe + 1,
        message: `Unsafe "|" in Mermaid node label; replace with "/" or "or".`,
        snippet: line.trim(),
        repairable: true
      });
      const repairedLabel = normalizeLabelPipes(rawLabel);
      if (repairedLabel !== rawLabel) {
        changed = true;
      }
      return `${prefix}${repairedLabel}${suffix}`;
    });
  }

  return { line: next, changed };
}

export function lintAndRepairMermaid(source: string): MermaidSafetyResult {
  const raw = String(source || "");
  const lines = raw.split(/\r?\n/);
  const issues: MermaidSafetyIssue[] = [];
  let changed = false;

  const repairedLines = lines.map((line, index) => {
    const transformed = transformLine(line, index + 1, issues);
    if (transformed.changed) {
      changed = true;
    }
    return transformed.line;
  });

  return {
    valid: issues.length === 0,
    issues,
    repaired_source: repairedLines.join("\n"),
    repaired: changed
  };
}
