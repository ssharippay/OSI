import { TicketEditor } from "../live/TicketEditor";
import { FileAttachments } from "../live/FileAttachments";
import { useState } from "react";
import { Plus, Search, Sparkles } from "lucide-react";
import { useApp } from "../AppContext";
import { visibleTickets, overdue } from "../store/selectors";
import { sendMessage, updateTicket, reopen } from "../store/actions";
import { Status, Empty } from "../components/Common";
import { dateLabel } from "../utils";
export function Tickets() {
  const { data, c, live, chair, selected, setSelected, open, mutate, go } =
    useApp();
  const [filter, setFilter] = useState(
    selected.startsWith("filter:") ? selected.slice(7) : "Все",
  );
  const [search, setSearch] = useState("");
  const tickets = visibleTickets(data, c);
  const chosen = tickets.find((t) => t.id === selected);
  const rows = tickets.filter(
    (t) =>
      (filter === "Все" ||
        (filter === "Просроченные" && overdue(t)) ||
        t.status === filter) &&
      (t.subject + " " + t.body + " " + t.location)
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="section-title">
        <p>
          {live
            ? "Приложение не заменяет экстренный вызов. При угрозе жизни звоните 112."
            : "Демо не связано с настоящей диспетчерской. При угрозе жизни звоните 112."}
        </p>
        {!chair && (
          <button className="primary" onClick={() => open({ kind: "ticket" })}>
            <Plus size={16} /> Новое обращение
          </button>
        )}
      </div>
      <section className="card toolbar">
        <div className="filters">
          {["Все", "Новое", "В работе", "Выполнено", "Просроченные"].map(
            (f) => (
              <button
                key={f}
                className={filter === f ? "selected" : ""}
                onClick={() => setFilter(f)}
              >
                {f}
              </button>
            ),
          )}
        </div>
        <label className="search">
          <Search size={17} />
          <input
            aria-label="Поиск обращений"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Тема, описание или место"
          />
        </label>
      </section>
      <div className="ticket-layout">
        <section className="card ticket-list">
          {rows.map((t) => (
            <button
              key={t.id}
              className={"ticket-item " + (selected === t.id ? "chosen" : "")}
              onClick={() => setSelected(t.id)}
            >
              <div>
                <Status value={t.status} />
                {overdue(t) && <span className="overdue">Просрочено</span>}
              </div>
              <h3>{t.subject}</h3>
              <p>{t.location || "Место не указано"}</p>
              <small>
                {dateLabel(t.createdAt)} ·{" "}
                {data.users.find((u) => u.id === t.ownerId)?.name ||
                  "Пользователь"}
              </small>
            </button>
          ))}
          {!rows.length && <Empty>Обращений с такими условиями нет.</Empty>}
        </section>
        <section className="card ticket-detail">
          {chosen ? (
            <>
              <div className="section-title">
                <Status value={chosen.status} />
                {overdue(chosen) && <span className="overdue">Срок истёк</span>}
                <small>{chosen.category}</small>
              </div>
              <h2>{chosen.subject}</h2>
              <p className="pre">{chosen.body}</p>
              <dl className="ticket-meta">
                <div>
                  <dt>Создано</dt>
                  <dd>{dateLabel(chosen.createdAt)}</dd>
                </div>
                <div>
                  <dt>Место</dt>
                  <dd>{chosen.location || "Не указано"}</dd>
                </div>
                <div>
                  <dt>Срок</dt>
                  <dd>{dateLabel(chosen.dueDate)}</dd>
                </div>
                <div>
                  <dt>Исполнитель</dt>
                  <dd>{chosen.assignee || "Не назначен"}</dd>
                </div>
              </dl>
              {chosen.photo && (
                <img
                  className="attachment"
                  src={chosen.photo}
                  alt="Фото проблемы"
                />
              )}
              <FileAttachments collection="tickets" id={chosen.id} />
              {chosen.result && (
                <div className="result-box">
                  <strong>Результат выполнения</strong>
                  <p className="pre">{chosen.result}</p>
                </div>
              )}
              {chair &&
                (live ? (
                  <TicketEditor ticket={chosen} key={chosen.id + "-editor"} />
                ) : (
                  <form
                    key={chosen.id + "-" + chosen.history.length}
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      await mutate(
                        (s) =>
                          updateTicket(s, c, chosen.id, {
                            status: String(
                              f.get("status"),
                            ) as typeof chosen.status,
                            dueDate: String(f.get("dueDate") || ""),
                            assignee: String(f.get("assignee") || "").trim(),
                            result: String(f.get("result") || "").trim(),
                          }),
                        "Параметры обращения обновлены",
                      );
                    }}
                  >
                    <h3>Решение обращения</h3>
                    <div className="form-grid">
                      <label>
                        Статус
                        <select
                          name="status"
                          aria-label="Статус обращения"
                          defaultValue={chosen.status}
                        >
                          {["Новое", "В работе", "Выполнено"].map((v) => (
                            <option key={v}>{v}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Срок выполнения
                        <input
                          type="date"
                          name="dueDate"
                          aria-label="Срок выполнения"
                          defaultValue={chosen.dueDate}
                        />
                      </label>
                    </div>
                    <label>
                      Ответственный исполнитель
                      <input
                        name="assignee"
                        aria-label="Ответственный исполнитель"
                        defaultValue={chosen.assignee}
                        maxLength={150}
                        placeholder="Имя или название службы"
                      />
                    </label>
                    <label>
                      Результат выполнения
                      <textarea
                        name="result"
                        aria-label="Результат выполнения"
                        defaultValue={chosen.result}
                        maxLength={3000}
                        placeholder="Обязательно при статусе «Выполнено»"
                      />
                    </label>
                    <button className="primary">
                      Сохранить параметры обращения
                    </button>
                  </form>
                ))}
              <h3 className="subheading">Переписка по обращению</h3>
              <div className="ticket-messages">
                {chosen.messages.map((m) => (
                  <div
                    key={m.id}
                    className={
                      "ticket-message " + (m.userId === c.userId ? "mine" : "")
                    }
                  >
                    <small>
                      {data.users.find((u) => u.id === m.userId)?.name ||
                        "Пользователь"}{" "}
                      · {dateLabel(m.date)}
                    </small>
                    <p className="pre">{m.text}</p>
                  </div>
                ))}
                {!chosen.messages.length && (
                  <p className="muted">Сообщений пока нет.</p>
                )}
              </div>
              <MessageForm key={chosen.id} ticketId={chosen.id} />
              {chair && (
                <button
                  className="text-btn"
                  onClick={() => go("ai", chosen.id)}
                >
                  <Sparkles size={16} /> Подготовить ответ по обращению
                </button>
              )}
              {!chair && chosen.status === "Выполнено" && (
                <form
                  className="reopen-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const reason = String(
                      new FormData(form).get("reason") || "",
                    );
                    if (
                      await mutate(
                        (s) => reopen(s, c, chosen.id, reason),
                        "Обращение возвращено в работу",
                      )
                    )
                      form.reset();
                  }}
                >
                  <h3>Проблема осталась?</h3>
                  <label>
                    Что не устранено
                    <textarea
                      aria-label="Что не устранено"
                      name="reason"
                      required
                      maxLength={3000}
                    />
                  </label>
                  <button className="secondary">
                    Проблема не устранена — вернуть в работу
                  </button>
                </form>
              )}
              <details className="history-details" open>
                <summary>История статусов и назначений</summary>
                <div className="timeline">
                  {chosen.history.map((h, i) => (
                    <div key={i}>
                      <small>{dateLabel(h.date)}</small>
                      <p>{h.text}</p>
                    </div>
                  ))}
                </div>
              </details>
            </>
          ) : (
            <Empty>
              Выберите обращение, чтобы увидеть описание, сроки, переписку и
              историю.
            </Empty>
          )}
        </section>
      </div>
    </>
  );
}
function MessageForm({ ticketId }: { ticketId: string }) {
  const { c, mutate, dialog, live, syncState } = useApp();
  const [text, setText] = useState(dialog?.text || "");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (
          await mutate(
            (s) => sendMessage(s, c, ticketId, text),
            "Сообщение добавлено в переписку",
          )
        )
          setText("");
      }}
    >
      <fieldset
        className="plain-fieldset"
        disabled={live && syncState.startsWith("Сохраняем")}
      >
        <label>
          Новое сообщение
          <textarea
            name="message"
            aria-label="Новое сообщение"
            value={text}
            onChange={(e) => setText(e.target.value)}
            required
            maxLength={3000}
          />
        </label>
        <button className="primary">Отправить сообщение</button>
      </fieldset>
    </form>
  );
}
