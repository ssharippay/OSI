import { build } from "esbuild";
import { mkdir, cp } from "node:fs/promises";
await build({
  entryPoints: ["server/index.ts"],
  bundle: true,
  platform: "node",
  target: "node24",
  packages: "external",
  format: "esm",
  outfile: "build-server/index.js",
});
await mkdir("build-server/migrations", { recursive: true });
await cp("server/migrations", "build-server/migrations", { recursive: true });
