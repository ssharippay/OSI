import type { State, Context, ReportSnapshot } from "../models";
import { visibleWorks, house } from "../store/selectors";
import { stamp, money, dateLabel } from "../utils";
export function totals(s: State, c: Context) {
  const rows = visibleWorks(s, c).filter((w) => w.date.slice(0, 7) === c.month);
  return {
    rows,
    planned: rows.reduce((a, w) => a + Math.round(w.planned * 100), 0) / 100,
    actual: rows.reduce((a, w) => a + Math.round(w.actual * 100), 0) / 100,
  };
}
export function snapshot(s: State, c: Context): ReportSnapshot {
  const h = house(s, c);
  if (!h) throw new Error("Дом не найден.");
  const t = totals(s, c);
  return structuredClone({
    house: { id: h.id, name: h.name, address: h.address },
    month: c.month,
    preparedAt: stamp(),
    dataMode: s.runtimeMode,
    ...t,
  });
}
export function reportText(r: ReportSnapshot) {
  return `Проект отчета за ${r.month}\n${r.house.name} · ${r.house.address}\nПодготовлен: ${dateLabel(r.preparedAt)}\n\nПлан: ${money(r.planned)}\nФактические расходы: ${money(r.actual)}\nРазница плана и факта: ${money(r.planned - r.actual)}\n\n${r.rows.map((w) => `${w.date} · ${w.title} — ${w.status}\nПлан: ${money(w.planned)}; факт: ${money(w.actual)}\n${w.body}\nРезультат: ${w.result || "Не указан"}`).join("\n\n") || "За выбранный месяц записей нет."}\n\nПроект. ${r.dataMode === "work" ? "Данные учета дома." : "Демонстрационные данные."} Не является официальной бухгалтерской отчетностью. Разница плана и факта не является остатком банковского счета.`;
}
