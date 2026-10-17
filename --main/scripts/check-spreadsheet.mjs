import ExcelJS from "exceljs";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import JSZip from "jszip";
const fixture = "/tmp/uykomek-recalc/estimate.xlsx";
assert.ok(
  fs.existsSync(fixture),
  "Run UYKOMEK_EXPORT_FIXTURE=1 npm test first",
);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "uykomek-calc-"));
const out = path.join(tmp, "out");
fs.mkdirSync(out);
// Dedicated test profile: force Calc's hard recalculation of imported OOXML.
const profile = path.join(tmp, "profile");
fs.mkdirSync(path.join(profile, "user"), { recursive: true });
fs.writeFileSync(
  path.join(profile, "user/registrymodifications.xcu"),
  `<?xml version="1.0"?><oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Calc/Formula/Load"><prop oor:name="OOXMLRecalcMode" oor:op="fuse"><value>0</value></prop></item></oor:items>`,
);
const value = (wb, sheet, cell) => wb.getWorksheet(sheet).getCell(cell).result;
async function check(name, edit, verify) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(fixture);
  wb.calcProperties.fullCalcOnLoad = true;
  edit(wb);
  const file = path.join(tmp, name + ".xlsx");
  await wb.xlsx.writeFile(file);
  execFileSync(
    "soffice",
    [
      "-env:UserInstallation=file://" + path.join(tmp, "profile"),
      "--headless",
      "--convert-to",
      "xlsx",
      "--outdir",
      out,
      file,
    ],
    { stdio: "pipe", timeout: 60000 },
  );
  const result = new ExcelJS.Workbook();
  await result.xlsx.readFile(path.join(out, name + ".xlsx"));
  verify(result);
}
await check(
  "unchanged",
  () => {},
  (wb) => {
    assert.equal(value(wb, "Статьи расходов", "G2"), 0.34);
    assert.equal(value(wb, "Статьи расходов", "G3"), 240.24);
    assert.equal(value(wb, "Сводная смета", "B6"), 240.58);
    assert.equal(value(wb, "Сводная смета", "B10"), 0.200483);
    assert.equal(value(wb, "Помещения", "D2"), 20.05);
  },
);
await check(
  "changed",
  (wb) => {
    const ws = wb.getWorksheet("Статьи расходов");
    ws.getCell("C3").value = 3;
    ws.getCell("E3").value = 20;
  },
  (wb) => {
    assert.equal(value(wb, "Статьи расходов", "G3"), 720);
    assert.equal(value(wb, "Сводная смета", "B6"), 720.34);
    assert.equal(value(wb, "Сводная смета", "B10"), 0.600283);
    assert.equal(value(wb, "Помещения", "D2"), 60.03);
  },
);
for (const [name, edit] of [
  [
    "zero-area",
    (wb) => {
      wb.getWorksheet("Исходные данные").getCell("B5").value = 0;
    },
  ],
  [
    "invalid-price",
    (wb) => {
      wb.getWorksheet("Статьи расходов").getCell("E3").value = "ошибка";
    },
  ],
  [
    "empty-period",
    (wb) => {
      wb.getWorksheet("Статьи расходов").getCell("F3").value = null;
    },
  ],
  [
    "negative-quantity",
    (wb) => {
      wb.getWorksheet("Статьи расходов").getCell("C3").value = -1;
    },
  ],
  [
    "excess-precision",
    (wb) => {
      wb.getWorksheet("Статьи расходов").getCell("E3").value = 0.001;
    },
  ],
  [
    "excess-income",
    (wb) => {
      wb.getWorksheet("Исходные данные").getCell("B6").value = 900;
    },
  ],
])
  await check(name, edit, (wb) => {
    assert.equal(value(wb, "Сводная смета", "B9"), "Ошибка", name);
    assert.ok(
      value(wb, "Сводная смета", "B10") == null ||
        value(wb, "Сводная смета", "B10") === "",
      name,
    );
    assert.ok(
      value(wb, "Помещения", "D2") == null ||
        value(wb, "Помещения", "D2") === "",
      name,
    );
  });
await check(
  "partial-register",
  (wb) => {
    wb.getWorksheet("Исходные данные").getCell("B8").value = 0;
    wb.getWorksheet("Помещения").getCell("C2").value = null;
  },
  (wb) => {
    assert.equal(value(wb, "Сводная смета", "B9"), "Готово");
    assert.equal(value(wb, "Сводная смета", "B10"), 0.200483);
    assert.equal(value(wb, "Помещения", "E2"), "Нет площади");
    assert.ok(!value(wb, "Помещения", "D2"));
  },
);
const zip = await JSZip.loadAsync(fs.readFileSync(fixture));
assert.equal(
  Object.keys(zip.files).some((n) => /externalLinks|vbaProject/i.test(n)),
  false,
);
console.log(
  "PASS: LibreOffice opened and recalculated unchanged and edited files; exact cached amounts, dependent totals/charges, zero/invalid/empty/precision/income guards, partial register; no macros or external links. Files:",
  out,
);
