interface InlineMarkdownRenderOptions {
  projectDir?: string;
  enableFileLinks?: boolean;
}

function normalizePathCandidate(value: string): string {
  const trimmed = String(value || "").trim();
  const unquoted = trimmed.replace(/^["']|["']$/g, "");
  return unquoted.replace(/[),.;]+$/g, "");
}

function looksLikePath(value: string): boolean {
  const text = normalizePathCandidate(value);
  if (!text) {
    return false;
  }
  if (/^https?:\/\//i.test(text)) {
    return false;
  }
  if (/^vscode:\/\//i.test(text)) {
    return true;
  }
  if (/^file:\/\//i.test(text)) {
    return true;
  }
  if (/^[a-zA-Z]:[\\/]/.test(text)) {
    return true;
  }
  if (text.startsWith("~/")) {
    return true;
  }
  if (text.startsWith("/")) {
    return true;
  }
  if (text.startsWith("./") || text.startsWith("../")) {
    return true;
  }
  if (/[\\/]/.test(text)) {
    return true;
  }
  if (/^[^\\/:*?"<>|\r\n]+\.[^\\/:*?"<>|\r\n]+$/i.test(text)) {
    return true;
  }
  return false;
}

function toFileHref(rawPath: string, projectDir: string): string | null {
  const text = normalizePathCandidate(rawPath);
  if (!text) {
    return null;
  }
  if (/^vscode:\/\//i.test(text)) {
    return text;
  }
  if (/^file:\/\//i.test(text)) {
    return text;
  }

  let normalized = text.replace(/\\/g, "/");
  if (normalized.startsWith("~/")) {
    normalized = normalized.slice(1);
  }
  if (!/^[a-zA-Z]:\//.test(normalized) && !normalized.startsWith("/")) {
    const base = String(projectDir || "").replace(/\\/g, "/").replace(/\/+$/g, "");
    if (!base) {
      return null;
    }
    normalized = `${base}/${normalized.replace(/^\.?\//, "")}`;
  }

  const href = /^[a-zA-Z]:\//.test(normalized)
    ? `file:///${normalized}`
    : `file://${normalized.startsWith("/") ? normalized : `/${normalized}`}`;
  return encodeURI(href);
}

function fileLabel(filePath: string): string {
  const normalized = String(filePath || "").replace(/\\/g, "/").replace(/\/+$/g, "");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || normalized;
}

export function renderInlineMarkdown(text: string, options: InlineMarkdownRenderOptions = {}) {
  const pattern = /`([^`]+)`/g;
  const nodes: any[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null = null;
  const enableFileLinks = options.enableFileLinks !== false;
  const projectDir = String(options.projectDir || "");

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIdx) {
      nodes.push(text.slice(lastIdx, match.index));
    }

    const rawCandidate = String(match[1] || "");
    const candidate = normalizePathCandidate(rawCandidate);
    const shouldLink = enableFileLinks && looksLikePath(candidate);
    const href = shouldLink ? toFileHref(candidate, projectDir) : null;

    if (href) {
      nodes.push(
        <a
          class="plan-file-link"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          title={`${candidate} (open with your editor/app)`}
        >
          {fileLabel(candidate)}
        </a>
      );
    } else {
      const codeText = candidate || rawCandidate.trim();
      if (codeText) {
        nodes.push(
          <code class="inline-code-chip" title={codeText}>
            {codeText}
          </code>
        );
      } else {
        nodes.push(match[0]);
      }
    }

    lastIdx = match.index + match[0].length;
  }

  if (lastIdx < text.length) {
    nodes.push(text.slice(lastIdx));
  }

  return nodes.length > 0 ? nodes : text;
}
