import { useState } from "react";
import { useApp } from "../AppContext";
import { api } from "./api";
import { CreateHouse } from "./LiveRoot";
export function WorkPanel() {
  const { c, chair, notify, refreshServer } = useApp();
  const [url, setUrl] = useState("");
  const [invitations, setInvitations] = useState<any[]>([]);
  return (
    <section className="card work-panel">
      <h2>Рабочий кабинет — настройки</h2>
      <details>
        <summary>Сменить пароль</summary>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget,
              f = new FormData(form);
            try {
              await api("/auth/password", {
                method: "POST",
                body: JSON.stringify({
                  oldPassword: f.get("old"),
                  newPassword: f.get("new"),
                }),
              });
              form.reset();
              notify("Пароль изменен, остальные сессии завершены.");
            } catch (e) {
              notify((e as Error).message);
            }
          }}
        >
          <label className="wizard-field">
            Текущий пароль
            <input
              name="old"
              type="password"
              required
              minLength={12}
              autoComplete="current-password"
            />
          </label>
          <label className="wizard-field">
            Новый пароль
            <input
              name="new"
              type="password"
              required
              minLength={12}
              autoComplete="new-password"
            />
          </label>
          <button className="primary">Изменить пароль</button>
        </form>
      </details>
      {chair && (
        <>
          <details>
            <summary>Приглашения жителей</summary>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                try {
                  const result = await api(
                    "/houses/" + c.houseId + "/invitations",
                    {
                      method: "POST",
                      body: JSON.stringify({
                        email: f.get("email"),
                        role: "resident",
                        premiseNumber: f.get("number"),
                      }),
                    },
                  );
                  setUrl(result.url);
                  notify(
                    "Одноразовая ссылка создана на 3 дня. Передайте ее адресату лично.",
                  );
                } catch (e) {
                  notify((e as Error).message);
                }
              }}
            >
              <label className="wizard-field">
                Email приглашенного
                <input
                  type="email"
                  name="email"
                  aria-label="Email приглашенного"
                  required
                />
              </label>
              <label className="wizard-field">
                Номер помещения
                <input
                  name="number"
                  aria-label="Номер помещения"
                  maxLength={30}
                />
              </label>
              <button className="primary">Создать приглашение жителя</button>
            </form>
            {url && (
              <label className="wizard-field">
                Одноразовая ссылка
                <input readOnly aria-label="Одноразовая ссылка" value={url} />
                <button
                  className="secondary"
                  onClick={() =>
                    navigator.clipboard
                      .writeText(url)
                      .then(() => notify("Ссылка скопирована"))
                      .catch(() =>
                        notify("Выделите и скопируйте ссылку вручную."),
                      )
                  }
                >
                  Скопировать ссылку
                </button>
              </label>
            )}
            <button
              className="text-btn"
              onClick={async () => {
                try {
                  setInvitations(
                    (await api("/houses/" + c.houseId + "/invitations"))
                      .invitations,
                  );
                } catch (e) {
                  notify((e as Error).message);
                }
              }}
            >
              Показать приглашения
            </button>
            {invitations.map((i) => (
              <p key={i.id}>
                {i.email} —{" "}
                {i.used_at
                  ? "Принято"
                  : i.revoked_at
                    ? "Отозвано"
                    : "До " + new Date(i.expires_at).toLocaleDateString()}{" "}
                {!i.used_at && !i.revoked_at && (
                  <button
                    className="text-btn"
                    onClick={async () => {
                      try {
                        await api(
                          `/houses/${c.houseId}/invitations/${i.id}/revoke`,
                          { method: "POST" },
                        );
                        setInvitations(
                          invitations.map((x) =>
                            x.id === i.id ? { ...x, revoked_at: true } : x,
                          ),
                        );
                      } catch (e) {
                        notify((e as Error).message);
                      }
                    }}
                  >
                    Отозвать
                  </button>
                )}
              </p>
            ))}
          </details>
          <details>
            <summary>ИИ и передача данных</summary>
            <p>
              По умолчанию внешняя передача отключена. Перед включением
              проверьте договор с провайдером, согласия и место обработки.
              Маскирование контактов не гарантирует удаления ФИО из свободного
              текста.
            </p>
            <label className="checkbox">
              <input
                type="checkbox"
                aria-label="Разрешить внешнюю передачу для ИИ"
                onChange={async (e) => {
                  const checked = e.target.checked;
                  if (
                    checked &&
                    !confirm(
                      "Разрешить внешнему ИИ-провайдеру передачу ограниченных фрагментов данных этого дома? Проверьте основания и согласия.",
                    )
                  ) {
                    e.target.checked = false;
                    return;
                  }
                  try {
                    await api("/houses/" + c.houseId + "/settings", {
                      method: "PATCH",
                      body: JSON.stringify({ aiAllowed: checked }),
                    });
                    notify("Настройка передачи сохранена.");
                  } catch (err) {
                    e.target.checked = !checked;
                    notify((err as Error).message);
                  }
                }}
              />
              Разрешить внешнюю передачу для ИИ
            </label>
          </details>
          <details>
            <summary>Контакты дома</summary>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await api("/houses/" + c.houseId + "/settings", {
                    method: "PATCH",
                    body: JSON.stringify({
                      contact: new FormData(e.currentTarget).get("contact"),
                    }),
                  });
                  await refreshServer();
                  notify("Контакты сохранены.");
                } catch (err) {
                  notify((err as Error).message);
                }
              }}
            >
              <input
                name="contact"
                aria-label="Новые контакты дома"
                maxLength={300}
              />
              <button className="primary">Сохранить контакты</button>
            </form>
          </details>
          <a
            className="secondary"
            href={"/api/houses/" + c.houseId + "/export"}
          >
            Выгрузить данные дома и файлы
          </a>
        </>
      )}
      <details>
        <summary>Подключить еще один дом</summary>
        <CreateHouse done={() => location.reload()} error={notify} />
      </details>
    </section>
  );
}
