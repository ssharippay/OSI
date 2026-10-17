import Fastify from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import staticFiles from "@fastify/static";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import path from "node:path";
import { existsSync } from "node:fs";
import JSZip from "jszip";
import { pool, transaction } from "./db";
import {
  hash,
  token,
  passwordHash,
  passwordMatches,
  HttpError,
  deny,
} from "./security";
import { authInput, houseInput } from "./contracts";
import {
  member,
  visibleState,
  audit,
  readableRecord,
  houseState,
} from "./repository";
import { applyChanges } from "./business";
import { storeFile, fileBytes } from "./files";
import { aiContext, askAI, aiStatus, type AIAdapter } from "./ai";
import { registerAdminRoutes } from "./admin";
const uuid = z.string().uuid(),
  email = z
    .string()
    .email()
    .max(254)
    .transform((v) => v.trim().toLowerCase()),
  password = z.string().min(12).max(128);
declare module "fastify" {
  interface FastifyRequest {
    auth: {
      id: string;
      name: string;
      email: string;
      csrf: string;
      sessionHash: string;
    } | null;
  }
}
export async function createServer(options: { aiAdapter?: AIAdapter } = {}) {
  const origin = process.env.PUBLIC_ORIGIN || "http://localhost:3000",
    secure = new URL(origin).protocol === "https:";
  if (
    !secure &&
    !["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname)
  )
    throw Error(
      "HTTP is allowed only for loopback development. Configure HTTPS.",
    );
  if (
    process.env.NODE_ENV === "production" &&
    !secure &&
    process.env.ALLOW_INSECURE_LOCAL !== "true"
  )
    throw Error("PUBLIC_ORIGIN must use HTTPS outside local development.");
  const app = Fastify({
    logger: false,
    bodyLimit: 4 * 1024 * 1024,
    trustProxy: process.env.TRUST_PROXY
      ? process.env.TRUST_PROXY.split(",").filter(Boolean)
      : false,
  });
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });
  await app.register(cookie);
  await app.register(rateLimit, { max: 150, timeWindow: 60000 });
  await app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 4, parts: 5 },
  });
  app.decorateRequest("auth", null);
  const cookieOptions = {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/api",
    maxAge: 14 * 24 * 60 * 60,
  };
  app.addHook("onRequest", async (req, reply) => {
    if (!req.url.startsWith("/api/")) return;
    reply.header("Cache-Control", "no-store").header("Pragma", "no-cache");
    const secret = req.cookies.uykomek_session;
    if (secret) {
      const row = (
        await pool.query(
          "SELECT a.id,a.name,a.email,s.csrf FROM sessions s JOIN accounts a ON a.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()",
          [hash(secret)],
        )
      ).rows[0];
      if (row) req.auth = { ...row, sessionHash: hash(secret) };
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (
        req.headers.origin !== origin ||
        req.headers["x-uykomek-request"] !== "1"
      )
        throw new HttpError(403, "Запрос отклонен: проверьте адрес сайта.");
      if (
        req.auth &&
        !req.url.startsWith("/api/auth/login") &&
        !req.url.startsWith("/api/auth/register") &&
        req.headers["x-csrf-token"] !== req.auth.csrf
      )
        throw new HttpError(403, "Сессия обновлена. Перезагрузите страницу.");
    }
  });
  const auth = (req: any) => {
    if (!req.auth) throw new HttpError(401, "Войдите в рабочий кабинет.");
    return req.auth as NonNullable<typeof req.auth>;
  };
  app.setErrorHandler((error, req, reply) => {
    const status =
      error instanceof z.ZodError
        ? 400
        : (error as any).statusCode ||
          ((error as any).code === "23505" ? 409 : 500);
    // Deliberately never log headers, body, cookies, tokens, SQL parameters or private text.
    if (status >= 500 && !(error instanceof HttpError))
      console.error(
        JSON.stringify({
          event: "request_failed",
          code: (error as any).code || "internal",
          requestId: req.id,
        }),
      );
    reply
      .code(status)
      .send({
        error:
          status === 400
            ? "Проверьте формат и обязательные поля."
            : status === 409
              ? "Конфликт данных. Запись уже существует или версия изменилась."
              : status >= 500
                ? error instanceof HttpError
                  ? error.message
                  : "Сервис временно недоступен. Попробуйте позже."
                : (error as Error).message,
      });
  });
  app.get("/api/health", async () => {
    await pool.query("SELECT 1");
    return { status: "ok", mode: "work" };
  });
  const newSession = async (user: any, reply: any) => {
    const secret = token(),
      csrf = token();
    await pool.query(
      "INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES($1,$2,$3,now()+interval '14 days')",
      [hash(secret), user.id, csrf],
    );
    reply.setCookie("uykomek_session", secret, cookieOptions);
    return { user: { id: user.id, name: user.name, email: user.email }, csrf };
  };
  const authRate = { config: { rateLimit: { max: 8, timeWindow: 60000 } } };
  app.post("/api/auth/register", authRate, async (req, reply) => {
    const input = authInput
        .extend({ name: z.string().trim().min(2).max(100) })
        .parse(req.body),
      id = randomUUID();
    const encoded = await passwordHash(input.password);
    await pool.query(
      "INSERT INTO accounts(id,email,name,password_hash) VALUES($1,$2,$3,$4)",
      [id, input.email, input.name, encoded],
    );
    await audit(pool, null, id, "auth:registered");
    return newSession({ id, ...input }, reply);
  });
  let dummyHash: string | undefined;
  app.post("/api/auth/login", authRate, async (req, reply) => {
    const input = authInput.parse(req.body);
    const attemptKey = "login:" + hash(input.email);
    const counter = (
      await pool.query(
        "INSERT INTO auth_attempts(key) VALUES($1) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN auth_attempts.window_start<now()-interval '15 minutes' THEN 1 ELSE auth_attempts.attempts+1 END,window_start=CASE WHEN auth_attempts.window_start<now()-interval '15 minutes' THEN now() ELSE auth_attempts.window_start END RETURNING attempts",
        [attemptKey],
      )
    ).rows[0].attempts;
    if (counter > 10)
      throw new HttpError(
        429,
        "Слишком много попыток. Повторите через 15 минут.",
      );
    const user = (
      await pool.query("SELECT * FROM accounts WHERE email=$1", [input.email])
    ).rows[0];
    dummyHash ||= await passwordHash(token());
    const valid = await passwordMatches(
      input.password,
      user?.password_hash || dummyHash,
    );
    if (!user || !valid) throw new HttpError(401, "Неверный email или пароль.");
    await pool.query("DELETE FROM auth_attempts WHERE key=$1", [attemptKey]);
    return newSession(user, reply);
  });
  app.get("/api/auth/me", async (req) => {
    const u = auth(req);
    const admin = await pool.query("SELECT 1 FROM platform_admins WHERE user_id=$1", [u.id]);
    return { user: { id: u.id, name: u.name, email: u.email, platformAdmin: !!admin.rowCount }, csrf: u.csrf };
  });
  registerAdminRoutes(app);
  app.post("/api/auth/logout", async (req, reply) => {
    const u = auth(req);
    await pool.query("DELETE FROM sessions WHERE token_hash=$1", [
      u.sessionHash,
    ]);
    reply.clearCookie("uykomek_session", {
      path: "/api",
      secure,
      httpOnly: true,
      sameSite: "lax",
    });
    return { ok: true };
  });
  app.post("/api/auth/forgot", authRate, async (req) => {
    const input = z.object({ email }).strict().parse(req.body);
    const user = (
      await pool.query("SELECT id FROM accounts WHERE email=$1", [input.email])
    ).rows[0];
    if (user) {
      const secret = token();
      await pool.query(
        "INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '20 minutes')",
        [hash(secret), user.id],
      );
      try {
        if (!process.env.SMTP_HOST) throw Error("smtp_missing");
        const mail = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT || 1025),
          secure: process.env.SMTP_SECURE === "true",
          disableFileAccess: true,
          disableUrlAccess: true,
          requireTLS: secure && process.env.SMTP_SECURE !== "true",
          auth: process.env.SMTP_USER
            ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
            : undefined,
          connectionTimeout: 5000,
          socketTimeout: 10000,
        });
        await mail.sendMail({
          from: process.env.SMTP_FROM || "ҮйКөмек <noreply@localhost>",
          to: input.email,
          subject: "ҮйКөмек: восстановление пароля",
          text: `Ссылка действует 20 минут и используется один раз:\n${origin}/?mode=work#reset=${secret}\nЕсли вы не запрашивали восстановление, не переходите по ссылке.`,
        });
      } catch {
        console.error(JSON.stringify({ event: "password_mail_failed" }));
      }
    }
    return {
      ok: true,
      message:
        "Если учетная запись существует, инструкция отправлена на ее email.",
    };
  });
  app.post("/api/auth/reset", authRate, async (req) => {
    const input = z
        .object({ token: z.string().min(32).max(100), password })
        .strict()
        .parse(req.body),
      encoded = await passwordHash(input.password);
    await transaction(async (db) => {
      const reset = (
        await db.query(
          "SELECT * FROM password_resets WHERE token_hash=$1 FOR UPDATE",
          [hash(input.token)],
        )
      ).rows[0];
      if (!reset || reset.used_at || new Date(reset.expires_at) <= new Date())
        throw new HttpError(400, "Ссылка недействительна или срок истек.");
      await db.query("UPDATE accounts SET password_hash=$2 WHERE id=$1", [
        reset.user_id,
        encoded,
      ]);
      await db.query(
        "UPDATE password_resets SET used_at=now() WHERE user_id=$1 AND used_at IS NULL",
        [reset.user_id],
      );
      await db.query("DELETE FROM sessions WHERE user_id=$1", [reset.user_id]);
      await audit(db, null, reset.user_id, "auth:password_reset");
    });
    return { ok: true };
  });
  app.post("/api/auth/password", authRate, async (req) => {
    const u = auth(req),
      input = z
        .object({ oldPassword: password, newPassword: password })
        .strict()
        .parse(req.body),
      row = (
        await pool.query("SELECT password_hash FROM accounts WHERE id=$1", [
          u.id,
        ])
      ).rows[0];
    if (!(await passwordMatches(input.oldPassword, row.password_hash)))
      throw new HttpError(401, "Текущий пароль неверен.");
    const encoded = await passwordHash(input.newPassword);
    await transaction(async (db) => {
      await db.query("UPDATE accounts SET password_hash=$2 WHERE id=$1", [
        u.id,
        encoded,
      ]);
      await db.query(
        "DELETE FROM sessions WHERE user_id=$1 AND token_hash<>$2",
        [u.id, u.sessionHash],
      );
      await db.query(
        "UPDATE password_resets SET used_at=now() WHERE user_id=$1 AND used_at IS NULL",
        [u.id],
      );
      await audit(db, null, u.id, "auth:password_changed");
    });
    return { ok: true };
  });
  app.get("/api/houses", async (req) => {
    const u = auth(req);
    return {
      houses: (
        await pool.query(
          "SELECT h.id,h.name,h.address,h.status,h.contact,m.role FROM houses h JOIN memberships m ON m.house_id=h.id WHERE m.user_id=$1 AND h.status<>'suspended'",
          [u.id],
        )
      ).rows,
    };
  });
  app.post("/api/houses", async (req) => {
    const u = auth(req),
      input = houseInput.parse(req.body),
      id = randomUUID(),
      org = randomUUID();
    await transaction(async (db) => {
      await db.query(
        "INSERT INTO organizations(id,name,created_by) VALUES($1,$2,$3)",
        [org, input.name, u.id],
      );
      await db.query(
        "INSERT INTO houses(id,organization_id,name,address,contact) VALUES($1,$2,$3,$4,$5)",
        [id, org, input.name, input.address, input.contact],
      );
      await db.query(
        "INSERT INTO memberships(id,house_id,user_id,role) VALUES($1,$2,$3,'chair')",
        [randomUUID(), id, u.id],
      );
      await audit(db, id, u.id, "house:created_pending_manual_review", id);
    });
    return { id, status: "pending_review" };
  });
  app.patch("/api/houses/:houseId/settings", async (req) => {
    const u = auth(req),
      { houseId } = req.params as any;
    uuid.parse(houseId);
    const input = z
      .object({
        aiAllowed: z.boolean().optional(),
        contact: z.string().max(300).optional(),
      })
      .strict()
      .parse(req.body);
    await member(pool, u.id, houseId, true);
    await transaction(async (db) => {
      await db.query(
        "UPDATE houses SET ai_allowed=COALESCE($2,ai_allowed),contact=COALESCE($3,contact),revision=revision+1 WHERE id=$1",
        [houseId, input.aiAllowed, input.contact],
      );
      await audit(db, houseId, u.id, "house:settings_updated", houseId);
    });
    return { ok: true };
  });
  app.post("/api/houses/:houseId/invitations", async (req) => {
    const u = auth(req),
      { houseId } = req.params as any;
    uuid.parse(houseId);
    await member(pool, u.id, houseId, true);
    const input = z
        .object({
          email,
          role: z.enum(["resident", "chair"]).default("resident"),
          premiseNumber: z.string().max(30).default(""),
        })
        .strict()
        .parse(req.body),
      secret = token(),
      id = randomUUID();
    await pool.query(
      "INSERT INTO invitations(id,token_hash,house_id,email,role,premise_number,created_by,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '3 days')",
      [
        id,
        hash(secret),
        houseId,
        input.email,
        input.role,
        input.premiseNumber,
        u.id,
      ],
    );
    await audit(pool, houseId, u.id, "invitation:created", id);
    return {
      id,
      url: `${origin}/?mode=work#invite=${secret}`,
      expiresInDays: 3,
    };
  });
  app.get("/api/houses/:houseId/invitations", async (req) => {
    const u = auth(req),
      { houseId } = req.params as any;
    uuid.parse(houseId);
    await member(pool, u.id, houseId, true);
    return {
      invitations: (
        await pool.query(
          "SELECT id,email,role,expires_at,used_at,revoked_at FROM invitations WHERE house_id=$1 ORDER BY expires_at DESC LIMIT 100",
          [houseId],
        )
      ).rows,
    };
  });
  app.post("/api/houses/:houseId/invitations/:id/revoke", async (req) => {
    const u = auth(req),
      { houseId, id } = req.params as any;
    uuid.parse(houseId);
    uuid.parse(id);
    await member(pool, u.id, houseId, true);
    await pool.query(
      "UPDATE invitations SET revoked_at=now() WHERE id=$1 AND house_id=$2 AND used_at IS NULL",
      [id, houseId],
    );
    await audit(pool, houseId, u.id, "invitation:revoked", id);
    return { ok: true };
  });
  app.post("/api/invitations/accept", async (req) => {
    const u = auth(req),
      input = z
        .object({ token: z.string().min(32).max(100) })
        .strict()
        .parse(req.body);
    return transaction(async (db) => {
      const invite = (
        await db.query(
          "SELECT * FROM invitations WHERE token_hash=$1 FOR UPDATE",
          [hash(input.token)],
        )
      ).rows[0];
      if (
        !invite ||
        invite.used_at ||
        invite.revoked_at ||
        new Date(invite.expires_at) <= new Date() ||
        invite.email !== u.email
      )
        throw new HttpError(
          400,
          "Приглашение недоступно, уже использовано или предназначено другому email.",
        );
      const h = (
        await db.query("SELECT status FROM houses WHERE id=$1", [
          invite.house_id,
        ])
      ).rows[0];
      if (h.status === "suspended") deny();
      let premiseId: string | undefined;
      if (invite.premise_number) {
        premiseId = randomUUID();
        const result = await db.query(
          "INSERT INTO premises(id,house_id,number) VALUES($1,$2,$3) ON CONFLICT(house_id,kind,number) DO UPDATE SET number=EXCLUDED.number RETURNING id",
          [premiseId, invite.house_id, invite.premise_number],
        );
        premiseId = result.rows[0].id;
      }
      const exists = (
        await db.query(
          "SELECT id FROM memberships WHERE user_id=$1 AND house_id=$2",
          [u.id, invite.house_id],
        )
      ).rowCount;
      if (exists)
        throw new HttpError(409, "Пользователь уже состоит в этом доме.");
      await db.query(
        "INSERT INTO memberships(id,house_id,user_id,role,premise_id) VALUES($1,$2,$3,$4,$5)",
        [randomUUID(), invite.house_id, u.id, invite.role, premiseId],
      );
      await db.query("UPDATE invitations SET used_at=now() WHERE id=$1", [
        invite.id,
      ]);
      await db.query("UPDATE houses SET revision=revision+1 WHERE id=$1", [
        invite.house_id,
      ]);
      await audit(
        db,
        invite.house_id,
        u.id,
        "membership:invitation_accepted",
        invite.id,
      );
      return { houseId: invite.house_id };
    });
  });
  app.get("/api/state", async (req) => {
    const u = auth(req),
      { houseId } = z.object({ houseId: uuid }).parse(req.query);
    return visibleState(pool, u.id, houseId);
  });
  app.post("/api/houses/:houseId/changes", async (req) => {
    const u = auth(req),
      houseId = uuid.parse((req.params as any).houseId);
    return transaction((db) => applyChanges(db, u.id, houseId, req.body));
  });
  app.get(
    "/api/houses/:houseId/wizard/:id/export/:type",
    async (req, reply) => {
      const u = auth(req),
        { houseId, id, type } = req.params as any;
      uuid.parse(houseId);
      uuid.parse(id);
      await member(pool, u.id, houseId, true);
      const doc = await readableRecord(
        pool,
        u.id,
        houseId,
        "wizardDocuments",
        id,
      );
      if (type === "print") return { version: doc.version };
      const { docxBlob, xlsxBlob } = await import("../src/wizard/exports");
      if (!["docx", "xlsx"].includes(type)) deny();
      const { validate } = await import("../src/wizard/rules");
      if (doc.kind === "estimate" && validate(doc).errors.length)
        throw new HttpError(
          400,
          "Исправьте ошибки сметы перед расчетной выгрузкой.",
        );
      const blob = type === "docx" ? await docxBlob(doc) : await xlsxBlob(doc);
      await audit(pool, houseId, u.id, "wizard:exported", id);
      return reply
        .type(blob.type)
        .header(
          "Content-Disposition",
          `attachment; filename="uykomek-project.${type}"`,
        )
        .send(Buffer.from(await blob.arrayBuffer()));
    },
  );
  app.get(
    "/api/houses/:houseId/records/docs/:id/download",
    async (req, reply) => {
      const u = auth(req),
        { houseId, id } = req.params as any;
      uuid.parse(houseId);
      uuid.parse(id);
      const doc = await readableRecord(pool, u.id, houseId, "docs", id);
      return reply
        .type("text/plain; charset=utf-8")
        .header(
          "Content-Disposition",
          'attachment; filename="uykomek-document.txt"',
        )
        .send(doc.body);
    },
  );
  app.get(
    "/api/houses/:houseId/records/:collection/:id/versions",
    async (req) => {
      const u = auth(req),
        { houseId, collection, id } = req.params as any;
      uuid.parse(houseId);
      uuid.parse(id);
      await member(pool, u.id, houseId, true);
      await readableRecord(pool, u.id, houseId, collection, id);
      return {
        versions: (
          await pool.query(
            "SELECT version,payload,created_at FROM record_versions WHERE house_id=$1 AND collection=$2 AND record_id=$3 ORDER BY version DESC",
            [houseId, collection, id],
          )
        ).rows,
      };
    },
  );
  app.post("/api/houses/:houseId/files/:collection/:id", async (req) => {
    const u = auth(req),
      { houseId, collection, id } = req.params as any;
    uuid.parse(houseId);
    uuid.parse(id);
    if (!["docs", "tickets"].includes(collection)) deny();
    await member(pool, u.id, houseId, collection === "docs");
    const record = await readableRecord(pool, u.id, houseId, collection, id);
    if (collection === "docs" && record.status !== "Черновик")
      throw new HttpError(
        400,
        "Файлы можно добавлять только в черновик документа.",
      );
    const part = await req.file();
    if (!part) throw new HttpError(400, "Выберите файл.");
    const data = await part.toBuffer();
    if (part.file.truncated) throw new HttpError(413, "Файл больше 10 МБ.");
    return transaction(async (db) => {
      await db.query("SELECT id FROM houses WHERE id=$1 FOR UPDATE", [houseId]);
      const result = await storeFile(
        db,
        u.id,
        houseId,
        collection,
        id,
        part.filename,
        data,
      );
      await db.query("UPDATE houses SET revision=revision+1 WHERE id=$1", [
        houseId,
      ]);
      await audit(db, houseId, u.id, "file:uploaded", result.id);
      return result;
    });
  });
  app.get("/api/files/:id", async (req, reply) => {
    const u = auth(req),
      id = uuid.parse((req.params as any).id),
      f = (await pool.query("SELECT * FROM files WHERE id=$1", [id])).rows[0];
    if (!f) deny();
    await readableRecord(
      pool,
      u.id,
      f.house_id,
      f.record_collection,
      f.record_id,
    );
    reply
      .header("Content-Type", f.mime)
      .header(
        "Content-Disposition",
        `attachment; filename="file.${f.stored_name.split(".").pop()}"; filename*=UTF-8''${encodeURIComponent(f.original_name)}`,
      )
      .header("Content-Security-Policy", "sandbox; default-src 'none'")
      .header("X-Content-Type-Options", "nosniff");
    return fileBytes(f.stored_name);
  });
  app.get("/api/houses/:houseId/export", async (req, reply) => {
    const u = auth(req),
      houseId = uuid.parse((req.params as any).houseId);
    await member(pool, u.id, houseId, true);
    const zip = new JSZip(),
      s = await houseState(pool, houseId);
    zip.file("house-data.json", JSON.stringify(s, null, 2));
    zip.file(
      "versions.json",
      JSON.stringify(
        (
          await pool.query(
            "SELECT collection,record_id,version,payload,created_at FROM record_versions WHERE house_id=$1",
            [houseId],
          )
        ).rows,
        null,
        2,
      ),
    );
    const files = (
      await pool.query("SELECT * FROM files WHERE house_id=$1", [houseId])
    ).rows;
    if (files.reduce((sum, f) => sum + f.bytes, 0) > 100 * 1024 * 1024)
      throw new HttpError(
        413,
        "Для большого архива используйте резервное копирование администратора.",
      );
    for (const f of files)
      zip.file("files/" + f.stored_name, await fileBytes(f.stored_name));
    await audit(pool, houseId, u.id, "house:exported", houseId);
    return reply
      .header("Content-Type", "application/zip")
      .header(
        "Content-Disposition",
        'attachment; filename="uykomek-house-export.zip"',
      )
      .send(await zip.generateAsync({ type: "nodebuffer" }));
  });
  const aiInput = z
    .object({
      question: z.string().trim().min(1).max(2000),
      month: z.string().regex(/^\d{4}-\d{2}$/),
    })
    .strict();
  app.get("/api/houses/:houseId/assistant/status", async (req) => {
    const u = auth(req),
      houseId = uuid.parse((req.params as any).houseId);
    await member(pool, u.id, houseId);
    return {
      ...aiStatus(),
      houseAllowed: (
        await pool.query("SELECT ai_allowed FROM houses WHERE id=$1", [houseId])
      ).rows[0].ai_allowed,
    };
  });
  app.post("/api/houses/:houseId/assistant/search", async (req) => {
    const u = auth(req),
      houseId = uuid.parse((req.params as any).houseId),
      input = aiInput.parse(req.body),
      ctx = await aiContext(pool, u.id, houseId, input.question, input.month);
    return {
      text: ctx.sources.length
        ? "Поиск по доступным материалам дома. Это поиск, а не ответ ИИ.\n" +
          ctx.sources
            .map((s) => s.source.label + ": " + s.text.slice(0, 500))
            .join("\n\n")
        : "В доступных материалах ничего не найдено.",
      sources: ctx.sources.map((s) => s.source),
    };
  });
  app.post(
    "/api/houses/:houseId/assistant/ask",
    { config: { rateLimit: { max: 10, timeWindow: 60000 } } },
    async (req) => {
      const u = auth(req),
        houseId = uuid.parse((req.params as any).houseId),
        input = aiInput.parse(req.body);
      return askAI(
        pool,
        u.id,
        houseId,
        input.question,
        input.month,
        options.aiAdapter,
      );
    },
  );
  const dist = path.resolve("dist");
  if (existsSync(path.join(dist, "index.html"))) {
    await app.register(staticFiles, { root: dist, cacheControl: false });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith("/api/")
        ? reply.code(404).send({ error: "Не найдено." })
        : reply.sendFile("index.html"),
    );
  }
  return app;
}
