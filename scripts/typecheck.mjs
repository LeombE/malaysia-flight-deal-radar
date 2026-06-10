import { readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve("src");

async function collectTsFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectTsFiles(fullPath));
    } else if (entry.name.endsWith(".ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

const files = await collectTsFiles(root);
for (const file of files) {
  await import(pathToFileURL(file).href);
}

console.log(`Imported ${files.length} TypeScript source files successfully.`);
console.log("Note: npm/tsc is not available in this workspace, so this is syntax/import validation using Node type stripping.");

