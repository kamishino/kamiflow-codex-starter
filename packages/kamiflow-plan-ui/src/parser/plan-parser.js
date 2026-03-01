import path from "node:path";

function parseSimpleFrontmatter(yamlBlock) {
  const data = {};
  const lines = yamlBlock.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const sep = trimmed.indexOf(":");
    if (sep <= 0) {
      throw new Error(`Invalid frontmatter line: "${line}"`);
    }
    const key = trimmed.slice(0, sep).trim();
    const rawValue = trimmed.slice(sep + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");
    data[key] = value;
  }
  return data;
}

function extractFrontmatter(markdown) {
  if (!markdown.startsWith("---")) {
    throw new Error("Plan file must start with YAML frontmatter block.");
  }

  const lines = markdown.split(/\r?\n/);
  let endIndex = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === "---") {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    throw new Error("Missing closing frontmatter delimiter (---).");
  }

  const frontmatterBlock = lines.slice(1, endIndex).join("\n");
  const body = lines.slice(endIndex + 1).join("\n").trimStart();
  return {
    frontmatter: parseSimpleFrontmatter(frontmatterBlock),
    body
  };
}

export function parseSections(body) {
  const headings = [...body.matchAll(/^##\s+(.+)$/gm)];
  const sections = {};

  for (let i = 0; i < headings.length; i += 1) {
    const heading = headings[i];
    const title = heading[1].trim();
    const start = heading.index + heading[0].length;
    const end = i + 1 < headings.length ? headings[i + 1].index : body.length;
    const content = body.slice(start, end).trim();
    sections[title] = content;
  }
  return sections;
}

export function parsePlanFileContent(markdown, filePath = "<memory>") {
  const { frontmatter, body } = extractFrontmatter(markdown);
  const sections = parseSections(body);
  return {
    filePath,
    fileName: path.basename(filePath),
    frontmatter,
    body,
    sections
  };
}
