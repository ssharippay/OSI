import { migrateDatabase } from "./db";
import { createServer } from "./app";
await migrateDatabase();
const app = await createServer();
await app.listen({
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || "0.0.0.0",
});
console.log(
  "ҮйКөмек API started; private request bodies and credentials are not logged.",
);
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
