import { describe, it, expect, vi, afterEach } from "vitest";
import { seed, migrate } from "./store/migration";
import { legacySeed } from "./store/legacy";
import { totals, snapshot, reportText } from "./reports";
import { demoAI } from "./assistant";
import {
  visibleDocs,
  visibleTickets,
  overdue,
  accessibleHouses,
} from "./store/selectors";
import {
  saveDoc,
  documentStatus,
  saveWork,
  updateTicket,
  reopen,
  sendMessage,
} from "./store/actions";
import { month, today } from "./utils";
import { localAdapter, STORAGE_KEY, BACKUP_KEY } from "./store";
import type { Context } from "./models";
const resident = (): Context => ({
  userId: "u1",
  houseId: "h1",
  month: month(),
});
const chair = (): Context => ({ ...resident(), userId: "u2" });
describe("Расчеты и локальный помощник — прежние сценарии", () => {
  it("разделяет план и расход и исключает другие месяцы", () => {
    const s = seed();
    const c = chair();
    expect(totals(s, c)).toMatchObject({ planned: 250000, actual: 117000 });
    s.works.push({ ...s.works[0], id: "new", planned: 6000, actual: 4000 });
    expect(totals(s, c).actual).toBe(121000);
    s.works.push({ ...s.works[0], id: "old", date: "2001-01-01" });
    expect(totals(s, c).actual).toBe(121000);
    expect(reportText(snapshot(s, c))).toContain("121");
  });
  it("показывает только свои обращения и актуальный результат", () => {
    const s = seed();
    expect(
      demoAI.answer("Что с моей заявкой?", s, resident()).text,
    ).not.toContain("Доводчик");
    updateTicket(s, chair(), "t1", {
      status: "Выполнено",
      dueDate: "",
      assignee: "Электрик",
      result: "Свет восстановлен",
    });
    expect(
      demoAI.answer("Что сделано по моему обращению?", s, resident()).text,
    ).toContain("Свет восстановлен");
    expect(
      demoAI.answer("Какие обращения еще не выполнены?", s, chair()).text,
    ).toContain("Доводчик");
  });
  it("отвечает по текущим расходам, не изменяя записи", () => {
    const s = seed();
    s.works.push({
      ...s.works[0],
      id: "extra",
      title: "Ремонт крыши",
      planned: 1500,
      actual: 1000,
    });
    const before = JSON.stringify(s);
    expect(
      demoAI.answer("На что потратили деньги?", s, resident()).text,
    ).toContain("Ремонт крыши");
    demoAI.answer("Составь отчет", s, chair());
    expect(JSON.stringify(s)).toBe(before);
  });
  it("не придумывает правовые ответы и неизвестные сведения", () => {
    expect(
      demoAI.answer("Какая статья закона?", seed(), resident()).text,
    ).toContain("Правовая база");
    expect(demoAI.answer("Погода в Париже", seed(), resident()).text).toContain(
      "ограничен",
    );
  });
});
describe("Документы и доступ", () => {
  it("черновик недоступен жителю и поиску помощника; публикация отдельная", () => {
    const s = seed();
    saveDoc(s, chair(), {
      title: "Уникальный документ",
      body: "Закупка ограждения",
      audience: "residents",
    });
    const d = s.docs[0];
    expect(d.status).toBe("Черновик");
    expect(visibleDocs(s, resident()).some((x) => x.id === d.id)).toBe(false);
    expect(
      demoAI.answer("Найди документ: ограждения", s, resident()).sources,
    ).toHaveLength(0);
    documentStatus(s, chair(), d.id, "Опубликован", d.version);
    expect(visibleDocs(s, resident()).some((x) => x.id === d.id)).toBe(true);
    expect(
      demoAI.answer("Найди документ: ограждения", s, resident()).sources[0].id,
    ).toBe(d.id);
  });
  it("архив уходит из актуального поиска, private-документ остается только председателю", () => {
    const s = seed();
    const d = s.docs[0];
    documentStatus(s, chair(), d.id, "Архив", d.version);
    expect(visibleDocs(s, resident()).some((x) => x.id === d.id)).toBe(false);
    expect(
      demoAI.answer("Найди документ: смета", s, chair()).sources,
    ).toHaveLength(0);
    saveDoc(s, chair(), {
      title: "Внутренняя заметка",
      body: "Внутренняя проверка",
      audience: "chair",
    });
    const internal = s.docs[0];
    documentStatus(s, chair(), internal.id, "Опубликован", internal.version);
    expect(visibleDocs(s, resident()).some((x) => x.id === internal.id)).toBe(
      false,
    );
  });
  it("редактирование повышает версию и возвращает опубликованный документ в черновики", () => {
    const s = seed();
    const d = s.docs[0],
      v = d.version;
    saveDoc(
      s,
      chair(),
      { title: d.title, body: "Новая редакция", audience: "residents" },
      d.id,
    );
    expect(d.version).toBe(v + 1);
    expect(d.status).toBe("Черновик");
    expect(() => documentStatus(s, chair(), d.id, "Опубликован", v)).toThrow(
      "изменён",
    );
  });
  it("председатель не может опубликовать чужой дом; житель не может редактировать", () => {
    const s = seed();
    expect(() => documentStatus(s, chair(), "d-h2", "Опубликован", 1)).toThrow(
      "недоступен",
    );
    expect(() =>
      saveDoc(s, resident(), { title: "x", body: "x", audience: "residents" }),
    ).toThrow("председателю");
  });
  it("дома и обращения жителей разделены во всех ответах и списках", () => {
    const s = seed();
    expect(visibleTickets(s, resident()).map((t) => t.id)).toEqual(["t1"]);
    expect(
      visibleTickets(s, { ...resident(), userId: "u3" }).map((t) => t.id),
    ).toEqual(["t2"]);
    expect(visibleDocs(s, resident()).some((d) => d.id === "d-h2")).toBe(false);
    expect(
      demoAI.answer("Найди документ: Самал", s, resident()).sources,
    ).toHaveLength(0);
    expect(
      demoAI.answer("Расходы", s, { ...chair(), houseId: "h2" }).text,
    ).not.toContain("Уборка подъездов");
    expect(accessibleHouses(s, "u1")).toHaveLength(1);
    expect(accessibleHouses(s, "u2")).toHaveLength(2);
    expect(visibleTickets(s, { ...resident(), houseId: "h2" })).toHaveLength(0);
  });
});
describe("Месяцы, изменение расходов и снимки", () => {
  it("выбор месяца меняет суммы, новый отчет и ответ", () => {
    const s = seed();
    s.works.push({
      ...s.works[0],
      id: "past",
      date: "2024-03-01",
      planned: 7000,
      actual: 3000,
    });
    const c = { ...chair(), month: "2024-03" };
    expect(totals(s, c)).toMatchObject({ actual: 3000, planned: 7000 });
    expect(snapshot(s, c).rows.map((w) => w.id)).toEqual(["past"]);
    expect(
      demoAI.answer("Сравни план и фактические расходы", s, c).text,
    ).toContain("2024-03");
    expect(demoAI.answer("Расходы", s, c).sources).toHaveLength(1);
  });
  it("сохранённый отчет не меняется после редактирования суммы и даты", () => {
    const s = seed(),
      c = chair();
    const r = snapshot(s, c);
    saveDoc(
      s,
      c,
      { title: "Отчет", body: reportText(r), audience: "residents" },
      undefined,
      r,
    );
    const saved = JSON.stringify(s.docs[0]);
    const w = s.works[0];
    saveWork(
      s,
      c,
      { ...w, actual: 10000, date: "2024-01-01" },
      w.id,
      w.updatedAt,
    );
    expect(totals(s, c).actual).toBe(32000);
    expect(totals(s, { ...c, month: "2024-01" }).actual).toBe(10000);
    expect(snapshot(s, c).actual).toBe(32000);
    expect(JSON.stringify(s.docs[0])).toBe(saved);
    expect(r.actual).toBe(117000);
  });
  it("считает копейки без двоичной погрешности", () => {
    const s = seed();
    s.works = s.works
      .slice(0, 2)
      .map((w, i) => ({ ...w, actual: i === 0 ? 0.1 : 0.2 }));
    expect(totals(s, chair()).actual).toBe(0.3);
  });
});
describe("Обращения и переписка", () => {
  it("просрочка только при истекшем сроке и незавершенном статусе", () => {
    const t = seed().tickets[0];
    expect(overdue({ ...t, dueDate: "" }, today())).toBe(false);
    expect(overdue({ ...t, dueDate: today() }, today())).toBe(false);
    expect(overdue({ ...t, dueDate: "2001-01-01" })).toBe(true);
    expect(overdue({ ...t, dueDate: "2001-01-01", status: "Выполнено" })).toBe(
      false,
    );
  });
  it("закрытие требует результата, возврат оставляет историю и отдельное сообщение", () => {
    const s = seed();
    expect(() =>
      updateTicket(s, chair(), "t1", {
        status: "Выполнено",
        dueDate: "",
        assignee: "",
        result: "",
      }),
    ).toThrow("результат");
    updateTicket(s, chair(), "t1", {
      status: "Выполнено",
      dueDate: "",
      assignee: "Электрик",
      result: "Свет заменён",
    });
    const count = s.tickets[0].history.length;
    sendMessage(s, resident(), "t1", "Спасибо");
    expect(s.tickets[0].history).toHaveLength(count);
    reopen(s, resident(), "t1", "Свет всё ещё мигает");
    expect(s.tickets[0].status).toBe("В работе");
    expect(s.tickets[0].history.at(-1)?.text).toContain("возвращено");
    expect(s.tickets[0].messages.at(-1)?.text).toContain("мигает");
    expect(() =>
      reopen(s, { ...resident(), userId: "u3" }, "t1", "x"),
    ).toThrow();
  });
  it("предлагает выбрать обращение, если собственных несколько", () => {
    const s = seed();
    s.tickets.push({
      ...s.tickets[0],
      id: "another",
      subject: "Другая проблема",
    });
    const a = demoAI.answer("Что сделано по моему обращению?", s, resident());
    expect(a.choices).toHaveLength(2);
    expect(
      demoAI
        .answer("Что сделано по моему обращению?", s, resident(), "another")
        .sources.map((x) => x.id),
    ).toEqual(["another"]);
  });
});
describe("Миграция и ошибки хранилища", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("сохраняет старые пользовательские записи, фото, суммы и отделяет переписку", () => {
    const old = {
      ...legacySeed(),
      tickets: legacySeed().tickets.map((t) => ({ ...t, photo: "" })),
    };
    old.docs.push({ id: "custom", title: "Мой отчет", body: "Текст жителя" });
    old.tickets[0].photo = "data:image/png;base64,test";
    const s = migrate(old);
    expect(s.schemaVersion).toBe(2);
    expect(s.docs.find((d) => d.id === "custom")).toMatchObject({
      body: "Текст жителя",
      status: "Черновик",
      version: 1,
    });
    expect(s.tickets[0].photo).toBe(old.tickets[0].photo);
    expect(s.tickets[0].messages[0].text).toContain("Электрик");
    expect(s.tickets[0].history.at(-1)?.text).toBe("В работе");
    expect(s.works[0].actual).toBe(old.works[0].actual);
    expect(migrate(s)).toBe(s);
  });
  it("сохраняет неизвестных старых владельцев отдельными профилями", () => {
    const old = legacySeed();
    old.tickets[0].owner = "legacy-person";
    const s = migrate(old);
    expect(s.users.some((u) => u.id === s.tickets[0].ownerId)).toBe(true);
    expect(visibleTickets(s, resident()).map((t) => t.id)).not.toContain(
      old.tickets[0].id,
    );
  });
  it("делает резервную копию перед записью v2, повторно не мигрирует", () => {
    const original = JSON.stringify(legacySeed());
    const map = new Map([[STORAGE_KEY, original]]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, v: string) => map.set(key, v),
    });
    expect(localAdapter.load().schemaVersion).toBe(2);
    expect(map.get(BACKUP_KEY)).toBe(original);
    expect(JSON.parse(map.get(STORAGE_KEY)!).schemaVersion).toBe(2);
    expect(
      localAdapter.load().docs.filter((d) => d.houseId === "h1"),
    ).toHaveLength(5);
  });
  it("не сбрасывает поврежденные, неизвестные и переполненные данные", () => {
    expect(() => migrate({ schemaVersion: 100 })).toThrow("другой версией");
    const map = new Map([[STORAGE_KEY, "invalid json"]]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    });
    expect(() => localAdapter.load()).toThrow("не удалены");
    expect(map.get(STORAGE_KEY)).toBe("invalid json");
    expect(() => localAdapter.save(seed())).toThrow("Изменения не сохранены");
  });
  it("при ошибке миграции оставляет исходную запись на месте", () => {
    const old = JSON.stringify(legacySeed());
    let written = 0;
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => (key === STORAGE_KEY ? old : null),
      setItem: () => {
        written++;
        throw new Error("quota");
      },
    });
    expect(() => localAdapter.load()).toThrow("не сохранены");
    expect(written).toBe(1);
  });
});
