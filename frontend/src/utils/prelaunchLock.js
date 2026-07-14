export const PRELAUNCH_RECHARGE_CUTOFF = "2026-07-07";

export function getPeruDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

export function isRechargeLockedByPrelaunch(date = new Date()) {
  // Lanzamiento habilitado desde el 7 de julio UTC.
  // Desde esta fecha las recargas, compra de planes y retiros ya no quedan bloqueados por pre-lanzamiento.
  const utcDate = date.toISOString().slice(0, 10);
  return utcDate < PRELAUNCH_RECHARGE_CUTOFF;
}

export function rechargePrelaunchMessage() {
  return "Las recargas, planes y retiros ya están disponibles desde el lanzamiento oficial.";
}
