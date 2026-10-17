import { useEffect, useState, type FormEvent } from "react";
import { AppProvider } from "../AppContext";
import { App } from "../App";
import { api, setCsrf, type LiveSnapshot } from "./api";
import { Brand } from "../components/Common";
import { AdminPanel } from "./AdminPanel";
const fragment = new URLSearchParams(location.hash.slice(1));
const resetToken = fragment.get("reset"),
  inviteToken = fragment.get("invite");
if (resetToken || inviteToken)
  history.replaceState(null, "", location.pathname + location.search);
export function LiveRoot() {
  const [session, setSession] = useState<any>(null),
    [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [mode, setMode] = useState(resetToken ? "reset" : "login");
  async function load() {
    setLoading(true);
    try {
      const me = await api("/auth/me");
      setCsrf(me.csrf);
      setSession(me.user);
      if (resetToken) {
        setSession(null);
        return;
      }
      if (new URLSearchParams(location.search).get("panel") === "admin" && !inviteToken) {
        setError("");
        return;
      }
      const list = await api("/houses");
      if (list.houses.length) {
        const value = await api<LiveSnapshot>(
          "/state?houseId=" + list.houses[0].id,
        );
        setSnapshot(value);
      }
      setError("");
    } catch (e) {
      setSession(null);
      setSnapshot(null);
      if ((e as any).status !== 401) setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void (async () => {
      if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
        const privacy = await new Promise<number>((resolve) => {
          const channel = new MessageChannel();
          channel.port1.onmessage = (e) => resolve(e.data?.privacyVersion || 0);
          navigator.serviceWorker.controller!.postMessage(
            { type: "privacy-version" },
            [channel.port2],
          );
          setTimeout(() => resolve(0), 1000);
        });
        if (privacy !== 7) {
          const registration = await navigator.serviceWorker.getRegistration();
          await registration?.unregister();
          for (const key of await caches.keys())
            if (key.startsWith("uykomek-")) await caches.delete(key);
          if (inviteToken || resetToken)
            history.replaceState(
              null,
              "",
              location.pathname +
                location.search +
                "#" +
                (inviteToken ? "invite=" + inviteToken : "reset=" + resetToken),
            );
          location.reload();
          return;
        }
      }
      await load();
    })();
    const expired = () => {
      setSession(null);
      setSnapshot(null);
      setCsrf("");
    };
    window.addEventListener("uykomek-session-expired", expired);
    return () => window.removeEventListener("uykomek-session-expired", expired);
  }, []);
  if (loading)
    return (
      <main className="recovery card">
        <Brand />
        <p role="status">Загружаем рабочий кабинет…</p>
      </main>
    );
  if (session && new URLSearchParams(location.search).get("panel") === "admin" && !inviteToken)
    return session.platformAdmin ? <AdminPanel /> : <main className="recovery card">
      <h1>Доступ ограничен</h1><p>Требуются права администратора платформы.</p>
      <a href="/?mode=work">Вернуться в рабочий кабинет</a>
    </main>;
  if (session && snapshot && !inviteToken)
    return (
      <>
      {session.platformAdmin && <nav className="admin-entry"><a href="/?mode=work&panel=admin">Администрирование платформы</a></nav>}
      <AppProvider initial={snapshot.state} live={snapshot}>
        <App />
      </AppProvider>
      </>
    );
  return (
    <main className="recovery card live-auth">
      <Brand />
      {session?.platformAdmin && <a href="/?mode=work&panel=admin">Администрирование платформы</a>}
      <h1>
        {session
          ? "Подключение дома"
          : mode === "register"
            ? "Создать учетную запись"
            : mode === "forgot"
              ? "Восстановление пароля"
              : mode === "reset"
                ? "Новый пароль"
                : "Войти в рабочий кабинет"}
      </h1>
      <p>
        Рабочий режим: учетные записи и записи сохраняются на сервере. Данные
        демонстрации сюда не переносятся.
      </p>
      {error && (
        <p role="alert" className="validation-errors">
          {error}
        </p>
      )}
      {session ? (
        inviteToken ? (
          <>
            <p>
              Приглашение дает доступ только указанному дому и роли. Оно должно
              быть выдано на email вашей учетной записи.
            </p>
            <button
              className="primary"
              onClick={async () => {
                try {
                  await api("/invitations/accept", {
                    method: "POST",
                    body: JSON.stringify({ token: inviteToken }),
                  });
                  location.replace("/?mode=work");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Принять приглашение
            </button>
          </>
        ) : (
          <CreateHouse done={() => void load()} error={setError} />
        )
      ) : (
        <form
          onSubmit={async (e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setLoading(true);
            try {
              const body =
                mode === "reset"
                  ? { token: resetToken, password: f.get("password") }
                  : mode === "forgot"
                    ? { email: f.get("email") }
                    : {
                        email: f.get("email"),
                        password: f.get("password"),
                        ...(mode === "register" ? { name: f.get("name") } : {}),
                      };
              const result = await api(
                "/auth/" +
                  (mode === "forgot"
                    ? "forgot"
                    : mode === "reset"
                      ? "reset"
                      : mode),
                { method: "POST", body: JSON.stringify(body) },
              );
              if (mode === "forgot") {
                setError(result.message);
              } else if (mode === "reset") {
                location.replace("/?mode=work");
              } else {
                setCsrf(result.csrf);
                await load();
              }
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setLoading(false);
            }
          }}
        >
          {mode === "register" && (
            <label className="wizard-field">
              Имя
              <input
                name="name"
                aria-label="Имя"
                minLength={2}
                maxLength={100}
                required
                autoComplete="name"
              />
            </label>
          )}
          {mode !== "reset" && (
            <label className="wizard-field">
              Email
              <input
                type="email"
                aria-label="Email"
                name="email"
                required
                autoComplete="email"
              />
            </label>
          )}
          {mode !== "forgot" && (
            <label className="wizard-field">
              Пароль
              <input
                type="password"
                aria-label="Пароль"
                name="password"
                minLength={12}
                maxLength={128}
                required
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
              />
              <small>Не менее 12 символов.</small>
            </label>
          )}
          <button className="primary">
            {mode === "register"
              ? "Зарегистрироваться"
              : mode === "forgot"
                ? "Отправить инструкцию"
                : mode === "reset"
                  ? "Сохранить новый пароль"
                  : "Войти"}
          </button>
        </form>
      )}
      {!session && (
        <div className="button-row">
          <button
            className="text-btn"
            onClick={() => {
              setMode(mode === "register" ? "login" : "register");
              setError("");
            }}
          >
            {mode === "register" ? "Уже есть учетная запись" : "Регистрация"}
          </button>
          <button
            className="text-btn"
            onClick={() => {
              setMode("forgot");
              setError("");
            }}
          >
            Забыли пароль?
          </button>
          <a href="/">Открыть демонстрацию</a>
        </div>
      )}
    </main>
  );
}
export function CreateHouse({
  done,
  error,
}: {
  done: () => void;
  error: (s: string) => void;
}) {
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        try {
          await api("/houses", {
            method: "POST",
            body: JSON.stringify({
              name: f.get("name"),
              address: f.get("address"),
              contact: f.get("contact"),
            }),
          });
          done();
        } catch (e) {
          error((e as Error).message);
        }
      }}
    >
      <p className="info-note">
        Создание дома не подтверждает полномочия председателя и не связано с
        государственным реестром. Перед настоящим пилотом оператор проверяет
        подключение вручную.
      </p>
      <label className="wizard-field">
        Название ОСИ
        <input
          name="name"
          aria-label="Название ОСИ"
          required
          minLength={2}
          maxLength={150}
        />
      </label>
      <label className="wizard-field">
        Адрес дома
        <input
          name="address"
          aria-label="Адрес дома"
          required
          minLength={3}
          maxLength={300}
        />
      </label>
      <label className="wizard-field">
        Контакты для обращений
        <input
          name="contact"
          aria-label="Контакты для обращений"
          maxLength={300}
        />
      </label>
      <button className="primary">Создать дом</button>
    </form>
  );
}
