import { createSeededDemoState } from "../src/demo/demo-state.ts";
import { demoStatePath, writeDemoState } from "./demo-utils.mjs";

const state = createSeededDemoState();
await writeDemoState(state);

console.log(`Seeded demo state: ${demoStatePath}`);
console.log(`Airports: ${state.airports.length}`);
console.log(`Route candidates: ${state.routeCandidates.length}`);
console.log(`Historical fare snapshots: ${state.fareSnapshots.length}`);
