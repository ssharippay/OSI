import yauzl from "yauzl";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import JSZip from "jszip";
import ExcelJS from "exceljs";
import type { DB } from "./db";
import { HttpError } from "./security";
const exec = promisify(execFile);
export const storageRoot = path.resolve(
  process.env.FILE_STORAGE_DIR || "/tmp/uykomek-pilot-files",
);
const types: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};
const decode = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
async function validateZip(data: Buffer) {
  await new Promise<void>((resolve, reject) => {
    let expanded = 0,
      entries = 0,
      finished = false;
    const timer = setTimeout(
      () => fail(new HttpError(400, "Превышено время проверки архива.")),
      5000,
    );
    let archive: yauzl.ZipFile | undefined;
    function fail(error: Error) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      archive?.close();
      reject(error);
    }
    yauzl.fromBuffer(
      data,
      { lazyEntries: true, validateEntrySizes: true },
      (err, zip) => {
        if (err || !zip) {
          fail(new HttpError(400, "Поврежденный архив Office."));
          return;
        }
        archive = zip;
        zip.on("error", () =>
          fail(new HttpError(400, "Поврежденный архив Office.")),
        );
        zip.on("entry", (entry: yauzl.Entry) => {
          if (++entries > 5000 || entry.uncompressedSize > 20 * 1024 * 1024) {
            fail(new HttpError(400, "Слишком большой архив Office."));
            return;
          }
          if (/\/$/.test(entry.fileName)) {
            zip.readEntry();
            return;
          }
          zip.openReadStream(entry, (error, stream) => {
            if (error || !stream) {
              fail(new HttpError(400, "Поврежденный архив Office."));
              return;
            }
            stream.on("data", (chunk) => {
              expanded += chunk.length;
              if (expanded > 20 * 1024 * 1024) {
                stream.destroy();
                fail(new HttpError(400, "Слишком большой распакованный файл."));
              }
            });
            stream.on("error", () =>
              fail(new HttpError(400, "Поврежденная часть Office.")),
            );
            stream.on("end", () => {
              if (!finished) zip.readEntry();
            });
          });
        });
        zip.on("end", () => {
          if (!finished) {
            finished = true;
            clearTimeout(timer);
            resolve();
          }
        });
        zip.readEntry();
      },
    );
  });
}
export async function storeFile(
  db: DB,
  userId: string,
  houseId: string,
  collection: string,
  recordId: string,
  name: string,
  data: Buffer,
  inline = false,
) {
  if (!data.length || data.length > (inline ? 1.5 : 10) * 1024 * 1024)
    throw new HttpError(400, "Файл пуст или превышает допустимый размер.");
  const ext = name.split(".").pop()?.toLowerCase() || "",
    mime = types[ext];
  if (!mime)
    throw new HttpError(400, "Разрешены PDF, DOCX, XLSX, JPG, PNG и WebP.");
  const first = data.subarray(0, 16);
  let extracted = "",
    status = "image_no_ocr";
  if (ext === "pdf") {
    if (!first.toString("ascii").startsWith("%PDF-"))
      throw new HttpError(400, "Содержимое не соответствует PDF.");
    status = "pending";
  } else if (
    ext === "png" &&
    !first.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    throw new HttpError(400, "Содержимое не соответствует PNG.");
  else if (
    (ext === "jpg" || ext === "jpeg") &&
    !(first[0] === 255 && first[1] === 216 && first[2] === 255)
  )
    throw new HttpError(400, "Содержимое не соответствует JPG.");
  else if (
    ext === "webp" &&
    !(
      first.toString("ascii", 0, 4) === "RIFF" &&
      first.toString("ascii", 8, 12) === "WEBP"
    )
  )
    throw new HttpError(400, "Содержимое не соответствует WebP.");
  else if (ext === "docx" || ext === "xlsx") {
    await validateZip(data);
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(data);
    } catch {
      throw new HttpError(400, "Поврежденный Office-файл.");
    }
    const entries = Object.values(zip.files);
    let total = 0;
    if (entries.length > 5000)
      throw new HttpError(400, "Слишком много частей файла.");
    for (const entry of entries) {
      total += (entry as any)._data?.uncompressedSize || 0;
      if (/vbaProject|embeddings\//i.test(entry.name))
        throw new HttpError(
          400,
          "Макросы и встроенные объекты не поддерживаются.",
        );
    }
    if (total > 20 * 1024 * 1024)
      throw new HttpError(400, "Слишком большой распакованный файл.");
    if (ext === "docx") {
      const part = zip.file("word/document.xml");
      if (!part) throw new HttpError(400, "Это не DOCX.");
      const xml = await part.async("string");
      extracted = [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
        .map((m) => decode(m[1]))
        .join(" ");
    } else {
      if (!zip.file("xl/workbook.xml"))
        throw new HttpError(400, "Это не XLSX.");
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(data as any);
      let count = 0;
      for (const ws of wb.worksheets)
        ws.eachRow((row) =>
          row.eachCell((cell) => {
            if (++count <= 10000) extracted += cell.text.slice(0, 1000) + " ";
          }),
        );
    }
    status = extracted.trim() ? "text" : "no_text_ocr_unavailable";
  }
  const totalBytes = Number(
    (
      await db.query(
        "SELECT COALESCE(SUM(bytes),0) AS bytes FROM files WHERE house_id=$1",
        [houseId],
      )
    ).rows[0].bytes,
  );
  if (
    totalBytes + data.length >
    Math.max(10, Number(process.env.HOUSE_FILE_LIMIT_MB) || 500) * 1024 * 1024
  )
    throw new HttpError(
      413,
      "Достигнут лимит файлов дома. Обратитесь к оператору.",
    );
  const id = randomUUID(),
    stored = id + "." + ext,
    filename =
      name.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(-100) || "file." + ext;
  await mkdir(storageRoot, { recursive: true, mode: 0o700 });
  const filePath = path.join(storageRoot, stored);
  await writeFile(filePath, data, { mode: 0o600, flag: "wx" });
  try {
    if (ext === "pdf") {
      try {
        const result = await exec(
          "pdftotext",
          ["-enc", "UTF-8", filePath, "-"],
          { timeout: 5000, maxBuffer: 1024 * 1024 },
        );
        extracted = result.stdout;
        status = extracted.trim() ? "text" : "no_text_ocr_unavailable";
      } catch {
        status = "text_extraction_failed";
      }
    }
    await db.query(
      "INSERT INTO files(id,house_id,record_collection,record_id,stored_name,original_name,mime,bytes,extracted_text,extraction_status,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
      [
        id,
        houseId,
        collection,
        recordId,
        stored,
        filename,
        mime,
        data.length,
        extracted.slice(0, 100000),
        status,
        userId,
      ],
    );
  } catch (e) {
    await unlink(filePath).catch(() => {});
    throw e;
  }
  return {
    id,
    url: "/api/files/" + id,
    name: filename,
    extractionStatus: status,
  };
}
export async function inlinePhoto(
  db: DB,
  userId: string,
  houseId: string,
  id: string,
  photo: string,
) {
  const match = photo.match(
    /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/,
  );
  if (!match) throw new HttpError(400, "Некорректное фото.");
  return storeFile(
    db,
    userId,
    houseId,
    "tickets",
    id,
    "photo." + (match[1] === "jpeg" ? "jpg" : match[1]),
    Buffer.from(match[2], "base64"),
    true,
  );
}
export const fileBytes = (stored: string) =>
  readFile(path.join(storageRoot, stored));
