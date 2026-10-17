import { useState } from "react";
import {
  Plus,
  ArrowRight,
  Megaphone,
  FileText,
  Wallet,
  Sparkles,
} from "lucide-react";
import { useApp } from "../AppContext";
import {
  visibleAnnouncements,
  visibleDocs,
  visibleTickets,
  overdue,
} from "../store/selectors";
import { Summary, Status } from "../components/Common";
import { FinanceSummary } from "./Works";
import { snapshot, totals } from "../reports";
import { money, dateLabel } from "../utils";
export function Dashboard() {
  const { data, c, chair, open, go } = useApp();
  const [q, setQ] = useState("");
  const tickets = visibleTickets(data, c);
  const docs = visibleDocs(data, c).filter(
    (d) => d.status === "Опубликован" && d.audience === "residents",
  );
  const announcements = visibleAnnouncements(data, c);
  const important = announcements.find((a) => a.important) || announcements[0];
  const t = totals(data, c);
  const attention = tickets.filter((t) => !chair || t.status !== "Выполнено");
  const draftCount = visibleDocs(data, c).filter(
    (d) => d.status === "Черновик",
  ).length;
  return (
    <>
      {chair ? (
        <>
          <div className="stats task-stats">
            <Summary
              title="Новые обращения"
              value={String(tickets.filter((t) => t.status === "Новое").length)}
              onClick={() => go("tickets", "filter:Новое")}
            />
            <Summary
              title="В работе"
              value={String(
                tickets.filter((t) => t.status === "В работе").length,
              )}
              onClick={() => go("tickets", "filter:В работе")}
            />
            <Summary
              title="Просроченные"
              value={String(tickets.filter((t) => overdue(t)).length)}
              onClick={() => go("tickets", "filter:Просроченные")}
            />
            <Summary
              title="Черновики документов"
              value={String(draftCount)}
              onClick={() => go("docs", "filter:Черновик")}
            />
          </div>
          <section className="quick-actions">
            <button
              className="secondary"
              onClick={() => open({ kind: "announcement" })}
            >
              <Megaphone size={17} /> Создать объявление
            </button>
            <button
              className="secondary"
              onClick={() => open({ kind: "work" })}
            >
              <Wallet size={17} /> Добавить расход
            </button>
            <button
              className="secondary"
              onClick={() =>
                open({ kind: "report", report: snapshot(data, c) })
              }
            >
              <FileText size={17} /> Подготовить отчет
            </button>
            <button className="secondary" onClick={() => go("ai")}>
              <Sparkles size={17} /> Спросить помощника
            </button>
          </section>
          <FinanceSummary />
        </>
      ) : null}
      <div className="dashboard-grid compact-grid">
        <section className="card important">
          <div className="section-kicker">
            <span>
              <Megaphone size={17} /> ВАЖНОЕ ОБЪЯВЛЕНИЕ
            </span>
            <span className="pill amber">Для жителей дома</span>
          </div>
          <h2>{important?.title || "Объявлений пока нет"}</h2>
          <p>{important?.body || "Новости вашего дома появятся здесь."}</p>
          {important && (
            <div className="card-footer">
              <small>{dateLabel(important.date)}</small>
              <button
                className="text-btn"
                onClick={() =>
                  open({ kind: "read-announcement", id: important.id })
                }
              >
                Подробнее <ArrowRight size={16} />
              </button>
            </div>
          )}
        </section>
        <section className="card">
          <div className="section-title">
            <h2>
              {chair ? "Обращения требуют внимания" : "Последнее моё обращение"}
            </h2>
            <button className="text-btn" onClick={() => go("tickets")}>
              Все обращения
            </button>
          </div>
          {attention.slice(0, chair ? 3 : 1).map((t) => (
            <button
              className="list-row"
              key={t.id}
              onClick={() => go("tickets", t.id)}
            >
              <span className="row-main">
                <strong>{t.subject}</strong>
                <small>
                  {t.location || t.category} · {dateLabel(t.createdAt)}
                </small>
              </span>
              <Status value={t.status} />
              {overdue(t) && <span className="overdue">Срок истёк</span>}
            </button>
          ))}
          {!attention.length && (
            <p>
              {chair ? "Открытых обращений пока нет." : "Обращений пока нет."}
            </p>
          )}
          {!chair && (
            <button
              className="wide-soft"
              onClick={() => open({ kind: "ticket" })}
            >
              <Plus size={16} /> Сообщить о проблеме
            </button>
          )}
        </section>
      </div>
      {!chair && (
        <section className="card home-question">
          <div>
            <Sparkles size={23} />
            <h2>Спросите о своем доме</h2>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (q.trim()) {
                go("ai");
                open({ kind: "ask", text: q.trim() });
                setQ("");
              }
            }}
          >
            <input
              aria-label="Спросите о своем доме"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              maxLength={2000}
              placeholder="Например, на что потратили деньги?"
            />
            <button className="primary" disabled={!q.trim()}>
              Задать вопрос
            </button>
          </form>
          <small>Демо-помощник · без внешней ИИ-модели</small>
        </section>
      )}
      <div className="dashboard-grid lower">
        <section className="card">
          <div className="section-title">
            <h2>Последние опубликованные документы</h2>
            <button className="text-btn" onClick={() => go("docs")}>
              Все документы
            </button>
          </div>
          {docs.slice(0, 3).map((d) => (
            <button
              className="list-row"
              key={d.id}
              onClick={() => open({ kind: "read-doc", id: d.id })}
            >
              <FileText size={19} />
              <span className="row-main">
                <strong>{d.title}</strong>
                <small>
                  Версия {d.version} · {dateLabel(d.updatedAt)}
                </small>
              </span>
              <ArrowRight size={16} />
            </button>
          ))}
          {!docs.length && (
            <p>Опубликованных документов для жителей пока нет.</p>
          )}
        </section>
        <section className="card">
          <div className="section-title">
            <h2>Работы и расходы · {c.month}</h2>
            {chair && (
              <button className="text-btn" onClick={() => go("works")}>
                Подробнее
              </button>
            )}
          </div>
          {t.rows.slice(0, 3).map((w) => (
            <button
              className="expense-row"
              key={w.id}
              onClick={() => open({ kind: "read-work", id: w.id })}
            >
              <span>
                <strong>{w.title}</strong>
                <small>{w.status}</small>
              </span>
              <b>{money(w.actual)}</b>
            </button>
          ))}
          {!t.rows.length && <p>Записей за этот месяц пока нет.</p>}
          <div className="finance-total">
            <span>
              План<strong>{money(t.planned)}</strong>
            </span>
            <span>
              Факт<strong>{money(t.actual)}</strong>
            </span>
            <span>
              Разница<strong>{money(t.planned - t.actual)}</strong>
            </span>
          </div>
          <button
            className="text-btn"
            onClick={() =>
              open({ kind: "view-report", report: snapshot(data, c) })
            }
          >
            Просмотреть проект отчета
          </button>
        </section>
      </div>
      <section className="card lower">
        <div className="section-title">
          <h2>Новости дома</h2>
        </div>
        {announcements.map((a) => (
          <button
            className="news-row"
            key={a.id}
            onClick={() => open({ kind: "read-announcement", id: a.id })}
          >
            <Megaphone size={18} />
            <span>
              <strong>{a.title}</strong>
              <p>{a.body}</p>
            </span>
            <small>{dateLabel(a.date)}</small>
          </button>
        ))}
        {!announcements.length && <p>Новостей пока нет.</p>}
      </section>
      {chair && (
        <section className="card activity">
          <h2>История событий дома</h2>
          {data.events
            .filter((e) => e.houseId === c.houseId)
            .slice(0, 12)
            .map((e, i) => (
              <p key={i}>
                <small>{dateLabel(e.date)}</small>
                <span>{e.text}</span>
              </p>
            ))}
        </section>
      )}
    </>
  );
}
