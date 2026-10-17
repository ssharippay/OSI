import { api } from "../live/api";
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  Save,
  Download,
  Printer,
} from "lucide-react";
import { useApp } from "../AppContext";
import { Modal, Status, Empty } from "../components/Common";
import type { WizardDocument, WizardInput, Template } from "./models";
import { templates, officialSources, CHECKED_AT } from "./registry";
import { renderForm } from "./engine";
import { WizardFields, stepsFor } from "./Fields";
import { validate, meetingRules, voteArithmetic } from "./rules";
import {
  saveWizard,
  wizardDocuments,
  publishWizardCopy,
  residentProposal,
  archiveWizard,
} from "./store";
import { WizardFormView } from "./FormView";
import { dateLabel, uid } from "../utils";
import { docxBlob, xlsxBlob, saveBlob } from "./exports";
import {
  fromHouse,
  houseProfile,
  houseDifferences,
  refreshFromHouse,
  copyEstimate,
} from "./house";
import { HouseCard } from "./HouseCard";
import { reviewMessages, type ReviewMessage } from "./review";
export function WizardPage() {
  const { data, live, c, chair, mutate, notify, setLeaveGuard, mutationError } =
    useApp();
  const [tab, setTab] = useState<"catalog" | "saved">("catalog");
  const [current, setCurrent] = useState<WizardDocument | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState("Сохранено");
  const [conflict, setConflict] = useState(false);
  const [modal, setModal] = useState<
    "preview" | "publish" | "sources" | "refresh" | null
  >(null);
  const [detail, setDetail] = useState<Template | null>(null);
  const [showHouse, setShowHouse] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [publicText, setPublicText] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("Актуальные");
  const [jumpField, setJumpField] = useState("");
  const currentRef = useRef(current),
    dirtyRef = useRef(dirty),
    conflictRef = useRef(conflict);
  currentRef.current = current;
  dirtyRef.current = dirty;
  conflictRef.current = conflict;
  const persistRef = useRef<
    (ready?: boolean, quiet?: boolean) => Promise<boolean>
  >(async () => false);
  function select(d: WizardDocument | null, changed = false) {
    currentRef.current = d;
    dirtyRef.current = changed;
    setCurrent(d);
    setDirty(changed);
    setConflict(false);
    conflictRef.current = false;
    setSaveState(changed ? "Есть несохраненные изменения" : "Сохранено");
  }
  function change(d: WizardDocument) {
    currentRef.current = d;
    dirtyRef.current = true;
    setCurrent(d);
    setDirty(true);
    setSaveState("Есть несохраненные изменения");
  }
  const pendingSave = useRef<Promise<boolean> | null>(null);
  async function persist(ready?: boolean, quiet = false): Promise<boolean> {
    if (pendingSave.current) {
      const pending = pendingSave.current;
      const ok = await pending;
      if (pendingSave.current === pending) pendingSave.current = null;
      if (!ok) return false;
      if (!dirtyRef.current && ready !== true) return true;
    }
    const task = saveActual(ready, quiet);
    pendingSave.current = task;
    try {
      return await task;
    } finally {
      if (pendingSave.current === task) pendingSave.current = null;
    }
  }
  async function saveActual(ready?: boolean, quiet = false) {
    const doc = currentRef.current;
    if (!doc || conflictRef.current) return false;
    setSaveState("Сохраняем");
    let saved: WizardDocument | undefined;
    const ok = await mutate(
      (s) => {
        saved = saveWizard(
          s,
          c,
          {
            ...doc,
            status:
              ready === undefined
                ? doc.status
                : ready
                  ? "Подготовлен для проверки"
                  : "Черновик",
          },
          doc.version,
        );
      },
      ready
        ? "Проект подготовлен для проверки; не утвержден"
        : "Черновик мастера сохранён",
      quiet,
    );
    if (ok && saved) {
      const latest = currentRef.current;
      if (latest?.id === doc.id && latest !== doc) {
        const next = {
          ...latest,
          version: saved.version,
          revision: saved.revision,
          serverVersion: (saved as any).serverVersion,
          publication: saved.publication,
          publicDocumentId: saved.publicDocumentId,
          publishedCopies: saved.publishedCopies,
        };
        currentRef.current = next;
        setCurrent(next);
        dirtyRef.current = true;
        setDirty(true);
        setSaveState("Есть несохраненные изменения");
      } else if (latest?.id === doc.id) select(structuredClone(saved));
    } else {
      setSaveState("Не удалось сохранить");
      if (
        /другой вкладке|другом устройстве|Конфликт|Версия/.test(
          mutationError.current,
        )
      ) {
        setConflict(true);
        conflictRef.current = true;
      }
    }
    return ok;
  }
  persistRef.current = persist;
  useEffect(() => {
    const guard = () => {
      if (!dirtyRef.current) return true;
      void persistRef.current(undefined, true);
      notify(
        "Сохраняем изменения. Дождитесь подтверждения и повторите переход.",
      );
      return false;
    };
    setLeaveGuard(guard);
    const unload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      setLeaveGuard(() => true);
      window.removeEventListener("beforeunload", unload);
    };
  }, []);
  useEffect(() => {
    if (!dirty || conflict) return;
    const timer = setTimeout(() => {
      if (navigator.locks)
        void navigator.locks.request("uykomek-wizard-save", () => {
          return persistRef.current(undefined, true);
        });
      else persistRef.current(undefined, true);
    }, 800);
    return () => clearTimeout(timer);
  }, [current, dirty, conflict]);
  useEffect(() => {
    if (!currentRef.current || pendingSave.current) return;
    const latest = data.wizardDocuments?.find(
      (d) => d.id === currentRef.current!.id,
    );
    if (
      latest &&
      (latest.version !== currentRef.current.version ||
        latest.revision !== currentRef.current.revision)
    ) {
      setConflict(true);
      conflictRef.current = true;
      setSaveState("Не удалось сохранить");
    }
  }, [data]);
  useEffect(() => {
    if (!jumpField) return;
    const el = document.querySelector<HTMLElement>(
      `[data-field="${jumpField}"]`,
    );
    let parent = el?.parentElement;
    while (parent) {
      if (parent instanceof HTMLDetailsElement) parent.open = true;
      parent = parent.parentElement;
    }
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    el?.querySelector<HTMLElement>("input, textarea, select, button")?.focus({
      preventScroll: true,
    });
    setJumpField("");
  }, [current?.step, jumpField]);
  if (!chair) return <p>Мастер доступен только председателю текущего дома.</p>;
  const docs = wizardDocuments(data, c).filter(
    (d) =>
      filter === "Все" ||
      (filter === "Актуальные" && d.status !== "Архив") ||
      d.status === filter,
  );
  const validation = current ? validate(current) : { errors: [], warnings: [] };
  const steps = current ? stepsFor(current) : [];
  const reviewStep = steps.length - 2;
  const previewDoc = current
    ? { ...current, blocks: dirty ? renderForm(current) : current.blocks }
    : null;
  const exportBlocked =
    current?.kind === "estimate" && validation.errors.length > 0;
  async function leaveEditor() {
    return (
      !dirtyRef.current ||
      (await persist(undefined, true)) ||
      window.confirm("Не удалось сохранить. Покинуть редактор без сохранения?")
    );
  }
  async function begin(t: Template) {
    if (!(await leaveEditor())) return;
    try {
      select(fromHouse(data, c, t), true);
    } catch (e) {
      notify((e as Error).message);
    }
  }
  async function edit(d: WizardDocument) {
    if (await leaveEditor()) select(structuredClone(d));
  }
  function update<K extends keyof WizardInput>(key: K, value: WizardInput[K]) {
    const doc = currentRef.current;
    if (doc)
      change({
        ...doc,
        input: { ...doc.input, [key]: value },
        status: "Черновик",
      });
  }
  function stepTo(step: number) {
    const doc = currentRef.current;
    if (!doc) return;
    change({ ...doc, step });
  }
  function jump(m: ReviewMessage) {
    stepTo(m.step);
    setJumpField(m.field);
  }
  async function exportFile(type: "docx" | "xlsx") {
    if (!previewDoc || exportBlocked) {
      notify("Исправьте ошибки на шаге проверки. Черновик можно сохранить.");
      return;
    }
    setBusy(true);
    try {
      if (live && dirty && !(await persist(undefined, true)))
        throw new Error("Сначала сохраните изменения на сервере.");
      const response = live
        ? await fetch(
            `/api/houses/${c.houseId}/wizard/${previewDoc.id}/export/${type}`,
            { credentials: "same-origin", cache: "no-store" },
          )
        : null;
      if (response && !response.ok)
        throw new Error(
          "Сервер не разрешил выгрузку. Проверьте доступ и сохраненную версию.",
        );
      const blob = response
        ? await response.blob()
        : type === "docx"
          ? await docxBlob(previewDoc)
          : await xlsxBlob(previewDoc);
      saveBlob(
        blob,
        `${previewDoc.template.id}-v${previewDoc.version}.${type}`,
      );
      notify("Файл проекта подготовлен. Скачивание не означает утверждение.");
    } catch (e) {
      notify((e as Error).message || "Не удалось подготовить файл.");
    } finally {
      setBusy(false);
    }
  }
  const exports = (
    <div className="button-row">
      <button className="secondary" onClick={() => setModal("preview")}>
        <FileText size={16} />
        Открыть предпросмотр
      </button>
      <button
        className="secondary"
        disabled={busy || exportBlocked}
        onClick={() => exportFile("docx")}
      >
        <Download size={16} />
        Скачать DOCX
      </button>
      {current?.kind === "estimate" && (
        <button
          className="secondary"
          disabled={busy || exportBlocked}
          onClick={() => exportFile("xlsx")}
        >
          Скачать XLSX
        </button>
      )}
    </div>
  );
  const templateCard = (t: Template) => (
    <article
      className={`card template-card ${!t.implemented ? "pending-template" : ""}`}
      key={t.id}
    >
      <span className="pill">{t.status}</span>
      <h3>{t.title}</h3>
      <p>{t.purpose}</p>
      <div className="button-row">
        {t.implemented && (
          <button className="primary" onClick={() => begin(t)}>
            Создать документ
          </button>
        )}
        <button className="text-btn" onClick={() => setDetail(t)}>
          Основание и ограничения
        </button>
      </div>
    </article>
  );
  return (
    <div className="wizard-page">
      {!current && (
        <div className="wizard-tabs">
          <button
            className={tab === "catalog" ? "selected" : ""}
            onClick={() => setTab("catalog")}
          >
            Каталог документов
          </button>
          <button
            className={tab === "saved" ? "selected" : ""}
            onClick={() => setTab("saved")}
          >
            Мои проекты ({wizardDocuments(data, c).length})
          </button>
          <button onClick={() => setShowHouse(!showHouse)}>
            Карточка дома
          </button>
        </div>
      )}
      {showHouse && !current && (
        <HouseCard onClose={() => setShowHouse(false)} />
      )}
      {!current ? (
        tab === "catalog" ? (
          <>
            <h2>Можно создать сейчас</h2>
            <div className="wizard-catalog">
              {templates.filter((t) => t.implemented).map(templateCard)}
            </div>
            <details className="card planned-templates">
              <summary>
                Планируются ({templates.filter((t) => !t.implemented).length})
              </summary>
              <div className="wizard-catalog">
                {templates.filter((t) => !t.implemented).map(templateCard)}
              </div>
            </details>
          </>
        ) : (
          <>
            <div className="filters wizard-filters">
              {[
                "Актуальные",
                "Черновик",
                "Подготовлен для проверки",
                "Архив",
                "Все",
              ].map((v) => (
                <button
                  key={v}
                  className={filter === v ? "selected" : ""}
                  onClick={() => setFilter(v)}
                >
                  {v}
                </button>
              ))}
            </div>
            {!docs.length && (
              <Empty>Проектов пока нет. Начните с каталога.</Empty>
            )}
            <div className="wizard-catalog">
              {docs.map((d) => (
                <section className="card" key={d.id}>
                  <Status value={d.status} />
                  <h3>{d.title}</h3>
                  <p>{d.publication}</p>
                  <small>Обновлен: {dateLabel(d.updatedAt)}</small>
                  <div className="button-row">
                    <button className="secondary" onClick={() => edit(d)}>
                      Открыть проект
                    </button>
                    {d.kind === "estimate" && (
                      <button
                        className="text-btn"
                        onClick={async () => {
                          const year = window.prompt(
                            "Год новой сметы. Цены нужно проверить заново.",
                            String(+d.input.year + 1),
                          );
                          if (year)
                            try {
                              select(copyEstimate(d, year), true);
                            } catch (e) {
                              notify((e as Error).message);
                            }
                        }}
                      >
                        Создать на другой год
                      </button>
                    )}
                  </div>
                </section>
              ))}
            </div>
          </>
        )
      ) : (
        <>
          <div className="wizard-editor-head">
            <button
              className="text-btn"
              onClick={async () => {
                if (await leaveEditor()) {
                  select(null);
                  setTab("saved");
                }
              }}
            >
              <ArrowLeft size={16} />К списку проектов
            </button>
            <div className="wizard-state">
              <Status value={current.status} />
              <span>{current.publication}</span>
              <b role="status" aria-live="polite">
                {saveState}
              </b>
            </div>
          </div>
          {conflict && (
            <section className="validation-errors" role="alert">
              <h3>Документ изменен в другой вкладке</h3>
              <p>Ваш ввод не перезаписан. Выберите, какую версию продолжить.</p>
              <div className="button-row">
                <button
                  className="secondary"
                  onClick={async () => {
                    const latest = data.wizardDocuments?.find(
                      (d) => d.id === current.id,
                    );
                    if (
                      latest &&
                      (!dirty ||
                        window.confirm(
                          "Открыть сохраненную версию? Текущий ввод будет заменен.",
                        ))
                    )
                      select(structuredClone(latest));
                  }}
                >
                  Открыть новую версию
                </button>
                <button
                  className="primary"
                  onClick={() =>
                    select(
                      {
                        ...structuredClone(current),
                        id: uid(),
                        version: 0,
                        status: "Черновик",
                        publication: "Не опубликован",
                        publicDocumentId: undefined,
                        publishedCopies: [],
                        title: current.title + " — моя копия",
                      },
                      true,
                    )
                  }
                >
                  Сохранить свою копию
                </button>
              </div>
            </section>
          )}
          {saveState === "Не удалось сохранить" && !conflict && (
            <p className="validation-errors" role="alert">
              Изменения остаются в редакторе. {mutationError.current} Повторите
              сохранение; не закрывайте вкладку до успешной записи.
            </p>
          )}
          <section className="card wizard-editor">
            <label className="wizard-field">
              Название проекта
              <input
                aria-label="Название проекта"
                value={current.title}
                maxLength={150}
                onChange={(e) =>
                  change({
                    ...current,
                    title: e.target.value,
                    status: "Черновик",
                  })
                }
              />
            </label>
            <details className="wizard-basis">
              <summary>Основание и ограничения</summary>
              <p>
                {current.template.status}. {current.template.conditions}
              </p>
              <a href={current.template.url} target="_blank" rel="noreferrer">
                {current.template.act} ↗
              </a>
              <p>{current.template.annex}</p>
              <small>
                Проверка: {current.template.checkedAt}. Версия шаблона:{" "}
                {current.template.version}. Данные документа: v{current.version}
                . Автоматического обновления законодательства нет.
              </small>
              <button className="text-btn" onClick={() => setModal("sources")}>
                Все источники
              </button>
            </details>
            {current.kind === "estimate" && (
              <>
                <p className="estimate-scope">
                  Расчет для квартир и нежилых помещений. Местный минимум не
                  проверен. Накопления и целевые сборы отдельно.
                </p>
                {current.status === "Черновик" && (
                  <button
                    className="text-btn"
                    onClick={() => setModal("refresh")}
                  >
                    Сравнить с карточкой дома
                  </button>
                )}
                {current.copiedFrom && (
                  <p className="info-note">
                    Копия сметы за {current.copiedFrom.year} год. Проверьте
                    старые цены и периодичность на шаге «Другие сведения».
                  </p>
                )}
              </>
            )}
            <ol className="wizard-steps">
              {steps.map((step, i) => (
                <li key={step}>
                  <button
                    className={current.step === i ? "selected" : ""}
                    onClick={() => stepTo(i)}
                  >
                    <span>{i + 1}</span>
                    {step}
                  </button>
                </li>
              ))}
            </ol>
            <div className="wizard-step-body">
              <h2>{steps[current.step]}</h2>
              {current.status === "Архив" && (
                <p className="info-note">
                  Архивный проект. Редактирование и сохранение продолжат его как
                  черновик.
                </p>
              )}
              {current.step < reviewStep ? (
                <WizardFields doc={current} update={update} />
              ) : (
                <>
                  {current.kind === "estimate" ? (
                    <EstimateReview doc={current} jump={jump} />
                  ) : (
                    <ValidationView
                      errors={validation.errors}
                      warnings={validation.warnings}
                    />
                  )}
                  {current.kind === "protocol" && (
                    <details>
                      <summary>{meetingRules.verification}</summary>
                      <p>{meetingRules.note}</p>
                      {current.input.questions.map((q, i) => (
                        <p key={q.id}>
                          Вопрос {i + 1}: арифметическая сумма{" "}
                          {voteArithmetic(q)?.total ?? "не определена"}. Это не
                          проверка числа голосов.
                        </p>
                      ))}
                    </details>
                  )}
                  <p className="wizard-service">
                    Сформирован проект. Проверьте сведения и выполните
                    предусмотренную процедуру подписания или утверждения.
                  </p>
                  <div className="button-row">
                    <button
                      className="primary"
                      disabled={validation.errors.length > 0 || conflict}
                      onClick={() => persist(true)}
                    >
                      Подготовить для проверки
                    </button>
                  </div>
                  {exportBlocked && (
                    <p className="validation-errors">
                      Итоговая расчетная выгрузка недоступна до исправления
                      ошибок. Сохранение незавершенного черновика доступно.
                    </p>
                  )}
                  {exports}
                  {current.step === steps.length - 1 && (
                    <p className="info-note">
                      XLSX — самостоятельная расчетная копия с формулами.
                      Изменения в Excel не возвращаются в приложение. Подписи
                      пустые; служебные сведения на отдельной странице.
                    </p>
                  )}
                </>
              )}
            </div>
            <div className="wizard-bottom">
              <button
                className="secondary"
                disabled={current.step === 0}
                onClick={() => stepTo(current.step - 1)}
              >
                <ArrowLeft size={16} />
                Назад
              </button>
              <button
                className="primary"
                disabled={conflict}
                onClick={() => persist(false)}
              >
                <Save size={16} />
                Сохранить черновик
              </button>
              {current.step < steps.length - 1 && (
                <button
                  className="secondary"
                  onClick={() => stepTo(current.step + 1)}
                >
                  Далее
                  <ArrowRight size={16} />
                </button>
              )}
            </div>
          </section>
          <section className="card wizard-public">
            <h3>Копия для жителей</h3>
            <p>
              Полный проект сохраняется отдельно. Подготовьте текст копии,
              проверьте свободный текст и отдельно подтвердите публикацию.
            </p>
            <div className="button-row">
              <button
                className="secondary"
                disabled={
                  dirty ||
                  conflict ||
                  current.status !== "Подготовлен для проверки"
                }
                onClick={async () => {
                  setPublicText(
                    current.publication === "Опубликована информационная копия"
                      ? current.publishedCopies?.at(-1)?.text ||
                          residentProposal(current)
                      : residentProposal(current),
                  );
                  setConfirmed(false);
                  setModal("publish");
                }}
              >
                Подготовить копию для жителей
              </button>
              {current.status !== "Архив" && (
                <button
                  className="text-btn"
                  disabled={dirty || conflict || !current.version}
                  onClick={async () => {
                    if (
                      !window.confirm(
                        "Переместить проект и его опубликованную копию в архив?",
                      )
                    )
                      return;
                    let archived: WizardDocument | undefined;
                    if (
                      await mutate((s) => {
                        archived = archiveWizard(
                          s,
                          c,
                          current.id,
                          current.version,
                        );
                      }, "Проект помещен в архив")
                    )
                      select(structuredClone(archived!));
                  }}
                >
                  В архив
                </button>
              )}
            </div>
            <p className="muted">
              После изменения оригинала опубликованная копия помечается как
              требующая обновления. Ее текст сохраняется до отдельной повторной
              публикации.
            </p>
            {current.publication === "Требует обновления" && (
              <p className="validation-warnings">
                Опубликованная копия относится к прежней версии. Подготовьте и
                проверьте обновление.
              </p>
            )}
          </section>
        </>
      )}
      {modal &&
        createPortal(
          <Modal
            title={
              modal === "sources"
                ? "Официальные источники"
                : modal === "publish"
                  ? "Копия для жителей — ручная проверка"
                  : modal === "refresh"
                    ? "Обновление из карточки дома"
                    : "Предварительный просмотр формы"
            }
            onClose={() => setModal(null)}
            wide
          >
            {modal === "sources" ? (
              <>
                <p>
                  Ручная проверка: {dateLabel(CHECKED_AT)}. Автоматического
                  обновления нет.
                </p>
                {officialSources.map((s) => (
                  <section key={s.url}>
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {s.title}
                    </a>
                    <p>{s.note}</p>
                  </section>
                ))}
              </>
            ) : modal === "refresh" && current ? (
              <>
                <p>
                  Заменятся только перечисленные исходные сведения. Расходы, год
                  и другие поля сохранятся. Старые сохраненные версии и другие
                  документы не меняются.
                </p>
                {houseDifferences(current, houseProfile(data, c)).length ? (
                  <>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Поле</th>
                            <th>В документе</th>
                            <th>В карточке дома</th>
                          </tr>
                        </thead>
                        <tbody>
                          {houseDifferences(current, houseProfile(data, c)).map(
                            (d) => (
                              <tr key={d.key}>
                                <td>{d.label}</td>
                                <td>{d.before}</td>
                                <td>{d.after}</td>
                              </tr>
                            ),
                          )}
                        </tbody>
                      </table>
                    </div>
                    <button
                      className="primary"
                      onClick={async () => {
                        change(
                          refreshFromHouse(current, houseProfile(data, c)),
                        );
                        setModal(null);
                      }}
                    >
                      Подтвердить замену показанных данных
                    </button>
                  </>
                ) : (
                  <p>Различий нет.</p>
                )}
              </>
            ) : modal === "publish" && current ? (
              <>
                <p className="validation-warnings">
                  Это подготовка копии, а не гарантированное обезличивание.
                  Реестр участников, контакты, полномочия и подписи не
                  подставлены. ФИО и другие персональные сведения могут
                  находиться в тексте вопросов, решений и названиях работ —
                  проверьте и отредактируйте их вручную, сохраняя смысл.
                </p>
                <label className="wizard-field">
                  Текст для жителей
                  <textarea
                    aria-label="Текст для жителей"
                    rows={12}
                    maxLength={50000}
                    value={publicText}
                    onChange={(e) => {
                      setPublicText(e.target.value);
                      setConfirmed(false);
                    }}
                  />
                </label>
                <h3>Предпросмотр публикуемой копии</h3>
                <p className="pre document-body">{publicText}</p>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  Я проверил текст, персональные сведения и подтверждаю
                  публикацию для жителей
                </label>
                <button
                  className="primary"
                  disabled={!confirmed || !publicText.trim()}
                  onClick={async () => {
                    let updated: WizardDocument | undefined;
                    if (
                      await mutate((s) => {
                        publishWizardCopy(
                          s,
                          c,
                          current.id,
                          current.version,
                          confirmed,
                          publicText,
                        );
                        updated = s.wizardDocuments?.find(
                          (d) => d.id === current.id,
                        );
                      }, "Копия опубликована для жителей")
                    ) {
                      select(structuredClone(updated!));
                      setModal(null);
                    }
                  }}
                >
                  Опубликовать информационную копию
                </button>
              </>
            ) : previewDoc ? (
              <>
                <p className="info-note">
                  {previewDoc.template.status}. Сформирован проект для проверки
                  и предусмотренного оформления.
                </p>
                <div className="print-area wizard-print">
                  <WizardFormView doc={previewDoc} />
                </div>
                <div className="button-row">
                  <button
                    className="secondary"
                    disabled={exportBlocked}
                    onClick={async () => {
                      if (live) {
                        try {
                          const result = await api(
                            `/houses/${c.houseId}/wizard/${current!.id}/export/print`,
                          );
                          if (result.version !== current!.version) {
                            notify("Сначала откройте актуальную версию.");
                            return;
                          }
                        } catch (e) {
                          notify((e as Error).message);
                          return;
                        }
                      }
                      window.print();
                    }}
                  >
                    <Printer size={16} />
                    Печать / Сохранить в PDF
                  </button>
                  <button
                    className="secondary"
                    disabled={busy || exportBlocked}
                    onClick={() => exportFile("docx")}
                  >
                    Скачать DOCX
                  </button>
                  {current?.kind === "estimate" && (
                    <button
                      className="secondary"
                      disabled={busy || exportBlocked}
                      onClick={() => exportFile("xlsx")}
                    >
                      Скачать XLSX
                    </button>
                  )}
                </div>
              </>
            ) : null}
          </Modal>,
          document.body,
        )}
      {detail &&
        createPortal(
          <Modal
            title={detail.title + " — основание и ограничения"}
            onClose={() => setDetail(null)}
          >
            <Status value={detail.status} />
            <p>{detail.conditions}</p>
            <a href={detail.url} target="_blank" rel="noreferrer">
              {detail.act}
            </a>
            <p>{detail.annex}</p>
            <p>
              Редакция: {detail.revision}. Действует с{" "}
              {detail.validFrom || "не установлено"}.
            </p>
            <p>{detail.effectiveNote}</p>
            {detail.limitation && <p>{detail.limitation}</p>}
            <ul>
              {detail.requirements.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <small>
              Проверка {detail.checkedAt}, версия {detail.version}. Юридическая
              корректность всего документа не подтверждается автоматически.
            </small>
          </Modal>,
          document.body,
        )}
    </div>
  );
}
function EstimateReview({
  doc,
  jump,
}: {
  doc: WizardDocument;
  jump: (m: ReviewMessage) => void;
}) {
  const messages = reviewMessages(doc);
  return (
    <div className="wizard-validation">
      {(
        [
          ["Нужно исправить", messages.errors],
          ["Требует внимания", messages.attention],
          ["Не проверяется автоматически", messages.unchecked],
        ] as const
      ).map(([title, list]) => (
        <section
          key={title}
          className={
            title === "Нужно исправить" && list.length
              ? "validation-errors"
              : "validation-warnings"
          }
        >
          <h3>
            {title} ({list.length})
          </h3>
          {list.length ? (
            <ul>
              {list.map((m) => (
                <li key={m.text}>
                  {m.text}{" "}
                  <button className="text-btn" onClick={() => jump(m)}>
                    Перейти к полю
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p>Замечаний нет.</p>
          )}
        </section>
      ))}
    </div>
  );
}
function ValidationView({
  errors,
  warnings,
}: {
  errors: string[];
  warnings: string[];
}) {
  return (
    <div className="wizard-validation">
      <section className="validation-errors">
        <h3>Нужно исправить ({errors.length})</h3>
        <ul>
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      </section>
      <section className="validation-warnings">
        <h3>Требует внимания</h3>
        <ul>
          {warnings.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
