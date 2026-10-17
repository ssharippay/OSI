import type { State } from "../models";
export const workMode = () =>
  new URLSearchParams(location.search).get("mode") === "work";
let csrf = "";
export function setCsrf(value: string) {
  csrf = value;
}
export class APIError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T = any>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api" + url, {
      ...options,
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        "x-uykomek-request": "1",
        "x-csrf-token": csrf,
        ...(options.body !== undefined && !(options.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
        ...options.headers,
      },
      signal: options.signal || AbortSignal.timeout(25000),
    });
  } catch {
    throw new APIError(
      0,
      "Нет связи с сервером. Изменения не отправлены. Проверьте соединение и повторите.",
    );
  }
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401)
      window.dispatchEvent(new Event("uykomek-session-expired"));
    throw new APIError(response.status, result.error || "Запрос не выполнен.");
  }
  return result;
}
export type LiveSnapshot = { state: State; userId: string; revision: number };
export function stateChanges(before: State, after: State) {
  const collections = [
    "houses",
    "tickets",
    "docs",
    "works",
    "announcements",
    "wizardDocuments",
  ] as const;
  return collections.flatMap((collection) =>
    (after[collection] || [])
      .filter(
        (value) =>
          JSON.stringify(value) !==
          JSON.stringify(
            (before[collection] || []).find((old) => old.id === value.id),
          ),
      )
      .map((value) => ({ collection, id: value.id, value })),
  );
}
export function reconcile(candidate: State, canonical: State) {
  for (const key of [
    "houses",
    "tickets",
    "docs",
    "works",
    "announcements",
    "wizardDocuments",
  ] as const)
    for (const value of candidate[key] || []) {
      const real = (canonical[key] || []).find((d) => d.id === value.id);
      if (real) {
        for (const name of Object.keys(value)) delete (value as any)[name];
        Object.assign(value, structuredClone(real));
      }
    }
}
