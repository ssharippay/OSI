import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPilot } from "./preflight.mjs";

test("missing Docker stops checks without initializing configuration", () => {
  const calls = [];
  const errors = checkPilot((cmd, args) => {
    calls.push([cmd, args]);
    return { error: new Error("ENOENT"), status: null };
  }, "24.0.0");
  assert.equal(calls.length, 1);
  assert.match(errors[0], /Docker не найден/);
});
test("checks Node, Compose and daemon independently", () => {
  const errors = checkPilot((_cmd, args) => ({
    status: args[0] === "--version" ? 0 : 1,
  }), "22.0.0");
  assert.equal(errors.length, 3);
});
test("rejects Windows containers and accepts Linux", () => {
  for (const os of ["windows", "linux"]) {
    const errors = checkPilot(() => ({ status: 0, stdout: os + "\n" }), "24.0.0");
    assert.equal(errors.length, os === "linux" ? 0 : 1);
  }
});
test("a timed out engine returns an actionable error", () => {
  const errors = checkPilot((_cmd, args) => args[0] === "info"
    ? { error: new Error("ETIMEDOUT"), status: null }
    : { status: 0, stdout: "" }, "24.0.0");
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Docker Engine недоступен/);
});
