import type { WizardDocument, FormBlock } from "./models";
import { accompanying } from "./engine";
export async function docxBlob(doc: WizardDocument) {
  const {
    Document,
    Paragraph,
    Table,
    TableRow,
    TableCell,
    TextRun,
    HeadingLevel,
    WidthType,
    TableLayoutType,
    PageBreak,
    Packer,
  } = await import("docx");
  const para = (text: string, bold = false) =>
    new Paragraph({
      children: text
        .split("\n")
        .flatMap((line, i) => [
          ...(i ? [new TextRun({ break: 1 })] : []),
          new TextRun({ text: line, bold }),
        ]),
      spacing: { after: 120 },
    });
  const cell = (
    text: string,
    options: { rowSpan?: number; columnSpan?: number } = {},
  ) => new TableCell({ ...options, children: [para(text)] });
  const children: (
    | InstanceType<typeof Paragraph>
    | InstanceType<typeof Table>
  )[] = [];
  const blocks: FormBlock[] = [
    ...doc.blocks,
    { type: "pageBreak" },
    ...accompanying(doc),
  ];
  for (const block of blocks) {
    if (block.type === "pageBreak")
      children.push(new Paragraph({ children: [new PageBreak()] }));
    else if (block.type === "heading")
      children.push(
        new Paragraph({
          text: block.text || "",
          heading:
            block.level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
          spacing: { after: 160 },
        }),
      );
    else if (block.type === "table") {
      const headers = block.headers || [],
        g = block.headerGroup;
      const rows = [];
      if (g) {
        rows.push(
          new TableRow({
            tableHeader: true,
            children: [
              ...headers
                .slice(0, g.from)
                .map((label) => cell(label, { rowSpan: 2 })),
              cell(g.label, { columnSpan: g.span }),
            ],
          }),
          new TableRow({
            tableHeader: true,
            children: headers.slice(g.from).map((label) => cell(label)),
          }),
        );
      } else
        rows.push(
          new TableRow({
            tableHeader: true,
            children: headers.map((label) => cell(label)),
          }),
        );
      rows.push(
        ...(block.rows || []).map(
          (row) => new TableRow({ children: row.map((text) => cell(text)) }),
        ),
      );
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows,
          layout: block.columnWidths ? TableLayoutType.FIXED : undefined,
          columnWidths: block.columnWidths?.map((width) =>
            Math.round(width * 100),
          ),
        }),
      );
    } else children.push(para(block.text || ""));
  }
  return Packer.toBlob(
    new Document({
      creator: "ҮйКөмек",
      title: doc.title,
      styles: {
        default: {
          document: {
            run: { font: "Arial", size: 20 },
            paragraph: { spacing: { after: 100 } },
          },
        },
      },
      sections: [
        {
          properties: {
            page: {
              size: { width: 11906, height: 16838 },
              margin: { top: 850, bottom: 850, left: 850, right: 850 },
            },
          },
          children,
        },
      ],
    }),
  );
}
export { xlsxBlob } from "./spreadsheet";
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
