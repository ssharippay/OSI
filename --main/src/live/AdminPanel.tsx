import { useEffect, useState } from "react";
import { api } from "./api";
import { Brand } from "../components/Common";

type House = { id: string; name: string; address: string; status: string; revision: number; members?: number; contact?: string };
type Detail = { house: House; memberships: { id: string; name: string; email: string; role: string }[];
  membershipsTruncated: boolean; history: { id: string; action: string; actor: string | null;
    created_at: string; details: { from?: string; to?: string; reason?: string } | null }[] };
const statuses: Record<string, string> = {
  pending_review: "Ожидает проверки", pilot_approved: "Подключен к пилоту", suspended: "Доступ приостановлен",
};
const actions: Record<string, string> = {
  "platform:house_status": "Изменен статус подключения",
  "platform:member_revoked": "Отозван доступ жителя",
  "house:created_pending_manual_review": "Создан дом",
};
export function AdminPanel() {
  const [houses, setHouses] = useState<House[]>([]), [next, setNext] = useState<string | null>(null),
    [detail, setDetail] = useState<Detail | null>(null), [search, setSearch] = useState(""),
    [filter, setFilter] = useState(""), [error, setError] = useState(""),
    [busy, setBusy] = useState(false), [reason, setReason] = useState(""),
    [target, setTarget] = useState("pilot_approved"), [verified, setVerified] = useState(false),
    [revoke, setRevoke] = useState("");
  async function list(after?: string) {
    const q = new URLSearchParams({ search });
    if (filter) q.set("status", filter);
    if (after) q.set("after", after);
    const result = await api<{ houses: House[]; next: string | null }>("/admin/houses?" + q);
    setHouses(result.houses); setNext(result.next);
  }
  async function open(id: string) {
    const result = await api<Detail>("/admin/houses/" + id);
    setDetail(result); setReason(""); setVerified(false); setRevoke("");
    setTarget(result.house.status === "pilot_approved" ? "suspended" : "pilot_approved");
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true); setError("");
    try { await fn(); } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  useEffect(() => { void run(() => list()); }, []);
  return <main className="admin-panel">
    <header className="card"><Brand /><h1>Администрирование платформы</h1>
      <p>Подключение ОСИ, доступ жителей и история действий.</p>
      <div className="button-row"><a href="/?mode=work">Кабинет дома</a>
        <button className="secondary" disabled={busy} onClick={() => void run(async () => {
          await api("/auth/logout", { method: "POST" }); location.replace("/?mode=work");
        })}>Выйти</button></div>
    </header>
    {error && <p className="validation-errors" role="alert">{error}</p>}
    {busy && <p role="status">Выполняем запрос…</p>}
    <fieldset className="plain-fieldset" disabled={busy}>
    {!detail ? <section className="card"><h2>Дома</h2>
      <form className="admin-filters" onSubmit={e => { e.preventDefault(); void run(() => list()); }}>
        <label>Название или адрес<input value={search} maxLength={150} onChange={e => setSearch(e.target.value)} /></label>
        <label>Статус<select value={filter} onChange={e => setFilter(e.target.value)}><option value="">Все статусы</option>
          {Object.entries(statuses).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
        </select></label><button className="primary">Найти</button>
      </form>
      {!houses.length && <p>Дома не найдены.</p>}
      <div className="admin-houses">{houses.map(h => <article key={h.id} className="admin-house">
        <h3>{h.name}</h3><p>{h.address}</p><p>{statuses[h.status]} · Участников: {h.members}</p>
        <button className="secondary" onClick={() => void run(() => open(h.id))}>Открыть {h.name}</button>
      </article>)}</div>
      {next && <button className="secondary" onClick={() => void run(() => list(next))}>Следующие дома</button>}
    </section> : <>
      <section className="card"><div className="button-row">
        <button className="secondary" onClick={() => void run(async () => { await list(); setDetail(null); })}>К списку домов</button>
        <button className="secondary" onClick={() => void run(() => open(detail.house.id))}>Обновить данные</button>
      </div><h2>{detail.house.name}</h2><p>{detail.house.address}</p>
        <p>{statuses[detail.house.status]}</p><p>Контакт: {detail.house.contact || "Не указан"}</p>
        <form onSubmit={e => { e.preventDefault(); void run(async () => {
          await api(`/admin/houses/${detail.house.id}/status`, { method: "POST", body: JSON.stringify({
            status: target, revision: detail.house.revision, reason, verified,
          }) }); await open(detail.house.id);
        }); }}>
          <h3>Изменить статус подключения</h3>
          <p>Приостановка закрывает участникам доступ к дому. Записи и файлы сохраняются.</p>
          <label className="wizard-field">Новый статус<select value={target} onChange={e => { setTarget(e.target.value); setVerified(false); }}>
            {Object.entries(statuses).filter(([key]) => key !== detail.house.status).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
          </select></label>
          <label className="wizard-field">Основание действия<textarea required minLength={10} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /></label>
          {target === "pilot_approved" && <label className="admin-check"><input type="checkbox" required checked={verified} onChange={e => setVerified(e.target.checked)} />
            Подключение и полномочия представителя проверены, основание документировано. Это не государственная верификация.</label>}
          <button className="primary">Подтвердить изменение статуса</button>
        </form>
      </section>
      <section className="card"><h2>Участники дома</h2>
        {detail.membershipsTruncated && <p>Показаны первые 500 участников. Для полного списка обратитесь к оператору.</p>}
        {detail.memberships.map(m => <article className="admin-house" key={m.id}>
          <strong>{m.name}</strong><p>{m.email} · {m.role === "chair" ? "Председатель" : "Житель"}</p>
          {m.role === "resident" && <button className="secondary" onClick={() => { setRevoke(m.id); setReason(""); }}>Отозвать доступ {m.name}</button>}
          {revoke === m.id && <form onSubmit={e => { e.preventDefault(); void run(async () => {
            await api(`/admin/houses/${detail.house.id}/members/${m.id}/revoke`, { method: "POST",
              body: JSON.stringify({ reason, revision: detail.house.revision }) }); await open(detail.house.id);
          }); }}><p>Житель потеряет доступ к этому дому. Его обращения и история останутся.</p>
            <label className="wizard-field">Основание отзыва<textarea required minLength={10} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /></label>
            <div className="button-row"><button className="primary">Подтвердить отзыв доступа</button>
              <button type="button" className="secondary" onClick={() => setRevoke("")}>Отмена</button></div>
          </form>}
        </article>)}
      </section>
      <section className="card"><h2>История действий</h2><p>Последние 100 событий дома.</p>
        <ol className="admin-history">{detail.history.map(event => <li key={event.id}>
          <strong>{actions[event.action] || event.action}</strong><p>{new Date(event.created_at).toLocaleString("ru-KZ")} · {event.actor || "Оператор"}</p>
          {event.details?.from && <p>{statuses[event.details.from]} → {statuses[event.details.to || ""]}</p>}
          {event.details?.reason && <p>{event.details.reason}</p>}
        </li>)}</ol>
      </section>
    </>}
    </fieldset>
  </main>;
}
