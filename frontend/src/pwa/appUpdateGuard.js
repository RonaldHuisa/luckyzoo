const VERSION_STORAGE_KEY = "greenvest_app_version";
const LAST_CHECK_KEY = "greenvest_last_update_check";
const DEFAULT_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hora

function clearSessionForUpdate() {
  // Mantiene idioma/preferencias, pero obliga login para cargar la nueva versión limpia.
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  localStorage.removeItem("wallet");
}

async function clearBrowserCaches() {
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }

  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.update().catch(() => null)));
  }
}

async function fetchAppVersion() {
  const response = await fetch(`/app-version.json?ts=${Date.now()}`, {
    method: "GET",
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });

  if (!response.ok) return null;
  return response.json();
}

export async function checkForAppUpdate({ force = false } = {}) {
  try {
    const now = Date.now();
    const lastCheck = Number(localStorage.getItem(LAST_CHECK_KEY) || 0);

    if (!force && now - lastCheck < DEFAULT_CHECK_INTERVAL_MS) {
      return;
    }

    localStorage.setItem(LAST_CHECK_KEY, String(now));

    const versionInfo = await fetchAppVersion();
    const remoteVersion = String(versionInfo?.version || "").trim();

    if (!remoteVersion) return;

    const currentVersion = localStorage.getItem(VERSION_STORAGE_KEY);

    // Primera vez: guarda la versión actual y no expulsa al usuario.
    if (!currentVersion) {
      localStorage.setItem(VERSION_STORAGE_KEY, remoteVersion);
      return;
    }

    if (currentVersion !== remoteVersion) {
      localStorage.setItem(VERSION_STORAGE_KEY, remoteVersion);
      await clearBrowserCaches();

      if (versionInfo?.forceLogout !== false) {
        clearSessionForUpdate();
        window.location.replace("/login?updated=1");
        return;
      }

      window.location.reload();
    }
  } catch (error) {
    console.warn("No se pudo verificar actualización de la app.", error);
  }
}

export function startAppUpdateGuard() {
  checkForAppUpdate({ force: true });

  const intervalId = window.setInterval(() => {
    checkForAppUpdate();
  }, DEFAULT_CHECK_INTERVAL_MS);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      checkForAppUpdate({ force: true });
    }
  });

  return () => window.clearInterval(intervalId);
}
