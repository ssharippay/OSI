import { useState } from "react";
import { useApp } from "../AppContext";
import { houseProfile, saveHouseProfile } from "./house";
import { Areas, Input } from "./EstimateFields";
import type { HouseProfile } from "./models";
export function HouseCard({ onClose }: { onClose: () => void }) {
  const { data, c, mutate } = useApp();
  const [profile, setProfile] = useState(() => houseProfile(data, c));
  const [dirty, setDirty] = useState(false);
  const update = <K extends keyof HouseProfile>(
    key: K,
    value: HouseProfile[K],
  ) => {
    setProfile({ ...profile, [key]: value });
    setDirty(true);
  };
  return (
    <section className="card house-card">
      <div className="section-title">
        <h2>Карточка дома</h2>
        <button
          className="text-btn"
          onClick={async () => {
            if (!dirty || window.confirm("Закрыть карточку без сохранения?"))
              onClose();
          }}
        >
          Закрыть карточку
        </button>
      </div>
      <p>
        Исходные сведения для новых документов. Старые проекты сохраняют свой
        снимок. Не вводите ИИН, удостоверения, подписи и настоящие персональные
        данные.
      </p>
      {(
        [
          ["organization", "Наименование ОСИ"],
          ["address", "Адрес дома"],
          ["chairman", "Председатель / составитель"],
          ["declaredArea", "Полная полезная площадь, м²"],
          ["inventoryReference", "Инвентарный перечень"],
          ["inspectionReference", "Акт осмотра"],
        ] as const
      ).map(([k, label]) => (
        <Input
          key={k}
          name={k}
          label={label}
          value={profile[k]}
          onChange={(v) => update(k, v)}
          hint={
            k === "declaredArea"
              ? "Полезная площадь квартир и нежилых помещений; не общая площадь здания. Например: 2500,50 м². Проверка будет выполнена в документе."
              : "Подставляется в новый документ. Вы сможете проверить и изменить значение в нем."
          }
        />
      ))}
      <label className="checkbox">
        <input
          type="checkbox"
          checked={profile.registryComplete}
          onChange={(e) => update("registryComplete", e.target.checked)}
        />{" "}
        Реестр помещений полный
      </label>
      <Areas areas={profile.areas} update={(v) => update("areas", v)} />
      <div className="button-row">
        <button
          className="primary"
          onClick={async () => {
            let saved: HouseProfile | undefined;
            if (
              await mutate((s) => {
                saved = saveHouseProfile(s, c, profile, profile.version);
              }, "Карточка дома сохранена")
            ) {
              setProfile(structuredClone(saved!));
              setDirty(false);
            }
          }}
        >
          Сохранить карточку дома
        </button>
        <span role="status">
          {dirty
            ? "Есть несохраненные изменения"
            : profile.version
              ? "Сохранено"
              : "Карточка еще не сохранена"}
        </span>
      </div>
    </section>
  );
}
