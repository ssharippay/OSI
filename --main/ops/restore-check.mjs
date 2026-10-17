import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { command, digest, countsSQL } from "./backup.mjs";
const folder = path.resolve(process.argv[2] || "");
if (!process.argv[2]) throw Error("Provide a backup directory.");
const manifest = JSON.parse(
  await readFile(path.join(folder, "manifest.json"), "utf8"),
);
for (const name of ["database.dump", "files.tar.gz", "files.sha256"])
  if ((await digest(path.join(folder, name))) !== manifest.hashes[name])
    throw Error("Backup integrity check failed.");
async function input(args, file) {
  const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
  const completion = new Promise((resolve, reject) => {
    let error = "";
    child.stderr.on("data", (d) => (error += d.toString().slice(0, 500)));
    child.stdout.resume();
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(Error("Restore failed: " + error)),
    );
  });
  await Promise.all([
    pipeline(createReadStream(file), child.stdin),
    completion,
  ]);
}
const suffix = randomBytes(6).toString("hex"),
  db = "uykomek_restore_" + suffix,
  volume = "uykomek_restore_files_" + suffix,
  image = command(["compose", "images", "-q", "app"]);
let created = false,
  volumeCreated = false;
try {
  command(["compose", "exec", "-T", "db", "createdb", "-U", "uykomek", db]);
  created = true;
  await input(
    [
      "compose",
      "exec",
      "-T",
      "db",
      "pg_restore",
      "-U",
      "uykomek",
      "-d",
      db,
      "--no-owner",
    ],
    path.join(folder, "database.dump"),
  );
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
      db,
      "-At",
      "-c",
      countsSQL,
    ]),
  );
  if (JSON.stringify(counts) !== JSON.stringify(manifest.counts))
    throw Error("Restored row counts differ from the backup manifest.");
  command(["volume", "create", volume]);
  volumeCreated = true;
  await input(
    [
      "run",
      "--rm",
      "-i",
      "--network",
      "none",
      "--user",
      "0:0",
      "--mount",
      `source=${volume},target=/restore`,
      "--entrypoint",
      "tar",
      image,
      "-C",
      "/restore",
      "-xzf",
      "-",
    ],
    path.join(folder, "files.tar.gz"),
  );
  await input(
    [
      "run",
      "--rm",
      "-i",
      "--network",
      "none",
      "--user",
      "0:0",
      "--mount",
      `source=${volume},target=/restore`,
      "--entrypoint",
      "sh",
      image,
      "-c",
      "cat > /restore/files.sha256",
    ],
    path.join(folder, "files.sha256"),
  );
  const checksumText = await readFile(
    path.join(folder, "files.sha256"),
    "utf8",
  );
  if (checksumText.trim())
    command([
      "run",
      "--rm",
      "--network",
      "none",
      "--mount",
      `source=${volume},target=/restore,readonly`,
      "--entrypoint",
      "sh",
      image,
      "-c",
      "cd /restore && sha256sum -c files.sha256",
    ]);
  const referenced = command([
    "compose",
    "exec",
    "-T",
    "db",
    "psql",
    "-U",
    "uykomek",
    "-d",
    db,
    "-At",
    "-c",
    "SELECT stored_name FROM files",
  ]);
  for (const name of referenced.split("\n").filter(Boolean))
    if (!checksumText.includes("./" + name))
      throw Error("A referenced file is missing from the archive.");
  console.log(
    "PASS: PostgreSQL backup restored into an isolated database; all record counts match; every file checksum and database attachment reference verified.",
    counts,
  );
} finally {
  if (created)
    command(["compose", "exec", "-T", "db", "dropdb", "-U", "uykomek", db]);
  if (volumeCreated) command(["volume", "rm", volume]);
}
