import { spawn, spawnSync } from "node:child_process";

const WINDOWS_CMD_WRAPPED = new Set(["npm", "npm.cmd", "npx", "npx.cmd", "codex", "codex.cmd"]);

export function buildSpawnSpec(command, commandArgs = []) {
  if (process.platform !== "win32") {
    return {
      command,
      args: commandArgs
    };
  }

  const normalizedCommand = String(command || "").toLowerCase();
  if (WINDOWS_CMD_WRAPPED.has(normalizedCommand) || /\.(cmd|bat)$/i.test(String(command || ""))) {
    return {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", command, ...commandArgs]
    };
  }

  return {
    command,
    args: commandArgs
  };
}

export async function runCommand(command, commandArgs = [], options = {}) {
  return await new Promise((resolve) => {
    const spawnSpec = buildSpawnSpec(command, commandArgs);
    const child = spawn(spawnSpec.command, spawnSpec.args, {
      cwd: options.cwd || process.cwd(),
      env: {
        ...process.env,
        ...options.env
      },
      stdio: "pipe",
      shell: false
    });

    let stdout = "";
    let stderr = "";
    let finished = false;

    const finish = (code, signal, timedOut = false) => {
      if (finished) {
        return;
      }
      finished = true;
      resolve({
        code: timedOut ? -1 : code ?? 0,
        signal: signal || "",
        stdout,
        stderr,
        timedOut
      });
    };

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      stderr += error.message;
      finish(1, "");
    });

    child.on("close", (code, signal) => {
      finish(code, signal);
    });

    if (options.input) {
      child.stdin.write(options.input);
    }
    child.stdin.end();

    if (options.timeoutMs) {
      setTimeout(() => {
        if (!finished) {
          child.kill("SIGTERM");
          finish(-1, "SIGTERM", true);
        }
      }, options.timeoutMs);
    }
  });
}

export async function runShellCommand(commandText, options = {}) {
  const normalizedCommand = String(commandText || "").trim();
  if (!normalizedCommand) {
    return {
      code: 1,
      signal: "",
      stdout: "",
      stderr: "Command text is empty.",
      timedOut: false
    };
  }

  if (process.platform === "win32") {
    return await runCommand("powershell.exe", ["-NoProfile", "-Command", normalizedCommand], options);
  }

  return await runCommand("sh", ["-lc", normalizedCommand], options);
}

export function runCommandSync(command, commandArgs = [], options = {}) {
  const spawnSpec = buildSpawnSpec(command, commandArgs);
  const result = spawnSync(spawnSpec.command, spawnSpec.args, {
    cwd: options.cwd || process.cwd(),
    env: {
      ...process.env,
      ...options.env
    },
    encoding: "utf8",
    shell: false,
    input: options.input
  });

  return {
    code: Number.isInteger(result.status) ? result.status : 1,
    signal: result.signal || "",
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || "")
  };
}

export function runGitCommandSync(projectDir, commandArgs = [], options = {}) {
  return runCommandSync("git", commandArgs, {
    cwd: projectDir,
    ...options
  });
}

export function isGitWorktree(projectDir) {
  const repoCheck = runGitCommandSync(projectDir, ["rev-parse", "--is-inside-work-tree"]);
  return repoCheck.code === 0 && /^true$/i.test(repoCheck.stdout.trim());
}

export function readGitStatus(projectDir) {
  const statusResult = runGitCommandSync(projectDir, ["status", "--porcelain"]);
  if (statusResult.code !== 0) {
    return [];
  }
  return statusResult.stdout
    .split(/\r?\n/)
    .map((line) => line.replace(/\r$/, ""))
    .filter((line) => line.trim().length > 0)
    .map((line) => line.slice(3).trim())
    .filter(Boolean);
}

export function readGitHeadSubject(projectDir) {
  return runGitCommandSync(projectDir, ["log", "-1", "--pretty=%s"]).stdout.trim();
}

export function readGitTagsAtHead(projectDir) {
  return runGitCommandSync(projectDir, ["tag", "--points-at", "HEAD"]).stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function readGitState(projectDir) {
  if (!isGitWorktree(projectDir)) {
    return {
      insideWorktree: false,
      dirtyPaths: [],
      headSubject: "",
      tagsAtHead: []
    };
  }

  return {
    insideWorktree: true,
    dirtyPaths: readGitStatus(projectDir),
    headSubject: readGitHeadSubject(projectDir),
    tagsAtHead: readGitTagsAtHead(projectDir)
  };
}
