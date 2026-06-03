import React, { useEffect, useMemo, useState } from "react";
import { FiArrowLeft, FiCalendar, FiUsers } from "react-icons/fi";
import { useNavigate, useParams } from "react-router-dom";
import { getReferralMembers } from "../services/authService";

function formatMoney(value) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const TREE_LEVELS = [
  { level: 8, price: 4000, name: "Árbol Imperial" },
  { level: 7, price: 1500, name: "Bosque Premium" },
  { level: 6, price: 800, name: "Bosque Verde" },
  { level: 5, price: 350, name: "Árbol Fértil" },
  { level: 4, price: 150, name: "Árbol Joven" },
  { level: 3, price: 80, name: "Arbusto Vital" },
  { level: 2, price: 30, name: "Planta Verde" },
  { level: 1, price: 10, name: "Brote Inicial" },
  { level: 0, price: 0, name: "Brote de Pasantía" },
];

const DEFAULT_TREE_IMAGE = "/GreenVest_ico.png";
const MAX_MEMBERS = 50;

function getMemberTreeMeta(investedAmount) {
  const amount = Number(investedAmount || 0);
  const match = TREE_LEVELS.find((item) => amount >= item.price) || TREE_LEVELS[TREE_LEVELS.length - 1];
  return {
    level: match.level,
    name: match.name,
    image: `/tree-icons/tree-${match.level}.png`,
  };
}

function handleTreeImageError(event) {
  if (event.currentTarget.src.includes(DEFAULT_TREE_IMAGE)) return;
  event.currentTarget.src = DEFAULT_TREE_IMAGE;
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
        const list = Array.isArray(data?.members) ? data.members : [];
        setMembers(list);
      } catch (error) {
        setMembers([]);
      } finally {
        setLoading(false);
      }
    }

    loadMembers();
  }, [level]);

  const visibleMembers = useMemo(() => {
    return [...members]
      .sort((a, b) => new Date(b.registeredAt || 0) - new Date(a.registeredAt || 0))
      .slice(0, MAX_MEMBERS);
  }, [members]);

  return (
    <div className="page members-page members-page-v5 members-page-garden members-page-garden-compact">
      <div className="members-topbar-clean">
        <button className="members-back-btn" onClick={() => navigate(-1)} aria-label="Volver">
          <FiArrowLeft />
        </button>

        <div className="members-topbar-copy">
          <span className="members-topbar-level">NIVEL {level}</span>
          <h2>Lista de miembros</h2>
          <p>Últimos {MAX_MEMBERS} registros</p>
        </div>
      </div>

      {loading && <div className="panel">Cargando miembros...</div>}

      {!loading &&
        visibleMembers.map((member) => {
          const investedAmount = Number(member.investedAmount || 0);
          const isActive = Boolean(member.isActive);
          const treeMeta = getMemberTreeMeta(investedAmount);

          return (
            <article className="member-garden-card compact" key={member.id}>
              <div className="member-garden-main compact">
                <div className="member-garden-thumb-wrap compact">
                  <div className="member-garden-thumb compact">
                    <img
                      src={treeMeta.image}
                      onError={handleTreeImageError}
                      alt={treeMeta.name}
                    />
                  </div>
                </div>

                <div className="member-garden-content compact">
                  <div className="member-garden-toprow compact">
                    <div className="member-garden-headings compact">
                      <h3>{member.email}</h3>
                      <span className="member-garden-tree-name" data-no-translate="true">
                        {treeMeta.name}
                      </span>
                    </div>

                    <span className={`member-status-chip member-status-chip-soft ${isActive ? "active" : "inactive"}`}>
                      {isActive ? "Activo" : "Inactivo"}
                    </span>
                  </div>

                  <div className="member-garden-meta-row compact">
                    <div className="member-garden-meta-item member-garden-meta-amount compact">
                      <span>Inversión</span>
                      <strong data-no-translate="true">{formatMoney(investedAmount)} USDT</strong>
                    </div>

                    <div className="member-garden-meta-mini compact">
                      <span><FiCalendar /> Registro</span>
                      <strong data-no-translate="true">{new Date(member.registeredAt).toLocaleDateString()}</strong>
                    </div>

                    <div className="member-garden-meta-mini compact">
                      <span><FiUsers /> Equipo</span>
                      <strong data-no-translate="true">{member.directSubordinates}</strong>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          );
        })}

      {!loading && visibleMembers.length === 0 && (
        <div className="members-end-note-soft">Sin miembros registrados</div>
      )}

      {!loading && visibleMembers.length > 0 && (
        <div className="members-end-note-soft">Fin de la lista</div>
      )}
    </div>
  );
}
