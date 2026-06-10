import { createServer } from "node:http";
import { createDemoApp } from "../src/demo/demo-app.ts";
import { runDemoScan } from "../src/demo/demo-runner.ts";
import { readDevVars, readOrCreateDemoState, writeDemoState } from "./demo-utils.mjs";

const port = Number.parseInt(process.env.PORT ?? "8787", 10);
const env = await readDevVars();
const state = await readOrCreateDemoState();

if (state.dealScores.length === 0) {
  await runDemoScan(state);
  await writeDemoState(state);
}

const app = createDemoApp({
  env,
  state,
  afterScan: async () => {
    await writeDemoState(state);
  }
});

function headersFromNode(rawHeaders) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(rawHeaders)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else if (value !== undefined) {
      headers.set(key, value);
    }
  }
  return headers;
}

async function requestBody(request) {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

const server = createServer(async (nodeRequest, nodeResponse) => {
  try {
    const host = nodeRequest.headers.host ?? `localhost:${port}`;
    const url = new URL(nodeRequest.url ?? "/", `http://${host}`);
    const body = await requestBody(nodeRequest);
    const init = {
      method: nodeRequest.method,
      headers: headersFromNode(nodeRequest.headers)
    };
    if (body !== undefined) init.body = body;

    const response = await app.handle(new Request(url, init));
    nodeResponse.statusCode = response.status;
    response.headers.forEach((value, key) => nodeResponse.setHeader(key, value));
    const responseBody = Buffer.from(await response.arrayBuffer());
    nodeResponse.end(responseBody);
  } catch (error) {
    nodeResponse.statusCode = 500;
    nodeResponse.setHeader("Content-Type", "application/json");
    nodeResponse.end(JSON.stringify({
      ok: false,
      error: "local_dev_error",
      message: error instanceof Error ? error.message : "Unknown local dev error"
    }));
  }
});

server.listen(port, () => {
  console.log(`Malaysia Flight Deal Radar demo running at http://localhost:${port}`);
  console.log(`Dashboard: http://localhost:${port}/dashboard`);
  console.log(`Health: http://localhost:${port}/health`);
  console.log(`Deals: http://localhost:${port}/api/deals`);
  if (!env.ADMIN_TOKEN) {
    console.log("ADMIN_TOKEN is not set; POST /api/admin/scan will return disabled.");
  }
});
