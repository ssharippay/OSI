import type { Context, State, Ticket, Doc } from "../models";
import { today } from "../utils";
export const membership = (s: State, c: Context) =>
  s.memberships.find((m) => m.houseId === c.houseId && m.userId === c.userId);
export const isChair = (s: State, c: Context) =>
  membership(s, c)?.role === "chair";
export const house = (s: State, c: Context) =>
  s.houses.find((h) => h.id === c.houseId);
export const accessibleHouses = (s: State, userId: string) =>
  s.houses.filter((h) =>
    s.memberships.some((m) => m.houseId === h.id && m.userId === userId),
  );
export const visibleDocs = (s: State, c: Context): Doc[] =>
  !membership(s, c)
    ? []
    : s.docs
        .filter(
          (d) =>
            d.houseId === c.houseId &&
            (isChair(s, c) ||
              (d.status === "Опубликован" && d.audience === "residents")),
        )
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
export const visibleTickets = (s: State, c: Context) =>
  !membership(s, c)
    ? []
    : s.tickets.filter(
        (t) =>
          t.houseId === c.houseId && (isChair(s, c) || t.ownerId === c.userId),
      );
export const visibleWorks = (s: State, c: Context) =>
  !membership(s, c) ? [] : s.works.filter((w) => w.houseId === c.houseId);
export const visibleAnnouncements = (s: State, c: Context) =>
  !membership(s, c)
    ? []
    : s.announcements.filter((a) => a.houseId === c.houseId);
export const overdue = (t: Ticket, day = today()) =>
  !!t.dueDate && t.dueDate < day && t.status !== "Выполнено";
