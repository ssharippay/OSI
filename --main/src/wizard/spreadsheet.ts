import type { WizardDocument } from "./models";
import { calculate, groups, amount, fixed } from "./calculation";
import { validate } from "./rules";
import { accompanying } from "./engine";
export async function xlsxBlob(doc: WizardDocument) {
  if (doc.kind !== "estimate")
    throw new Error("XLSX предусмотрен только для сметы.");
  const errors = validate(doc).errors;
  if (errors.length)
    throw new Error("Расчетная выгрузка недоступна: " + errors.join(" "));
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "ҮйКөмек";
  wb.calcProperties.fullCalcOnLoad = true;
  const instruction = wb.addWorksheet("Инструкция");
  const input = wb.addWorksheet("Исходные данные");
  const items = wb.addWorksheet("Статьи расходов");
  const summary = wb.addWorksheet("Сводная смета");
  const rooms = wb.addWorksheet("Помещения");
  const basis = wb.addWorksheet("Основания и ограничения");
  const d = doc.input,
    c = calculate(d);
  const numeric = (v: string) => Number(v.replace(",", "."));
  const formula = (f: string, result: number | string) => ({
    formula: `IFERROR(${f},${f.includes('"Ошибка"') ? '"Ошибка"' : '""'})`,
    result,
  });
  [
    "Расчетная копия сметы ҮйКөмек",
    "Рекомендуемый шаблон. Скачивание не означает утверждение сметы.",
    "Желтые ячейки — ввод; голубые — формулы. Защита листов не установлена.",
    "Меняйте количества, цены, периоды и исходные площади. Формулы связаны между листами.",
    "На листе «Статьи расходов» подготовлены пустые строки с формулами. Заполните все поля A–F и H. Не стирайте G и I.",
    "Для дополнительных строк скопируйте целую последнюю строку с формулами ниже и замените ввод. Формулы итогов используют все строки колонок. Не вставляйте строку над заголовком.",
    "Раздел в A выбирайте из списка. Периоды: ежемесячно 12, ежеквартально 4, раз в год 1, свое целое количество 1–366.",
    "Количество — положительное, до 4 знаков; цена — неотрицательная, до 2 знаков. Годовая сумма округляется половиной вверх до тиына.",
    "Взнос помещения вычисляется прямо из годовых расходов, дохода и площади, без округленной ставки. Ставка на экране — только представление (6 знаков).",
    "При ошибках расчетные ячейки пусты; смотрите столбец «Проверка» и исходные данные. При неполном реестре без площади отдельного помещения его взнос не выводится.",
    "Коммерческий доход не должен превышать текущие расходы. Накопления и целевые сборы не прибавляются к текущему взносу.",
    "Это самостоятельный файл: изменения не синхронизируются обратно в приложение. Пересчет выполняет Excel/LibreOffice при открытии, не библиотека ExcelJS.",
    "Если Calc показывает прежние значения, выполните полный пересчет Ctrl+Shift+F9; в Excel включите автоматический расчет.",
    "Сохраненные результаты рассчитаны кодом приложения. Табличные приложения используют числовую точность около 15 значащих цифр; сверхбольшие значения не поддерживаются.",
    "Полнота исходных данных, местный минимум, законность расходов и утверждение собственниками не подтверждаются автоматически.",
  ].forEach((t) => instruction.addRow([t]));
  input.addRows([
    ["Показатель", "Значение"],
    ["ОСИ", d.organization],
    ["Адрес", d.address],
    ["Год", +d.year],
    [
      "Полная полезная площадь, м² (не площадь здания)",
      numeric(d.declaredArea),
    ],
    ["Годовой коммерческий доход, ₸", numeric(d.commercialIncome)],
    ["Основание дохода", d.incomeReason],
    ["Полный реестр: 1 — да, 0 — нет", d.registryComplete === false ? 0 : 1],
    [
      "Сумма известных площадей, м²",
      formula(
        "SUM('Помещения'!C:C)",
        d.areas.reduce(
          (s, r) => s + (fixed(r.area, 2) === null ? 0 : numeric(r.area)),
          0,
        ),
      ),
    ],
    [
      "Проверка исходных данных",
      formula(
        'IF(AND(ISNUMBER(B5),B5>0,ROUND(B5,2)=B5,ISNUMBER(B6),B6>=0,ROUND(B6,2)=B6,OR(B8=0,B8=1),COUNTIF(\'Помещения\'!E:E,"Ошибка")=0,IF(B8=1,ABS(B9-B5)<0.000001,B9<=B5)),"Готово","Ошибка")',
        "Готово",
      ),
    ],
    [
      "Реестр",
      d.registryComplete === false
        ? "Неполный. Полная площадь введена отдельно; индивидуальные суммы только по известным площадям."
        : "Полный",
    ],
  ]);
  items.addRow([
    "Раздел",
    "Название",
    "Количество",
    "Единица",
    "Стоимость, ₸",
    "Выполнений в год",
    "Годовая сумма, ₸",
    "Обоснование",
    "Проверка",
  ]);
  const capacity = Math.max(d.items.length + 50, 100);
  for (let i = 0; i < capacity; i++) {
    const r = i + 2,
      item = d.items[i],
      line = c.lines[i];
    if (item) {
      const product =
        fixed(item.quantity, 4)! *
        fixed(item.price, 2)! *
        BigInt(item.frequency);
      if (product > BigInt(Number.MAX_SAFE_INTEGER))
        throw new Error(
          "Числа статьи слишком велики для точного пересчета в Excel. Уменьшите масштаб расчета.",
        );
    }
    const validGroup = Object.values(groups)
      .map((label) => `A${r}="${label}"`)
      .join(",");
    items.addRow([
      item ? groups[item.group] : null,
      item?.title || null,
      item ? numeric(item.quantity) : null,
      item?.unit || null,
      item ? numeric(item.price) : null,
      item ? +item.frequency : null,
      formula(
        `IF(I${r}="Готово",ROUND(ROUND(C${r}*10000,0)*ROUND(E${r}*100,0)*F${r}/10000,0)/100,"")`,
        line?.cents != null ? amount(line.cents) : "",
      ),
      item?.reason || null,
      formula(
        `IF(COUNTA(A${r}:F${r},H${r})=0,"",IF(AND(OR(${validGroup}),B${r}<>"",D${r}<>"",H${r}<>"",ISNUMBER(C${r}),C${r}>0,ROUND(C${r},4)=C${r},ISNUMBER(E${r}),E${r}>=0,ROUND(E${r},2)=E${r},ISNUMBER(F${r}),F${r}=INT(F${r}),F${r}>=1,F${r}<=366,C${r}*10000*E${r}*100*F${r}<=9007199254740991),"Готово","Ошибка"))`,
        item ? "Готово" : "",
      ),
    ]);
    items.getCell(`A${r}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"' + Object.values(groups).join(",") + '"'],
      showErrorMessage: true,
      error: "Выберите раздел из списка",
    };
  }
  summary.addRow(["Раздел / показатель", "Сумма / значение"]);
  Object.entries(groups).forEach(([key, label], i) =>
    summary.addRow([
      label,
      formula(
        `IF(COUNTIF('Статьи расходов'!I:I,"Ошибка")>0,"",ROUND(SUMIF('Статьи расходов'!A:A,A${i + 2},'Статьи расходов'!G:G),2))`,
        amount(c.totals[key as keyof typeof c.totals]),
      ),
    ]),
  );
  summary.addRow([
    "Р — управление + содержание, ₸/год",
    formula('IF(COUNT(B2:B3)=2,ROUND(SUM(B2:B3),2),"")', amount(c.core)),
  ]);
  summary.addRow([
    "Д — коммерческий доход, ₸/год",
    formula("'Исходные данные'!B6", amount(c.income!)),
  ]);
  summary.addRow([
    "S — полная полезная площадь, м²",
    formula("'Исходные данные'!B5", numeric(d.declaredArea)),
  ]);
  summary.addRow([
    "Проверка расчетной базы",
    formula(
      'IF(AND(\'Исходные данные\'!B10="Готово",COUNTIF(\'Статьи расходов\'!I:I,"Ошибка")=0,COUNTIF(\'Статьи расходов\'!I:I,"Готово")>0,ISNUMBER(B6),B6>=B7),"Готово","Ошибка")',
      "Готово",
    ),
  ]);
  summary.addRow([
    "Текущий взнос, ₸/м² в месяц (6 знаков)",
    formula(
      'IF(B9="Готово",ROUND((ROUND(B6*100,0)-ROUND(B7*100,0))*1000000/(ROUND(B8*100,0)*12),0)/1000000,"")',
      Number(c.rateSix),
    ),
  ]);
  summary.addRow([
    "Накопления и целевые сборы",
    "B4 и B5 — отдельные планы, не включены в Р и текущий взнос.",
  ]);
  rooms.addRow([
    "Тип",
    "Номер",
    "Полезная площадь, м²",
    "Текущий взнос в месяц, ₸",
    "Проверка",
  ]);
  const roomCapacity = Math.max(d.areas.length + 20, 30);
  for (let i = 0; i < roomCapacity; i++) {
    const r = i + 2,
      room = d.areas[i];
    const charge = c.charges.find(
      (x) => x.number === room?.number && x.kind === room?.kind,
    );
    const status = room ? (room.area.trim() ? "Готово" : "Нет площади") : "";
    rooms.addRow([
      room?.kind || null,
      room?.number || null,
      room?.area.trim() ? numeric(room.area) : null,
      formula(
        `IF(AND(E${r}="Готово",'Сводная смета'!B9="Готово"),ROUND((ROUND('Сводная смета'!B6*100,0)-ROUND('Сводная смета'!B7*100,0))*ROUND(C${r}*100,0)/(ROUND('Исходные данные'!B5*100,0)*12),0)/100,"")`,
        charge ? Number(charge.monthly) : "",
      ),
      formula(
        `IF(COUNTA(A${r}:C${r})=0,"",IF(AND(OR(A${r}="Квартира",A${r}="Нежилое помещение"),B${r}<>"",COUNTIFS(A:A,A${r},B:B,B${r})=1),IF(C${r}="",IF('Исходные данные'!B8=0,"Нет площади","Ошибка"),IF(AND(ISNUMBER(C${r}),C${r}>0,ROUND(C${r},2)=C${r}),"Готово","Ошибка")),"Ошибка"))`,
        status,
      ),
    ]);
  }
  for (const b of accompanying(doc)) if (b.text) basis.addRow([b.text]);
  basis.addRow([
    "Нормативная логика не изменена. При неполном реестре расчет использует полную полезную площадь, введенную отдельно. Сведения с государственным реестром не сверены.",
  ]);
  input.columns = [{ width: 62 }, { width: 65 }];
  summary.columns = [{ width: 65 }, { width: 44 }];
  items.columns = [30, 40, 16, 16, 20, 20, 24, 48, 18].map((width) => ({
    width,
  }));
  rooms.columns = [28, 18, 25, 30, 20].map((width) => ({ width }));
  instruction.columns = basis.columns = [{ width: 115 }];
  for (const ws of wb.worksheets) {
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.eachRow((row) =>
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.alignment = { vertical: "top", wrapText: true };
        cell.font = { name: "Arial", size: 11 };
        if (cell.type === ExcelJS.ValueType.Formula)
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFE4F2FC" },
          };
      }),
    );
    ws.getRow(1).font = { name: "Arial", size: 12, bold: true };
    ws.pageSetup = {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: "1:1",
    };
  }
  const editable = (ws: typeof input, row: number, columns: number[]) =>
    columns.forEach((col) => {
      ws.getCell(row, col).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFFF2CC" },
      };
    });
  for (let r = 2; r <= 8; r++) editable(input, r, [2]);
  for (let r = 2; r <= capacity + 1; r++)
    editable(items, r, [1, 2, 3, 4, 5, 6, 8]);
  for (let r = 2; r <= roomCapacity + 1; r++) editable(rooms, r, [1, 2, 3]);
  items.getColumn(7).numFmt = rooms.getColumn(4).numFmt = "0.00";
  summary.getColumn(2).numFmt = "0.00";
  summary.getCell("B10").numFmt = "0.000000";
  items.pageSetup.printArea = `A1:I${d.items.length + 1}`;
  rooms.pageSetup.printArea = `A1:E${d.areas.length + 1}`;
  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([new Uint8Array(buffer)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
