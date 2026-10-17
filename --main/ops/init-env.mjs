import { existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
if (!existsSync(".env")) {
  const port = process.env.UYKOMEK_PORT || "3000";
  if (!/^\d{4,5}$/.test(port)) throw Error("Invalid local port.");
  writeFileSync(
    ".env",
    `POSTGRES_PASSWORD=${randomBytes(32).toString("hex")}\nHOST_PORT=${port}\nPUBLIC_ORIGIN=http://localhost:${port}\nALLOW_INSECURE_LOCAL=true\nAI_ENABLED=false\nAI_API_KEY=\n`,
    { mode: 0o600, flag: "wx" },
  );
  console.log(
    "Created private .env for local use. Existing files are never overwritten.",
  );
} else console.log("Existing .env preserved.");
