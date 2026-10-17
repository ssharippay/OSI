import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool, migrateDatabase } from "../db";
import { createServer } from "../app";
import { hash } from "../security";
import type { AIContext } from "../ai";
import { initialInput, newItem, newArea } from "../../src/wizard/engine";
import { templates } from "../../src/wizard/registry";
import JSZip from "jszip";
import { stateChanges } from "../../src/live/api";
import { saveWizard, publishWizardCopy } from "../../src/wizard/store";
if (
  !new URL(process.env.DATABASE_URL || "postgres://invalid/").pathname.endsWith(
    "_test",
  )
)
  throw Error(
    "Integration tests require a dedicated database ending in _test.",
  );
process.env.PUBLIC_ORIGIN = "http://localhost:3000";
process.env.SMTP_HOST = "127.0.0.1";
process.env.SMTP_PORT = "51025";
process.env.SMTP_FROM = "noreply@example.test";
delete process.env.AI_API_KEY;
delete process.env.AI_ENABLED;
let app: Awaited<ReturnType<typeof createServer>>,
  normal: Awaited<ReturnType<typeof createServer>>,
  lastContext: AIContext;
const password = "Pilot-test-strong-password-2026";
class Client {
  cookie = "";
  csrf = "";
  user: any;
  ip = "127.0.0." + (Math.floor(Math.random() * 200) + 2);
  async call(method: string, url: string, body?: any) {
    const r = await app.inject({
      method: method as any,
      url,
      remoteAddress: this.ip,
      headers: {
        origin: "http://localhost:3000",
        "x-uykomek-request": "1",
        "x-csrf-token": this.csrf,
        cookie: this.cookie,
      },
      ...(body === undefined ? {} : { payload: body }),
    });
    const set = r.headers["set-cookie"];
    if (set) this.cookie = (Array.isArray(set) ? set[0] : set).split(";")[0];
    let data: any;
    try {
      data = r.json();
    } catch {
      data = r.body;
    }
    if (data.csrf) this.csrf = data.csrf;
    if (data.user) this.user = data.user;
    return { status: r.statusCode, data, raw: r };
  }
  async register(name: string) {
    const email = `${name.toLowerCase()}-${randomUUID()}@example.test`;
    const r = await this.call("POST", "/api/auth/register", {
      email,
      password,
      name,
    });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.match(String(r.raw.headers["set-cookie"]), /HttpOnly/);
    return email;
  }
  async state(houseId: string) {
    const r = await this.call("GET", "/api/state?houseId=" + houseId);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    return r.data;
  }
  async changes(houseId: string, changes: any[], revision?: number) {
    const s = revision === undefined ? await this.state(houseId) : { revision };
    return this.call("POST", `/api/houses/${houseId}/changes`, {
      revision: s.revision,
      month: "2026-10",
      confirmedPublication: true,
      changes,
    });
  }
}
let chair: Client,
  resident: Client,
  outsider: Client,
  house: string,
  otherHouse: string,
  docId: string,
  ticketId: string,
  residentEmail: string;
before(async () => {
  await migrateDatabase();
  app = await createServer({
    aiAdapter: async (ctx) => {
      lastContext = ctx;
      return {
        text: "Сведения из разрешенного документа.",
        sourceIds: ctx.sources.map((s) => s.id),
      };
    },
  });
  normal = await createServer();
  chair = new Client();
  resident = new Client();
  outsider = new Client();
  await chair.register("Chair");
  residentEmail = await resident.register("Resident");
  await outsider.register("Other");
  house = (
    await chair.call("POST", "/api/houses", {
      name: "OSI Pilot A",
      address: "Fictional address A",
      contact: "Test office",
    })
  ).data.id;
  otherHouse = (
    await outsider.call("POST", "/api/houses", {
      name: "OSI Pilot B",
      address: "Fictional address B",
    })
  ).data.id;
});
after(async () => {
  await app.close();
  await normal.close();
  await pool.end();
});
test("authentication, protected cookies, CSRF, session revocation", async () => {
  const c = new Client(),
    email = await c.register("Auth");
  assert.equal((await c.call("GET", "/api/auth/me")).data.user.email, email);
  const raw = await app.inject({
    method: "POST",
    url: "/api/auth/logout",
    headers: {
      cookie: c.cookie,
      origin: "https://wrong.test",
      "x-uykomek-request": "1",
      "x-csrf-token": c.csrf,
    },
  });
  assert.equal(raw.statusCode, 403);
  const saved = c.cookie;
  assert.equal((await c.call("POST", "/api/auth/logout")).status, 200);
  c.cookie = saved;
  assert.equal((await c.call("GET", "/api/auth/me")).status, 401);
  assert.equal(
    (await c.call("POST", "/api/auth/login", { email, password })).status,
    200,
  );
  assert.equal(
    (
      await c.call("POST", "/api/auth/password", {
        oldPassword: password,
        newPassword: password + "new",
      })
    ).status,
    200,
  );
  assert.equal((await c.call("POST", "/api/auth/logout")).status, 200);
  assert.equal(
    (await c.call("POST", "/api/auth/login", { email, password })).status,
    401,
  );
  assert.equal(
    (
      await c.call("POST", "/api/auth/login", {
        email,
        password: password + "new",
      })
    ).status,
    200,
  );
});
test("single-use, expiring invitations; residents cannot grant roles or access another house", async () => {
  const inv = await chair.call("POST", `/api/houses/${house}/invitations`, {
    email: residentEmail,
    role: "resident",
    premiseNumber: "1",
  });
  assert.equal(inv.status, 200);
  const secret = new URL(inv.data.url).hash.split("=")[1];
  assert.equal(
    (await resident.call("POST", "/api/invitations/accept", { token: secret }))
      .status,
    200,
  );
  assert.equal(
    (await resident.call("POST", "/api/invitations/accept", { token: secret }))
      .status,
    400,
  );
  assert.equal(
    (await resident.call("GET", "/api/state?houseId=" + otherHouse)).status,
    404,
  );
  assert.equal(
    (
      await resident.call("POST", `/api/houses/${house}/invitations`, {
        email: "other@example.test",
        role: "chair",
      })
    ).status,
    404,
  );
  const exp = await chair.call("POST", `/api/houses/${house}/invitations`, {
    email: residentEmail,
  });
  await pool.query(
    "UPDATE invitations SET expires_at=now()-interval '1 second' WHERE id=$1",
    [exp.data.id],
  );
  assert.equal(
    (
      await resident.call("POST", "/api/invitations/accept", {
        token: new URL(exp.data.url).hash.split("=")[1],
      })
    ).status,
    400,
  );
  assert.equal(
    (await resident.state(house)).state.memberships.find(
      (m: any) => m.houseId === house,
    ).role,
    "resident",
  );
});
test("tickets: server author/time, own tickets only, replies and reopen", async () => {
  ticketId = randomUUID();
  const time = "2000-01-01T00:00:00Z";
  const value = {
    id: ticketId,
    houseId: house,
    ownerId: resident.user.id,
    subject: "Pilot leak",
    body: "Fictional leakage",
    category: "Другое",
    location: "Entrance",
    status: "Новое",
    dueDate: "",
    assignee: "",
    result: "",
    photo: "",
    createdAt: time,
    history: [],
    messages: [],
  };
  assert.equal(
    (
      await resident.changes(house, [
        { collection: "tickets", id: ticketId, value },
      ])
    ).status,
    200,
  );
  let state = await chair.state(house),
    t = state.state.tickets[0];
  assert.notEqual(t.createdAt, time);
  t.messages.push({
    id: randomUUID(),
    userId: outsider.user.id,
    date: time,
    text: "Chair reply",
  });
  const saved = await chair.changes(
    house,
    [{ collection: "tickets", id: t.id, value: t }],
    state.revision,
  );
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  const reply = (await resident.state(house)).state.tickets[0].messages[0];
  assert.equal(reply.userId, chair.user.id);
  assert.ok(new Date(reply.date).getTime() > Date.now() - 60000);
  const second = new Client(),
    e = await second.register("SecondResident"),
    inv = (
      await chair.call("POST", `/api/houses/${house}/invitations`, { email: e })
    ).data;
  assert.equal(
    (
      await second.call("POST", "/api/invitations/accept", {
        token: new URL(inv.url).hash.split("=")[1],
      })
    ).status,
    200,
  );
  assert.equal((await second.state(house)).state.tickets.length, 0);
  assert.equal(
    (
      await second.changes(house, [
        {
          collection: "tickets",
          id: ticketId,
          value: { ...t, result: "overwrite" },
        },
      ])
    ).status,
    404,
  );
});
test("documents: draft privacy, server publication, version conflict, another device and archive", async () => {
  docId = randomUUID();
  const now = new Date().toISOString(),
    doc = {
      id: docId,
      houseId: house,
      title: "Pilot budget",
      body: "Published roof repair budget for pilot. Confidential draft first.",
      audience: "residents",
      status: "Черновик",
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
  assert.equal(
    (
      await chair.changes(house, [
        { collection: "docs", id: docId, value: doc },
      ])
    ).status,
    200,
  );
  assert.equal((await resident.state(house)).state.docs.length, 0);
  let s = await chair.state(house),
    d = s.state.docs.find((x: any) => x.id === docId);
  assert.equal(
    (
      await chair.changes(
        house,
        [
          {
            collection: "docs",
            id: docId,
            value: { ...d, status: "Опубликован", version: 2 },
          },
        ],
        s.revision,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await chair.changes(
        house,
        [
          {
            collection: "docs",
            id: docId,
            value: { ...d, status: "Архив", version: 2 },
          },
        ],
        s.revision,
      )
    ).status,
    409,
  );
  assert.ok(
    (await resident.state(house)).state.docs.some((d: any) => d.id === docId),
  );
  assert.equal(
    (
      await resident.call(
        "GET",
        `/api/houses/${otherHouse}/records/docs/${docId}/download`,
      )
    ).status,
    404,
  );
});
test("protected upload/download, content validation, search and archived access", async () => {
  const doc = (await chair.state(house)).state.docs.find(
    (d: any) => d.id === docId,
  );
  await chair.changes(house, [
    {
      collection: "docs",
      id: docId,
      value: { ...doc, status: "Черновик", version: doc.version + 1 },
    },
  ]);
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types/>");
  zip.file(
    "word/document.xml",
    "<w:document><w:t>Searchable roof document.</w:t></w:document>",
  );
  const data = await zip.generateAsync({ type: "nodebuffer" });
  const boundary = "PilotBoundary";
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.docx"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    ),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const upload = await app.inject({
    method: "POST",
    url: `/api/houses/${house}/files/docs/${docId}`,
    remoteAddress: chair.ip,
    headers: {
      origin: "http://localhost:3000",
      "x-uykomek-request": "1",
      "x-csrf-token": chair.csrf,
      cookie: chair.cookie,
      "content-type": "multipart/form-data; boundary=" + boundary,
    },
    payload,
  });
  assert.equal(upload.statusCode, 200, upload.body);
  const fileId = upload.json().id;
  assert.equal((await chair.call("GET", "/api/files/" + fileId)).status, 200);
  assert.equal(
    (await resident.call("GET", "/api/files/" + fileId)).status,
    404,
  );
  let d = (await chair.state(house)).state.docs.find(
    (d: any) => d.id === docId,
  );
  await chair.changes(house, [
    {
      collection: "docs",
      id: docId,
      value: { ...d, status: "Опубликован", version: d.version + 1 },
    },
  ]);
  assert.equal(
    (await resident.call("GET", "/api/files/" + fileId)).status,
    200,
  );
  assert.equal(
    (await outsider.call("GET", "/api/files/" + fileId)).status,
    404,
  );
  const search = await resident.call(
    "POST",
    `/api/houses/${house}/assistant/search`,
    { question: "roof", month: "2026-10" },
  );
  assert.ok(search.data.sources.some((s: any) => s.id === docId));
});
test("AI: honest missing key, permission-filtered context, explicit consent, source guard", async () => {
  const missing = await normal.inject({
    method: "POST",
    url: `/api/houses/${house}/assistant/ask`,
    headers: {
      cookie: resident.cookie,
      origin: "http://localhost:3000",
      "x-uykomek-request": "1",
      "x-csrf-token": resident.csrf,
    },
    payload: { question: "roof", month: "2026-10" },
  });
  assert.equal(missing.statusCode, 503);
  assert.match(missing.json().error, /ИИ не настроен/);
  assert.equal(
    (await resident.call("GET", `/api/houses/${house}/assistant/status`)).data
      .configured,
    false,
  );
  assert.equal(
    (
      await resident.call("PATCH", `/api/houses/${house}/settings`, {
        aiAllowed: true,
      })
    ).status,
    404,
  );
  await chair.call("PATCH", `/api/houses/${house}/settings`, {
    aiAllowed: true,
  });
  const answer = await resident.call(
    "POST",
    `/api/houses/${house}/assistant/ask`,
    { question: "roof", month: "2026-10" },
  );
  assert.equal(answer.status, 200, JSON.stringify(answer.data));
  assert.ok(lastContext.sources.every((s) => s.source.id === docId));
  assert.ok(!JSON.stringify(lastContext).includes(otherHouse));
  assert.ok(answer.data.sources.some((s: any) => s.id === docId));
});
test("wizard server templates, immutable versions, formula export and resident exclusion", async () => {
  const id = randomUUID(),
    input = initialInput("Pilot address", "Pilot OSI");
  input.year = "2026";
  input.declaredArea = "100";
  input.registryComplete = true;
  input.areas = [{ ...newArea(), number: "1", area: "100" }];
  input.commercialIncome = "0";
  input.inventoryReference = "Inventory";
  input.inspectionReference = "Inspection";
  input.items = [
    {
      ...newItem(),
      title: "Maintenance",
      unit: "service",
      quantity: "1",
      price: "10.01",
      frequency: "12",
      reason: "Test",
    },
  ];
  const value = {
    id,
    houseId: house,
    title: "Pilot estimate",
    input,
    status: "Черновик",
    step: 6,
    template: {
      id: templates.find((t) => t.kind === "estimate")!.id,
      headings: ["Malicious replacement"],
    },
    kind: "estimate",
    version: 1,
    revision: randomUUID(),
  };
  const r = await chair.changes(house, [
    { collection: "wizardDocuments", id, value },
  ]);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(
    r.data.state.wizardDocuments[0].template.headings.includes(
      "Malicious replacement",
    ),
    false,
  );
  assert.equal((await resident.state(house)).state.wizardDocuments.length, 0);
  assert.equal(
    (
      await resident.call(
        "GET",
        `/api/houses/${house}/wizard/${id}/export/xlsx`,
      )
    ).status,
    404,
  );
  assert.equal(
    (await chair.call("GET", `/api/houses/${house}/wizard/${id}/export/xlsx`))
      .status,
    200,
  );
  const versions = await chair.call(
    "GET",
    `/api/houses/${house}/records/wizardDocuments/${id}/versions`,
  );
  assert.equal(versions.status, 200);
  assert.equal(versions.data.versions.length, 1);
});
test("password reset via local mailbox: hashed, expiring, one-time and session invalidation", async () => {
  const c = new Client(),
    email = await c.register("Reset");
  await c.call("POST", "/api/auth/forgot", { email });
  const rows = (
    await pool.query(
      "SELECT token_hash FROM password_resets WHERE user_id=$1",
      [c.user.id],
    )
  ).rows;
  assert.equal(rows.length, 1);
  assert.match(rows[0].token_hash, /^[a-f0-9]{64}$/);
  const list = await (
    await fetch("http://localhost:58025/api/v1/messages")
  ).json();
  const message = list.messages.find((m: any) =>
    m.To.some((t: any) => t.Address === email),
  );
  assert.ok(message);
  const full = await (
    await fetch("http://localhost:58025/api/v1/message/" + message.ID)
  ).json();
  const secret = full.Text.match(/#reset=([A-Za-z0-9_-]+)/)[1];
  assert.notEqual(secret, rows[0].token_hash);
  assert.equal(hash(secret), rows[0].token_hash);
  const originalSession = c.cookie;
  assert.equal(
    (
      await c.call("POST", "/api/auth/reset", {
        token: secret,
        password: password + "reset",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await c.call("POST", "/api/auth/reset", {
        token: secret,
        password: password + "twice",
      })
    ).status,
    400,
  );
  c.cookie = originalSession;
  assert.equal((await c.call("GET", "/api/auth/me")).status, 401);
  const expired = randomUUID() + randomUUID();
  await pool.query(
    "INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES($1,$2,now()-interval '1 second')",
    [hash(expired), c.user.id],
  );
  assert.equal(
    (await c.call("POST", "/api/auth/reset", { token: expired, password }))
      .status,
    400,
  );
});
test("draft AI exclusion, archive revocation, role/house spoofing, source guard and quotas", async () => {
  const id = randomUUID(),
    now = new Date().toISOString(),
    doc = {
      id,
      houseId: house,
      title: "Secret unshared draft",
      body: "Private draft secret_marker_739",
      status: "Черновик",
      audience: "residents",
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
  assert.equal(
    (await chair.changes(house, [{ collection: "docs", id, value: doc }]))
      .status,
    200,
  );
  const search = await resident.call(
    "POST",
    `/api/houses/${house}/assistant/search`,
    { question: "secret_marker_739", month: "2026-10" },
  );
  assert.equal(search.data.sources.length, 0);
  assert.ok(!JSON.stringify(search.data).includes("Private draft"));
  assert.equal(
    (
      await resident.changes(
        otherHouse,
        [{ collection: "docs", id, value: { ...doc, houseId: otherHouse } }],
        0,
      )
    ).status,
    404,
  );
  const malicious = await createServer({
    aiAdapter: async () => ({
      text: "Forged source",
      sourceIds: ["doc:" + randomUUID()],
    }),
  });
  const result = await malicious.inject({
    method: "POST",
    url: `/api/houses/${house}/assistant/ask`,
    headers: {
      cookie: resident.cookie,
      origin: "http://localhost:3000",
      "x-uykomek-request": "1",
      "x-csrf-token": resident.csrf,
    },
    payload: { question: "roof", month: "2026-10" },
  });
  assert.equal(result.statusCode, 502);
  await malicious.close();
  process.env.AI_MONTHLY_REQUEST_LIMIT = "1";
  assert.equal(
    (
      await resident.call("POST", `/api/houses/${house}/assistant/ask`, {
        question: "roof",
        month: "2026-10",
      })
    ).status,
    429,
  );
  delete process.env.AI_MONTHLY_REQUEST_LIMIT;
  const d = (await chair.state(house)).state.docs.find(
    (d: any) => d.id === docId,
  );
  const f = (
    await pool.query("SELECT id FROM files WHERE record_id=$1", [docId])
  ).rows[0];
  assert.equal(
    (
      await chair.changes(house, [
        {
          collection: "docs",
          id: docId,
          value: { ...d, status: "Архив", version: d.version + 1 },
        },
      ])
    ).status,
    200,
  );
  assert.equal((await resident.call("GET", "/api/files/" + f.id)).status, 404);
  assert.equal(
    (
      await resident.call("POST", `/api/houses/${house}/assistant/search`, {
        question: "roof",
        month: "2026-10",
      })
    ).data.sources.length,
    0,
  );
});
test("invalid file formats rejected; house creation never verifies chair authority", async () => {
  const body = Buffer.from(
    '--InvalidFile\r\nContent-Disposition: form-data; name="file"; filename="fake.pdf"\r\nContent-Type: application/pdf\r\n\r\nnot a PDF\r\n--InvalidFile--\r\n',
  );
  const r = await app.inject({
    method: "POST",
    url: `/api/houses/${house}/files/tickets/${ticketId}`,
    headers: {
      cookie: resident.cookie,
      origin: "http://localhost:3000",
      "x-uykomek-request": "1",
      "x-csrf-token": resident.csrf,
      "content-type": "multipart/form-data; boundary=InvalidFile",
    },
    payload: body,
  });
  assert.equal(r.statusCode, 400);
  assert.equal(
    (await chair.state(house)).state.houses[0].status,
    "pending_review",
  );
  assert.equal(
    (
      await chair.call("PATCH", `/api/houses/${house}/settings`, {
        status: "pilot_approved",
      })
    ).status,
    400,
  );
  const bad = new Client();
  assert.equal(
    (
      await bad.call("POST", "/api/auth/register", {
        email: `role-${randomUUID()}@example.test`,
        password,
        name: "Role",
        role: "chair",
      })
    ).status,
    400,
  );
});

test("wizard publication and subsequent source edits preserve the original and mark the resident copy stale", async () => {
  let base = await chair.state(house);
  const wizard = base.state.wizardDocuments[0],
    context = { userId: chair.user.id, houseId: house, month: "2026-10" };
  let candidate = structuredClone(base.state);
  saveWizard(
    candidate,
    context,
    { ...candidate.wizardDocuments[0], status: "Подготовлен для проверки" },
    wizard.version,
  );
  let response = await chair.changes(
    house,
    stateChanges(base.state, candidate),
    base.revision,
  );
  assert.equal(response.status, 200, JSON.stringify(response.data));
  base = response.data;
  candidate = structuredClone(base.state);
  const ready = candidate.wizardDocuments[0];
  publishWizardCopy(
    candidate,
    context,
    ready.id,
    ready.version,
    true,
    "Работы и суммы: проверенная копия для жителей.",
  );
  response = await chair.changes(
    house,
    stateChanges(base.state, candidate),
    base.revision,
  );
  assert.equal(response.status, 200, JSON.stringify(response.data));
  base = response.data;
  const originalBody = base.state.wizardDocuments[0].blocks;
  const publicId = base.state.wizardDocuments[0].publicDocumentId;
  const publicText = (await resident.state(house)).state.docs.find(
    (d: any) => d.id === publicId,
  ).body;
  candidate = structuredClone(base.state);
  const source = candidate.wizardDocuments[0];
  saveWizard(
    candidate,
    context,
    {
      ...source,
      status: "Черновик",
      input: { ...source.input, fundingNotes: "Ручное изменение" },
    },
    source.version,
  );
  response = await chair.changes(
    house,
    stateChanges(base.state, candidate),
    base.revision,
  );
  assert.equal(response.status, 200, JSON.stringify(response.data));
  const visible = (await resident.state(house)).state.docs.find(
    (d: any) => d.id === publicId,
  );
  assert.equal(visible.body, publicText);
  assert.equal(visible.wizardSource.needsUpdate, true);
  assert.equal(
    response.data.state.wizardDocuments[0].publication,
    "Требует обновления",
  );
  const history = (
    await chair.call(
      "GET",
      `/api/houses/${house}/records/wizardDocuments/${wizard.id}/versions`,
    )
  ).data.versions;
  assert.ok(
    history.some(
      (v: any) =>
        JSON.stringify(v.payload.blocks) === JSON.stringify(originalBody),
    ),
  );
});
test("monthly expenses and immutable report snapshots use programmatic money and exclude private house profiles", async () => {
  const now = new Date().toISOString();
  for (const [planned, actual] of [
    [0.1, 0.2],
    [0.2, 0.1],
  ]) {
    const id = randomUUID(),
      value = {
        id,
        houseId: house,
        title: "Monthly test work",
        body: "Fictional maintenance",
        planned,
        actual,
        date: "2026-10-16",
        status: "В работе",
        doc: "",
        result: "",
        updatedAt: now,
      };
    assert.equal(
      (await chair.changes(house, [{ collection: "works", id, value }])).status,
      200,
    );
  }
  const badId = randomUUID();
  assert.equal(
    (
      await chair.changes(house, [
        {
          collection: "works",
          id: badId,
          value: {
            id: badId,
            houseId: house,
            title: "Invalid decimals",
            body: "Test",
            planned: 0.005,
            actual: 0,
            date: "2026-10-16",
            status: "В работе",
            doc: "",
            result: "",
            updatedAt: now,
          },
        },
      ])
    ).status,
    400,
  );
  const reportId = randomUUID();
  const result = await chair.changes(house, [
    {
      collection: "docs",
      id: reportId,
      value: {
        id: reportId,
        houseId: house,
        title: "Monthly report",
        body: "Report project",
        status: "Черновик",
        audience: "residents",
        version: 1,
        createdAt: now,
        updatedAt: now,
        report: {},
      },
    },
  ]);
  assert.equal(result.status, 200, JSON.stringify(result.data));
  const saved = result.data.state.docs.find((d: any) => d.id === reportId);
  assert.equal(saved.report.planned, 0.3);
  assert.equal(saved.report.actual, 0.3);
  assert.equal(saved.report.house.profile, undefined);
  const work = result.data.state.works[0];
  const changed = await chair.changes(house, [
    { collection: "works", id: work.id, value: { ...work, actual: 10.01 } },
  ]);
  assert.equal(changed.status, 200);
  assert.deepEqual(
    changed.data.state.docs.find((d: any) => d.id === reportId).report,
    saved.report,
  );
});
