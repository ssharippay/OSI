import { LiveRoot } from "./live/LiveRoot";
import { workMode } from "./live/api";
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AppProvider } from "./AppContext";
import { localAdapter, STORAGE_KEY } from "./store";
import { seed } from "./store/migration";
import { download } from "./components/Common";
import type { State } from "./models";
import "./style.css";
function load(): { data: State | null; error: string } {
  try {
    return { data: localAdapter.load(), error: "" };
  } catch (e) {
    return { data: null, error: (e as Error).message };
  }
}
function Root() {
  const [initial, setInitial] = useState(load);
  const [feedback, setFeedback] = useState("");
  if (!initial.data)
    return (
      <main className="recovery card">
        <h1>Не удалось открыть данные</h1>
        <p role="alert">{initial.error}</p>
        <p>Ваши записи не сброшены. Сначала скачайте копию для сохранности.</p>
        <div className="button-row">
          <button
            className="secondary"
            onClick={() => {
              try {
                download(
                  "uykomek-original-data.json",
                  localStorage.getItem(STORAGE_KEY) || "{}",
                  "application/json",
                );
                setFeedback("Копия подготовлена к скачиванию.");
              } catch {
                setFeedback("Браузер не разрешил чтение данных.");
              }
            }}
          >
            Скачать исходные данные
          </button>
          <button className="primary" onClick={() => setInitial(load())}>
            Повторить открытие
          </button>
          <button
            className="text-btn"
            onClick={() => {
              if (
                window.confirm(
                  "Удалить текущие данные и восстановить вымышленный набор? Это действие нельзя отменить. Сначала скачайте копию.",
                )
              ) {
                try {
                  localAdapter.save(seed());
                  setInitial(load());
                } catch (e) {
                  setFeedback((e as Error).message);
                }
              }
            }}
          >
            Восстановить демоданные
          </button>
        </div>
        {feedback && <p role="status">{feedback}</p>}
      </main>
    );
  return (
    <AppProvider initial={initial.data}>
      <App />
    </AppProvider>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>{workMode() ? <LiveRoot /> : <Root />}</StrictMode>,
);
