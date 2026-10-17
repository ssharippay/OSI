import { spawnSync } from "node:child_process";
import { checkPilot } from "./preflight.mjs";
const errors = checkPilot();
if (errors.length) {
  for (const error of errors) console.error(error);
  process.exit(1);
}
await import("./init-env.mjs");
const r = spawnSync("docker", ["compose", "up", "--build", "-d", "--wait"], {
  stdio: "inherit",
});
if (r.error) console.error("Start Docker Desktop and retry.");
process.exit(r.status ?? 1);
