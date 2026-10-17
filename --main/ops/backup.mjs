import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createWriteStream, createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { createHash } from "node:crypto";
import path from "node:path";
export function command(args) {
  const r = spawnSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (r.status !== 0)
    throw Error("Docker operation failed: " + r.stderr.slice(0, 1000));
  return r.stdout.trim();
}
export async function output(args, file) {
  const child = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });
  const completion = new Promise((resolve, reject) => {
    let error = "";
    child.stderr.on("data", (d) => {
      error += d.toString().slice(0, 500);
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(Error("Backup command failed: " + error)),
    );
  });
  await Promise.all([
    pipeline(
      child.stdout,
      createWriteStream(file, { mode: 0o600, flags: "wx" }),
    ),
    completion,
  ]);
}
export async function digest(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
const countsSQL =
  "SELECT json_build_object('accounts',(SELECT count(*) FROM accounts),'houses',(SELECT count(*) FROM houses),'records',(SELECT count(*) FROM records),'versions',(SELECT count(*) FROM record_versions),'files',(SELECT count(*) FROM files))";
export { countsSQL };
export async function backup(folder) {
  await mkdir(path.dirname(folder), { recursive: true });
  await mkdir(folder, { mode: 0o700 });
  const container = command(["compose", "ps", "-aq", "app"]),
    image = command(["compose", "images", "-q", "app"]);
  if (!container || !image)
    throw Error("Start the application before creating a backup.");
  const running = command([
    "compose",
    "ps",
    "--status",
    "running",
    "-q",
    "app",
  ]);
  if (running) command(["compose", "stop", "app"]);
  try {
    const counts = JSON.parse(
      command([
        "compose",
        "exec",
        "-T",
        "db",
        "psql",
        "-U",
        "uykomek",
        "-d",
        "uykomek",
        "-At",
        "-c",
        countsSQL,
      ]),
    );
    await output(
      [
        "compose",
        "exec",
        "-T",
        "db",
        "pg_dump",
        "-U",
        "uykomek",
        "-d",
        "uykomek",
        "-Fc",
      ],
      path.join(folder, "database.dump"),
    );
    await output(
      [
        "run",
        "--rm",
        "--network",
        "none",
        "--volumes-from",
        container + ":ro",
        "--entrypoint",
        "tar",
        image,
        "-C",
        "/app/data/files",
        "-czf",
        "-",
        ".",
      ],
      path.join(folder, "files.tar.gz"),
    );
    const checks = command([
      "run",
      "--rm",
      "--network",
      "none",
      "--volumes-from",
      container + ":ro",
      "--entrypoint",
      "sh",
      image,
      "-c",
      "cd /app/data/files && find . -type f -exec sha256sum {} \\;",
    ]);
    await writeFile(path.join(folder, "files.sha256"), checks + "\n", {
      mode: 0o600,
    });
    const hashes = {};
    for (const name of ["database.dump", "files.tar.gz", "files.sha256"])
      hashes[name] = await digest(path.join(folder, name));
    await writeFile(
      path.join(folder, "manifest.json"),
      JSON.stringify(
        { createdAt: new Date().toISOString(), counts, hashes },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    console.log(
      "Consistent backup created. Database and files are private; store encrypted off-server.",
    );
  } finally {
    if (running) command(["compose", "start", "app"]);
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
) {
  await backup(
    path.resolve(
      process.argv[2] ||
        "backups/" + new Date().toISOString().replace(/[:.]/g, "-"),
    ),
  );
}
