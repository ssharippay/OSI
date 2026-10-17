import { describe, it, expect } from "vitest";
import { seed, migrate } from "../store/migration";
import {
  saveHouseProfile,
  fromHouse,
  refreshFromHouse,
  houseDifferences,
  houseProfile,
  copyEstimate,
} from "./house";
import {
  newArea,
  newItem,
  createWizard,
  newParticipant,
  newQuestion,
  renderForm,
} from "./engine";
import { templates } from "./registry";
import { validate } from "./rules";
import { calculate, decimal } from "./calculation";
import { saveWizard, publishWizardCopy, residentProposal } from "./store";
import { xlsxBlob } from "./spreadsheet";
import { docxBlob } from "./exports";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { writeFileSync, mkdirSync } from "node:fs";
const ctx = { userId: "u2", houseId: "h1", month: "2026-10" };
function setup() {
  const s = seed(),
    profile = houseProfile(s, ctx);
  Object.assign(profile, {
    declaredArea: "100",
    registryComplete: true,
    areas: [{ ...newArea(), number: "1", area: "100" }],
    inventoryReference: "Демо-перечень",
    inspectionReference: "Демо-осмотр",
  });
  saveHouseProfile(s, ctx, profile, 0);
  const doc = fromHouse(s, ctx, templates.find((t) => t.kind === "estimate")!);
  doc.input.year = "2026";
  doc.input.commercialIncome = "0";
  doc.input.items = [
    {
      ...newItem(),
      group: "management",
      title: "Демо-управление",
      unit: "услуга",
      quantity: "0.335",
      price: "1",
      frequency: "1",
      reason: "Демо",
    },
    {
      ...newItem(),
      title: "Демо-уборка",
      unit: "услуга",
      quantity: "2",
      price: "10.01",
      frequency: "12",
      reason: "Демо",
    },
  ];
  return { s, doc };
}
describe("Завершенный сценарий сметы", () => {
  it("подставляет карточку, сохраняет снимок и обновляет только явно по различиям", () => {
    const { s, doc } = setup();
    expect(doc.input.preparer).toBe("Айдана Садыкова");
    expect(doc.input.areas[0].area).toBe("100");
    const saved = saveWizard(s, ctx, doc),
      original = structuredClone(saved);
    const p = houseProfile(s, ctx);
    p.areas[0].area = "200";
    p.declaredArea = "200";
    saveHouseProfile(s, ctx, p, 1);
    expect(s.wizardDocuments![0]).toEqual(original);
    const next = houseProfile(s, ctx);
    expect(houseDifferences(saved, next).map((d) => d.key)).toContain(
      "declaredArea",
    );
    const updated = refreshFromHouse(saved, next);
    expect(updated.input.declaredArea).toBe("200");
    expect(saved.input.declaredArea).toBe("100");
    expect(updated.input.items).toEqual(saved.input.items);
    expect(() => saveHouseProfile(s, ctx, p, 1)).toThrow("другой вкладке");
  });
  it("копирует следующий год с обязательной проверкой старых цен, не меняя источник", () => {
    const { doc } = setup();
    const before = structuredClone(doc);
    const copy = copyEstimate(doc, "2027");
    expect(copy.id).not.toBe(doc.id);
    expect(copy.version).toBe(0);
    expect(copy.input.items).toEqual(doc.input.items);
    expect(validate(copy).errors.join(" ")).toContain("актуальность");
    copy.input.pricesConfirmed = true;
    expect(validate(copy).errors).toEqual([]);
    expect(doc).toEqual(before);
    expect(() => copyEstimate(doc, "2026")).toThrow("другой год");
  });
  it("обрабатывает неполный реестр, ошибочные значения и отдельные накопления", () => {
    const { doc } = setup();
    doc.input.registryComplete = false;
    doc.input.areas[0].area = "";
    expect(validate(doc).errors).toEqual([]);
    expect(calculate(doc.input).rateSix).not.toBeNull();
    expect(calculate(doc.input).charges).toEqual([]);
    doc.input.registryComplete = true;
    expect(validate(doc).errors.length).toBeGreaterThan(0);
    doc.input.areas[0].area = "0";
    expect(validate(doc).errors.join(" ")).toContain("положительной");
    doc.input.areas[0].area = "-2";
    expect(validate(doc).errors.length).toBeGreaterThan(0);
    doc.input.areas[0].area = "1e2";
    expect(validate(doc).errors.length).toBeGreaterThan(0);
    doc.input.areas[0].area = "100";
    doc.input.areas.push({ ...doc.input.areas[0], id: "duplicate" });
    expect(validate(doc).errors.join(" ")).toContain("повторяющиеся");
    doc.input.areas.pop();
    const before = calculate(doc.input).core;
    doc.input.items.push({
      ...doc.input.items[0],
      id: "saving",
      group: "savings",
      price: "900",
    });
    expect(calculate(doc.input).core).toBe(before);
  });
  it("хранит редакторскую копию отдельно, без регистрации, с версиями и явным обновлением", () => {
    const { s, doc } = setup();
    const saved = saveWizard(s, ctx, {
      ...doc,
      status: "Подготовлен для проверки",
    });
    saved.input.participants.push({
      id: "private",
      name: "Участник Секретный",
      apartment: "1",
      nonresidential: "",
      capacity: "Представитель",
      authority: "Секретная доверенность",
      authorityUntil: "2027-01-01",
      contact: "secret@example.invalid",
    });
    const proposal = residentProposal(saved);
    expect(proposal).not.toContain("Участник Секретный");
    expect(proposal).not.toContain("secret@example");
    const original = structuredClone(saved.input);
    const blocks = structuredClone(saved.blocks);
    publishWizardCopy(
      s,
      ctx,
      saved.id,
      saved.version,
      true,
      "Проверенный текст для жителей",
    );
    expect(saved.input).toEqual(original);
    expect(saved.blocks).toEqual(blocks);
    expect(saved.publishedCopies![0].sourceVersion).toBe(1);
    const publicId = saved.publicDocumentId;
    const text = s.docs.find((d) => d.id === publicId)!.body;
    const changed = saveWizard(
      s,
      ctx,
      { ...saved, input: { ...saved.input, fundingNotes: "Изменение" } },
      1,
    );
    expect(changed.publication).toBe("Требует обновления");
    expect(s.docs.find((d) => d.id === publicId)!.body).toBe(text);
    changed.status = "Подготовлен для проверки";
    publishWizardCopy(
      s,
      ctx,
      changed.id,
      changed.version,
      true,
      "Новая проверенная копия",
    );
    expect(s.docs.find((d) => d.id === publicId)!.status).toBe("Архив");
    expect(changed.publishedCopies).toHaveLength(2);
    const originalInput = structuredClone(changed.input);
    publishWizardCopy(
      s,
      ctx,
      changed.id,
      changed.version,
      true,
      "Исправленная копия той же версии источника",
    );
    expect(changed.publishedCopies).toHaveLength(3);
    expect(changed.input).toEqual(originalInput);
  });
  it("сохраняет старые формы и публикации при аддитивной миграции", () => {
    const { s, doc } = setup();
    saveWizard(s, ctx, doc);
    const old = structuredClone(s);
    delete old.wizardDataVersion;
    const before = JSON.stringify(old);
    const upgraded = migrate(old);
    expect(upgraded.wizardDataVersion).toBe(2);
    expect(JSON.stringify(old)).toBe(before);
    expect(upgraded.wizardDocuments).toEqual(old.wizardDocuments);
    expect(upgraded.docs).toEqual(old.docs);
    expect(() => migrate({ ...old, wizardDataVersion: 9 })).toThrow(
      "не поддерживается",
    );
  });
  it("экспортирует связанные формулы и результаты, совпадающие с приложением", async () => {
    const { doc } = setup();
    const blob = await xlsxBlob(doc);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      "Инструкция",
      "Исходные данные",
      "Статьи расходов",
      "Сводная смета",
      "Помещения",
      "Основания и ограничения",
    ]);
    expect(wb.getWorksheet("Статьи расходов")!.getCell("C2").value).toBe(0.335);
    expect(wb.getWorksheet("Статьи расходов")!.getCell("G2").result).toBe(0.34);
    expect(wb.getWorksheet("Статьи расходов")!.getCell("G2").formula).toContain(
      "C2*10000",
    );
    const c = calculate(doc.input);
    const summary = wb.getWorksheet("Сводная смета")!;
    expect(summary.getCell("B6").result).toBe(Number(decimal(c.core)));
    expect(summary.getCell("B10").result).toBe(Number(c.rateSix));
    expect(wb.getWorksheet("Помещения")!.getCell("D2").result).toBe(
      Number(c.charges[0].monthly),
    );
    expect(wb.getWorksheet("Помещения")!.getCell("D2").formula).not.toContain(
      "B10",
    );
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(await zip.file("xl/workbook.xml")!.async("text")).toContain(
      'fullCalcOnLoad="1"',
    );
    if (process.env.UYKOMEK_EXPORT_FIXTURE === "1") {
      mkdirSync("/tmp/uykomek-recalc", { recursive: true });
      writeFileSync(
        "/tmp/uykomek-recalc/estimate.xlsx",
        Buffer.from(await blob.arrayBuffer()),
      );
      writeFileSync(
        "/tmp/uykomek-recalc/estimate.docx",
        Buffer.from(await (await docxBlob(doc)).arrayBuffer()),
      );
    }
  }, 20000);
  it("однозначно учитывает 1, 4, 12 и произвольное число периодов", () => {
    const { doc } = setup();
    doc.input.items = [
      { ...doc.input.items[0], quantity: "2", price: "10.01" },
    ];
    for (const f of [1, 4, 12, 6]) {
      doc.input.items[0].frequency = String(f);
      expect(calculate(doc.input).lines[0].cents).toBe(2002n * BigInt(f));
    }
  });
  it("переносит старый шаг сметы без изменения ввода и сформированной формы", () => {
    const { s, doc } = setup();
    saveWizard(s, ctx, { ...doc, step: 3 });
    delete s.wizardDataVersion;
    const old = structuredClone(s.wizardDocuments![0]);
    const upgraded = migrate(s).wizardDocuments![0];
    expect(upgraded.step).toBe(4);
    expect(upgraded.input).toEqual(old.input);
    expect(upgraded.blocks).toEqual(old.blocks);
  });
  it("готовит длинные формы для независимой проверки печати и Word", async () => {
    const { doc } = setup();
    doc.input.items = Array.from({ length: 35 }, (_, i) => ({
      ...doc.input.items[1],
      id: `long-${i}`,
      title:
        `Длинная статья ${i + 1}: ` +
        "Вымышленное техническое обслуживание общего имущества ".repeat(6),
      reason: "Демонстрационное обоснование ".repeat(5),
    }));
    doc.blocks = renderForm(doc);
    const protocol = createWizard(
      templates.find((t) => t.kind === "protocol")!,
      "h1",
      "Вымышленный адрес",
      "Демо ОСИ",
    );
    protocol.input.participants = Array.from({ length: 65 }, (_, i) => ({
      ...newParticipant(),
      name: `Демо-участник ${i + 1} Вымышленный`,
      apartment: String(i + 1),
    }));
    protocol.input.questions = [1, 2].map((n) => ({
      ...newQuestion(),
      text:
        `Длинный вопрос ${n}: ` +
        "Обсуждение проекта работ и расходов общего имущества ".repeat(24),
      decision:
        `Решение ${n}: ` +
        "Предложено проверить сведения перед предусмотренным оформлением. ".repeat(
          16,
        ),
      paperFor: "40",
      paperAgainst: "20",
      paperAbstain: "5",
      digitalFor: "0",
      digitalAgainst: "0",
      digitalAbstain: "0",
    }));
    protocol.input.chair = "Демо-председатель";
    protocol.input.secretary = "Демо-секретарь";
    protocol.input.initiator = "Демо-инициатор";
    protocol.input.meetingDate = "2026-10-16";
    protocol.blocks = renderForm(protocol);
    const longEstimate = await docxBlob(doc),
      longProtocol = await docxBlob(protocol);
    const zip = await JSZip.loadAsync(await longProtocol.arrayBuffer());
    const xml = await zip.file("word/document.xml")!.async("text");
    expect(xml).toContain("Демо-участник 65");
    expect(xml).toContain("w:tblHeader");
    if (process.env.UYKOMEK_EXPORT_FIXTURE === "1") {
      mkdirSync("/tmp/uykomek-recalc", { recursive: true });
      writeFileSync(
        "/tmp/uykomek-recalc/long-estimate.docx",
        Buffer.from(await longEstimate.arrayBuffer()),
      );
      writeFileSync(
        "/tmp/uykomek-recalc/long-protocol.docx",
        Buffer.from(await longProtocol.arrayBuffer()),
      );
      writeFileSync(
        "/tmp/uykomek-recalc/long-forms.json",
        JSON.stringify([doc, protocol]),
      );
    }
    expect(doc.blocks.length).toBeGreaterThan(10);
  }, 20000);
  it("не выпускает расчетный XLSX с ошибочными исходными числами", async () => {
    const { doc } = setup();
    doc.input.items[0].price = "ошибка";
    await expect(xlsxBlob(doc)).rejects.toThrow(
      "Расчетная выгрузка недоступна",
    );
  });
});
