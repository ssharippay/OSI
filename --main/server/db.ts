import pg from "pg";
import { readFile, readdir } from "node:fs/promises";
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  connectionTimeoutMillis: 5000,
});
export type DB = pg.Pool | pg.PoolClient;
export async function transaction<T>(fn: (db: pg.PoolClient) => Promise<T>) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const result = await fn(db);
    await db.query("COMMIT");
    return result;
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}
export async function migrateDatabase() {
  await transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(7263104)");
    await db.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    for (const file of (
      await readdir(new URL("./migrations/", import.meta.url))
    )
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      if (
        (
          await db.query("SELECT 1 FROM schema_migrations WHERE version=$1", [
            file,
          ])
        ).rowCount
      )
        continue;
      await db.query(
        await readFile(
          new URL("./migrations/" + file, import.meta.url),
          "utf8",
        ),
      );
      await db.query("INSERT INTO schema_migrations(version) VALUES($1)", [
        file,
      ]);
    }
  });
}
