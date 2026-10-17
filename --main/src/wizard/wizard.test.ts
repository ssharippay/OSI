import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import ExcelJS from "exceljs";
import { seed, migrate } from "../store/migration";
import { visibleDocs } from "../store/selectors";
import { templates, votingAttachment } from "./registry";
import {
  createWizard,
  renderForm,
  plainText,
  newArea,
  newItem,
  newParticipant,
  newQuestion,
} from "./engine";
import { validate, voteArithmetic } from "./rules";
import { calculate, roundDiv, decimal } from "./calculation";
import {
  saveWizard,
  wizardDocuments,
  publishWizardCopy,
  archiveWizard,
} from "./store";
import { docxBlob, xlsxBlob } from "./exports";
import type { Context } from "../models";
const c: Context = { userId: "u2", houseId: "h1", month: "2026-10" };
const r = { ...c, userId: "u1" };
const make = (id = "estimate-v1") =>
  createWizard(
    templates.find((t) => t.id === id)!,
    "h1",
    "Павлодар, вымышленная улица, 24",
    "Демо ОСИ",
  );
function estimate() {
  const doc = make();
  doc.input = {
    ...doc.input,
    year: "2026",
    declaredArea: "100",
    areas: [{ ...newArea(), number: "1", area: "100" }],
    items: [
      {
        ...newItem(),
        title: "Уборка",
        quantity: "1",
        unit: "услуга",
        price: "100.01",
        frequency: "12",
        reason: "Демонстрационное предложение",
      },
    ],
    commercialIncome: "0",
    inventoryReference: "Вымышленный перечень",
    inspectionReference: "Демо-осмотр",
  };
  return doc;
}
function protocol() {
  const doc = make("protocol-attendance-v1");
  doc.input = {
    ...doc.input,
    meetingDate: "2026-10-16",
    meetingTime: "12:00",
    protocolNumber: "1",
    meetingPlace: "Демо-двор",
    initiator: "Вымышленный инициатор",
    chair: "Демо-председатель",
    secretary: "Демо-секретарь",
    apartmentOwners: "10",
    nonresidentialOwners: "0",
    participantsCount: "1",
    participants: [
      {
        ...newParticipant(),
        name: "Секретный Участник",
        apartment: "1",
        capacity: "Представитель",
        authority: "Секретная доверенность",
        authorityUntil: "2026-12-31",
        contact: "secret@example.invalid",
      },
    ],
    invited: "Нет",
    speakers: "Вымышленный выступивший",
    votingSummary: "Итоги внесены пользователем",
    attachments:
      "Регистрация и отдельные листы голосования; нумерация после подписания.",
    questions: [
      {
        ...newQuestion(),
        text: "Секретный текст вопроса",
        topic: "Утверждение годовой сметы / текущих взносов",
        paperFor: "1",
        paperAgainst: "0",
        paperAbstain: "0",
        digitalFor: "0",
        digitalAgainst: "0",
        digitalAbstain: "0",
        decision: "Секретный текст решения",
        sheetReference: "Лист 1",
      },
    ],
  };
  return doc;
}
const normalize = (s: string) =>
  s
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
describe("Официальные источники и версии", () => {
  it("заголовки и графы утвержденных форм присутствуют в сохраненном официальном тексте", () => {
    const source = normalize(
      readFileSync("docs/legal/sources/V2000020283.html", "utf8"),
    );
    for (const id of ["protocol-attendance-v1", "registration-v1"])
      for (const label of templates.find((t) => t.id === id)!.headings)
        expect(source).toContain(normalize(label));
    for (const label of votingAttachment.headers)
      expect(source).toContain(normalize(label));
    expect(source).toContain(normalize(votingAttachment.title));
  });
  it("хеши официальных снимков совпадают; карточки содержат основание и дату", () => {
    for (const id of [
      "Z970000094_",
      "V2000020283",
      "V2000020284",
      "V2500036944",
      "V2500036907",
      "V2600039329",
    ]) {
      const text = readFileSync("docs/legal/sources/" + id + ".html");
      const meta = JSON.parse(
        readFileSync("docs/legal/sources/" + id + ".json", "utf8"),
      );
      expect(createHash("sha256").update(text).digest("hex")).toBe(
        meta.contentSha256,
      );
      expect(meta.is_actual).toBe(true);
    }
    for (const t of templates) {
      expect(t.url).toMatch(/^https:\/\/adilet.zan.kz\//);
      expect(t.annex).not.toBe("");
      expect(t.checkedAt).toBe("2026-10-16");
    }
    expect(templates.filter((t) => t.implemented)).toHaveLength(3);
    expect(templates[0].status).toBe("Рекомендуемый шаблон");
  });
  it("не допускает неподготовленный шаблон и период до редакции", () => {
    expect(() =>
      createWizard(
        templates.find((t) => t.id === "monthly-pending")!,
        "h1",
        "",
        "",
      ),
    ).toThrow("недоступен");
    const d = protocol();
    d.input.meetingDate = "2026-07-20";
    expect(validate(d).errors.join()).toContain("еще не действовала");
    const e = estimate();
    e.input.year = "2024";
    expect(validate(e).errors.join()).toContain("не подтверждена");
  });
  it("сохраняет отдельные снимки шаблонов и приложений", () => {
    const d = protocol();
    const before = JSON.stringify(d.template);
    const attachment = JSON.stringify(d.attachmentTemplates);
    const registry = templates.find((t) => t.id === "protocol-attendance-v1")!;
    const old = registry.title;
    registry.title = "Новая редакция";
    expect(JSON.stringify(d.template)).toBe(before);
    expect(JSON.stringify(d.attachmentTemplates)).toBe(attachment);
    registry.title = old;
  });
});
describe("Расчет сметы", () => {
  it("требует дефектный акт по выбранному текущему ремонту, а не по слову в названии", () => {
    const doc = estimate();
    doc.input.items[0].title = "Ремонт";
    expect(validate(doc).errors.join(" ")).not.toContain("дефектный акт");
    doc.input.items[0].currentRepair = true;
    expect(validate(doc).errors.join(" ")).toContain("дефектный акт");
    doc.input.defectReference = "Демо-акт";
    expect(validate(doc).errors.join(" ")).not.toContain("дефектный акт");
    doc.input.defectReference = "";
    doc.input.items[0].group = "savings";
    expect(validate(doc).errors.join(" ")).not.toContain("дефектный акт");
  });
  it("округляет до тиына половиной вверх и не использует двоичную арифметику", () => {
    expect(roundDiv(1n, 2n)).toBe(1n);
    const d = estimate();
    d.input.items[0] = {
      ...d.input.items[0],
      quantity: "0.3333",
      price: "100.00",
      frequency: "1",
    };
    const calc = calculate(d.input);
    expect(decimal(calc.lines[0].cents!)).toBe("33.33");
    d.input.items[0].quantity = "0.33335";
    expect(calculate(d.input).issues.length).toBeGreaterThan(0);
    d.input.items[0].quantity = "0.335";
    d.input.items[0].price = "1.00";
    expect(decimal(calculate(d.input).lines[0].cents!)).toBe("0.34");
  });
  it("разделяет текущие расходы, накопления и целевые сборы; не округляет ставку промежуточно", () => {
    const d = estimate();
    d.input.declaredArea = "3";
    d.input.areas = [
      { ...newArea(), number: "1", area: "1" },
      { ...newArea(), number: "2", area: "2" },
    ];
    d.input.items = [
      {
        ...newItem(),
        title: "Текущий расход",
        quantity: "1",
        price: "10.00",
        frequency: "1",
      },
      {
        ...newItem(),
        group: "savings",
        title: "Накопления",
        quantity: "1",
        price: "500",
        frequency: "1",
      },
      {
        ...newItem(),
        group: "target",
        title: "Целевой",
        quantity: "1",
        price: "700",
        frequency: "1",
      },
    ];
    const calc = calculate(d.input);
    expect(calc.core).toBe(1000n);
    expect(calc.totals.savings).toBe(50000n);
    expect(calc.totals.target).toBe(70000n);
    expect(calc.charges.map((r) => r.monthly)).toEqual(["0.28", "0.56"]);
    expect(calc.rateSix).toBe("0.277778");
  });
  it("проверяет площади, отрицательные значения, лишний доход и пределы", () => {
    const d = estimate();
    expect(validate(d).errors).toHaveLength(0);
    d.input.declaredArea = "101";
    expect(validate(d).errors.join()).toContain("не совпадает");
    d.input.items[0].price = "-5";
    expect(calculate(d.input).issues.length).toBeGreaterThan(0);
    d.input.items[0].price = "1";
    d.input.commercialIncome = "10000";
    expect(validate(d).errors.join()).toContain("превышает");
    expect(calculate(d.input).rateSix).toBeNull();
    expect(validate(d).warnings.join()).toContain("Местный минимальный");
  });
});
describe("Протокол и приложения", () => {
  it("не создает голоса, участников, решения или подписи", () => {
    const blank = make("protocol-attendance-v1");
    expect(blank.input.participants).toEqual([]);
    expect(blank.input.questions).toEqual([]);
    const q = newQuestion();
    expect(q.paperFor).toBe("");
    expect(q.decision).toBe("");
    expect(validate(blank).errors.length).toBeGreaterThan(0);
    const full = protocol();
    full.blocks = renderForm(full);
    const text = plainText(full.blocks);
    expect(text).toContain("Голосую");
    expect(text).toContain("Секретный текст решения");
    const tables = full.blocks.filter((b) => b.type === "table");
    expect(tables[0].rows![0].at(-1)).toBe("");
    expect(tables.at(-1)?.rows![0].slice(-3)).toEqual(["", "", ""]);
  });
  it("хранит результаты каждого вопроса раздельно без общего юридического порога", () => {
    const d = protocol();
    d.input.questions.push({
      ...d.input.questions[0],
      id: "q2",
      text: "Другой вопрос",
      paperFor: "0",
      paperAgainst: "1",
      decision: "Другая формулировка",
    });
    expect(validate(d).errors).toEqual([]);
    expect(voteArithmetic(d.input.questions[0])).toEqual({
      paper: 1,
      digital: 0,
      total: 1,
    });
    expect(voteArithmetic(d.input.questions[1])).toEqual({
      paper: 1,
      digital: 0,
      total: 1,
    });
    expect(validate(d).warnings.join()).toContain(
      "Недостаточно данных для проверки",
    );
    const text = plainText(renderForm(d));
    expect(text).toContain("За 1  Против 0");
    expect(text).toContain("За 0  Против 1");
  });
  it("требует сведения о представителе и отдельном листе по вопросу", () => {
    const d = protocol();
    d.input.participants[0].authority = "";
    d.input.questions[0].sheetReference = "";
    expect(validate(d).errors.join()).toContain("полномочиях");
    expect(validate(d).errors.join()).toContain("отдельный лист");
  });
});
describe("Сохранение, права и безопасная публикация", () => {
  it("сохраняет незавершенный черновик, не теряет v2 и ограничивает доступ домом/ролью", () => {
    const s = seed();
    const d = saveWizard(s, c, make());
    expect(wizardDocuments(s, c)).toHaveLength(1);
    expect(wizardDocuments(s, r)).toHaveLength(0);
    expect(wizardDocuments(s, { ...c, houseId: "h2" })).toHaveLength(0);
    expect(visibleDocs(s, r).some((x) => x.id === d.id)).toBe(false);
    expect(migrate(s)).toBe(s);
    expect(() => saveWizard(s, r, d)).toThrow();
    expect(() => saveWizard(s, { ...c, houseId: "h2" }, d)).toThrow();
    expect(() =>
      saveWizard(s, c, { ...d, status: "Подготовлен для проверки" }, 1),
    ).toThrow("обязательные");
  });
  it("ранее сохраненные блоки и снимки не меняются после изменения реестра", () => {
    const s = seed();
    const d = protocol();
    const saved = saveWizard(s, c, d);
    const before = JSON.stringify(saved);
    const registry = templates.find((t) => t.id === d.template.id)!;
    const old = registry.headings[0];
    registry.headings[0] = "Изменен реестр";
    expect(JSON.stringify(s.wizardDocuments![0])).toBe(before);
    expect(plainText(saved.blocks)).not.toContain("Изменен реестр");
    registry.headings[0] = old;
  });
  it("публикует только подтвержденную информационную копию без персональных и свободных текстов", () => {
    const s = seed();
    const d = protocol();
    d.title = "Личный заголовок Секретный Участник";
    const saved = saveWizard(s, c, {
      ...d,
      status: "Подготовлен для проверки",
    });
    expect(saved.publication).toBe("Не опубликован");
    expect(() => publishWizardCopy(s, c, d.id, 1, false)).toThrow(
      "Подтвердите",
    );
    publishWizardCopy(s, c, d.id, 1, true);
    expect(s.wizardDocuments![0].status).toBe("Подготовлен для проверки");
    const copy = s.docs.find((x) => x.id === saved.publicDocumentId)!;
    expect(visibleDocs(s, r).some((x) => x.id === copy.id)).toBe(true);
    for (const text of [
      "Секретный Участник",
      "Секретная доверенность",
      "secret@example.invalid",
      "Секретный текст вопроса",
      "Секретный текст решения",
      "Личный заголовок",
    ])
      expect(copy.title + copy.body).not.toContain(text);
    expect(copy.body).toContain("Публикация не означает");
    expect(() => publishWizardCopy(s, c, d.id, 1, true)).toThrow(
      "уже опубликована",
    );
  });
  it("редактирование помечает прежнюю копию; архивирует независимо от публикации; отклоняет устаревшее сохранение", () => {
    const s = seed();
    let d = saveWizard(s, c, {
      ...estimate(),
      status: "Подготовлен для проверки",
    });
    publishWizardCopy(s, c, d.id, 1, true);
    const copyId = d.publicDocumentId;
    d = saveWizard(
      s,
      c,
      { ...d, status: "Черновик", input: { ...d.input, year: "2027" } },
      1,
    );
    expect(s.docs.find((x) => x.id === copyId)?.status).toBe("Опубликован");
    expect(s.docs.find((x) => x.id === copyId)?.wizardSource?.needsUpdate).toBe(
      true,
    );
    expect(d.publication).toBe("Требует обновления");
    expect(() => saveWizard(s, c, d, 1)).toThrow("другой вкладке");
    archiveWizard(s, c, d.id, d.version);
    expect(s.wizardDocuments![0].status).toBe("Архив");
  });
  it("добавление optional-модуля не сбрасывает старые данные; неизвестная версия не принимается", () => {
    const s = seed();
    const before = JSON.stringify(s.docs);
    saveWizard(s, c, make());
    expect(JSON.stringify(s.docs)).toBe(before);
    expect(() =>
      migrate({ ...s, wizardDocuments: [{ formatVersion: 9 }] }),
    ).toThrow("не поддерживается");
  });
});
describe("Настоящие файлы выгрузки", () => {
  it("DOCX — OpenXML с сохраненными заголовками, графами, пустыми подписями и отдельной служебной страницей", async () => {
    const d = protocol();
    d.blocks = renderForm(d);
    const blob = await docxBlob(d);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(zip.file("[Content_Types].xml")).not.toBeNull();
    expect(zip.file("word/document.xml")).not.toBeNull();
    const xml = await zip.file("word/document.xml")!.async("text");
    expect(xml).toContain("Протокол №");
    expect(xml).toContain("Голосую");
    expect(xml).toContain("Секретный Участник");
    expect(xml).toContain("Сопроводительный лист");
    expect(xml).toContain('w:type="page"');
    expect(xml.indexOf("Сопроводительный лист")).toBeGreaterThan(
      xml.indexOf("Инициатор"),
    );
  }, 20000);
  it("XLSX читается ExcelJS, содержит точные итоги, отдельные группы и безопасные строковые ячейки", async () => {
    const d = estimate();
    d.input.items[0].title = '=HYPERLINK("example.invalid")';
    d.blocks = renderForm(d);
    const blob = await xlsxBlob(d);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(zip.file("xl/workbook.xml")).not.toBeNull();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());
    expect(wb.worksheets).toHaveLength(6);
    const ws = wb.getWorksheet("Статьи расходов")!;
    expect(ws.getCell("B2").value).toBe(d.input.items[0].title);
    expect(ws.getCell("G2").result).toBe(1200.12);
    expect(ws.getCell("G2").formula).toContain("ROUND");
    expect(ws.getCell("B2").type).toBe(ExcelJS.ValueType.String);
    expect(wb.getWorksheet("Основания и ограничения")).toBeDefined();
  }, 20000);
});
