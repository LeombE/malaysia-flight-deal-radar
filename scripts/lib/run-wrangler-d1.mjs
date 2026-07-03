import { spawn } from "node:child_process";
import { resolve } from "node:path";

export function buildWranglerD1ExecuteCommand(options) {
  const platform = options.platform || process.platform;
  const databaseName = options.databaseName || "malaysia-flight-deal-radar";
  if (platform === "win32") {
    return {
      command: "cmd.exe",
      args: [
        "/d",
        "/s",
        "/c",
        "npx.cmd",
        "wrangler",
        "d1",
        "execute",
        databaseName,
        "--local",
        "--file",
        options.sqlFilePath
      ]
    };
  }
  return {
    command: "npx",
    args: [
      "wrangler",
      "d1",
      "execute",
      databaseName,
      "--local",
      "--file",
      options.sqlFilePath
    ]
  };
}

function redactionValues(values) {
  return values
    .filter((value) => typeof value === "string" && value.length > 0)
    .sort((left, right) => right.length - left.length);
}

export function sanitizeWranglerD1Output(value, redactions = []) {
  let output = String(value ?? "");
  for (const secret of redactionValues(redactions)) {
    output = output.replaceAll(secret, "[redacted]");
  }
  output = output.replace(/travelpayouts_[A-Za-z0-9_\-]+/gu, "[redacted-travelpayouts-token]");
  output = output.replace(/duffel_(?:test|live)_[A-Za-z0-9_\-]+/gu, "[redacted-duffel-token]");
  output = output.replace(/Bearer\s+[A-Za-z0-9._\-]+/gu, "Bearer [redacted]");
  return output;
}

function safeCommandLine(command, args, redactions) {
  const safeCommand = sanitizeWranglerD1Output(command, redactions);
  const safeArgs = args.map((arg) => sanitizeWranglerD1Output(arg, redactions));
  return `${safeCommand} ${safeArgs.join(" ")}`.trim();
}

function formatFailure(input) {
  const lines = [
    input.kind === "spawn_error"
      ? "Wrangler D1 execute failed before process start."
      : `Wrangler D1 execute failed with exit code ${input.code}.`,
    `Command: ${safeCommandLine(input.command, input.args, input.redactions)}`,
    `cwd: ${sanitizeWranglerD1Output(input.cwd, input.redactions)}`
  ];
  if (input.errorCode) lines.push(`Error code: ${sanitizeWranglerD1Output(input.errorCode, input.redactions)}`);
  if (input.errorMessage) lines.push(`Error message: ${sanitizeWranglerD1Output(input.errorMessage, input.redactions)}`);
  if (input.stderr !== undefined) {
    lines.push("stderr:");
    lines.push(sanitizeWranglerD1Output(input.stderr.trim() || "(empty)", input.redactions));
  }
  if (input.stdout !== undefined) {
    lines.push("stdout:");
    lines.push(sanitizeWranglerD1Output(input.stdout.trim() || "(empty)", input.redactions));
  }
  return lines.join("\n");
}

function spawnWrangler(command, args, options, spawnImpl) {
  return new Promise((resolveRun, rejectRun) => {
    let child;
    try {
      child = spawnImpl(command, args, options);
    } catch (error) {
      rejectRun(error);
      return;
    }

    let stdout = "";
    let stderr = "";
    let settled = false;
    child.stdout?.on?.("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on?.("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on?.("error", (error) => {
      if (settled) return;
      settled = true;
      rejectRun(error);
    });
    child.on?.("close", (code) => {
      if (settled) return;
      settled = true;
      resolveRun({ code, stdout, stderr });
    });
  });
}

export async function runWranglerD1Execute(options) {
  if (!options.sqlFilePath || typeof options.sqlFilePath !== "string") {
    throw new Error("Wrangler D1 execute requires sqlFilePath.");
  }
  const cwd = resolve(options.cwd || process.cwd());
  const databaseName = options.databaseName || "malaysia-flight-deal-radar";
  const redactions = options.redactions || [];
  const { command, args } = buildWranglerD1ExecuteCommand({
    platform: options.platform,
    databaseName,
    sqlFilePath: options.sqlFilePath
  });
  const spawnOptions = {
    cwd,
    windowsHide: true,
    shell: false
  };
  const spawnImpl = options.spawnImpl || spawn;

  let result;
  try {
    result = await spawnWrangler(command, args, spawnOptions, spawnImpl);
  } catch (error) {
    throw new Error(formatFailure({
      kind: "spawn_error",
      command,
      args,
      cwd,
      redactions,
      errorCode: error?.code,
      errorMessage: error instanceof Error ? error.message : String(error)
    }));
  }

  if (result.code !== 0) {
    throw new Error(formatFailure({
      kind: "exit_error",
      code: result.code,
      command,
      args,
      cwd,
      redactions,
      stderr: result.stderr,
      stdout: result.stdout
    }));
  }

  return {
    command,
    args,
    cwd,
    stdout: sanitizeWranglerD1Output(result.stdout, redactions),
    stderr: sanitizeWranglerD1Output(result.stderr, redactions)
  };
}
