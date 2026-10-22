import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

async function adapter(demo) {
  const source = (await readFile(new URL("../src/lib/media-service.ts", import.meta.url), "utf8"))
    .replaceAll("import.meta.env?.STATIC_DEMO", String(demo))
    .replaceAll("import.meta.env.STATIC_DEMO", String(demo));
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
}

test("static demo ignores stored live credentials and refuses backend requests", async () => {
  const api = await adapter(true);
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("unexpected network"); };
  try {
    assert.deepEqual(api.readSession(), { mode: "demo", name: "演示访客" });
    assert.equal(api.isDemoEntry(), true);
    await assert.rejects(api.request("/api/auth/me", { mode: "live", token: "stale" }), /在线演示不连接后端/);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = original; }
});

test("production keeps live session and real backend behavior", async () => {
  const api = await adapter(false);
  const originals = Object.fromEntries(["window", "sessionStorage", "localStorage", "fetch"].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  const session = { mode: "live", name: "Admin", token: "test-token" };
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { search: "" } } });
    for (const key of ["sessionStorage", "localStorage"])
      Object.defineProperty(globalThis, key, { configurable: true, value: { getItem: () => JSON.stringify(session) } });
    assert.deepEqual(api.readSession(), session);
    assert.equal(api.isDemoEntry(), false);
    globalThis.fetch = async (path, options) => {
      assert.equal(path, "/api/auth/me");
      assert.equal(options.headers.Authorization, "Bearer test-token");
      return new Response(JSON.stringify({ name: "Admin" }));
    };
    assert.deepEqual(await api.request("/api/auth/me", session), { name: "Admin" });
  } finally {
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
