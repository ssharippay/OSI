import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
const b = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const c = await b.newContext({
  viewport: { width: 360, height: 800 },
  permissions: ["clipboard-read", "clipboard-write"],
});
const p = await c.newPage();
p.setDefaultTimeout(15000);
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
p.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
const nav = (name) =>
  p.locator(".mobile-nav").getByRole("button", { name, exact: true });
const choose = async (name) => {
  await p
    .locator(".topbar")
    .getByRole("button", { name: "Режим демонстрации" })
    .click();
  await p
    .getByRole("dialog")
    .getByRole("button")
    .filter({ has: p.getByText(name, { exact: true }) })
    .click();
};
await p.goto("http://localhost:5173");
await p.getByRole("button", { name: "Войти как председатель" }).click();
for (const name of [
  "Обзор",
  "Обращения",
  "Документы",
  "Расходы",
  "Новости",
  "ИИ-помощник",
]) {
  await nav(name).click();
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    name + " overflows",
  );
  assert.ok((await p.locator("main.content").innerText()).length > 100);
}
await nav("ИИ-помощник").click();
await p
  .getByRole("button", { name: "Подготовь объявление из этих данных" })
  .click();
await p.getByRole("button", { name: "Заполнить сведения" }).click();
await p.getByLabel("Событие", { exact: true }).fill("Отключение воды");
await p.getByLabel("Дата события").fill("2026-11-01");
await p.getByLabel("Время", { exact: true }).fill("С 10:00 до 12:00");
await p.getByLabel("Причина", { exact: true }).fill("Проверка труб");
await p
  .getByLabel("Контакт", { exact: true })
  .fill("Демо-диспетчер через обращения");
await p.getByRole("button", { name: "Подготовить текст" }).click();
await p
  .getByLabel("Название", { exact: true })
  .fill("Проверка труб в воскресенье");
assert.ok(
  (await p.getByLabel("Текст", { exact: true }).inputValue()).includes(
    "2026-11-01",
  ),
);
await p.getByRole("button", { name: "Просмотреть перед публикацией" }).click();
assert.ok(
  (await p.getByRole("dialog").innerText()).includes("Время: С 10:00 до 12:00"),
);
await p
  .getByRole("button", { name: "Подтвердить публикацию объявления" })
  .click();
await nav("Новости").click();
await p.getByRole("heading", { name: "Проверка труб в воскресенье" }).waitFor();
await nav("Обращения").click();
await p
  .getByRole("button")
  .filter({
    has: p.getByRole("heading", {
      name: "Не горит свет в подъезде",
      exact: true,
    }),
  })
  .click();
await p.getByRole("button", { name: "Подготовить ответ по обращению" }).click();
await p
  .getByRole("button", { name: "Просмотреть и отредактировать ответ" })
  .click();
assert.ok(
  (await p.getByLabel("Новое сообщение").inputValue()).includes(
    "Проект ответа",
  ),
);
await p.getByRole("button", { name: "Отправить сообщение" }).click();
await p
  .locator(".ticket-message")
  .filter({ hasText: "Проект ответа" })
  .waitFor();
await choose("Данияр Каримов");
await p
  .getByRole("textbox", { name: "Спросите о своем доме" })
  .fill("Найди документ: смета");
await p.getByRole("button", { name: "Задать вопрос", exact: true }).click();
await p
  .locator(".answer-bubble")
  .last()
  .getByRole("button")
  .filter({ hasText: "Смета на текущий месяц" })
  .waitFor();
await p.getByRole("button", { name: "Скопировать", exact: true }).click();
assert.ok(
  (await p.evaluate(() => navigator.clipboard.readText())).includes("Смета"),
);
await p
  .getByRole("button", { name: "Сообщить об ошибке", exact: true })
  .click();
await p.getByRole("status").filter({ hasText: "записано локально" }).waitFor();
await nav("Обращения").click();
await p.getByRole("button", { name: "Новое обращение" }).click();
const input = p.locator("input[type=file]");
await input.setInputFiles({
  name: "test.txt",
  mimeType: "text/plain",
  buffer: Buffer.from("text"),
});
await p.getByRole("status").filter({ hasText: "Выберите JPG" }).waitFor();
await input.setInputFiles({
  name: "large.png",
  mimeType: "image/png",
  buffer: Buffer.alloc(1600000),
});
await p.getByRole("status").filter({ hasText: "не больше 1,5 МБ" }).waitFor();
await input.setInputFiles("public/icon-192.png");
await p.getByAltText("Предпросмотр прикрепленного фото").waitFor();
await p.getByRole("button", { name: "Убрать фото", exact: true }).click();
assert.equal(
  await p.getByAltText("Предпросмотр прикрепленного фото").count(),
  0,
);
await p.keyboard.press("Escape");
// A multi-page print fixture stays in this isolated browser profile only.
await choose("Айдана Садыкова");
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("uykomek-data-v1"));
  const original = s.works.find((w) => w.houseId === "h1");
  s.works.push(
    ...Array.from({ length: 55 }, (_, i) => ({
      ...original,
      id: "print-" + i,
      title: `Работа №${i + 1}: ` + "ДлинноеНазвание".repeat(8),
      body: "Проверка переноса описания на странице. ".repeat(7),
      result: `Результат-${i + 1}: выполнено. ` + "Подробности ".repeat(10),
    })),
  );
  localStorage.setItem("uykomek-data-v1", JSON.stringify(s));
  window.dispatchEvent(new Event("uykomek-update"));
});
await nav("Расходы").click();
await p.getByRole("button", { name: "Подготовить отчет", exact: true }).click();
await p
  .getByRole("button", { name: "Сохранить черновик", exact: true })
  .click();
await nav("Документы").click();
await p
  .locator("section.document")
  .filter({ has: p.getByRole("heading", { name: /Проект отчета за/ }) })
  .getByRole("button", { name: "Просмотреть", exact: true })
  .click();
await p.emulateMedia({ media: "print" });
fs.mkdirSync("screenshots/v2", { recursive: true });
await p.pdf({
  path: "screenshots/v2/report-long.pdf",
  format: "A4",
  printBackground: true,
});
const text = execFileSync(
  "pdftotext",
  ["screenshots/v2/report-long.pdf", "-"],
  { encoding: "utf8" },
);
assert.ok(text.includes("Результат-55"));
assert.ok(!text.includes("Режим демонстрации"));
assert.ok(!text.includes("Сохранить черновик"));
const info = execFileSync("pdfinfo", ["screenshots/v2/report-long.pdf"], {
  encoding: "utf8",
});
const pages = Number(info.match(/Pages:\s+(\d+)/)[1]);
assert.ok(pages > 1);
assert.equal(await p.locator(".app-shell").isVisible(), false);
await p.emulateMedia({ media: "screen" });
await p.keyboard.press("Escape");
assert.deepEqual(errors, []);
console.log(
  `PASS: all mobile sections at 360px, announcement builder/confirmation, reply draft, home question, clipboard, feedback, photos, print ${pages} pages with last result and no controls.`,
);
await b.close();
