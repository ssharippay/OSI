import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  permissions: ["clipboard-read", "clipboard-write"],
});
const errors = [];
context.on("page", (p) => {
  p.setDefaultTimeout(15000);
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
});
fs.mkdirSync("screenshots/v2", { recursive: true });
const base = process.env.UYKOMEK_BASE || "http://localhost:5173/";
const p = await context.newPage();
const nav = (page, name) =>
  page.locator(".sidebar nav").getByRole("button", { name, exact: true });
const card = (page, title) =>
  page
    .locator("section.document")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
const profile = async (page, name) => {
  await page
    .locator(".topbar")
    .getByRole("button", { name: "Режим демонстрации" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button")
    .filter({ has: page.getByText(name, { exact: true }) })
    .click();
};
const question = async (page, q) => {
  await nav(page, "ИИ-помощник").click();
  await page.getByRole("textbox", { name: "Вопрос помощнику" }).fill(q);
  await page.getByRole("button", { name: "Отправить вопрос" }).click();
  return page.locator(".answer-bubble").last();
};
await p.goto(base);
await p.getByRole("button", { name: "Войти как житель" }).click();
await p.screenshot({
  path: "screenshots/v2/resident-desktop.png",
  fullPage: true,
});
await p
  .getByRole("button", { name: "Сообщить о проблеме", exact: true })
  .click();
await p.getByLabel("Тема", { exact: true }).fill("Протечка у входа E2E");
await p.getByLabel("Место проблемы").fill("Первый подъезд, первый этаж");
await p.getByLabel("Описание", { exact: true }).fill("Капает вода у входа.");
await p.getByRole("button", { name: "Отправить обращение" }).click();
await nav(p, "Обращения").click();
await p
  .getByRole("button")
  .filter({ has: p.getByRole("heading", { name: "Протечка у входа E2E" }) })
  .click();
await p
  .getByText("Первый подъезд, первый этаж", { exact: true })
  .last()
  .waitFor();
const chair = await context.newPage();
await chair.goto(base);
await chair.getByRole("button", { name: "Войти как председатель" }).click();
await nav(chair, "Обращения").click();
await chair
  .getByRole("button")
  .filter({ has: chair.getByRole("heading", { name: "Протечка у входа E2E" }) })
  .click();
await chair.getByLabel("Статус обращения").selectOption("В работе");
await chair.getByLabel("Срок выполнения").fill("2001-01-01");
await chair.getByLabel("Ответственный исполнитель").fill("Демо-сантехник");
await chair
  .getByRole("button", { name: "Сохранить параметры обращения" })
  .click();
await chair.getByLabel("Новое сообщение").fill("Мастер проведёт осмотр.");
await chair.getByRole("button", { name: "Отправить сообщение" }).click();
await p.getByText("Мастер проведёт осмотр.", { exact: true }).waitFor();
await chair.getByRole("button", { name: "Просроченные", exact: true }).click();
assert.ok(
  await chair
    .locator(".ticket-list")
    .innerText()
    .then((x) => x.includes("Протечка у входа E2E")),
);
await chair.getByLabel("Статус обращения").selectOption("Выполнено");
await chair
  .getByRole("button", { name: "Сохранить параметры обращения" })
  .click();
await chair
  .getByRole("status")
  .filter({ hasText: "опишите результат" })
  .waitFor();
await chair.getByLabel("Результат выполнения").fill("Труба заменена.");
await chair
  .getByRole("button", { name: "Сохранить параметры обращения" })
  .click();
await p.getByText("Труба заменена.", { exact: true }).waitFor();
await p.getByLabel("Что не устранено").fill("После ремонта снова капает.");
await p
  .getByRole("button", { name: "Проблема не устранена — вернуть в работу" })
  .click();
await chair.getByText("После ремонта снова капает.", { exact: true }).waitFor();
assert.equal(
  await chair.getByLabel("Статус обращения").inputValue(),
  "В работе",
);
let answer = await question(p, "Что сделано по моему обращению?");
await answer
  .getByRole("button", { name: "Выбрать: Протечка у входа E2E" })
  .click();
assert.ok(
  (await p.locator(".answer-bubble").last().innerText()).includes(
    "После ремонта снова капает",
  ),
);
console.log(
  "PASS tickets, deadlines, separate messages, mandatory result and reopening",
);
await nav(chair, "Документы").click();
await chair.getByRole("button", { name: "Добавить документ" }).click();
await chair.getByLabel("Название", { exact: true }).fill("Ограждение E2E");
await chair
  .getByLabel("Текст", { exact: true })
  .fill("План замены ограждения двора.");
await chair
  .getByRole("button", { name: "Сохранить черновик", exact: true })
  .click();
await card(chair, "Ограждение E2E")
  .getByText("Черновик", { exact: true })
  .waitFor();
await nav(p, "Документы").click();
assert.equal(
  await p.getByRole("heading", { name: "Ограждение E2E", exact: true }).count(),
  0,
);
answer = await question(p, "Найди документ: ограждения");
assert.ok(
  (await answer.innerText()).includes("Подходящих доступных документов нет"),
);
await card(chair, "Ограждение E2E")
  .getByRole("button", { name: "Опубликовать", exact: true })
  .click();
await chair
  .getByRole("dialog")
  .getByText("Жители и председатель", { exact: true })
  .waitFor();
assert.equal(
  await p.getByRole("heading", { name: "Ограждение E2E", exact: true }).count(),
  0,
);
await chair
  .getByRole("button", { name: "Подтвердить публикацию", exact: true })
  .click();
await nav(p, "Документы").click();
await card(p, "Ограждение E2E")
  .getByRole("button", { name: "Просмотреть", exact: true })
  .click();
const dl = p.waitForEvent("download");
await p.getByRole("button", { name: "Скачать текст" }).click();
assert.ok((await dl).suggestedFilename().endsWith(".txt"));
await p.getByRole("button", { name: "Закрыть окно" }).click();
answer = await question(p, "Найди документ: ограждения");
assert.ok((await answer.innerText()).includes("Ограждение E2E"));
await card(chair, "Ограждение E2E")
  .getByRole("button", { name: "В архив", exact: true })
  .click();
await chair.getByRole("button", { name: "Подтвердить архивирование" }).click();
await p
  .locator(".answer-bubble")
  .last()
  .getByText(/Предыдущий ответ скрыт/)
  .waitFor();
answer = await question(p, "Найди документ: ограждения");
assert.ok(
  (await answer.innerText()).includes("Подходящих доступных документов нет"),
);
await chair.getByRole("button", { name: "Добавить документ" }).click();
await chair
  .getByLabel("Название", { exact: true })
  .fill("Закрытая заметка E2E");
await chair
  .getByLabel("Текст", { exact: true })
  .fill("Только для председателя.");
await chair.getByLabel("Аудитория").selectOption("chair");
await chair
  .getByRole("button", { name: "Сохранить черновик", exact: true })
  .click();
await card(chair, "Закрытая заметка E2E")
  .getByRole("button", { name: "Опубликовать", exact: true })
  .click();
await chair
  .getByText(
    "После подтверждения документ останется доступен только председателю. Жители его не увидят.",
    { exact: true },
  )
  .waitFor();
await chair
  .getByRole("button", { name: "Подтвердить публикацию", exact: true })
  .click();
await nav(p, "Документы").click();
assert.equal(
  await p
    .getByRole("heading", { name: "Закрытая заметка E2E", exact: true })
    .count(),
  0,
);
console.log(
  "PASS draft/publication/archive, audience, source revocation and downloads",
);
await chair.getByLabel("Отчетный месяц").fill("2024-03");
await nav(chair, "Работы и расходы").click();
await chair.getByRole("button", { name: "Добавить работу или расход" }).click();
await chair.getByLabel("Название", { exact: true }).fill("Ремонт трубы E2E");
await chair.getByLabel("Описание работы").fill("Замена участка трубы");
await chair.getByLabel("Запланировано, ₸").fill("20000");
await chair.getByLabel("Фактический расход, ₸").fill("10000");
await chair.getByLabel("Статус работы").selectOption("Выполнено");
await chair.getByLabel("Результат выполнения").fill("Труба заменена");
await chair.getByRole("button", { name: "Сохранить работу" }).click();
assert.ok(
  (await chair.locator(".stats").innerText())
    .replaceAll(/\s/g, "")
    .includes("10000₸"),
);
await chair
  .getByRole("button", { name: "Подготовить отчет", exact: true })
  .click();
await chair
  .getByRole("button", { name: "Сохранить черновик", exact: true })
  .click();
await nav(p, "Документы").click();
assert.equal(
  await p
    .getByRole("heading", { name: "Проект отчета за 2024-03", exact: true })
    .count(),
  0,
);
await chair
  .locator(".work-row")
  .filter({ hasText: "Ремонт трубы E2E" })
  .getByRole("button", { name: "Редактировать", exact: true })
  .click();
await chair.getByLabel("Фактический расход, ₸").fill("15000");
await chair.getByRole("button", { name: "Сохранить работу" }).click();
answer = await question(chair, "Сравни план и фактические расходы");
assert.ok((await answer.innerText()).replaceAll(/\s/g, "").includes("15000₸"));
await nav(chair, "Документы").click();
await card(chair, "Проект отчета за 2024-03")
  .getByRole("button", { name: "Просмотреть", exact: true })
  .click();
assert.ok(
  (await chair.locator(".report-sheet").innerText())
    .replaceAll(/\s/g, "")
    .includes("10000₸"),
);
await chair.emulateMedia({ media: "print" });
await chair.pdf({
  path: "screenshots/v2/report.pdf",
  format: "A4",
  printBackground: true,
});
assert.equal(await chair.locator(".app-shell").isVisible(), false);
await chair.screenshot({
  path: "screenshots/v2/report-print.png",
  fullPage: true,
});
await chair.emulateMedia({ media: "screen" });
await chair.getByRole("button", { name: "Закрыть окно" }).click();
await nav(chair, "Работы и расходы").click();
await chair
  .locator(".work-row")
  .filter({ hasText: "Ремонт трубы E2E" })
  .getByRole("button", { name: "Редактировать", exact: true })
  .click();
await chair.getByLabel("Дата", { exact: true }).fill("2024-04-02");
await chair.getByRole("button", { name: "Сохранить работу" }).click();
assert.equal(await chair.locator(".work-row").count(), 0);
await chair.getByLabel("Отчетный месяц").fill("2024-04");
assert.equal(await chair.locator(".work-row").count(), 1);
console.log(
  "PASS month selector, expense edits, totals and immutable saved report, print PDF",
);
await chair.getByLabel("Доступный дом").selectOption("h2");
await nav(chair, "Документы").click();
assert.equal(
  await chair
    .getByRole("heading", { name: "Закрытая заметка E2E", exact: true })
    .count(),
  0,
);
await chair
  .getByRole("heading", { name: "План работ ОСИ «Самал»", exact: true })
  .waitFor();
await nav(chair, "Обращения").click();
assert.equal(
  await chair
    .getByRole("heading", { name: "Протечка у входа E2E", exact: true })
    .count(),
  0,
);
await profile(p, "Алия Омарова");
await nav(p, "Обращения").click();
assert.equal(
  await p
    .getByRole("heading", { name: "Протечка у входа E2E", exact: true })
    .count(),
  0,
);
await profile(p, "Ерлан Алимов");
assert.equal(await p.getByLabel("Доступный дом").count(), 0);
await nav(p, "Документы").click();
await p.getByRole("heading", { name: "План работ ОСИ «Самал»" }).waitFor();
assert.equal(
  await p.getByRole("heading", { name: "Смета на текущий месяц" }).count(),
  0,
);
await chair.getByLabel("Доступный дом").selectOption("h1");
await chair
  .getByLabel("Отчетный месяц")
  .fill(
    new Date()
      .toLocaleDateString("en-CA", { timeZone: "Asia/Almaty" })
      .slice(0, 7),
  );
await nav(chair, "Обзор").click();
await chair.screenshot({
  path: "screenshots/v2/chair-desktop.png",
  fullPage: true,
});
await profile(p, "Данияр Каримов");
await p.reload();
await p.getByRole("button", { name: "Войти как житель" }).click();
await nav(p, "Обращения").click();
await p
  .getByRole("heading", { name: "Протечка у входа E2E", exact: true })
  .waitFor();
await p.setViewportSize({ width: 360, height: 800 });
await p
  .locator(".mobile-nav")
  .getByRole("button", { name: "Мой дом", exact: true })
  .click();
assert.ok(
  await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
);
await p.screenshot({
  path: "screenshots/v2/resident-mobile.png",
  fullPage: true,
});
await chair.setViewportSize({ width: 390, height: 844 });
await nav(chair, "Обзор").count();
await chair.screenshot({
  path: "screenshots/v2/chair-mobile.png",
  fullPage: true,
});
assert.ok(
  await chair.evaluate(
    () => document.documentElement.scrollWidth <= innerWidth,
  ),
);
assert.deepEqual(errors, []);
console.log(
  "PASS house/user isolation, reload persistence, mobile layouts and no console errors",
);
await browser.close();
