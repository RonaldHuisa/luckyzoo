import React, { useEffect, useState } from "react";
import { FiArrowLeft, FiDownload, FiUpload } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { getMyTransactions, getWithdrawInfo } from "../services/authService";
import { useI18n } from "../i18n/I18nContext";

function formatAmount(value) {
  return Number(value || 0).toFixed(6);
}

function translateTransactionTitle(title, t) {
  const value = String(title || "");

  if (value.startsWith("Ganancia de tarea")) {
    return value.replace("Ganancia de tarea", t("Ganancia de tarea"));
  }

  if (value.startsWith("Task earning")) {
    return value;
  }

  if (value.startsWith("Comisión de referido nivel")) {
    return value.replace(
      "Comisión de referido nivel",
      t("Comisión de referido nivel")
    );
  }

  if (value.startsWith("Comisión de referido")) {
    return value.replace("Comisión de referido", t("Comisión de referido"));
  }

  if (value === "Deducción por retiro") {
    return t("Deducción por retiro");
  }

  return t(value);
}

export default function Transactions() {
  const navigate = useNavigate();
  const { t } = useI18n();

  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState("0");

  const loadTransactions = async () => {
    try {
      setLoading(true);

      const [transactionsData, withdrawInfo] = await Promise.all([
        getMyTransactions(),
        getWithdrawInfo(),
      ]);

      const latestTransactions = (transactionsData.transactions || []).slice(0, 50);
      setTransactions(latestTransactions);
      setAvailable(withdrawInfo.available || "0");
    } catch (error) {
      setTransactions([]);
      setAvailable("0");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTransactions();
  }, []);

  return (
    <div className="page transactions-page">
      <div className="recharge-header">
        <button className="icon-btn" onClick={() => navigate(-1)}>
          <FiArrowLeft />
        </button>

        <div>
          <div className="eyebrow">{t("Historial")}</div>
          <h2>{t("Historial")}</h2>
        </div>

        <div />
      </div>

      <div className="withdraw-balance-card">
        <p>{t("Disponible para retirar")}</p>
        <h1>{Number(available || 0).toFixed(3)}</h1>
        <span>USDT</span>

        <div className="history-actions">
          <button onClick={() => navigate("/recharge")}>
            <FiDownload /> {t("Recargar")}
          </button>
          <button onClick={() => navigate("/withdraw")}>
            <FiUpload /> {t("Retirar")}
          </button>
        </div>
      </div>

      <div className="history-title-row">
        <div>
          <div className="eyebrow">{t("Movimientos")}</div>
          <h3>{t("Últimos 50 movimientos")}</h3>
        </div>
        <span className="soft-pill">50</span>
      </div>

      {loading && <div className="panel">{t("Cargando historial...")}</div>}

      {!loading && transactions.length === 0 && (
        <div className="empty-history">{t("No hay movimientos para mostrar.")}</div>
      )}

      {!loading &&
        transactions.map((item) => {
          const amount = Number(item.amount_usdt || 0);

          const isDebit =
            item.direction === "debit" ||
            item.type === "withdrawal_request" ||
            item.type === "withdrawal_paid";

          const positive = !isDebit && amount >= 0;

          return (
            <div className="history-card" key={item.id}>
              <div>
                <h4>{translateTransactionTitle(item.title, t)}</h4>
                <p>{new Date(item.created_at).toLocaleString()}</p>
              </div>

              <strong className={positive ? "amount-positive" : "amount-negative"}>
                {isDebit ? "-" : ""}
                {Math.abs(amount).toFixed(3)} USDT
              </strong>
            </div>
          );
        })}

      {!loading && transactions.length > 0 && (
        <div className="empty-history">{t("Fin de la lista")}</div>
      )}
    </div>
  );
}
