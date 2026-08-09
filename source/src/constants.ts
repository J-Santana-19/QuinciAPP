import type { Category } from "./types";

export const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
] as const;

export const DEFAULT_CATEGORIES: Category[] = [
  { id: "food", name: "Comida", color: "#f97316" },
  { id: "transport", name: "Transporte", color: "#2563eb" },
  { id: "services", name: "Servicios", color: "#0891b2" },
  { id: "housing", name: "Vivienda", color: "#7c3aed" },
  { id: "health", name: "Salud", color: "#db2777" },
  { id: "fun", name: "Entretenimiento", color: "#0f9f8f" },
  { id: "debt", name: "Pago de deuda", color: "#b42318" },
  { id: "unexpected", name: "Imprevisto", color: "#dc2626" },
  { id: "other", name: "Otro", color: "#667085" },
];

export const CURRENCIES = ["$", "B/.", "€", "£", "Q", "L", "S/", "R$", "₡", "RD$"];

export const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
export const currentPeriod = (): "q1" | "q2" => new Date().getDate() <= 15 ? "q1" : "q2";
