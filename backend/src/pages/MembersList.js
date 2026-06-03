import React, { useEffect, useState } from "react";
import { FiArrowLeft, FiCreditCard, FiUser, FiUsers } from "react-icons/fi";
import { useNavigate, useParams } from "react-router-dom";
import { getReferralMembers } from "../services/authService";

function formatMoney(value) {
  return Number(value || 0).toFixed(2);
}

export default function MembersList() {
  const navigate = useNavigate();
  const { level } = useParams();

  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadMembers() {
      try {
        const data = await getReferralMembers(level);
        setMembers(data.members || []);
      } catch (error) {
        setMembers([]);
      } finally {
        setLoading(false);
      }
    }

    loadMembers();
  }, [level]);

  return (
    <div className="page members-page members-page-v4">
      <div className="recharge-header">
        <button className="icon-btn" onClick={() => navigate(-1)}>
          <FiArrowLeft />
        </button>

        <div>
          <div className="eyebrow">Nivel {level}</div>
          <h2>Lista de miembros</h2>
        </div>

        <div />
      </div>

      {loading && <div className="panel">Cargando miembros...</div>}

      {!loading &&
        members.map((member) => {
          const purchasedVipLevel = Number(
            member.purchasedVipLevel || member.vipLevel || 0
          );

          const purchasedVipPrice = Number(member.purchasedVipPrice || 0);
          const totalVipRecharge = Number(
            member.totalVipRecharge || purchasedVipPrice || 0
          );

          return (
            <div className="member-card member-card-compact" key={member.id}>
              <div className="member-compact-left">
                <div className="member-avatar member-avatar-usericon compact">
                  <FiUser />
                </div>

                <div className="member-compact-info">
                  <h3>{member.email}</h3>

                  <div className="member-compact-line">
                    <span className="member-tag compact">
                      {purchasedVipLevel > 0
                        ? `VIP${purchasedVipLevel}`
                        : "Sin VIP"}
                    </span>

                    <span className="member-dot">•</span>

                    <span className="member-invest-compact">
                      <FiCreditCard />
                      {formatMoney(totalVipRecharge)} USDT
                    </span>

                    <span className="member-dot">•</span>

                    <span className="member-date-compact">
                      {new Date(member.registeredAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="member-compact-right">
                <span className="member-direct-compact" title="Subordinados directos">
                  <FiUsers />
                  {member.directSubordinates}
                </span>

                <span className="member-plan-price">
                  {purchasedVipLevel > 0
                    ? `${formatMoney(purchasedVipPrice)} USDT`
                    : "0.00 USDT"}
                </span>
              </div>
            </div>
          );
        })}

      {!loading && members.length === 0 && (
        <div className="empty-history">No más</div>
      )}

      {!loading && members.length > 0 && (
        <div className="empty-history">No más</div>
      )}
    </div>
  );
}
