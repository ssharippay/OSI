import { z } from "zod";
const text = z.string().max(10000),
  id = z.string().uuid();
export const authInput = z
  .object({
    email: z
      .string()
      .email()
      .max(254)
      .transform((v) => v.trim().toLowerCase()),
    password: z.string().min(12).max(128),
    name: z.string().trim().min(2).max(100).optional(),
  })
  .strict();
export const houseInput = z
  .object({
    name: z.string().trim().min(2).max(150),
    address: z.string().trim().min(3).max(300),
    contact: z.string().max(300).default(""),
  })
  .strict();
const message = z
  .object({
    id,
    date: z.string(),
    userId: id,
    text: z.string().min(1).max(3000),
  })
  .strict();
export const ticketSchema = z
  .object({
    id,
    houseId: id,
    ownerId: id,
    subject: z.string().trim().min(1).max(150),
    body: z.string().trim().min(1).max(5000),
    category: z.string().max(100),
    location: z.string().max(200),
    status: z.enum(["Новое", "В работе", "Выполнено"]),
    dueDate: z.string().max(10),
    assignee: z.string().max(150),
    result: z.string().max(5000),
    photo: z.string().max(2200000).optional(),
    createdAt: z.string(),
    history: z.array(z.object({ date: z.string(), text })).max(5000),
    messages: z.array(message).max(5000),
    serverVersion: z.number().int().optional(),
  })
  .strict();
export const docSchema = z
  .object({
    id,
    houseId: id,
    title: z.string().trim().min(1).max(200),
    body: z.string().min(1).max(200000),
    status: z.enum(["Черновик", "Опубликован", "Архив"]),
    audience: z.enum(["residents", "chair"]),
    version: z.number().int().positive(),
    createdAt: z.string(),
    updatedAt: z.string(),
    report: z.record(z.unknown()).optional(),
    wizardSource: z
      .object({ id, version: z.number().int(), needsUpdate: z.boolean() })
      .optional(),
    serverVersion: z.number().int().optional(),
  })
  .strict();
export const workSchema = z
  .object({
    id,
    houseId: id,
    title: z.string().min(1).max(150),
    body: z.string().min(1).max(10000),
    planned: z.number().finite().min(0).max(1e9).multipleOf(0.01),
    actual: z.number().finite().min(0).max(1e9).multipleOf(0.01),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    status: z.string().max(100),
    doc: z.string().max(100),
    result: text,
    updatedAt: z.string(),
    serverVersion: z.number().int().optional(),
  })
  .strict();
export const announcementSchema = z
  .object({
    id,
    houseId: id,
    title: z.string().min(1).max(150),
    body: z.string().min(1).max(10000),
    date: z.string().max(40),
    important: z.boolean(),
    serverVersion: z.number().int().optional(),
  })
  .strict();
const areaSchema = z
  .object({
    id: z.string().max(100),
    number: z.string().max(30),
    kind: z.enum(["Квартира", "Нежилое помещение"]),
    area: z.string().max(30),
  })
  .strict();
export const profileSchema = z
  .object({
    version: z.number().int().nonnegative(),
    organization: z.string().min(1).max(150),
    address: z.string().min(1).max(300),
    chairman: z.string().max(150),
    declaredArea: z.string().max(30),
    areas: z.array(areaSchema).max(2000),
    registryComplete: z.boolean(),
    inventoryReference: text,
    inspectionReference: text,
  })
  .strict();
// Wizard input allows only existing fields, bounded strings/arrays; the server supplies the template and materialises forms.
export const wizardInputSchema = z
  .object({
    address: text,
    organization: text,
    year: z.string().max(4),
    declaredArea: z.string().max(30),
    areas: z.array(areaSchema).max(2000),
    items: z
      .array(
        z
          .object({
            id: z.string().max(100),
            title: z.string().max(1000),
            group: z.enum(["management", "maintenance", "savings", "target"]),
            quantity: z.string().max(30),
            unit: z.string().max(100),
            price: z.string().max(30),
            frequency: z.string().max(3),
            reason: text,
            currentRepair: z.boolean().optional(),
          })
          .strict(),
      )
      .max(1000),
    commercialIncome: z.string().max(30),
    incomeReason: text,
    minimumTerritory: text,
    minimumSource: text,
    minimumFrom: text,
    minimumTo: text,
    minimumValue: text,
    inventoryReference: text,
    inspectionReference: text,
    defectReference: text,
    fundingNotes: text,
    protocolNumber: text,
    meetingDate: z.string().max(10),
    meetingTime: z.string().max(10),
    meetingPlace: text,
    initiator: text,
    format: z.literal("Явочный формат"),
    apartmentOwners: z.string().max(30),
    nonresidentialOwners: z.string().max(30),
    participantsCount: z.string().max(30),
    participants: z
      .array(
        z
          .object({
            id: z.string().max(100),
            name: text,
            apartment: text,
            nonresidential: text,
            capacity: z.enum(["Собственник", "Представитель"]),
            authority: text,
            authorityUntil: text,
            contact: text,
          })
          .strict(),
      )
      .max(2000),
    invited: text,
    speakers: text,
    chair: text,
    secretary: text,
    questions: z
      .array(
        z
          .object({
            id: z.string().max(100),
            text,
            topic: text,
            paperFor: z.string().max(30),
            paperAgainst: z.string().max(30),
            paperAbstain: z.string().max(30),
            digitalFor: z.string().max(30),
            digitalAgainst: z.string().max(30),
            digitalAbstain: z.string().max(30),
            decision: text,
            sheetReference: text,
          })
          .strict(),
      )
      .max(100),
    votingSummary: text,
    attachments: text,
    registryComplete: z.boolean().optional(),
    preparer: text.optional(),
    pricesConfirmed: z.boolean().optional(),
  })
  .strict();
export const changesSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    confirmedPublication: z.boolean(),
    month: z.string().regex(/^\d{4}-\d{2}$/),
    changes: z
      .array(
        z.object({
          collection: z.enum([
            "houses",
            "tickets",
            "docs",
            "works",
            "announcements",
            "wizardDocuments",
          ]),
          id,
          value: z.record(z.unknown()),
        }),
      )
      .min(1)
      .max(30),
  })
  .strict();
