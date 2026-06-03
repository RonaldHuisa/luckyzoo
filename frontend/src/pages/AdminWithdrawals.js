import React, { useCallback, useEffect, useState } from "react";
import { FiCheckCircle, FiRefreshCw } from "react-icons/fi";
import {
    approveAdminWithdrawal,
    getAdminPendingWithdrawals,
    getAdminStatus,
    getAdminWithdrawals,
} from "../services/authService";

function money(value, decimals = 2) {
    return Number(value || 0).toFixed(decimals);
}

function statusLabel(status) {
    if (status === "paid") return "Pagado";
    if (status === "processing_auto") return "Procesando auto";
    if (status === "pending") return "Pendiente";
    if (status === "approved") return "Aprobado";
    return status || "Pendiente";
}

export default function AdminWithdrawals() {
    const [pendingWithdrawals, setPendingWithdrawals] = useState([]);
    const [allWithdrawals, setAllWithdrawals] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState(null);
    const [toast, setToast] = useState("");

    const showToast = useCallback((message) => {
        setToast(message);

        setTimeout(() => {
            setToast("");
        }, 5000);
    }, []);

    const loadWithdrawals = useCallback(async () => {
        try {
            setLoading(true);

            const [pendingData, allData, statusData] = await Promise.all([
                getAdminPendingWithdrawals(),
                getAdminWithdrawals(),
                getAdminStatus(),
            ]);

            setPendingWithdrawals(pendingData.withdrawals || []);
            setAllWithdrawals(allData.withdrawals || []);
            setStats(statusData || null);
        } catch (error) {
            showToast(error.message);
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => {
        loadWithdrawals();
    }, [loadWithdrawals]);

    const handleApprove = async (withdrawalId) => {
        const confirmApprove = window.confirm(
            "¿Confirmas aprobar y enviar este retiro?"
        );

        if (!confirmApprove) return;

        try {
            setProcessingId(withdrawalId);

            const data = await approveAdminWithdrawal(withdrawalId);

            showToast(`Retiro pagado. TX: ${data.txHash}`);

            await loadWithdrawals();
        } catch (error) {
            showToast(error.message);
        } finally {
            setProcessingId(null);
        }
    };

    const totals = stats?.totals || {};
    const counts = stats?.counts || {};

    return (
        <div className="page admin-page">
            {toast && (
                <div className="success-toast">
                    <strong>{toast}</strong>
                </div>
            )}

            <div className="admin-header">
                <div>
                    <h1>Panel Admin</h1>
                    <p>Retiros automáticos y pendientes</p>
                </div>

                <button type="button" onClick={loadWithdrawals}>
                    <FiRefreshCw />
                    Actualizar
                </button>
            </div>

            <div className="admin-info-grid">
                <div>
                    <span>Recargado hoy</span>
                    <strong>{money(totals.depositsTodayUsdt)} USDT</strong>
                </div>

                <div>
                    <span>Retirado hoy</span>
                    <strong>{money(totals.paidWithdrawalsTodayUsdt)} USDT</strong>
                </div>

                <div>
                    <span>Pendiente por pagar</span>
                    <strong>{money(totals.pendingWithdrawalsUsdt)} USDT</strong>
                </div>

                <div>
                    <span>Retiros automáticos</span>
                    <strong>{counts.autoPaidWithdrawals || 0}</strong>
                </div>
            </div>

            {loading && <div className="panel">Cargando retiros...</div>}

            {!loading && (
                <>
                    <div className="admin-section-title">
                        <h2>Aprobar</h2>
                        <p>Solo retiros mayores a 100 USDT o pagos automáticos fallidos.</p>
                    </div>

                    {pendingWithdrawals.length === 0 && (
                        <div className="panel admin-empty">
                            No hay retiros pendientes.
                        </div>
                    )}

                    {pendingWithdrawals.map((item) => (
                        <div className="admin-withdraw-card" key={item.id}>
                            <div className="admin-card-top">
                                <div>
                                    <h3>{item.email}</h3>
                                    <p>Usuario ID: {item.user_id}</p>
                                </div>

                                <span className="status-pending">Pendiente</span>
                            </div>

                            <div className="admin-info-grid">
                                <div>
                                    <span>Red</span>
                                    <strong>{item.network || "BEP20-USDT"}</strong>
                                </div>

                                <div>
                                    <span>Solicitado</span>
                                    <strong>{money(item.amount_requested, 6)} USDT</strong>
                                </div>

                                <div>
                                    <span>Comisión {Number(item.fee_percent).toFixed(0)}%</span>
                                    <strong>{money(item.fee_amount, 6)} USDT</strong>
                                </div>

                                <div>
                                    <span>Debe recibir</span>
                                    <strong className="amount-positive">
                                        {money(item.amount_to_receive, 6)} USDT
                                    </strong>
                                </div>

                                <div>
                                    <span>Fecha</span>
                                    <strong>{new Date(item.created_at).toLocaleString()}</strong>
                                </div>
                            </div>

                            <div className="admin-address-box">
                                <span>Dirección de retiro</span>
                                <p>{item.withdrawal_address}</p>
                            </div>

                            {item.admin_note && (
                                <div className="admin-address-box">
                                    <span>Nota</span>
                                    <p>{item.admin_note}</p>
                                </div>
                            )}

                            <button
                                className="admin-approve-btn"
                                type="button"
                                disabled={processingId === item.id}
                                onClick={() => handleApprove(item.id)}
                            >
                                <FiCheckCircle />
                                {processingId === item.id ? "Pagando..." : "Aprobar y pagar"}
                            </button>
                        </div>
                    ))}

                    <div className="admin-section-title">
                        <h2>Log de retiros</h2>
                        <p>Últimos retiros solicitados, automáticos y pagados.</p>
                    </div>

                    {allWithdrawals.slice(0, 30).map((item) => (
                        <div className="admin-withdraw-card compact" key={`log-${item.id}`}>
                            <div className="admin-card-top">
                                <div>
                                    <h3>{item.email}</h3>
                                    <p>{item.network || "BEP20-USDT"} · {new Date(item.created_at).toLocaleString()}</p>
                                </div>

                                <span className={item.status === "paid" ? "status-paid" : "status-pending"}>
                                    {statusLabel(item.status)}
                                </span>
                            </div>

                            <div className="admin-info-grid">
                                <div>
                                    <span>Solicitado</span>
                                    <strong>{money(item.amount_requested, 6)} USDT</strong>
                                </div>

                                <div>
                                    <span>Recibió</span>
                                    <strong>{money(item.amount_to_receive, 6)} USDT</strong>
                                </div>

                                <div>
                                    <span>TX</span>
                                    <strong>{item.tx_hash ? `${item.tx_hash.slice(0, 10)}...` : "-"}</strong>
                                </div>
                            </div>
                        </div>
                    ))}
                </>
            )}
        </div>
    );
}
