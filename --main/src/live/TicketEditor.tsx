import { useState, useEffect } from "react";
import type { Ticket } from "../models";
import { useApp } from "../AppContext";
import { updateTicket } from "../store/actions";
const fields = (t: Ticket) => ({
  status: t.status,
  dueDate: t.dueDate,
  assignee: t.assignee,
  result: t.result,
});
export function TicketEditor({ ticket }: { ticket: Ticket }) {
  const { mutate, c } = useApp();
  const [draft, setDraft] = useState(() => fields(ticket)),
    [base, setBase] = useState(ticket.serverVersion),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!dirty && !busy) {
      setDraft(fields(ticket));
      setBase(ticket.serverVersion);
    }
  }, [ticket, dirty, busy]);
  const changed = dirty && base !== ticket.serverVersion;
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const ok = await mutate((s) => {
            const current = s.tickets.find((t) => t.id === ticket.id);
            if (!current || current.serverVersion !== base)
              throw Error(
                "Конфликт версий. Ваш ввод сохранен в редакторе. Обновите исходные данные перед повторной записью.",
              );
            updateTicket(s, c, ticket.id, draft);
          }, "Параметры обращения обновлены");
          if (ok) setDirty(false);
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy} className="plain-fieldset">
        <h3>Решение обращения</h3>
        {changed && (
          <p className="validation-errors">
            Обращение изменено на другом устройстве. Ваш ввод не заменен.{" "}
            <button
              type="button"
              onClick={() => {
                if (
                  confirm(
                    "Заменить поля редактора последними серверными значениями?",
                  )
                ) {
                  setDraft(fields(ticket));
                  setBase(ticket.serverVersion);
                  setDirty(false);
                }
              }}
            >
              Открыть новые данные
            </button>
          </p>
        )}
        <div className="form-grid">
          <label>
            Статус
            <select
              aria-label="Статус обращения"
              value={draft.status}
              onChange={(e) => {
                setDraft({
                  ...draft,
                  status: e.target.value as Ticket["status"],
                });
                setDirty(true);
              }}
            >
              {["Новое", "В работе", "Выполнено"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Срок выполнения
            <input
              aria-label="Срок выполнения"
              type="date"
              value={draft.dueDate}
              onChange={(e) => {
                setDraft({ ...draft, dueDate: e.target.value });
                setDirty(true);
              }}
            />
          </label>
        </div>
        <label>
          Ответственный исполнитель
          <input
            aria-label="Ответственный исполнитель"
            maxLength={150}
            value={draft.assignee}
            onChange={(e) => {
              setDraft({ ...draft, assignee: e.target.value });
              setDirty(true);
            }}
          />
        </label>
        <label>
          Результат выполнения
          <textarea
            aria-label="Результат выполнения"
            maxLength={3000}
            value={draft.result}
            onChange={(e) => {
              setDraft({ ...draft, result: e.target.value });
              setDirty(true);
            }}
          />
        </label>
        <button className="primary" disabled={changed}>
          Сохранить параметры обращения
        </button>
        {busy && <p role="status">Ожидаем подтверждение сервера…</p>}
      </fieldset>
    </form>
  );
}
