import { Suspense, lazy } from "react";
import { BrowserRouter, Link, NavLink, Route, Routes } from "react-router-dom";
import {
  Activity,
  LayoutDashboard,
  List,
  Scale,
  ArrowUpRight,
  FileInput,
  TrendingUp,
} from "lucide-react";
import DashboardPage from "./pages/DashboardPage";
import ActivitiesPage from "./pages/ActivitiesPage";
import ActivityDetailPage from "./pages/ActivityDetailPage";
import BodyPage from "./pages/BodyPage";
const NewActivityPage = lazy(() => import("./pages/NewActivityPage"));
const ImportPage = lazy(() => import("./pages/ImportPage"));
const ProgressPage = lazy(() => import("./pages/ProgressPage"));
import DatabaseBadge from "./DatabaseBadge";
import { AuthProvider, AuthGate, LogoutButton } from "./Auth";
import "./App.css";
import { RhythmBackdrop } from "./RhythmBackdrop";
import "./rhythm.css";
export default function App({
  showBackdrop = true,
}: {
  showBackdrop?: boolean;
}) {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AuthGate>
          <div className="app-shell rhythm-theme">
            {showBackdrop && <RhythmBackdrop />}
            <aside className="sidebar">
              <Link className="brand" to="/">
                <span>
                  <Activity size={25} />
                </span>
                trazo<span className="brand-dot">.</span>
              </Link>
              <span className="nav-label">MI ENTRENAMIENTO</span>
              <nav>
                <NavLink to="/" end>
                  <LayoutDashboard size={19} /> Resumen
                </NavLink>
                <NavLink to="/activities">
                  <List size={19} /> Actividades
                </NavLink>
                <NavLink to="/body">
                  <Scale size={19} /> Cuerpo
                </NavLink>
                <NavLink to="/progress">
                  <TrendingUp size={19} /> Progreso
                </NavLink>
                <NavLink to="/import">
                  <FileInput size={19} /> Importar
                </NavLink>
              </nav>
              <div className="sidebar-bottom">
                <div className="sidebar-message">
                  <span>EL PROGRESO ES PERSONAL</span>
                  <p>
                    Un día a la vez.
                    <br />
                    Una sesión a la vez.
                  </p>
                  <ArrowUpRight size={22} />
                </div>
                <div className="profile">
                  <span>YO</span>
                  <div>
                    Mi espacio<small>Diario de entrenamiento</small>
                  </div>
                </div>
              </div>
            </aside>
            <div className="main-shell">
              <header className="topbar">
                <span>Tu diario de entrenamiento</span>
                <DatabaseBadge />
                <LogoutButton />
              </header>
              <main>
                <Suspense fallback={<div className="state">Cargando…</div>}>
                  <Routes>
                    <Route path="/" element={<DashboardPage />} />
                    <Route path="/activities" element={<ActivitiesPage />} />
                    <Route
                      path="/activities/new"
                      element={<NewActivityPage />}
                    />
                    <Route
                      path="/activities/:id"
                      element={<ActivityDetailPage />}
                    />
                    <Route path="/body" element={<BodyPage />} />
                    <Route path="/import" element={<ImportPage />} />
                    <Route path="/progress" element={<ProgressPage />} />
                    <Route
                      path="*"
                      element={
                        <div className="state">
                          <h1>Página no encontrada</h1>
                          <Link to="/">Volver al resumen</Link>
                        </div>
                      }
                    />
                  </Routes>
                </Suspense>
                <footer>
                  TRAZO <span>El valor está en seguir.</span>
                </footer>
              </main>
            </div>
          </div>
        </AuthGate>
      </AuthProvider>
    </BrowserRouter>
  );
}
