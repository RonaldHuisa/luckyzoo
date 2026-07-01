import React, { useEffect, useMemo, useState } from "react";
import api from "../services/api";

const PAGE_SIZE = 20;
const money = (v) => `${Number(v || 0).toFixed(3)} USDT`;

function getTxKind(item) {
  const type = String(item.type || "").toLowerCase();
  const direction = String(item.direction || "").toLowerCase();
  if (type.includes("withdrawal") || type.includes("retiro")) return "withdraw";
  if (direction === "debit") return "withdraw";
  return "income";
}

function statusLabel(item) {
  const type = String(item.type || "").toLowerCase();
  const status = String(item.status || "").toLowerCase();
  if (!type.includes("withdrawal") && !type.includes("retiro")) return "Completado";
  if (["paid", "completed", "success", "approved"].includes(status)) return "Exitoso";
  if (["pending", "processing", "processing_auto"].includes(status)) return "Pendiente";
  if (["rejected", "failed", "cancelled"].includes(status)) return "Rechazado";
  return status ? status.charAt(0).toUpperCase() + status.slice(1) : "Pendiente";
}

function titleFor(item) {
  const kind = getTxKind(item);
  if (kind === "withdraw") return "Retiro";
  if (String(item.type || "").toLowerCase().includes("task")) return "Ganancia por tarea IA";
  if (String(item.type || "").toLowerCase().includes("deposit")) return "Recarga";
  return item.title || "Ganancia registrada";
}

function dateLabel(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function History() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    api.get("/withdraw/transactions")
      .then((res) => setItems(res.data.transactions || res.data || []))
      .catch((err) => setError(err.message));
  }, []);

  const normalizedItems = useMemo(() => items.map((item) => {
    const kind = getTxKind(item);
    const amount = Number(item.amount_usdt || item.amount || item.amount_requested || 0);
    return {
      ...item,
      kind,
      amountAbs: Math.abs(amount),
      label: statusLabel(item),
      titleText: titleFor(item),
    };
  }), [items]);

  const totalPages = Math.max(1, Math.ceil(normalizedItems.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = normalizedItems.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="page-stack history-page-v26">
      <section className="history-hero-v26">
        <span className="eyebrow">Historial</span>
        <h2>Movimientos</h2>
        <p>Ganancias, recargas y retiros registrados.</p>
      </section>

      {error && <div className="alert error">{error}</div>}

      <section className="history-card-v26">
        {normalizedItems.length === 0 && <p className="muted">No hay movimientos recientes.</p>}
        <div className="history-list-v26">
          {pageItems.map((item) => (
            <article className={`history-item-v26 ${item.kind}`} key={`${item.type || 'tx'}-${item.id}`}>
              <div className="history-main-row-v26">
                <span>{item.titleText}</span>
                <strong className={item.kind === "withdraw" ? "amount-out" : "amount-in"}>
                  {item.kind === "withdraw" ? "-" : "+"}{money(item.amountAbs)}
                </strong>
              </div>
              <div className="history-sub-row-v26">
                <b className={`status-pill-v26 ${item.label.toLowerCase()}`}>{item.label}</b>
                <small>{dateLabel(item.created_at)}</small>
              </div>
            </article>
          ))}
        </div>

        {normalizedItems.length > PAGE_SIZE && (
          <div className="history-pagination-v26">
            <button type="button" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Anterior</button>
            <span>{safePage} / {totalPages}</span>
            <button type="button" disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Siguiente</button>
          </div>
        )}
      </section>
    </div>
  );
}
