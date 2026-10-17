import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const b = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const c = await b.newContext();
const p = await c.newPage();
p.setDefaultTimeout(15000);
const key = "uykomek-data-v1";
const legacy = {
  tickets: [
    {
      id: "legacy-ticket",
      owner: "resident",
      subject: "Сохранённое обращение",
      category: "Уборка",
      body: "Старое описание",
      photo: "data:image/png;base64,old",
      status: "В работе",
      history: [
        { date: "10.10.2026, 10:00", text: "Новое обращение" },
        {
          date: "11.10.2026, 12:00",
          text: "В работе · Старый ответ председателя",
        },
      ],
    },
  ],
  docs: [
    {
      id: "legacy-doc",
      title: "Сохранённый отчет",
      body: "Пользовательский текст без потери",
    },
  ],
  works: [
    {
      id: "legacy-work",
      title: "Старая работа",
      body: "Описание",
      planned: 100,
      actual: 90,
      date: "2026-10-01",
      status: "Выполнено",
      doc: "legacy-doc",
      result: "Готово",
    },
  ],
  announcements: [
    {
      id: "legacy-news",
      title: "Старая новость",
      body: "Старый текст",
      date: "2026-10-01",
      important: true,
    },
  ],
  events: [{ date: "10.10.2026, 10:00", text: "Старое событие" }],
};
await p.goto("http://localhost:5173");
await p.evaluate(
  ({ key, legacy }) => {
    localStorage.setItem(key, JSON.stringify(legacy));
    localStorage.removeItem(key + "-backup-before-v2");
  },
  { key, legacy },
);
await p.reload();
const state = await p.evaluate(
  (key) => JSON.parse(localStorage.getItem(key)),
  key,
);
const backup = await p.evaluate(
  (key) => JSON.parse(localStorage.getItem(key + "-backup-before-v2")),
  key,
);
assert.deepEqual(backup, legacy);
assert.equal(state.schemaVersion, 2);
assert.equal(state.docs[0].body, legacy.docs[0].body);
assert.equal(state.docs[0].status, "Черновик");
await p.getByRole("button", { name: "Войти как житель" }).click();
await p
  .locator(".sidebar nav")
  .getByRole("button", { name: "Обращения", exact: true })
  .click();
await p
  .getByRole("button")
  .filter({
    has: p.getByRole("heading", { name: "Сохранённое обращение", exact: true }),
  })
  .click();
await p.getByText("Старый ответ председателя", { exact: true }).waitFor();
await p
  .locator(".sidebar nav")
  .getByRole("button", { name: "Документы", exact: true })
  .click();
assert.equal(
  await p.getByRole("heading", { name: "Сохранённый отчет" }).count(),
  0,
);
await p
  .locator(".topbar")
  .getByRole("button", { name: "Режим демонстрации" })
  .click();
await p
  .getByRole("dialog")
  .getByRole("button")
  .filter({ has: p.getByText("Айдана Садыкова", { exact: true }) })
  .click();
await p
  .locator(".sidebar nav")
  .getByRole("button", { name: "Документы", exact: true })
  .click();
await p.getByRole("heading", { name: "Сохранённый отчет" }).waitFor();
await p.getByRole("button", { name: "Добавить документ" }).click();
await p.getByLabel("Название", { exact: true }).fill("Не должен сохраниться");
await p.getByLabel("Текст", { exact: true }).fill("Ошибка лимита");
await p.evaluate(() => {
  window.originalStorageSet = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    if (key === "uykomek-data-v1")
      throw new DOMException("quota", "QuotaExceededError");
    return window.originalStorageSet.call(this, key, value);
  };
});
await p
  .getByRole("button", { name: "Сохранить черновик", exact: true })
  .click();
await p
  .getByRole("status")
  .filter({ hasText: "Изменения не сохранены" })
  .waitFor();
assert.equal(await p.getByRole("dialog").count(), 1);
assert.equal(
  await p.evaluate(
    (key) =>
      JSON.parse(localStorage.getItem(key)).docs.some(
        (d) => d.title === "Не должен сохраниться",
      ),
    key,
  ),
  false,
);
await p.evaluate(() => {
  Storage.prototype.setItem = window.originalStorageSet;
});
await p.keyboard.press("Escape");
await p.evaluate((key) => localStorage.setItem(key, "broken-json"), key);
await p.reload();
await p.getByRole("heading", { name: "Не удалось открыть данные" }).waitFor();
assert.equal(
  await p.evaluate((key) => localStorage.getItem(key), key),
  "broken-json",
);
assert.equal(
  await p.getByRole("button", { name: "Повторить открытие" }).count(),
  1,
);
console.log(
  "PASS: browser legacy migration and backup, text/owner preservation, draft visibility, quota feedback without false save, corrupt data recovery without reset.",
);
await b.close();
