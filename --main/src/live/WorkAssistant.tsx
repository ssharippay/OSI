import { useEffect, useState } from "react";
import { useApp } from "../AppContext";
import { api } from "./api";
import type { Answer } from "../models";
export function WorkAssistant() {
  const { c, open, go, dialog, selected, data } = useApp();
  const [status, setStatus] = useState<any>(null),
    [question, setQuestion] = useState(""),
    [turns, setTurns] = useState<{ q: string; a: Answer }[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (dialog?.kind === "ask" && dialog.text) {
      setQuestion(dialog.text);
      open(null);
    } else if (selected) {
      const t = data.tickets.find((t) => t.id === selected);
      if (t) setQuestion("Подготовь проект ответа по обращению: " + t.subject);
    }
  }, [dialog?.kind, dialog?.text, selected]);
  useEffect(() => {
    setTurns([]);
    setStatus(null);
    api(`/houses/${c.houseId}/assistant/status`)
      .then(setStatus)
      .catch((e) => setError(e.message));
  }, [c.houseId]);
  async function ask(search: boolean) {
    if (!question.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const a = await api<Answer>(
        `/houses/${c.houseId}/assistant/${search ? "search" : "ask"}`,
        { method: "POST", body: JSON.stringify({ question, month: c.month }) },
      );
      setTurns([...turns, { q: question, a }]);
      setQuestion("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card chat">
      <h2>Помощник рабочего кабинета</h2>
      <p className="info-note">
        {!status
          ? "Проверяем настройки…"
          : !status.configured
            ? "ИИ не настроен. Отдельно доступен поиск по разрешенным материалам дома."
            : !status.houseAllowed
              ? "ИИ настроен оператором, но внешняя передача для дома не разрешена."
              : "Внешний ИИ включен с разрешения председателя. Передаются ограниченные фрагменты, а не вся база."}
      </p>
      <p>
        Поиск и ИИ проверяют доступ на сервере. Распознавание сканов/OCR и
        актуальная правовая база не подключены. Ответ ИИ — проект для проверки,
        он ничего не публикует и не изменяет.
      </p>
      {turns.map((t, i) => (
        <section key={i}>
          <h3>{t.q}</h3>
          <p className="pre answer-bubble">{t.a.text}</p>
          <div className="button-row">
            {t.a.sources.map((s) => (
              <button
                className="text-btn"
                key={s.id}
                onClick={() =>
                  s.kind === "ticket"
                    ? go("tickets", s.id)
                    : open({
                        kind: s.kind === "doc" ? "read-doc" : "read-work",
                        id: s.id,
                      })
                }
              >
                {s.label}
              </button>
            ))}
          </div>
        </section>
      ))}
      {error && (
        <p role="alert" className="validation-errors">
          {error}
        </p>
      )}
      <label className="wizard-field">
        Вопрос помощнику
        <textarea
          aria-label="Вопрос помощнику"
          value={question}
          maxLength={2000}
          onChange={(e) => setQuestion(e.target.value)}
        />
      </label>
      <div className="button-row">
        <button
          className="primary"
          disabled={busy || !question.trim()}
          onClick={() => ask(true)}
        >
          Найти в материалах дома
        </button>
        <button
          className="secondary"
          disabled={
            busy ||
            !question.trim() ||
            !status?.configured ||
            !status?.houseAllowed
          }
          onClick={() => ask(false)}
        >
          Спросить ИИ
        </button>
      </div>
      {busy && <p role="status">Запрос выполняется на сервере…</p>}
    </section>
  );
}
