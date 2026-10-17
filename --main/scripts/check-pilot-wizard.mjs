import { chromium } from "@playwright/test";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import fs from "node:fs";
const base = process.env.UYKOMEK_PILOT_BASE || "http://localhost:3300";
if (new URL(base).hostname !== "localhost")
  throw Error("Local isolated testing only.");
const b = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
const p = await ctx.newPage();
p.setDefaultTimeout(25000);
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
const headers = { origin: base, "x-uykomek-request": "1" };
let res = await ctx.request.post(base + "/api/auth/register", {
  headers,
  data: {
    email: "wizard-" + randomUUID() + "@example.test",
    name: "Тестовый председатель",
    password: "PilotWizard-Test-2026",
  },
});
assert.equal(res.status(), 200);
const me = await res.json();
headers["x-csrf-token"] = me.csrf;
res = await ctx.request.post(base + "/api/houses", {
  headers,
  data: { name: "Тестовый мастер сметы", address: "Вымышленный адрес, 5" },
});
assert.equal(res.status(), 200);
const houseId = (await res.json()).id;
await p.goto(base + "/?mode=work");
const nav = (page) =>
  page
    .locator(".sidebar nav")
    .getByRole("button", { name: "Мастер документов ОСИ", exact: true });
await nav(p).click();
await p
  .locator(".template-card")
  .filter({
    has: p.getByRole("heading", { name: "Годовая смета", exact: true }),
  })
  .getByRole("button", { name: "Создать документ" })
  .click();
const saved = () =>
  p
    .locator(".wizard-state b")
    .filter({ hasText: /^Сохранено$/ })
    .waitFor();
const step = (label) =>
  p
    .locator(".wizard-steps")
    .getByRole("button", { name: new RegExp(label) })
    .click();
const field = (label, value) =>
  p.getByLabel(label, { exact: true }).fill(value);
await saved();
const slow = async (route) => {
  const response = await route.fetch();
  await new Promise((resolve) => setTimeout(resolve, 1200));
  await route.fulfill({ response });
};
await p.route("**/api/houses/*/changes", slow);
await field("Название проекта", "Первая редакция");
await p
  .locator(".wizard-state b")
  .filter({ hasText: /^Сохраняем$/ })
  .waitFor();
await field("Название проекта", "Последний ввод при медленном сервере");
await saved();
assert.equal(
  await p.getByLabel("Название проекта", { exact: true }).inputValue(),
  "Последний ввод при медленном сервере",
);
await p.unroute("**/api/houses/*/changes", slow);
await step("Исходные данные");
await field("Общая полезная площадь квартир и нежилых помещений, м²", "100");
await p.getByRole("checkbox", { name: "Реестр помещений полный" }).check();
await p
  .getByRole("button", { name: "Добавить помещение", exact: true })
  .click();
await field("Номер помещения 1", "1");
await field("Площадь помещения 1, м²", "100");
await step("Расходы на управление");
await p
  .getByRole("button", { name: "Добавить статью: управление", exact: true })
  .click();
for (const [name, value] of [
  ["Название статьи 1", "Управление"],
  ["Количество статьи 1", "1"],
  ["Единица статьи 1", "услуга"],
  ["Стоимость статьи 1, ₸", "10.01"],
  ["Обоснование статьи 1", "Тестовое предложение"],
])
  await field(name, value);
await step("Другие сведения");
await field("Годовой коммерческий доход, ₸", "0");
await field("Инвентарный перечень", "Тестовый перечень");
await field("Акт осмотра", "Тестовый осмотр");
await saved();
await step("Проверка и предпросмотр");
await p
  .getByRole("button", { name: "Подготовить для проверки", exact: true })
  .click();
await saved();
const downloadPromise = p.waitForEvent("download");
await p.getByRole("button", { name: "Скачать XLSX", exact: true }).click();
const download = await downloadPromise;
const bytes = fs.readFileSync(await download.path());
const wb = new ExcelJS.Workbook();
await wb.xlsx.load(bytes);
assert.equal(wb.getWorksheet("Статьи расходов").getCell("G2").result, 120.12);
assert.ok(wb.getWorksheet("Статьи расходов").getCell("G2").formula);
await p
  .getByRole("button", { name: "Подготовить копию для жителей", exact: true })
  .click();
await p
  .getByLabel("Текст для жителей")
  .fill("Проверенная копия сметы. Управление: 120,12 ₸ в год.");
await p.getByRole("dialog").getByRole("checkbox").check();
await p
  .getByRole("button", {
    name: "Опубликовать информационную копию",
    exact: true,
  })
  .click();
await p.getByRole("dialog").waitFor({ state: "hidden" });
await step("Другие сведения");
await field(
  "Другие источники финансирования и пояснения",
  "Изменение после публикации",
);
await saved();
let state = await (
  await ctx.request.get(base + "/api/state?houseId=" + houseId)
).json();
const originalId = state.state.wizardDocuments[0].id;
assert.equal(state.state.wizardDocuments[0].publication, "Требует обновления");
assert.equal(
  state.state.docs[0].body,
  "Проверенная копия сметы. Управление: 120,12 ₸ в год.",
);
const tab = await ctx.newPage();
tab.setDefaultTimeout(25000);
await tab.goto(base + "/?mode=work");
await nav(tab).click();
await tab.getByRole("button", { name: "Мои проекты (1)", exact: true }).click();
await tab.getByRole("button", { name: "Открыть проект", exact: true }).click();
await field("Название проекта", "Изменено на первом устройстве");
await saved();
await tab
  .getByRole("heading", {
    name: "Документ изменен в другой вкладке",
    exact: true,
  })
  .waitFor();
await tab
  .getByRole("button", { name: "Сохранить свою копию", exact: true })
  .click();
await tab
  .locator(".wizard-state b")
  .filter({ hasText: /^Сохранено$/ })
  .waitFor();
state = await (
  await ctx.request.get(base + "/api/state?houseId=" + houseId)
).json();
assert.equal(state.state.wizardDocuments.length, 2);
assert.equal(
  state.state.wizardDocuments.find((d) => d.id === originalId).title,
  "Изменено на первом устройстве",
);
fs.mkdirSync("screenshots/pilot", { recursive: true });
await p.screenshot({
  path: "screenshots/pilot/wizard-server.png",
  fullPage: true,
});
assert.deepEqual(errors, []);
console.log(
  "PASS: server wizard, slow-response typing preservation, legal template, real formula XLSX, manual resident copy/stale flag, polling and cross-tab conflict/save-copy.",
);
await b.close();
