import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode, FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Activity, LogOut } from "lucide-react";
import { api, setCsrfToken } from "./api";

type Session = { authenticated: boolean; csrfToken: string };
const AuthContext = createContext<{
  authenticated: boolean;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  accept: (session: Session) => void;
} | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  function accept(session: Session) {
    setCsrfToken(session.csrfToken);
    setAuthenticated(session.authenticated);
  }
  async function refresh() {
    try {
      accept(await api<Session>("/auth/session"));
      setError("");
    } catch {
      setAuthenticated(false);
      setError("No se pudo comprobar la sesión. Revisa la conexión.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const load = async () => {
      try {
        const session = await api<Session>("/auth/session", {
          signal: controller.signal,
        });
        if (active) {
          accept(session);
          setError("");
        }
      } catch {
        if (active) {
          setAuthenticated(false);
          setError("No se pudo comprobar la sesión. Revisa la conexión.");
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    window.addEventListener("trazo-session-expired", load);
    return () => {
      active = false;
      controller.abort();
      window.removeEventListener("trazo-session-expired", load);
    };
  }, []);
  return (
    <AuthContext.Provider
      value={{ authenticated, loading, error, refresh, accept }}
    >
      {children}
    </AuthContext.Provider>
  );
}

function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("AuthProvider requerido");
  return auth;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { authenticated, loading, error, refresh } = useAuth();
  const location = useLocation();
  if (loading) return <div className="state">Comprobando tu sesión…</div>;
  if (error)
    return (
      <div className="state">
        <p role="alert">{error}</p>
        <button onClick={refresh}>Reintentar</button>
      </div>
    );
  if (location.pathname === "/login")
    return authenticated ? <Navigate to="/" replace /> : <LoginPage />;
  return authenticated ? (
    children
  ) : (
    <Navigate to="/login" state={{ from: location.pathname }} replace />
  );
}

function LoginPage() {
  const { accept } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      accept(
        await api<Session>("/auth/login", {
          method: "POST",
          body: JSON.stringify({ password }),
        }),
      );
      setPassword("");
      const from = location.state?.from;
      navigate(
        typeof from === "string" &&
          from.startsWith("/") &&
          !from.startsWith("//") &&
          from !== "/login"
          ? from
          : "/",
        { replace: true },
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <form className="panel login-card" onSubmit={login}>
        <span className="login-brand">
          <Activity size={30} /> trazo.
        </span>
        <h1>Tu espacio personal</h1>
        <p>Entra para continuar tu registro.</p>
        <label htmlFor="login-password">Contraseña</label>
        <input
          id="login-password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={1024}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
        />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}

export function LogoutButton() {
  const { refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    setBusy(true);
    setError("");
    try {
      await api("/auth/logout", { method: "POST" });
      await refresh();
    } catch {
      setError("No se pudo cerrar la sesión. Reintenta.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className="logout-button"
        onClick={logout}
        disabled={busy}
        aria-label="Cerrar sesión"
      >
        <LogOut size={16} />
        <span>Salir</span>
      </button>
      {error && <span role="alert">{error}</span>}
    </>
  );
}
