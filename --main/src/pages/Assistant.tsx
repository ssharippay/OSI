import { WorkAssistant } from "../live/WorkAssistant";
import { useEffect, useRef, useState } from "react";
import { Sparkles, Send, Copy, ArrowUpRight } from "lucide-react";
import { useApp } from "../AppContext";
import { demoAI } from "../assistant";
import { visibleDocs, visibleTickets, visibleWorks } from "../store/selectors";
import type { Answer, Source } from "../models";
import { dateLabel } from "../utils";
export function Assistant() {
  const { live } = useApp();
  return live ? <WorkAssistant /> : <DemoAssistant />;
}
function DemoAssistant() {
  const {
    data,
    c,
    chair,
    selected,
    setSelected,
    dialog,
    open,
    go,
    chats,
    setChats,
    notify,
    mutate,
  } = useApp();
  const [q, setQ] = useState("");
  const key = [c.userId, c.houseId, c.month].join("/");
  const turns = chats[key] || [];
  const handled = useRef<string>("");
  const bottom = useRef<HTMLDivElement>(null);
  const docs = visibleDocs(data, c).filter((d) => d.status !== "Архив");
  const tickets = visibleTickets(data, c);
  const works = visibleWorks(data, c);
  const sourceAllowed = (source: Source) =>
    source.kind === "doc"
      ? docs.some((d) => d.id === source.id)
      : source.kind === "ticket"
        ? tickets.some((t) => t.id === source.id)
        : works.some((w) => w.id === source.id);
  function ask(question: string, id = selected) {
    if (!question.trim()) return;
    const a = demoAI.answer(question, data, c, id);
    setChats((all) => ({
      ...all,
      [key]: [...(all[key] || []), { q: question, a }],
    }));
    setQ("");
  }
  useEffect(() => {
    if (
      dialog?.kind === "ask" &&
      dialog.text &&
      handled.current !== dialog.text
    ) {
      handled.current = dialog.text;
      ask(dialog.text);
      open(null);
    } else if (chair && selected && handled.current !== selected) {
      handled.current = selected;
      ask("Подготовь ответ по этому обращению", selected);
    }
  }, [dialog?.kind, dialog?.text, selected]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [turns.length]);
  function source(s: Source) {
    if (!sourceAllowed(s)) {
      notify("Источник больше недоступен. Задайте вопрос заново.");
      return;
    }
    if (s.kind === "ticket") go("tickets", s.id);
    else open({ kind: s.kind === "doc" ? "read-doc" : "read-work", id: s.id });
  }
  function useDraft(a: Answer) {
    if (a.draft === "report" && a.report)
      open({ kind: "report", report: a.report });
    else if (a.draft === "announcement") open({ kind: "announcement-builder" });
    else if (a.draft === "reply") {
      const id = a.sources.find((s) => s.kind === "ticket")?.id;
      go("tickets", id);
      open({ kind: "reply-draft", id, text: a.text });
    }
  }
  const examples = chair
    ? [
        "Какие обращения просрочены?",
        "Какие обращения еще не выполнены?",
        "Какие документы доступны жителям?",
        "Сравни план и фактические расходы",
        "Подготовь отчет за выбранный месяц",
        "Найди документ по названию",
        "Подготовь объявление из этих данных",
      ]
    : [
        "На что потратили деньги в этом месяце?",
        "Что сделано по моему обращению?",
        "Какие документы доступны жителям?",
        "Найди документ: смета",
        "Как сообщить о протечке?",
      ];
  return (
    <div className="chat-layout">
      <section className="card chat">
        <div className="ai-disclosure">
          <Sparkles size={22} />
          <span>
            Демо-помощник: ответы формируются по подготовленным сценариям и
            данным демонстрационного дома. Внешняя ИИ-модель не подключена.
            <br />
            Выбранный месяц: {c.month}. Поиск документов — по тексту.
          </span>
        </div>
        <div className="messages" aria-live="polite">
          {!turns.length && (
            <div className="chat-welcome">
              <span className="sparkle-big">
                <Sparkles size={34} />
              </span>
              <h2>Спросите о своем доме</h2>
              <p>
                Документы, обращения и расходы за выбранный месяц.
                <br />
                Правовая база не подключена.
              </p>
            </div>
          )}
          {turns.map((m, i) => {
            const allowed = m.a.sources.every(sourceAllowed);
            return (
              <div key={i}>
                <div className="question-bubble">{m.q}</div>
                <article className="answer-bubble">
                  <span className="assistant-label">
                    <Sparkles size={16} /> ҮйКөмек · демо
                  </span>
                  <p className="pre">
                    {allowed
                      ? m.a.text
                      : "Один из источников больше недоступен этому профилю. Предыдущий ответ скрыт. Задайте вопрос заново, чтобы получить актуальные сведения."}
                  </p>
                  {allowed && (
                    <>
                      {m.a.choices?.map((t) => (
                        <button
                          key={t.id}
                          className="secondary choice"
                          onClick={() => {
                            handled.current = t.id;
                            setSelected(t.id);
                            ask(m.q, t.id);
                          }}
                        >
                          Выбрать: {t.label}
                        </button>
                      ))}
                      {m.a.sources.length > 0 && (
                        <div className="sources">
                          <strong>Использованные записи</strong>
                          {m.a.sources.map((s) => (
                            <button
                              key={s.kind + s.id}
                              onClick={() => source(s)}
                            >
                              <span>
                                {s.label}
                                <small>{dateLabel(s.date)}</small>
                              </span>
                              <ArrowUpRight size={15} />
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="answer-actions">
                        <button
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(m.a.text);
                              notify("Текст скопирован");
                            } catch {
                              notify(
                                "Копирование недоступно. Выделите текст и скопируйте вручную.",
                              );
                            }
                          }}
                        >
                          <Copy size={14} /> Скопировать
                        </button>
                        <button
                          onClick={() =>
                            mutate(
                              () => {},
                              "Сообщение об ошибке демо-помощника записано локально. Вопрос: " +
                                m.q.slice(0, 150),
                            )
                          }
                        >
                          Сообщить об ошибке
                        </button>
                      </div>
                      {chair && m.a.draft && (
                        <button
                          className="secondary"
                          onClick={() => useDraft(m.a)}
                        >
                          {m.a.draft === "announcement"
                            ? "Заполнить сведения"
                            : m.a.draft === "reply"
                              ? "Просмотреть и отредактировать ответ"
                              : "Просмотреть проект и сохранить черновик"}
                        </button>
                      )}
                    </>
                  )}
                </article>
              </div>
            );
          })}
          <div ref={bottom} />
        </div>
        <div className="suggestions">
          {examples.map((example) => (
            <button key={example} onClick={() => ask(example)}>
              {example}
              <ArrowUpRight size={14} />
            </button>
          ))}
        </div>
        <form
          className="chat-input"
          onSubmit={(e) => {
            e.preventDefault();
            ask(q);
          }}
        >
          <input
            aria-label="Вопрос помощнику"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            maxLength={2000}
            placeholder="Например: Найди документ: смета"
          />
          <button
            className="primary"
            aria-label="Отправить вопрос"
            disabled={!q.trim()}
          >
            <Send size={18} />
          </button>
        </form>
      </section>
      <aside className="chat-aside">
        <span className="pill teal">ПОДСКАЗКА</span>
        <h3>
          Только данные
          <br />
          вашего дома
        </h3>
        <p>
          Ответ использует текущие записи и документы, доступные выбранному
          профилю. Архивы не входят в актуальный поиск.
        </p>
        <hr />
        <p>
          Сохраненный отчет — снимок данных. Новый вопрос о расходах использует
          актуальные суммы.
        </p>
        <small>
          Подготовленный текст проверяет человек. Помощник ничего не публикует и
          не закрывает обращения.
        </small>
      </aside>
    </div>
  );
}
