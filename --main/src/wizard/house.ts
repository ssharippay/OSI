import type { Context, State } from "../models";
import type { HouseProfile, WizardDocument } from "./models";
import { chairOnly } from "../store/actions";
import { uid, stamp } from "../utils";
import { createWizard, renderForm } from "./engine";
export function houseProfile(s: State, c: Context): HouseProfile {
  const h = s.houses.find((h) => h.id === c.houseId)!;
  return structuredClone(
    h.profile || {
      version: 0,
      organization: h.name,
      address: h.address,
      chairman:
        s.users.find((u) =>
          s.memberships.some(
            (m) =>
              m.userId === u.id && m.houseId === h.id && m.role === "chair",
          ),
        )?.name || "",
      declaredArea: "",
      areas: [],
      registryComplete: false,
      inventoryReference: "",
      inspectionReference: "",
    },
  );
}
export function saveHouseProfile(
  s: State,
  c: Context,
  profile: HouseProfile,
  expected: number,
) {
  chairOnly(s, c);
  const h = s.houses.find((h) => h.id === c.houseId)!;
  if ((h.profile?.version || 0) !== expected)
    throw new Error(
      "Карточка дома изменена в другой вкладке. Откройте новую версию.",
    );
  if (!profile.organization.trim() || !profile.address.trim())
    throw new Error("Укажите название ОСИ и адрес.");
  h.profile = structuredClone({ ...profile, version: expected + 1 });
  return h.profile;
}
const profileInput = (p: HouseProfile) => ({
  organization: p.organization,
  address: p.address,
  preparer: p.chairman,
  declaredArea: p.declaredArea,
  areas: structuredClone(p.areas),
  registryComplete: p.registryComplete,
  inventoryReference: p.inventoryReference,
  inspectionReference: p.inspectionReference,
});
export function fromHouse(
  s: State,
  c: Context,
  template: WizardDocument["template"],
) {
  chairOnly(s, c);
  const p = houseProfile(s, c);
  const doc = createWizard(template, c.houseId, p.address, p.organization);
  doc.dataMode = s.runtimeMode;
  doc.houseSnapshot = structuredClone(p);
  if (doc.kind === "estimate") Object.assign(doc.input, profileInput(p));
  doc.blocks = renderForm(doc);
  return doc;
}
export function houseDifferences(doc: WizardDocument, p: HouseProfile) {
  const labels = {
    organization: "Название ОСИ",
    address: "Адрес",
    preparer: "Председатель / составитель",
    declaredArea: "Полезная площадь, м²",
    areas: "Реестр помещений",
    registryComplete: "Полнота реестра",
    inventoryReference: "Инвентарный перечень",
    inspectionReference: "Акт осмотра",
  };
  const next = profileInput(p);
  const show = (v: unknown) =>
    Array.isArray(v)
      ? v
          .map((r) => `${r.kind} №${r.number}: ${r.area || "нет площади"} м²`)
          .join("; ")
      : typeof v === "boolean"
        ? v
          ? "Полный"
          : "Неполный"
        : String(v || "Не заполнено");
  return (Object.keys(next) as (keyof typeof next)[])
    .filter((k) => JSON.stringify(doc.input[k]) !== JSON.stringify(next[k]))
    .map((k) => ({
      key: k,
      label: labels[k],
      before: show(doc.input[k]),
      after: show(next[k]),
    }));
}
export function refreshFromHouse(
  doc: WizardDocument,
  p: HouseProfile,
): WizardDocument {
  if (doc.status !== "Черновик")
    throw new Error("Обновлять данные дома можно только в черновике.");
  const next = structuredClone(doc);
  Object.assign(next.input, profileInput(p));
  next.houseSnapshot = structuredClone(p);
  return next;
}
export function copyEstimate(
  doc: WizardDocument,
  year: string,
): WizardDocument {
  if (
    doc.kind !== "estimate" ||
    !/^\d{4}$/.test(year) ||
    +year < 2020 ||
    +year > 2100 ||
    year === doc.input.year
  )
    throw new Error("Укажите другой год от 2020 до 2100.");
  const copy = structuredClone(doc);
  Object.assign(copy, {
    id: uid(),
    title: `Годовая смета на ${year} год`,
    version: 0,
    step: 0,
    status: "Черновик",
    publication: "Не опубликован",
    publicDocumentId: undefined,
    publishedCopies: [],
    createdAt: stamp(),
    updatedAt: stamp(),
    copiedFrom: { id: doc.id, version: doc.version, year: doc.input.year },
  });
  copy.input.year = year;
  copy.input.pricesConfirmed = false;
  copy.blocks = renderForm(copy);
  return copy;
}
