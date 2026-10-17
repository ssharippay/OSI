import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import JSZip from "jszip";
import ExcelJS from "exceljs";
const b = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const context = await b.newContext({ viewport: { width: 1440, height: 1000 } });
const errors = [];
context.on("page", (p) => {
  p.setDefaultTimeout(20000);
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
});
const p = await context.newPage();
const base = "http://localhost:5173/";
fs.mkdirSync("screenshots/wizard", { recursive: true });
const nav = (page, name) =>
  page.locator(".sidebar nav").getByRole("button", { name, exact: true });
const field = (name, value) => p.getByLabel(name, { exact: true }).fill(value);
const next = () =>
  p.getByRole("button", { name: "Далее", exact: true }).click();
const create = async (title) => {
  await p
    .locator(".template-card")
    .filter({ has: p.getByRole("heading", { name: title, exact: true }) })
    .getByRole("button", { name: "Создать документ" })
    .click();
};
async function file(name, label) {
  const wait = p.waitForEvent("download");
  await p.getByRole("button", { name: label, exact: true }).last().click();
  const download = await wait;
  const path = "screenshots/wizard/" + name;
  await download.saveAs(path);
  return fs.readFileSync(path);
}
await p.goto(base);
await p.getByRole("button", { name: "Войти как председатель" }).click();
await nav(p, "Мастер документов ОСИ").click();
assert.equal(
  await p.locator(".template-card .primary:not([disabled])").count(),
  3,
);
await p.screenshot({
  path: "screenshots/wizard/catalog-desktop.png",
  fullPage: true,
});
await create("Годовая смета");
await p
  .getByRole("button", { name: "Сохранить черновик", exact: true })
  .click();
await p
  .getByRole("status")
  .filter({ hasText: "Черновик мастера сохранён" })
  .waitFor();
await p.getByRole("button", { name: "К списку проектов" }).click();
await p.getByRole("button", { name: "Открыть проект", exact: true }).click();
await next();
await field("Общая полезная площадь квартир и нежилых помещений, м²", "100");
await p.getByRole("button", { name: "Добавить помещение" }).click();
await field("Номер помещения 1", "24");
await field("Площадь помещения 1, м²", "100");
await next();
await p
  .getByRole("button", { name: "Добавить статью: управление", exact: true })
  .click();
await field("Название статьи 1", "Демонстрационное управление");
await field("Количество статьи 1", "0.335");
await field("Единица статьи 1", "услуга");
await field("Стоимость статьи 1, ₸", "1.00");
await field("Выполнений в год статьи 1", "1");
await field("Обоснование статьи 1", "Вымышленное предложение");
await p.getByText("0.34 ₸ в год", { exact: true }).waitFor();
await next(); // maintenance
await next(); // other data, independent savings
await p.getByText("Накопления — отдельный план", { exact: true }).click();
await p
  .getByRole("button", { name: "Добавить статью: накопления", exact: true })
  .click();
await field("Название статьи 2", "Отдельный план накоплений");
await field("Количество статьи 2", "1");
await field("Единица статьи 2", "план");
await field("Стоимость статьи 2, ₸", "500");
await field("Выполнений в год статьи 2", "1");
await field("Обоснование статьи 2", "Только вымышленный отдельный план");
await field("Годовой коммерческий доход, ₸", "0");
await field("Инвентарный перечень", "Демо-перечень");
await field("Акт осмотра", "Демо-осмотр");
await next();
assert.equal(await p.locator(".validation-errors li").count(), 0);
await p
  .getByRole("button", { name: "Подготовить для проверки", exact: true })
  .click();
await p
  .getByRole("status")
  .filter({ hasText: "Проект подготовлен для проверки" })
  .waitFor();
await next();
await p.getByRole("button", { name: "Открыть предпросмотр" }).click();
assert.ok((await p.locator(".wizard-form").innerText()).includes("0.34"));
const docx = await file("estimate.docx", "Скачать DOCX");
const zip = await JSZip.loadAsync(docx);
assert.ok(zip.file("word/document.xml"));
const xlsx = await file("estimate.xlsx", "Скачать XLSX");
const wb = new ExcelJS.Workbook();
await wb.xlsx.load(xlsx);
assert.equal(wb.getWorksheet("Статьи расходов").getCell("G2").result, 0.34);
await p.emulateMedia({ media: "print" });
await p.pdf({
  path: "screenshots/wizard/estimate.pdf",
  format: "A4",
  printBackground: true,
});
assert.equal(await p.locator(".app-shell").isVisible(), false);
await p.emulateMedia({ media: "screen" });
await p.getByRole("button", { name: "Закрыть окно" }).click();
await p.getByRole("button", { name: "Подготовить копию для жителей" }).click();
assert.equal(
  await p
    .getByRole("button", { name: "Опубликовать информационную копию" })
    .isEnabled(),
  false,
);
await p.getByRole("dialog").getByRole("checkbox").check();
await p
  .getByRole("button", { name: "Опубликовать информационную копию" })
  .click();
const resident = await context.newPage();
await resident.goto(base);
await resident.getByRole("button", { name: "Войти как житель" }).click();
assert.equal(await nav(resident, "Мастер документов ОСИ").count(), 0);
await nav(resident, "Документы").click();
await resident
  .getByRole("heading", {
    name: "Информационная копия: Годовая смета",
    exact: true,
  })
  .waitFor();
await p.getByRole("button", { name: "К списку проектов" }).click();
await p.getByRole("button", { name: "Каталог документов" }).click();
await create("Протокол явочного собрания");
await field("Номер протокола", "7");
await field("Дата собрания", "2026-10-16");
await field("Время собрания", "12:00");
await field("Место проведения", "Вымышленный двор");
await field("Инициатор собрания", "Демо-инициатор");
await next();
await field("Общее количество собственников квартир", "2");
await field("Общее количество собственников нежилых помещений", "0");
await field("Количество участвующих на собрании", "2");
for (let i = 1; i <= 2; i++) {
  await p.getByRole("button", { name: "Добавить участника" }).click();
  await field(`ФИО участника ${i}`, `Вымышленный участник ${i}`);
  await field(`Квартира участника ${i}`, String(i));
  await field(
    `Контакт участника ${i} (необязательно)`,
    `demo${i}@example.invalid`,
  );
}
await p
  .getByLabel("Участие участника 2", { exact: true })
  .selectOption("Представитель");
await field("Документ о полномочиях участника 2", "Демо-доверенность");
await field("Срок полномочий участника 2", "До 31.12.2026");
await next();
await field("ФИО председателя собрания", "Демо-председатель");
await field("ФИО секретаря собрания", "Демо-секретарь");
await field("Приглашенные лица", "Отсутствуют");
await field("Выступившие лица", "Вымышленный участник 1");
for (let i = 1; i <= 2; i++) {
  await p.getByRole("button", { name: "Добавить вопрос" }).click();
  await field(`Текст вопроса ${i}`, `Демонстрационный вопрос ${i}`);
  await p
    .getByLabel(`Предмет вопроса ${i}`)
    .selectOption(
      i === 1
        ? "Утверждение годовой сметы / текущих взносов"
        : "Выбор формы управления / избрание председателя",
    );
  for (const [label, value] of [
    ["За, бумага", i === 1 ? "2" : "1"],
    ["Против, бумага", i === 1 ? "0" : "1"],
    ["Воздержался, бумага", "0"],
    ["За, цифровые", "0"],
    ["Против, цифровые", "0"],
    ["Воздержался, цифровые", "0"],
  ])
    await field(`${label}, вопрос ${i}`, value);
  await field(
    `Решение по вопросу ${i}`,
    `Формулировка проекта решения ${i}, введенная человеком`,
  );
  await field(`Лист голосования по вопросу ${i}`, `Лист ${i}`);
}
await field(
  "Итоги голосования на собрании — текст пользователя",
  "Демонстрационные итоги внесены вручную",
);
await next();
await field(
  "Перечень приложений и оформление",
  "Регистрация и листы голосования 1 и 2. Оформление, прошивка и нумерация после подписания вне приложения.",
);
await next();
assert.equal(await p.locator(".validation-errors li").count(), 0);
await p
  .getByText("Недостаточно данных для проверки", { exact: true })
  .waitFor();
await p
  .getByRole("button", { name: "Подготовить для проверки", exact: true })
  .click();
await next();
await p.getByRole("button", { name: "Открыть предпросмотр" }).click();
assert.equal(await p.locator(".wizard-form table").count(), 4); // registration, two voting sheets, separate authority cover
const protocol = await file("protocol.docx", "Скачать DOCX");
const pzip = await JSZip.loadAsync(protocol);
const xml = await pzip.file("word/document.xml").async("text");
for (const value of [
  "Голосую",
  "Вымышленный участник 2",
  "Формулировка проекта решения 2",
  "Демо-доверенность",
])
  assert.ok(xml.includes(value));
await p.emulateMedia({ media: "print" });
await p.pdf({
  path: "screenshots/wizard/protocol.pdf",
  format: "A4",
  printBackground: true,
});
await p.screenshot({
  path: "screenshots/wizard/print-protocol.png",
  fullPage: true,
});
await p.emulateMedia({ media: "screen" });
await p.getByRole("button", { name: "Закрыть окно" }).click();
await p.getByRole("button", { name: "Подготовить копию для жителей" }).click();
const summary = await p.getByRole("dialog").innerText();
for (const value of [
  "Вымышленный участник",
  "demo1@example.invalid",
  "Демо-доверенность",
])
  assert.ok(!summary.includes(value));
assert.ok(summary.includes("Демонстрационный вопрос"));
assert.ok(summary.includes("Формулировка проекта решения"));
await p.getByRole("dialog").getByRole("checkbox").check();
await p
  .getByRole("button", { name: "Опубликовать информационную копию" })
  .click();
await resident
  .getByRole("heading", {
    name: "Информационная копия: Протокол явочного собрания",
    exact: true,
  })
  .waitFor();
await nav(resident, "ИИ-помощник").click();
await resident
  .getByRole("textbox", { name: "Вопрос помощнику" })
  .fill("Найди документ: Информационная копия");
await resident.getByRole("button", { name: "Отправить вопрос" }).click();
assert.ok(
  !(await resident.locator(".answer-bubble").last().innerText()).includes(
    "Вымышленный участник",
  ),
);
await p.getByRole("button", { name: "К списку проектов" }).click();
await p.reload();
await p.getByRole("button", { name: "Войти как председатель" }).click();
await nav(p, "Мастер документов ОСИ").click();
await p.getByRole("button", { name: "Мои проекты (2)", exact: true }).click();
assert.equal(
  await p.getByRole("button", { name: "Открыть проект", exact: true }).count(),
  2,
);
await p.getByLabel("Доступный дом").selectOption("h2");
await nav(p, "Мастер документов ОСИ").click();
await p.getByRole("button", { name: "Мои проекты (0)", exact: true }).click();
await p.getByText(/Проектов пока нет/).waitFor();
await p.getByLabel("Доступный дом").selectOption("h1");
await p.setViewportSize({ width: 360, height: 800 });
await p
  .locator(".mobile-nav")
  .getByRole("button", { name: "Мастер", exact: true })
  .click();
assert.ok(
  await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
);
await p.screenshot({
  path: "screenshots/wizard/catalog-mobile.png",
  fullPage: true,
});
await create("Лист регистрации участников");
await next();
await p.getByRole("button", { name: "Добавить участника" }).click();
await field("ФИО участника 1", "Демо-владелец");
await field("Квартира участника 1", "9");
await next();
await field("ФИО председателя собрания", "Демо-председатель");
await field("ФИО секретаря собрания", "Демо-секретарь");
await p
  .getByRole("button", { name: "Сохранить черновик", exact: true })
  .click();
assert.ok(
  await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
);
await p.screenshot({
  path: "screenshots/wizard/editor-mobile.png",
  fullPage: true,
});
const text = execFileSync(
  "pdftotext",
  ["screenshots/wizard/protocol.pdf", "-"],
  { encoding: "utf8" },
);
assert.ok(text.includes("Формулировка проекта решения 2"));
assert.ok(text.includes("Сопроводительный лист"));
assert.ok(!text.includes("Каталог документов"));
assert.ok(!text.includes("Опубликовать информационную копию"));
const info = execFileSync("pdfinfo", ["screenshots/wizard/protocol.pdf"], {
  encoding: "utf8",
});
assert.ok(Number(info.match(/Pages:\s+(\d+)/)[1]) >= 5);
assert.deepEqual(errors, []);
console.log(
  "PASS: catalog, drafts/continue/reload, estimate rounding, real DOCX/XLSX, protocol with per-question votes and appendices, PDF, sanitized publication, resident/house isolation and 360px UI; no console errors.",
);
await b.close();
