import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import JSZip from "jszip";
const base = process.env.UYKOMEK_PILOT_BASE || "http://localhost:3300";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw Error(
    "This synthetic-data test is restricted to a local isolated pilot server.",
  );
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const chairCtx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  }),
  residentCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
const p = await chairCtx.newPage(),
  r = await residentCtx.newPage(),
  errors = [];
for (const page of [p, r]) {
  page.setDefaultTimeout(25000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("Failed to load resource"))
      errors.push(m.text());
  });
}
r.on("response", (response) => {
  if (response.url().includes("/auth/logout"))
    console.log("Logout HTTP status:", response.status());
});
const password = "PilotBrowser-2026-Only";
const suffix = randomUUID().slice(0, 8),
  chairEmail = `chair-${suffix}@example.test`,
  residentEmail = `resident-${suffix}@example.test`;
const nav = (page, name) =>
  page
    .locator(page === r ? ".mobile-nav" : ".sidebar nav")
    .getByRole("button", { name, exact: true });
async function register(page, email, name) {
  await page.getByRole("button", { name: "Регистрация", exact: true }).click();
  await page.getByLabel("Имя", { exact: true }).fill(name);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Зарегистрироваться", exact: true })
    .click();
}
await p.goto(base + "/?mode=work");
await register(p, chairEmail, "Председатель пилота");
await p
  .getByLabel("Название ОСИ", { exact: true })
  .fill("Тестовый ОСИ " + suffix);
await p
  .getByLabel("Адрес дома", { exact: true })
  .fill("Вымышленная улица, дом 1");
await p
  .getByLabel("Контакты для обращений", { exact: true })
  .fill("Тестовая приемная");
await p.getByRole("button", { name: "Создать дом", exact: true }).click();
await p.getByText(/Подключение дома ожидает ручной проверки/).waitFor();
assert.equal(
  await p
    .getByRole("button", { name: "Войти как председатель", exact: true })
    .count(),
  0,
);
await p
  .locator(".content")
  .getByRole("button", { name: "Настройки рабочего кабинета", exact: true })
  .click();
await p.getByText("Приглашения жителей", { exact: true }).click();
await p.getByLabel("Email приглашенного").fill(residentEmail);
await p.getByLabel("Номер помещения", { exact: true }).fill("1");
await p.getByRole("button", { name: "Создать приглашение жителя" }).click();
const invite = await p.getByLabel("Одноразовая ссылка").inputValue();
assert.ok(invite.includes("#invite="));
await r.goto(invite);
await register(r, residentEmail, "Житель пилота");
await r
  .getByRole("button", { name: "Принять приглашение", exact: true })
  .click();
await nav(r, "Обращения").click();
await r.getByRole("button", { name: "Новое обращение", exact: true }).click();
await r.getByLabel("Тема", { exact: true }).fill("Тестовая протечка " + suffix);
await r
  .getByLabel("Описание", { exact: true })
  .fill("Вымышленная вода на лестнице.");
await r.getByLabel("Место проблемы", { exact: true }).fill("Первый подъезд");
await r
  .getByRole("button", { name: "Отправить обращение", exact: true })
  .click();
await r.getByRole("dialog").waitFor({ state: "hidden" });
await r
  .locator(".ticket-item")
  .filter({ hasText: "Тестовая протечка " + suffix })
  .click();
await p
  .locator(".content")
  .getByRole("button", { name: "Настройки рабочего кабинета", exact: true })
  .click();
await nav(p, "Обращения").click();
await p
  .locator(".ticket-item")
  .filter({ hasText: "Тестовая протечка " + suffix })
  .click();
await p
  .getByLabel("Новое сообщение", { exact: true })
  .fill("Тестовый ответ председателя: заявка рассмотрена.");
await p
  .getByRole("button", { name: "Отправить сообщение", exact: true })
  .click();
await r
  .getByText("Тестовый ответ председателя: заявка рассмотрена.", {
    exact: true,
  })
  .waitFor();
await p
  .getByLabel("Статус обращения", { exact: true })
  .selectOption("Выполнено");
await p
  .getByLabel("Результат выполнения", { exact: true })
  .fill("Демонстрационная проверка выполнена.");
await p
  .getByRole("button", { name: "Сохранить параметры обращения", exact: true })
  .click();
await r
  .getByLabel("Что не устранено", { exact: true })
  .fill("Тест: нужно проверить повторно.");
await r
  .getByRole("button", { name: "Проблема не устранена — вернуть в работу" })
  .click();
await p.getByText("Тест: нужно проверить повторно.", { exact: true }).waitFor();
await nav(p, "Документы").click();
await p.getByRole("button", { name: "Добавить документ", exact: true }).click();
await p
  .getByLabel("Название", { exact: true })
  .fill("План ремонта крыши " + suffix);
await p
  .getByLabel("Текст", { exact: true })
  .fill("Проект работ по крыше. Данные вымышлены для проверки пилота.");
await p
  .getByRole("button", { name: "Сохранить черновик", exact: true })
  .click();
await p.getByRole("dialog").waitFor({ state: "hidden" });
await nav(r, "Документы").click();
assert.equal(
  await r
    .getByRole("heading", { name: "План ремонта крыши " + suffix, exact: true })
    .count(),
  0,
);
const card = p
  .locator(".document-grid .document")
  .filter({
    has: p.getByRole("heading", {
      name: "План ремонта крыши " + suffix,
      exact: true,
    }),
  });
await card.getByRole("button", { name: "Просмотреть", exact: true }).click();
const zip = new JSZip();
zip.file("[Content_Types].xml", "<Types/>");
zip.file(
  "word/document.xml",
  "<w:document><w:t>Приложение к плану крыши для поиска.</w:t></w:document>",
);
const buffer = await zip.generateAsync({ type: "nodebuffer" });
await p
  .getByLabel("Защищенный файл")
  .setInputFiles({
    name: "test-plan.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer,
  });
await p.getByRole("link", { name: "test-plan.docx", exact: true }).waitFor();
await p.getByRole("button", { name: "Закрыть окно" }).click();
await card.getByRole("button", { name: "Опубликовать", exact: true }).click();
await p
  .getByRole("button", { name: "Подтвердить публикацию", exact: true })
  .click();
await p.getByRole("dialog").waitFor({ state: "hidden" });
await r
  .getByRole("heading", { name: "План ремонта крыши " + suffix, exact: true })
  .waitFor();
await nav(r, "ИИ-помощник").click();
await r.getByText(/ИИ не настроен/).waitFor();
await r.getByLabel("Вопрос помощнику").fill("крыши");
await r
  .getByRole("button", { name: "Найти в материалах дома", exact: true })
  .click();
await r
  .getByRole("button", { name: "План ремонта крыши " + suffix, exact: true })
  .click();
const fileUrl = await r
  .getByRole("link", { name: "test-plan.docx", exact: true })
  .getAttribute("href");
assert.equal((await residentCtx.request.get(base + fileUrl)).status(), 200);
await r.getByRole("button", { name: "Закрыть окно" }).click();
// No live payload enters localStorage or the shared PWA cache.
assert.equal(
  await r.evaluate(() => localStorage.getItem("uykomek-data-v1")),
  null,
);
const personalCached = await r.evaluate(async () => {
  for (const key of await caches.keys()) {
    const cache = await caches.open(key);
    for (const req of await cache.keys())
      if (new URL(req.url).pathname.startsWith("/api/")) return true;
  }
  return false;
});
assert.equal(personalCached, false);
fs.mkdirSync("screenshots/pilot", { recursive: true });
await r.screenshot({
  path: "screenshots/pilot/resident-mobile.png",
  fullPage: true,
});
await p.screenshot({
  path: "screenshots/pilot/chair-desktop.png",
  fullPage: true,
});
await r.getByRole("button", { name: "Выйти", exact: true }).click();
try {
  await r
    .getByRole("heading", { name: "Войти в рабочий кабинет", exact: true })
    .waitFor();
} catch (e) {
  await r.screenshot({
    path: "/tmp/uykomek-logout-failed.png",
    fullPage: true,
  });
  console.log(
    "Logout debug headings:",
    await r.locator("h1,h2,[role=alert]").allTextContents(),
  );
  console.log("Page errors:", errors);
  throw e;
}
assert.equal(
  await r.getByText("Проект работ по крыше.", { exact: false }).count(),
  0,
);
assert.equal((await residentCtx.request.get(base + fileUrl)).status(), 401);
await r.getByLabel("Email", { exact: true }).fill(chairEmail);
await r.getByLabel("Пароль", { exact: true }).fill(password);
await r.getByRole("button", { name: "Войти", exact: true }).click();
await r.getByRole("button", { name: "Выйти", exact: true }).waitFor();
assert.ok(
  await r.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
);
assert.deepEqual(errors, []);
console.log(
  "PASS: Docker/PostgreSQL browser E2E: register, pending house, single-use resident invitation, independent mobile session, ticket/reply/close/reopen, draft upload/publication, local assistant search, protected download, no personal cache/localStorage, logout and user switch.",
);
await browser.close();
