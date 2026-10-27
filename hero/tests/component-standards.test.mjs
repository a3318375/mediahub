import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import ts from "typescript";

// Keep future screens on the same accessible component system.
test("HeroUI owns interactive primitives throughout the maintained frontend", async () => {
  const forbidden = new Set(["button", "a", "input", "textarea", "select", "details", "progress", "table", "dialog"]);
  const violations = [];
  async function inspect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const url = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
      if (entry.isDirectory()) { await inspect(url); continue; }
      if (!entry.name.endsWith(".tsx")) continue;
      const source = ts.createSourceFile(url.pathname, await readFile(url, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      function visit(node) {
        if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && forbidden.has(node.tagName.getText(source))) {
          const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
          violations.push(`${url.pathname}:${line + 1} <${node.tagName.getText(source)}>`);
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
  await inspect(new URL("../src/", import.meta.url));
  assert.deepEqual(violations, [], "Use HeroUI primitives or the shared ui wrappers: " + violations.join(", "));
});
