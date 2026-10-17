import { WorkPanel } from "./live/WorkPanel";
import { api } from "./live/api";
import { useEffect, useState } from "react";
import {
  Home,
  MessageSquare,
  Files,
  Sparkles,
  Wallet,
  Megaphone,
  Building2,
  Download,
  Leaf,
  Users,
  ClipboardList,
} from "lucide-react";
import { useApp } from "./AppContext";
import { Brand, MonthPicker, Toast } from "./components/Common";
import { Dialogs } from "./components/Dialogs";
import { Dashboard } from "./pages/Dashboard";
import { Tickets } from "./pages/Tickets";
import { Documents } from "./pages/Documents";
import { Works } from "./pages/Works";
import { Announcements } from "./pages/Announcements";
import { Assistant } from "./pages/Assistant";
import { WizardPage } from "./wizard/WizardPage";
import { Landing } from "./pages/Landing";
import { visibleTickets } from "./store/selectors";
import type { Page } from "./models";
const labels: Record<Page, string> = {
  home: "Мой дом",
  tickets: "Обращения",
  docs: "Документы",
  works: "Работы и расходы",
  announcements: "Объявления",
  ai: "ИИ-помощник",
  wizard: "Мастер документов ОСИ",
};
const icons = {
  home: Home,
  tickets: MessageSquare,
  docs: Files,
  works: Wallet,
  announcements: Megaphone,
  ai: Sparkles,
  wizard: ClipboardList,
};
export function App() {
  const {
    data,
    live,
    syncState,
    c,
    chair,
    user,
    homes,
    currentHouse,
    page,
    go,
    profile,
    selectHouse,
    setMonth,
    open,
    notice,
    notify,
  } = useApp();
  const [swError, setSwError] = useState("");
  const [settings, setSettings] = useState(false);
  const signOut = async () => {
    try {
      await api("/auth/logout", { method: "POST" });
      location.replace("/?mode=work");
    } catch (e) {
      notify((e as Error).message);
    }
  };
  useEffect(() => {
    if ("serviceWorker" in navigator)
      navigator.serviceWorker
        .register(import.meta.env.BASE_URL + "sw.js")
        .catch(() =>
          setSwError(
            "Офлайн-режим недоступен в этом браузере. Основные функции работают с интернетом.",
          ),
        );
  }, []);
  const pages: Page[] = chair
    ? ["home", "tickets", "docs", "works", "announcements", "wizard", "ai"]
    : ["home", "tickets", "docs", "ai"];
  const tickets = visibleTickets(data, c);
  const nav = (mobile = false) =>
    pages.map((p) => {
      const Icon = icons[p];
      return (
        <button
          key={p}
          aria-label={
            p === "home" && chair
              ? "Обзор"
              : mobile && p === "works"
                ? "Расходы"
                : mobile && p === "announcements"
                  ? "Новости"
                  : mobile && p === "wizard"
                    ? "Мастер"
                    : labels[p]
          }
          className={page === p ? "active" : ""}
          onClick={() => go(p)}
        >
          <Icon size={20} />
          <span>
            {p === "home" && chair
              ? "Обзор"
              : mobile && p === "works"
                ? "Расходы"
                : mobile && p === "announcements"
                  ? "Новости"
                  : mobile && p === "wizard"
                    ? "Мастер"
                    : labels[p]}
          </span>
          {!mobile &&
            p === "tickets" &&
            tickets.some((t) => t.status !== "Выполнено") && (
              <b>{tickets.filter((t) => t.status !== "Выполнено").length}</b>
            )}
          {!mobile && p === "ai" && !live && <small>ДЕМО</small>}
        </button>
      );
    });
  return (
    <>
      <div className="demo-bar">
        <span className="demo-dot" />
        {live
          ? "Рабочий режим · " + syncState
          : "Демонстрация. Все данные вымышлены"}
        <span className="bar-right">
          {live ? (
            "Серверное хранение"
          ) : (
            <a href="/?mode=work">Войти в рабочий кабинет</a>
          )}
        </span>
      </div>
      {!user ? (
        <>
          <Landing
            login={(r) => profile(r === "chair" ? "u2" : "u1")}
            installHelp={() => open({ kind: "install" })}
          />
          <div className="landing-demo">
            <button
              className="text-btn"
              onClick={() =>
                live ? setSettings(!settings) : open({ kind: "demo" })
              }
            >
              <Users size={16} />{" "}
              {live ? "Настройки рабочего кабинета" : "Режим демонстрации"}:
              выбрать другой профиль
            </button>
          </div>
        </>
      ) : (
        <div className="app-shell">
          <aside className="sidebar">
            <Brand />
            <div className="workspace-label">МОЙ КАБИНЕТ</div>
            <nav>{nav()}</nav>
            <div className="sidebar-bottom">
              <div className="help-card">
                <Leaf size={22} />
                <strong>Хороший дом — общее дело</strong>
                <p>Документы, обращения и расходы вашего дома.</p>
              </div>
              <button
                className="text-btn"
                onClick={() => open({ kind: "install" })}
              >
                <Download size={16} /> Установить приложение
              </button>
              <button
                className="text-btn"
                onClick={() =>
                  live ? setSettings(!settings) : open({ kind: "demo" })
                }
              >
                <Users size={16} />{" "}
                {live ? "Настройки рабочего кабинета" : "Режим демонстрации"}
              </button>
              <div className="profile">
                <div className="avatar">
                  {user.name
                    .split(" ")
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join("")}
                </div>
                <span>
                  {user.name}
                  <small>{chair ? "Председатель ОСИ" : "Житель дома"}</small>
                </span>
              </div>
            </div>
          </aside>
          <div className="main-area">
            <header className="topbar">
              <div>
                <Building2 size={18} />
                <span>{currentHouse?.name || "Выберите дом"}</span>
                <span className="top-divider">/</span>
                <small>{currentHouse?.address}</small>
              </div>
              <button
                className="demo-switch"
                onClick={() =>
                  live ? setSettings(!settings) : open({ kind: "demo" })
                }
              >
                <Users size={17} />
                <span>{live ? "Настройки" : "Режим демонстрации"}</span>
              </button>
            </header>
            <main className="content">
              {live && (
                <>
                  <div className="button-row">
                    <button className="text-btn" onClick={signOut}>
                      Выйти
                    </button>
                    <button
                      className="text-btn"
                      onClick={() => setSettings(!settings)}
                    >
                      Настройки рабочего кабинета
                    </button>
                  </div>
                  {currentHouse?.status !== "pilot_approved" && (
                    <p className="info-note">
                      Подключение дома ожидает ручной проверки оператором.
                      Создание записи не подтверждает полномочия председателя.
                    </p>
                  )}
                  {currentHouse?.contact && (
                    <p>Контакты дома: {currentHouse.contact}</p>
                  )}
                  {settings && <WorkPanel />}
                </>
              )}

              <div className="context-controls">
                {homes.length > 1 ? (
                  <label>
                    Доступный дом
                    <select
                      aria-label="Доступный дом"
                      value={c.houseId}
                      onChange={(e) => selectHouse(e.target.value)}
                    >
                      {homes.map((h) => (
                        <option value={h.id} key={h.id}>
                          {h.name} · {h.address}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <span className="current-address">
                    {currentHouse?.address}
                  </span>
                )}
                {page !== "wizard" && (
                  <MonthPicker value={c.month} onChange={setMonth} />
                )}
              </div>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    {chair
                      ? "ВСЁ ДЛЯ УПРАВЛЕНИЯ ДОМОМ"
                      : "ВАШ ДОМ — ВАШЕ СООБЩЕСТВО"}
                  </div>
                  <h1>
                    {page === "home"
                      ? `Здравствуйте, ${user.name.split(" ")[0]}!`
                      : labels[page]}
                  </h1>
                  <p>
                    {page === "home"
                      ? "Главное о жизни дома — в одном месте."
                      : page === "tickets"
                        ? "От первого сообщения до решённой проблемы."
                        : page === "ai"
                          ? "Ответы по доступным данным выбранного дома."
                          : page === "docs"
                            ? "Черновики, публикации и понятная история версий."
                            : page === "works"
                              ? "План и фактические расходы за выбранный месяц."
                              : page === "wizard"
                                ? "Подготовьте проект по проверенному шаблону."
                                : "Держите жителей в курсе."}
                  </p>
                </div>
              </div>
              {swError && <p className="info-note">{swError}</p>}
              {!pages.includes(page) ? (
                <p>Этот раздел недоступен выбранному профилю.</p>
              ) : page === "home" ? (
                <Dashboard />
              ) : page === "tickets" ? (
                <Tickets />
              ) : page === "docs" ? (
                <Documents />
              ) : page === "works" ? (
                <Works />
              ) : page === "wizard" ? (
                <WizardPage key={c.userId + "-" + c.houseId} />
              ) : page === "announcements" ? (
                <Announcements />
              ) : (
                <Assistant key={c.userId + "-" + c.houseId + "-" + c.month} />
              )}
              <footer className="app-footer">
                <span>ҮйКөмек · забота о доме, понятная каждому</span>
                <span>
                  {live
                    ? "Рабочий режим · данные хранятся на сервере"
                    : "Демонстрационный прототип · данные только в этом браузере"}
                </span>
              </footer>
            </main>
          </div>
          <nav className="mobile-nav">{nav(true)}</nav>
        </div>
      )}
      <Dialogs />
      {notice && <Toast text={notice} close={() => notify("")} />}
    </>
  );
}
