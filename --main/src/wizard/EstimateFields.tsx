import type { WizardDocument, WizardInput, CostGroup, AreaRow } from "./models";
import { newArea, newItem } from "./engine";
import { calculate, decimal, groups } from "./calculation";
export type Update = <K extends keyof WizardInput>(
  key: K,
  value: WizardInput[K],
) => void;
export function Input({
  name,
  label,
  value,
  onChange,
  hint,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <label className="wizard-field" data-field={name}>
      {label}
      <input
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={1000}
      />
      <small>{hint}</small>
    </label>
  );
}
export function Areas({
  areas,
  update,
}: {
  areas: AreaRow[];
  update: (v: AreaRow[]) => void;
}) {
  return (
    <section data-field="areas">
      <h3>Реестр помещений</h3>
      {areas.map((r, i) => (
        <section className="wizard-repeat" key={r.id}>
          <div className="section-title">
            <h3>Помещение {i + 1}</h3>
            <button
              className="text-btn"
              onClick={() =>
                window.confirm("Удалить помещение из этого реестра?") &&
                update(areas.filter((a) => a.id !== r.id))
              }
            >
              Удалить помещение {i + 1}
            </button>
          </div>
          <div className="form-grid">
            <label className="wizard-field">
              Тип помещения
              <select
                aria-label={`Тип помещения ${i + 1}`}
                value={r.kind}
                onChange={(e) =>
                  update(
                    areas.map((a) =>
                      a.id === r.id
                        ? { ...a, kind: e.target.value as AreaRow["kind"] }
                        : a,
                    ),
                  )
                }
              >
                <option>Квартира</option>
                <option>Нежилое помещение</option>
              </select>
            </label>
            <Input
              name={`room-number-${i}`}
              label={`Номер помещения ${i + 1}`}
              value={r.number}
              onChange={(v) =>
                update(
                  areas.map((a) => (a.id === r.id ? { ...a, number: v } : a)),
                )
              }
              hint="Например: 24. Номер вместе с типом должен быть уникальным."
            />
            <Input
              name={`room-area-${i}`}
              label={`Площадь помещения ${i + 1}, м²`}
              value={r.area}
              onChange={(v) =>
                update(
                  areas.map((a) => (a.id === r.id ? { ...a, area: v } : a)),
                )
              }
              hint="Полезная площадь, например 54,25 м². Влияет на индивидуальный взнос; не площадь всего здания."
            />
          </div>
        </section>
      ))}
      <button
        className="secondary"
        onClick={() => update([...areas, newArea()])}
      >
        Добавить помещение
      </button>
    </section>
  );
}
export function EstimateFields({
  doc,
  update,
}: {
  doc: WizardDocument;
  update: Update;
}) {
  const d = doc.input,
    c = calculate(d);
  const field = (key: keyof WizardInput, label: string, hint: string) => (
    <Input
      name={key}
      label={label}
      value={String(d[key] || "")}
      onChange={(v) => update(key, v as never)}
      hint={hint}
    />
  );
  const costs = (group: CostGroup) => (
    <section data-field={"items-" + group} className="estimate-costs">
      <h3>{groups[group]}</h3>
      {d.items.map((item, index) => {
        if (item.group !== group) return null;
        const set = (key: keyof typeof item, value: string | boolean) =>
          update(
            "items",
            d.items.map((x) => (x.id === item.id ? { ...x, [key]: value } : x)),
          );
        const n = index + 1,
          line = c.lines.find((l) => l.id === item.id);
        return (
          <section className="wizard-repeat" key={item.id}>
            <div className="section-title">
              <h3>Статья {n}</h3>
              <div className="button-row">
                <button
                  className="text-btn"
                  onClick={() =>
                    update("items", [...d.items, { ...item, id: newItem().id }])
                  }
                >
                  Дублировать статью {n}
                </button>
                <button
                  className="text-btn"
                  onClick={() =>
                    window.confirm(
                      "Удалить статью из этой сметы? Старые сохраненные документы не изменятся.",
                    ) &&
                    update(
                      "items",
                      d.items.filter((x) => x.id !== item.id),
                    )
                  }
                >
                  Удалить статью {n}
                </button>
              </div>
            </div>
            <Input
              name={`item-title-${n}`}
              label={`Название статьи ${n}`}
              value={item.title}
              onChange={(v) => set("title", v)}
              hint="Например: уборка подъездов. Название поясняет расход, сумма считается из чисел ниже."
            />
            <div className="form-grid">
              <Input
                name={`item-quantity-${n}`}
                label={`Количество статьи ${n}`}
                value={item.quantity}
                onChange={(v) => set("quantity", v)}
                hint="Количество на одно выполнение, например 2 подъезда. До 4 знаков после запятой; умножается на цену и периоды."
              />
              <Input
                name={`item-unit-${n}`}
                label={`Единица статьи ${n}`}
                value={item.unit}
                onChange={(v) => set("unit", v)}
                hint="Например: услуга, м², штука. Цена относится к одной такой единице."
              />
              <Input
                name={`item-price-${n}`}
                label={`Стоимость статьи ${n}, ₸`}
                value={item.price}
                onChange={(v) => set("price", v)}
                hint="Цена за единицу, например 1500,50 ₸. До 2 знаков; пример не является рыночным тарифом."
              />
              <label className="wizard-field">
                Периодичность статьи {n}
                <select
                  aria-label={`Периодичность статьи ${n}`}
                  value={
                    ["12", "4", "1"].includes(item.frequency)
                      ? item.frequency
                      : "custom"
                  }
                  onChange={(e) =>
                    set(
                      "frequency",
                      e.target.value === "custom" ? "" : e.target.value,
                    )
                  }
                >
                  <option value="12">Ежемесячно — 12 раз</option>
                  <option value="4">Ежеквартально — 4 раза</option>
                  <option value="1">Один раз в год</option>
                  <option value="custom">Свое количество</option>
                </select>
                <small>Каждый период означает одно выполнение в расчете.</small>
              </label>
              <Input
                name={`item-frequency-${n}`}
                label={`Выполнений в год статьи ${n}`}
                value={item.frequency}
                onChange={(v) => set("frequency", v)}
                hint="Целое число от 1 до 366. Например: 6 для шести выполнений за год; это множитель годовой суммы."
              />
            </div>
            <Input
              name={`item-reason-${n}`}
              label={`Обоснование статьи ${n}`}
              value={item.reason}
              onChange={(v) => set("reason", v)}
              hint="Например: коммерческое предложение от 10.10.2026. Не меняет арифметику, помогает проверить расход."
            />
            {group === "maintenance" && (
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={!!item.currentRepair}
                  onChange={(e) => set("currentRepair", e.target.checked)}
                />{" "}
                Текущий ремонт — требуется дефектный акт
              </label>
            )}
            <p className="calculated">
              {item.quantity || "Количество"} × {item.price || "Цена"} ₸ ×{" "}
              {item.frequency || "Периоды"} ={" "}
              <strong>
                {line?.cents != null
                  ? decimal(line.cents) + " ₸ в год"
                  : "проверьте числа"}
              </strong>
              . Округление до тиына.
            </p>
          </section>
        );
      })}
      <button
        className="secondary"
        onClick={() =>
          update("items", [
            ...d.items,
            { ...newItem(), group, frequency: "12" },
          ])
        }
      >
        Добавить статью:{" "}
        {group === "management"
          ? "управление"
          : group === "maintenance"
            ? "содержание"
            : group === "savings"
              ? "накопления"
              : "целевой сбор"}
      </button>
      <p className="finance-total">
        Итого раздела: {decimal(c.totals[group])} ₸ в год
      </p>
    </section>
  );
  if (doc.step === 0)
    return (
      <>
        <div className="form-grid">
          {field(
            "address",
            "Адрес дома",
            "Например: Павлодар, ул. Ынтымақ, 24. Определяет дом документа, не меняет суммы.",
          )}
          {field(
            "organization",
            "Наименование ОСИ",
            "Например: ОСИ «Ертіс үйі». Попадает в заголовок сметы.",
          )}
          {field(
            "year",
            "Отчетный год",
            "Четыре цифры, например 2026. План расходов на этот год; цены нужно проверить заново.",
          )}
          {field(
            "preparer",
            "Председатель / составитель",
            "ФИО из карточки дома. Это сведения о составителе, а не подпись или подтверждение полномочий.",
          )}
        </div>
        <p className="info-note">
          Рекомендуемый шаблон для ОСИ, квартир и нежилых помещений. Паркинг и
          кладовки этим расчетом не охвачены. Используйте только вымышленные
          сведения.
        </p>
      </>
    );
  if (doc.step === 1)
    return (
      <>
        {field(
          "declaredArea",
          "Общая полезная площадь квартир и нежилых помещений, м²",
          "Полная сумма полезных площадей для расчета, например 2500,50 м². Это знаменатель взноса; не общая площадь здания. До двух знаков после запятой.",
        )}
        <label className="checkbox">
          <input
            type="checkbox"
            checked={d.registryComplete !== false}
            onChange={(e) => update("registryComplete", e.target.checked)}
          />{" "}
          Реестр помещений полный
        </label>
        <p className="info-note">
          {d.registryComplete === false
            ? "При неполном реестре можно рассчитать итоги расходов и ставку, если полная полезная площадь известна отдельно. Взнос рассчитывается только для помещений с известной площадью. Полного реестра начислений не будет."
            : "Сумма площадей реестра должна совпадать с полной полезной площадью выше."}
        </p>
        <Areas areas={d.areas} update={(v) => update("areas", v)} />
      </>
    );
  if (doc.step === 2) return costs("management");
  if (doc.step === 3) return costs("maintenance");
  return (
    <>
      <p className="info-note">
        Накопления и целевые сборы — отдельные планы. Они не прибавляются к
        текущему взносу.
      </p>
      <details>
        <summary>Накопления — отдельный план</summary>
        {costs("savings")}
      </details>
      <details>
        <summary>Целевые сборы — отдельный план</summary>
        {costs("target")}
      </details>
      {field(
        "commercialIncome",
        "Годовой коммерческий доход, ₸",
        "Например: 0, если нет. До двух знаков. Вычитается из управления и содержания до расчета текущего взноса; не может превышать их сумму.",
      )}
      {field(
        "incomeReason",
        "Основание коммерческого дохода",
        "Например: договор аренды общего имущества. Обязательно при доходе больше нуля; программа не проверяет документ.",
      )}
      {field(
        "inventoryReference",
        "Инвентарный перечень",
        "Номер/дата перечня имущества, например: перечень от 01.10.2026. Обосновывает состав работ, не множитель суммы.",
      )}
      {field(
        "inspectionReference",
        "Акт осмотра",
        "Номер/дата осмотра, например: акт №1 от 01.10.2026. Подтверждение необходимости работ проверяется отдельно.",
      )}
      {field(
        "defectReference",
        "Дефектный акт",
        "Номер/дата для текущего ремонта. Требуется при отметке текущего ремонта; сумму не заменяет.",
      )}
      {field(
        "fundingNotes",
        "Другие источники финансирования и пояснения",
        "Например: отдельное решение о целевом сборе. Текст сам по себе не добавляет доход и не меняет расчет.",
      )}
      {doc.copiedFrom && (
        <label className="checkbox" data-field="pricesConfirmed">
          <input
            type="checkbox"
            checked={!!d.pricesConfirmed}
            onChange={(e) => update("pricesConfirmed", e.target.checked)}
          />{" "}
          Я проверил цены, количество и периодичность для {d.year} года. Старые
          цены не считаю автоматически актуальными.
        </label>
      )}
      <details>
        <summary>Местный минимум — не проверен</summary>
        <div data-field="minimumTerritory">
          {field(
            "minimumTerritory",
            "Территория местного минимума",
            "Например: город Павлодар. Только справочная запись, соответствие не подтверждается.",
          )}
          {field(
            "minimumSource",
            "Источник местного минимума",
            "Официальная ссылка. Мастер не проверяет ее автоматически.",
          )}
          {field(
            "minimumValue",
            "Местный минимум, ₸/м² в месяц",
            "До двух знаков. Ввод не означает проверку и не меняет расчетную ставку.",
          )}
          {field(
            "minimumFrom",
            "Действует с",
            "Дата YYYY-MM-DD; срок действия требует ручной проверки.",
          )}
          {field(
            "minimumTo",
            "Действует до",
            "Дата YYYY-MM-DD либо пусто, если не установлена.",
          )}
        </div>
      </details>
      <p className="calculated">
        Текущие расходы: {decimal(c.core)} ₸/год. Ставка:{" "}
        {c.rateSix || "недостаточно данных"} ₸/м² в месяц. Ставка для показа
        округлена, взнос помещения считается из исходных сумм.
      </p>
    </>
  );
}
