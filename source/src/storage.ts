import { DEFAULT_CATEGORIES, MONTHS, todayIso } from "./constants";
import { createAppData, createYear, finiteNonNegative, makeId } from "./model";
import { createLegacyPinRecord } from "./security";
import type {
  AppData, BackupEnvelope, Category, Debt, Expense, Income, MonthData,
  PeriodData, PinRecord, RecurringTemplate, SavingsGoal, Theme, Withdrawal, YearData,
} from "./types";

export const STORAGE_KEY = "quinci:v2";
const LEGACY_PREFIX = "quinci:";

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Se esperaba un objeto.");
  return value as Record<string, unknown>;
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("Se esperaba una lista.");
  return value;
}

function string(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function normalizeIncome(value: unknown): Income {
  const item = object(value);
  return {
    id: string(item.id, makeId()),
    concept: string(item.concept ?? item.concepto, "Ingreso extra"),
    amount: finiteNonNegative(item.amount ?? item.monto),
    date: string(item.date ?? item.fecha, todayIso()),
    recurringId: item.recurringId ? string(item.recurringId) : undefined,
  };
}

function categoryIdFromLegacy(value: unknown): string {
  const name = string(value, "Otro").toLocaleLowerCase("es");
  return DEFAULT_CATEGORIES.find((category) => category.name.toLocaleLowerCase("es") === name)?.id || string(value, "other");
}

function normalizeExpense(value: unknown): Expense {
  const item = object(value);
  const legacyShared = Boolean(item.compartido);
  const total = finiteNonNegative(item.shared ? object(item.shared).total : item.montoTotal);
  const percent = finiteNonNegative(item.shared ? object(item.shared).percent : item.porcentaje);
  const shared = (legacyShared || item.shared) && total > 0 && percent > 0
    ? { total, percent: Math.min(100, percent) }
    : undefined;
  return {
    id: string(item.id, makeId()),
    concept: string(item.concept ?? item.concepto, "Gasto"),
    amount: finiteNonNegative(item.amount ?? item.monto),
    categoryId: categoryIdFromLegacy(item.categoryId ?? item.categoria),
    date: string(item.date ?? item.fecha, todayIso()),
    shared,
    recurringId: item.recurringId ? string(item.recurringId) : undefined,
    debtPaymentId: item.debtPaymentId ? string(item.debtPaymentId) : undefined,
    debtId: item.debtId ? string(item.debtId) : undefined,
  };
}

function normalizePeriod(value: unknown): PeriodData {
  const item = object(value);
  return {
    salary: finiteNonNegative(item.salary ?? item.ingreso),
    extras: array(item.extras ?? []).map(normalizeIncome),
    expenses: array(item.expenses ?? item.gastos ?? []).map(normalizeExpense),
    savings: finiteNonNegative(item.savings ?? item.ahorro),
  };
}

function normalizeMonth(value: unknown): MonthData {
  const month = object(value);
  return { q1: normalizePeriod(month.q1), q2: normalizePeriod(month.q2) };
}

function normalizeGoal(value: unknown): SavingsGoal {
  const item = object(value);
  return {
    id: string(item.id, makeId()),
    name: string(item.name ?? item.nombre, "Meta"),
    target: finiteNonNegative(item.target ?? item.objetivo),
    allocated: finiteNonNegative(item.allocated ?? item.asignado),
  };
}

function normalizeDebt(value: unknown): Debt {
  const item = object(value);
  return {
    id: string(item.id, makeId()),
    name: string(item.name ?? item.nombre, "Deuda"),
    type: string(item.type ?? item.tipo, "Otro"),
    balance: finiteNonNegative(item.balance ?? item.saldo),
    minimumPayment: finiteNonNegative(item.minimumPayment ?? item.pagoMinimo),
    payments: array(item.payments ?? []).map((paymentValue) => {
      const payment = object(paymentValue);
      return {
        id: string(payment.id, makeId()),
        amount: finiteNonNegative(payment.amount),
        date: string(payment.date, todayIso()),
        monthIndex: Math.max(0, Math.min(11, Number(payment.monthIndex) || 0)),
        period: payment.period === "q2" ? "q2" : "q1",
        expenseId: string(payment.expenseId, makeId()),
      };
    }),
  };
}

function normalizeWithdrawal(value: unknown): Withdrawal {
  const item = object(value);
  return {
    id: string(item.id, makeId()),
    concept: string(item.concept ?? item.concepto, "Retiro"),
    amount: finiteNonNegative(item.amount ?? item.monto),
    date: string(item.date ?? item.fecha, todayIso()),
    goalId: item.goalId ? string(item.goalId) : undefined,
  };
}

function normalizeRecurring(value: unknown): RecurringTemplate {
  const item = object(value);
  const kind = item.kind === "income" || !item.categoria && !item.categoryId ? "income" : "expense";
  return {
    id: string(item.id, makeId()),
    kind,
    concept: string(item.concept ?? item.concepto, kind === "income" ? "Ingreso extra" : "Gasto"),
    amount: finiteNonNegative(item.amount ?? item.monto),
    categoryId: kind === "expense" ? categoryIdFromLegacy(item.categoryId ?? item.categoria) : undefined,
    shared: item.shared ? {
      total: finiteNonNegative(object(item.shared).total),
      percent: finiteNonNegative(object(item.shared).percent),
    } : undefined,
  };
}

function normalizeYear(value: unknown, expectedYear?: number): YearData {
  const item = object(value);
  const yearNumber = Number(item.year ?? expectedYear);
  if (!Number.isInteger(yearNumber) || yearNumber < 2000 || yearNumber > 2200) throw new Error("El año no es válido.");

  let months: MonthData[];
  if (Array.isArray(item.months)) {
    if (item.months.length !== 12) throw new Error("El año debe contener 12 meses.");
    months = item.months.map(normalizeMonth);
  } else {
    const legacyMonths = object(item.months ?? item.meses);
    months = MONTHS.map((month) => normalizeMonth(legacyMonths[month]));
  }

  const budgetsSource = object(item.budgets ?? item.presupuestos ?? {});
  const budgets: Record<string, number> = {};
  Object.entries(budgetsSource).forEach(([key, amount]) => {
    const normalized = finiteNonNegative(amount);
    if (normalized > 0) budgets[categoryIdFromLegacy(key)] = normalized;
  });

  return {
    year: yearNumber,
    openingSavings: finiteNonNegative(item.openingSavings ?? item.ahorroInicial),
    months,
    withdrawals: array(item.withdrawals ?? item.retiros ?? []).map(normalizeWithdrawal),
    goals: array(item.goals ?? item.metas ?? []).map(normalizeGoal),
    debts: array(item.debts ?? item.deudas ?? []).map(normalizeDebt),
    budgets,
    recurring: array(item.recurring ?? item.recurrentes ?? []).map(normalizeRecurring),
  };
}

function normalizeCategory(value: unknown): Category {
  const item = object(value);
  const name = string(item.name ?? item.id, "Categoría");
  return {
    id: string(item.id, name.toLocaleLowerCase("es").replace(/[^a-z0-9]+/g, "-")),
    name,
    color: /^#[0-9a-f]{6}$/i.test(string(item.color)) ? string(item.color) : "#667085",
    custom: true,
  };
}

function normalizePin(value: unknown): PinRecord | undefined {
  if (!value) return undefined;
  const item = object(value);
  const salt = string(item.salt);
  const hash = string(item.hash);
  const iterations = Number(item.iterations);
  if (!salt || !hash || !Number.isInteger(iterations) || iterations < 100_000) throw new Error("La configuración del PIN es inválida.");
  return { salt, hash, iterations };
}

export function normalizeAppData(value: unknown): AppData {
  const item = object(value);
  if (Number(item.schemaVersion) !== 2) throw new Error("La versión del respaldo no es compatible.");
  const yearsSource = object(item.years);
  const years: Record<string, YearData> = {};
  Object.entries(yearsSource).forEach(([key, year]) => {
    const normalized = normalizeYear(year, Number(key));
    years[String(normalized.year)] = normalized;
  });
  const activeYear = Number(item.activeYear);
  if (!Number.isInteger(activeYear) || !years[String(activeYear)]) throw new Error("El año activo no existe en el respaldo.");
  const settings = object(item.settings ?? {});
  const security = object(item.security ?? {});
  const theme: Theme = settings.theme === "light" || settings.theme === "dark" ? settings.theme : "system";
  return {
    schemaVersion: 2,
    activeYear,
    years,
    customCategories: array(item.customCategories ?? []).map(normalizeCategory),
    settings: {
      currency: string(settings.currency, "$"),
      theme,
      lastBackupAt: settings.lastBackupAt ? string(settings.lastBackupAt) : undefined,
      welcomeSeen: Boolean(settings.welcomeSeen),
    },
    security: { pin: normalizePin(security.pin) },
  };
}

function legacyGet(key: string): string | null {
  return localStorage.getItem(`${LEGACY_PREFIX}${key}`);
}

async function migrateLegacy(): Promise<AppData | null> {
  const activeRaw = legacyGet("finanzas:data");
  if (!activeRaw) return null;
  const active = normalizeYear(JSON.parse(activeRaw));
  const data = createAppData(active.year);
  data.years = { [active.year]: active };
  data.activeYear = active.year;
  const archives = JSON.parse(legacyGet("finanzas:archives") || "[]") as unknown;
  if (Array.isArray(archives)) {
    archives.forEach((yearValue) => {
      const year = Number(yearValue);
      const raw = legacyGet(`finanzas:archive:${year}`);
      if (raw) data.years[String(year)] = normalizeYear(JSON.parse(raw), year);
    });
  }
  data.settings.currency = legacyGet("finanzas:currency") || "$";
  const theme = legacyGet("finanzas:theme");
  data.settings.theme = theme === "light" || theme === "dark" ? theme : "system";
  data.settings.lastBackupAt = legacyGet("finanzas:lastExport") || undefined;
  data.settings.welcomeSeen = Boolean(legacyGet("finanzas:welcomeSeen"));
  data.customCategories = array((JSON.parse(activeRaw) as Record<string, unknown>).categoriasPersonalizadas ?? []).map(normalizeCategory);
  const legacyPin = legacyGet("finanzas:pin");
  if (legacyPin) data.security.pin = await createLegacyPinRecord(legacyPin);
  return data;
}

export function saveAppData(data: AppData): void {
  const serialized = JSON.stringify(data);
  localStorage.setItem(STORAGE_KEY, serialized);
  if (localStorage.getItem(STORAGE_KEY) !== serialized) throw new Error("El navegador no confirmó la escritura de los datos.");
}

export async function loadAppData(): Promise<{ data: AppData; migrated: boolean }> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) return { data: normalizeAppData(JSON.parse(raw)), migrated: false };
  const migrated = await migrateLegacy();
  if (migrated) {
    saveAppData(migrated);
    return { data: migrated, migrated: true };
  }
  const data = createAppData();
  saveAppData(data);
  return { data, migrated: false };
}

export function createBackup(data: AppData): BackupEnvelope {
  return { product: "quinci", schemaVersion: 2, exportedAt: new Date().toISOString(), data };
}

export function parseBackup(text: string): AppData {
  const parsed = object(JSON.parse(text));
  if (parsed.product !== "quinci" || Number(parsed.schemaVersion) !== 2) throw new Error("Este archivo no es un respaldo Quinci compatible.");
  return normalizeAppData(parsed.data);
}

export function clearQuinciData(): void {
  localStorage.removeItem(STORAGE_KEY);
  const keys = Object.keys(localStorage).filter((key) => key.startsWith(`${LEGACY_PREFIX}finanzas:`));
  keys.forEach((key) => localStorage.removeItem(key));
}

export function seedYearIfMissing(data: AppData, year: number): AppData {
  return data.years[String(year)] ? data : { ...data, years: { ...data.years, [year]: createYear(year) } };
}
