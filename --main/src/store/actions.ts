import type { Context, Doc, State, Ticket } from "../models";
import { isChair, visibleDocs, visibleTickets } from "./selectors";
import { stamp, uid } from "../utils";
export function chairOnly(s: State, c: Context) {
  if (!isChair(s, c))
    throw new Error("Это действие доступно только председателю текущего дома.");
}
export function saveDoc(
  s: State,
  c: Context,
  input: Pick<Doc, "title" | "body" | "audience">,
  id?: string,
  report?: Doc["report"],
) {
  chairOnly(s, c);
  const now = stamp();
  let doc = id ? visibleDocs(s, c).find((d) => d.id === id) : undefined;
  if (id && !doc) throw new Error("Документ недоступен.");
  if (doc?.wizardSource)
    throw new Error(
      "Копию жителей изменяйте через мастер, сохраняя связь с оригиналом.",
    );
  if (doc) {
    Object.assign(doc, input, {
      status: "Черновик",
      updatedAt: now,
      version: doc.version + 1,
    });
  } else {
    s.docs.unshift({
      id: uid(),
      houseId: c.houseId,
      ...input,
      status: "Черновик",
      createdAt: now,
      updatedAt: now,
      version: 1,
      ...(report ? { report: structuredClone(report) } : {}),
    });
  }
}
export function documentStatus(
  s: State,
  c: Context,
  id: string,
  status: Doc["status"],
  expectedVersion: number,
) {
  chairOnly(s, c);
  const d = visibleDocs(s, c).find((d) => d.id === id);
  if (!d) throw new Error("Документ недоступен.");
  if (d.version !== expectedVersion)
    throw new Error(
      "Документ изменён в другой вкладке. Откройте его заново перед подтверждением.",
    );
  d.status = status;
  d.updatedAt = stamp();
  d.version++;
}
export function updateTicket(
  s: State,
  c: Context,
  id: string,
  fields: Pick<Ticket, "status" | "dueDate" | "assignee" | "result">,
) {
  chairOnly(s, c);
  const t = visibleTickets(s, c).find((t) => t.id === id);
  if (!t) throw new Error("Обращение недоступно.");
  if (fields.status === "Выполнено" && !fields.result.trim())
    throw new Error("Для закрытия опишите результат выполнения.");
  const old = t.status;
  const changed =
    t.dueDate !== fields.dueDate ||
    t.assignee !== fields.assignee ||
    t.result !== fields.result;
  Object.assign(t, fields);
  if (old !== fields.status)
    t.history.push({
      date: stamp(),
      text: `Статус: ${old} → ${fields.status}${fields.status === "Выполнено" ? ". Результат: " + fields.result : ""}`,
    });
  if (changed)
    t.history.push({
      date: stamp(),
      text: `Уточнены срок: ${fields.dueDate || "не назначен"}, исполнитель: ${fields.assignee || "не назначен"}, результат: ${fields.result || "пока не указан"}`,
    });
}
export function sendMessage(s: State, c: Context, id: string, text: string) {
  const t = visibleTickets(s, c).find((t) => t.id === id);
  if (!t) throw new Error("Обращение недоступно.");
  if (!text.trim()) throw new Error("Напишите сообщение.");
  t.messages.push({
    id: uid(),
    date: stamp(),
    userId: c.userId,
    text: text.trim(),
  });
}
export function reopen(s: State, c: Context, id: string, reason: string) {
  const t = visibleTickets(s, c).find((t) => t.id === id);
  if (!t || t.ownerId !== c.userId || t.status !== "Выполнено")
    throw new Error("Вернуть можно только своё выполненное обращение.");
  if (!reason.trim()) throw new Error("Опишите, что осталось нерешённым.");
  t.status = "В работе";
  t.history.push({
    date: stamp(),
    text: "Житель сообщил, что проблема не устранена. Обращение возвращено в работу.",
  });
  sendMessage(s, c, id, reason);
}
export function saveWork(
  s: State,
  c: Context,
  input: Omit<State["works"][number], "id" | "houseId" | "updatedAt">,
  id?: string,
  expectedUpdatedAt?: string,
) {
  chairOnly(s, c);
  if (!input.title.trim() || !input.body.trim())
    throw new Error("Заполните название и описание.");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.date) ||
    ![input.planned, input.actual].every(
      (n) => Number.isFinite(n) && n >= 0 && n <= 1e9,
    )
  )
    throw new Error("Проверьте дату и суммы.");
  if (input.doc && !visibleDocs(s, c).some((d) => d.id === input.doc))
    throw new Error("Документ-основание недоступен.");
  const old = id
    ? s.works.find((w) => w.id === id && w.houseId === c.houseId)
    : undefined;
  if (id && !old) throw new Error("Работа недоступна.");
  if (old && old.updatedAt !== expectedUpdatedAt)
    throw new Error("Работа изменена в другой вкладке. Откройте её заново.");
  if (old) Object.assign(old, input, { updatedAt: stamp() });
  else
    s.works.unshift({
      ...input,
      id: uid(),
      houseId: c.houseId,
      updatedAt: stamp(),
    });
}
