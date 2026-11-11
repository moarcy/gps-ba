import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import LoginScreen from "./auth/LoginScreen.jsx";
import { useSession } from "./auth/useSession.js";
import "./index.css";

function Root() {
  const { user, ready, login, logout } = useSession();
  if (!ready) {
    return (
      <div className="login-screen">
        <p className="section-hint">Carregando…</p>
      </div>
    );
  }
  if (!user) return <LoginScreen onLogin={login} />;
  return <App user={user} onLogout={logout} />;
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
