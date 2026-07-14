import React, { useEffect, useMemo, useRef, useState } from "react";
import { FiArrowLeft, FiImage, FiMessageCircle, FiPlus, FiSend, FiX } from "react-icons/fi";
import api from "../services/api";

const API_ORIGIN = (process.env.REACT_APP_API_URL || "http://localhost:5000/api").replace(/\/api\/?$/, "");
const MAX_IMAGE_SIZE = 500 * 1024;

function formatDate(value) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("es-PE", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function imageUrl(file = {}) {
  if (file.dataUrl) return file.dataUrl;
  const fileUrl = file.fileUrl || "";
  return fileUrl.startsWith("http") ? fileUrl : `${API_ORIGIN}${fileUrl}`;
}

function validateImages(files, showPopup) {
  const selected = Array.from(files || []).slice(0, 3);
  const valid = [];

  for (const file of selected) {
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      showPopup("Solo se permiten imágenes JPG o PNG.");
      continue;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      showPopup("Cada imagen debe pesar máximo 500kB.");
      continue;
    }
    valid.push(file);
  }

  return valid;
}

function buildFormData(fields, images = []) {
  const formData = new FormData();
  Object.entries(fields).forEach(([key, value]) => formData.append(key, value || ""));
  images.forEach((file) => formData.append("images", file));
  return formData;
}

function ImagePicker({ images, onChange, onRemove, disabled }) {
  return (
    <div className="support-v51-images">
      <label>
        <FiImage /> Agregar imágenes
        <input
          type="file"
          accept="image/png,image/jpeg"
          multiple
          disabled={disabled}
          onChange={(e) => {
            onChange(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      <small>JPG o PNG · máximo 500kB por imagen</small>
      {images.length > 0 && (
        <div className="support-v51-selected">
          {images.map((file, index) => (
            <span key={`${file.name}-${index}`}>
              {file.name}
              <button type="button" onClick={() => onRemove(index)}><FiX /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function MessageAttachments({ attachments = [], onPreview }) {
  if (!attachments.length) return null;
  return (
    <div className="support-v51-attachments">
      {attachments.map((file) => (
        <button
          key={file.id}
          type="button"
          onClick={() => onPreview?.({ src: imageUrl(file), name: file.originalName || "Imagen adjunta" })}
        >
          <img src={imageUrl(file)} alt={file.originalName || "Adjunto"} />
        </button>
      ))}
    </div>
  );
}

export default function Support() {
  const bottomRef = useRef(null);
  const [tickets, setTickets] = useState([]);
  const [activeTicket, setActiveTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newTicketOpen, setNewTicketOpen] = useState(false);
  const [ticketForm, setTicketForm] = useState({ subject: "", message: "" });
  const [ticketImages, setTicketImages] = useState([]);
  const [reply, setReply] = useState("");
  const [replyImages, setReplyImages] = useState([]);
  const [popup, setPopup] = useState("");
  const [previewImage, setPreviewImage] = useState(null);
  const [loading, setLoading] = useState(false);

  const unreadTotal = useMemo(
    () => tickets.reduce((sum, ticket) => sum + Number(ticket.unreadAdminMessages || 0), 0),
    [tickets]
  );

  const showPopup = (text) => {
    if (!text) return;
    setPopup(text);
    window.clearTimeout(window.__luckyZooSupportPopup);
    window.__luckyZooSupportPopup = window.setTimeout(() => setPopup(""), 2600);
  };

  const addTicketImages = (files) => {
    const valid = validateImages(files, showPopup);
    setTicketImages((prev) => [...prev, ...valid].slice(0, 3));
  };

  const addReplyImages = (files) => {
    const valid = validateImages(files, showPopup);
    setReplyImages((prev) => [...prev, ...valid].slice(0, 3));
  };

  const loadTickets = async () => {
    try {
      const { data } = await api.get("/support/tickets");
      setTickets(data.tickets || []);
    } catch (err) {
      showPopup(err.message || "No se pudo cargar soporte.");
    }
  };

  const openTicket = async (ticket) => {
    try {
      const { data } = await api.get(`/support/tickets/${ticket.id}`);
      setActiveTicket(data.ticket);
      setMessages(data.messages || []);
      setTickets((prev) => prev.map((item) => item.id === ticket.id ? { ...item, unreadAdminMessages: 0 } : item));
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 120);
    } catch (err) {
      showPopup(err.message || "No se pudo abrir el ticket.");
    }
  };

  const createTicket = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = buildFormData(ticketForm, ticketImages);
      const { data } = await api.post("/support/tickets", payload);
      setTicketForm({ subject: "", message: "" });
      setTicketImages([]);
      setNewTicketOpen(false);
      await loadTickets();
      await openTicket(data.ticket);
      showPopup("Ticket creado.");
    } catch (err) {
      showPopup(err.message || "No se pudo crear el ticket.");
    } finally {
      setLoading(false);
    }
  };

  const sendReply = async (e) => {
    e.preventDefault();
    if (!activeTicket?.id || (!reply.trim() && replyImages.length === 0)) return;

    setLoading(true);
    try {
      const payload = buildFormData({ message: reply }, replyImages);
      await api.post(`/support/tickets/${activeTicket.id}/messages`, payload);
      setReply("");
      setReplyImages([]);
      await openTicket(activeTicket);
    } catch (err) {
      showPopup(err.message || "No se pudo enviar respuesta.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, []);

  if (activeTicket) {
    return (
      <div className="page-stack support-v50 support-v51">
        {popup && <div className="support-v50-popup">{popup}</div>}
        {previewImage && (
          <div className="support-v54-preview" role="dialog" aria-modal="true">
            <div>
              <button type="button" onClick={() => setPreviewImage(null)} aria-label="Cerrar imagen">×</button>
              <img src={previewImage.src} alt={previewImage.name} />
              <small>{previewImage.name}</small>
            </div>
          </div>
        )}

        <section className="support-v50-chat-head">
          <button type="button" onClick={() => { setActiveTicket(null); setMessages([]); loadTickets(); }}>
            <FiArrowLeft /> Volver
          </button>
          <div>
            <span>Ticket #{activeTicket.id}</span>
            <h1>{activeTicket.subject}</h1>
          </div>
        </section>

        <section className="support-v50-chat">
          {messages.map((message) => (
            <article key={message.id} className={`support-v50-bubble ${message.senderRole === "admin" ? "admin" : "user"}`}>
              <small>{message.senderRole === "admin" ? "Soporte" : "Tú"}</small>
              <p>{message.body}</p>
              <MessageAttachments attachments={message.attachments} onPreview={setPreviewImage} />
              <time>{formatDate(message.createdAt)}</time>
            </article>
          ))}
          <div ref={bottomRef} />
        </section>

        <form className="support-v50-reply" onSubmit={sendReply}>
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Escribe tu respuesta..."
            rows={3}
            maxLength={4000}
          />
          <ImagePicker
            images={replyImages}
            disabled={loading}
            onChange={addReplyImages}
            onRemove={(index) => setReplyImages((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}
          />
          <button disabled={loading || (!reply.trim() && replyImages.length === 0)}>
            <FiSend /> Enviar
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="page-stack support-v50 support-v51">
      {popup && <div className="support-v50-popup">{popup}</div>}
      {previewImage && (
        <div className="support-v54-preview" role="dialog" aria-modal="true">
          <div>
            <button type="button" onClick={() => setPreviewImage(null)} aria-label="Cerrar imagen">×</button>
            <img src={previewImage.src} alt={previewImage.name} />
            <small>{previewImage.name}</small>
          </div>
        </div>
      )}

      <section className="support-v50-head">
        <div>
          <span>Soporte</span>
          <h1>Contactar soporte</h1>
          <p>Crea un ticket y conversa con administración.</p>
        </div>
        {unreadTotal > 0 && <strong>{unreadTotal}</strong>}
      </section>

      <button className="support-v50-new" type="button" onClick={() => setNewTicketOpen((value) => !value)}>
        <FiPlus /> Nuevo ticket
      </button>

      {newTicketOpen && (
        <form className="support-v50-form" onSubmit={createTicket}>
          <label>
            Asunto
            <input
              value={ticketForm.subject}
              onChange={(e) => setTicketForm({ ...ticketForm, subject: e.target.value })}
              placeholder="Ej. No puedo retirar"
              maxLength={160}
              required
            />
          </label>
          <label>
            Detalle
            <textarea
              value={ticketForm.message}
              onChange={(e) => setTicketForm({ ...ticketForm, message: e.target.value })}
              placeholder="Explica tu caso..."
              rows={4}
              maxLength={4000}
            />
          </label>
          <ImagePicker
            images={ticketImages}
            disabled={loading}
            onChange={addTicketImages}
            onRemove={(index) => setTicketImages((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}
          />
          <button disabled={loading}>{loading ? "Creando..." : "Crear ticket"}</button>
        </form>
      )}

      <section className="support-v50-list">
        {tickets.length === 0 ? (
          <article className="support-v50-empty">
            <FiMessageCircle />
            <p>Aún no tienes tickets.</p>
          </article>
        ) : tickets.map((ticket) => (
          <button key={ticket.id} type="button" className="support-v50-ticket" onClick={() => openTicket(ticket)}>
            <div>
              <span>{ticket.status === "closed" ? "Cerrado" : ticket.status === "answered" ? "Respondido" : "Abierto"}</span>
              <h2>{ticket.subject}</h2>
              <p>{ticket.lastMessage}</p>
              <time>{formatDate(ticket.lastMessageAt)}</time>
            </div>
            {ticket.unreadAdminMessages > 0 && <strong>{ticket.unreadAdminMessages}</strong>}
          </button>
        ))}
      </section>
    </div>
  );
}
