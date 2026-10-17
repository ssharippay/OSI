import pg from "pg";
import { randomUUID, scrypt } from "node:crypto";
const [action, id] = process.argv.slice(2);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  if (
    !["approve-house", "suspend-house", "revoke-member"].includes(action) ||
    !id ||
    !/^[0-9a-f-]{36}$/i.test(id)
  )
    throw Error(
      "Usage: node ops/admin.mjs approve-house|suspend-house|revoke-member UUID. Approval requires documented manual verification first.",
    );
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    let house = id;
    if (action === "revoke-member") {
      const row = (
        await db.query(
          "DELETE FROM memberships WHERE id=$1 AND role='resident' RETURNING house_id",
          [id],
        )
      ).rows[0];
      if (!row)
        throw Error(
          "Resident membership not found. Chair transfers require a documented operator procedure.",
        );
      house = row.house_id;
    } else {
      const result = await db.query(
        "UPDATE houses SET status=$2,revision=revision+1 WHERE id=$1",
        [id, action === "approve-house" ? "pilot_approved" : "suspended"],
      );
      if (!result.rowCount) throw Error("House not found.");
    }
    await db.query(
      "INSERT INTO audit(house_id,action,entity_id) VALUES($1,$2,$3)",
      [house, "operator:" + action, id],
    );
    await db.query("COMMIT");
    console.log("Operator action recorded.");
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
} finally {
  await pool.end();
}
