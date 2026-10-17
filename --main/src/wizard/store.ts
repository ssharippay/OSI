import type { Context, State } from "../models";
import type { WizardDocument, WizardInput } from "./models";
import { isChair } from "../store/selectors";
import { chairOnly } from "../store/actions";
import { stamp, uid } from "../utils";
import { renderForm } from "./engine";
import { validate } from "./rules";
import { calculate, decimal, groups } from "./calculation";
export const wizardDocuments = (s: State, c: Context) =>
  isChair(s, c)
    ? (s.wizardDocuments || []).filter((d) => d.houseId === c.houseId)
    : [];
export function saveWizard(
  s: State,
  c: Context,
  doc: WizardDocument,
  expectedVersion?: number,
) {
  chairOnly(s, c);
  if (!doc.title.trim()) throw new Error("Заполните название проекта.");
  if (doc.houseId !== c.houseId)
    throw new Error("Документ другого дома недоступен.");
  if (doc.formatVersion !== 1)
    throw new Error("Версия мастера не поддерживается.");
  const docs = s.wizardDocuments || [];
  const old = docs.find((d) => d.id === doc.id);
  if (old && (old.version !== expectedVersion || old.revision !== doc.revision))
    throw new Error(
      "Документ изменен в другой вкладке. Откройте сохраненную версию перед продолжением.",
    );
  if (doc.status === "Подготовлен для проверки" && validate(doc).errors.length)
    throw new Error(
      "Заполните обязательные поля перед подготовкой для проверки.",
    );
  const copy = structuredClone(doc);
  copy.blocks = renderForm(copy);
  copy.updatedAt = stamp();
  copy.version = old ? old.version + 1 : 1;
  copy.revision = uid();
  copy.publishedCopies = structuredClone(
    old?.publishedCopies || doc.publishedCopies || [],
  );
  copy.publicDocumentId = old?.publicDocumentId;
  copy.publication = old?.publication || "Не опубликован";
  if (
    old?.publicDocumentId &&
    !copy.publishedCopies.some((p) => p.documentId === old.publicDocumentId)
  ) {
    const legacyCopy = s.docs.find((d) => d.id === old.publicDocumentId);
    if (legacyCopy)
      copy.publishedCopies.push({
        documentId: legacyCopy.id,
        sourceVersion: old.version,
        text: legacyCopy.body,
        publishedAt: legacyCopy.createdAt,
      });
  }
  if (
    old?.publicDocumentId &&
    (JSON.stringify(old.input) !== JSON.stringify(copy.input) ||
      old.title !== copy.title)
  ) {
    const publicDoc = s.docs.find((d) => d.id === old.publicDocumentId);
    if (publicDoc) {
      publicDoc.wizardSource = {
        id: old.id,
        version: publicDoc.wizardSource?.version ?? old.version,
        needsUpdate: true,
      };
      copy.publication = "Требует обновления";
    }
  }
  if (old) docs[docs.findIndex((d) => d.id === doc.id)] = copy;
  else docs.unshift(copy);
  s.wizardDocuments = docs;
  return copy;
}
export function publicSummary(doc: WizardDocument) {
  const d = doc.input;
  const common = `Информационная копия проекта «${doc.template.title}»\nДом выбранного демонстрационного профиля\nВерсия документа: ${doc.version}. Версия шаблона: ${doc.template.version}.\nПубликация не означает подписание, утверждение сметы или принятие решения.\n`;
  if (doc.kind === "estimate") {
    const c = calculate(d);
    return (
      common +
      `Год: ${d.year}\n${Object.entries(groups)
        .map(
          ([key, label]) =>
            label +
            ": " +
            decimal(c.totals[key as keyof typeof c.totals]) +
            " ₸",
        )
        .join(
          "\n",
        )}\nТекущие расходы (управление + содержание): ${decimal(c.core)} ₸.\nДетальные строки, обоснования, помещения и персональные сведения в копию не включены.`
    );
  }
  return (
    common +
    `Дата собрания: ${d.meetingDate}\nКоличество строк регистрации: ${d.participants.length}. Это не подтвержденное число голосов.\n${doc.kind === "protocol" ? `Вопросов повестки: ${d.questions.length}.\nРезультаты голосования и решения в этой информационной копии не воспроизводятся.\n` : ""}ФИО, контакты, сведения о полномочиях, подписи и приложения исключены. Для ознакомления с полным проектом обратитесь к председателю.`
  );
}
// A draft for manual review, NOT automatic anonymisation. No participant data is read here.
export function residentProposal(doc: WizardDocument) {
  let text = publicSummary(doc);
  if (doc.kind === "protocol") {
    text =
      `Копия для жителей: собрание ${doc.input.meetingDate}\nТема: вопросы управления домом\n` +
      doc.input.questions
        .map(
          (q, i) =>
            `Вопрос ${i + 1}: ${q.text}\nРешение (введено пользователем): ${q.decision}\nБумага: за ${q.paperFor}, против ${q.paperAgainst}, воздержались ${q.paperAbstain}. Цифровые: за ${q.digitalFor}, против ${q.digitalAgainst}, воздержались ${q.digitalAbstain}.`,
        )
        .join("\n\n") +
      "\n\nПубликация не означает подписание, утверждение или признание решений юридически действительными.";
  } else if (doc.kind === "estimate") {
    text +=
      "\n\nРаботы и расходы:\n" +
      doc.input.items
        .map(
          (i) =>
            `${i.title}: ${decimal(calculate(doc.input).lines.find((l) => l.id === i.id)?.cents || 0n)} ₸ в год.`,
        )
        .join("\n");
  }
  return text;
}
export function publishWizardCopy(
  s: State,
  c: Context,
  id: string,
  expectedVersion: number,
  confirmed: boolean,
  preparedText?: string,
) {
  chairOnly(s, c);
  if (!confirmed) throw new Error("Подтвердите проверку публикуемой копии.");
  const doc = wizardDocuments(s, c).find((d) => d.id === id);
  if (!doc || doc.version !== expectedVersion)
    throw new Error("Версия документа изменилась. Повторите просмотр.");
  if (doc.status !== "Подготовлен для проверки")
    throw new Error("Сначала подготовьте проект для проверки.");
  if (
    doc.publication === "Опубликована информационная копия" &&
    preparedText === undefined
  )
    throw new Error("Информационная копия этой версии уже опубликована.");
  const text =
    preparedText === undefined ? publicSummary(doc) : preparedText.trim();
  if (!text) throw new Error("Подготовьте текст копии для жителей.");
  if (text.length > 50000)
    throw new Error("Текст копии слишком длинный (не более 50 000 знаков).");
  if (doc.publicDocumentId) {
    const oldCopy = s.docs.find((d) => d.id === doc.publicDocumentId);
    if (oldCopy) {
      oldCopy.status = "Архив";
      oldCopy.updatedAt = stamp();
      oldCopy.version++;
    }
  }
  const now = stamp(),
    publicId = uid();
  s.docs.unshift({
    id: publicId,
    houseId: c.houseId,
    title: "Информационная копия: " + doc.template.title,
    body: text,
    wizardSource: { id: doc.id, version: doc.version, needsUpdate: false },
    audience: "residents",
    status: "Опубликован",
    createdAt: now,
    updatedAt: now,
    version: 1,
  });
  doc.publishedCopies = [
    ...(doc.publishedCopies || []),
    {
      documentId: publicId,
      sourceVersion: doc.version,
      text,
      publishedAt: now,
    },
  ];
  doc.publication = "Опубликована информационная копия";
  doc.publicDocumentId = publicId;
  doc.updatedAt = now;
}
export function archiveWizard(
  s: State,
  c: Context,
  id: string,
  version: number,
) {
  chairOnly(s, c);
  const doc = wizardDocuments(s, c).find((d) => d.id === id);
  if (!doc || doc.version !== version)
    throw new Error("Документ изменен или недоступен.");
  doc.status = "Архив";
  doc.updatedAt = stamp();
  doc.version++;
  if (doc.publicDocumentId) {
    const copy = s.docs.find((d) => d.id === doc.publicDocumentId);
    if (copy) {
      copy.status = "Архив";
      copy.updatedAt = stamp();
      copy.version++;
    }
  }
  doc.publication = "Не опубликован";
  doc.publicDocumentId = undefined;
  return doc;
}
export function updateInput(doc: WizardDocument, input: WizardInput) {
  return {
    ...doc,
    input: structuredClone(input),
    status: "Черновик" as const,
    blocks: renderForm({ ...doc, input }),
  };
}
