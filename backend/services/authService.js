const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000/api";

async function request(endpoint, options = {}) {
  const token = localStorage.getItem("token");

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
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
    },
  });

  const data = await response.json();

  if (!response.ok) {
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
    },
    body: JSON.stringify({ network }),
  });

  const data = await response.json();

  if (!response.ok) {
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
    },
  });

  const data = await response.json();

  if (!response.ok) {
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
    throw new Error(data.message || "Error al cargar retiros pendientes.");
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
