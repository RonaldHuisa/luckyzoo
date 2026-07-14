import axios from "axios";

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:5000/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  window.dispatchEvent(new Event("royal:loading-start"));
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => { window.dispatchEvent(new Event("royal:loading-end")); return response; },
  (error) => {
    window.dispatchEvent(new Event("royal:loading-end"));
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      if (!window.location.pathname.includes("/login")) window.location.href = "/login";
    }
    const message = error.response?.data?.message || error.message || "Error de conexión.";
    return Promise.reject(new Error(message));
  }
);

export default api;
