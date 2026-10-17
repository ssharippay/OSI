import { Plus, FileText, ChevronRight } from "lucide-react";
import { useApp } from "../AppContext";
import { totals, snapshot } from "../reports";
import { money, dateLabel } from "../utils";
import { Status, Summary, Empty } from "../components/Common";
export function FinanceSummary() {
  const { data, c } = useApp();
  const t = totals(data, c);
  return (
    <div className="stats">
      <Summary title="Запланировано" value={money(t.planned)} />
      <Summary title="Фактические расходы" value={money(t.actual)} />
      <Summary
        title="Разница плана и факта"
        value={money(t.planned - t.actual)}
      />
    </div>
  );
}
export function Works() {
  const { data, c, open } = useApp();
  const t = totals(data, c);
  return (
    <>
      <div className="section-title">
        <p>
          Работы за {c.month}. Разница плана и факта не является остатком на
          банковском счете.
        </p>
        <div className="button-row">
          <button className="primary" onClick={() => open({ kind: "work" })}>
            <Plus size={16} /> Добавить работу или расход
          </button>
          <button
            className="secondary"
            onClick={() => open({ kind: "report", report: snapshot(data, c) })}
          >
            <FileText size={16} /> Подготовить отчет
          </button>
        </div>
      </div>
      <FinanceSummary />
      <section className="card">
        <h2>Работы за выбранный месяц</h2>
        {t.rows.map((w) => (
          <div className="work-row" key={w.id}>
            <span className="row-main">
              <strong>{w.title}</strong>
              <small>
                {dateLabel(w.date)} · {w.result || "Результат пока не указан"}
              </small>
            </span>
            <Status value={w.status} />
            <span className="work-money">
              <small>План {money(w.planned)}</small>
              <b>Факт {money(w.actual)}</b>
            </span>
            <button
              className="text-btn"
              onClick={() => open({ kind: "read-work", id: w.id })}
            >
              Просмотреть <ChevronRight size={16} />
            </button>
            <button
              className="text-btn"
              onClick={() => open({ kind: "work", id: w.id })}
            >
              Редактировать
            </button>
          </div>
        ))}
        {!t.rows.length && (
          <Empty>За этот месяц работ и расходов пока нет.</Empty>
        )}
      </section>
    </>
  );
}
