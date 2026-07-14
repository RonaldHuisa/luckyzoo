import React, { useEffect, useState } from "react";
import { FiCopy } from "react-icons/fi";
import api from "../services/api";

const coins = (v) => `${Number(v || 0).toLocaleString("es-PE")} monedas`;
const usdt = (v) => `${Number(v || 0).toFixed(4).replace(/0+$/, "").replace(/\.$/, "")} USDT`;

function dateText(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("es-PE");
  } catch {
    return "—";
  }
}

export default function InviteFriends() {
  const [data, setData] = useState(null);
  const [popup, setPopup] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/referrals/dashboard")
      .then((res) => setData(res.data))
      .catch((err) => setError(err.message));
  }, []);

  const show = (text) => {
    setPopup(text);
    window.clearTimeout(window.__luckyZooInvitePopup);
    window.__luckyZooInvitePopup = window.setTimeout(() => setPopup(""), 2600);
  };

  const copy = async () => {
    const link = data?.referralLink || "";
    const message = `🍀*Lucky Zoo*🍀
Plataforma donde puedes GANAR gratis girando ruleta. 🎲
Regístrate ahora y obtén *15 GIROS GRATIS* y pasantía. 🎯🍀

🏆VIPS Disponibles 🏆
Gana desde 5% a 10% diario, plan *PERMANENTE 🙌*

🏆 *VIP 1: Conejo* - 5 USDT
🎯 5 Giros cada hora
🎁 Comisión referidos 10%

🏆 *VIP 2: Oveja* - 50 USDT
🎯 15 Giros cada hora
🎁 Comisión referidos 20%

🏆 *VIP 3: Toro* - 200 USDT
🎯 35 Giros cada hora
🎁 Comisión referidos 30%

*Regístrate aquí:*
${link}

✅ Por cada invitado recibes 🪙 +200 y 🎲 +2 giros extra.
✅ Los giros extra no expiran ni se reinician cada hora.
✅ Retiros desde 1 USDT en automático.

¡Comienza a GIRAR y ganar dinero! Cuanto más amigos invites más ganarás. 🎉🎉`;

    await navigator.clipboard.writeText(message);
    show("Enlace copiado");
  };

  const members = data?.members || [];
  const activeVip = Number(data?.activeVipLevel || 0) === 0 ? "Gratis" : `VIP ${data?.activeVipLevel}`;
  const commissionPercent = Number(data?.currentCommissionPercent || 5);

  return (
    <div className="page-stack invite-page team-v60">
      {popup && <div className="simple-black-popup">{popup}</div>}

      <section className="team-v60-head">
        <span>Equipo</span>
        <h1>Referidos directos</h1>
        <p>Comparte tu código y revisa tu equipo directo.</p>
      </section>

      {error && <div className="alert error">{error}</div>}

      <section className="team-v60-code">
        <div>
          <span>Código personal</span>
          <strong>{data?.referralCode || "Cargando..."}</strong>
        </div>
        <button type="button" onClick={copy}>
          <FiCopy /> Copiar enlace
        </button>
      </section>

      <input className="team-v60-link" readOnly value={data?.referralLink || ""} />

      <section className="team-v60-stats">
        <article>
          <span>Referidos</span>
          <strong>{Number(data?.totalDirectReferrals || 0)}</strong>
        </article>
        <article>
          <span>VIP activo</span>
          <strong>{activeVip}</strong>
        </article>
        <article>
          <span>Bono actual</span>
          <strong>{commissionPercent}%</strong>
        </article>
        <article>
          <span>Total equipo</span>
          <strong>{coins(data?.totalTeamCoins)}</strong>
        </article>
        <article>
          <span>Ruletas de amigos</span>
          <strong>{Number(data?.inviteBonusSpinsRemaining || 0)} giros</strong>
        </article>
      </section>

      <section className="team-v60-info">
        <h2>Cómo ganas</h2>
        <p><strong>Bono por invitación:</strong> +200 monedas y +2 giros extra por cada invitado válido.</p>
        <p><strong>Ruletas de amigos:</strong> tus giros extra se acumulan, no expiran y no se pierden cuando cambia la hora.</p>
        <p><strong>Bono por retiro:</strong> mientras más subas tu VIP, mayor porcentaje de comisión recibes sobre los retiros de tus invitados. No se descuenta del saldo del referido.</p><p><strong>Ejemplo:</strong> si tienes VIP 3 y tu invitado retira, puedes recibir 30% como bono de comisión.</p>

        <div className="team-v60-commission-row">
          {(data?.commissionTable || []).map((item) => (
            <span key={item.level}>{item.level === 0 ? "Gratis" : `VIP ${item.level}`} · {item.percent}%</span>
          ))}
        </div>
      </section>

      <section className="team-v60-members">
        <div className="team-v60-section-title">
          <h2>Tus invitados</h2>
          <span>{members.length} directo(s)</span>
        </div>

        {members.length ? members.map((member) => (
          <article key={member.id} className="team-v60-member">
            <div>
              <strong>{member.email}</strong>
              <span>{dateText(member.registeredAt)} · {member.vipLevel ? `VIP ${member.vipLevel}` : "Gratis"} · {member.isValidReferral ? "Válido" : "Pendiente"}</span>
            </div>
            <div>
              <b>{coins(member.totalCommissionCoins)}</b>
              <small>Retirado {usdt(member.totalWithdrawn)}</small>
            </div>
          </article>
        )) : (
          <p className="team-v60-empty">Aún no tienes referidos directos.</p>
        )}
      </section>
    </div>
  );
}
