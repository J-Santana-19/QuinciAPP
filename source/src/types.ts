export type PeriodKey = "q1" | "q2";
export type Theme = "light" | "dark" | "system";

export interface Income {
  id: string;
  concept: string;
  amount: number;
  date: string;
  recurringId?: string;
}

export interface SharedExpense {
  total: number;
  percent: number;
}

export interface Expense {
  id: string;
  concept: string;
  amount: number;
  categoryId: string;
  date: string;
  shared?: SharedExpense;
  recurringId?: string;
  debtPaymentId?: string;
  debtId?: string;
}

export interface PeriodData {
  salary: number;
  extras: Income[];
  expenses: Expense[];
  savings: number;
}

export interface MonthData {
  q1: PeriodData;
  q2: PeriodData;
}

export interface Withdrawal {
  id: string;
  concept: string;
  amount: number;
  date: string;
  goalId?: string;
}

export interface SavingsGoal {
  id: string;
  name: string;
  target: number;
  allocated: number;
}

export interface DebtPayment {
  id: string;
  amount: number;
  date: string;
  monthIndex: number;
  period: PeriodKey;
  expenseId: string;
}

export interface Debt {
  id: string;
  name: string;
  type: string;
  balance: number;
  minimumPayment: number;
  payments: DebtPayment[];
}

export interface RecurringTemplate {
  id: string;
  kind: "income" | "expense";
  concept: string;
  amount: number;
  categoryId?: string;
  shared?: SharedExpense;
}

export interface YearData {
  year: number;
  openingSavings: number;
  months: MonthData[];
  withdrawals: Withdrawal[];
  goals: SavingsGoal[];
  debts: Debt[];
  budgets: Record<string, number>;
  recurring: RecurringTemplate[];
}

export interface Category {
  id: string;
  name: string;
  color: string;
  custom?: boolean;
}

export interface PinRecord {
  salt: string;
  hash: string;
  iterations: number;
}

export interface AppSettings {
  currency: string;
  theme: Theme;
  lastBackupAt?: string;
  welcomeSeen: boolean;
}

export interface AppData {
  schemaVersion: 2;
  activeYear: number;
  years: Record<string, YearData>;
  customCategories: Category[];
  settings: AppSettings;
  security: { pin?: PinRecord };
}

export interface BackupEnvelope {
  product: "quinci";
  schemaVersion: 2;
  exportedAt: string;
  data: AppData;
}
