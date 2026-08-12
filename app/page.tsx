"use client";
import { useState, useEffect, useCallback } from "react";
import { Search, RefreshCw, ArrowLeft } from "lucide-react";
import Sidebar from "./components/Sidebar";
import FormulariosAdmin from "./components/FormulariosAdmin";
import FileExplorer from "./components/FileExplorer";
import ClientsTable from "./components/ClientsTable";
import ClientDetail from "./components/ClientDetail";
import PipelineBoard from "./components/PipelineBoard";
import BusinessTracker from "./components/BusinessTracker";
import ChatAI from "./components/ChatAI";
import DocumentsManager from "./components/DocumentsManager";
import Analytics from "./components/Analytics";
import AdminPanel from "./components/AdminPanel";
import NotificationsPanel from "./components/NotificationsPanel";
import LoginPage from "./components/LoginPage";
import ProfileSettings, { initProfilePrefs , maybePlayAlertSoundOnce } from "./components/ProfileSettings";

const N8N_API_CLIENTS = "https://n8n.grupoexcelsior.co/webhook/api-clients";
const N8N_API_ALERTAS = "https://n8n.grupoexcelsior.co/webhook/api-alertas";
const N8N_AUTH = "https://n8n.grupoexcelsior.co/webhook/auth";

export interface Poliza {
  id: string; cedula: string; tipo_poliza: string; aseguradora: string;
  numero_poliza: string; vigencia_desde: string; vigencia_hasta: string;
  prima: string; archivo: string; fecha_registro: string;
}

export interface Client {
  cedula: string; nombre: string; estado: string; tipo_poliza: string;
  telefono: string; correo: string; fecha: string; aseguradora: string;
  observaciones: string; folder_id: string; polizas: Poliza[]; total_polizas: number;
}

interface User {
  id: string; email: string; nombre: string;
  rol: "admin" | "desarrollador" | "gestor";
  avatar: string; token: string;
}

const ROLE_TABS: Record<string, string[]> = {
  admin: ["dashboard", "clients", "pipeline", "negocios", "chat", "documents", "analytics", "formularios", "admin"],
  desarrollador: ["dashboard", "clients", "pipeline", "negocios", "chat", "documents", "analytics", "formularios", "admin"],
  gestor: ["dashboard", "clients", "pipeline", "chat", "documents", "formularios"],
};

const TAB_INFO: Record<string, { title: string; subtitle: string }> = {
  dashboard: { title: "Archivos", subtitle: "Explorador de carpetas y documentos en Drive" },
  clients: { title: "Prospectos & Clientes", subtitle: "Gestiona tu cartera de seguros" },
  pipeline: { title: "Pipeline", subtitle: "Estado de negocios por etapa" },
  negocios: { title: "Negocios", subtitle: "Registro de documentos cargados" },
  formularios: { title: "Formularios", subtitle: "Captación de prospectos vía link público" },
  chat: { title: "Chat AI", subtitle: "Asistente inteligente de seguros" },
  documents: { title: "Gestión de Documentos", subtitle: "Sube y gestiona documentos masivamente" },
  analytics: { title: "Reportes & Analytics", subtitle: "Métricas y rendimiento del portafolio" },
  admin: { title: "Administración", subtitle: "Gestión de usuarios y configuración" },
};

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(() => { try { return sessionStorage.getItem("excelsior-tab") || "dashboard"; } catch { return "dashboard"; } });
  const [searchQuery, setSearchQuery] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  // clientsFull: versión con todas las pólizas detalladas; se carga solo cuando se entra a Negocios
  const [clientsFull, setClientsFull] = useState<Client[]>([]);
  const [loadingFull, setLoadingFull] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [expandedNegocioId, setExpandedNegocioId] = useState<string | undefined>(undefined);
  const [alertCount, setAlertCount] = useState(0);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => { initProfilePrefs(); }, []);

  useEffect(() => {
    const savedUser = localStorage.getItem("excelsior-user");
    const savedToken = localStorage.getItem("excelsior-token");
    
    if (!savedUser || !savedToken) { setAuthLoading(false); return; }
    
    try {
      const parsed = JSON.parse(savedUser);
      // Always restore session immediately from localStorage (survives F5)
      setUser(parsed);
      // Mark session alive for tab detection
      sessionStorage.setItem("excelsior-session-alive", "1");
      // Verify token in background (don't block or logout on failure)
      fetch(N8N_AUTH, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify", token: savedToken }) })
        .then(r => r.json()).then(data => { 
          if (data.success && data.user) setUser(data.user); 
          // If verify fails, keep the local user - don't force logout on F5
        }).catch(() => {});
    } catch { }
    setAuthLoading(false);
  }, []);

  const fetchClients = async () => {
    setLoading(true); setError("");
    const token = localStorage.getItem("excelsior-token") || "";
    try { const res = await fetch(N8N_API_CLIENTS); const data = await res.json(); setClients((data.clients || []).map((c: any) => ({ ...c, polizas: c.polizas || [], total_polizas: c.total_polizas || 0 }))); }
    catch { setError("Error conectando con n8n."); }
    finally { setLoading(false); }
  };

  // Fetch con todas las pólizas detalladas. Lazy: solo cuando realmente se necesitan.
  const fetchClientsFull = async () => {
    if (clientsFull.length > 0 || loadingFull) return; // ya cargado o en curso
    setLoadingFull(true);
    try {
      const res = await fetch(N8N_API_CLIENTS + "?mode=full");
      const data = await res.json();
      setClientsFull((data.clients || []).map((c: any) => ({ ...c, polizas: c.polizas || [], total_polizas: c.total_polizas || 0 })));
    } catch {}
    finally { setLoadingFull(false); }
  };

  const fetchAlertCount = useCallback(async () => {
    const token = localStorage.getItem("excelsior-token") || "";
    try {
      const res = await fetch(N8N_API_ALERTAS);
      const data = await res.json();
      const arr = (data.alertas || []) as Array<{ urgencia?: string }>;
      const activeOnly = arr.filter((a) => a.urgencia !== "vencida").length;
      setAlertCount(activeOnly);
      // Si hay alertas pendientes (cualquier tipo), reproducir tono de aviso una sola vez por sesión
      if (arr.length > 0) maybePlayAlertSoundOnce();
    } catch {}
  }, []);

  useEffect(() => { if (user) { fetchClients(); fetchAlertCount(); const i = setInterval(fetchAlertCount, 15 * 60 * 1000); return () => clearInterval(i); } }, [user, fetchAlertCount]);

  const handleLogin = (u: User) => setUser(u);
  const handleLogout = () => { setUser(null); localStorage.removeItem("excelsior-user"); localStorage.removeItem("excelsior-token"); sessionStorage.removeItem("excelsior-tab"); sessionStorage.removeItem("excelsior-session-alive"); setActiveTab("dashboard"); };
  const handleTabChange = (tab: string) => { if (user && !ROLE_TABS[user.rol]?.includes(tab)) return; setActiveTab(tab); sessionStorage.setItem("excelsior-tab", tab); setSelectedClient(null); if (tab === "negocios" || tab === "analytics") fetchClientsFull(); };

  if (authLoading) return <div className="flex items-center justify-center h-screen" style={{ background: "var(--bg)" }}><RefreshCw size={24} className="animate-spin text-[var(--accent)]" /></div>;
  if (!user) return <LoginPage onLogin={handleLogin} />;

  const allowedTabs = ROLE_TABS[user.rol] || ROLE_TABS.gestor;
  const isCD = activeTab === "clients" && selectedClient;
  const hT = isCD ? selectedClient.nombre : TAB_INFO[activeTab]?.title || "";
  const hS = isCD ? `Cédula: ${selectedClient.cedula} • ${selectedClient.estado}` : TAB_INFO[activeTab]?.subtitle || "";

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar activeTab={activeTab} onTabChange={handleTabChange} alertCount={alertCount} onOpenAlerts={() => setAlertsOpen(true)} user={user} onLogout={handleLogout} allowedTabs={allowedTabs} onOpenSettings={() => setSettingsOpen(true)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-8 py-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--surface)]">
          <div className="flex items-center gap-3">
            {isCD && <button onClick={() => setSelectedClient(null)} className="p-2 rounded-lg hover:bg-[var(--surface-light)] text-[var(--text-muted)] hover:text-[var(--accent)]"><ArrowLeft size={18} /></button>}
            <div><h1 className="text-[22px] font-bold tracking-tight m-0">{hT}</h1><p className="text-[13px] text-[var(--text-muted)] mt-1">{hS}</p></div>
          </div>
          {(activeTab === "clients" || activeTab === "dashboard") && !isCD && (
            <div className="flex items-center gap-3">
              <button onClick={fetchClients} className="p-2.5 rounded-xl bg-[var(--surface-light)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)]"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /></button>
              <div className="flex items-center gap-2 px-4 py-2.5 bg-[var(--surface-light)] rounded-xl border border-[var(--border)] w-[280px]"><Search size={18} className="text-[var(--text-muted)]" /><input placeholder="Buscar por nombre o cédula..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="flex-1 bg-transparent border-none outline-none text-[var(--text-primary)] text-[13px] placeholder:text-[var(--text-muted)]" /></div>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-auto p-8">
          {error && <div className="mb-4 px-4 py-3 rounded-xl bg-[var(--red-glow)] border border-red-500/30 text-[var(--red)] text-sm">⚠️ {error}</div>}
          {activeTab === "dashboard" && <FileExplorer />}
          {activeTab === "clients" && !selectedClient && <ClientsTable clients={clients} searchQuery={searchQuery} loading={loading} onSelectClient={setSelectedClient} />}
          {activeTab === "clients" && selectedClient && <ClientDetail client={selectedClient} onBack={() => { setSelectedClient(null); setExpandedNegocioId(undefined); }} expandedNegocioId={expandedNegocioId} onNegocioExpanded={() => setExpandedNegocioId(undefined)} userRol={user.rol} />}
          {activeTab === "pipeline" && <PipelineBoard clients={clients} onSelectClient={(c) => { setSelectedClient(c); setActiveTab("clients"); }} />}
          {activeTab === "negocios" && <BusinessTracker clients={clientsFull.length > 0 ? clientsFull : clients} />}
          {activeTab === "formularios" && <FormulariosAdmin />}
          {activeTab === "chat" && <ChatAI />}
          {activeTab === "documents" && <DocumentsManager />}
          {activeTab === "analytics" && <Analytics clients={clientsFull.length > 0 ? clientsFull : clients} />}
          {activeTab === "admin" && <AdminPanel currentUser={{ token: user.token, rol: user.rol }} />}
        </div>
      </div>
      <NotificationsPanel isOpen={alertsOpen} onClose={() => { setAlertsOpen(false); fetchAlertCount(); }} onGestionar={(cedula, negocioId) => { setAlertsOpen(false); setExpandedNegocioId(negocioId); const c = clients.find(cl => String(cl.cedula) === String(cedula)); if (c) { setSelectedClient(c); setActiveTab("clients"); } }} />
      <ProfileSettings isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} userName={user.nombre} userRol={user.rol} userAvatar={user.avatar} />
    </div>
  );
}
