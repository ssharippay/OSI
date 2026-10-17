import type { Answer, Context, Source, State } from "../models";
import {
  visibleDocs,
  visibleTickets,
  isChair,
  overdue,
} from "../store/selectors";
import { totals, snapshot, reportText } from "../reports";
import { dateLabel, money } from "../utils";
export interface AIAdapter {
  answer(
    question: string,
    state: State,
    context: Context,
    selected?: string,
  ): Answer | Promise<Answer>;
}
export const demoAI = {
  answer(q: string, s: State, c: Context, selected?: string): Answer {
    const v = q.toLocaleLowerCase("ru");
    const chair = isChair(s, c);
    const docs = visibleDocs(s, c).filter((d) => d.status !== "Архив");
    const tickets = visibleTickets(s, c);
    const t = totals(s, c);
    const answer = (text: string, sources: Source[] = []): Answer => ({
      text,
      sources,
    });
    if (/закон|правов|юрид|стать[яи]|суд/.test(v))
      return answer(
        "Правовая база для произвольных юридических ответов не подключена. Я не могу проверить нормы законодательства по любому вопросу. В Мастере документов председателю доступен ограниченный набор вручную проверенных шаблонов; это не полная правовая база.",
      );
    if (/объявлен|отключ/.test(v) && chair)
      return {
        ...answer(
          "Для проекта объявления нужны событие, дата, время, причина и контакт. Нажмите «Заполнить сведения»: после подготовки вы сможете просмотреть текст и отдельно подтвердить публикацию.",
        ),
        draft: "announcement",
      };
    if (/отч[её]т/.test(v) && chair) {
      const r = snapshot(s, c);
      return {
        ...answer(
          reportText(r),
          t.rows.map((w) => ({
            kind: "work",
            id: w.id,
            label: w.title,
            date: w.date,
          })),
        ),
        draft: "report",
        report: r,
      };
    }
    if (/расход|потрат|деньг|сравни|план и факт/.test(v)) {
      return answer(
        `За ${c.month}: план — ${money(t.planned)}, фактические расходы — ${money(t.actual)}, разница — ${money(t.planned - t.actual)}. Это разница плана и факта, а не остаток на банковском счете.\n\n${t.rows.map((w) => `${w.title}: план ${money(w.planned)}, факт ${money(w.actual)}. ${w.status}. Результат: ${w.result || "не указан"}`).join("\n\n") || "Записей за выбранный месяц нет. Добавьте работу или выберите другой месяц."}`,
        t.rows.map((w) => ({
          kind: "work",
          id: w.id,
          label: w.title,
          date: w.date,
        })),
      );
    }
    if (/документ|смет/.test(v)) {
      let found = docs;
      const search = /найди|найти|поиск|смет/.test(v);
      if (search) {
        const term = /смет/.test(v)
          ? "смет"
          : q
              .replace(
                /^.*?документ(?:ы|а)?(?:\s+по (?:названию|тексту))?\s*[:«"-]?\s*/i,
                "",
              )
              .replace(/[»"?]/g, "")
              .trim()
              .toLocaleLowerCase("ru");
        if (!term || term === "по названию")
          return answer(
            "Это поиск по тексту заголовков и содержимого доступных документов. Напишите, например: «Найди документ: смета».",
          );
        found = docs.filter((d) =>
          (d.title + " " + d.body).toLocaleLowerCase("ru").includes(term),
        );
      }
      if (/жител/.test(v))
        found = found.filter(
          (d) => d.status === "Опубликован" && d.audience === "residents",
        );
      return answer(
        `Поиск по тексту доступных заголовков и содержимого.\n${found.length ? found.map((d) => `«${d.title}» — ${d.status}, версия ${d.version}. Обновлён: ${dateLabel(d.updatedAt)}.`).join("\n") : "Подходящих доступных документов нет. Уточните название или попросите председателя опубликовать документ."}`,
        found.map((d) => ({
          kind: "doc",
          id: d.id,
          label: d.title,
          date: d.updatedAt,
        })),
      );
    }
    if (/протеч|как сообщить|авари/.test(v))
      return answer(
        "Создайте обращение: укажите тему, место проблемы и описание, при необходимости добавьте фото. Демо не связано с настоящей диспетчерской и не вызывает аварийную службу. При непосредственной угрозе жизни звоните 112.",
      );
    if (/обращ|заяв|статус|что сделано|ответ/.test(v)) {
      let rows = tickets;
      if (/просроч/.test(v)) rows = rows.filter((x) => overdue(x));
      else if (/не выполн/.test(v))
        rows = rows.filter((x) => x.status !== "Выполнено");
      const specific = /мо[её]м|мо[её]й|моему|по этому|подготовь ответ/.test(v);
      if (specific) {
        const chosen = rows.find((x) => x.id === selected);
        if (chosen) rows = [chosen];
        else if (rows.length > 1)
          return {
            ...answer(
              "Найдено несколько доступных обращений. Выберите нужное: я покажу его статус, результат и последнее сообщение.",
            ),
            choices: rows.map((x) => ({ id: x.id, label: x.subject })),
          };
      }
      if (!rows.length)
        return answer(
          "Подходящих обращений нет. Срок не назначен — это не просрочка. Проверьте выбранный дом или создайте обращение.",
        );
      const text = rows
        .map(
          (x) =>
            `«${x.subject}» — ${x.status}${overdue(x) ? ", просрочено" : ""}. Место: ${x.location || "не указано"}. Срок: ${x.dueDate ? dateLabel(x.dueDate) : "не назначен"}. Исполнитель: ${x.assignee || "не назначен"}.\nРезультат: ${x.result || "пока не указан"}.\nПоследнее сообщение: ${x.messages.at(-1)?.text || "сообщений пока нет"}.`,
        )
        .join("\n\n");
      return {
        ...answer(
          chair && /подготовь ответ/.test(v)
            ? "Проект ответа.\nСпасибо за сообщение. По актуальным данным:\n" +
                text +
                "\nЕсли у вас остались вопросы, напишите в переписке обращения."
            : text,
          rows.map((x) => ({
            kind: "ticket",
            id: x.id,
            label: x.subject,
            date: x.history.at(-1)?.date || x.createdAt,
          })),
        ),
        ...(chair && rows.length === 1 && /подготовь ответ/.test(v)
          ? { draft: "reply" as const }
          : {}),
      };
    }
    return answer(
      "Демонстрационный режим ограничен подготовленными сценариями. Могу сравнить план и расходы за выбранный месяц, найти документ по тексту, показать обращения и сроки. Выберите пример вопроса или уточните запрос.",
    );
  },
} satisfies AIAdapter;
