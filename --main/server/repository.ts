import type { DB } from "./db";
import type { State, Context } from "../src/models";
import { HttpError, deny } from "./security";
import { isChair, visibleDocs, visibleTickets } from "../src/store/selectors";
export const collections = [
  "tickets",
  "docs",
  "works",
  "announcements",
  "wizardDocuments",
] as const;
export async function member(
  db: DB,
  userId: string,
  houseId: string,
  chair = false,
) {
  const result = await db.query(
    "SELECT m.*,h.status FROM memberships m JOIN houses h ON h.id=m.house_id WHERE m.user_id=$1 AND m.house_id=$2",
    [userId, houseId],
  );
  const row = result.rows[0];
  if (!row || row.status === "suspended" || (chair && row.role !== "chair"))
    deny();
  return row;
}
export async function houseState(db: DB, houseId: string): Promise<State> {
  const h = (await db.query("SELECT * FROM houses WHERE id=$1", [houseId]))
    .rows[0];
  if (!h) deny();
  const ms = (
    await db.query("SELECT * FROM memberships WHERE house_id=$1", [houseId])
  ).rows;
  const users = (
    await db.query(
      "SELECT a.id,a.name FROM accounts a JOIN memberships m ON m.user_id=a.id WHERE m.house_id=$1",
      [houseId],
    )
  ).rows;
  const premises = (
    await db.query(
      'SELECT id,number,house_id AS "houseId" FROM premises WHERE house_id=$1',
      [houseId],
    )
  ).rows;
  const s: State = {
    schemaVersion: 2,
    runtimeMode: "work",
    wizardDataVersion: 2,
    houses: [
      {
        id: h.id,
        name: h.name,
        address: h.address,
        profile: h.profile || undefined,
        status: h.status,
        contact: h.contact,
      },
    ],
    users,
    premises,
    memberships: ms.map((m) => ({
      id: m.id,
      userId: m.user_id,
      houseId: m.house_id,
      role: m.role,
      premiseId: m.premise_id || undefined,
    })),
    tickets: [],
    docs: [],
    works: [],
    announcements: [],
    wizardDocuments: [],
    events: [],
  };
  const records = (
    await db.query("SELECT * FROM records WHERE house_id=$1", [houseId])
  ).rows;
  for (const r of records)
    (s[r.collection as (typeof collections)[number]] as any[]).push({
      ...r.payload,
      serverVersion: r.version,
    });
  const messages = (
    await db.query(
      "SELECT * FROM messages WHERE house_id=$1 ORDER BY created_at,id",
      [houseId],
    )
  ).rows;
  for (const t of s.tickets)
    t.messages = messages
      .filter((m) => m.ticket_id === t.id)
      .map((m) => ({
        id: m.id,
        userId: m.user_id,
        text: m.body,
        date: m.created_at.toISOString(),
      }));
  s.events = (
    await db.query(
      'SELECT created_at AS date,action AS text,house_id AS "houseId",user_id AS "userId" FROM audit WHERE house_id=$1 ORDER BY id DESC LIMIT 100',
      [houseId],
    )
  ).rows.map((r) => ({ ...r, date: r.date.toISOString() }));
  return s;
}
export async function visibleState(db: DB, userId: string, houseId: string) {
  await member(db, userId, houseId);
  const s = await houseState(db, houseId),
    c: Context = {
      userId,
      houseId,
      month: new Date().toISOString().slice(0, 7),
    },
    chair = isChair(s, c);
  s.docs = visibleDocs(s, c);
  s.tickets = visibleTickets(s, c);
  if (!chair) {
    s.wizardDocuments = [];
    s.events = [];
    s.houses = s.houses.map((h) => ({
      id: h.id,
      name: h.name,
      address: h.address,
      status: h.status,
      contact: h.contact,
    }));
    const names = new Set([
      userId,
      ...s.memberships.filter((m) => m.role === "chair").map((m) => m.userId),
      ...s.tickets.flatMap((t) => t.messages.map((m) => m.userId)),
    ]);
    s.users = s.users.filter((u) => names.has(u.id));
    s.memberships = s.memberships.filter((m) => m.userId === userId);
    s.premises = s.premises.filter((p) =>
      s.memberships.some((m) => m.premiseId === p.id),
    );
  }
  const homes = (
    await db.query(
      "SELECT h.id,h.name,h.address,h.status,h.contact,m.id AS membership_id,m.role,m.premise_id FROM houses h JOIN memberships m ON m.house_id=h.id WHERE m.user_id=$1 AND h.status<>'suspended'",
      [userId],
    )
  ).rows;
  for (const h of homes)
    if (h.id !== houseId) {
      s.houses.push({
        id: h.id,
        name: h.name,
        address: h.address,
        status: h.status,
        contact: h.contact,
      });
      s.memberships.push({
        id: h.membership_id,
        houseId: h.id,
        userId,
        role: h.role,
        premiseId: h.premise_id || undefined,
      });
    }
  const files = (
    await db.query(
      'SELECT id,record_collection AS collection,record_id AS "recordId",original_name AS name,mime,bytes,extraction_status AS "extractionStatus" FROM files WHERE house_id=$1',
      [houseId],
    )
  ).rows;
  s.files = files.filter((f) =>
    f.collection === "docs"
      ? s.docs.some((d) => d.id === f.recordId)
      : s.tickets.some((t) => t.id === f.recordId),
  );
  return {
    state: s,
    userId,
    revision: (
      await db.query("SELECT revision FROM houses WHERE id=$1", [houseId])
    ).rows[0].revision,
  };
}
export async function audit(
  db: DB,
  houseId: string | null,
  userId: string,
  action: string,
  id?: string,
) {
  await db.query(
    "INSERT INTO audit(house_id,user_id,action,entity_id) VALUES($1,$2,$3,$4)",
    [houseId, userId, action, id || null],
  );
}
export async function persistRecords(
  db: DB,
  before: State,
  after: State,
  houseId: string,
  userId: string,
) {
  for (const collection of collections)
    for (const raw of after[collection] || []) {
      const value = structuredClone(raw) as any;
      delete value.serverVersion;
      const old = (before[collection] || []).find(
        (d) => d.id === value.id,
      ) as any;
      const oldValue = old ? structuredClone(old) : undefined;
      if (oldValue) delete oldValue.serverVersion;
      if (JSON.stringify(oldValue) === JSON.stringify(value)) continue;
      const v = (old?.serverVersion || 0) + 1;
      if (collection === "tickets") {
        for (const m of value.messages)
          if (!old?.messages.some((x: any) => x.id === m.id))
            await db.query(
              "INSERT INTO messages(id,house_id,ticket_id,user_id,body,created_at) VALUES($1,$2,$3,$4,$5,$6)",
              [m.id, houseId, value.id, userId, m.text, m.date],
            );
      }
      await db.query(
        "INSERT INTO records(house_id,collection,id,payload,version) VALUES($1,$2,$3,$4,$5) ON CONFLICT(house_id,collection,id) DO UPDATE SET payload=EXCLUDED.payload,version=EXCLUDED.version",
        [houseId, collection, value.id, value, v],
      );
      await db.query(
        "INSERT INTO record_versions(house_id,collection,record_id,version,payload) VALUES($1,$2,$3,$4,$5)",
        [houseId, collection, value.id, v, value],
      );
      await audit(
        db,
        houseId,
        userId,
        `${collection}:${old ? "updated" : "created"}${collection === "docs" ? ":" + value.status : ""}`,
        value.id,
      );
    }
}
export async function readableRecord(
  db: DB,
  userId: string,
  houseId: string,
  collection: string,
  id: string,
) {
  const s = await visibleState(db, userId, houseId);
  const records = (s.state as any)[collection];
  const record = Array.isArray(records)
    ? records.find((r: any) => r.id === id)
    : null;
  if (!record) deny();
  return record;
}
export async function requireRevision(
  db: DB,
  houseId: string,
  revision: number,
) {
  const h = (
    await db.query("SELECT * FROM houses WHERE id=$1 FOR UPDATE", [houseId])
  ).rows[0];
  if (!h) deny();
  if (h.revision !== revision)
    throw new HttpError(
      409,
      "Данные изменены на другом устройстве. Обновите данные или сохраните свой проект отдельной копией.",
    );
  return h;
}
