import type { State, Ticket, Doc } from "../models";
import { stamp, today } from "../utils";
import { legacySeed } from "./legacy";
function entities() {
  return {
    houses: [
      {
        id: "h1",
        name: "ОСИ «Ертіс үйі»",
        address: "Павлодар, ул. Ынтымақ, 24",
      },
      { id: "h2", name: "ОСИ «Самал»", address: "Павлодар, ул. Достық, 18" },
    ],
    users: [
      { id: "u1", name: "Данияр Каримов" },
      { id: "u2", name: "Айдана Садыкова" },
      { id: "u3", name: "Алия Омарова" },
      { id: "u4", name: "Ерлан Алимов" },
    ],
    premises: [
      { id: "p1", houseId: "h1", number: "24" },
      { id: "p2", houseId: "h1", number: "17" },
      { id: "p3", houseId: "h2", number: "8" },
    ],
    memberships: [
      {
        id: "m1",
        userId: "u1",
        houseId: "h1",
        role: "resident" as const,
        premiseId: "p1",
      },
      { id: "m2", userId: "u2", houseId: "h1", role: "chair" as const },
      {
        id: "m3",
        userId: "u3",
        houseId: "h1",
        role: "resident" as const,
        premiseId: "p2",
      },
      {
        id: "m4",
        userId: "u4",
        houseId: "h2",
        role: "resident" as const,
        premiseId: "p3",
      },
      { id: "m5", userId: "u2", houseId: "h2", role: "chair" as const },
    ],
  };
}
// Legacy values are retained, including original IDs and unstructured dates/text.
export function migrate(raw: unknown): State {
  if (!raw || typeof raw !== "object")
    throw new Error(
      "Не удалось прочитать сохранённые данные. Исходные данные не изменены.",
    );
  const old = raw as Record<string, any>;
  if (old.wizardDataVersion !== undefined && old.wizardDataVersion !== 2)
    throw new Error(
      "Версия данных мастера не поддерживается. Исходные данные не изменены.",
    );
  if (old.schemaVersion === 2) {
    if (
      old.wizardDocuments !== undefined &&
      (!Array.isArray(old.wizardDocuments) ||
        old.wizardDocuments.some(
          (d: { formatVersion?: number }) => d.formatVersion !== 1,
        ))
    )
      throw new Error(
        "Версия данных Мастера документов не поддерживается. Исходные данные не изменены.",
      );
    if (
      ![
        "houses",
        "users",
        "premises",
        "memberships",
        "tickets",
        "docs",
        "works",
        "announcements",
        "events",
      ].every((k) => Array.isArray(old[k]))
    )
      throw new Error(
        "Формат данных повреждён. Автоматический сброс не выполнен.",
      );
    if (old.wizardDataVersion === 2) return old as State;
    // Additive module migration: preserve frozen forms, IDs, all input and publications.
    return {
      ...old,
      wizardDataVersion: 2,
      wizardDocuments: old.wizardDocuments?.map(
        (d: import("../wizard/models").WizardDocument) =>
          d.kind === "estimate"
            ? { ...d, step: [0, 1, 2, 4, 5, 6][d.step] ?? 0 }
            : d,
      ),
    } as State;
  }
  if (old.schemaVersion !== undefined && old.schemaVersion !== 1)
    throw new Error(
      "Данные созданы другой версией приложения. Автоматический сброс не выполнен.",
    );
  if (
    !["tickets", "docs", "works", "announcements", "events"].every((k) =>
      Array.isArray(old[k]),
    )
  )
    throw new Error(
      "Старые данные повреждены. Автоматический сброс не выполнен.",
    );
  const now = stamp();
  const base = entities();
  const extraUsers: State["users"] = [];
  const extraMemberships: State["memberships"] = [];
  const tickets: Ticket[] = old.tickets.map((t: any) => {
    let ownerId =
      t.owner === "resident"
        ? "u1"
        : t.owner === "other"
          ? "u3"
          : `legacy-${String(t.owner || t.id)}`;
    if (
      !["u1", "u3"].includes(ownerId) &&
      !extraUsers.some((u) => u.id === ownerId)
    ) {
      extraUsers.push({
        id: ownerId,
        name: "Сохранённый пользователь " + String(t.owner || t.id),
      });
      extraMemberships.push({
        id: "m-" + ownerId,
        userId: ownerId,
        houseId: "h1",
        role: "resident",
      });
    }
    return {
      ...t,
      houseId: "h1",
      ownerId,
      createdAt: t.createdAt || t.history?.[0]?.date || now,
      location: t.location || "",
      dueDate: t.dueDate || "",
      assignee: t.assignee || "",
      result: t.result || "",
      history: (t.history || []).map((h: any) => ({
        ...h,
        text: String(h.text).split(" · ")[0],
      })),
      messages: (t.history || [])
        .filter((h: any) => String(h.text).includes(" · "))
        .map((h: any, i: number) => ({
          id: t.id + "-legacy-" + i,
          date: h.date,
          userId: "u2",
          text: String(h.text).split(" · ").slice(1).join(" · "),
        })),
    };
  });
  const docs: Doc[] = old.docs.map((d: any) => ({
    ...d,
    houseId: "h1",
    status:
      /^d[1-5]$/.test(d.id) && !/^Проект отч[её]та/i.test(d.title)
        ? "Опубликован"
        : "Черновик",
    audience: "residents",
    createdAt: now,
    updatedAt: now,
    version: 1,
  }));
  return addSecondHouseDemo({
    schemaVersion: 2,
    wizardDataVersion: 2,
    ...base,
    users: [...base.users, ...extraUsers],
    memberships: [...base.memberships, ...extraMemberships],
    tickets,
    docs,
    works: old.works.map((w: any) => ({
      ...w,
      houseId: "h1",
      updatedAt: w.updatedAt || now,
    })),
    announcements: old.announcements.map((a: any) => ({ ...a, houseId: "h1" })),
    events: old.events.map((e: any) => ({ ...e, houseId: "h1", userId: "u2" })),
  });
}
export function seed(): State {
  return migrate(legacySeed());
}
function addSecondHouseDemo(s: State): State {
  const unique = (preferred: string, rows: { id: string }[]) => {
    let id = preferred;
    while (rows.some((row) => row.id === id)) id += "-demo";
    return id;
  };
  const ticketId = unique("t-h2", s.tickets),
    docId = unique("d-h2", s.docs),
    workId = unique("w-h2", s.works),
    announcementId = unique("a-h2", s.announcements);
  const now = stamp();
  s.tickets.push({
    id: ticketId,
    houseId: "h2",
    ownerId: "u4",
    subject: "Проверить насос в подвале",
    category: "Водоснабжение",
    body: "В подвале слышен шум насоса.",
    status: "Новое",
    createdAt: now,
    location: "Подвал",
    dueDate: "",
    assignee: "",
    result: "",
    history: [{ date: now, text: "Новое обращение" }],
    messages: [],
  });
  s.docs.push({
    id: docId,
    houseId: "h2",
    title: "План работ ОСИ «Самал»",
    body: "Только для демонстрационного дома «Самал»: проверка насоса и уборка двора.",
    status: "Опубликован",
    audience: "residents",
    createdAt: now,
    updatedAt: now,
    version: 1,
  });
  s.works.push({
    id: workId,
    houseId: "h2",
    title: "Обслуживание насоса",
    body: "Проверка насоса в доме «Самал»",
    planned: 20000,
    actual: 5000,
    date: today(),
    status: "В работе",
    doc: docId,
    result: "Проведена диагностика",
    updatedAt: now,
  });
  s.announcements.push({
    id: announcementId,
    houseId: "h2",
    title: "Проверка насоса",
    body: "В доме «Самал» проведём плановое обслуживание насоса.",
    date: today(),
    important: true,
  });
  return s;
}
