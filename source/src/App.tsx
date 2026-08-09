import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  Archive, ArrowDownToLine, BarChart3, BookOpen, Check, ChevronRight, CircleDollarSign,
  Download, FileSpreadsheet, Goal, Landmark, Lock, Menu, Moon, Plus, Search, Settings,
  ShieldAlert, Sun, Trash2, Upload, WalletCards, X,
} from "lucide-react";
import { CURRENCIES, DEFAULT_CATEGORIES, MONTHS, currentPeriod, todayIso } from "./constants";
import { downloadBackup, downloadYearCsv } from "./downloads";
import {
  addDebtPayment, allocateToGoal, categoryTotals, createAppData, defaultDateForMonth,
  finiteNonNegative, makeId, money, periodTotals, removeExpense, startNextYear,
  withdrawSavings, yearTotals,
} from "./model";
import { createPinRecord, verifyPin } from "./security";
import { clearQuinciData, loadAppData, parseBackup, saveAppData } from "./storage";
import type {
  AppData, Category, Expense, Income, PeriodData, PeriodKey, RecurringTemplate,
  Theme, YearData,
} from "./types";
import { Dialog, EmptyState, Field, MoneyInput, Progress, Toast } from "./ui";

type View = "overview" | "period" | "savings" | "debts" | "settings";
type ToastState = { message: string; kind?: "success" | "error" | "info" };

const navItems: Array<{ id: View; label: string; icon: typeof BarChart3 }> = [
  { id: "overview", label: "Resumen", icon: BarChart3 },
  { id: "period", label: "Quincena", icon: BookOpen },
  { id: "savings", label: "Ahorro", icon: Goal },
  { id: "debts", label: "Deudas", icon: Landmark },
  { id: "settings", label: "Ajustes", icon: Settings },
];

function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [loadingError, setLoadingError] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [view, setView] = useState<View>("overview");
  const [monthIndex, setMonthIndex] = useState(new Date().getMonth());
  const [periodKey, setPeriodKey] = useState<PeriodKey>(currentPeriod());
  const [toast, setToast] = useState<ToastState | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);

  useEffect(() => {
    loadAppData()
      .then(({ data: loaded, migrated }) => {
        setData(loaded);
        setUnlocked(!loaded.security.pin);
        setWelcomeOpen(!loaded.settings.welcomeSeen);
        if (migrated) setToast({ message: "Tus datos anteriores se actualizaron al nuevo formato.", kind: "info" });
      })
      .catch((error: unknown) => setLoadingError(error instanceof Error ? error.message : "No se pudieron cargar los datos."));
  }, []);

  useEffect(() => {
    if (!data) return;
    const theme = data.settings.theme;
    const resolved = theme === "system"
      ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : theme;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
  }, [data?.settings.theme]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(timer);
  }, [toast]);

  const notify = (message: string, kind: ToastState["kind"] = "success") => setToast({ message, kind });

  const commit = (next: AppData, message?: string) => {
    try {
      saveAppData(next);
      setData(next);
      if (message) notify(message);
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "No se pudo guardar el cambio.", "error");
      return false;
    }
  };

  if (loadingError) return <FatalError message={loadingError} onReset={() => { clearQuinciData(); location.reload(); }} />;
  if (!data) return <div className="loading-screen"><div className="brand-mark"><WalletCards /></div><p>Cargando Quinci…</p></div>;
  if (!unlocked && data.security.pin) {
    return <LockScreen data={data} onUnlock={() => setUnlocked(true)} onReset={() => { clearQuinciData(); location.reload(); }} />;
  }

  const year = data.years[String(data.activeYear)];
  const categories = [...DEFAULT_CATEGORIES, ...data.customCategories];
  const currency = data.settings.currency;

  const changeYear = (nextYear: YearData, message?: string) => commit({
    ...data,
    years: { ...data.years, [nextYear.year]: nextYear },
  }, message);

  const finishWelcome = () => {
    const next = { ...data, settings: { ...data.settings, welcomeSeen: true } };
    if (commit(next)) setWelcomeOpen(false);
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-inner">
          <button className="brand" type="button" onClick={() => setView("overview")} aria-label="Ir al resumen">
            <span className="brand-mark"><WalletCards size={21} /></span>
            <span><strong>Quinci</strong><small>Mi libreta financiera</small></span>
          </button>
          <div className="header-actions">
            <label className="year-picker"><span className="sr-only">Año activo</span><select value={data.activeYear} onChange={(event) => commit({ ...data, activeYear: Number(event.target.value) })}>{Object.keys(data.years).sort((a, b) => Number(b) - Number(a)).map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <button className="icon-button" type="button" onClick={() => setSearchOpen(true)} aria-label="Buscar movimientos"><Search size={20} /></button>
            {data.security.pin && <button className="icon-button" type="button" onClick={() => setUnlocked(false)} aria-label="Bloquear Quinci"><Lock size={19} /></button>}
            <button className="icon-button desktop-hidden" type="button" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-label="Abrir navegación"><Menu size={21} /></button>
          </div>
        </div>
      </header>

      <div className="workspace">
        <nav className={`primary-nav ${menuOpen ? "nav-open" : ""}`} aria-label="Secciones principales">
          {navItems.map((item) => {
            const Icon = item.icon;
            return <button key={item.id} type="button" className={view === item.id ? "active" : ""} aria-current={view === item.id ? "page" : undefined} onClick={() => { setView(item.id); setMenuOpen(false); }}><Icon size={19} /><span>{item.label}</span></button>;
          })}
        </nav>

        <main className="main-content">
          {view === "overview" && <Overview data={data} year={year} categories={categories} monthIndex={monthIndex} periodKey={periodKey} onNavigate={setView} onBackup={() => {
            downloadBackup(data);
            commit({ ...data, settings: { ...data.settings, lastBackupAt: new Date().toISOString() } }, "Respaldo completo descargado.");
          }} />}
          {view === "period" && <PeriodView year={year} monthIndex={monthIndex} setMonthIndex={setMonthIndex} periodKey={periodKey} setPeriodKey={setPeriodKey} categories={categories} currency={currency} onChange={changeYear} notify={notify} />}
          {view === "savings" && <SavingsView year={year} currency={currency} onChange={changeYear} notify={notify} />}
          {view === "debts" && <DebtsView year={year} monthIndex={monthIndex} periodKey={periodKey} currency={currency} onChange={changeYear} notify={notify} />}
          {view === "settings" && <SettingsView data={data} year={year} categories={categories} commit={commit} notify={notify} onLock={() => setUnlocked(false)} />}
        </main>
      </div>

      <nav className="bottom-nav" aria-label="Navegación móvil">
        {navItems.map((item) => { const Icon = item.icon; return <button key={item.id} type="button" className={view === item.id ? "active" : ""} aria-current={view === item.id ? "page" : undefined} onClick={() => setView(item.id)}><Icon size={20} /><span>{item.label}</span></button>; })}
      </nav>

      {searchOpen && <SearchDialog data={data} categories={categories} currency={currency} onClose={() => setSearchOpen(false)} onOpenResult={(yearNumber, targetMonth, targetPeriod) => { commit({ ...data, activeYear: yearNumber }); setMonthIndex(targetMonth); setPeriodKey(targetPeriod); setView("period"); setSearchOpen(false); }} />}
      {welcomeOpen && <Dialog title="Tu dinero, más claro" onClose={finishWelcome}>
        <div className="welcome-list">
          <WelcomeItem icon={<CircleDollarSign />} title="Registra lo que entra" text="Salario e ingresos extra por quincena." />
          <WelcomeItem icon={<WalletCards />} title="Anota lo que sale" text="Gastos, pagos de deuda y ahorro se descuentan automáticamente." />
          <WelcomeItem icon={<Goal />} title="Dale propósito al ahorro" text="Asigna dinero a metas sin perder de vista cuánto sigue libre." />
          <WelcomeItem icon={<ShieldAlert />} title="Tus datos se quedan aquí" text="Todo vive en este dispositivo. Descarga respaldos completos con frecuencia." />
        </div>
        <button className="button primary full" type="button" onClick={finishWelcome}>Empezar</button>
      </Dialog>}
      {toast && <Toast message={toast.message} kind={toast.kind} />}
    </div>
  );
}

function WelcomeItem({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <div className="welcome-item"><span>{icon}</span><div><strong>{title}</strong><p>{text}</p></div></div>;
}

function FatalError({ message, onReset }: { message: string; onReset: () => void }) {
  const [confirming, setConfirming] = useState(false);
  return <main className="fatal-screen"><ShieldAlert size={38} /><h1>No pudimos abrir tus datos</h1><p>{message}</p><p>No se borró nada automáticamente. Si tienes un respaldo, consérvalo antes de restablecer.</p>{confirming ? <div className="danger-zone"><p>Esta acción elimina únicamente los datos locales de Quinci.</p><button className="button danger" type="button" onClick={onReset}>Eliminar datos y comenzar de nuevo</button><button className="button ghost" type="button" onClick={() => setConfirming(false)}>Cancelar</button></div> : <button className="button danger" type="button" onClick={() => setConfirming(true)}>Restablecer Quinci</button>}</main>;
}

function LockScreen({ data, onUnlock, onReset }: { data: AppData; onUnlock: () => void; onReset: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [blockedUntil, setBlockedUntil] = useState(0);
  const [forgot, setForgot] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const unlock = async (event: FormEvent) => {
    event.preventDefault();
    if (Date.now() < blockedUntil) { setError("Espera unos segundos antes de intentarlo otra vez."); return; }
    const valid = data.security.pin && await verifyPin(pin, data.security.pin);
    if (valid) { onUnlock(); return; }
    const nextAttempts = attempts + 1;
    setAttempts(nextAttempts);
    setPin("");
    if (nextAttempts >= 5) { setBlockedUntil(Date.now() + 30_000); setAttempts(0); setError("Demasiados intentos. Espera 30 segundos."); }
    else setError("PIN incorrecto.");
  };
  return <main className="lock-screen"><section className="lock-card"><span className="brand-mark large"><Lock /></span><h1>Quinci está bloqueado</h1><p>Este bloqueo protege contra miradas casuales; los datos permanecen almacenados en este dispositivo.</p><form onSubmit={unlock}><Field label="PIN"><input autoFocus type="password" inputMode="numeric" pattern="[0-9]*" maxLength={8} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))} autoComplete="current-password" /></Field>{error && <p className="form-error" role="alert">{error}</p>}<button className="button primary full" type="submit" disabled={pin.length < 4}>Desbloquear</button></form><button className="text-button" type="button" onClick={() => setForgot(true)}>No recuerdo mi PIN</button></section>{forgot && <Dialog title="PIN olvidado" onClose={() => setForgot(false)}><div className="notice danger-notice"><ShieldAlert /><p>Por privacidad, el PIN no puede eliminarse para revelar los datos existentes. Puedes restablecer la app y luego importar un respaldo.</p></div><Field label="Escribe BORRAR para confirmar"><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></Field><button className="button danger full" type="button" disabled={confirmation !== "BORRAR"} onClick={onReset}>Borrar datos locales</button></Dialog>}</main>;
}

function Overview({ data, year, categories, monthIndex, periodKey, onNavigate, onBackup }: {
  data: AppData; year: YearData; categories: Category[]; monthIndex: number; periodKey: PeriodKey;
  onNavigate: (view: View) => void; onBackup: () => void;
}) {
  const totals = yearTotals(year);
  const current = periodTotals(year.months[monthIndex][periodKey]);
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const spending = Object.entries(categoryTotals(year)).sort(([, a], [, b]) => b - a);
  const maxMonth = Math.max(1, ...totals.byMonth.flatMap((month) => [month.income, month.expenses]));
  const lastBackupDays = data.settings.lastBackupAt ? (Date.now() - new Date(data.settings.lastBackupAt).getTime()) / 86_400_000 : Infinity;
  const hasActivity = totals.income > 0 || totals.expenses > 0 || totals.savings > 0;
  return <div className="page-stack">
    <section className="hero-card">
      <div><p className="eyebrow">{MONTHS[monthIndex]} · {periodKey === "q1" ? "1 al 15" : "16 al cierre"}</p><h1>{money(current.available, data.settings.currency)}</h1><p>Disponible en la quincena seleccionada</p></div>
      <button className="button light" type="button" onClick={() => onNavigate("period")}>Abrir quincena <ChevronRight size={18} /></button>
    </section>
    {hasActivity && lastBackupDays > 7 && <section className="backup-banner"><div><Archive size={21} /><span><strong>Protege tu información</strong><small>{data.settings.lastBackupAt ? "Tu último respaldo tiene más de una semana." : "Todavía no tienes un respaldo completo."}</small></span></div><button className="button secondary" type="button" onClick={onBackup}><Download size={17} /> Respaldar</button></section>}
    <section className="stats-grid">
      <Stat label="Ingresos del año" value={money(totals.income, data.settings.currency)} tone="positive" />
      <Stat label="Gastos del año" value={money(totals.expenses, data.settings.currency)} tone="negative" />
      <Stat label="Ahorro real" value={money(totals.savings, data.settings.currency)} tone="accent" />
      <Stat label="Disponible anual" value={money(totals.available, data.settings.currency)} tone={totals.available < 0 ? "negative" : "neutral"} />
    </section>
    <div className="overview-grid">
      <section className="panel chart-panel"><div className="section-heading"><div><p className="eyebrow">Tendencia</p><h2>Panorama del año</h2></div><div className="legend"><span className="income-dot" />Ingresos<span className="expense-dot" />Gastos</div></div><div className="bar-chart" role="img" aria-label="Comparación mensual de ingresos y gastos">{totals.byMonth.map((month, index) => <div className="bar-group" key={MONTHS[index]} aria-label={`${MONTHS[index]}: ingresos ${money(month.income, data.settings.currency)}, gastos ${money(month.expenses, data.settings.currency)}`}><div className="bars"><span className="bar income" style={{ height: `${Math.max(2, month.income / maxMonth * 100)}%` }} /><span className="bar expense" style={{ height: `${Math.max(2, month.expenses / maxMonth * 100)}%` }} /></div><small>{MONTHS[index].slice(0, 3)}</small></div>)}</div></section>
      <section className="panel"><div className="section-heading"><div><p className="eyebrow">Distribución</p><h2>Gastos por categoría</h2></div></div>{spending.length ? <div className="category-list">{spending.slice(0, 7).map(([id, amount]) => { const category = categoryMap.get(id); const percent = totals.expenses ? amount / totals.expenses * 100 : 0; return <div className="category-row" key={id}><span className="category-swatch" style={{ background: category?.color }} /><div><strong>{category?.name ?? id}</strong><Progress value={percent} label={`${Math.round(percent)}% de los gastos`} /></div><span>{money(amount, data.settings.currency)}</span></div>; })}</div> : <EmptyState title="Aún no hay gastos" text="Cuando registres movimientos, verás aquí en qué se va tu dinero." />}</section>
    </div>
    <section className="quick-grid"><button type="button" onClick={() => onNavigate("period")}><BookOpen /><span><strong>Registrar movimiento</strong><small>Ingreso, gasto o ahorro</small></span><ChevronRight /></button><button type="button" onClick={() => onNavigate("savings")}><Goal /><span><strong>Administrar ahorro</strong><small>Metas y retiros coherentes</small></span><ChevronRight /></button><button type="button" onClick={() => onNavigate("debts")}><Landmark /><span><strong>Revisar deudas</strong><small>Pagos conectados al presupuesto</small></span><ChevronRight /></button></section>
  </div>;
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return <div className={`stat-card ${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}

function PeriodView({ year, monthIndex, setMonthIndex, periodKey, setPeriodKey, categories, currency, onChange, notify }: {
  year: YearData; monthIndex: number; setMonthIndex: (month: number) => void; periodKey: PeriodKey; setPeriodKey: (period: PeriodKey) => void;
  categories: Category[]; currency: string; onChange: (year: YearData, message?: string) => boolean; notify: (message: string, kind?: ToastState["kind"]) => void;
}) {
  const period = year.months[monthIndex][periodKey];
  const totals = periodTotals(period);
  const [incomeConcept, setIncomeConcept] = useState("");
  const [incomeAmount, setIncomeAmount] = useState(0);
  const [incomeDate, setIncomeDate] = useState(defaultDateForMonth(year.year, monthIndex, periodKey));
  const [incomeRecurring, setIncomeRecurring] = useState(false);
  const [expenseConcept, setExpenseConcept] = useState("");
  const [expenseTotal, setExpenseTotal] = useState(0);
  const [expenseDate, setExpenseDate] = useState(defaultDateForMonth(year.year, monthIndex, periodKey));
  const [expenseCategory, setExpenseCategory] = useState(categories[0].id);
  const [shared, setShared] = useState(false);
  const [sharedPercent, setSharedPercent] = useState(50);
  const [expenseRecurring, setExpenseRecurring] = useState(false);
  const [editing, setEditing] = useState<{ kind: "income"; item: Income } | { kind: "expense"; item: Expense } | null>(null);

  useEffect(() => {
    const date = defaultDateForMonth(year.year, monthIndex, periodKey);
    setIncomeDate(date);
    setExpenseDate(date);
  }, [year.year, monthIndex, periodKey]);

  const updatePeriod = (updater: (period: PeriodData) => PeriodData, message?: string) => {
    const months = year.months.map((month, index) => index === monthIndex
      ? { ...month, [periodKey]: updater(month[periodKey]) }
      : month);
    return onChange({ ...year, months }, message);
  };

  const addIncome = (event: FormEvent) => {
    event.preventDefault();
    if (incomeAmount <= 0) { notify("Indica un monto mayor que cero.", "error"); return; }
    const id = makeId();
    const concept = incomeConcept.trim() || "Ingreso extra";
    const item: Income = { id, concept, amount: incomeAmount, date: incomeDate };
    let recurring = year.recurring;
    if (incomeRecurring) {
      const template: RecurringTemplate = { id: makeId(), kind: "income", concept, amount: incomeAmount };
      recurring = [...recurring.filter((entry) => !(entry.kind === "income" && entry.concept.toLocaleLowerCase("es") === concept.toLocaleLowerCase("es"))), template];
      item.recurringId = template.id;
    }
    const months = year.months.map((month, index) => index === monthIndex ? { ...month, [periodKey]: { ...month[periodKey], extras: [...month[periodKey].extras, item] } } : month);
    if (onChange({ ...year, months, recurring }, "Ingreso agregado.")) { setIncomeConcept(""); setIncomeAmount(0); setIncomeRecurring(false); }
  };

  const addExpense = (event: FormEvent) => {
    event.preventDefault();
    if (expenseTotal <= 0) { notify("Indica un monto mayor que cero.", "error"); return; }
    if (shared && (sharedPercent <= 0 || sharedPercent > 100)) { notify("El porcentaje debe estar entre 1 y 100.", "error"); return; }
    const concept = expenseConcept.trim() || categories.find((category) => category.id === expenseCategory)?.name || "Gasto";
    const amount = shared ? expenseTotal * sharedPercent / 100 : expenseTotal;
    const templateId = expenseRecurring ? makeId() : undefined;
    const item: Expense = {
      id: makeId(), concept, amount, categoryId: expenseCategory, date: expenseDate,
      shared: shared ? { total: expenseTotal, percent: sharedPercent } : undefined,
      recurringId: templateId,
    };
    const recurring = templateId ? [
      ...year.recurring.filter((entry) => !(entry.kind === "expense" && entry.concept.toLocaleLowerCase("es") === concept.toLocaleLowerCase("es") && entry.categoryId === expenseCategory)),
      { id: templateId, kind: "expense" as const, concept, amount, categoryId: expenseCategory, shared: item.shared },
    ] : year.recurring;
    const months = year.months.map((month, index) => index === monthIndex ? { ...month, [periodKey]: { ...month[periodKey], expenses: [...month[periodKey].expenses, item] } } : month);
    if (onChange({ ...year, months, recurring }, "Gasto agregado.")) { setExpenseConcept(""); setExpenseTotal(0); setShared(false); setSharedPercent(50); setExpenseRecurring(false); }
  };

  const useTemplate = (template: RecurringTemplate) => {
    if (template.kind === "income") {
      const item: Income = { id: makeId(), concept: template.concept, amount: template.amount, date: incomeDate, recurringId: template.id };
      updatePeriod((current) => ({ ...current, extras: [...current.extras, item] }), "Ingreso fijo agregado.");
    } else {
      const item: Expense = { id: makeId(), concept: template.concept, amount: template.amount, categoryId: template.categoryId || "other", date: expenseDate, shared: template.shared, recurringId: template.id };
      updatePeriod((current) => ({ ...current, expenses: [...current.expenses, item] }), "Gasto fijo agregado.");
    }
  };

  const deleteIncome = (id: string) => updatePeriod((current) => ({ ...current, extras: current.extras.filter((item) => item.id !== id) }), "Ingreso eliminado.");
  const deleteExpense = (id: string) => onChange(removeExpense(year, monthIndex, periodKey, id), "Gasto eliminado.");
  const selectedCategoryExpense = period.expenses.filter((expense) => expense.categoryId === expenseCategory).reduce((sum, item) => sum + item.amount, 0);
  const selectedBudget = year.budgets[expenseCategory] || 0;
  const usedPercent = selectedBudget ? (selectedCategoryExpense + (shared ? expenseTotal * sharedPercent / 100 : expenseTotal)) / selectedBudget * 100 : 0;
  const existingTemplateIds = new Set([...period.extras, ...period.expenses].map((item) => item.recurringId).filter(Boolean));
  const suggestions = year.recurring.filter((template) => !existingTemplateIds.has(template.id));

  return <div className="page-stack">
    <div className="page-title"><div><p className="eyebrow">Movimientos</p><h1>Tu quincena</h1><p>Todo lo que registres se guarda automáticamente en este dispositivo.</p></div></div>
    <section className="period-toolbar panel">
      <Field label="Mes"><select value={monthIndex} onChange={(event) => setMonthIndex(Number(event.target.value))}>{MONTHS.map((month, index) => <option key={month} value={index}>{month}</option>)}</select></Field>
      <div className="segment" role="group" aria-label="Quincena"><button type="button" className={periodKey === "q1" ? "active" : ""} aria-pressed={periodKey === "q1"} onClick={() => setPeriodKey("q1")}>1 al 15</button><button type="button" className={periodKey === "q2" ? "active" : ""} aria-pressed={periodKey === "q2"} onClick={() => setPeriodKey("q2")}>16 al cierre</button></div>
    </section>
    <section className="period-summary">
      <div><span>Ingresos</span><strong>{money(totals.income, currency)}</strong></div><div><span>Gastos</span><strong>{money(totals.expenses, currency)}</strong></div><div><span>Ahorro</span><strong>{money(totals.savings, currency)}</strong></div><div className={totals.available < 0 ? "negative" : "positive"}><span>Disponible</span><strong>{money(totals.available, currency)}</strong></div>
    </section>
    {totals.available < 0 && <div className="notice danger-notice"><ShieldAlert /><p>Esta quincena tiene un déficit de {money(Math.abs(totals.available), currency)}. Revisa los movimientos o ajusta el ahorro.</p></div>}
    {suggestions.length > 0 && <section className="panel"><div className="section-heading"><div><p className="eyebrow">Atajos</p><h2>Movimientos fijos pendientes</h2></div></div><div className="suggestion-list">{suggestions.map((template) => <button type="button" key={template.id} onClick={() => useTemplate(template)}><Plus size={16} /><span>{template.concept}</span><strong>{money(template.shared?.total ? template.amount : template.amount, currency)}</strong></button>)}</div></section>}
    <div className="entry-grid">
      <section className="panel form-panel"><div className="section-heading"><div><p className="eyebrow positive-text">Entradas</p><h2>Ingresos</h2></div></div><MoneyInput label="Salario de esta quincena" value={period.salary} currency={currency} onChange={(value) => updatePeriod((current) => ({ ...current, salary: value }))} /><MovementList kind="income" items={period.extras} currency={currency} onEdit={(item) => setEditing({ kind: "income", item })} onDelete={(item) => deleteIncome(item.id)} /><form className="entry-form" onSubmit={addIncome}><h3>Agregar ingreso extra</h3><Field label="Concepto"><input value={incomeConcept} onChange={(event) => setIncomeConcept(event.target.value)} placeholder="Ej. Venta o comisión" /></Field><div className="form-row"><MoneyInput label="Monto" value={incomeAmount} currency={currency} onChange={setIncomeAmount} /><Field label="Fecha"><input type="date" value={incomeDate} onChange={(event) => setIncomeDate(event.target.value)} /></Field></div><label className="check-row"><input type="checkbox" checked={incomeRecurring} onChange={(event) => setIncomeRecurring(event.target.checked)} /><span>Recordar como ingreso fijo</span></label><button className="button primary full" type="submit" disabled={incomeAmount <= 0}><Plus size={17} /> Agregar ingreso</button></form></section>
      <section className="panel form-panel"><div className="section-heading"><div><p className="eyebrow negative-text">Salidas</p><h2>Gastos</h2></div></div><MovementList kind="expense" items={period.expenses} categories={categories} currency={currency} onEdit={(item) => item.debtPaymentId ? notify("Los pagos vinculados se administran desde Deudas.", "info") : setEditing({ kind: "expense", item })} onDelete={(item) => deleteExpense(item.id)} /><form className="entry-form" onSubmit={addExpense}><h3>Agregar gasto</h3><Field label="Categoría"><select value={expenseCategory} onChange={(event) => setExpenseCategory(event.target.value)}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field><Field label="Concepto"><input value={expenseConcept} onChange={(event) => setExpenseConcept(event.target.value)} placeholder="Ej. Supermercado" /></Field><div className="form-row"><MoneyInput label={shared ? "Total de la cuenta" : "Monto"} value={expenseTotal} currency={currency} onChange={setExpenseTotal} /><Field label="Fecha"><input type="date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} /></Field></div><label className="check-row"><input type="checkbox" checked={shared} onChange={(event) => setShared(event.target.checked)} /><span>Es un gasto compartido</span></label>{shared && <div className="shared-box"><MoneyInput label="Tu porcentaje" value={sharedPercent} currency="%" min={1} max={100} onChange={setSharedPercent} /><div><span>Tu parte</span><strong>{money(expenseTotal * sharedPercent / 100, currency)}</strong></div></div>}{selectedBudget > 0 && <div className={`budget-meter ${usedPercent > 100 ? "over" : ""}`}><div><span>Límite de {categories.find((item) => item.id === expenseCategory)?.name}</span><strong>{Math.round(usedPercent)}%</strong></div><Progress value={usedPercent} label={`${Math.round(usedPercent)}% del límite usado`} /><small>{money(selectedCategoryExpense, currency)} registrados de {money(selectedBudget, currency)}</small></div>}<label className="check-row"><input type="checkbox" checked={expenseRecurring} onChange={(event) => setExpenseRecurring(event.target.checked)} /><span>Recordar como gasto fijo</span></label><button className="button primary full" type="submit" disabled={expenseTotal <= 0}><Plus size={17} /> Agregar gasto</button></form><div className="savings-entry"><MoneyInput label="Apartar para ahorro" value={period.savings} currency={currency} onChange={(value) => updatePeriod((current) => ({ ...current, savings: value }))} /><small>Este monto se resta del disponible y se suma a tu ahorro real.</small></div></section>
    </div>
    {editing && <MovementEditor editing={editing} categories={categories} currency={currency} onClose={() => setEditing(null)} onSave={(updated) => {
      if (editing.kind === "income") updatePeriod((current) => ({ ...current, extras: current.extras.map((item) => item.id === updated.id ? updated as Income : item) }), "Ingreso actualizado.");
      else updatePeriod((current) => ({ ...current, expenses: current.expenses.map((item) => item.id === updated.id ? updated as Expense : item) }), "Gasto actualizado.");
      setEditing(null);
    }} />}
  </div>;
}

function MovementList<T extends Income | Expense>({ kind, items, categories = [], currency, onEdit, onDelete }: {
  kind: "income" | "expense"; items: T[]; categories?: Category[]; currency: string; onEdit: (item: T) => void; onDelete: (item: T) => void;
}) {
  if (!items.length) return <div className="mini-empty">Todavía no hay {kind === "income" ? "ingresos extra" : "gastos"} en esta quincena.</div>;
  return <ul className="movement-list">{items.map((item) => { const expense = kind === "expense" ? item as Expense : undefined; const category = categories.find((entry) => entry.id === expense?.categoryId); return <li key={item.id}><button className="movement-main" type="button" onClick={() => onEdit(item)}><span className="movement-dot" style={{ background: kind === "income" ? "var(--positive)" : category?.color }} /><span><strong>{item.concept}</strong><small>{item.date}{expense?.shared ? ` · ${expense.shared.percent}% de ${money(expense.shared.total, currency)}` : ""}{expense?.debtPaymentId ? " · Pago vinculado" : ""}</small></span><b>{kind === "income" ? "+" : "−"}{money(item.amount, currency)}</b></button><button className="icon-button danger-icon" type="button" onClick={() => onDelete(item)} aria-label={`Eliminar ${item.concept}`}><Trash2 size={18} /></button></li>; })}</ul>;
}

function MovementEditor({ editing, categories, currency, onClose, onSave }: {
  editing: { kind: "income"; item: Income } | { kind: "expense"; item: Expense };
  categories: Category[]; currency: string; onClose: () => void; onSave: (item: Income | Expense) => void;
}) {
  const isExpense = editing.kind === "expense";
  const originalExpense = isExpense ? editing.item as Expense : undefined;
  const [concept, setConcept] = useState(editing.item.concept);
  const [date, setDate] = useState(editing.item.date);
  const [categoryId, setCategoryId] = useState(originalExpense?.categoryId || categories[0].id);
  const [shared, setShared] = useState(Boolean(originalExpense?.shared));
  const [total, setTotal] = useState(originalExpense?.shared?.total ?? editing.item.amount);
  const [percent, setPercent] = useState(originalExpense?.shared?.percent ?? 50);
  const save = () => {
    if (!concept.trim() || total <= 0) return;
    if (isExpense) {
      onSave({ ...editing.item, concept: concept.trim(), date, categoryId, amount: shared ? total * percent / 100 : total, shared: shared ? { total, percent } : undefined } as Expense);
    } else onSave({ ...editing.item, concept: concept.trim(), date, amount: total } as Income);
  };
  return <Dialog title={`Editar ${isExpense ? "gasto" : "ingreso"}`} onClose={onClose}><div className="dialog-form">{isExpense && <Field label="Categoría"><select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field>}<Field label="Concepto"><input autoFocus value={concept} onChange={(event) => setConcept(event.target.value)} /></Field><Field label="Fecha"><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field>{isExpense && <label className="check-row"><input type="checkbox" checked={shared} onChange={(event) => setShared(event.target.checked)} /><span>Es un gasto compartido</span></label>}<MoneyInput label={shared ? "Total de la cuenta" : "Monto"} value={total} currency={currency} onChange={setTotal} />{shared && <><MoneyInput label="Tu porcentaje" value={percent} currency="%" min={1} max={100} onChange={setPercent} /><p className="calculated-line">Tu parte: <strong>{money(total * percent / 100, currency)}</strong></p></>}<div className="dialog-actions"><button className="button ghost" type="button" onClick={onClose}>Cancelar</button><button className="button primary" type="button" onClick={save}>Guardar cambios</button></div></div></Dialog>;
}

function SavingsView({ year, currency, onChange, notify }: {
  year: YearData; currency: string; onChange: (year: YearData, message?: string) => boolean; notify: (message: string, kind?: ToastState["kind"]) => void;
}) {
  const totals = yearTotals(year);
  const [goalName, setGoalName] = useState("");
  const [goalTarget, setGoalTarget] = useState(0);
  const [goalAmounts, setGoalAmounts] = useState<Record<string, number>>({});
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawConcept, setWithdrawConcept] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState(0);
  const [withdrawSource, setWithdrawSource] = useState("unallocated");
  const [withdrawDate, setWithdrawDate] = useState(todayIso());

  const createGoal = (event: FormEvent) => {
    event.preventDefault();
    if (!goalName.trim() || goalTarget <= 0) { notify("Completa el nombre y el objetivo de la meta.", "error"); return; }
    const goal = { id: makeId(), name: goalName.trim(), target: goalTarget, allocated: 0 };
    if (onChange({ ...year, goals: [...year.goals, goal] }, "Meta creada.")) { setGoalName(""); setGoalTarget(0); }
  };

  const changeAllocation = (goalId: string, direction: 1 | -1) => {
    try {
      const amount = finiteNonNegative(goalAmounts[goalId]);
      if (amount <= 0) throw new Error("Indica un monto mayor que cero.");
      const next = allocateToGoal(year, goalId, amount * direction);
      if (onChange(next, direction > 0 ? "Ahorro asignado." : "Ahorro liberado.")) setGoalAmounts((values) => ({ ...values, [goalId]: 0 }));
    } catch (error) { notify(error instanceof Error ? error.message : "No se pudo actualizar la meta.", "error"); }
  };

  const withdraw = (event: FormEvent) => {
    event.preventDefault();
    try {
      const next = withdrawSavings(year, withdrawConcept, withdrawAmount, withdrawDate, withdrawSource === "unallocated" ? undefined : withdrawSource);
      if (onChange(next, "Retiro registrado.")) { setWithdrawOpen(false); setWithdrawConcept(""); setWithdrawAmount(0); setWithdrawSource("unallocated"); }
    } catch (error) { notify(error instanceof Error ? error.message : "No se pudo registrar el retiro.", "error"); }
  };

  const sourceMax = withdrawSource === "unallocated" ? totals.unallocatedSavings : year.goals.find((goal) => goal.id === withdrawSource)?.allocated ?? 0;
  return <div className="page-stack">
    <div className="page-title"><div><p className="eyebrow">Ahorro</p><h1>Haz visible tu progreso</h1><p>El dinero asignado a metas siempre coincide con el ahorro real.</p></div><button className="button secondary" type="button" onClick={() => setWithdrawOpen(true)} disabled={totals.savings <= 0}><ArrowDownToLine size={18} /> Retirar</button></div>
    <section className="savings-hero"><div><span>Ahorro real</span><strong>{money(totals.savings, currency)}</strong><small>Aportes menos retiros</small></div><div><span>Asignado a metas</span><strong>{money(totals.goalAllocations, currency)}</strong><small>Dinero con propósito</small></div><div><span>Sin asignar</span><strong>{money(totals.unallocatedSavings, currency)}</strong><small>Disponible para nuevas metas</small></div></section>
    <div className="two-column">
      <section className="panel"><div className="section-heading"><div><p className="eyebrow">Objetivos</p><h2>Metas de ahorro</h2></div></div>{year.goals.length ? <div className="goal-list">{year.goals.map((goal) => { const percentage = goal.target > 0 ? goal.allocated / goal.target * 100 : 0; return <article className="goal-card" key={goal.id}><div className="goal-title"><div><strong>{goal.name}</strong><small>{money(goal.allocated, currency)} de {money(goal.target, currency)}</small></div><button className="icon-button danger-icon" type="button" aria-label={`Eliminar meta ${goal.name}`} onClick={() => { if (goal.allocated > 0) notify("Libera primero el dinero asignado a esta meta.", "error"); else onChange({ ...year, goals: year.goals.filter((item) => item.id !== goal.id) }, "Meta eliminada."); }}><Trash2 size={17} /></button></div><Progress value={percentage} label={`${Math.round(percentage)}% completado`} /><div className="goal-actions"><MoneyInput label={`Monto para ${goal.name}`} value={goalAmounts[goal.id] || 0} currency={currency} onChange={(value) => setGoalAmounts((amounts) => ({ ...amounts, [goal.id]: value }))} /><div><button className="button primary" type="button" onClick={() => changeAllocation(goal.id, 1)}>Asignar</button><button className="button ghost" type="button" onClick={() => changeAllocation(goal.id, -1)}>Liberar</button></div></div></article>; })}</div> : <EmptyState title="Crea tu primera meta" text="Puedes separar visualmente tu ahorro sin moverlo a otra cuenta." />}</section>
      <section className="panel"><div className="section-heading"><div><p className="eyebrow">Nueva meta</p><h2>¿Para qué estás ahorrando?</h2></div></div><form className="dialog-form" onSubmit={createGoal}><Field label="Nombre"><input value={goalName} onChange={(event) => setGoalName(event.target.value)} placeholder="Ej. Fondo de emergencia" /></Field><MoneyInput label="Objetivo" value={goalTarget} currency={currency} onChange={setGoalTarget} /><button className="button primary full" type="submit"><Plus size={17} /> Crear meta</button></form>{year.withdrawals.length > 0 && <div className="history-block"><h3>Retiros recientes</h3><ul>{[...year.withdrawals].reverse().slice(0, 6).map((item) => <li key={item.id}><span><strong>{item.concept}</strong><small>{item.date}{item.goalId ? ` · ${year.goals.find((goal) => goal.id === item.goalId)?.name ?? "Meta"}` : " · Ahorro libre"}</small></span><b>−{money(item.amount, currency)}</b></li>)}</ul></div>}</section>
    </div>
    {withdrawOpen && <Dialog title="Retirar ahorro" onClose={() => setWithdrawOpen(false)}><form className="dialog-form" onSubmit={withdraw}><div className="notice info-notice"><CircleDollarSign /><p>Elige de dónde sale el retiro. Así ninguna meta quedará financiada con dinero inexistente.</p></div><Field label="Origen"><select value={withdrawSource} onChange={(event) => { setWithdrawSource(event.target.value); setWithdrawAmount(0); }}><option value="unallocated">Ahorro sin asignar · {money(totals.unallocatedSavings, currency)}</option>{year.goals.filter((goal) => goal.allocated > 0).map((goal) => <option key={goal.id} value={goal.id}>{goal.name} · {money(goal.allocated, currency)}</option>)}</select></Field><Field label="Motivo"><input autoFocus value={withdrawConcept} onChange={(event) => setWithdrawConcept(event.target.value)} placeholder="Ej. Reparación del auto" /></Field><MoneyInput label="Monto" value={withdrawAmount} currency={currency} max={sourceMax} onChange={setWithdrawAmount} /><Field label="Fecha"><input type="date" value={withdrawDate} onChange={(event) => setWithdrawDate(event.target.value)} /></Field><small>Máximo disponible desde este origen: {money(sourceMax, currency)}</small><button className="button primary full" type="submit" disabled={!withdrawConcept.trim() || withdrawAmount <= 0 || withdrawAmount > sourceMax}>Confirmar retiro</button></form></Dialog>}
  </div>;
}

function DebtsView({ year, monthIndex, periodKey, currency, onChange, notify }: {
  year: YearData; monthIndex: number; periodKey: PeriodKey; currency: string; onChange: (year: YearData, message?: string) => boolean; notify: (message: string, kind?: ToastState["kind"]) => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState("Tarjeta de crédito");
  const [balance, setBalance] = useState(0);
  const [minimum, setMinimum] = useState(0);
  const [paymentDebtId, setPaymentDebtId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const totalDebt = year.debts.reduce((sum, debt) => sum + debt.balance, 0);
  const createDebt = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || balance <= 0) { notify("Completa el nombre y un saldo mayor que cero.", "error"); return; }
    const debt = { id: makeId(), name: name.trim(), type, balance, minimumPayment: minimum, payments: [] };
    if (onChange({ ...year, debts: [...year.debts, debt] }, "Deuda agregada.")) { setName(""); setBalance(0); setMinimum(0); }
  };
  const pay = (event: FormEvent) => {
    event.preventDefault();
    if (!paymentDebtId) return;
    try {
      const next = addDebtPayment(year, paymentDebtId, paymentAmount, paymentDate, monthIndex, periodKey);
      if (onChange(next, `Pago agregado como gasto en ${MONTHS[monthIndex]}, ${periodKey === "q1" ? "Q1" : "Q2"}.`)) { setPaymentDebtId(null); setPaymentAmount(0); }
    } catch (error) { notify(error instanceof Error ? error.message : "No se pudo registrar el pago.", "error"); }
  };
  const selectedDebt = year.debts.find((debt) => debt.id === paymentDebtId);
  return <div className="page-stack"><div className="page-title"><div><p className="eyebrow">Deudas</p><h1>Reduce lo pendiente sin perder el flujo de caja</h1><p>Cada pago se registra también como gasto en la quincena seleccionada.</p></div></div><section className="debt-total"><span>Deuda total pendiente</span><strong>{money(totalDebt, currency)}</strong><small>{year.debts.filter((debt) => debt.balance > 0).length} compromisos activos</small></section><div className="two-column"><section className="panel"><div className="section-heading"><div><p className="eyebrow">Seguimiento</p><h2>Tus deudas</h2></div></div>{year.debts.length ? <div className="debt-list">{year.debts.map((debt) => { const paid = debt.payments.reduce((sum, payment) => sum + payment.amount, 0); return <article className="debt-card" key={debt.id}><div className="debt-heading"><span><strong>{debt.name}</strong><small>{debt.type}</small></span><b>{money(debt.balance, currency)}</b></div>{debt.minimumPayment > 0 && <p>Pago mínimo sugerido: {money(debt.minimumPayment, currency)}</p>}<div className="debt-actions"><button className="button primary" type="button" disabled={debt.balance <= 0} onClick={() => { setPaymentDebtId(debt.id); setPaymentAmount(Math.min(debt.minimumPayment || debt.balance, debt.balance)); }}>Registrar pago</button><button className="icon-button danger-icon" type="button" aria-label={`Eliminar deuda ${debt.name}`} onClick={() => { if (debt.balance > 0) notify("Solo puedes eliminar una deuda con saldo cero.", "error"); else onChange({ ...year, debts: year.debts.filter((item) => item.id !== debt.id) }, "Deuda eliminada."); }}><Trash2 size={17} /></button></div>{debt.payments.length > 0 && <details><summary>{debt.payments.length} pagos · {money(paid, currency)}</summary><ul className="payment-history">{[...debt.payments].reverse().map((payment) => <li key={payment.id}><span>{payment.date} · {MONTHS[payment.monthIndex]} {payment.period.toUpperCase()}</span><strong>{money(payment.amount, currency)}</strong></li>)}</ul></details>}</article>; })}</div> : <EmptyState title="No tienes deudas registradas" text="Añade una tarjeta o préstamo para coordinar sus pagos con tu presupuesto." />}</section><section className="panel"><div className="section-heading"><div><p className="eyebrow">Nuevo compromiso</p><h2>Agregar deuda</h2></div></div><form className="dialog-form" onSubmit={createDebt}><Field label="Nombre"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Tarjeta principal" /></Field><Field label="Tipo"><select value={type} onChange={(event) => setType(event.target.value)}><option>Tarjeta de crédito</option><option>Préstamo personal</option><option>Préstamo estudiantil</option><option>Préstamo de auto</option><option>Otro</option></select></Field><MoneyInput label="Saldo actual" value={balance} currency={currency} onChange={setBalance} /><MoneyInput label="Pago mínimo opcional" value={minimum} currency={currency} onChange={setMinimum} /><button className="button primary full" type="submit"><Plus size={17} /> Agregar deuda</button></form></section></div>{selectedDebt && <Dialog title={`Pagar ${selectedDebt.name}`} onClose={() => setPaymentDebtId(null)}><form className="dialog-form" onSubmit={pay}><div className="notice info-notice"><CircleDollarSign /><p>Este pago reducirá la deuda y creará un gasto en <strong>{MONTHS[monthIndex]} · {periodKey.toUpperCase()}</strong>.</p></div><MoneyInput label="Monto del pago" value={paymentAmount} currency={currency} max={selectedDebt.balance} onChange={setPaymentAmount} /><Field label="Fecha"><input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} /></Field><small>Saldo pendiente: {money(selectedDebt.balance, currency)}</small><button className="button primary full" type="submit" disabled={paymentAmount <= 0 || paymentAmount > selectedDebt.balance}>Registrar pago y gasto</button></form></Dialog>}</div>;
}

function SettingsView({ data, year, categories, commit, notify, onLock }: {
  data: AppData; year: YearData; categories: Category[]; commit: (data: AppData, message?: string) => boolean;
  notify: (message: string, kind?: ToastState["kind"]) => void; onLock: () => void;
}) {
  const [customCurrency, setCustomCurrency] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [categoryColor, setCategoryColor] = useState("#2457d6");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [carrySavings, setCarrySavings] = useState(true);
  const [pendingImport, setPendingImport] = useState<AppData | null>(null);
  const [deleteYear, setDeleteYear] = useState<number | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState("");

  const updateSettings = (patch: Partial<AppData["settings"]>, message?: string) => commit({ ...data, settings: { ...data.settings, ...patch } }, message);
  const updateYear = (nextYear: YearData, message?: string) => commit({ ...data, years: { ...data.years, [nextYear.year]: nextYear } }, message);
  const setBudget = (categoryId: string, amount: number) => {
    const budgets = { ...year.budgets };
    if (amount > 0) budgets[categoryId] = amount;
    else delete budgets[categoryId];
    updateYear({ ...year, budgets });
  };

  const fullBackup = () => {
    const next = { ...data, settings: { ...data.settings, lastBackupAt: new Date().toISOString() } };
    downloadBackup(next);
    commit(next, "Respaldo completo descargado.");
  };

  const importFile = async (file: File) => {
    try { setPendingImport(parseBackup(await file.text())); }
    catch (error) { notify(error instanceof Error ? error.message : "No se pudo leer el respaldo.", "error"); }
  };

  const addCategory = (event: FormEvent) => {
    event.preventDefault();
    const name = newCategory.trim();
    if (!name) return;
    if (categories.some((category) => category.name.toLocaleLowerCase("es") === name.toLocaleLowerCase("es"))) { notify("Ya existe una categoría con ese nombre.", "error"); return; }
    const category: Category = { id: `custom-${makeId()}`, name, color: categoryColor, custom: true };
    if (commit({ ...data, customCategories: [...data.customCategories, category] }, "Categoría creada.")) setNewCategory("");
  };

  const categoryInUse = (categoryId: string) => Object.values(data.years).some((candidateYear) => candidateYear.months.some((month) => ([month.q1, month.q2] as PeriodData[]).some((period) => period.expenses.some((expense) => expense.categoryId === categoryId))) || candidateYear.recurring.some((item) => item.categoryId === categoryId));

  const removeCategory = (category: Category) => {
    if (categoryInUse(category.id)) { notify("Esta categoría tiene movimientos o plantillas asociadas y no puede eliminarse.", "error"); return; }
    const years = Object.fromEntries(Object.entries(data.years).map(([key, candidateYear]) => {
      const budgets = { ...candidateYear.budgets }; delete budgets[category.id];
      return [key, { ...candidateYear, budgets }];
    }));
    commit({ ...data, customCategories: data.customCategories.filter((item) => item.id !== category.id), years }, "Categoría eliminada.");
  };

  const createPin = async (event: FormEvent) => {
    event.preventDefault();
    if (newPin !== confirmPin) { notify("Los PIN no coinciden.", "error"); return; }
    try {
      const pin = await createPinRecord(newPin);
      if (commit({ ...data, security: { pin } }, "Bloqueo de privacidad activado.")) { setNewPin(""); setConfirmPin(""); onLock(); }
    } catch (error) { notify(error instanceof Error ? error.message : "No se pudo crear el PIN.", "error"); }
  };

  const removePin = async (event: FormEvent) => {
    event.preventDefault();
    if (!data.security.pin || !(await verifyPin(currentPin, data.security.pin))) { notify("El PIN actual no es correcto.", "error"); return; }
    if (commit({ ...data, security: {} }, "Bloqueo de privacidad eliminado.")) setCurrentPin("");
  };

  const changeTheme = (theme: Theme) => updateSettings({ theme });
  const nextYear = () => commit(startNextYear(data, carrySavings), `Año ${data.activeYear + 1} creado. El año anterior permanece en el historial.`);
  const removeYear = () => {
    if (deleteYear === null || deleteConfirmation !== String(deleteYear) || deleteYear === data.activeYear) return;
    const years = { ...data.years }; delete years[String(deleteYear)];
    if (commit({ ...data, years }, `Año ${deleteYear} eliminado.`)) { setDeleteYear(null); setDeleteConfirmation(""); }
  };

  return <div className="page-stack"><div className="page-title"><div><p className="eyebrow">Preferencias</p><h1>Ajustes y respaldo</h1><p>Administra los datos locales, la apariencia y el historial de Quinci.</p></div></div><div className="settings-grid">
    <section className="panel settings-card"><div className="settings-title"><span><Sun /></span><div><h2>Apariencia y moneda</h2><p>Ajustes de visualización para este dispositivo.</p></div></div><Field label="Tema"><select value={data.settings.theme} onChange={(event) => changeTheme(event.target.value as Theme)}><option value="system">Usar tema del dispositivo</option><option value="light">Claro</option><option value="dark">Oscuro</option></select></Field><Field label="Símbolo de moneda"><select value={CURRENCIES.includes(data.settings.currency) ? data.settings.currency : "custom"} onChange={(event) => event.target.value !== "custom" && updateSettings({ currency: event.target.value })}>{CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}<option value="custom">Personalizado…</option></select></Field><div className="inline-form"><label><span>Personalizado</span><input maxLength={5} value={customCurrency} onChange={(event) => setCustomCurrency(event.target.value)} placeholder="Ej. CHF" /></label><button className="button secondary" type="button" disabled={!customCurrency.trim()} onClick={() => { updateSettings({ currency: customCurrency.trim() }, "Moneda actualizada."); setCustomCurrency(""); }}>Usar</button></div></section>
    <section className="panel settings-card"><div className="settings-title"><span><Archive /></span><div><h2>Respaldo y reportes</h2><p>El respaldo JSON restaura todo; el CSV es solo un reporte.</p></div></div><button className="button primary full" type="button" onClick={fullBackup}><Download size={18} /> Descargar respaldo completo</button><button className="button secondary full" type="button" onClick={() => downloadYearCsv(year)}><FileSpreadsheet size={18} /> Exportar reporte CSV de {year.year}</button><label className="button ghost full file-button"><Upload size={18} /> Importar respaldo completo<input type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); event.target.value = ""; }} /></label>{data.settings.lastBackupAt && <small>Último respaldo completo: {new Date(data.settings.lastBackupAt).toLocaleString("es-PA")}</small>}</section>
    <section className="panel settings-card span-two"><div className="settings-title"><span><BarChart3 /></span><div><h2>Límites por categoría</h2><p>Topes por quincena. Las alertas aparecen al registrar gastos.</p></div></div><div className="budget-grid">{categories.map((category) => <MoneyInput key={category.id} label={category.name} value={year.budgets[category.id] || 0} currency={data.settings.currency} onChange={(amount) => setBudget(category.id, amount)} />)}</div></section>
    <section className="panel settings-card"><div className="settings-title"><span><Plus /></span><div><h2>Categorías propias</h2><p>Las categorías usadas no se eliminan para proteger tus datos.</p></div></div><form className="inline-form category-form" onSubmit={addCategory}><label><span>Nombre</span><input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="Ej. Mascotas" /></label><label><span>Color</span><input type="color" value={categoryColor} onChange={(event) => setCategoryColor(event.target.value)} /></label><button className="button primary" type="submit"><Plus size={17} /> Crear</button></form>{data.customCategories.length > 0 && <ul className="simple-list">{data.customCategories.map((category) => <li key={category.id}><span><i style={{ background: category.color }} />{category.name}</span><button className="icon-button danger-icon" type="button" onClick={() => removeCategory(category)} aria-label={`Eliminar categoría ${category.name}`}><Trash2 size={17} /></button></li>)}</ul>}</section>
    <section className="panel settings-card"><div className="settings-title"><span><CircleDollarSign /></span><div><h2>Movimientos fijos</h2><p>Atajos sugeridos en cada nueva quincena.</p></div></div>{year.recurring.length ? <ul className="simple-list">{year.recurring.map((item) => <li key={item.id}><span>{item.concept}<small>{item.kind === "income" ? "Ingreso" : "Gasto"} · {money(item.amount, data.settings.currency)}</small></span><button className="icon-button danger-icon" type="button" onClick={() => updateYear({ ...year, recurring: year.recurring.filter((entry) => entry.id !== item.id) }, "Plantilla eliminada.")} aria-label={`Dejar de sugerir ${item.concept}`}><X size={17} /></button></li>)}</ul> : <EmptyState title="Sin movimientos fijos" text="Márcalos al agregar un ingreso o gasto." />}</section>
    <section className="panel settings-card"><div className="settings-title"><span><Lock /></span><div><h2>Bloqueo de privacidad</h2><p>Evita miradas casuales; no sustituye el cifrado del dispositivo.</p></div></div>{data.security.pin ? <form className="dialog-form" onSubmit={removePin}><Field label="PIN actual"><input type="password" inputMode="numeric" value={currentPin} onChange={(event) => setCurrentPin(event.target.value.replace(/\D/g, ""))} /></Field><button className="button secondary full" type="submit">Quitar bloqueo</button></form> : <form className="dialog-form" onSubmit={createPin}><div className="notice info-notice"><ShieldAlert /><p>El PIN se deriva de forma segura y nunca se guarda como texto. Si lo olvidas, tendrás que restablecer los datos locales e importar un respaldo.</p></div><Field label="Nuevo PIN de 6 a 8 dígitos"><input type="password" inputMode="numeric" minLength={6} maxLength={8} value={newPin} onChange={(event) => setNewPin(event.target.value.replace(/\D/g, ""))} /></Field><Field label="Confirmar PIN"><input type="password" inputMode="numeric" minLength={6} maxLength={8} value={confirmPin} onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, ""))} /></Field><button className="button primary full" type="submit" disabled={newPin.length < 6 || confirmPin.length < 6}>Activar bloqueo</button></form>}</section>
    <section className="panel settings-card span-two"><div className="settings-title"><span><Archive /></span><div><h2>Años e historial</h2><p>Cada año permanece completo y puedes volver a consultarlo.</p></div></div><div className="year-list">{Object.values(data.years).sort((a, b) => b.year - a.year).map((item) => <div key={item.year}><span><strong>{item.year}</strong><small>{item.year === data.activeYear ? "Año activo" : `${money(yearTotals(item).income, data.settings.currency)} en ingresos`}</small></span>{item.year !== data.activeYear && <div><button className="button ghost" type="button" onClick={() => commit({ ...data, activeYear: item.year }, `Ahora estás viendo ${item.year}.`)}>Abrir</button><button className="icon-button danger-icon" type="button" aria-label={`Eliminar año ${item.year}`} onClick={() => setDeleteYear(item.year)}><Trash2 size={17} /></button></div>}</div>)}</div><div className="new-year-box"><label className="check-row"><input type="checkbox" checked={carrySavings} onChange={(event) => setCarrySavings(event.target.checked)} /><span>Trasladar ahorro, metas, deudas pendientes, límites y movimientos fijos</span></label><button className="button primary" type="button" onClick={nextYear}>Crear y abrir {data.activeYear + 1}</button></div></section>
    <section className="panel settings-card danger-settings span-two"><div className="settings-title"><span><Trash2 /></span><div><h2>Restablecer aplicación</h2><p>Elimina todos los datos locales de Quinci en este dispositivo.</p></div></div><button className="button danger" type="button" onClick={() => setResetOpen(true)}>Borrar todos los datos</button></section>
  </div>{pendingImport && <Dialog title="Reemplazar datos con el respaldo" onClose={() => setPendingImport(null)}><div className="notice danger-notice"><ShieldAlert /><p>Se reemplazarán todos los años, movimientos, metas, deudas y ajustes actuales. Descarga primero un respaldo si necesitas conservarlos.</p></div><p>El archivo contiene {Object.keys(pendingImport.years).length} año(s) y dejará {pendingImport.activeYear} como año activo.</p><div className="dialog-actions"><button className="button ghost" type="button" onClick={() => setPendingImport(null)}>Cancelar</button><button className="button danger" type="button" onClick={() => { if (commit(pendingImport, "Respaldo restaurado correctamente.")) { setPendingImport(null); if (pendingImport.security.pin) onLock(); } }}>Reemplazar y restaurar</button></div></Dialog>}{deleteYear !== null && <Dialog title={`Eliminar historial ${deleteYear}`} onClose={() => setDeleteYear(null)}><p>Este año se eliminará del dispositivo y del próximo respaldo completo.</p><Field label={`Escribe ${deleteYear} para confirmar`}><input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} /></Field><button className="button danger full" type="button" disabled={deleteConfirmation !== String(deleteYear)} onClick={removeYear}>Eliminar año</button></Dialog>}{resetOpen && <Dialog title="Borrar todos los datos" onClose={() => setResetOpen(false)}><div className="notice danger-notice"><ShieldAlert /><p>Esta acción no se puede deshacer. Descarga un respaldo completo antes de continuar.</p></div><Field label="Escribe BORRAR para confirmar"><input value={resetConfirmation} onChange={(event) => setResetConfirmation(event.target.value)} /></Field><button className="button danger full" type="button" disabled={resetConfirmation !== "BORRAR"} onClick={() => { clearQuinciData(); const fresh = createAppData(); saveAppData(fresh); location.reload(); }}>Borrar y comenzar de nuevo</button></Dialog>}</div>;
}

function SearchDialog({ data, categories, currency, onClose, onOpenResult }: {
  data: AppData; categories: Category[]; currency: string; onClose: () => void; onOpenResult: (year: number, month: number, period: PeriodKey) => void;
}) {
  const [query, setQuery] = useState("");
  const categoryMap = new Map(categories.map((category) => [category.id, category.name]));
  const results = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("es");
    if (normalizedQuery.length < 2) return [];
    const matches: Array<{ id: string; year: number; month: number; period: PeriodKey; type: string; concept: string; amount: number; detail: string }> = [];
    Object.values(data.years).forEach((candidateYear) => candidateYear.months.forEach((month, monthIndex) => (["q1", "q2"] as PeriodKey[]).forEach((period) => {
      month[period].extras.forEach((item) => { if (`${item.concept} ${item.date}`.toLocaleLowerCase("es").includes(normalizedQuery)) matches.push({ id: item.id, year: candidateYear.year, month: monthIndex, period, type: "Ingreso", concept: item.concept, amount: item.amount, detail: item.date }); });
      month[period].expenses.forEach((item) => { const category = categoryMap.get(item.categoryId) || item.categoryId; if (`${item.concept} ${category} ${item.date}`.toLocaleLowerCase("es").includes(normalizedQuery)) matches.push({ id: item.id, year: candidateYear.year, month: monthIndex, period, type: "Gasto", concept: item.concept, amount: -item.amount, detail: `${category} · ${item.date}` }); });
    })));
    return matches.sort((a, b) => b.detail.localeCompare(a.detail)).slice(0, 100);
  }, [query, data, categoryMap]);
  return <Dialog title="Buscar movimientos" onClose={onClose} wide><Field label="Concepto, categoría o fecha"><div className="search-input"><Search size={19} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ej. supermercado, comida o 2026-08-09" /></div></Field>{query.trim().length < 2 ? <EmptyState title="Escribe al menos dos caracteres" text="La búsqueda incluye todos los años guardados." /> : results.length ? <div className="search-results"><p>{results.length} resultado(s)</p><ul>{results.map((result) => <li key={`${result.year}-${result.id}`}><button type="button" onClick={() => onOpenResult(result.year, result.month, result.period)}><span><strong>{result.concept}</strong><small>{result.type} · {result.detail} · {MONTHS[result.month]} {result.period.toUpperCase()} · {result.year}</small></span><b className={result.amount < 0 ? "negative-text" : "positive-text"}>{result.amount < 0 ? "−" : "+"}{money(Math.abs(result.amount), currency)}</b></button></li>)}</ul></div> : <EmptyState title="Sin resultados" text="Prueba con otro concepto, categoría o fecha." />}</Dialog>;
}

export default App;
