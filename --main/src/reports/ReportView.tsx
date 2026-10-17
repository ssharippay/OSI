import type { ReportSnapshot } from "../models";
import { money, dateLabel } from "../utils";
export function ReportView({ report }: { report: ReportSnapshot }) {
  return (
    <article className="report-sheet">
      <header>
        <span>ПРОЕКТ. ДЕМОНСТРАЦИОННЫЕ ДАННЫЕ</span>
        <h1>Проект отчета за {report.month}</h1>
        <h2>{report.house.name}</h2>
        <p>{report.house.address}</p>
        <p>Дата формирования: {dateLabel(report.preparedAt)}</p>
      </header>
      <div className="report-totals">
        <p>
          План<strong>{money(report.planned)}</strong>
        </p>
        <p>
          Фактические расходы<strong>{money(report.actual)}</strong>
        </p>
        <p>
          Разница плана и факта
          <strong>{money(report.planned - report.actual)}</strong>
        </p>
      </div>
      <table>
        <thead>
          <tr>
            <th>Дата / работа</th>
            <th>План, ₸</th>
            <th>Факт, ₸</th>
            <th>Статус и результат</th>
          </tr>
        </thead>
        <tbody>
          {report.rows.map((w) => (
            <tr key={w.id}>
              <td>
                {dateLabel(w.date)}
                <strong>{w.title}</strong>
                <p>{w.body}</p>
              </td>
              <td>{money(w.planned)}</td>
              <td>{money(w.actual)}</td>
              <td>
                {w.status}
                <p>{w.result || "Результат не указан"}</p>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!report.rows.length && <p>За выбранный месяц записей нет.</p>}
      <footer>
        Проект. Демонстрационные данные. Не является официальной бухгалтерской
        отчетностью. Разница плана и факта не является остатком банковского
        счета.
      </footer>
    </article>
  );
}
