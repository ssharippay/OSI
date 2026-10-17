import { EstimateFields } from "./EstimateFields";
import type {
  WizardDocument,
  WizardInput,
  Participant,
  Question,
} from "./models";
import { newParticipant, newQuestion } from "./engine";
import { meetingRules } from "./rules";
type Update = <K extends keyof WizardInput>(
  key: K,
  value: WizardInput[K],
) => void;
function Field({
  label,
  value,
  onChange,
  type = "text",
  hint,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  hint?: string;
  required?: boolean;
}) {
  return (
    <label className="wizard-field">
      {label}
      {required && <span aria-hidden="true"> *</span>}
      <input
        aria-label={label}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={type === "text" ? 500 : undefined}
      />
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Text({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <label className="wizard-field">
      {label}
      <textarea
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={10000}
        rows={3}
      />
      {hint && <small>{hint}</small>}
    </label>
  );
}
export const estimateSteps = [
  "Дом и год",
  "Исходные данные и площади",
  "Расходы на управление",
  "Расходы на содержание",
  "Другие сведения",
  "Проверка и предпросмотр",
  "Сохранение и выгрузка",
];
export const protocolSteps = [
  "Дом и формат",
  "Участники",
  "Повестка и голосование",
  "Приложения",
  "Проверка",
  "Предпросмотр",
];
export const registrationSteps = [
  "Дом и дата",
  "Участники",
  "Ответственные лица",
  "Проверка",
  "Предпросмотр",
];
export function stepsFor(doc: WizardDocument) {
  return doc.kind === "estimate"
    ? estimateSteps
    : doc.kind === "protocol"
      ? protocolSteps
      : registrationSteps;
}
export function WizardFields({
  doc,
  update,
}: {
  doc: WizardDocument;
  update: Update;
}) {
  if (doc.kind === "estimate")
    return <EstimateFields doc={doc} update={update} />;
  const d = doc.input;
  const field = (
    key: keyof WizardInput,
    label: string,
    type = "text",
    hint?: string,
  ) => (
    <Field
      label={label}
      value={String(d[key])}
      onChange={(v) => update(key, v as never)}
      type={type}
      hint={hint}
    />
  );
  const step = doc.step;
  if (step === 0)
    return (
      <>
        <div className="form-grid">
          {field("address", "Адрес дома")}
          <>
            {field("meetingDate", "Дата собрания", "date")}
            {doc.kind === "protocol" && (
              <>
                {field("protocolNumber", "Номер протокола")}
                {field("meetingTime", "Время собрания", "time")}
                {field("meetingPlace", "Место проведения")}
              </>
            )}
            {field("initiator", "Инициатор собрания")}
          </>
        </div>
        {doc.kind === "protocol" && (
          <label className="wizard-field">
            Формат собрания
            <select
              aria-label="Формат собрания"
              value={d.format}
              onChange={() => {}}
            >
              <option>Явочный формат</option>
            </select>
            <small>
              Реализована форма 1 для квартир и нежилых помещений. Заочный
              формат и собрание парковочных мест/кладовок пока недоступны: у них
              другие формы и условия.
            </small>
          </label>
        )}
        <p className="info-note">
          {doc.dataMode === "work"
            ? "Проверьте исходные сведения дома. Участники, право собственности, подписи и результаты голосования автоматически не подставляются."
            : "Используйте только вымышленные сведения. Данные дома заполнены из демопрофиля; участники, право собственности, подписи и результаты голосования автоматически не подставляются."}
        </p>
      </>
    );

  if (step === 1) return <Participants doc={doc} update={update} />;
  if (doc.kind === "registration" && step === 2)
    return (
      <>
        <div className="form-grid">
          {field("chair", "ФИО председателя собрания")}
          {field("secretary", "ФИО секретаря собрания")}
          {field("initiator", "Инициатор собрания")}
        </div>
        <Text
          label="Перечень приложений и оформление"
          value={d.attachments}
          onChange={(v) => update("attachments", v)}
        />
      </>
    );
  if (doc.kind === "protocol" && step === 2)
    return (
      <>
        <div className="form-grid">
          {field("chair", "ФИО председателя собрания")}
          {field("secretary", "ФИО секретаря собрания")}
          {field("invited", "Приглашенные лица")}
          {field("speakers", "Выступившие лица")}
        </div>
        <p className="info-note">
          Итоги и решения вводите только по вашим вымышленным исходным данным.
          Подписи не создаются. Введите 0 самостоятельно там, где голосов не
          было.
        </p>
        {d.questions.map((q, i) => {
          const set = (key: keyof Question, value: string) =>
            update(
              "questions",
              d.questions.map((x) =>
                x.id === q.id ? { ...x, [key]: value } : x,
              ),
            );
          return (
            <section className="wizard-repeat" key={q.id}>
              <div className="section-title">
                <h3>Вопрос {i + 1}</h3>
                <button
                  className="text-btn"
                  onClick={() =>
                    update(
                      "questions",
                      d.questions.filter((x) => x.id !== q.id),
                    )
                  }
                >
                  Удалить вопрос {i + 1}
                </button>
              </div>
              <Text
                label={`Текст вопроса ${i + 1}`}
                value={q.text}
                onChange={(v) => set("text", v)}
              />
              <label className="wizard-field">
                Предмет вопроса
                <select
                  aria-label={`Предмет вопроса ${i + 1}`}
                  value={q.topic}
                  onChange={(e) => set("topic", e.target.value)}
                >
                  <option value="">Выберите для пояснения процедуры</option>
                  {meetingRules.rules.map((rule) => (
                    <option key={rule.topic}>{rule.topic}</option>
                  ))}
                  <option>Другой предмет — нужна отдельная проверка</option>
                </select>
              </label>
              {q.topic && (
                <p className="muted">
                  {meetingRules.rules.find((r) => r.topic === q.topic)?.basis ||
                    "Условия для этого предмета в мастере не проверены."}
                </p>
              )}
              <h4>На бумажном носителе (явочный формат)</h4>
              <div className="vote-grid">
                {(["paperFor", "paperAgainst", "paperAbstain"] as const).map(
                  (key, j) => (
                    <Field
                      key={key}
                      label={`${["За", "Против", "Воздержался"][j]}, бумага, вопрос ${i + 1}`}
                      value={q[key]}
                      onChange={(v) => set(key, v)}
                    />
                  ),
                )}
              </div>
              <h4>Через цифровые объекты</h4>
              <div className="vote-grid">
                {(
                  ["digitalFor", "digitalAgainst", "digitalAbstain"] as const
                ).map((key, j) => (
                  <Field
                    key={key}
                    label={`${["За", "Против", "Воздержался"][j]}, цифровые, вопрос ${i + 1}`}
                    value={q[key]}
                    onChange={(v) => set(key, v)}
                  />
                ))}
              </div>
              <p className="muted">
                Числа вводятся вручную из проверенных сведений. Интеграция с
                цифровым голосованием отсутствует.
              </p>
              <Text
                label={`Решение по вопросу ${i + 1}`}
                value={q.decision}
                onChange={(v) => set("decision", v)}
                hint="Мастер не признает решение принятым. Формулировку и результат указывает пользователь."
              />
              <Field
                label={`Лист голосования по вопросу ${i + 1}`}
                value={q.sheetReference}
                onChange={(v) => set("sheetReference", v)}
                hint="Отдельный лист на каждый вопрос, сведения о нумерации и оформлении."
              />
            </section>
          );
        })}
        <button
          className="secondary"
          onClick={() => update("questions", [...d.questions, newQuestion()])}
        >
          Добавить вопрос
        </button>
        <Text
          label="Итоги голосования на собрании — текст пользователя"
          value={d.votingSummary}
          onChange={(v) => update("votingSummary", v)}
        />
      </>
    );
  if (doc.kind === "protocol" && step === 3)
    return (
      <>
        <Text
          label="Перечень приложений и оформление"
          value={d.attachments}
          onChange={(v) => update("attachments", v)}
          hint="Регистрация — приложение 7 к Правилам; отдельный лист голосования на каждый вопрос — приложение 3. Укажите, как будут оформлены, пронумерованы и прошиты листы."
        />
        <p className="info-note">
          В предварительный просмотр и DOCX включаются лист регистрации и
          отдельные листы голосования с пустыми полями подписей. Отдельный
          сопроводительный лист содержит сведения о полномочиях. Реальное
          подписание и надлежащее оформление выполняются вне приложения.
        </p>
      </>
    );
  return null;
}
function Participants({
  doc,
  update,
}: {
  doc: WizardDocument;
  update: Update;
}) {
  const d = doc.input;
  return (
    <>
      <p>
        Введите вымышленные сведения о собственниках либо представителях. Жители
        из демопрофилей не подставляются как собственники. При нескольких
        помещениях регистрируйте по каждому отдельно.
      </p>
      {doc.kind === "protocol" && (
        <div className="form-grid">
          <Field
            label="Общее количество собственников квартир"
            value={d.apartmentOwners}
            onChange={(v) => update("apartmentOwners", v)}
          />
          <Field
            label="Общее количество собственников нежилых помещений"
            value={d.nonresidentialOwners}
            onChange={(v) => update("nonresidentialOwners", v)}
          />
          <Field
            label="Количество участвующих на собрании"
            value={d.participantsCount}
            onChange={(v) => update("participantsCount", v)}
            hint="Не заполняется автоматически числом квартир или пользователей."
          />
        </div>
      )}
      {d.participants.map((person, i) => {
        const set = (key: keyof Participant, value: string) =>
          update(
            "participants",
            d.participants.map((p) =>
              p.id === person.id ? { ...p, [key]: value } : p,
            ),
          );
        return (
          <section className="wizard-repeat" key={person.id}>
            <div className="section-title">
              <h3>Участник {i + 1}</h3>
              <button
                className="text-btn"
                onClick={() =>
                  update(
                    "participants",
                    d.participants.filter((x) => x.id !== person.id),
                  )
                }
              >
                Удалить участника {i + 1}
              </button>
            </div>
            <Field
              label={`ФИО участника ${i + 1}`}
              value={person.name}
              onChange={(v) => set("name", v)}
            />
            <div className="form-grid">
              <Field
                label={`Квартира участника ${i + 1}`}
                value={person.apartment}
                onChange={(v) => set("apartment", v)}
              />
              <Field
                label={`Нежилое помещение участника ${i + 1}`}
                value={person.nonresidential}
                onChange={(v) => set("nonresidential", v)}
              />
            </div>
            <label className="wizard-field">
              Участие
              <select
                aria-label={`Участие участника ${i + 1}`}
                value={person.capacity}
                onChange={(e) => set("capacity", e.target.value)}
              >
                <option>Собственник</option>
                <option>Представитель</option>
              </select>
            </label>
            {person.capacity === "Представитель" && (
              <div className="form-grid">
                <Field
                  label={`Документ о полномочиях участника ${i + 1}`}
                  value={person.authority}
                  onChange={(v) => set("authority", v)}
                />
                <Field
                  label={`Срок полномочий участника ${i + 1}`}
                  value={person.authorityUntil}
                  onChange={(v) => set("authorityUntil", v)}
                />
              </div>
            )}
            {doc.kind === "protocol" && (
              <Field
                label={`Контакт участника ${i + 1} (необязательно)`}
                value={person.contact}
                onChange={(v) => set("contact", v)}
                hint="По усмотрению собственника. Используйте вымышленные контакты. В публикуемую копию не включается."
              />
            )}
          </section>
        );
      })}
      <button
        className="secondary"
        onClick={() =>
          update("participants", [...d.participants, newParticipant()])
        }
      >
        Добавить участника
      </button>
    </>
  );
}
