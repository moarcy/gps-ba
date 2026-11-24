const KEY = "gpsba.session";

export function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    return null;
  }
}

function writeSessionCookie(token) {
  if (!token) return;
  document.cookie = `gpsba=${encodeURIComponent(token)}; Path=/; SameSite=Lax`;
}

export function saveSession(session) {
  localStorage.setItem(KEY, JSON.stringify(session));
  writeSessionCookie(session?.token);
}

export function clearSession() {
  localStorage.removeItem(KEY);
  document.cookie = "gpsba=; Path=/; Max-Age=0; SameSite=Lax";
}

export function authHeaders(extra = {}) {
  const headers = { ...extra };
  const token = loadSession()?.token;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: authHeaders(options.headers || {}),
  });
  if (res.status === 401) {
    clearSession();
    window.dispatchEvent(new Event("gpsba-logout"));
  }
  return res;
}
