import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiBookOpen, FiArrowRight, FiArrowLeft } from "react-icons/fi";
import api from "../services/api";

function imageUrl(src) {
  if (!src) return "";
  if (src.startsWith("http") || src.startsWith("data:")) return src;
  if (src.startsWith("/")) return src;
  return `/${src}`;
}

export default function News() {
  const [articles, setArticles] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => {
    api.get("/news").then((res) => setArticles(res.data.articles || [])).catch((err) => setError(err.message));
  }, []);
  return (
    <div className="page-stack news-page compact-news-page">
      <Link className="secondary-btn back-link" to="/home"><FiArrowLeft /> Volver al inicio</Link>
      <section className="page-header-card compact-news-hero">
        <div>
          <span className="eyebrow">Noticias y artículos</span>
          <h2>Actualizaciones Royal Imperial AI</h2>
          <p>Publicaciones oficiales, guías y novedades del sistema de entrenamiento de IA financiera.</p>
        </div>
        <FiBookOpen className="header-icon" />
      </section>
      {error && <div className="alert error">{error}</div>}
      <section className="news-grid compact-news-grid">
        {articles.length === 0 && <div className="panel-card"><p>No hay noticias publicadas todavía.</p></div>}
        {articles.map((article) => (
          <Link className="news-card compact-news-card" key={article.id} to={`/news/${article.slug}`}>
            {article.coverImageUrl ? <img src={imageUrl(article.coverImageUrl)} alt={article.title} /> : <div className="news-cover-placeholder"><FiBookOpen /></div>}
            <div>
              <span>{article.publishedAt ? new Date(article.publishedAt).toLocaleDateString() : "Royal Imperial AI"}</span>
              <h3>{article.title}</h3>
              <p>{article.summary}</p>
              <strong>Leer artículo <FiArrowRight /></strong>
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}
