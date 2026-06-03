import React from "react";

export default function VideoCard({ title, views, time, image }) {
  return (
    <div className="video-card">
      <div className="video-thumb">
        <img src={image} alt={title} />
        <div className="video-meta">
          <span>{views} vistas</span>
          <span>{time}</span>
        </div>
      </div>

      <div className="video-body">
        <div className="video-title">{title}</div>
        <div className="video-rating-row">
          <span className="stars">★★★★★</span>
          <span className="points">5 puntos</span>
        </div>
        <button className="mint-btn">Calificación inmediata</button>
      </div>
    </div>
  );
}