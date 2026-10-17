import { inlinePhoto } from "./files";
import { randomUUID } from "node:crypto";
import { fixed, decimal } from "../src/wizard/calculation";
import type { DB } from "./db";
import {
  changesSchema,
  ticketSchema,
  docSchema,
  workSchema,
  announcementSchema,
  profileSchema,
  wizardInputSchema,
} from "./contracts";
import {
  member,
  houseState,
  visibleState,
  requireRevision,
  persistRecords,
} from "./repository";
import { deny, HttpError } from "./security";
import {
  updateTicket,
  sendMessage,
  reopen,
  saveDoc,
  documentStatus,
  saveWork,
} from "../src/store/actions";
import { createWizard } from "../src/wizard/engine";
import { templates } from "../src/wizard/registry";
import {
  saveWizard,
  publishWizardCopy,
  archiveWizard,
} from "../src/wizard/store";
import { saveHouseProfile } from "../src/wizard/house";
import type { WizardDocument } from "../src/wizard/models";
import type { State } from "../src/models";
export async function applyChanges(
  db: DB,
  userId: string,
  houseId: string,
  body: unknown,
) {
  const req = changesSchema.parse(body),
    m = await member(db, userId, houseId),
    h = await requireRevision(db, houseId, req.revision);
  const before = await houseState(db, houseId),
    s = structuredClone(before),
    c = { userId, houseId, month: req.month },
    chair = m.role === "chair";
  if (
    new Set(req.changes.map((x) => x.collection + ":" + x.id)).size !==
    req.changes.length
  )
    throw new HttpError(400, "Повторяющиеся изменения.");
  const assertChair = () => {
    if (!chair) deny();
  };
  const now = () => new Date().toISOString();
  const generatedDocIds = new Set<string>();
  for (const change of req.changes.filter(
    (x) => x.collection === "wizardDocuments",
  )) {
    assertChair();
    const value = change.value as any;
    if (value.houseId !== houseId || value.id !== change.id) deny();
    const old = s.wizardDocuments?.find((d) => d.id === change.id);
    if (old && value.status === "Архив") {
      if (old.publicDocumentId) generatedDocIds.add(old.publicDocumentId);
      archiveWizard(s, c, old.id, old.version);
      continue;
    }
    const pub = req.changes.find(
      (x) =>
        x.collection === "docs" &&
        x.id !== old?.publicDocumentId &&
        (x.value.wizardSource as any)?.id === change.id &&
        x.value.status === "Опубликован",
    );
    if (pub && old) {
      if (
        JSON.stringify(value.input) !== JSON.stringify(old.input) ||
        value.version !== old.version
      )
        throw new HttpError(409, "Сначала сохраните исходный документ.");
      publishWizardCopy(
        s,
        c,
        old.id,
        old.version,
        req.confirmedPublication,
        String(pub.value.body || ""),
      );
      const newPublic = s.docs[0];
      generatedDocIds.add(pub.id);
      if (
        before.wizardDocuments?.find((d) => d.id === old.id)?.publicDocumentId
      )
        generatedDocIds.add(
          before.wizardDocuments.find((d) => d.id === old.id)!
            .publicDocumentId!,
        );
      // Keep the caller's generated UUID so the existing interface keeps its references.
      const generatedId = newPublic.id;
      newPublic.id = pub.id;
      old.publicDocumentId = pub.id;
      const history = old.publishedCopies?.find(
        (p) => p.documentId === generatedId,
      );
      if (history) history.documentId = pub.id;
      continue;
    }
    const input = wizardInputSchema.parse(value.input);
    let draft: WizardDocument;
    if (old) {
      if (value.version !== old.version + 1 || value.revision === old.revision)
        throw new HttpError(409, "Устаревшая версия проекта.");
      draft = {
        ...structuredClone(old),
        input,
        title: String(value.title || ""),
        step: Number(value.step),
        status: value.status,
      };
    } else {
      const t = templates.find(
        (t) => t.id === value.template?.id && t.implemented,
      );
      if (!t) throw new HttpError(400, "Шаблон недоступен.");
      draft = createWizard(t, houseId, h.address, h.name);
      draft.id = change.id;
      Object.assign(draft, {
        input,
        title: String(value.title || ""),
        step: Number(value.step),
        status: value.status,
      });
      if (h.profile) draft.houseSnapshot = structuredClone(h.profile);
      if (value.copiedFrom) {
        const origin = s.wizardDocuments?.find(
          (d) => d.id === value.copiedFrom.id,
        );
        if (!origin) throw new HttpError(404, "Исходная смета недоступна.");
        draft.copiedFrom = {
          id: origin.id,
          version: origin.version,
          year: origin.input.year,
        };
      }
    }
    if (
      !Number.isInteger(draft.step) ||
      draft.step < 0 ||
      draft.step > 6 ||
      !["Черновик", "Подготовлен для проверки"].includes(draft.status) ||
      draft.title.length > 150
    )
      throw new HttpError(400, "Проверьте проект.");
    // saveWizard checks the actual old revision; caller materialisations and template edits are ignored.
    if (
      old &&
      h.profile &&
      JSON.stringify(value.houseSnapshot) === JSON.stringify(h.profile)
    )
      draft.houseSnapshot = structuredClone(h.profile);
    draft.dataMode = "work";
    saveWizard(s, c, draft, old?.version);
    // Return the server version/revision; the UI must replace its optimistic candidate.
    if (old?.publicDocumentId) generatedDocIds.add(old.publicDocumentId);
  }
  for (const change of req.changes.filter(
    (x) => x.collection !== "wizardDocuments",
  )) {
    const v = change.value as any;
    if (change.collection === "houses") {
      assertChair();
      if (change.id !== houseId || v.id !== houseId) deny();
      const profile = profileSchema.parse(v.profile);
      if (profile.version !== (h.profile?.version || 0) + 1)
        throw new HttpError(409, "Карточка дома изменена.");
      saveHouseProfile(
        s,
        c,
        { ...profile, version: h.profile?.version || 0 },
        h.profile?.version || 0,
      );
      await db.query("UPDATE houses SET profile=$2 WHERE id=$1", [
        houseId,
        s.houses[0].profile,
      ]);
      for (const room of profile.areas) {
        if (!room.number.trim()) continue;
        const area = fixed(room.area, 2);
        await db.query(
          "INSERT INTO premises(id,house_id,number,kind,useful_area) VALUES($1,$2,$3,$4,$5) ON CONFLICT(house_id,kind,number) DO UPDATE SET useful_area=EXCLUDED.useful_area",
          [
            randomUUID(),
            houseId,
            room.number.trim(),
            room.kind,
            area !== null && area > 0n ? decimal(area) : null,
          ],
        );
      }
      continue;
    }
    if (v.houseId !== houseId || v.id !== change.id) deny();
    if (change.collection !== "tickets") assertChair();
    const stored = (before[change.collection as keyof State] as any[]).find(
      (r: any) => r.id === change.id,
    );
    if (
      stored &&
      change.collection === "tickets" &&
      !chair &&
      stored.ownerId !== userId
    )
      deny();
    if (stored && v.serverVersion !== stored.serverVersion)
      throw new HttpError(409, "Версия записи изменилась.");
    if (change.collection === "tickets") {
      const t = ticketSchema.parse(v),
        old = s.tickets.find((t) => t.id === change.id);
      if (!old) {
        if (
          t.ownerId !== userId ||
          t.status !== "Новое" ||
          t.messages.length ||
          t.dueDate ||
          t.result ||
          t.assignee
        )
          deny();
        if (t.photo && !t.photo.startsWith("data:image/"))
          throw new HttpError(400, "Проверьте фото.");
        s.tickets.unshift({
          ...t,
          createdAt: now(),
          ownerId: userId,
          history: [{ date: now(), text: "Создано новое обращение" }],
          messages: [],
        });
      } else {
        if (!chair && old.ownerId !== userId) deny();
        if (
          ["subject", "body", "category", "location", "ownerId", "photo"].some(
            (k) =>
              JSON.stringify((old as any)[k] || "") !==
              JSON.stringify((t as any)[k] || ""),
          )
        )
          throw new HttpError(
            400,
            "Исходное обращение не изменяется этим действием.",
          );
        if (chair)
          updateTicket(s, c, old.id, {
            status: t.status,
            dueDate: t.dueDate,
            assignee: t.assignee,
            result: t.result,
          });
        else if (t.status !== old.status) {
          if (t.status !== "В работе" || old.status !== "Выполнено") deny();
          const message = t.messages.find(
            (m) => !old.messages.some((x) => x.id === m.id),
          );
          if (!message) throw new HttpError(400, "Укажите причину возврата.");
          reopen(s, c, old.id, message.text);
        } else if (
          t.dueDate !== old.dueDate ||
          t.assignee !== old.assignee ||
          t.result !== old.result
        )
          deny();
        for (const message of t.messages.filter(
          (x) =>
            !before.tickets
              .find((b) => b.id === t.id)
              ?.messages.some((m) => m.id === x.id),
        )) {
          if (
            !old.messages.some(
              (m) =>
                m.text === message.text &&
                m.userId === userId &&
                new Date(m.date).getTime() > Date.now() - 1000,
            )
          )
            sendMessage(s, c, old.id, message.text);
        }
      }
    } else if (change.collection === "docs") {
      assertChair();
      if (generatedDocIds.has(change.id)) continue;
      const d = docSchema.parse(v),
        old = s.docs.find((d) => d.id === change.id);
      if (d.wizardSource)
        throw new HttpError(400, "Копия публикуется через мастер.");
      if (
        old &&
        old.body === d.body &&
        old.title === d.title &&
        old.audience === d.audience
      ) {
        if (d.status === "Опубликован" && !req.confirmedPublication)
          throw new HttpError(400, "Подтвердите публикацию.");
        documentStatus(s, c, old.id, d.status, old.version);
      } else {
        if (d.status !== "Черновик")
          throw new HttpError(
            400,
            "Новый или измененный документ сначала сохраняется черновиком.",
          );
        const report = d.report
          ? {
              house: structuredClone(s.houses[0]),
              month: req.month,
              preparedAt: now(),
              planned: 0,
              actual: 0,
              rows: [],
            }
          : undefined;
        if (report) {
          const { snapshot } = await import("../src/reports");
          Object.assign(report, snapshot(s, c));
        }
        saveDoc(
          s,
          c,
          { title: d.title, body: d.body, audience: d.audience },
          old?.id,
          report,
        );
        if (!old) s.docs[0].id = change.id;
      }
    } else if (change.collection === "works") {
      assertChair();
      const w = workSchema.parse(v),
        old = s.works.find((w) => w.id === change.id);
      saveWork(s, c, w, old?.id, old?.updatedAt);
      if (!old) s.works[0].id = change.id;
    } else if (change.collection === "announcements") {
      assertChair();
      if (!req.confirmedPublication)
        throw new HttpError(400, "Подтвердите публикацию.");
      const a = announcementSchema.parse(v),
        index = s.announcements.findIndex((x) => x.id === a.id);
      if (index >= 0)
        s.announcements[index] = { ...a, date: now().slice(0, 10) };
      else s.announcements.unshift({ ...a, date: now().slice(0, 10) });
    }
  }
  for (const t of s.tickets)
    if (!before.tickets.some((old) => old.id === t.id) && t.photo) {
      t.photo = (await inlinePhoto(db, userId, houseId, t.id, t.photo)).url;
    }
  await persistRecords(db, before, s, houseId, userId);
  await db.query("UPDATE houses SET revision=revision+1 WHERE id=$1", [
    houseId,
  ]);
  return visibleState(db, userId, houseId);
}
