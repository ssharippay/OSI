import type { WizardDocument, HouseProfile } from "../wizard/models";
export type Role = "resident" | "chair";
export type House = {
  id: string;
  name: string;
  address: string;
  profile?: HouseProfile;
  status?: "pending_review" | "pilot_approved" | "suspended";
  contact?: string;
};
export type User = { id: string; name: string };
export type Premise = { id: string; houseId: string; number: string };
export type Membership = {
  id: string;
  userId: string;
  houseId: string;
  role: Role;
  premiseId?: string;
};
export type History = { date: string; text: string };
export type Message = {
  id: string;
  date: string;
  userId: string;
  text: string;
};
export type Ticket = {
  id: string;
  houseId: string;
  ownerId: string;
  subject: string;
  category: string;
  body: string;
  photo?: string;
  serverVersion?: number;
  status: "Новое" | "В работе" | "Выполнено";
  createdAt: string;
  location: string;
  dueDate: string;
  assignee: string;
  result: string;
  history: History[];
  messages: Message[];
};
export type Work = {
  id: string;
  houseId: string;
  title: string;
  body: string;
  planned: number;
  actual: number;
  date: string;
  status: string;
  doc: string;
  result: string;
  updatedAt: string;
};
export type ReportSnapshot = {
  house: House;
  month: string;
  preparedAt: string;
  dataMode?: "work";
  planned: number;
  actual: number;
  rows: Work[];
};
export type Doc = {
  id: string;
  houseId: string;
  title: string;
  body: string;
  status: "Черновик" | "Опубликован" | "Архив";
  audience: "residents" | "chair";
  createdAt: string;
  updatedAt: string;
  version: number;
  report?: ReportSnapshot;
  wizardSource?: { id: string; version: number; needsUpdate: boolean };
};
export type Announcement = {
  id: string;
  houseId: string;
  title: string;
  body: string;
  date: string;
  important: boolean;
};
export type Event = History & { houseId: string; userId: string };
export type State = {
  runtimeMode?: "work";
  files?: {
    id: string;
    collection: string;
    recordId: string;
    name: string;
    mime: string;
    bytes: number;
    extractionStatus: string;
  }[];
  schemaVersion: 2;
  wizardDocuments?: WizardDocument[];
  wizardDataVersion?: 2;
  houses: House[];
  users: User[];
  premises: Premise[];
  memberships: Membership[];
  tickets: Ticket[];
  docs: Doc[];
  works: Work[];
  announcements: Announcement[];
  events: Event[];
};
export type Context = { userId: string; houseId: string; month: string };
export type Page =
  | "home"
  | "tickets"
  | "docs"
  | "works"
  | "announcements"
  | "wizard"
  | "ai";
export type Source = {
  kind: "doc" | "ticket" | "work";
  id: string;
  label: string;
  date: string;
};
export type Answer = {
  text: string;
  sources: Source[];
  choices?: { id: string; label: string }[];
  draft?: "report" | "announcement" | "reply";
  report?: ReportSnapshot;
  wizardSource?: { id: string; version: number; needsUpdate: boolean };
};
