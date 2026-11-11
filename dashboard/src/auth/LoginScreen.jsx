import { useState } from "react";

export default function LoginScreen({ onLogin }) {
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      await onLogin(usuario.trim(), senha);
    } catch (err) {
      setError(err.message || "Não foi possível entrar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <div className="brand-mark">
          GPS <span>BA</span>
        </div>
        <p className="section-hint">Entre com o seu acesso.</p>
        <div className="filter">
          <label htmlFor="login-usuario">Usuário</label>
          <input
            id="login-usuario"
            autoComplete="username"
            value={usuario}
            onChange={(event) => setUsuario(event.target.value)}
            required
          />
        </div>
        <div className="filter">
          <label htmlFor="login-senha">Senha</label>
          <input
            id="login-senha"
            type="password"
            autoComplete="current-password"
            value={senha}
            onChange={(event) => setSenha(event.target.value)}
            required
          />
        </div>
        {error && <p className="form-error">{error}</p>}
        <button className="btn btn-primary btn-block" type="submit" disabled={saving}>
          {saving ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
