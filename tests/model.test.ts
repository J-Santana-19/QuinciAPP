import { describe, expect, it } from "vitest";
import {
  addDebtPayment, allocateToGoal, createAppData, createYear, periodTotals,
  removeExpense, startNextYear, withdrawSavings, yearTotals,
} from "../source/src/model";
import { createPinRecord, verifyPin } from "../source/src/security";
import { createBackup, parseBackup } from "../source/src/storage";

describe("cálculos de quincena", () => {
  it("calcula ingresos, gastos, ahorro y disponible", () => {
    const totals = periodTotals({
      salary: 1000,
      extras: [{ id: "i1", concept: "Venta", amount: 200, date: "2026-08-09" }],
      expenses: [
        { id: "e1", concept: "Mercado", amount: 300, categoryId: "food", date: "2026-08-09" },
        { id: "e2", concept: "Cena", amount: 50, categoryId: "food", date: "2026-08-09", shared: { total: 100, percent: 50 } },
      ],
      savings: 100,
    });
    expect(totals).toMatchObject({ income: 1200, expenses: 350, savings: 100, available: 750 });
  });
});

describe("pagos de deuda", () => {
  it("reduce la deuda y crea un gasto vinculado", () => {
    const year = createYear(2026);
    year.debts.push({ id: "d1", name: "Visa", type: "Tarjeta", balance: 500, minimumPayment: 50, payments: [] });
    const paid = addDebtPayment(year, "d1", 100, "2026-08-09", 7, "q1");
    expect(paid.debts[0].balance).toBe(400);
    expect(paid.months[7].q1.expenses[0]).toMatchObject({ amount: 100, categoryId: "debt", debtId: "d1" });
    expect(periodTotals(paid.months[7].q1).available).toBe(-100);
  });

  it("restaura la deuda al eliminar el gasto vinculado", () => {
    const year = createYear(2026);
    year.debts.push({ id: "d1", name: "Visa", type: "Tarjeta", balance: 500, minimumPayment: 50, payments: [] });
    const paid = addDebtPayment(year, "d1", 100, "2026-08-09", 7, "q1");
    const restored = removeExpense(paid, 7, "q1", paid.months[7].q1.expenses[0].id);
    expect(restored.debts[0].balance).toBe(500);
    expect(restored.debts[0].payments).toHaveLength(0);
  });
});

describe("metas y retiros", () => {
  it("no permite retirar ahorro comprometido sin elegir una meta", () => {
    const year = createYear(2026);
    year.months[0].q1.savings = 100;
    year.goals.push({ id: "g1", name: "Viaje", target: 100, allocated: 100 });
    expect(() => withdrawSavings(year, "Retiro", 100, "2026-01-10")).toThrow(/asignado a metas/i);
  });

  it("reduce la asignación cuando el retiro sale de una meta", () => {
    const year = createYear(2026);
    year.months[0].q1.savings = 100;
    year.goals.push({ id: "g1", name: "Viaje", target: 100, allocated: 100 });
    const withdrawn = withdrawSavings(year, "Viaje", 100, "2026-01-10", "g1");
    expect(withdrawn.goals[0].allocated).toBe(0);
    expect(yearTotals(withdrawn).savings).toBe(0);
    expect(yearTotals(withdrawn).unallocatedSavings).toBe(0);
  });

  it("impide asignar más ahorro del disponible", () => {
    const year = createYear(2026);
    year.months[0].q1.savings = 50;
    year.goals.push({ id: "g1", name: "Viaje", target: 100, allocated: 0 });
    expect(() => allocateToGoal(year, "g1", 60)).toThrow(/suficiente ahorro/i);
  });
});

describe("cambio de año", () => {
  it("conserva ahorro, metas y deuda pendiente sin borrar el año anterior", () => {
    const data = createAppData(2026);
    const year = data.years["2026"];
    year.months[0].q1.savings = 200;
    year.goals.push({ id: "g1", name: "Fondo", target: 500, allocated: 150 });
    year.debts.push({ id: "d1", name: "Visa", type: "Tarjeta", balance: 300, minimumPayment: 40, payments: [] });
    const next = startNextYear(data, true);
    expect(next.activeYear).toBe(2027);
    expect(next.years["2026"]).toBe(year);
    expect(next.years["2027"].openingSavings).toBe(200);
    expect(next.years["2027"].goals[0].allocated).toBe(150);
    expect(next.years["2027"].debts[0].balance).toBe(300);
  });
});

describe("respaldo completo", () => {
  it("exporta e importa todos los años sin perder información", () => {
    const data = createAppData(2026);
    data.years["2026"].months[0].q1.salary = 1250;
    const restored = parseBackup(JSON.stringify(createBackup(data)));
    expect(restored).toEqual(data);
  });

  it("rechaza respaldos estructuralmente incompletos", () => {
    const data = createAppData(2026);
    data.years["2026"].months.pop();
    expect(() => parseBackup(JSON.stringify(createBackup(data)))).toThrow(/12 meses/i);
  });
});

describe("PIN local", () => {
  it("guarda un derivado seguro y valida únicamente el PIN correcto", async () => {
    const record = await createPinRecord("123456");
    expect(record.hash).not.toContain("123456");
    await expect(verifyPin("123456", record)).resolves.toBe(true);
    await expect(verifyPin("654321", record)).resolves.toBe(false);
  });
});
