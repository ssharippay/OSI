import type { WizardDocument } from "./models";
import { validate } from "./rules";
export type ReviewMessage = { text: string; step: number; field: string };
export function reviewMessages(doc: WizardDocument) {
  const target = (text: string): ReviewMessage => {
    let step = 4,
      field = "fundingNotes";
    if (/год|методик|ОСИ|адрес/.test(text)) {
      step = 0;
      field = /год|методик/.test(text)
        ? "year"
        : /адрес/.test(text)
          ? "address"
          : "organization";
    }
    if (/площад|помещен|номера/.test(text)) {
      step = 1;
      field = /повтор|номер/.test(text) ? "areas" : "declaredArea";
    }
    if (/стать|количеств|цен|выполнен|итог|расходов|Структура/.test(text)) {
      step = 2;
      field = "items-management";
      const item = doc.input.items.find(
        (i) => i.title && text.includes(`«${i.title}»`),
      );
      if (item?.group === "maintenance") step = 3;
      if (item) field = "items-" + item.group;
      if (item?.group === "savings" || item?.group === "target") step = 4;
    }
    if (/доход/.test(text)) {
      step = 4;
      field = "commercialIncome";
    }
    if (/инвентар/.test(text)) {
      step = 4;
      field = "inventoryReference";
    }
    if (/акт осмотра/.test(text)) {
      step = 4;
      field = "inspectionReference";
    }
    if (/дефект/.test(text)) {
      step = 4;
      field = "defectReference";
    }
    if (/минималь|местным/.test(text)) {
      step = 4;
      field = "minimumTerritory";
    }
    if (/актуальность/.test(text)) {
      step = 4;
      field = "pricesConfirmed";
    }
    const itemNumber = text.match(/статьи (\d+)/i);
    if (itemNumber) {
      const n = Number(itemNumber[1]),
        item = doc.input.items[n - 1];
      if (item) {
        step =
          item.group === "management"
            ? 2
            : item.group === "maintenance"
              ? 3
              : 4;
        field = /название/.test(text)
          ? `item-title-${n}`
          : /единица/.test(text)
            ? `item-unit-${n}`
            : `item-reason-${n}`;
      }
    }
    return { text, step, field };
  };
  const v = validate(doc);
  const automatic =
    /не провер|не подтверж|программно|права собствен|Виды работ|Паркинг|Накопления/;
  return {
    errors: v.errors.map(target),
    attention: v.warnings.filter((t) => !automatic.test(t)).map(target),
    unchecked: [
      ...v.warnings.filter((t) => automatic.test(t)),
      "Законность всех расходов и утверждение сметы собственниками автоматически не проверяются.",
      "Полезная площадь введена пользователем: сверки с государственными данными нет.",
    ].map(target),
  };
}
export const criticalErrors = (doc: WizardDocument) =>
  doc.kind === "estimate" ? validate(doc).errors : [];
