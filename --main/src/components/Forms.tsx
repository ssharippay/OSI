import { useState, type FormEvent, type ReactNode } from "react";
import type { Doc, Work } from "../models";
import { useApp } from "../AppContext";
import {
  visibleDocs,
  visibleWorks,
  visibleAnnouncements,
} from "../store/selectors";
import { saveDoc, saveWork, chairOnly } from "../store/actions";
import { reportText } from "../reports";
import { stamp, today, uid, money } from "../utils";
const value = (form: FormData, key: string) =>
  String(form.get(key) || "").trim();
function PendingFields({ children }: { children: ReactNode }) {
  const { live, syncState } = useApp();
  return (
    <fieldset
      className="plain-fieldset"
      disabled={live && syncState.startsWith("Сохраняем")}
    >
      {children}
    </fieldset>
  );
}
export function FormFooter({ submit }: { submit: string }) {
  const { open } = useApp();
  return (
    <div className="button-row">
      <button className="primary">{submit}</button>
      <button className="secondary" type="button" onClick={() => open(null)}>
        Отмена
      </button>
    </div>
  );
}
export function TicketForm() {
  const { c, live, mutate, open, notify } = useApp();
  const [photo, setPhoto] = useState("");
  const [loading, setLoading] = useState(false);
  async function image(file?: File) {
    setPhoto("");
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      notify("Выберите JPG, PNG или WebP.");
      return;
    }
    if (file.size > 1.5 * 1024 * 1024) {
      notify("Фото должно быть не больше 1,5 МБ.");
      return;
    }
    setLoading(true);
    const reader = new FileReader();
    reader.onerror = () => {
      setLoading(false);
      notify("Не удалось прочитать фото.");
    };
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        setPhoto(String(reader.result));
        setLoading(false);
      };
      img.onerror = () => {
        setLoading(false);
        notify("Не удалось прочитать изображение.");
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (loading) {
      notify("Дождитесь загрузки фото.");
      return;
    }
    const subject = value(f, "subject"),
      body = value(f, "body");
    if (!subject || !body) {
      notify("Заполните тему и описание.");
      return;
    }
    if (
      await mutate(
        (s) =>
          s.tickets.unshift({
            id: uid(),
            houseId: c.houseId,
            ownerId: c.userId,
            subject,
            body,
            category: value(f, "category"),
            location: value(f, "location"),
            createdAt: stamp(),
            dueDate: "",
            assignee: "",
            result: "",
            photo,
            status: "Новое",
            history: [{ date: stamp(), text: "Создано новое обращение" }],
            messages: [],
          }),
        "Обращение отправлено председателю",
      )
    )
      open(null);
  }
  return (
    <form onSubmit={submit}>
      <PendingFields>
        <p className="emergency-note">
          {live
            ? "Приложение не заменяет экстренный вызов. При непосредственной угрозе жизни звоните 112."
            : "Демо не связано с настоящей диспетчерской. При непосредственной угрозе жизни звоните 112."}
        </p>
        <label>
          Тема
          <input aria-label="Тема" name="subject" required maxLength={150} />
        </label>
        <label>
          Категория
          <select aria-label="Категория" name="category">
            {[
              "Общее имущество",
              "Освещение",
              "Водоснабжение",
              "Отопление",
              "Уборка",
              "Другое",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Место проблемы
          <input
            aria-label="Место проблемы"
            name="location"
            maxLength={200}
            placeholder="Подъезд, этаж или другое место"
          />
        </label>
        <label>
          Описание
          <textarea
            aria-label="Описание"
            name="body"
            required
            maxLength={5000}
          />
        </label>
        <label>
          Фото: JPG, PNG или WebP до 1,5 МБ
          <input
            aria-label="Фото к обращению"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => image(e.target.files?.[0])}
          />
        </label>
        {loading && <p role="status">Загружаем фото…</p>}
        {photo && (
          <>
            <img
              className="attachment"
              alt="Предпросмотр прикрепленного фото"
              src={photo}
            />
            <button
              type="button"
              className="text-btn"
              onClick={() => setPhoto("")}
            >
              Убрать фото
            </button>
          </>
        )}
        <FormFooter submit="Отправить обращение" />
      </PendingFields>
    </form>
  );
}
export function DocumentForm() {
  const { data, c, dialog, mutate, open, notify } = useApp();
  const original = visibleDocs(data, c).find((d) => d.id === dialog?.id);
  const [version] = useState(original?.version);
  const r = dialog?.report;
  const body = original?.body || (r ? reportText(r) : dialog?.text || "");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const title = value(f, "title"),
      body = value(f, "body");
    if (!title || !body) {
      notify("Заполните название и текст.");
      return;
    }
    if (
      await mutate((s) => {
        if (
          original &&
          s.docs.find((d) => d.id === original.id)?.version !== version
        )
          throw new Error(
            "Документ изменён в другой вкладке. Откройте его заново.",
          );
        saveDoc(
          s,
          c,
          { title, body, audience: value(f, "audience") as Doc["audience"] },
          original?.id,
          r,
        );
      }, "Черновик документа сохранён")
    )
      open(null);
  }
  return (
    <form onSubmit={submit}>
      <PendingFields>
        <p className="info-note">
          Документ сохранится как черновик. Жители не увидят его до отдельной
          публикации.
          {original?.status === "Опубликован"
            ? " После редактирования документ снова станет черновиком."
            : ""}
        </p>
        <label>
          Название
          <input
            aria-label="Название"
            name="title"
            required
            maxLength={150}
            defaultValue={
              original?.title || (r ? "Проект отчета за " + r.month : "")
            }
          />
        </label>
        <label>
          Аудитория
          <select
            name="audience"
            aria-label="Аудитория"
            defaultValue={original?.audience || "residents"}
          >
            <option value="residents">Жители и председатель</option>
            <option value="chair">Только председатель</option>
          </select>
        </label>
        <label>
          Текст
          <textarea
            name="body"
            aria-label="Текст"
            required
            maxLength={100000}
            rows={r ? 12 : 7}
            defaultValue={body}
          />
        </label>
        {r && (
          <p className="muted">
            Суммы и таблица отчета сохранятся снимком данных. Изменения расходов
            позднее не изменят этот отчет.
          </p>
        )}
        <FormFooter submit="Сохранить черновик" />
      </PendingFields>
    </form>
  );
}
export function WorkForm() {
  const { data, c, dialog, mutate, open, notify } = useApp();
  const original = visibleWorks(data, c).find((w) => w.id === dialog?.id);
  const [updatedAt] = useState(original?.updatedAt);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const input: Omit<Work, "id" | "houseId" | "updatedAt"> = {
      title: value(f, "title"),
      body: value(f, "body"),
      planned: Number(value(f, "planned")),
      actual: Number(value(f, "actual")),
      date: value(f, "date"),
      status: value(f, "status"),
      doc: value(f, "doc"),
      result: value(f, "result"),
    };
    if (!input.title || !input.body) {
      notify("Заполните название и описание.");
      return;
    }
    const event = original
      ? `Изменена работа «${original.title}»: план ${money(original.planned)} → ${money(input.planned)}, факт ${money(original.actual)} → ${money(input.actual)}, дата ${original.date} → ${input.date}.`
      : `Добавлена работа «${input.title}»: план ${money(input.planned)}, факт ${money(input.actual)}, дата ${input.date}.`;
    if (
      await mutate((s) => saveWork(s, c, input, original?.id, updatedAt), event)
    )
      open(null);
  }
  return (
    <form onSubmit={submit}>
      <PendingFields>
        <label>
          Название
          <input
            aria-label="Название"
            name="title"
            required
            maxLength={150}
            defaultValue={original?.title}
          />
        </label>
        <label>
          Описание работы
          <textarea
            aria-label="Описание работы"
            name="body"
            required
            maxLength={5000}
            defaultValue={original?.body}
          />
        </label>
        <div className="form-grid">
          <label>
            Запланировано, ₸
            <input
              aria-label="Запланировано, ₸"
              name="planned"
              type="number"
              min="0"
              max="1000000000"
              step="0.01"
              required
              defaultValue={original?.planned || 0}
            />
          </label>
          <label>
            Фактический расход, ₸
            <input
              aria-label="Фактический расход, ₸"
              name="actual"
              type="number"
              min="0"
              max="1000000000"
              step="0.01"
              required
              defaultValue={original?.actual || 0}
            />
          </label>
          <label>
            Дата
            <input
              aria-label="Дата"
              name="date"
              type="date"
              required
              defaultValue={
                original?.date ||
                c.month +
                  (c.month === today().slice(0, 7) ? today().slice(7) : "-01")
              }
            />
          </label>
          <label>
            Статус
            <select
              aria-label="Статус работы"
              name="status"
              defaultValue={original?.status || "Запланировано"}
            >
              {["Запланировано", "В работе", "Выполнено"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Документ-основание
          <select
            aria-label="Документ-основание"
            name="doc"
            defaultValue={original?.doc || ""}
          >
            <option value="">Не указан</option>
            {visibleDocs(data, c).map((d) => (
              <option key={d.id} value={d.id}>
                {d.title} · {d.status}
              </option>
            ))}
          </select>
        </label>
        <label>
          Результат выполнения
          <textarea
            aria-label="Результат выполнения"
            name="result"
            maxLength={5000}
            defaultValue={original?.result}
          />
        </label>
        <FormFooter submit="Сохранить работу" />
      </PendingFields>
    </form>
  );
}
export function AnnouncementForm() {
  const { data, c, dialog, mutate, open, notify } = useApp();
  const original = visibleAnnouncements(data, c).find(
    (a) => a.id === dialog?.id,
  );
  const [pending, setPending] = useState<{
    title: string;
    body: string;
    important: boolean;
  } | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const a = {
      title: value(f, "title"),
      body: value(f, "body"),
      important: f.get("important") === "on",
    };
    if (!a.title || !a.body) {
      notify("Заполните название и текст.");
      return;
    }
    setPending(a);
  }
  async function publish() {
    if (!pending) return;
    if (
      await mutate((s) => {
        chairOnly(s, c);
        const a = {
          ...pending,
          id: original?.id || uid(),
          houseId: c.houseId,
          date: today(),
        };
        const i = s.announcements.findIndex(
          (x) => x.id === a.id && x.houseId === c.houseId,
        );
        if (i < 0) s.announcements.unshift(a);
        else s.announcements[i] = a;
      }, "Объявление опубликовано для жителей дома")
    )
      open(null);
  }
  return pending ? (
    <>
      <p className="info-note">
        Объявление увидят все жители текущего дома. Проверьте сведения перед
        публикацией.
      </p>
      <h3>{pending.title}</h3>
      <p className="pre">{pending.body}</p>
      <div className="button-row">
        <button className="primary" onClick={publish}>
          Подтвердить публикацию объявления
        </button>
        <button className="secondary" onClick={() => setPending(null)}>
          Вернуться к редактированию
        </button>
      </div>
    </>
  ) : (
    <form onSubmit={submit}>
      <PendingFields>
        <label>
          Название
          <input
            aria-label="Название"
            name="title"
            required
            maxLength={150}
            defaultValue={original?.title || dialog?.title}
          />
        </label>
        <label>
          Текст
          <textarea
            aria-label="Текст"
            name="body"
            required
            maxLength={20000}
            rows={8}
            defaultValue={original?.body || dialog?.text}
          />
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            name="important"
            defaultChecked={original?.important}
          />{" "}
          Важное объявление
        </label>
        <FormFooter submit="Просмотреть перед публикацией" />
      </PendingFields>
    </form>
  );
}
export function AnnouncementBuilder() {
  const { open, notify } = useApp();
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const values = ["event", "date", "time", "reason", "contact"].map((k) =>
          value(f, k),
        );
        if (values.some((v) => !v)) {
          notify("Заполните все сведения для объявления.");
          return;
        }
        const [event, date, time, reason, contact] = values;
        open({
          kind: "announcement",
          title: event,
          text: `Уважаемые жители!\n\n${event}\nДата: ${date}\nВремя: ${time}\nПричина: ${reason}\nКонтакт для вопросов: ${contact}\n\nСпасибо за понимание.`,
        });
      }}
    >
      <p>
        Помощник составит текст из ваших полей. Автоматической публикации нет.
      </p>
      <label>
        Событие
        <input
          name="event"
          aria-label="Событие"
          required
          maxLength={250}
          placeholder="Например, отключение холодной воды"
        />
      </label>
      <div className="form-grid">
        <label>
          Дата события
          <input name="date" aria-label="Дата события" type="date" required />
        </label>
        <label>
          Время
          <input
            name="time"
            aria-label="Время"
            required
            maxLength={100}
            placeholder="С 10:00 до 12:00"
          />
        </label>
      </div>
      <label>
        Причина
        <input name="reason" aria-label="Причина" required maxLength={500} />
      </label>
      <label>
        Контакт
        <input
          name="contact"
          aria-label="Контакт"
          required
          maxLength={250}
          placeholder="Демонстрационный контакт ответственного"
        />
      </label>
      <FormFooter submit="Подготовить текст" />
    </form>
  );
}
