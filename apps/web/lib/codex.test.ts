import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionCwd } from "./codex.ts";

test("reads the workspace from Codex session metadata", () => {
  const raw = [
    "not json",
    JSON.stringify({ type: "event_msg", payload: { cwd: "/wrong" } }),
    JSON.stringify({ type: "session_meta", payload: { cwd: "/project" } }),
  ].join("\n");

  assert.equal(sessionCwd(raw), "/project");
  assert.equal(sessionCwd(""), null);
});
