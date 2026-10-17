import { useState } from "react";
import { useApp } from "../AppContext";
import { api } from "./api";
export function FileAttachments({
  collection,
  id,
  canUpload = true,
}: {
  collection: "docs" | "tickets";
  id: string;
  canUpload?: boolean;
}) {
  const { live, data, c, notify, refreshServer } = useApp();
  const [busy, setBusy] = useState(false);
  if (!live) return null;
  const files =
    data.files?.filter(
      (f) => f.collection === collection && f.recordId === id,
    ) || [];
  return (
    <section className="file-attachments">
      <h3>Защищенные вложения</h3>
      {files.map((f) => (
        <p key={f.id}>
          <a href={"/api/files/" + f.id}>{f.name}</a>{" "}
          <small>
            {f.extractionStatus === "text"
              ? "Текст доступен поиску"
              : f.extractionStatus.includes("ocr")
                ? "Распознавание изображения/OCR не реализовано"
                : "Текст не извлечен"}
          </small>
        </p>
      ))}
      {canUpload && (
        <label className="wizard-field">
          Прикрепить файл до 10 МБ
          <input
            type="file"
            aria-label="Защищенный файл"
            accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg,.webp"
            disabled={busy}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 10 * 1024 * 1024) {
                notify("Файл больше 10 МБ.");
                return;
              }
              setBusy(true);
              try {
                const form = new FormData();
                form.append("file", f);
                await api(`/houses/${c.houseId}/files/${collection}/${id}`, {
                  method: "POST",
                  body: form,
                });
                await refreshServer();
                notify("Файл принят сервером.");
              } catch (err) {
                notify((err as Error).message);
              } finally {
                setBusy(false);
                e.target.value = "";
              }
            }}
          />
        </label>
      )}
      {busy && <p role="status">Сохраняем файл на сервере…</p>}
    </section>
  );
}
