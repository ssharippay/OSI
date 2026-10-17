import type { WizardDocument, Validation } from "./models";
import { calculate, fixed } from "./calculation";
// Procedural references are separate from the UI. No legal adoption/quorum calculator is enabled.
export const meetingRules = {
  source: "https://adilet.zan.kz/rus/docs/V2000020283",
  scope: "Приложение 1, пункты 7–8, 11–15; приложение 2, форма 1",
  rules: [
    {
      topic: "Утверждение годовой сметы / текущих взносов",
      basis:
        "Пункт 12, подпункты 1–2: база — общее число собственников квартир и нежилых помещений.",
    },
    {
      topic: "Выбор формы управления / избрание председателя",
      basis:
        "Пункт 11: отдельные условия участия и большинства участвовавших в голосовании.",
    },
    {
      topic: "Лифт за бюджетные средства с возвратностью",
      basis: "Специальное условие пункта 12; нельзя заменять общим порогом.",
    },
  ],
  verification: "Недостаточно данных для проверки",
  note: "Мастер проверяет заполненность и арифметику. Он не устанавливает право собственности, число голосов, кворум или законность собрания и не объявляет решение принятым.",
};
export function validate(doc: WizardDocument): Validation {
  const d = doc.input;
  const errors: string[] = [];
  const warnings: string[] = [];
  if (
    doc.template.validFrom &&
    doc.kind !== "estimate" &&
    d.meetingDate &&
    d.meetingDate < doc.template.validFrom
  )
    errors.push(
      "На дату собрания эта редакция формы еще не действовала. Нужен шаблон соответствующего периода.",
    );
  if (doc.kind !== "estimate" && d.meetingDate > doc.template.checkedAt)
    warnings.push(
      "Дата собрания позже даты проверки источника. Перед оформлением повторно проверьте действующую редакцию.",
    );
  const required = (v: string, label: string) => {
    if (!v.trim()) errors.push("Заполните: " + label);
  };
  required(d.address, "адрес дома");
  if (doc.kind === "estimate") {
    required(d.organization, "наименование ОСИ");
    if (
      doc.template.validFrom &&
      /^\d{4}$/.test(d.year) &&
      d.year + "-01-01" < doc.template.validFrom
    )
      errors.push(
        "Эта методика не подтверждена для всего выбранного года. Нужен шаблон соответствующего периода.",
      );
    if (Number(d.year) > Number(doc.template.checkedAt.slice(0, 4)))
      warnings.push(
        "Смета относится к будущему году. Перед утверждением повторно проверьте нормы и местные показатели.",
      );
    if (
      !/^\d{4}$/.test(d.year) ||
      Number(d.year) < 2020 ||
      Number(d.year) > 2100
    )
      errors.push("Укажите отчетный год от 2020 до 2100.");
    const calc = calculate(d);
    errors.push(...calc.issues);
    if (calc.area === null || calc.area <= 0n)
      errors.push("Укажите положительную суммарную полезную площадь.");
    if (!d.areas.length && d.registryComplete !== false)
      errors.push("Добавьте помещения с подтвержденными площадями.");
    if (d.registryComplete === false)
      warnings.push(
        "Реестр неполный: ставка рассчитывается только по отдельно указанной полной полезной площади дома. Индивидуальные суммы доступны лишь помещениям с заполненной площадью; полный реестр начислений не сформирован.",
      );
    if (doc.copiedFrom && !d.pricesConfirmed)
      errors.push(
        "Проверьте цены и периодичность скопированной сметы и подтвердите их актуальность для нового года.",
      );
    let areaSum = 0n;
    for (const room of d.areas) {
      required(room.number, "номер помещения");
      const area = fixed(room.area, 2);
      if (area === null || area <= 0n)
        if (d.registryComplete === false && !room.area.trim())
          warnings.push(
            "В неполном реестре есть помещение без площади: его индивидуальный взнос не рассчитывается.",
          );
        else
          errors.push(
            "Площадь каждого помещения должна быть положительной, до двух знаков после запятой.",
          );
      else areaSum += area;
    }
    if (
      calc.area !== null &&
      (d.registryComplete === false
        ? areaSum > calc.area
        : areaSum !== calc.area)
    )
      errors.push(
        "Сумма площадей помещений не совпадает с указанной общей полезной площадью.",
      );
    const roomKeys = d.areas.map((r) => r.kind + ":" + r.number.trim());
    if (new Set(roomKeys).size !== roomKeys.length)
      errors.push("Есть повторяющиеся номера помещений одного типа.");
    if (!d.items.length) errors.push("Добавьте статьи расходов.");
    for (const [i, item] of d.items.entries()) {
      required(item.title, `название статьи ${i + 1}`);
      required(item.unit, `единица измерения статьи ${i + 1}`);
      required(item.reason, `обоснование статьи ${i + 1}`);
    }
    if (calc.income === null)
      errors.push(
        "Введите годовой коммерческий доход с точностью до двух знаков; если дохода нет, укажите 0.",
      );
    if (calc.income !== null && calc.income > calc.core)
      errors.push(
        "Коммерческий доход превышает текущие расходы. Требуется отдельное согласование исходных данных; отрицательный взнос не рассчитывается.",
      );
    if (calc.income !== null && calc.income > 0n)
      required(d.incomeReason, "обоснование коммерческого дохода");
    required(d.inventoryReference, "инвентарный перечень");
    required(d.inspectionReference, "акт осмотра");
    if (d.items.some((i) => i.group === "maintenance" && i.currentRepair))
      required(d.defectReference, "дефектный акт для текущего ремонта");
    warnings.push(
      "Местный минимальный размер взноса не проверен. Соответствие местным требованиям не подтверждается, даже если показатель введён вручную.",
      "Паркинг и кладовки не включены в этот расчет. Накопления и целевые сборы не прибавляются к текущему взносу.",
      "Виды работ, коммунальные расходы и фактическая необходимость проверяются по инвентарному перечню, осмотру, тарифам и дефектным актам; мастер не проверяет эти документы.",
    );
    if (
      calc.core > 0n &&
      (calc.totals.management * 100n > calc.core * 30n ||
        calc.totals.maintenance * 100n < calc.core * 70n)
    )
      warnings.push(
        "Структура расходов для ОСИ отличается от ориентиров пункта 21 методики: управление не более 30%, содержание не менее 70%. Нужна проверка перед утверждением.",
      );
  } else {
    required(d.meetingDate, "дата собрания");
    if (d.meetingDate && !/^\d{4}-\d{2}-\d{2}$/.test(d.meetingDate))
      errors.push("Проверьте дату собрания.");
    required(d.chair, "ФИО председателя собрания");
    required(d.secretary, "ФИО секретаря");
    required(d.initiator, "инициатор");
    if (!d.participants.length)
      errors.push(
        "Добавьте участников вручную. Проживание не означает право собственности.",
      );
    for (const p of d.participants) {
      required(p.name, "ФИО участника");
      if (!p.apartment.trim() && !p.nonresidential.trim())
        errors.push("Для участника укажите квартиру или нежилое помещение.");
      if (p.apartment.trim() && p.nonresidential.trim())
        errors.push(
          "Регистрация ведётся отдельно по каждому помещению: не объединяйте квартиру и нежилое помещение в одной строке.",
        );
      if (p.capacity === "Представитель") {
        required(p.authority, "документ о полномочиях представителя");
        required(p.authorityUntil, "срок полномочий представителя");
      }
    }
    warnings.push(
      "Подписи остаются пустыми. Сведения о праве собственности и полномочиях введены пользователем и программно не подтверждены.",
    );
    if (doc.kind === "protocol") {
      required(d.protocolNumber, "номер протокола");
      required(d.meetingTime, "время собрания");
      required(d.meetingPlace, "место проведения");
      required(
        d.invited,
        "приглашенные лица (или явно укажите, что отсутствуют)",
      );
      required(d.speakers, "выступившие лица");
      required(
        d.votingSummary,
        "итоги голосования, сформулированные пользователем",
      );
      required(d.attachments, "перечень и оформление приложений");
      const integer = (v: string) => /^\d{1,7}$/.test(v);
      for (const [v, label] of [
        [d.apartmentOwners, "число собственников квартир"],
        [d.nonresidentialOwners, "число собственников нежилых помещений"],
        [d.participantsCount, "количество участвующих"],
      ])
        if (!integer(v))
          errors.push("Укажите целое неотрицательное число: " + label + ".");
      if (
        integer(d.participantsCount) &&
        Number(d.participantsCount) !== d.participants.length
      )
        warnings.push(
          "Количество участвующих не совпадает с числом строк регистрации. Проверьте регистрацию по каждому помещению; мастер не выводит число голосов из этих строк.",
        );
      if (!d.questions.length) errors.push("Добавьте вопросы повестки.");
      for (const [i, q] of d.questions.entries()) {
        required(q.text, `вопрос №${i + 1}`);
        required(q.topic, `предмет вопроса №${i + 1}`);
        required(q.decision, `введенное решение по вопросу №${i + 1}`);
        required(
          q.sheetReference,
          `отдельный лист голосования по вопросу №${i + 1}`,
        );
        for (const k of [
          "paperFor",
          "paperAgainst",
          "paperAbstain",
          "digitalFor",
          "digitalAgainst",
          "digitalAbstain",
        ] as const)
          if (!integer(q[k]))
            errors.push(
              `Вопрос №${i + 1}: заполните все шесть результатов целыми числами; при отсутствии голосов введите 0 самостоятельно.`,
            );
      }
      warnings.push(
        meetingRules.verification + ". " + meetingRules.note,
        "Голосование по разным вопросам имеет разные условия. Никакое число квартир или строк регистрации автоматически не считается числом голосов.",
        "Листы голосования на каждый вопрос — неотъемлемая часть протокола; предусмотрены прошивка и нумерация (п.15). Поля подписи нельзя заменить введенными итогами.",
      );
    }
  }
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}
export function voteArithmetic(q: import("./models").Question) {
  const values = [
    q.paperFor,
    q.paperAgainst,
    q.paperAbstain,
    q.digitalFor,
    q.digitalAgainst,
    q.digitalAbstain,
  ];
  if (!values.every((v) => /^\d{1,7}$/.test(v))) return null;
  const n = values.map(Number);
  return {
    paper: n[0] + n[1] + n[2],
    digital: n[3] + n[4] + n[5],
    total: n.reduce((a, b) => a + b, 0),
  };
}
