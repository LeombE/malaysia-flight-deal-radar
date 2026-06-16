import { spawnSync } from "node:child_process";

const npxExecutable = process.platform === "win32" ? "npx.cmd" : "npx";

const steps = [
  {
    id: "cleanup",
    label: "Clean remote mock/demo rows",
    args: ["wrangler", "d1", "execute", "malaysia-flight-deal-radar", "--remote", "--file", "scripts/sql/remote-demo-cleanup.sql"]
  },
  {
    id: "seed",
    label: "Seed remote mock/demo baselines",
    args: ["wrangler", "d1", "execute", "malaysia-flight-deal-radar", "--remote", "--file", "scripts/sql/remote-demo-baseline-seed.sql"]
  },
  {
    id: "verify",
    label: "Verify remote mock/demo baselines",
    args: ["wrangler", "d1", "execute", "malaysia-flight-deal-radar", "--remote", "--file", "scripts/sql/remote-demo-baseline-verify.sql"]
  }
];

function commandText(step) {
  return [npxExecutable, ...step.args].join(" ");
}

function writeOutput(label, output) {
  const text = output?.trim();
  if (!text) return;
  console.error(`\n${label}:`);
  console.error(text);
}

for (const step of steps) {
  console.log(`\n${step.label}`);
  console.log(`Command: ${commandText(step)}`);
  const result = spawnSync(npxExecutable, step.args, {
    encoding: "utf8",
    stdio: "pipe",
    shell: false
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }

  if (result.status !== 0) {
    console.error(`\nRemote demo reset failed during ${step.id}: ${step.label}`);
    console.error(`Failed command: ${commandText(step)}`);
    writeOutput("stdout", result.stdout);
    writeOutput("stderr", result.stderr);
    if (result.error) {
      console.error(`spawn error: ${result.error.message}`);
    }
    process.exit(result.status ?? 1);
  }

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
}

console.log("\nRemote demo reset finished.");
console.log("Next, trigger one protected admin scan manually. Do not paste the token into repo files.");
console.log("");
console.log('$base = "https://<your-worker>.<your-subdomain>.workers.dev"');
console.log('$adminToken = Read-Host "ADMIN_TOKEN"');
console.log('Invoke-RestMethod -Method Post "$base/api/admin/scan" -Headers @{ Authorization = "Bearer $adminToken" }');
console.log('Invoke-RestMethod "$base/api/deals"');
console.log('Start-Process "$base/dashboard"');
