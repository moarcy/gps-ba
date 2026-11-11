import { useEffect, useState } from "react";
import { apiFetch, clearSession, loadSession, saveSession } from "../lib/api";

export function useSession() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancel = false;
    const onLogout = () => {
      clearSession();
      setUser(null);
    };
    window.addEventListener("gpsba-logout", onLogout);

    const boot = async () => {
      const session = loadSession();
      if (!session?.token) {
        if (!cancel) setReady(true);
        return;
      }
      const res = await apiFetch("/api/auth/me");
      if (cancel) return;
      if (!res.ok) {
        clearSession();
        setUser(null);
      } else {
        const body = await res.json();
        saveSession({ token: session.token, user: body.user });
        setUser(body.user);
      }
      setReady(true);
    };
    boot();

    return () => {
      cancel = true;
      window.removeEventListener("gpsba-logout", onLogout);
    };
  }, []);

  const login = async (usuario, senha) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario, senha }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "Falha no login");
    saveSession({ token: body.token, user: body.user });
    setUser(body.user);
  };

  const logout = () => {
    clearSession();
    setUser(null);
  };

  return { user, ready, login, logout };
}
