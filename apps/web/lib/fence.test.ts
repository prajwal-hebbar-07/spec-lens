import { test } from "node:test";
import assert from "node:assert/strict";
import { fenceLanguage } from "./fence.ts";

test("routes mermaid fences", () => {
  assert.equal(fenceLanguage("language-mermaid"), "mermaid");
});

test("returns the language for other fences", () => {
  assert.equal(fenceLanguage("language-ts"), "ts");
  assert.equal(fenceLanguage("hljs language-bash extra"), "bash");
});

test("returns null for inline code / no language", () => {
  assert.equal(fenceLanguage(undefined), null);
  assert.equal(fenceLanguage(""), null);
  assert.equal(fenceLanguage("some-other-class"), null);
});
