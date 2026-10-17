import pg from "pg";
const [action, id, ...words] = process.argv.slice(2);
const reason = words.join(" ").trim();
if (!["grant", "revoke"].includes(action) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || "") ||
    reason.length < 10 || reason.length > 1000) {
  console.error("Usage: node ops/platform-admin.mjs grant|revoke ACCOUNT_UUID documented reason (10–1000 characters)");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required. Run inside the app container after migration.");
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    // Serialize operator grants/revocations, including the last-admin check.
    await db.query("SELECT pg_advisory_xact_lock(7263105)");
    if (action === "grant") {
      const account = await db.query("SELECT id FROM accounts WHERE id=$1", [id]);
      if (!account.rowCount) throw Error("Account not found.");
      const result = await db.query("INSERT INTO platform_admins(user_id) VALUES($1) ON CONFLICT DO NOTHING RETURNING user_id", [id]);
      if (!result.rowCount) throw Error("Account is already an administrator.");
    } else {
      await db.query("SELECT user_id FROM platform_admins WHERE user_id=$1 FOR UPDATE", [id]);
      const count = await db.query("SELECT count(*)::integer AS n FROM platform_admins");
      if (count.rows[0].n <= 1) throw Error("Cannot revoke the last administrator. Grant a replacement first.");
      const result = await db.query("DELETE FROM platform_admins WHERE user_id=$1 RETURNING user_id", [id]);
      if (!result.rowCount) throw Error("Administrator not found.");
    }
    await db.query("INSERT INTO audit(action,entity_id,details) VALUES($1,$2,$3)",
      ["operator:admin_" + action, id, JSON.stringify({ reason })]);
    await db.query("COMMIT");
    console.log("Platform administrator access updated and audited.");
  } catch (error) {
    await db.query("ROLLBACK");
    // Never print connection strings or SQL parameters from driver errors.
    console.error(error.code ? "Database operation failed; no changes committed." : error.message);
    process.exitCode = 1;
  } finally { db.release(); }
} catch {
  console.error("Database connection unavailable.");
  process.exitCode = 1;
} finally { await pool.end(); }
