import { Plus, Megaphone } from "lucide-react";
import { useApp } from "../AppContext";
import { visibleAnnouncements } from "../store/selectors";
import { dateLabel } from "../utils";
export function Announcements() {
  const { data, c, open } = useApp();
  return (
    <>
      <div className="section-title">
        <p>
          Новости текущего дома. Публикация нового текста требует подтверждения.
        </p>
        <button
          className="primary"
          onClick={() => open({ kind: "announcement" })}
        >
          <Plus size={17} /> Создать объявление
        </button>
      </div>
      <div className="document-grid">
        {visibleAnnouncements(data, c).map((a) => (
          <section className="card" key={a.id}>
            <div className="section-title">
              <Megaphone size={22} />
              <span className="pill">{a.important ? "Важное" : "Новость"}</span>
            </div>
            <h2>{a.title}</h2>
            <p className="pre">{a.body}</p>
            <div className="card-footer">
              <small>{dateLabel(a.date)}</small>
              <button
                className="secondary"
                onClick={() => open({ kind: "announcement", id: a.id })}
              >
                Редактировать
              </button>
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
