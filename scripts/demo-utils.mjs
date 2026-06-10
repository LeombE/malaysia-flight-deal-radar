import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = fileURLToPath(new URL("..", import.meta.url));
export const demoStatePath = resolve(projectRoot, "demo-data", "demo-state.json");

export async function readDemoState() {
  const text = await readFile(demoStatePath, "utf8");
  return JSON.parse(text);
}

export async function writeDemoState(state) {
  await mkdir(dirname(demoStatePath), { recursive: true });
  await writeFile(demoStatePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export async function readDevVars() {
  const env = {};
  const path = resolve(projectRoot, ".dev.vars");
  try {
    const text = await readFile(path, "utf8");
    for (const rawLine of text.split(/\r?\n/u)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const equalsAt = line.indexOf("=");
      if (equalsAt <= 0) continue;
      const key = line.slice(0, equalsAt).trim();
      const value = line.slice(equalsAt + 1).trim();
      env[key] = value;
    }
  } catch (error) {
    if (error && error.code !== "ENOENT") throw error;
  }
  return {
    ...env,
    ...process.env
  };
}

export async function readOrCreateDemoState() {
  try {
    return await readDemoState();
  } catch (error) {
    if (error && error.code !== "ENOENT") throw error;
    const { createSeededDemoState } = await import("../src/demo/demo-state.ts");
    const state = createSeededDemoState();
    await writeDemoState(state);
    return state;
  }
}

export function labelCounts(deals) {
  return deals.reduce((counts, deal) => {
    counts[deal.deal_label] = (counts[deal.deal_label] ?? 0) + 1;
    return counts;
  }, {});
}
