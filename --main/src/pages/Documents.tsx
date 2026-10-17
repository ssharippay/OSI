import { useState } from "react";
import { FileText, Plus, Search } from "lucide-react";
import { useApp } from "../AppContext";
import { visibleDocs } from "../store/selectors";
import { Status, Empty } from "../components/Common";
import { audienceLabel, dateLabel } from "../utils";
export function Documents() {
  const { data, c, chair, open, selected, go } = useApp();
  const [filter, setFilter] = useState(
    selected.startsWith("filter:") ? selected.slice(7) : "Актуальные",
  );
  const [query, setQuery] = useState("");
  const docs = visibleDocs(data, c).filter(
    (d) =>
      (filter === "Все" ||
        (filter === "Актуальные" && d.status !== "Архив") ||
        d.status === filter) &&
      (d.title + " " + d.body).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="section-title">
        <p>
          Новые документы сохраняются как черновики. Публикация — отдельное
          действие.
        </p>
        {chair && (
          <button
            className="primary"
            onClick={() => open({ kind: "document" })}
          >
            <Plus size={17} /> Добавить документ
          </button>
        )}
      </div>
      <section className="card toolbar">
        {chair && (
          <div className="filters">
            {["Актуальные", "Черновик", "Опубликован", "Архив", "Все"].map(
              (v) => (
                <button
                  key={v}
                  className={v === filter ? "selected" : ""}
                  onClick={() => setFilter(v)}
                >
                  {v}
                </button>
              ),
            )}
          </div>
        )}
        <label className="search">
          <Search size={17} />
          <input
            aria-label="Поиск по тексту документов"
            placeholder="Поиск по тексту"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </section>
      <div className="document-grid">
        {docs.map((d) => (
          <section className="card document" key={d.id}>
            <div className="section-title">
              <span className="icon-tile teal">
                <FileText />
              </span>
              <Status value={d.status} />
            </div>
            <h2>{d.title}</h2>
            <small>
              {audienceLabel(d.audience)} · версия {d.version}
            </small>
            <p>{d.body.slice(0, 120)}</p>
            {d.wizardSource?.needsUpdate && (
              <p className="info-note">
                Копия требует обновления: исходный проект изменен.
              </p>
            )}
            <small>Обновлён: {dateLabel(d.updatedAt)}</small>
            <div className="button-row">
              <button
                className="secondary"
                onClick={() => open({ kind: "read-doc", id: d.id })}
              >
                Просмотреть
              </button>
              {chair && (
                <>
                  <button
                    className="text-btn"
                    onClick={() =>
                      d.wizardSource
                        ? go("wizard")
                        : open({ kind: "document", id: d.id })
                    }
                  >
                    {d.wizardSource ? "Обновить через мастер" : "Редактировать"}
                  </button>
                  {d.status === "Черновик" && (
                    <button
                      className="text-btn"
                      onClick={() =>
                        open({
                          kind: "publish-doc",
                          id: d.id,
                          version: d.version,
                        })
                      }
                    >
                      Опубликовать
                    </button>
                  )}
                  {d.status !== "Архив" && (
                    <button
                      className="text-btn"
                      onClick={() =>
                        open({
                          kind: "archive-doc",
                          id: d.id,
                          version: d.version,
                        })
                      }
                    >
                      В архив
                    </button>
                  )}
                </>
              )}
            </div>
          </section>
        ))}
      </div>
      {!docs.length && (
        <section className="card">
          <Empty>
            Подходящих документов нет. Жителям доступны только опубликованные
            документы с аудиторией «Жители и председатель».
          </Empty>
        </section>
      )}
    </>
  );
}
