import { MONTHS } from "./constants";
import { createBackup } from "./storage";
import type { AppData, YearData } from "./types";

function download(contents: BlobPart[], type: string, filename: string) {
  const url = URL.createObjectURL(new Blob(contents, { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

export function downloadBackup(data: AppData) {
  download([JSON.stringify(createBackup(data), null, 2)], "application/json", `quinci-respaldo-completo-${new Date().toISOString().slice(0, 10)}.json`);
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function downloadYearCsv(year: YearData) {
  const rows: unknown[][] = [["Fecha", "Mes", "Quincena", "Tipo", "Categoría", "Concepto", "Monto"]];
  year.months.forEach((month, monthIndex) => {
    (["q1", "q2"] as const).forEach((periodKey) => {
      const period = month[periodKey];
      const periodLabel = periodKey === "q1" ? "Q1" : "Q2";
      if (period.salary > 0) rows.push(["", MONTHS[monthIndex], periodLabel, "Salario", "", "Salario", period.salary]);
      period.extras.forEach((income) => rows.push([income.date, MONTHS[monthIndex], periodLabel, "Ingreso extra", "", income.concept, income.amount]));
      period.expenses.forEach((expense) => rows.push([expense.date, MONTHS[monthIndex], periodLabel, "Gasto", expense.categoryId, expense.concept, expense.amount]));
      if (period.savings > 0) rows.push(["", MONTHS[monthIndex], periodLabel, "Aporte a ahorro", "", "Ahorro", period.savings]);
    });
  });
  year.withdrawals.forEach((withdrawal) => rows.push([withdrawal.date, "", "", "Retiro de ahorro", "", withdrawal.concept, -withdrawal.amount]));
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  download(["\uFEFF", csv], "text/csv;charset=utf-8", `quinci-reporte-${year.year}.csv`);
}
