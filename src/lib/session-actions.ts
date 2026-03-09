import { spawn } from "node:child_process";
import path from "node:path";

type SpawnCommandOptions = {
  stdinText?: string;
};

type SpawnCommand = (command: string, args: string[], options?: SpawnCommandOptions) => Promise<{
  command: string;
  args: string[];
}>;

type ClipboardOptions = {
  platform?: string;
  runCommand?: SpawnCommand;
};

type RevealOptions = {
  platform?: string;
  target?: string;
  runCommand?: SpawnCommand;
};

export function buildInteractiveResumeCommand(sessionId) {
  const normalized = String(sessionId || "").trim();
  if (!normalized) {
    return "";
  }
  return `codex resume ${JSON.stringify(normalized)}`;
}

export function resolveSessionField(binding, field) {
  const normalized = String(field || "").trim().toLowerCase();
  if (!binding?.bound) {
    throw new Error(binding?.reason || "No Codex session bound.");
  }
  if (normalized === "resume") {
    return binding.manual_resume_command || buildInteractiveResumeCommand(binding.session_id);
  }
  if (normalized === "session-id") {
    return binding.session_id;
  }
  if (normalized === "session-path") {
    return binding.session_path;
  }
  throw new Error(`Unsupported field: ${field}`);
}

export function resolveRevealTargetPath(binding, target = "file") {
  if (!binding?.bound) {
    throw new Error(binding?.reason || "No Codex session bound.");
  }
  const normalized = String(target || "file").trim().toLowerCase();
  if (normalized === "file") {
    return {
      target: "file",
      path: binding.session_path
    };
  }
  if (normalized === "folder") {
    return {
      target: "folder",
      path: path.dirname(binding.session_path)
    };
  }
  throw new Error(`Unsupported reveal target: ${target}`);
}

function spawnAndWait(command: string, args: string[], options: SpawnCommandOptions = {}) {
  return new Promise<{ command: string; args: string[] }>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: options.stdinText == null ? "ignore" : ["pipe", "ignore", "pipe"],
      windowsHide: true
    });
    let stderr = "";
    if (options.stdinText != null && child.stdin) {
      child.stdin.write(String(options.stdinText));
      child.stdin.end();
    }
    if (child.stderr) {
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk || "");
      });
    }
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve({
          command,
          args
        });
        return;
      }
      reject(new Error(stderr.trim() || `${command} exited with code ${code}`));
    });
  });
}

export async function copyTextToClipboard(text: string, options: ClipboardOptions = {}) {
  const platform = String(options.platform || process.platform);
  const run = options.runCommand || ((command, args, commandOptions) => spawnAndWait(command, args, commandOptions));
  const value = String(text || "");
  if (!value) {
    throw new Error("Nothing to copy.");
  }
  if (platform === "win32") {
    return await run("clip", [], { stdinText: value });
  }
  if (platform === "darwin") {
    return await run("pbcopy", [], { stdinText: value });
  }
  try {
    return await run("wl-copy", [], { stdinText: value });
  } catch {}
  try {
    return await run("xclip", ["-selection", "clipboard"], { stdinText: value });
  } catch {}
  try {
    return await run("xsel", ["--clipboard", "--input"], { stdinText: value });
  } catch {}
  throw new Error("Clipboard copy is not supported on this platform without wl-copy, xclip, or xsel.");
}

export async function revealPath(targetPath: string, options: RevealOptions = {}) {
  const platform = String(options.platform || process.platform);
  const target = String(options.target || "file").trim().toLowerCase();
  const run = options.runCommand || ((command, args, commandOptions) => spawnAndWait(command, args, commandOptions));
  const resolved = String(targetPath || "").trim();
  if (!resolved) {
    throw new Error("Nothing to reveal.");
  }
  if (platform === "win32") {
    if (target === "file") {
      return await run("explorer.exe", [`/select,${resolved}`]);
    }
    return await run("explorer.exe", [resolved]);
  }
  if (platform === "darwin") {
    if (target === "file") {
      return await run("open", ["-R", resolved]);
    }
    return await run("open", [resolved]);
  }
  if (target === "file") {
    return await run("xdg-open", [path.dirname(resolved)]);
  }
  return await run("xdg-open", [resolved]);
}
