import { FileAttachments } from "../live/FileAttachments";
import { Download, Printer, RotateCcw, FileText } from "lucide-react";
import { useState, useEffect } from "react";
import { useApp } from "../AppContext";
import { Modal, Status, download } from "./Common";
import {
  visibleDocs,
  visibleWorks,
  visibleAnnouncements,
  accessibleHouses,
} from "../store/selectors";
import { documentStatus } from "../store/actions";
import { localAdapter, STORAGE_KEY } from "../store";
import { seed } from "../store/migration";
import { ReportView } from "../reports/ReportView";
import { reportText } from "../reports";
import { money, dateLabel, audienceLabel } from "../utils";
import {
  TicketForm,
  DocumentForm,
  WorkForm,
  AnnouncementForm,
  AnnouncementBuilder,
} from "./Forms";
type InstallEvent = Event & { prompt: () => Promise<void> };
export function Dialogs() {
  const {
    data,
    live,
    c,
    chair,
    dialog,
    open,
    mutate,
    notify,
    profile,
    setChats,
    go,
  } = useApp();
  const [install, setInstall] = useState<InstallEvent | null>(null);
  useEffect(() => {
    const callback = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", callback);
    return () => window.removeEventListener("beforeinstallprompt", callback);
  }, []);
  if (!dialog || ["ask", "reply-draft"].includes(dialog.kind)) return null;
  const close = () => open(null);
  const doc = visibleDocs(data, c).find((d) => d.id === dialog.id);
  const work = visibleWorks(data, c).find((w) => w.id === dialog.id);
  const announcement = visibleAnnouncements(data, c).find(
    (a) => a.id === dialog.id,
  );
  const titles: Record<string, string> = {
    ticket: "Новое обращение",
    document: dialog.id ? "Редактировать документ" : "Новый документ",
    work: dialog.id
      ? "Редактировать работу или расход"
      : "Добавить работу или расход",
    report: "Подготовить проект отчета",
    "view-report": "Просмотреть проект отчета",
    "read-doc": doc?.title || "Документ недоступен",
    "read-work": work?.title || "Работа недоступна",
    "read-announcement": announcement?.title || "Объявление недоступно",
    announcement: "Объявление дома",
    "announcement-builder": "Сведения для объявления",
    "publish-doc": "Подтвердить публикацию документа",
    "archive-doc": "Отправить документ в архив",
    demo: "Режим демонстрации",
    reset: "Сбросить демоданные",
    install: "Установить ҮйКөмек",
  };
  const chairActions = [
    "document",
    "work",
    "report",
    "announcement",
    "announcement-builder",
    "publish-doc",
    "archive-doc",
  ];
  const allowed = !chairActions.includes(dialog.kind) || chair;
  return (
    <Modal
      key={dialog.kind + "-" + (dialog.id || "")}
      title={titles[dialog.kind] || "Просмотр"}
      onClose={close}
      wide={["report", "view-report"].includes(dialog.kind) || !!doc?.report}
    >
      {!allowed ? (
        <p>Это действие доступно только председателю текущего дома.</p>
      ) : dialog.kind === "ticket" ? (
        <TicketForm />
      ) : dialog.kind === "document" || dialog.kind === "report" ? (
        <>
          {dialog.id && !doc ? (
            <p>Документ больше недоступен.</p>
          ) : (
            <DocumentForm />
          )}
        </>
      ) : dialog.kind === "work" ? (
        <>
          {dialog.id && !work ? <p>Работа больше недоступна.</p> : <WorkForm />}
        </>
      ) : dialog.kind === "announcement" ? (
        <AnnouncementForm />
      ) : dialog.kind === "announcement-builder" ? (
        <AnnouncementBuilder />
      ) : dialog.kind === "publish-doc" || dialog.kind === "archive-doc" ? (
        doc ? (
          <>
            <h3>{doc.title}</h3>
            <p>
              Аудитория: <strong>{audienceLabel(doc.audience)}</strong>.
            </p>
            <p>
              {dialog.kind === "publish-doc"
                ? doc.audience === "residents"
                  ? "После подтверждения документ увидят жители текущего дома и председатель."
                  : "После подтверждения документ останется доступен только председателю. Жители его не увидят."
                : "Документ исчезнет из актуальных списков и ответов помощника. Председатель сможет найти его в архиве."}
            </p>
            <p className="muted">
              Версия {doc.version}. Текущий статус: {doc.status}.
            </p>
            <div className="button-row">
              <button
                className="primary"
                onClick={async () => {
                  if (
                    await mutate(
                      (s) =>
                        documentStatus(
                          s,
                          c,
                          doc.id,
                          dialog.kind === "publish-doc"
                            ? "Опубликован"
                            : "Архив",
                          dialog.version || doc.version,
                        ),
                      dialog.kind === "publish-doc"
                        ? `Опубликован документ «${doc.title}». Аудитория: ${audienceLabel(doc.audience)}.`
                        : `Документ «${doc.title}» перемещён в архив`,
                    )
                  )
                    close();
                }}
              >
                {dialog.kind === "publish-doc"
                  ? "Подтвердить публикацию"
                  : "Подтвердить архивирование"}
              </button>
              <button className="secondary" onClick={close}>
                Отмена
              </button>
            </div>
          </>
        ) : (
          <p>Документ недоступен.</p>
        )
      ) : dialog.kind === "read-doc" ? (
        doc ? (
          <>
            <div className="document-meta">
              <Status value={doc.status} />
              <span>
                {audienceLabel(doc.audience)} · версия {doc.version}
              </span>
            </div>
            <p className="muted">
              Создан: {dateLabel(doc.createdAt)}
              <br />
              Обновлён: {dateLabel(doc.updatedAt)}
            </p>
            {doc.report ? (
              <div className="print-area">
                <ReportView report={doc.report} />
                {doc.body !== reportText(doc.report) && (
                  <section className="report-notes">
                    <h2>Текст проекта, отредактированный автором</h2>
                    <p className="pre">{doc.body}</p>
                  </section>
                )}
              </div>
            ) : (
              <>
                {doc.wizardSource?.needsUpdate && (
                  <p className="info-note">
                    Копия требует обновления: исходный проект изменен.
                    Опубликованный текст относится к версии{" "}
                    {doc.wizardSource.version}.
                  </p>
                )}
                <p className="pre document-body">{doc.body}</p>
                <FileAttachments
                  collection="docs"
                  id={doc.id}
                  canUpload={chair && doc.status === "Черновик"}
                />
              </>
            )}
            <div className="button-row">
              <button
                className="secondary"
                onClick={() =>
                  live
                    ? location.assign(
                        `/api/houses/${c.houseId}/records/docs/${doc.id}/download`,
                      )
                    : download(doc.title + ".txt", doc.body)
                }
              >
                <Download size={16} /> Скачать текст
              </button>
              {doc.report && (
                <button className="secondary" onClick={() => window.print()}>
                  <Printer size={16} /> Печать / Сохранить в PDF
                </button>
              )}
            </div>
            {chair && (
              <div className="button-row">
                <button
                  className="text-btn"
                  onClick={() => open({ kind: "document", id: doc.id })}
                >
                  Редактировать
                </button>
                {doc.status === "Черновик" && (
                  <button
                    className="text-btn"
                    onClick={() =>
                      open({
                        kind: "publish-doc",
                        id: doc.id,
                        version: doc.version,
                      })
                    }
                  >
                    Опубликовать
                  </button>
                )}
                {doc.status !== "Архив" && (
                  <button
                    className="text-btn"
                    onClick={() =>
                      open({
                        kind: "archive-doc",
                        id: doc.id,
                        version: doc.version,
                      })
                    }
                  >
                    В архив
                  </button>
                )}
              </div>
            )}
          </>
        ) : (
          <p>
            Документ недоступен этому профилю или больше не опубликован для
            жителей.
          </p>
        )
      ) : dialog.kind === "read-work" ? (
        work ? (
          <>
            <Status value={work.status} />
            <p className="pre">{work.body}</p>
            <div className="finance-total">
              <span>
                План<strong>{money(work.planned)}</strong>
              </span>
              <span>
                Фактический расход<strong>{money(work.actual)}</strong>
              </span>
            </div>
            <p>Дата: {dateLabel(work.date)}</p>
            <h3>Результат выполнения</h3>
            <p className="pre">{work.result || "Пока не указан"}</p>
            {visibleDocs(data, c).some((d) => d.id === work.doc) ? (
              <button
                className="secondary"
                onClick={() => open({ kind: "read-doc", id: work.doc })}
              >
                <FileText size={16} /> Открыть документ-основание
              </button>
            ) : (
              <p className="muted">Доступный документ-основание не указан.</p>
            )}
            {chair && (
              <div className="button-row">
                <button
                  className="secondary"
                  onClick={() => open({ kind: "work", id: work.id })}
                >
                  Редактировать
                </button>
              </div>
            )}
          </>
        ) : (
          <p>Запись недоступна.</p>
        )
      ) : dialog.kind === "read-announcement" ? (
        <>
          <p className="pre">{announcement?.body || "Запись недоступна."}</p>
          <small>{dateLabel(announcement?.date || "")}</small>
        </>
      ) : dialog.kind === "view-report" ? (
        dialog.report ? (
          <>
            <div className="print-area">
              <ReportView report={dialog.report} />
            </div>
            <div className="button-row">
              <button className="secondary" onClick={() => window.print()}>
                <Printer size={16} /> Печать / Сохранить в PDF
              </button>
              <button
                className="secondary"
                onClick={() =>
                  download(
                    "Проект отчета " + dialog.report!.month + ".txt",
                    reportText(dialog.report!),
                  )
                }
              >
                <Download size={16} /> Скачать текст
              </button>
              {chair && (
                <button
                  className="primary"
                  onClick={() =>
                    open({ kind: "report", report: dialog.report })
                  }
                >
                  Сохранить черновик
                </button>
              )}
            </div>
          </>
        ) : (
          <p>Отчет недоступен.</p>
        )
      ) : dialog.kind === "demo" ? (
        <>
          <p className="info-note">
            Режим демонстрации позволяет посмотреть разные интерфейсы. Это не
            вход в защищенную систему и не способ получения настоящих прав
            председателя. Все данные вымышлены.
          </p>
          <div className="demo-profiles">
            {data.users
              .filter((u) => accessibleHouses(data, u.id).length)
              .map((u) => (
                <button
                  className="secondary"
                  key={u.id}
                  onClick={() => profile(u.id)}
                >
                  <strong>{u.name}</strong>
                  <span>
                    {data.memberships
                      .filter((m) => m.userId === u.id)
                      .some((m) => m.role === "chair")
                      ? "Председатель"
                      : "Житель"}{" "}
                    ·{" "}
                    {accessibleHouses(data, u.id)
                      .map((h) => h.name)
                      .join(", ")}
                  </span>
                </button>
              ))}
          </div>
          <div className="button-row">
            <button
              className="secondary"
              onClick={() => open({ kind: "install" })}
            >
              Установить приложение
            </button>
            <button
              className="secondary"
              onClick={async () => {
                try {
                  download(
                    "uykomek-data-backup.json",
                    localStorage.getItem(STORAGE_KEY) || "{}",
                    "application/json",
                  );
                } catch {
                  notify("Браузер запретил чтение данных.");
                }
              }}
            >
              Скачать копию данных
            </button>
            <button
              className="text-btn"
              onClick={() => open({ kind: "reset" })}
            >
              <RotateCcw size={15} /> Сбросить демоданные
            </button>
          </div>
        </>
      ) : dialog.kind === "reset" ? (
        <>
          <p>
            Все добавленные записи и переписка будут удалены. Исходные
            вымышленные данные будут восстановлены. Перед сбросом можно скачать
            копию через «Режим демонстрации».
          </p>
          <div className="button-row">
            <button
              className="danger"
              onClick={async () => {
                try {
                  localAdapter.save(seed());
                  setChats({});
                  profile("u1");
                  go("home");
                  notify("Демоданные восстановлены");
                } catch (e) {
                  notify((e as Error).message);
                }
              }}
            >
              Сбросить демоданные
            </button>
            <button className="secondary" onClick={close}>
              Отмена
            </button>
          </div>
        </>
      ) : dialog.kind === "install" ? (
        <>
          <p>
            На Android: Chrome → меню → «Установить приложение». На iPhone:
            Safari → «Поделиться» → «На экран Домой».
          </p>
          <p>
            Для установки нужны HTTPS или localhost и поддерживающий браузер.
            После первой загрузки готовой сборки возможно открытие без сети.
            Данные остаются в браузере устройства.
          </p>
          {install && (
            <button
              className="primary"
              onClick={async () => {
                try {
                  await install.prompt();
                  setInstall(null);
                } catch {
                  notify("Откройте установку через меню браузера.");
                }
              }}
            >
              Установить приложение
            </button>
          )}
        </>
      ) : (
        <p>Это действие доступно на соответствующей странице.</p>
      )}
    </Modal>
  );
}
