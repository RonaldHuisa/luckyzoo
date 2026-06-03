import React, { useCallback, useEffect, useState } from "react";
import { FiCheckCircle, FiRefreshCw } from "react-icons/fi";
import {
    approveAdminWithdrawal,
    getAdminPendingWithdrawals,
} from "../services/authService";

export default function AdminWithdrawals() {
    const [withdrawals, setWithdrawals] = useState([]);
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

            const data = await getAdminPendingWithdrawals();

            setWithdrawals(data.withdrawals || []);
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

            setWithdrawals((prev) =>
                prev.filter((item) => item.id !== withdrawalId)
            );
        } catch (error) {
            showToast(error.message);
        } finally {
            setProcessingId(null);
        }
    };

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
                    <p>Retiros pendientes por aprobar</p>
                </div>

                <button type="button" onClick={loadWithdrawals}>
                    <FiRefreshCw />
                    Actualizar
                </button>
            </div>

            {loading && <div className="panel">Cargando retiros...</div>}

            {!loading && withdrawals.length === 0 && (
                <div className="panel admin-empty">
                    No hay retiros pendientes.
                </div>
            )}

            {!loading &&
                withdrawals.map((item) => {
                    return (
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
                                    <span>Solicitado</span>
                                    <strong>{Number(item.amount_requested).toFixed(6)} USDT</strong>
                                </div>

                                <div>
                                    <span>Comisión {Number(item.fee_percent).toFixed(0)}%</span>
                                    <strong>{Number(item.fee_amount).toFixed(6)} USDT</strong>
                                </div>

                                <div>
                                    <span>Debe recibir</span>
                                    <strong className="amount-positive">
                                        {Number(item.amount_to_receive).toFixed(6)} USDT
                                    </strong>
                                </div>

                                <div>
                                    <span>Retiros pagados</span>
                                    <strong>{item.paid_withdrawals_count}</strong>
                                </div>

                                <div>
                                    <span>Total solicitudes</span>
                                    <strong>{item.total_withdrawals_count}</strong>
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
                    );
                })}
        </div>
    );
}