import { parseLearnerCsv } from "@shared/learner-import";

export interface LearnerSheet { name: string; rows: string[][] }

export async function readLearnerSpreadsheet(file: File): Promise<LearnerSheet[]> {
  if (file.size > 10 * 1024 * 1024) throw new Error("Files must be no larger than 10 MB.");
  if (/\.csv$/i.test(file.name)) return [{ name: "CSV", rows: parseLearnerCsv(await file.text()) }];
  if (!/\.xlsx$/i.test(file.name)) throw new Error("Choose an Excel (.xlsx) or CSV (.csv) file.");
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  return workbook.worksheets.map((sheet) => {
    if (sheet.rowCount > 10001 || sheet.columnCount > 100) {
      throw new Error(`Sheet ${sheet.name} exceeds the limit of 10,000 learners or 100 columns.`);
    }
    const rows: string[][] = [];
    for (let r = 1; r <= sheet.rowCount; r++) {
      const values: string[] = [];
      for (let c = 1; c <= sheet.columnCount; c++) {
        const cell = sheet.getCell(r, c);
        if (cell.type === ExcelJS.ValueType.Error) throw new Error(`Sheet ${sheet.name}, cell ${cell.address}: Excel error ${cell.text}.`);
        if (cell.type === ExcelJS.ValueType.Formula && cell.result === undefined) {
          throw new Error(`Sheet ${sheet.name}, cell ${cell.address}: formula has no cached value. Recalculate and save the workbook first.`);
        }
        const value = cell.type === ExcelJS.ValueType.Formula ? cell.result : cell.value;
        if (value && typeof value === "object" && "error" in value) throw new Error(`Sheet ${sheet.name}, cell ${cell.address}: Excel error ${value.error}.`);
        const format = cell.numFmt || "";
        // Preserve formatted IDs and convert fractional percent storage to 0–100 marks.
        values.push(typeof value === "number" && format.includes("%") ? `${Number((value * 100).toFixed(10))}%`
          : typeof value === "number" && /^0+$/.test(format) && Number.isInteger(value) ? String(value).padStart(format.length, "0") : cell.text);
      }
      rows.push(values);
    }
    return { name: sheet.name, rows };
  });
}
