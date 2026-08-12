"use client";
import { useState, useEffect } from "react";
import { LayoutDashboard, Users, MessageSquare, Upload, Briefcase, GitBranch, Bell, Sun, Moon, BarChart3, LogOut, Settings, FileText, FolderOpen, Edit3 } from "lucide-react";
import Image from "next/image";
import { getUserAvatar } from "./ProfileSettings";

const ALL_SIDEBAR_ITEMS = [
  { id: "dashboard", label: "Archivos", icon: FolderOpen },
  { id: "clients", label: "Prospectos / Clientes", icon: Users },
  { id: "pipeline", label: "Pipeline", icon: GitBranch },
  { id: "negocios", label: "Negocios", icon: Briefcase },
  // { id: "chat", label: "Chat AI", icon: MessageSquare },  // DESACTIVADO - flujo movido a manual
  { id: "documents", label: "Documentos", icon: Upload },
  { id: "analytics", label: "Reportes", icon: BarChart3 },
  { id: "formularios", label: "Formularios", icon: FileText },
  { id: "edit", label: "Editar", icon: Edit3 },
  { id: "admin", label: "Administración", icon: Settings },
];

interface User { id: string; email: string; nombre: string; rol: string; avatar: string; token: string; }

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  alertCount?: number;
  onOpenAlerts?: () => void;
  user?: User | null;
  onLogout?: () => void;
  allowedTabs?: string[];
  onOpenSettings?: () => void;
}

export default function Sidebar({ activeTab, onTabChange, alertCount = 0, onOpenAlerts, user, onLogout, allowedTabs, onOpenSettings }: SidebarProps) {
  const [customAvatar, setCustomAvatar] = useState<string>("");
  useEffect(() => {
    const refresh = () => setCustomAvatar(getUserAvatar());
    refresh();
    const onStorage = (e: StorageEvent) => { if (e.key === "excelsior-prefs") refresh(); };
    const onPrefsUpdate = () => refresh();
    window.addEventListener("storage", onStorage);
    window.addEventListener("excelsior-prefs-updated", onPrefsUpdate);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("excelsior-prefs-updated", onPrefsUpdate);
    };
  }, []);

  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const saved = localStorage.getItem("excelsior-theme") as "dark" | "light" | null;
    if (saved) { setTheme(saved); document.documentElement.setAttribute("data-theme", saved); }
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next); document.documentElement.setAttribute("data-theme", next); localStorage.setItem("excelsior-theme", next);
  };

  const sidebarItems = allowedTabs ? ALL_SIDEBAR_ITEMS.filter(item => allowedTabs.includes(item.id)) : ALL_SIDEBAR_ITEMS;
  const rolLabel: Record<string, string> = { admin: "Administrador", desarrollador: "Desarrollador", gestor: "Gestor" };

  return (
    <div className="w-[260px] bg-[var(--surface)] border-r border-[var(--border)] flex flex-col shrink-0 transition-colors duration-300">
      <div className="p-5 border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <Image src="/logo3.png" alt="Excelsior" width={40} height={40} className="rounded-xl" style={{ filter: "var(--logo-filter)" }} />
          <div>
            <div className="text-[11px] text-[var(--text-muted)] tracking-[2px] uppercase">Grupo</div>
            <div className="text-base font-bold tracking-tight">EXCELSIOR</div>
          </div>
        </div>
      </div>

      <nav className="p-3 flex-1 overflow-y-auto sidebar-scroll min-h-0">
        {sidebarItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button key={item.id} onClick={() => onTabChange(item.id)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl mb-1 text-sm font-medium transition-all border-l-[3px] ${isActive ? "bg-[var(--accent-glow)] text-[var(--accent)] border-l-[var(--accent)]" : "text-[var(--text-secondary)] border-l-transparent hover:bg-[var(--surface-light)]"}`}>
              <Icon size={20} />
              {item.label}
            </button>
          );
        })}

        {onOpenAlerts && (
          <button onClick={onOpenAlerts} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl mb-1 text-sm font-medium transition-all border-l-[3px] text-[var(--text-secondary)] border-l-transparent hover:bg-[var(--surface-light)]">
            <div className="relative">
              <Bell size={20} />
              {alertCount > 0 && <span className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-[var(--red)] text-white text-[9px] font-bold px-0.5 shadow-lg shadow-red-500/30">{alertCount > 99 ? "99+" : alertCount}</span>}
            </div>
            <span className="ml-0.5">Alertas</span>
          </button>
        )}
      </nav>

      <div className="p-3 border-t border-[var(--border)]">
        <button onClick={toggleTheme} className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl mb-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-light)] transition-all">
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          <span className="text-[13px]">{theme === "dark" ? "Modo Claro" : "Modo Oscuro"}</span>
          <div className="ml-auto w-10 h-5 rounded-full relative transition-colors duration-300" style={{ background: theme === "dark" ? "var(--border)" : "var(--accent)" }}>
            <div className="w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all duration-300 shadow" style={{ left: theme === "dark" ? "2px" : "22px" }} />
          </div>
        </button>

        <div className="flex items-center gap-3 px-4 py-3 bg-[var(--surface-light)] rounded-xl">
          <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-[var(--accent)] to-[var(--accent-dark)] flex items-center justify-center text-sm font-bold text-white overflow-hidden">
            {customAvatar ? <img src={customAvatar} alt="avatar" className="w-full h-full object-cover" /> : (user?.avatar || "N")}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold truncate">{user?.nombre || "Excelsior"}</div>
            <div className="text-[10px] text-[var(--text-muted)]">{user ? rolLabel[user.rol] || user.rol : "Admin"}</div>
          </div>
          {onOpenSettings && <button onClick={onOpenSettings} className="p-1.5 rounded-lg hover:bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors" title="Configuración"><Settings size={14} /></button>}
          {onLogout && <button onClick={onLogout} className="p-1.5 rounded-lg hover:bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--red)] transition-colors" title="Cerrar sesión"><LogOut size={14} /></button>}
        </div>
      </div>
    </div>
  );
}
