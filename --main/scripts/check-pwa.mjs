import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const base = process.env.UYKOMEK_BASE || "http://localhost:4173/";
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const context = await browser.newContext();
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  console.log("browser", m.type(), m.text());
  if (m.type() === "error") errors.push(m.text());
});
page.setDefaultTimeout(15000);
await page.goto(base);
console.log("page loaded");
await page.evaluate(async () => {
  await Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("SW readiness timeout")), 15000),
    ),
  ]);
  if (!navigator.serviceWorker.controller)
    await new Promise((resolve) =>
      navigator.serviceWorker.addEventListener("controllerchange", resolve, {
        once: true,
      }),
    );
});
console.log("worker ready");
const m = await page.evaluate(() =>
  fetch(new URL("manifest.webmanifest", location.href)).then((r) => r.json()),
);
assert.equal(m.display, "standalone");
for (const icon of m.icons) {
  assert.equal(
    (await page.request.get(new URL(icon.src, base).href)).status(),
    200,
  );
}
await page.reload();
await context.setOffline(true);
await page.reload();
await page.getByRole("button", { name: "Войти как житель" }).click();
await page.getByRole("heading", { name: "Здравствуйте, Данияр!" }).waitFor();
assert.deepEqual(errors, []);
console.log(
  "PASS: production build, manifest/icons, service worker activation, asset precache, offline reload and resident dashboard.",
);
await browser.close();
