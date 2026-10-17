import type {
  WizardDocument,
  WizardInput,
  Template,
  FormBlock,
  Participant,
} from "./models";
import { uid, stamp } from "../utils";
import { calculate, decimal } from "./calculation";
import { templates, votingAttachment } from "./registry";
const p = (text: string): FormBlock => ({ type: "paragraph", text });
const h = (text: string, level = 2): FormBlock => ({
  type: "heading",
  text,
  level,
});
const table = (headers: string[], rows: string[][]): FormBlock => ({
  type: "table",
  headers,
  rows,
  ...(headers[0] === "Статья"
    ? { columnWidths: [28, 7, 7, 9, 10, 13, 26] }
    : {}),
});
const page = (): FormBlock => ({ type: "pageBreak" });
const v = (s: string) => s.trim() || "________________";
export const newArea = () => ({
  id: uid(),
  number: "",
  kind: "Квартира" as const,
  area: "",
});
export const newItem = () => ({
  id: uid(),
  title: "",
  group: "maintenance" as const,
  quantity: "",
  unit: "",
  price: "",
  frequency: "",
  reason: "",
});
export const newParticipant = (): Participant => ({
  id: uid(),
  name: "",
  apartment: "",
  nonresidential: "",
  capacity: "Собственник",
  authority: "",
  authorityUntil: "",
  contact: "",
});
export const newQuestion = () => ({
  id: uid(),
  text: "",
  topic: "",
  paperFor: "",
  paperAgainst: "",
  paperAbstain: "",
  digitalFor: "",
  digitalAgainst: "",
  digitalAbstain: "",
  decision: "",
  sheetReference: "",
});
export function initialInput(
  address: string,
  organization: string,
): WizardInput {
  return {
    address,
    organization,
    year: String(new Date().getFullYear()),
    declaredArea: "",
    areas: [],
    items: [],
    commercialIncome: "",
    incomeReason: "",
    minimumTerritory: "Павлодар",
    minimumSource: "",
    minimumFrom: "",
    minimumTo: "",
    minimumValue: "",
    inventoryReference: "",
    inspectionReference: "",
    defectReference: "",
    fundingNotes: "",
    protocolNumber: "",
    meetingDate: "",
    meetingTime: "",
    meetingPlace: "",
    initiator: "",
    format: "Явочный формат",
    apartmentOwners: "",
    nonresidentialOwners: "",
    participantsCount: "",
    participants: [],
    invited: "",
    speakers: "",
    chair: "",
    secretary: "",
    questions: [],
    votingSummary: "",
    attachments: "",
  };
}
export function createWizard(
  template: Template,
  houseId: string,
  address: string,
  organization: string,
): WizardDocument {
  if (
    !template.implemented ||
    !template.kind ||
    template.verification !== "verified"
  )
    throw new Error("Этот шаблон пока недоступен для формирования.");
  const now = stamp();
  const doc: WizardDocument = {
    id: uid(),
    formatVersion: 1,
    houseId,
    title: template.title,
    kind: template.kind,
    status: "Черновик",
    publication: "Не опубликован",
    createdAt: now,
    updatedAt: now,
    version: 1,
    step: 0,
    ...(template.kind === "protocol"
      ? {
          attachmentTemplates: {
            registration: structuredClone(
              templates.find((t) => t.id === "registration-v1")!,
            ),
            voting: structuredClone(votingAttachment),
          },
        }
      : {}),
    input: initialInput(address, organization),
    template: structuredClone(template),
    blocks: [],
  };
  doc.blocks = renderForm(doc);
  return doc;
}
function signature(role: string, name: string) {
  return p(
    `${role} ${v(name)}  __________________\n(фамилия, имя, отчество (при его наличии) (подпись)`,
  );
}
function registration(d: WizardInput, template: Template) {
  const labels = template.headings;
  const rows = d.participants.map((x, i) => [
    String(i + 1),
    x.name,
    x.apartment,
    x.nonresidential,
    "",
  ]);
  if (!rows.length)
    rows.push(
      ...Array.from({ length: 3 }, (_, i) => [String(i + 1), "", "", "", ""]),
    );
  return [
    h(
      "Приложение 7 к Правилам принятия решений по управлению объектом кондоминиума",
      3,
    ),
    h(labels[0], 1),
    p(v(d.meetingDate)),
    p(labels[1] + " " + v(d.address)),
    { ...table(labels.slice(2, 7), rows), columnWidths: [6, 42, 15, 17, 20] },
    signature(labels[7], d.chair),
    signature(labels[8], d.secretary),
    signature(labels[9], d.initiator),
  ];
}
export function renderForm(doc: WizardDocument): FormBlock[] {
  const d = doc.input;
  const labels = doc.template.headings;
  if (doc.kind === "registration") return registration(d, doc.template);
  if (doc.kind === "estimate") {
    const c = calculate(d);
    let blocks: FormBlock[] = [
      h(labels[0], 1),
      p(`${d.organization}\n${d.address}\nГод: ${d.year}`),
      h(labels[1]),
      table(
        ["Вид помещения", "Номер", "Полезная площадь, м²"],
        d.areas.map((r) => [r.kind, r.number, r.area]),
      ),
      p("Общая полезная площадь: " + v(d.declaredArea) + " м²"),
    ];
    for (const [index, group] of (
      ["management", "maintenance", "savings", "target"] as const
    ).entries()) {
      blocks.push(
        h(labels[index + 2]),
        table(
          [
            "Статья",
            "Количество",
            "Ед.",
            "Цена, ₸",
            "Выполнений в год",
            "Годовая сумма, ₸",
            "Обоснование",
          ],
          d.items
            .filter((item) => item.group === group)
            .map((item) => {
              const cents = c.lines.find((line) => line.id === item.id)?.cents;
              return [
                item.title,
                item.quantity,
                item.unit,
                item.price,
                item.frequency,
                cents !== null && cents !== undefined
                  ? decimal(cents)
                  : "Не рассчитано",
                item.reason,
              ];
            }),
        ),
        p("Итого по разделу: " + decimal(c.totals[group]) + " ₸"),
      );
    }
    blocks.push(
      h(labels[6]),
      p(
        "Годовой коммерческий доход: " +
          v(d.commercialIncome) +
          " ₸\nОбоснование: " +
          v(d.incomeReason) +
          "\n" +
          d.fundingNotes,
      ),
      h(labels[7]),
      p(
        "Пункты 10–11 методики: В = (Р − Д) / (S × 12), Р = расходы на управление без содержания + содержание. Накопления и целевые сборы в Р не включены.",
      ),
      p(
        "Текущие расходы Р: " +
          decimal(c.core) +
          " ₸\nРасчетный В, ₸/м² в месяц: " +
          (c.rateSix || "Недостаточно данных для расчета"),
      ),
      table(
        [
          "Вид помещения",
          "Номер",
          "Площадь, м²",
          "Расчетный текущий взнос в месяц, ₸",
        ],
        c.charges.map((r) => [r.kind, r.number, r.area, r.monthly]),
      ),
    );
    return blocks;
  }
  const blocks: FormBlock[] = [
    h("Приложение 2 к приказу от 30 марта 2020 года № 163", 3),
    h("Форма-1", 3),
    h(`${labels[0]} ${v(d.protocolNumber)} ${labels[1]} ${v(d.initiator)}`, 1),
    p(`время ${v(d.meetingTime)}  ${v(d.meetingDate)}`),
    p(labels[2] + " " + v(d.address)),
    p(labels[3] + " " + v(d.apartmentOwners)),
    p(labels[4] + " " + v(d.nonresidentialOwners)),
    p(labels[5] + " " + v(d.participantsCount)),
    p(labels[6] + " " + v(d.invited)),
    p(labels[7] + " " + d.format),
    h(labels[8]),
    ...d.questions.map((q, i) => p(`${i + 1}. ${v(q.text)}`)),
    p(labels[9] + " " + v(d.speakers)),
    h(labels[10]),
    p(labels[11]),
  ];
  for (const [i, q] of d.questions.entries())
    blocks.push(
      p(`${i + 1}. ${v(q.text)}`),
      p(labels[12]),
      p(
        `За ${v(q.paperFor)}  Против ${v(q.paperAgainst)}  Воздержался ${v(q.paperAbstain)}`,
      ),
      p(labels[13]),
      p(
        `За ${v(q.digitalFor)}  Против ${v(q.digitalAgainst)}  Воздержался ${v(q.digitalAbstain)}`,
      ),
    );
  blocks.push(
    p(labels[14] + " " + v(d.votingSummary)),
    h(labels[15]),
    ...d.questions.map((q, i) => p(`${i + 1}. ${v(q.decision)}`)),
    signature(labels[16], d.chair),
    signature(labels[17], d.secretary),
    signature(labels[18], d.initiator),
  );
  const reg = doc.attachmentTemplates?.registration;
  const voting = doc.attachmentTemplates?.voting;
  if (!reg || !voting)
    throw new Error(
      "Снимок приложений шаблона отсутствует. Нельзя подставить другую версию.",
    );
  blocks.push(page(), ...registration(d, reg));
  for (const q of d.questions) {
    blocks.push(
      page(),
      h(voting.annex, 3),
      h(voting.title, 1),
      p(`${v(d.meetingDate)} время ${v(d.meetingTime)}`),
      p(
        "Место нахождение многоквартирного жилого дома: " +
          v(d.address) +
          " (адрес)",
      ),
      p("Вопрос внесенный для обсуждения: " + v(q.text)),
      {
        ...table(
          voting.headers,
          d.participants.length
            ? d.participants.map((x, i) => [
                String(i + 1),
                x.name,
                x.contact,
                x.apartment,
                x.nonresidential,
                "",
                "",
                "",
              ])
            : Array.from({ length: 3 }, (_, i) => [
                String(i + 1),
                "",
                "",
                "",
                "",
                "",
                "",
                "",
              ]),
        ),
        headerGroup: { label: "Голосую", from: 5, span: 3 },
        columnWidths: [5, 22, 22, 8, 10, 11, 11, 11],
      },
      signature("Председатель собрания:", d.chair),
      signature("Секретарь собрания:", d.secretary),
      signature("Инициатор (ы) собрания:", d.initiator),
      p(
        "* при голосовании посредством объектов информатизации в сфере жилищных отношений и жилищно-коммунального хозяйства не требуется и исключается.",
      ),
    );
  }
  return blocks;
}
export function accompanying(doc: WizardDocument): FormBlock[] {
  const d = doc.input;
  return [
    h("Сопроводительный лист — служебная информация", 1),
    p(
      "Сформирован проект. Проверьте сведения и выполните предусмотренную процедуру подписания или утверждения.",
    ),
    p(
      `${doc.template.status}. Шаблон: ${doc.template.title}; версия ${doc.template.version}. Проверен ${doc.template.checkedAt}.\nОснование: ${doc.template.act}; ${doc.template.annex}\n${doc.template.url}`,
    ),
    p(
      doc.dataMode === "work"
        ? "Сведения введены пользователем. Подписи, право собственности и решения не удостоверены приложением."
        : "Все сведения демонстрационные. Подписи, право собственности и решения не удостоверены приложением.",
    ),
    ...(doc.kind === "estimate"
      ? [
          p(
            `Составитель: ${d.preparer || "не указан"}. Это не подпись. Реестр: ${d.registryComplete === false ? "неполный; ставка использует отдельно введенную полную полезную площадь. Индивидуальные суммы только по известным площадям." : "полный по сведениям пользователя"}`,
          ),
          p(
            "Инвентарный перечень: " +
              v(d.inventoryReference) +
              "\nАкт осмотра: " +
              v(d.inspectionReference) +
              "\nДефектный акт: " +
              v(d.defectReference),
          ),
          p(
            `Местный минимум: не проверен. Введено пользователем: ${d.minimumValue || "нет значения"}; территория ${d.minimumTerritory}; источник ${d.minimumSource || "не указан"}; период ${d.minimumFrom || "не указан"} — ${d.minimumTo || "не указан"}. Соответствие местным требованиям не подтверждено.`,
          ),
        ]
      : [
          p("Место проведения собрания: " + v(d.meetingPlace)),
          p("Приложения и сведения об оформлении: " + v(d.attachments)),
          table(
            [
              "Участник / помещение",
              "Статус по введенным сведениям",
              "Документ и срок полномочий",
            ],
            d.participants.map((x) => [
              x.name + " / " + (x.apartment || x.nonresidential),
              x.capacity,
              x.authority + (x.authorityUntil ? " / " + x.authorityUntil : ""),
            ]),
          ),
        ]),
  ];
}
export function plainText(blocks: FormBlock[]) {
  return blocks
    .map((b) =>
      b.type === "pageBreak"
        ? "\n\n"
        : b.type === "table"
          ? [
              b.headerGroup?.label || "",
              b.headers?.join(" | "),
              ...b.rows!.map((r) => r.join(" | ")),
            ].join("\n")
          : b.text || "",
    )
    .join("\n\n");
}
