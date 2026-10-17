import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
const b = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } }),
  p = await ctx.newPage();
const errors = [];
ctx.on("page", (page) => {
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => errors.push(e.message));
});
p.setDefaultTimeout(15000);
p.on("pageerror", (e) => errors.push(e.message));
const base = "http://localhost:5173/",
  key = "uykomek-data-v1";
const field = (label, value) =>
  p.getByLabel(label, { exact: true }).fill(value);
const nav = (page, name) =>
  page.locator(".sidebar nav").getByRole("button", { name, exact: true });
const saved = async () => {
  await p
    .locator(".wizard-state b")
    .filter({ hasText: /^Сохранено$/ })
    .waitFor();
};
const step = async (name) => {
  await p
    .locator(".wizard-steps")
    .getByRole("button", { name: new RegExp(name) })
    .click();
};
const data = () =>
  p.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
fs.mkdirSync("screenshots/v04", { recursive: true });
await p.goto(base);
await p.getByRole("button", { name: "Войти как председатель" }).click();
await nav(p, "Мастер документов ОСИ").click();
assert.equal(await p.locator(".template-card:visible").count(), 3);
assert.equal(await p.locator(".planned-templates").getAttribute("open"), null);
await p.getByRole("button", { name: "Карточка дома", exact: true }).click();
await field("Полная полезная площадь, м²", "100");
await p.getByRole("checkbox", { name: "Реестр помещений полный" }).check();
await p.getByRole("button", { name: "Добавить помещение" }).click();
await field("Номер помещения 1", "1");
await field("Площадь помещения 1, м²", "100");
await field("Инвентарный перечень", "Демо-перечень");
await field("Акт осмотра", "Демо-осмотр");
await p.getByRole("button", { name: "Сохранить карточку дома" }).click();
await p.getByRole("button", { name: "Закрыть карточку" }).click();
await p
  .locator(".template-card")
  .filter({
    has: p.getByRole("heading", { name: "Годовая смета", exact: true }),
  })
  .getByRole("button", { name: "Создать документ" })
  .click();
await saved();
const id = (await data()).wizardDocuments[0].id;
await step("Исходные данные");
assert.equal(
  await p.getByLabel("Площадь помещения 1, м²", { exact: true }).inputValue(),
  "100",
);
await step("Расходы на управление");
await p
  .getByRole("button", { name: "Добавить статью: управление", exact: true })
  .click();
await field("Название статьи 1", "Демонстрационное управление");
await field("Количество статьи 1", "1");
await field("Единица статьи 1", "услуга");
await field("Стоимость статьи 1, ₸", "ошибка");
await field("Обоснование статьи 1", "Демо");
await saved();
await step("Проверка и предпросмотр");
assert.equal(
  await p
    .getByRole("button", { name: "Скачать XLSX", exact: true })
    .isEnabled(),
  false,
);
await p
  .locator(".validation-errors")
  .getByRole("button", { name: "Перейти к полю" })
  .first()
  .click();
await field("Стоимость статьи 1, ₸", "100.01");
await p.getByLabel("Периодичность статьи 1").selectOption("4");
assert.equal(
  await p.getByLabel("Выполнений в год статьи 1", { exact: true }).inputValue(),
  "4",
);
await p
  .getByRole("button", { name: "Дублировать статью 1", exact: true })
  .click();
assert.equal(
  await p.getByLabel("Стоимость статьи 2, ₸", { exact: true }).inputValue(),
  "100.01",
);
p.once("dialog", (d) => d.dismiss());
await p.getByRole("button", { name: "Удалить статью 2", exact: true }).click();
assert.equal(
  await p.getByLabel("Стоимость статьи 2, ₸", { exact: true }).count(),
  1,
);
p.once("dialog", (d) => d.accept());
await p.getByRole("button", { name: "Удалить статью 2", exact: true }).click();
assert.equal(
  await p.getByLabel("Стоимость статьи 2, ₸", { exact: true }).count(),
  0,
);
await step("Другие сведения");
await field("Годовой коммерческий доход, ₸", "0");
await saved();
await p.getByRole("button", { name: "К списку проектов" }).click();
await p.getByRole("button", { name: "Карточка дома", exact: true }).click();
await field("Полная полезная площадь, м²", "120");
await field("Площадь помещения 1, м²", "120");
await p.getByRole("button", { name: "Сохранить карточку дома" }).click();
await p.getByRole("button", { name: "Закрыть карточку" }).click();
assert.equal(
  (await data()).wizardDocuments.find((d) => d.id === id).input.declaredArea,
  "100",
);
await p.getByRole("button", { name: "Открыть проект", exact: true }).click();
await p.getByRole("button", { name: "Сравнить с карточкой дома" }).click();
assert.ok((await p.getByRole("dialog").innerText()).includes("120"));
await p.getByRole("button", { name: "Закрыть окно" }).click();
assert.equal(
  (await data()).wizardDocuments.find((d) => d.id === id).input.declaredArea,
  "100",
);
await p.getByRole("button", { name: "Сравнить с карточкой дома" }).click();
await p
  .getByRole("button", { name: "Подтвердить замену показанных данных" })
  .click();
await saved();
assert.equal(
  (await data()).wizardDocuments.find((d) => d.id === id).input.declaredArea,
  "120",
);
// Storage failure must not report success; retry preserves editor data.
await p.evaluate(() => {
  window.originalSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    if (k === "uykomek-data-v1")
      throw new DOMException("quota", "QuotaExceededError");
    return window.originalSetItem.call(this, k, v);
  };
});
await field("Название проекта", "Смета — проверка сохранности");
await p
  .locator(".wizard-state b")
  .filter({ hasText: "Не удалось сохранить" })
  .waitFor();
assert.notEqual(
  (await data()).wizardDocuments.find((d) => d.id === id).title,
  "Смета — проверка сохранности",
);
await p.evaluate(() => {
  Storage.prototype.setItem = window.originalSetItem;
});
await p
  .getByRole("button", { name: "Сохранить черновик", exact: true })
  .click();
await saved();
// Two tabs edit the same source version; stale editor cannot overwrite.
const other = await ctx.newPage();
await other.goto(base);
await other.getByRole("button", { name: "Войти как председатель" }).click();
await nav(other, "Мастер документов ОСИ").click();
await other.getByRole("button", { name: /Мои проекты/ }).click();
await other
  .getByRole("button", { name: "Открыть проект", exact: true })
  .click();
await field("Название проекта", "Мой ввод до конфликта");
await other
  .getByLabel("Название проекта", { exact: true })
  .fill("Из другой вкладки");
await other
  .getByRole("button", { name: "Сохранить черновик", exact: true })
  .click();
await p
  .getByRole("heading", { name: "Документ изменен в другой вкладке" })
  .waitFor();
assert.equal(
  await p.getByLabel("Название проекта", { exact: true }).inputValue(),
  "Мой ввод до конфликта",
);
await p.getByRole("button", { name: "Сохранить свою копию" }).click();
await saved();
assert.equal((await data()).wizardDocuments.length, 2);
assert.equal(
  (await data()).wizardDocuments.find((d) => d.id === id).title,
  "Из другой вкладки",
);
await other.close();
await step("Проверка и предпросмотр");
await p
  .getByRole("button", { name: "Подготовить для проверки", exact: true })
  .click();
await saved();
await step("Сохранение и выгрузка");
await saved();
assert.equal(
  await p
    .getByRole("button", { name: "Подготовить копию для жителей" })
    .isEnabled(),
  true,
);
const downloadPromise = p.waitForEvent("download");
await p.getByRole("button", { name: "Скачать XLSX", exact: true }).click();
await (await downloadPromise).saveAs("screenshots/v04/estimate.xlsx");
await p.getByRole("button", { name: "Подготовить копию для жителей" }).click();
await p
  .getByLabel("Текст для жителей")
  .fill(
    "Смета для жителей: управление 400,04 ₸ в год. Проверенный вымышленный текст.",
  );
await p.getByRole("dialog").getByRole("checkbox").check();
await p
  .getByRole("button", { name: "Опубликовать информационную копию" })
  .click();
await p.getByRole("button", { name: "К списку проектов" }).click();
await p
  .locator(".wizard-catalog .card")
  .filter({
    has: p.getByRole("heading", {
      name: "Мой ввод до конфликта — моя копия",
      exact: true,
    }),
  })
  .getByRole("button", { name: "Создать на другой год" })
  .click({ trial: true });
p.once("dialog", (d) => d.accept("2027"));
await p
  .locator(".wizard-catalog .card")
  .filter({
    has: p.getByRole("heading", {
      name: "Мой ввод до конфликта — моя копия",
      exact: true,
    }),
  })
  .getByRole("button", { name: "Создать на другой год" })
  .click();
await saved();
assert.equal((await data()).wizardDocuments.length, 3);
assert.equal((await data()).wizardDocuments[0].input.pricesConfirmed, false);
await step("Другие сведения");
await p.getByRole("checkbox", { name: /Я проверил цены/ }).check();
await saved();
await p.setViewportSize({ width: 360, height: 800 });
assert.ok(
  await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
);
await p.screenshot({
  path: "screenshots/v04/estimate-mobile.png",
  fullPage: true,
});
await p.getByRole("button", { name: "К списку проектов" }).click();
await p.getByRole("button", { name: "Каталог документов" }).click();
await p.screenshot({
  path: "screenshots/v04/catalog-mobile.png",
  fullPage: true,
});
assert.ok(
  await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
);
const snapshot = await data();
delete snapshot.wizardDataVersion;
const raw = JSON.stringify(snapshot);
await p.evaluate(({ key, raw }) => localStorage.setItem(key, raw), {
  key,
  raw,
});
await p.reload();
assert.equal(
  await p.evaluate(
    (key) => localStorage.getItem(key + "-backup-before-wizard-v2"),
    key,
  ),
  raw,
);
// Full mobile creation, correction, reopen, export and reviewed publication.
await p.getByRole("button", { name: "Войти как председатель" }).click();
await p
  .locator(".mobile-nav")
  .getByRole("button", { name: "Мастер", exact: true })
  .click();
await p
  .locator(".template-card")
  .filter({
    has: p.getByRole("heading", { name: "Годовая смета", exact: true }),
  })
  .getByRole("button", { name: "Создать документ" })
  .click();
await step("Расходы на содержание");
await p
  .getByRole("button", { name: "Добавить статью: содержание", exact: true })
  .click();
await field("Название статьи 1", "Демо-уборка со смартфона");
await field("Количество статьи 1", "1");
await field("Единица статьи 1", "услуга");
await field("Стоимость статьи 1, ₸", "-1");
await field("Обоснование статьи 1", "Демо-предложение");
await step("Другие сведения");
await field("Годовой коммерческий доход, ₸", "0");
await step("Проверка и предпросмотр");
assert.equal(
  await p
    .getByRole("button", { name: "Скачать XLSX", exact: true })
    .isEnabled(),
  false,
);
await step("Расходы на содержание");
await field("Стоимость статьи 1, ₸", "25");
await saved();
await p.getByRole("button", { name: "К списку проектов" }).click();
await p
  .locator(".wizard-catalog .card")
  .filter({
    has: p.getByRole("heading", { name: "Годовая смета", exact: true }),
  })
  .getByRole("button", { name: "Открыть проект", exact: true })
  .click();
await step("Проверка и предпросмотр");
await p
  .getByRole("button", { name: "Подготовить для проверки", exact: true })
  .click();
await saved();
const mobileDownload = p.waitForEvent("download");
await p.getByRole("button", { name: "Скачать XLSX", exact: true }).click();
await (await mobileDownload).saveAs("screenshots/v04/mobile-estimate.xlsx");
await p.getByRole("button", { name: "Подготовить копию для жителей" }).click();
await p
  .getByLabel("Текст для жителей")
  .fill("Демо-план уборки: 300 ₸ в год. Ручная проверка выполнена.");
await p.getByRole("dialog").getByRole("checkbox").check();
await p
  .getByRole("button", { name: "Опубликовать информационную копию" })
  .click();
assert.ok(
  await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
);
assert.deepEqual(errors, []);
console.log(
  "PASS: house snapshot/differences, incomplete draft autosave/reopen, error correction, periodicity, duplicate/delete confirmation, real XLSX, storage failure/retry, two-tab conflict/save-copy, manual resident copy, next-year prices, 360px layout, migration backup.",
);
await b.close();
