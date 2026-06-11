const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000/api";

function redirectToLoginBecauseSessionExpired() {
  try {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("wallet");
    sessionStorage.setItem("greenvest_session_expired", "1");
  } catch (error) {
    console.warn("SESSION CLEANUP ERROR:", error);
  }

  if (typeof window !== "undefined") {
    const currentPath = window.location.pathname || "";
    if (!["/login", "/register"].includes(currentPath)) {
      window.location.replace("/login?session=expired");
    }
  }
}

function isTokenExpiredOrInvalid(response, data = {}) {
  if (!response || response.status !== 401) return false;

  const message = String(data.message || data.detail || "").toLowerCase();
  return (
    message.includes("token") ||
    message.includes("no autorizado") ||
    message.includes("no autorizado") ||
    message.includes("expirado") ||
    message.includes("expirad") ||
    message.includes("invalid") ||
    message.includes("unauthorized")
  );
}

function handleUnauthorizedResponse(response, data = {}) {
  if (isTokenExpiredOrInvalid(response, data)) {
    redirectToLoginBecauseSessionExpired();
    return true;
  }

  return false;
}


async function request(endpoint, options = {}) {
  const token = localStorage.getItem("token");

  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const separator = endpoint.includes("?") ? "&" : "?";
  const cacheBustedEndpoint = options.method === "GET"
    ? `${endpoint}${separator}_=${Date.now()}`
    : endpoint;

  const response = await fetch(`${API_URL}${cacheBustedEndpoint}`, {
    ...options,
    headers,
    cache: "no-store",
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (handleUnauthorizedResponse(response, data)) {
      throw new Error("Tu sesión expiró. Inicia sesión nuevamente.");
    }
    throw new Error(data.detail || data.message || "Error en la petición.");
  }

  return data;
}

export function registerUser(payload) {
  return request("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function loginUser(payload) {
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function saveSession(data) {
  localStorage.setItem("token", data.token);
  localStorage.setItem("user", JSON.stringify(data.user));
  localStorage.setItem("wallet", JSON.stringify(data.wallet));
}

export function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  localStorage.removeItem("wallet");
}

export function getToken() {
  return localStorage.getItem("token");
}

export function getUser() {
  const user = localStorage.getItem("user");
  return user ? JSON.parse(user) : null;
}

export function getWallet() {
  const wallet = localStorage.getItem("wallet");
  return wallet ? JSON.parse(wallet) : null;
}


export async function getMyWalletFromApi(network = "BEP20-USDT") {
  const token = localStorage.getItem("token");

  const response = await fetch(`${API_URL}/wallet/me?network=${encodeURIComponent(network)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
    },
    cache: "no-store",
  });

  const data = await response.json();

  if (!response.ok) {
    if (handleUnauthorizedResponse(response, data)) {
      throw new Error("Tu sesión expiró. Inicia sesión nuevamente.");
    }
    throw new Error(data.message || "Error al obtener la wallet.");
  }

  return data;
}

export async function scanMyDeposits(network = "BEP20-USDT") {
  const token = localStorage.getItem("token");

  const response = await fetch(`${API_URL}/deposits/scan-me`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
    },
    cache: "no-store",
    body: JSON.stringify({ network }),
  });

  const data = await response.json();

  if (!response.ok) {
    if (handleUnauthorizedResponse(response, data)) {
      throw new Error("Tu sesión expiró. Inicia sesión nuevamente.");
    }
    throw new Error(data.message || "Error al escanear depósitos.");
  }

  return data;
} 

export async function getWithdrawInfo(network = "BEP20-USDT") {
  const token = localStorage.getItem("token");

  const response = await fetch(`${API_URL}/withdraw/me?network=${encodeURIComponent(network)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
    },
    cache: "no-store",
  });

  const data = await response.json();

  if (!response.ok) {
    if (handleUnauthorizedResponse(response, data)) {
      throw new Error("Tu sesión expiró. Inicia sesión nuevamente.");
    }
    throw new Error(data.message || "Error al obtener datos de retiro.");
  }

  return data;
}

export async function createWithdrawRequest(payload) {
  const token = localStorage.getItem("token");

  const response = await fetch(`${API_URL}/withdraw/request`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    if (handleUnauthorizedResponse(response, data)) {
      throw new Error("Tu sesión expiró. Inicia sesión nuevamente.");
    }
    throw new Error(data.message || "Error al solicitar retiro.");
  }

  return data;
}

export async function getMyTransactions() {
  const token = localStorage.getItem("token");

  const response = await fetch(`${API_URL}/withdraw/transactions`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const data = await response.json();

  if (!response.ok) {
    if (handleUnauthorizedResponse(response, data)) {
      throw new Error("Tu sesión expiró. Inicia sesión nuevamente.");
    }
    throw new Error(data.message || "Error al obtener historial.");
  }

  return data;
}



export async function getAdminPendingWithdrawals() {
  const token = localStorage.getItem("token");

  const response = await fetch(`${API_URL}/admin/withdrawals/pending`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const data = await response.json();

  if (!response.ok) {
    if (handleUnauthorizedResponse(response, data)) {
      throw new Error("Tu sesión expiró. Inicia sesión nuevamente.");
    }
    throw new Error(data.message || "Error al cargar retiros pendientes.");
  }

  return data;
}

export async function getAdminWithdrawals() {
  const token = localStorage.getItem("token");

  const response = await fetch(`${API_URL}/admin/withdrawals`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const data = await response.json();

  if (!response.ok) {
    if (handleUnauthorizedResponse(response, data)) {
      throw new Error("Tu sesión expiró. Inicia sesión nuevamente.");
    }
    throw new Error(data.message || "Error al cargar historial de retiros.");
  }

  return data;
}


export async function approveAdminWithdrawal(withdrawalId) {
  const token = localStorage.getItem("token");

  const response = await fetch(
    `${API_URL}/admin/withdrawals/${withdrawalId}/approve`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  const data = await response.json();

  if (!response.ok) {
    if (handleUnauthorizedResponse(response, data)) {
      throw new Error("Tu sesión expiró. Inicia sesión nuevamente.");
    }
    throw new Error(data.detail || data.message || "Error al aprobar retiro.");
  }

  return data;
}


export async function getPromotionDashboard() {
  const token = localStorage.getItem("token");

  const response = await fetch(`${API_URL}/referrals/dashboard`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const data = await response.json();

  if (!response.ok) {
    if (handleUnauthorizedResponse(response, data)) {
      throw new Error("Tu sesión expiró. Inicia sesión nuevamente.");
    }
    throw new Error(data.detail || data.message || "Error al cargar promoción.");
  }

  return data;
}

export async function getReferralMembers(level) {
  const token = localStorage.getItem("token");

  const response = await fetch(
    `${API_URL}/referrals/members/${level}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  const data = await response.json();

  if (!response.ok) {
    if (handleUnauthorizedResponse(response, data)) {
      throw new Error("Tu sesión expiró. Inicia sesión nuevamente.");
    }
    throw new Error(data.detail || data.message || "Error al cargar miembros.");
  }

  return data;
}


export function getVipStatus() {
    return request("/vip/status", {
        method: "GET",
    });
}

export function buyVipPackage(level) {
    return request("/vip/buy", {
        method: "POST",
        body: JSON.stringify({ level }),
    });
}


export function getTasksDashboard() {
  return request("/tasks/dashboard", {
    method: "GET",
  });
}

export function completeVipTask(vipPurchaseId) {
  return request(`/tasks/complete/${vipPurchaseId}`, {
    method: "POST",
  });
}

export async function getAdminStatus() {
  const token = localStorage.getItem("token");

  const response = await fetch(`${API_URL}/admin/status`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const data = await response.json();

  if (!response.ok) {
    if (handleUnauthorizedResponse(response, data)) {
      throw new Error("Tu sesión expiró. Inicia sesión nuevamente.");
    }
    throw new Error(data.detail || data.message || "Error al cargar estado admin.");
  }

  return data;
}


export function getReferralRewardsStatus() {
  return request("/referrals/rewards/status", {
    method: "GET",
  });
}

export function claimReferralReward(tierId) {
  return request("/referrals/rewards/claim", {
    method: "POST",
    body: JSON.stringify({ tierId }),
  });
}

export function getAdminDeposits() {
  return request("/admin/deposits", {
    method: "GET",
  });
}

export function getAdminDepositPreview(depositId) {
  return request(`/admin/deposits/${depositId}/preview`, {
    method: "GET",
  });
}

export function sendAdminDepositGas(depositId) {
  return request(`/admin/deposits/${depositId}/send-gas`, {
    method: "POST",
  });
}

export function collectAdminDeposit(depositId) {
  return request(`/admin/deposits/${depositId}/collect`, {
    method: "POST",
  });
}

export function refreshAdminDepositStatus(depositId) {
  return request(`/admin/deposits/${depositId}/refresh`, {
    method: "POST",
  });
}

export function getMiningStatus() {
  return request("/mining/status", { method: "GET" });
}

export function claimMiningReward() {
  return request("/mining/claim", { method: "POST" });
}

export function getHashRewardsStatus() {
  return request("/hash-rewards/status", { method: "GET" });
}

export function syncHashRewards() {
  return request("/hash-rewards/sync", { method: "POST" });
}

export function redeemHashPoint() {
  return request("/hash-rewards/redeem", { method: "POST" });
}

export function getReinvestStatus() {
  return request("/reinvest/status", { method: "GET" });
}

export function createReinvestment(payload) {
  return request("/reinvest/transfer", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}


export function getMarketPrices() {
  return request("/market/prices", { method: "GET" });
}


export function changePassword(payload) {
  return request("/auth/change-password", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getAdminSecurityUsers() {
  return request("/admin/security/users", { method: "GET" });
}

export function getAdminRepeatedIps() {
  return request("/admin/security/repeated-ips", { method: "GET" });
}

export function getAdminSecurityEvents(userId) {
  return request(`/admin/security/users/${userId}/events`, { method: "GET" });
}

export function markAdminUserSuspicious(userId, reason) {
  return request(`/admin/security/users/${userId}/mark-suspicious`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function clearAdminUserSuspicious(userId, reason) {
  return request(`/admin/security/users/${userId}/clear-suspicious`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function banAdminUser(userId, reason) {
  return request(`/admin/security/users/${userId}/ban`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function unbanAdminUser(userId, reason) {
  return request(`/admin/security/users/${userId}/unban`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function markAdminIpSuspicious(ip, reason) {
  return request(`/admin/security/ips/${encodeURIComponent(ip)}/mark-suspicious`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}


export function getAdminGrowthPromoters(search = "") {
  const query = search ? `?search=${encodeURIComponent(search)}` : "";
  return request(`/admin/growth/promoters${query}`, { method: "GET" });
}

export function getAdminGrowthUser(email) {
  return request(`/admin/growth/user?email=${encodeURIComponent(email)}`, { method: "GET" });
}

export function addAdminManualInvestment(payload) {
  return request("/admin/growth/manual-investment", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function addAdminManualWithdrawable(payload) {
  return request("/admin/growth/manual-withdrawable", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function addAdminManualMiningPower(payload) {
  return request("/admin/growth/manual-mining-power", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}


export function getFreePlantPointsStatus() {
  return request("/free-plants/status", { method: "GET" });
}

export function redeemFreePlantWithPoints(packageId) {
  return request("/free-plants/redeem", {
    method: "POST",
    body: JSON.stringify({ packageId }),
  });
}

export function getAdminFreePlantRequests(status = "pending") {
  return request(`/admin/free-plants/requests?status=${encodeURIComponent(status)}`, { method: "GET" });
}

export function approveAdminFreePlantRequest(id, note = "") {
  return request(`/admin/free-plants/requests/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
}

export function rejectAdminFreePlantRequest(id, note = "") {
  return request(`/admin/free-plants/requests/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
}

export function getPromoEventStatus() {
  return request("/promo-event/status", { method: "GET" });
}

export function claimPromoEventTask(taskCode) {
  return request(`/promo-event/tasks/${taskCode}/claim`, { method: "POST" });
}

export function getAdminPromoClaims() {
  return request("/admin/promo-event/claims", { method: "GET" });
}

export function getAdminPromoUserDetail(userId) {
  return request(`/admin/promo-event/users/${userId}`, { method: "GET" });
}
