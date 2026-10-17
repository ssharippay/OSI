import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { pool, transaction, type DB } from "./db";
import { HttpError } from "./security";

const uuid = z.string().uuid();
const status = z.enum(["pending_review", "pilot_approved", "suspended"]);
export async function requirePlatformAdmin(db: DB, req: FastifyRequest) {
  if (!req.auth) throw new HttpError(401, "Войдите в рабочий кабинет.");
  const result = await db.query(
    "SELECT user_id FROM platform_admins WHERE user_id=$1 FOR SHARE",
    [req.auth.id],
  );
  if (!result.rowCount) throw new HttpError(403, "Требуются права администратора платформы.");
  return req.auth.id;
}

export function registerAdminRoutes(app: FastifyInstance) {
  app.get("/api/admin/houses", async (req) => {
    await requirePlatformAdmin(pool, req);
    const query = z.object({
      after: uuid.optional(), status: status.optional(),
      search: z.string().trim().max(150).default(""),
    }).strict().parse(req.query);
    const rows = (await pool.query(
      `SELECT h.id,h.name,h.address,h.status,h.revision,
        (SELECT count(*)::integer FROM memberships m WHERE m.house_id=h.id) AS members
       FROM houses h WHERE ($1::uuid IS NULL OR h.id>$1)
         AND ($2::text IS NULL OR h.status=$2)
         AND ($3='' OR strpos(lower(h.name || ' ' || h.address),lower($3))>0)
       ORDER BY h.id LIMIT 51`,
      [query.after || null, query.status || null, query.search],
    )).rows;
    return { houses: rows.slice(0, 50), next: rows.length > 50 ? rows[49].id : null };
  });

  app.get("/api/admin/houses/:houseId", async (req) => {
    await requirePlatformAdmin(pool, req);
    const { houseId } = z.object({ houseId: uuid }).parse(req.params);
    const house = (await pool.query(
      "SELECT id,name,address,contact,status,revision FROM houses WHERE id=$1", [houseId],
    )).rows[0];
    if (!house) throw new HttpError(404, "Дом не найден.");
    const memberships = (await pool.query(
      `SELECT m.id,m.role,a.name,a.email FROM memberships m
       JOIN accounts a ON a.id=m.user_id WHERE m.house_id=$1 ORDER BY m.role,a.name LIMIT 501`, [houseId],
    )).rows;
    const history = (await pool.query(
      `SELECT au.id,au.action,au.entity_id,au.created_at,au.details,a.name AS actor
       FROM audit au LEFT JOIN accounts a ON a.id=au.user_id
       WHERE au.house_id=$1 ORDER BY au.id DESC LIMIT 100`, [houseId],
    )).rows;
    return { house, memberships: memberships.slice(0, 500),
      membershipsTruncated: memberships.length > 500, history };
  });

  app.post("/api/admin/houses/:houseId/status", async (req) => transaction(async (db) => {
    const actor = await requirePlatformAdmin(db, req);
    const { houseId } = z.object({ houseId: uuid }).parse(req.params);
    const input = z.object({
      status, revision: z.number().int().nonnegative(),
      reason: z.string().trim().min(10).max(1000),
      verified: z.boolean().default(false),
    }).strict().parse(req.body);
    if (input.status === "pilot_approved" && !input.verified)
      throw new HttpError(400, "Подтвердите документированную проверку подключения.");
    const house = (await db.query(
      "SELECT status,revision FROM houses WHERE id=$1 FOR UPDATE", [houseId],
    )).rows[0];
    if (!house) throw new HttpError(404, "Дом не найден.");
    if (house.revision !== input.revision) throw new HttpError(409, "Дом изменился. Обновите данные.");
    if (house.status === input.status) throw new HttpError(409, "Этот статус уже установлен.");
    await db.query("UPDATE houses SET status=$2,revision=revision+1 WHERE id=$1", [houseId, input.status]);
    await db.query(
      "INSERT INTO audit(house_id,user_id,action,entity_id,details) VALUES($1,$2,$3,$1,$4)",
      [houseId, actor, "platform:house_status", JSON.stringify({
        from: house.status, to: input.status, reason: input.reason, verified: input.verified,
      })],
    );
    return { ok: true };
  }));

  app.post("/api/admin/houses/:houseId/members/:id/revoke", async (req) => transaction(async (db) => {
    const actor = await requirePlatformAdmin(db, req);
    const { houseId, id } = z.object({ houseId: uuid, id: uuid }).parse(req.params);
    const input = z.object({ reason: z.string().trim().min(10).max(1000),
      revision: z.number().int().nonnegative() }).strict().parse(req.body);
    const house = (await db.query("SELECT revision FROM houses WHERE id=$1 FOR UPDATE", [houseId])).rows[0];
    if (!house) throw new HttpError(404, "Дом не найден.");
    if (house.revision !== input.revision) throw new HttpError(409, "Дом изменился. Обновите данные.");
    const result = await db.query(
      "DELETE FROM memberships WHERE id=$1 AND house_id=$2 AND role='resident' RETURNING user_id", [id, houseId],
    );
    if (!result.rowCount) throw new HttpError(404, "Членство жителя не найдено. Смена председателя требует отдельной процедуры.");
    await db.query("UPDATE houses SET revision=revision+1 WHERE id=$1", [houseId]);
    await db.query(
      "INSERT INTO audit(house_id,user_id,action,entity_id,details) VALUES($1,$2,$3,$4,$5)",
      [houseId, actor, "platform:member_revoked", id, JSON.stringify({ reason: input.reason })],
    );
    return { ok: true };
  }));
}
