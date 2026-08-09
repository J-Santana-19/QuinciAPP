import { MONTHS, todayIso } from "./constants";
import type {
  AppData, DebtPayment, Expense, MonthData, PeriodData, PeriodKey,
  SavingsGoal, Withdrawal, YearData,
} from "./types";

export const makeId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const emptyPeriod = (): PeriodData => ({ salary: 0, extras: [], expenses: [], savings: 0 });
export const emptyMonth = (): MonthData => ({ q1: emptyPeriod(), q2: emptyPeriod() });

export function createYear(year: number, openingSavings = 0): YearData {
  return {
    year,
    openingSavings: finiteNonNegative(openingSavings),
    months: Array.from({ length: 12 }, emptyMonth),
    withdrawals: [], goals: [], debts: [], budgets: {}, recurring: [],
  };
}

export function createAppData(year = new Date().getFullYear()): AppData {
  return {
    schemaVersion: 2,
    activeYear: year,
    years: { [year]: createYear(year) },
    customCategories: [],
    settings: { currency: "$", theme: "system", welcomeSeen: false },
    security: {},
  };
}

export function finiteNonNegative(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function money(value: number, currency = "$"): string {
  const formatted = finiteNonNegative(Math.abs(value)).toLocaleString("es-PA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${value < 0 ? "−" : ""}${currency}${formatted}`;
}

export function periodTotals(period: PeriodData) {
  const extras = period.extras.reduce((sum, item) => sum + finiteNonNegative(item.amount), 0);
  const expenses = period.expenses.reduce((sum, item) => sum + finiteNonNegative(item.amount), 0);
  const income = finiteNonNegative(period.salary) + extras;
  const savings = finiteNonNegative(period.savings);
  return { salary: finiteNonNegative(period.salary), extras, expenses, income, savings, available: income - expenses - savings };
}

export function yearTotals(year: YearData) {
  let income = 0;
  let expenses = 0;
  let contributions = 0;
  const byMonth = year.months.map((month) => {
    const q1 = periodTotals(month.q1);
    const q2 = periodTotals(month.q2);
    income += q1.income + q2.income;
    expenses += q1.expenses + q2.expenses;
    contributions += q1.savings + q2.savings;
    return { income: q1.income + q2.income, expenses: q1.expenses + q2.expenses };
  });
  const withdrawals = year.withdrawals.reduce((sum, item) => sum + finiteNonNegative(item.amount), 0);
  const savings = Math.max(0, finiteNonNegative(year.openingSavings) + contributions - withdrawals);
  const goalAllocations = year.goals.reduce((sum, goal) => sum + finiteNonNegative(goal.allocated), 0);
  return {
    income, expenses, contributions, withdrawals, savings,
    available: income - expenses - contributions,
    goalAllocations,
    unallocatedSavings: Math.max(0, savings - goalAllocations),
    byMonth,
  };
}

export function categoryTotals(year: YearData): Record<string, number> {
  const totals: Record<string, number> = {};
  year.months.forEach((month) => ([month.q1, month.q2] as PeriodData[]).forEach((period) => {
    period.expenses.forEach((expense) => {
      totals[expense.categoryId] = (totals[expense.categoryId] ?? 0) + finiteNonNegative(expense.amount);
    });
  }));
  return totals;
}

export function addDebtPayment(
  year: YearData,
  debtId: string,
  amountInput: number,
  date: string,
  monthIndex: number,
  period: PeriodKey,
): YearData {
  const amount = finiteNonNegative(amountInput);
  const debt = year.debts.find((item) => item.id === debtId);
  if (!debt) throw new Error("No se encontró la deuda.");
  if (amount <= 0) throw new Error("El pago debe ser mayor que cero.");
  if (amount > debt.balance) throw new Error("El pago no puede superar el saldo pendiente.");
  if (monthIndex < 0 || monthIndex > 11) throw new Error("El mes del pago no es válido.");

  const paymentId = makeId();
  const expenseId = makeId();
  const payment: DebtPayment = { id: paymentId, amount, date, monthIndex, period, expenseId };
  const expense: Expense = {
    id: expenseId,
    concept: `Pago · ${debt.name}`,
    amount,
    categoryId: "debt",
    date,
    debtId,
    debtPaymentId: paymentId,
  };
  const months = year.months.map((month, index) => index === monthIndex
    ? { ...month, [period]: { ...month[period], expenses: [...month[period].expenses, expense] } }
    : month);
  const debts = year.debts.map((item) => item.id === debtId
    ? { ...item, balance: Math.max(0, item.balance - amount), payments: [...item.payments, payment] }
    : item);
  return { ...year, months, debts };
}

export function removeExpense(year: YearData, monthIndex: number, period: PeriodKey, expenseId: string): YearData {
  const expense = year.months[monthIndex]?.[period].expenses.find((item) => item.id === expenseId);
  if (!expense) return year;
  let debts = year.debts;
  if (expense.debtPaymentId && expense.debtId) {
    debts = debts.map((debt) => debt.id === expense.debtId
      ? {
          ...debt,
          balance: debt.balance + expense.amount,
          payments: debt.payments.filter((payment) => payment.id !== expense.debtPaymentId),
        }
      : debt);
  }
  const months = year.months.map((month, index) => index === monthIndex
    ? { ...month, [period]: { ...month[period], expenses: month[period].expenses.filter((item) => item.id !== expenseId) } }
    : month);
  return { ...year, months, debts };
}

export function allocateToGoal(year: YearData, goalId: string, deltaInput: number): YearData {
  const goal = year.goals.find((item) => item.id === goalId);
  if (!goal) throw new Error("No se encontró la meta.");
  const delta = Number(deltaInput);
  if (!Number.isFinite(delta) || delta === 0) throw new Error("Indica un monto válido.");
  const totals = yearTotals(year);
  if (delta > totals.unallocatedSavings) throw new Error("No hay suficiente ahorro libre para esa asignación.");
  const nextAllocated = Math.max(0, goal.allocated + delta);
  return { ...year, goals: year.goals.map((item) => item.id === goalId ? { ...item, allocated: nextAllocated } : item) };
}

export function withdrawSavings(
  year: YearData,
  concept: string,
  amountInput: number,
  date: string,
  goalId?: string,
): YearData {
  const amount = finiteNonNegative(amountInput);
  if (!concept.trim() || amount <= 0) throw new Error("Completa el concepto y el monto.");
  const totals = yearTotals(year);
  if (amount > totals.savings) throw new Error("No puedes retirar más de lo ahorrado.");

  let goals = year.goals;
  if (goalId) {
    const goal = goals.find((item) => item.id === goalId);
    if (!goal) throw new Error("No se encontró la meta seleccionada.");
    if (amount > goal.allocated) throw new Error("La meta no tiene suficiente dinero asignado.");
    goals = goals.map((item) => item.id === goalId ? { ...item, allocated: item.allocated - amount } : item);
  } else if (amount > totals.unallocatedSavings) {
    throw new Error("Ese monto está asignado a metas. Elige una meta como origen.");
  }

  const withdrawal: Withdrawal = { id: makeId(), concept: concept.trim(), amount, date, goalId };
  return { ...year, goals, withdrawals: [...year.withdrawals, withdrawal] };
}

export function startNextYear(data: AppData, carrySavings: boolean): AppData {
  const current = data.years[String(data.activeYear)];
  const nextYearNumber = data.activeYear + 1;
  if (data.years[String(nextYearNumber)]) return { ...data, activeYear: nextYearNumber };
  const totals = yearTotals(current);
  const next = createYear(nextYearNumber, carrySavings ? totals.savings : 0);
  next.budgets = { ...current.budgets };
  next.recurring = current.recurring.map((item) => ({ ...item }));
  next.goals = current.goals.map((goal) => ({ ...goal, allocated: carrySavings ? goal.allocated : 0 }));
  next.debts = current.debts
    .filter((debt) => debt.balance > 0)
    .map((debt) => ({ ...debt, payments: [] }));
  return { ...data, activeYear: nextYearNumber, years: { ...data.years, [nextYearNumber]: next } };
}

export function normalizeGoal(goal: Partial<SavingsGoal>): SavingsGoal {
  return {
    id: String(goal.id || makeId()),
    name: String(goal.name || "Meta"),
    target: finiteNonNegative(goal.target),
    allocated: finiteNonNegative(goal.allocated),
  };
}

export function monthLabel(index: number) {
  return MONTHS[index] ?? "Mes";
}

export function defaultDateForMonth(year: number, monthIndex: number, period: PeriodKey) {
  const now = new Date();
  if (now.getFullYear() === year && now.getMonth() === monthIndex) return todayIso();
  const day = period === "q1" ? 1 : 16;
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
