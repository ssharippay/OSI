import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// Read-only checks: never inspect secrets, create configuration or change volumes.
export function checkPilot(run = spawnSync, nodeVersion = process.versions.node) {
  const errors = [];
  if (Number(nodeVersion.split(".")[0]) !== 24)
    errors.push("Установите Node.js 24 LTS.");
  const docker = run("docker", ["--version"], { encoding: "utf8", timeout: 15000 });
  if (docker.error || docker.status !== 0) {
    errors.push("Docker не найден. Установите Docker Desktop и откройте терминал заново.");
    return errors;
  }
  const compose = run("docker", ["compose", "version"], { encoding: "utf8", timeout: 15000 });
  if (compose.error || compose.status !== 0)
    errors.push("Docker Compose v2 недоступен. Обновите Docker Desktop.");
  const engine = run("docker", ["info", "--format", "{{.OSType}}"], {
    encoding: "utf8", timeout: 15000,
  });
  if (engine.error || engine.status !== 0)
    errors.push("Docker Engine недоступен. Запустите Docker Desktop и дождитесь готовности.");
  else if (engine.stdout.trim() !== "linux")
    errors.push("Переключите Docker Desktop на Linux containers / WSL2.");
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = checkPilot();
  for (const error of errors) console.error(error);
  if (!errors.length) console.log("Среда готова к запуску пилота. Данные не изменены.");
  process.exitCode = errors.length ? 1 : 0;
}
