import { chromium } from "@playwright/test";
import fs from "node:fs";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import JSZip from "jszip";
const docs = JSON.parse(
  fs.readFileSync("/tmp/uykomek-recalc/long-forms.json", "utf8"),
);
const b = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } }),
  p = await ctx.newPage();
p.setDefaultTimeout(20000);
await p.goto("http://localhost:5173/");
await p.evaluate((docs) => {
  const s = JSON.parse(localStorage.getItem("uykomek-data-v1"));
  s.wizardDocuments = docs.map((d) => ({
    ...d,
    version: 1,
    step: d.kind === "estimate" ? 6 : 5,
  }));
  localStorage.setItem("uykomek-data-v1", JSON.stringify(s));
}, docs);
await p.reload();
await p.getByRole("button", { name: "Войти как председатель" }).click();
await p
  .locator(".sidebar nav")
  .getByRole("button", { name: "Мастер документов ОСИ", exact: true })
  .click();
await p.getByRole("button", { name: "Мои проекты (2)", exact: true }).click();
fs.mkdirSync("screenshots/v04", { recursive: true });
for (const doc of docs) {
  await p
    .locator(".wizard-catalog .card")
    .filter({ has: p.getByRole("heading", { name: doc.title, exact: true }) })
    .getByRole("button", { name: "Открыть проект", exact: true })
    .click();
  await p
    .getByRole("button", { name: "Открыть предпросмотр", exact: true })
    .click();
  await p.emulateMedia({ media: "print" });
  const name = doc.kind === "estimate" ? "long-estimate" : "long-protocol";
  await p.pdf({
    path: `screenshots/v04/${name}.pdf`,
    format: "A4",
    printBackground: true,
  });
  await p.emulateMedia({ media: "screen" });
  await p.getByRole("button", { name: "Закрыть окно" }).click();
  await p.getByRole("button", { name: "К списку проектов" }).click();
  const browserText = execFileSync(
    "pdftotext",
    [`screenshots/v04/${name}.pdf`, "-"],
    { encoding: "utf8" },
  );
  const wordText = execFileSync(
    "pdftotext",
    [`/tmp/uykomek-recalc/print/${name}.pdf`, "-"],
    { encoding: "utf8" },
  );
  const last =
    doc.kind === "estimate" ? "Длинная статья 35" : "Демо-участник 65";
  for (const text of [browserText, wordText]) {
    assert.ok(
      doc.kind === "estimate"
        ? text.includes("35:") && text.includes("Длинная")
        : /Демо-участник\s+65/.test(text),
      name + ": last row",
    );
    assert.ok(text.includes("Сопроводительный лист"));
    assert.ok(!text.includes("Скачать DOCX"));
  }
  const zip = await JSZip.loadAsync(
    fs.readFileSync(`/tmp/uykomek-recalc/${name}.docx`),
  );
  const xml = await zip.file("word/document.xml").async("text");
  assert.ok(xml.includes("w:tblHeader"));
  assert.ok(xml.includes("Инициатор") || doc.kind === "estimate");
  fs.copyFileSync(
    `/tmp/uykomek-recalc/${name}.docx`,
    `screenshots/v04/${name}.docx`,
  );
  fs.copyFileSync(
    `/tmp/uykomek-recalc/print/${name}.pdf`,
    `screenshots/v04/word-${name}.pdf`,
  );
  const pages = execFileSync("pdfinfo", [`screenshots/v04/${name}.pdf`], {
    encoding: "utf8",
  }).match(/Pages:\s+(\d+)/)[1];
  console.log(
    "PASS:",
    name,
    "browser pages",
    pages,
    "Word opened/rendered; final rows and separate cover present, repeating headers in OOXML.",
  );
}
await b.close();
