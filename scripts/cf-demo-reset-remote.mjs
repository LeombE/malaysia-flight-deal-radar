import { spawnSync } from "node:child_process";

const npxExecutable = process.platform === "win32" ? "npx.cmd" : "npx";

const steps = [
  {
    label: "Clean remote mock/demo rows",
    args: ["wrangler", "d1", "execute", "malaysia-flight-deal-radar", "--remote", "--file", "scripts/sql/remote-demo-cleanup.sql"]
  },
  {
    label: "Seed remote mock/demo baselines",
    args: ["wrangler", "d1", "execute", "malaysia-flight-deal-radar", "--remote", "--file", "scripts/sql/remote-demo-baseline-seed.sql"]
  },
  {
    label: "Verify remote mock/demo baselines",
    args: ["wrangler", "d1", "execute", "malaysia-flight-deal-radar", "--remote", "--file", "scripts/sql/remote-demo-baseline-verify.sql"]
  }
];

for (const step of steps) {
  console.log(`\n${step.label}`);
  const result = spawnSync(npxExecutable, step.args, {
    stdio: "inherit",
    shell: false
  });

  if (result.status !== 0) {
    console.error(`\nFailed: ${step.label}`);
    process.exit(result.status ?? 1);
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

