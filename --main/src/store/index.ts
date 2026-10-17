import type { State } from "../models";
import { migrate, seed } from "./migration";
export const STORAGE_KEY = "uykomek-data-v1";
export const BACKUP_KEY = STORAGE_KEY + "-backup-before-v2";
export interface DataAdapter {
  load(): State;
  save(s: State): void;
  subscribe(fn: () => void): () => void;
}
// Future server implementation should use these asynchronous operations and enforce access on the server.
export interface ServerRepository {
  load(): Promise<State>;
  save(s: State, expectedRevision: string): Promise<{ revision: string }>;
}
const storageError = () =>
  new Error(
    "Не удалось сохранить данные: хранилище браузера недоступно или заполнено. Уберите фото, освободите место или сохраните резервную копию. Изменения не сохранены.",
  );
export const localAdapter: DataAdapter = {
  load() {
    let raw: string | null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch {
      throw new Error(
        "Браузер запретил доступ к хранилищу. Разрешите данные сайта, затем повторите открытие.",
      );
    }
    if (raw === null) {
      const s = seed();
      this.save(s);
      return s;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(
        "Сохранённые данные не читаются. Они не удалены. Скачайте копию перед восстановлением.",
      );
    }
    const data = migrate(parsed);
    if ((parsed as State).schemaVersion !== 2) {
      try {
        if (localStorage.getItem(BACKUP_KEY) === null)
          localStorage.setItem(BACKUP_KEY, raw);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch {
        throw storageError();
      }
    }
    if (
      (parsed as State).schemaVersion === 2 &&
      (parsed as State).wizardDataVersion !== 2
    ) {
      try {
        const key = STORAGE_KEY + "-backup-before-wizard-v2";
        if (localStorage.getItem(key) === null) localStorage.setItem(key, raw);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch {
        throw storageError();
      }
    }
    return data;
  },
  save(s) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch {
      throw storageError();
    }
    window.dispatchEvent(new Event("uykomek-update"));
  },
  subscribe(fn) {
    const cb = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === null) fn();
    };
    window.addEventListener("storage", cb);
    window.addEventListener("uykomek-update", fn);
    return () => {
      window.removeEventListener("storage", cb);
      window.removeEventListener("uykomek-update", fn);
    };
  },
};
