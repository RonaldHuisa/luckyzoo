import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiArrowLeft, FiX } from "react-icons/fi";
import { useI18n } from "../i18n/I18nContext";

export default function About() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [activeImage, setActiveImage] = useState(null);

  const galleryItems = useMemo(
    () => [
      {
        src: "/about-assets/greenvest-plan-recompensa.png",
        alt: "Plan de recompensa agrícola GreenVest",
        title: t("Tabla de rendimiento"),
      },
      {
        src: "/about-assets/greenvest-comisiones.png",
        alt: "Cómo maximizar tus comisiones en GreenVest",
        title: t("Sistema de comisiones"),
      },
    ],
    [t]
  );

  return (
    <div className="page about-greenvest-page about-company-page">
      <header className="about-greenvest-topbar">
        <button type="button" onClick={() => navigate(-1)}>
          <FiArrowLeft />
        </button>
        <h1>{t("Empresa")}</h1>
        <span />
      </header>

      <section className="about-company-hero">
        <div className="about-company-logo">
          <img src="/GreenVest_ico.png" alt="GreenVest" />
        </div>
        <strong>GreenVest</strong>
        <span>{t("Versión V1.4")}</span>
      </section>

      <section className="about-company-card">
        <h2>{t("Nuestra misión")}</h2>
        <p>
          {t(
            "Somos una empresa de tecnología especializada en agricultura. Nuestro propósito es apoyar a usuarios interesados en contribuir al desarrollo y mejora del estado de la agricultura en Latinoamérica y el mundo."
          )}
        </p>
        <p>
          {t(
            "GreenVest es un proyecto pensado a largo plazo, basado en servicios digitales que representan el cuidado, crecimiento y mantenimiento de plantas dentro de la plataforma. Al formar parte de este proyecto, los usuarios apoyan una visión orientada a la agricultura y también pueden obtener recompensas según su participación."
          )}
        </p>
      </section>

      <section className="about-company-card">
        <h2>{t("Funcionamiento del servicio")}</h2>
        <p>
          {t(
            "El sistema permite iniciar desde 10 USDT para comenzar a generar recompensas diarias, simulando el servicio agrícola que brindamos dentro de GreenVest."
          )}
        </p>
        <p>
          {t(
            "Cada 6 horas debes realizar el riego de la planta que hayas contratado. Las recompensas se generan a partir del cuidado de tus plantas activas y el monto mínimo de retiro es desde 5 USDT."
          )}
        </p>
      </section>

      <section className="about-company-gallery-wrap">
        <div className="about-company-gallery-head">
          <h2>{t("Material informativo")}</h2>
          <p>{t("Toca una imagen para verla en grande")}</p>
        </div>

        <div className="about-company-gallery about-company-gallery-standalone">
          {galleryItems.map((item) => (
            <button
              key={item.src}
              type="button"
              className="about-company-image-card about-company-image-button"
              onClick={() => setActiveImage(item)}
            >
              <img src={item.src} alt={item.alt} />
              <div className="about-company-image-caption">
                <strong>{item.title}</strong>
                <span>{t("Presiona para ampliar")}</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="about-company-note">
        <strong>{t("GreenVest")}</strong>
        <span>
          {t("Tecnología, agricultura y recompensas digitales en un solo ecosistema.")}
        </span>
      </section>

      {activeImage ? (
        <div
          className="about-company-lightbox"
          role="dialog"
          aria-modal="true"
          onClick={() => setActiveImage(null)}
        >
          <div
            className="about-company-lightbox-content"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="about-company-lightbox-close"
              onClick={() => setActiveImage(null)}
              aria-label={t("Cerrar")}
            >
              <FiX />
            </button>
            <img src={activeImage.src} alt={activeImage.alt} />
            <div className="about-company-lightbox-caption">
              <strong>{activeImage.title}</strong>
              <span>{activeImage.alt}</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
