import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  FiArrowLeft,
  FiRefreshCw,
  FiZap,
  FiDownloadCloud,
  FiX,
  FiEye,
  FiCheckCircle,
  FiClock,
} from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import {
  collectAdminDeposit,
  getAdminDepositPreview,
  getAdminDeposits,
  refreshAdminDepositStatus,
  sendAdminDepositGas,
} from "../services/authService";

function money(value) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

function shortHash(value) {
  if (!value) return "-";
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function statusLabel(status) {
  const map = {
    pending: "Pendiente",
    failed: "Fallido",
    gas_pending: "Gas enviado",
    gas_ready: "Gas listo",
    gas_short: "Gas insuficiente",
    collecting: "Recolectando",
    swept: "Recolectado",
  };

  return map[status] || status || "Pendiente";
}

function isManualAdminDeposit(item) {
  const sweepStatus = String(item?.sweep_status || "").toLowerCase();
  const txHash = String(item?.tx_hash || "").toLowerCase();
  const tokenContract = String(item?.token_contract || "").toLowerCase();

  return (
    sweepStatus === "manual" ||
    sweepStatus === "hidden_manual" ||
    txHash.startsWith("manual_admin_recharge_") ||
    tokenContract === "manual-admin-credit"
  );
}

function statusClass(status) {
  if (status === "swept") return "success";
  if (status === "failed") return "danger";
  if (status === "gas_pending" || status === "collecting" || status === "gas_short") return "warning";
  if (status === "gas_ready") return "blue";
  return "neutral";
}

export default function AdminDeposits() {
  const navigate = useNavigate();

  const [deposits, setDeposits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [toast, setToast] = useState("");
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [pendingCollectId, setPendingCollectId] = useState(null);
  const [showHistory, setShowHistory] = useState(false);

  const showToast = useCallback((message) => {
    setToast(message);
    setTimeout(() => setToast(""), 5500);
  }, []);

  const loadDeposits = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getAdminDeposits();
      setDeposits(data.deposits || []);
    } catch (error) {
      showToast(error.message || "No se pudieron cargar los depósitos.");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadDeposits();
  }, [loadDeposits]);

  const activeDeposits = useMemo(
    () => deposits.filter((item) => !isManualAdminDeposit(item) && item.sweep_status !== "swept"),
    [deposits]
  );

  const historyDeposits = useMemo(
    () => deposits.filter((item) => !isManualAdminDeposit(item) && item.sweep_status === "swept"),
    [deposits]
  );

  const visibleDeposits = showHistory ? historyDeposits : activeDeposits;

  const canConfirmCollection = Boolean(
    preview?.balances?.hasEnoughNative && Number(preview?.balances?.userNative || 0) > 0
  );

  const openPreview = async (depositId, mode = "view") => {
    try {
      setPreviewLoading(true);
      setPendingCollectId(mode === "collect" ? depositId : null);
      const data = await getAdminDepositPreview(depositId);
      setPreview(data);
    } catch (error) {
      showToast(error.message || "No se pudo abrir el detalle.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    setPreview(null);
    setPendingCollectId(null);
  };

  const handleSendGas = async (depositId) => {
    const ok = window.confirm("¿Enviar gas a esta wallet de usuario?");
    if (!ok) return;

    try {
      setProcessingId(depositId);
      const data = await sendAdminDepositGas(depositId);
      showToast(data.message || "Gas enviado correctamente.");
      await loadDeposits();
    } catch (error) {
      showToast(error.message || "No se pudo enviar gas.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleRefresh = async (depositId) => {
    try {
      setProcessingId(depositId);
      const data = await refreshAdminDepositStatus(depositId);
      showToast(data.message || "Estado actualizado.");
      await loadDeposits();
    } catch (error) {
      showToast(error.message || "No se pudo actualizar.");
    } finally {
      setProcessingId(null);
    }
  };

  const confirmCollect = async () => {
    if (!pendingCollectId) return;

    const ok = window.confirm("¿Confirmas recolectar este USDT hacia la wallet central?");
    if (!ok) return;

    try {
      setProcessingId(pendingCollectId);
      const data = await collectAdminDeposit(pendingCollectId);
      showToast(data.message || "Recargar recolectado correctamente.");
      closePreview();
      await loadDeposits();
    } catch (error) {
      showToast(error.message || "No se pudo recolectar el depósito.");
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="page admin-deposits-page">
      {toast && (
        <div className="success-toast">
          <strong>{toast}</strong>
        </div>
      )}

      <div className="admin-status-header">
        <button className="icon-btn" type="button" onClick={() => navigate("/admin/status")}>
          <FiArrowLeft />
        </button>

        <div>
          <div className="eyebrow">Panel Admin</div>
          <h2>Recolección de recargas</h2>
        </div>

        <div className="admin-header-actions">
          <button
            className={`admin-history-toggle ${showHistory ? "active" : ""}`}
            type="button"
            onClick={() => setShowHistory((value) => !value)}
            title={showHistory ? "Ver pendientes" : "Ver histórico"}
          >
            <FiClock />
            <span>{showHistory ? "Pendientes" : "Histórico"}</span>
          </button>

          <button className="icon-btn ghost-icon" type="button" onClick={loadDeposits} title="Actualizar">
            <FiRefreshCw />
          </button>
        </div>
      </div>

      <section className="panel admin-deposit-help compact">
        <strong>{showHistory ? "Histórico" : "Pendientes de recolección"}</strong>
        <p>
          {showHistory
            ? "Aquí quedan las recargas ya recolectadas correctamente."
            : "La recarga ya fue abonada al usuario. Envía gas, verifica y luego recolecta hacia tu wallet central."}
        </p>
      </section>

      {loading && <div className="panel admin-status-loading">Cargando depósitos...</div>}

      {!loading && visibleDeposits.length === 0 && (
        <div className="panel admin-empty">
          {showHistory ? "No hay recargas históricas." : "No hay recargas pendientes de recolección."}
        </div>
      )}

      {!loading && visibleDeposits.map((item) => {
        const isBusy = processingId === item.id;
        const actions = item.actions || {};

        if (showHistory) {
          return (
            <article className="admin-deposit-card compact-history" key={item.id}>
              <div className="admin-deposit-top compact">
                <div>
                  <h3>{money(item.amount_usdt)} USDT · {item.network}</h3>
                  <p>{item.email} · {new Date(item.created_at).toLocaleString()}</p>
                </div>

                <span className="admin-deposit-status success">Recolectado</span>
              </div>

              <div className="admin-history-line">
                <span>VIP/GreenVest</span>
                <strong>{item.vip_name ? `${item.vip_name} · ${money(item.vip_price_usdt)} USDT` : "Sin compra detectada"}</strong>
              </div>

              <div className="admin-deposit-hashes compact">
                <span>Recargar: {shortHash(item.tx_hash)}</span>
                <span>Gas: {shortHash(item.bnb_topup_tx_hash)}</span>
                <span>Recolecta: {shortHash(item.sweep_tx_hash)}</span>
              </div>
            </article>
          );
        }

        return (
          <article className="admin-deposit-card" key={item.id}>
            <div className="admin-deposit-top">
              <div>
                <h3>{item.email}</h3>
                <p>ID depósito #{item.id} · Usuario #{item.user_id}</p>
              </div>

              <span className={`admin-deposit-status ${statusClass(item.sweep_status)}`}>
                {statusLabel(item.sweep_status)}
              </span>
            </div>

            <div className="admin-deposit-grid">
              <div>
                <span>Recarga</span>
                <strong>{money(item.amount_usdt)} USDT</strong>
              </div>

              <div>
                <span>Red usada</span>
                <strong>{item.network}</strong>
              </div>

              <div>
                <span>Fecha</span>
                <strong>{new Date(item.created_at).toLocaleString()}</strong>
              </div>

              <div>
                <span>Compra VIP/GreenVest</span>
                <strong>{item.vip_name ? `${item.vip_name} · ${money(item.vip_price_usdt)} USDT` : "Sin compra detectada"}</strong>
              </div>
            </div>

            <div className="admin-deposit-address">
              <span>Wallet usuario</span>
              <p>{item.wallet_address}</p>
            </div>

            <div className="admin-deposit-hashes">
              <span>Recargar: {shortHash(item.tx_hash)}</span>
              <span>Gas: {shortHash(item.bnb_topup_tx_hash)}</span>
              <span>Recolecta: {shortHash(item.sweep_tx_hash)}</span>
            </div>

            <div className="admin-deposit-actions">
              <button type="button" className="admin-secondary-btn" onClick={() => openPreview(item.id)}>
                <FiEye /> Ver saldo
              </button>

              <button
                type="button"
                className="admin-gas-btn"
                disabled={isBusy || !actions.canSendGas}
                onClick={() => handleSendGas(item.id)}
              >
                <FiZap />
                {isBusy ? "Procesando..." : item.bnb_topup_tx_hash ? "Enviar gas adicional" : "Enviar gas"}
              </button>

              <button
                type="button"
                className="admin-collect-btn"
                disabled={isBusy || !actions.canCollect}
                onClick={() => openPreview(item.id, "collect")}
              >
                <FiDownloadCloud /> Recolectar
              </button>

              <button
                type="button"
                className="admin-secondary-btn"
                disabled={isBusy || !actions.canRefresh}
                onClick={() => handleRefresh(item.id)}
              >
                <FiCheckCircle /> Verificar
              </button>
            </div>
          </article>
        );
      })}

      {(preview || previewLoading) && (
        <div className="admin-modal-backdrop">
          <div className="admin-modal-card">
            <button type="button" className="admin-modal-close" onClick={closePreview}>
              <FiX />
            </button>

            {previewLoading ? (
              <div className="admin-status-loading">Cargando saldo de wallet...</div>
            ) : (
              <>
                <div className="admin-modal-title">
                  <h3>Vista previa de recolección</h3>
                  <p>{preview?.deposit?.email}</p>
                </div>

                <div className="admin-modal-grid">
                  <div>
                    <span>Token en wallet</span>
                    <strong>{preview?.balances?.userTokenRaw ? money(preview.deposit.amountUsdt) : "0.00"} USDT</strong>
                  </div>

                  <div>
                    <span>Gas usuario</span>
                    <strong>{Number(preview?.balances?.userNative || 0).toFixed(8)} {preview?.network?.nativeSymbol}</strong>
                  </div>

                  <div>
                    <span>Gas necesario estimado</span>
                    <strong>{Number(preview?.balances?.requiredNative || 0).toFixed(8)} {preview?.network?.nativeSymbol}</strong>
                  </div>

                  <div>
                    <span>Gas plataforma</span>
                    <strong>{Number(preview?.balances?.platformNative || 0).toFixed(8)} {preview?.network?.nativeSymbol}</strong>
                  </div>
                </div>

                <div className="admin-modal-address">
                  <span>Wallet usuario</span>
                  <p>{preview?.deposit?.walletAddress}</p>
                </div>

                {pendingCollectId && !canConfirmCollection && (
                  <div className="admin-modal-warning">
                    No se puede recolectar todavía. La wallet del usuario no tiene gas confirmado suficiente.
                    En Polygon el precio del gas puede variar; presiona "Enviar gas adicional", espera confirmación y luego usa "Verificar".
                  </div>
                )}

                {pendingCollectId && (
                  <button
                    type="button"
                    className="admin-collect-btn full"
                    disabled={processingId === pendingCollectId || !canConfirmCollection}
                    onClick={confirmCollect}
                  >
                    <FiDownloadCloud />
                    {processingId === pendingCollectId ? "Recolectando..." : "Confirmar recolección"}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
