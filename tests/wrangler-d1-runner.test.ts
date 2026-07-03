import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// @ts-ignore local .mjs helper is tested at runtime.
const runner = await import("../scripts/lib/run-wrangler-d1.mjs") as {
  buildWranglerD1ExecuteCommand: (options: { platform?: string; databaseName?: string; sqlFilePath: string }) => { command: string; args: string[] };
  sanitizeWranglerD1Output: (value: unknown, redactions?: string[]) => string;
  runWranglerD1Execute: (options: {
    cwd: string;
    databaseName?: string;
    sqlFilePath: string;
    platform?: string;
    redactions?: string[];
    spawnImpl?: (command: string, args: string[], options: Record<string, unknown>) => unknown;
  }) => Promise<{ command: string; args: string[]; cwd: string; stdout: string; stderr: string }>;
};

const TOKEN = "travelpayouts_secret_runner_token";
const SQL_PATH_WITH_SPACES = "C:\\Users\\Admin\\OneDrive\\Documents\\flight API real time\\smoke-output\\travelpayouts import local.sql";
const CWD_WITH_SPACES = "C:\\Users\\Admin\\OneDrive\\Documents\\flight API real time";

interface SpawnCall {
  command: string;
  args: string[];
  options: Record<string, unknown>;
}

function createSpawnMock(input: {
  code?: number;
  stdout?: string;
  stderr?: string;
  error?: Error & { code?: string };
}) {
  const calls: SpawnCall[] = [];
  const spawnImpl = (command: string, args: string[], options: Record<string, unknown>) => {
    calls.push({ command, args, options });
    const child = {
      stdout: {
        on(event: string, callback: (chunk: string) => void) {
          if (event === "data" && input.stdout) queueMicrotask(() => callback(input.stdout ?? ""));
          return this;
        }
      },
      stderr: {
        on(event: string, callback: (chunk: string) => void) {
          if (event === "data" && input.stderr) queueMicrotask(() => callback(input.stderr ?? ""));
          return this;
        }
      },
      on(event: string, callback: (value: unknown) => void) {
        if (event === "error" && input.error) queueMicrotask(() => callback(input.error));
        if (event === "close" && !input.error) queueMicrotask(() => callback(input.code ?? 0));
        return this;
      }
    };
    return child;
  };
  return { calls, spawnImpl };
}

test("Wrangler D1 runner uses npx.cmd on Windows and keeps SQL paths with spaces as one arg", () => {
  const command = runner.buildWranglerD1ExecuteCommand({
    platform: "win32",
    databaseName: "malaysia-flight-deal-radar",
    sqlFilePath: SQL_PATH_WITH_SPACES
  });

  assert.equal(command.command, "npx.cmd");
  assert.deepEqual(command.args, [
    "wrangler",
    "d1",
    "execute",
    "malaysia-flight-deal-radar",
    "--local",
    "--file",
    SQL_PATH_WITH_SPACES
  ]);
  assert.equal(command.args[command.args.indexOf("--file") + 1], SQL_PATH_WITH_SPACES);
});

test("Wrangler D1 runner uses npx on non-Windows", () => {
  const command = runner.buildWranglerD1ExecuteCommand({
    platform: "linux",
    databaseName: "malaysia-flight-deal-radar",
    sqlFilePath: "/tmp/travelpayouts-import.sql"
  });

  assert.equal(command.command, "npx");
  assert.equal(command.args.includes("--local"), true);
  assert.equal(command.args.includes("--file"), true);
});

test("Wrangler D1 runner passes command and args array to spawn", async () => {
  const mock = createSpawnMock({ stdout: "ok", stderr: "" });
  const result = await runner.runWranglerD1Execute({
    cwd: CWD_WITH_SPACES,
    databaseName: "malaysia-flight-deal-radar",
    sqlFilePath: SQL_PATH_WITH_SPACES,
    platform: "win32",
    redactions: [TOKEN],
    spawnImpl: mock.spawnImpl
  });

  assert.equal(result.command, "npx.cmd");
  assert.equal(result.args[result.args.indexOf("--file") + 1], SQL_PATH_WITH_SPACES);
  assert.equal(mock.calls.length, 1);
  assert.equal(mock.calls[0]?.command, "npx.cmd");
  assert.equal(mock.calls[0]?.args.includes("--local"), true);
  assert.equal(mock.calls[0]?.args.includes("--file"), true);
  assert.equal(mock.calls[0]?.args[mock.calls[0].args.indexOf("--file") + 1], SQL_PATH_WITH_SPACES);
  assert.equal(mock.calls[0]?.options.shell, false);
  assert.equal(result.stdout, "ok");
});

test("Wrangler D1 runner reports spawn EINVAL with sanitized diagnostics", async () => {
  const error = new Error(`spawn failed ${TOKEN} raw-provider-payload`) as Error & { code?: string };
  error.code = "EINVAL";
  const mock = createSpawnMock({ error });

  await assert.rejects(
    runner.runWranglerD1Execute({
      cwd: CWD_WITH_SPACES,
      databaseName: "malaysia-flight-deal-radar",
      sqlFilePath: SQL_PATH_WITH_SPACES,
      platform: "win32",
      redactions: [TOKEN, "raw-provider-payload"],
      spawnImpl: mock.spawnImpl
    }),
    (thrown: unknown) => {
      const message = thrown instanceof Error ? thrown.message : String(thrown);
      assert.match(message, /failed before process start/);
      assert.match(message, /Error code: EINVAL/);
      assert.match(message, /npx\.cmd wrangler d1 execute malaysia-flight-deal-radar --local --file/);
      assert.match(message, /flight API real time/);
      assert.equal(message.includes(TOKEN), false);
      assert.equal(message.includes("raw-provider-payload"), false);
      return true;
    }
  );
});

test("Wrangler D1 runner sanitizes failed stdout and stderr", async () => {
  const mock = createSpawnMock({
    code: 1,
    stdout: `stdout ${TOKEN}`,
    stderr: "stderr raw-provider-payload"
  });

  await assert.rejects(
    runner.runWranglerD1Execute({
      cwd: CWD_WITH_SPACES,
      databaseName: "malaysia-flight-deal-radar",
      sqlFilePath: SQL_PATH_WITH_SPACES,
      platform: "linux",
      redactions: [TOKEN, "raw-provider-payload"],
      spawnImpl: mock.spawnImpl
    }),
    (thrown: unknown) => {
      const message = thrown instanceof Error ? thrown.message : String(thrown);
      assert.match(message, /exit code 1/);
      assert.equal(message.includes(TOKEN), false);
      assert.equal(message.includes("raw-provider-payload"), false);
      return true;
    }
  );
});

test("Travelpayouts import and verify scripts use the shared safe D1 runner", () => {
  const importScript = readFileSync("scripts/travelpayouts-import-local.mjs", "utf8");
  const verifyScript = readFileSync("scripts/travelpayouts-import-verify-local.mjs", "utf8");

  assert.match(importScript, /\.\/lib\/run-wrangler-d1\.mjs/);
  assert.match(verifyScript, /\.\/lib\/run-wrangler-d1\.mjs/);
  assert.match(importScript, /runWranglerD1Execute/);
  assert.match(verifyScript, /runWranglerD1Execute/);
  assert.equal(importScript.includes("spawn("), false);
  assert.equal(verifyScript.includes("spawn("), false);
});

test("Wrangler D1 output sanitizer redacts token-shaped values", () => {
  const output = runner.sanitizeWranglerD1Output(`token ${TOKEN} Bearer abc.def travelpayouts_live_secret`, [TOKEN]);

  assert.equal(output.includes(TOKEN), false);
  assert.equal(output.includes("Bearer abc.def"), false);
  assert.equal(output.includes("travelpayouts_live_secret"), false);
});
