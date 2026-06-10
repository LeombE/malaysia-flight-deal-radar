import { DemoRepository } from "../src/demo/demo-repository.ts";
import { runDemoScan } from "../src/demo/demo-runner.ts";
import { labelCounts, readOrCreateDemoState, writeDemoState } from "./demo-utils.mjs";

const state = await readOrCreateDemoState();
const result = await runDemoScan(state);
await writeDemoState(state);

const repository = new DemoRepository(state);
const deals = await repository.listDeals({}, new Date(state.clock.nowIso), 30);

console.log("Demo scan complete.");
console.log(JSON.stringify(result, null, 2));
console.log(`Deal labels: ${JSON.stringify(labelCounts(deals))}`);
console.log("Open http://localhost:8787/dashboard after running npm run dev.");
