"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { Bell, X, AlertTriangle, Clock, Calendar, ChevronDown, ChevronRight, RefreshCw, CheckCircle2, Loader2, RotateCcw, CreditCard, Trash2, ArrowLeft, Send, Archive, ExternalLink } from "lucide-react";

const N8N_API_ALERTAS = "https://n8n.grupoexcelsior.co/webhook/api-alertas";
const N8N_COMPLETAR = "https://n8n.grupoexcelsior.co/webhook/completar-recordatorio";
const N8N_REPROGRAMAR = "https://n8n.grupoexcelsior.co/webhook/reprogramar-recordatorio";
const N8N_WF20 = "https://n8n.grupoexcelsior.co/webhook/guardar-negocio";

interface Alerta { id: string; cedula: string; nombre_cliente: string; descripcion: string; frecuencia: string; proximo_recordatorio: string; dias_restantes: number; urgencia: "vencida" | "hoy" | "manana" | "proxima"; negocio_id?: string; parent_id?: string; fecha_creacion?: string; activo?: boolean; }
interface HistorialAlerta { id: string; cedula: string; nombre_cliente: string; descripcion: string; frecuencia: string; proximo_recordatorio: string; negocio_id?: string; parent_id?: string; fecha_creacion?: string; activo: boolean; }
interface AlertasResponse { alertas: Alerta[]; historial: HistorialAlerta[]; total: number; resumen: { vencidas_y_hoy: number; manana: number; proximas_7_dias?: number }; }

function isAutoManaged(desc: string): boolean {
  const d = (desc || "").toLowerCase();
  return d.startsWith("cuota #") || d.startsWith("corte cuota");
}
function isPagoContado(desc: string): boolean {
  return (desc || "").toLowerCase().startsWith("pago contado");
}

// Store pending alerts globally so ClientDetail can access it.
// Persisted in localStorage so que el usuario pueda cerrar el navegador entre "Gestionar" y
// el cambio sin perder la asociación → la alerta se completará en cuanto haga cualquier cambio.
const LS_PENDING_KEY = "excelsior-pending-gestion-alerts";
function loadPending(): Map<string, Alerta> {
  if (typeof window === "undefined") return new Map();
  try {
    const raw = localStorage.getItem(LS_PENDING_KEY);
    if (!raw) return new Map();
    const obj = JSON.parse(raw) as Record<string, Alerta>;
    return new Map(Object.entries(obj));
  } catch { return new Map(); }
}
function savePending(m: Map<string, Alerta>) {
  if (typeof window === "undefined") return;
  try {
    const obj: Record<string, Alerta> = {};
    m.forEach((v, k) => { obj[k] = v; });
    localStorage.setItem(LS_PENDING_KEY, JSON.stringify(obj));
  } catch {}
}
let pendingGestionAlerts: Map<string, Alerta> = loadPending();
export function getPendingAlerts(): Map<string, Alerta> { return pendingGestionAlerts; }
export async function completeAlertAfterChange(cedula: string) {
  // Reload from localStorage in case another tab/session added entries
  pendingGestionAlerts = loadPending();
  // Complete only alerts that were marked as "Gestionar" by the user
  const toComplete: Alerta[] = [];
  pendingGestionAlerts.forEach((a, k) => {
    if (a.cedula === cedula) { toComplete.push(a); }
  });
  for (const a of toComplete) {
    try {
      await fetch(N8N_COMPLETAR, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cedula: a.cedula, descripcion: a.descripcion, id: a.id }) });
      pendingGestionAlerts.delete(`${a.id}-${a.cedula}`);
    } catch {}
  }
  savePending(pendingGestionAlerts);
}

export default function NotificationsPanel({ isOpen, onClose, onGestionar }: { isOpen: boolean; onClose: () => void; onGestionar?: (cedula: string, negocioId?: string) => void }) {
  const [data, setData] = useState<AlertasResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [reprogrammedIds, setReprogrammedIds] = useState<Map<string, string>>(new Map());
  const [gestionandoIds, setGestionandoIds] = useState<Set<string>>(new Set());
  const [archivedAlerts, setArchivedAlerts] = useState<Alerta[]>([]);
  const [reprogId, setReprogId] = useState<string | null>(null);
  const [reprogFecha, setReprogFecha] = useState("");
  const [reprogNota, setReprogNota] = useState("");
  const [view, setView] = useState<"active" | "trash">("active");
  const [filter, setFilter] = useState<"todas" | "vencida" | "hoy" | "semana" | "mes" | "manana">("todas");
  const [mesFilter, setMesFilter] = useState<string>("");
  const [rangoDesde, setRangoDesde] = useState<string>("");
  const [rangoHasta, setRangoHasta] = useState<string>("");
  const [showAdvFilters, setShowAdvFilters] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchAlertas = useCallback(async (filtros?: { fecha_desde?: string; fecha_hasta?: string }) => {
    setLoading(true); setError("");
    try {
      let url = N8N_API_ALERTAS;
      if (filtros && (filtros.fecha_desde || filtros.fecha_hasta)) {
        const params = new URLSearchParams();
        if (filtros.fecha_desde) params.set("fecha_desde", filtros.fecha_desde);
        if (filtros.fecha_hasta) params.set("fecha_hasta", filtros.fecha_hasta);
        url = `${N8N_API_ALERTAS}?${params.toString()}`;
      }
      const res = await fetch(url);
      const json = await res.json();
      setData(json); setCompletedIds(new Set()); setReprogrammedIds(new Map()); setGestionandoIds(new Set());
    }
    catch { setError("No se pudieron cargar las alertas"); }
    finally { setLoading(false); }
  }, []);

  // setView solo cuando se abre el panel
  useEffect(() => { if (isOpen) setView("active"); }, [isOpen]);

  // Re-fetch cuando cambien los filtros de fecha (mes o rango)
  useEffect(() => {
    if (!isOpen) return;
    let fecha_desde = "", fecha_hasta = "";
    if (mesFilter) {
      const [y, m] = mesFilter.split("-").map(Number);
      fecha_desde = `${mesFilter}-01`;
      const ultimoDia = new Date(y, m, 0).getDate();
      fecha_hasta = `${mesFilter}-${String(ultimoDia).padStart(2, "0")}`;
    } else if (rangoDesde || rangoHasta) {
      if (rangoDesde) fecha_desde = rangoDesde;
      if (rangoHasta) fecha_hasta = rangoHasta;
    }
    if (fecha_desde || fecha_hasta) {
      fetchAlertas({ fecha_desde, fecha_hasta });
    } else {
      fetchAlertas();
    }
  }, [mesFilter, rangoDesde, rangoHasta, isOpen, fetchAlertas]);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose(); };
    if (isOpen) setTimeout(() => document.addEventListener("mousedown", handler), 100);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen, onClose]);

  const removeFromData = (key: string) => {
    setTimeout(() => { setData(prev => { if (!prev) return prev; const f = prev.alertas.filter(a => `${a.id}-${a.cedula}` !== key); return { ...prev, alertas: f, total: f.length, resumen: { vencidas_y_hoy: f.filter(a => a.urgencia==="vencida"||a.urgencia==="hoy").length, manana: f.filter(a => a.urgencia==="manana").length }}; }); }, 1200);
  };

  const handleComplete = async (a: Alerta) => { const k=`${a.id}-${a.cedula}`; setActionInProgress(`c-${k}`); try { const r=await fetch(N8N_COMPLETAR,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cedula:a.cedula,descripcion:a.descripcion,id:a.id})}); const j=await r.json(); if(j.success){setCompletedIds(p=>new Set(p).add(k));removeFromData(k);} } catch{} finally{setActionInProgress(null);} };

  // Cambio 2: Gestionar → navegar al cliente, pero NO eliminar la alerta
  // La alerta se guarda como "pendiente" y solo se elimina cuando el usuario haga un cambio
  const handleGestionar = (a: Alerta) => {
    const k = `${a.id}-${a.cedula}`;
    // Mark as "gestionando" visually
    setGestionandoIds(prev => new Set(prev).add(k));
    // Store in global pending alerts - ClientDetail will complete these when changes are made
    pendingGestionAlerts.set(k, a);
    savePending(pendingGestionAlerts);
    // Navigate to client
    if (onGestionar) {
      onGestionar(a.cedula, a.negocio_id);
      onClose();
    }
  };

  // Cambio 3: Reprogramar siempre manual con calendario + Cambio 4: guardar en seguimientos
  const handleReprogramarManual = async (a: Alerta, fecha: string, nota: string) => {
    const k=`${a.id}-${a.cedula}`; setActionInProgress(`r-${k}`);
    try {
      const r=await fetch(N8N_REPROGRAMAR,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cedula:a.cedula,descripcion:a.descripcion,id:a.id,nueva_fecha:fecha})});
      const j=await r.json();
      if(j.success){
        setReprogrammedIds(p=>{const n=new Map(p);n.set(k,fecha);return n;});
        // Cambio 4: Guardar la reprogramación como seguimiento automáticamente
        if (nota) {
          // Prefijar con el nombre del usuario para que los demás sepan quién lo escribió
          let userName = "";
          try {
            const u = typeof window !== "undefined" ? localStorage.getItem("excelsior-user") : null;
            if (u) { const parsed = JSON.parse(u); userName = parsed.nombre || parsed.email || ""; }
          } catch {}
          const notaConAutor = userName ? `[${userName}] ${nota}` : nota;
          try {
            await fetch(`${N8N_WF20}?` + new URLSearchParams({
              action: "save_seguimiento_from_alert",
              cedula: a.cedula,
              negocio_id: a.negocio_id || "",
              nota: notaConAutor,
              fecha: new Date().toLocaleDateString("es-CO"),
              descripcion_alerta: a.descripcion
            }).toString());
          } catch {}
        }
        setTimeout(()=>{removeFromData(k);},300);
      }
    }
    catch{} finally{setActionInProgress(null);setReprogId(null);setReprogNota("");setReprogFecha("");}
  };

  const handleArchive = (a: Alerta) => {
    const k=`${a.id}-${a.cedula}`;
    setArchivedAlerts(prev => [...prev, a]);
    setData(prev => { if (!prev) return prev; const f=prev.alertas.filter(al=>`${al.id}-${al.cedula}`!==k); return {...prev,alertas:f,total:f.length,resumen:{vencidas_y_hoy:f.filter(al=>al.urgencia==="vencida"||al.urgencia==="hoy").length,manana:f.filter(al=>al.urgencia==="manana").length}}; });
    handleComplete(a);
  };

  if (!isOpen) return null;
  const urgCfg: Record<string,{label:string;color:string;bg:string;icon:React.ReactNode}> = {
    vencida:{label:"Vencida",color:"var(--red)",bg:"var(--red-glow)",icon:<AlertTriangle size={14}/>},
    hoy:{label:"Hoy",color:"var(--secondary)",bg:"var(--secondary-glow)",icon:<Clock size={14}/>},
    manana:{label:"Mañana",color:"var(--blue)",bg:"var(--blue-glow)",icon:<Calendar size={14}/>},
    proxima:{label:"Próxima",color:"var(--green)",bg:"var(--green-glow)",icon:<Calendar size={14}/>},
  };

  const vencidas = data?.alertas?.filter(a => a.urgencia === "vencida") || [];
  const activeAlertas = data?.alertas?.filter(a => a.urgencia !== "vencida") || [];

  // Apply filter
  const allActive = [...vencidas, ...activeAlertas];
  const todayStr = new Date().toISOString().split("T")[0];
  const alertaEnFecha = (a: Alerta, desde: string, hasta: string) => {
    if (!a.proximo_recordatorio) return false;
    const f = a.proximo_recordatorio.split(" ")[0];
    return (!desde || f >= desde) && (!hasta || f <= hasta);
  };
  let filteredAlertas: Alerta[];
  if (filter === "todas") {
    filteredAlertas = [...activeAlertas];
  } else if (filter === "vencida") {
    filteredAlertas = [...vencidas];
  } else if (filter === "semana") {
    const fin = new Date(); fin.setDate(fin.getDate() + 7);
    filteredAlertas = activeAlertas.filter(a => alertaEnFecha(a, todayStr, fin.toISOString().split("T")[0]));
  } else if (filter === "mes") {
    const fin = new Date(); fin.setDate(fin.getDate() + 30);
    filteredAlertas = activeAlertas.filter(a => alertaEnFecha(a, todayStr, fin.toISOString().split("T")[0]));
  } else {
    filteredAlertas = allActive.filter(a => a.urgencia === filter);
  }
  if (mesFilter) {
    const [y, m] = mesFilter.split("-").map(Number);
    const desde = `${mesFilter}-01`;
    const ultimoDia = new Date(y, m, 0).getDate();
    const hasta = `${mesFilter}-${String(ultimoDia).padStart(2, "0")}`;
    filteredAlertas = filteredAlertas.filter(a => alertaEnFecha(a, desde, hasta));
  }
  if (rangoDesde || rangoHasta) {
    filteredAlertas = filteredAlertas.filter(a => alertaEnFecha(a, rangoDesde, rangoHasta));
  }
  // Sort: most urgent first
  filteredAlertas.sort((a, b) => (a.dias_restantes ?? 0) - (b.dias_restantes ?? 0));
  // Meses únicos para el selector
  const mesesDisponibles = (() => {
    const set = new Set<string>();
    [...vencidas, ...activeAlertas].forEach(a => {
      if (a.proximo_recordatorio) {
        const ym = a.proximo_recordatorio.substring(0, 7);
        if (/^\d{4}-\d{2}$/.test(ym)) set.add(ym);
      }
    });
    return Array.from(set).sort();
  })();
  const formatMesLabel = (ym: string) => {
    try {
      const [y, m] = ym.split("-").map(Number);
      return new Date(y, m - 1, 1).toLocaleDateString("es-CO", { month: "long", year: "numeric" });
    } catch { return ym; }
  };
  const activeCount = activeAlertas.length;
  const vencidasCount = vencidas.length;

  const renderAlert = (alerta: Alerta, isTrash = false) => {
    const cfg=urgCfg[alerta.urgencia]||urgCfg.proxima; const ak=`${alerta.id}-${alerta.cedula}`; const isExp=expandedId===ak;
    const isDone=completedIds.has(ak); const repD=reprogrammedIds.get(ak); const isC=actionInProgress===`c-${ak}`; const isR=actionInProgress===`r-${ak}`; const busy=isC||isR;
    const autoM=isAutoManaged(alerta.descripcion); const contado=isPagoContado(alerta.descripcion); const isReprogOpen=reprogId===ak;
    const isGestionando = gestionandoIds.has(ak);

    // Construir estilo evitando mezclar shorthand (borderColor) con non-shorthand (borderLeftColor)
    // cuando la alerta es hija (parent_id). React warn si se mezclan en el mismo style.
    const baseBg = isTrash ? "var(--surface-light)" : isGestionando ? "rgba(200,170,50,0.08)" : cfg.bg;
    const baseBorder = isGestionando ? "rgba(200,170,50,0.4)" : `color-mix(in srgb, ${isTrash ? "var(--text-muted)" : cfg.color} 25%, transparent)`;
    const cardStyle: React.CSSProperties = alerta.parent_id
      ? { background: baseBg, borderTopColor: baseBorder, borderRightColor: baseBorder, borderBottomColor: baseBorder, borderLeftColor: "var(--blue)", opacity: isTrash ? 0.7 : 1 }
      : { background: baseBg, borderColor: baseBorder, opacity: isTrash ? 0.7 : 1 };

    if(isDone) return <div key={ak} className="p-3 rounded-xl border" style={{background:"var(--green-glow)",borderColor:"rgba(16,185,129,0.3)",animation:"fadeOutUp 0.8s ease forwards",animationDelay:"0.4s"}}><div className="flex items-center gap-3"><CheckCircle2 size={16} className="text-[var(--green)]"/><span className="text-[12px] font-medium text-[var(--green)]">¡Gestionado!</span></div></div>;
    if(repD) return <div key={ak} className="p-3 rounded-xl border" style={{background:"var(--blue-glow)",borderColor:"rgba(59,130,246,0.3)",animation:"fadeOutUp 0.8s ease forwards",animationDelay:"0.7s"}}><div className="flex items-center gap-3"><RotateCcw size={16} className="text-[var(--blue)]"/><div><span className="text-[12px] font-medium text-[var(--blue)]">Reprogramado</span><p className="text-[10px] text-[var(--text-muted)]">Nueva fecha: {repD}</p></div></div></div>;

    return (
      <div key={ak} className={`group rounded-xl border transition-all cursor-pointer ${alerta.parent_id ? "ml-3 border-l-[3px]" : ""}`} style={cardStyle} onClick={()=>setExpandedId(isExp?null:ak)}>
        <div className="flex items-start gap-3 p-3">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{background:`color-mix(in srgb, ${cfg.color} 20%, transparent)`,color:cfg.color}}>{autoM?<CreditCard size={13}/>:cfg.icon}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
              <span className="text-[12px] font-semibold" style={{color:cfg.color}}>{cfg.label}</span>
              <span className="text-[10px] text-[var(--text-muted)]">{alerta.proximo_recordatorio}</span>
              {autoM&&<span className="text-[8px] px-1 py-0.5 rounded bg-[rgba(139,92,246,0.1)] text-[var(--purple)] font-bold">AUTO</span>}
              {contado&&<span className="text-[8px] px-1 py-0.5 rounded bg-[rgba(16,185,129,0.1)] text-[var(--green)] font-bold">CONTADO</span>}
              {isGestionando&&<span className="text-[8px] px-1.5 py-0.5 rounded bg-[rgba(200,170,50,0.15)] text-[var(--accent)] font-bold">EN GESTIÓN</span>}
              {alerta.parent_id&&<span className="text-[8px] px-1.5 py-0.5 rounded bg-[rgba(59,130,246,0.1)] text-[var(--blue)] font-bold">REPROGRAMADA</span>}
            </div>
            <p className="text-[12px] text-[var(--text-primary)] font-medium line-clamp-2 leading-snug" title={alerta.descripcion}>{alerta.descripcion}</p>
            <span className="text-[10px] text-[var(--text-muted)]">{alerta.nombre_cliente||`CC ${alerta.cedula}`} • {alerta.frecuencia}</span>
          </div>
          {filter === "vencida" && !isTrash && (<button onClick={e=>{e.stopPropagation();handleArchive(alerta);}} className="p-1.5 rounded-lg hover:bg-[rgba(239,68,68,0.1)] text-[var(--text-muted)] hover:text-[var(--red)] opacity-0 group-hover:opacity-100 shrink-0" title="Archivar"><Trash2 size={13}/></button>)}
          {isExp?<ChevronDown size={13} className="text-[var(--text-muted)] mt-1.5 shrink-0"/>:<ChevronRight size={13} className="text-[var(--text-muted)] opacity-0 group-hover:opacity-100 mt-1.5 shrink-0"/>}
        </div>

        {isExp&&(<div className="px-3 pb-3 pt-0" style={{animation:"expandIn 0.2s ease"}}>
          <div className="rounded-lg p-2.5 mb-2.5" style={{background:`color-mix(in srgb, ${cfg.color} 8%, transparent)`,border:`1px solid color-mix(in srgb, ${cfg.color} 15%, transparent)`}}>
            {alerta.descripcion && alerta.descripcion.length > 60 && (
              <div className="mb-2 pb-2 border-b border-[var(--border)]">
                <span className="text-[10px] text-[var(--text-muted)] uppercase font-semibold tracking-wider">Mensaje completo</span>
                <p className="text-[11px] text-[var(--text-primary)] mt-1 leading-relaxed whitespace-pre-wrap break-words">{alerta.descripcion}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 text-[10px]"><div><span className="text-[var(--text-muted)]">Cédula</span><p className="text-[var(--text-primary)] font-medium">{alerta.cedula}</p></div><div><span className="text-[var(--text-muted)]">Cliente</span><p className="text-[var(--text-primary)] font-medium">{alerta.nombre_cliente||"—"}</p></div><div><span className="text-[var(--text-muted)]">Frecuencia</span><p className="text-[var(--text-primary)] font-medium capitalize">{alerta.frecuencia}</p></div><div><span className="text-[var(--text-muted)]">Fecha</span><p className="text-[var(--text-primary)] font-medium">{alerta.proximo_recordatorio}</p></div></div>
          </div>

          {isTrash ? <p className="text-[10px] text-[var(--text-muted)] italic text-center py-1">Archivada</p>
          : autoM ? (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-[rgba(139,92,246,0.05)] border border-[rgba(139,92,246,0.1)]">
              <CreditCard size={12} className="text-[var(--purple)] shrink-0"/>
              <p className="text-[10px] text-[var(--purple)]">Se gestiona desde el pipeline. Se resuelve al registrar el pago.</p>
            </div>
          ) : contado ? (
            <div className="space-y-2">
              {!isReprogOpen ? (
                <div className="flex gap-2">
                  <button onClick={e=>{e.stopPropagation();handleGestionar(alerta);}} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold bg-[var(--accent-glow)] text-[var(--accent)] border border-amber-500/30"><ExternalLink size={12}/>Gestionar</button>
                  <button onClick={e=>{e.stopPropagation();setReprogId(ak);setReprogFecha("");setReprogNota("");}} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold bg-[var(--blue-glow)] text-[var(--blue)] border border-blue-500/20"><RotateCcw size={12}/>Reprogramar</button>
                </div>
              ) : (
                <div className="space-y-2 p-2.5 rounded-lg bg-[var(--surface-light)] border border-[var(--border)]" onClick={e=>e.stopPropagation()}>
                  <p className="text-[11px] font-semibold text-[var(--blue)]">Reprogramar alerta</p>
                  <div><label className="text-[10px] text-[var(--text-muted)] uppercase">Nueva fecha *</label><input type="date" value={reprogFecha} onChange={e=>setReprogFecha(e.target.value)} className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[12px] outline-none mt-0.5"/></div>
                  <div><label className="text-[10px] text-[var(--text-muted)] uppercase">Observación (se guarda en seguimientos)</label><textarea value={reprogNota} onChange={e=>setReprogNota(e.target.value)} placeholder="Ej: Se contactó al cliente, queda pendiente..." className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[12px] outline-none mt-0.5 resize-none" rows={2}/></div>
                  <div className="flex gap-2">
                    <button onClick={()=>setReprogId(null)} className="flex-1 px-3 py-2 rounded-lg text-[11px] font-medium text-[var(--text-muted)] border border-[var(--border)]">Cancelar</button>
                    <button onClick={()=>{if(reprogFecha)handleReprogramarManual(alerta,reprogFecha,reprogNota);}} disabled={!reprogFecha||!!busy} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold bg-[var(--blue)] text-white disabled:opacity-50">{isR?<Loader2 size={11} className="animate-spin"/>:<Send size={11}/>}{isR?"...":"Confirmar"}</button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {!isReprogOpen ? (
                <div className="flex gap-2">
                  {/* Gestionar → navega al cliente, alerta queda pendiente */}
                  <button onClick={e=>{e.stopPropagation();handleGestionar(alerta);}} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold bg-[var(--accent-glow)] text-[var(--accent)] border border-amber-500/30"><ExternalLink size={12}/>Gestionar</button>
                  {/* Reprogramar → calendario manual */}
                  <button onClick={e=>{e.stopPropagation();setReprogId(ak);setReprogFecha("");setReprogNota("");}} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold bg-[var(--blue-glow)] text-[var(--blue)] border border-blue-500/20"><RotateCcw size={12}/>Reprogramar</button>
                </div>
              ) : (
                <div className="space-y-2 p-2.5 rounded-lg bg-[var(--surface-light)] border border-[var(--border)]" onClick={e=>e.stopPropagation()}>
                  <p className="text-[11px] font-semibold text-[var(--blue)]">Reprogramar alerta</p>
                  <div><label className="text-[10px] text-[var(--text-muted)] uppercase">Nueva fecha *</label><input type="date" value={reprogFecha} onChange={e=>setReprogFecha(e.target.value)} className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[12px] outline-none mt-0.5"/></div>
                  <div><label className="text-[10px] text-[var(--text-muted)] uppercase">Observación (se guarda en seguimientos)</label><textarea value={reprogNota} onChange={e=>setReprogNota(e.target.value)} placeholder="Ej: Se contactó al cliente, queda pendiente..." className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[12px] outline-none mt-0.5 resize-none" rows={2}/></div>
                  <div className="flex gap-2">
                    <button onClick={()=>setReprogId(null)} className="flex-1 px-3 py-2 rounded-lg text-[11px] font-medium text-[var(--text-muted)] border border-[var(--border)]">Cancelar</button>
                    <button onClick={()=>{if(reprogFecha)handleReprogramarManual(alerta,reprogFecha,reprogNota);}} disabled={!reprogFecha||!!busy} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold bg-[var(--blue)] text-white disabled:opacity-50">{isR?<Loader2 size={11} className="animate-spin"/>:<Send size={11}/>}{isR?"...":"Confirmar"}</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>)}
      </div>
    );
  };

  const headerContent = () => {
    if (view === "trash") return (
      <div className="flex items-center gap-3"><button onClick={()=>setView("active")} className="p-1.5 rounded-lg hover:bg-[var(--surface-light)] text-[var(--text-muted)]"><ArrowLeft size={16}/></button><div><h2 className="text-[15px] font-bold">Papelera</h2><p className="text-[11px] text-[var(--text-muted)]">{archivedAlerts.length} archivada{archivedAlerts.length!==1?"s":""}</p></div></div>
    );
    return (
      <div className="flex items-center gap-3"><div className="w-9 h-9 rounded-xl bg-[var(--accent-glow)] flex items-center justify-center"><Bell size={18} className="text-[var(--accent)]"/></div><div><h2 className="text-[15px] font-bold">Alertas</h2><p className="text-[11px] text-[var(--text-muted)]">{allActive.length > 0 ? `${allActive.length} alerta${allActive.length!==1?"s":""}${vencidasCount > 0 ? ` (${vencidasCount} vencida${vencidasCount!==1?"s":""})`:""}` : "Sin alertas"}</p></div></div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{background:"rgba(0,0,0,0.4)",backdropFilter:"blur(4px)"}}>
      <div ref={panelRef} className="w-[420px] max-w-full h-full bg-[var(--surface)] border-l border-[var(--border)] flex flex-col" style={{animation:"slideInRight 0.25s ease"}}>
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between shrink-0">
          {headerContent()}
          <div className="flex items-center gap-1.5">
            {view === "active" && archivedAlerts.length > 0 && (<button onClick={()=>setView("trash")} className="relative p-2 rounded-lg hover:bg-[var(--surface-light)] text-[var(--text-muted)]" title="Papelera"><Trash2 size={14}/><span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-[var(--red)] text-white text-[8px] font-bold flex items-center justify-center">{archivedAlerts.length}</span></button>)}
            {view === "active" && <button onClick={()=>fetchAlertas()} className="p-2 rounded-lg hover:bg-[var(--surface-light)] text-[var(--text-muted)]"><RefreshCw size={14} className={loading?"animate-spin":""}/></button>}
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--surface-light)] text-[var(--text-muted)]"><X size={16}/></button>
          </div>
        </div>

        {view === "active" && data && (filteredAlertas.length > 0 || vencidasCount > 0 || activeCount > 0) && (
          <div className="px-5 py-2.5 flex gap-1.5 border-b border-[var(--border)] shrink-0 overflow-x-auto">
            {(() => {
              const fSem = new Date(); fSem.setDate(fSem.getDate()+7);
              const fMes = new Date(); fMes.setDate(fMes.getDate()+30);
              const cSem = activeAlertas.filter(a => alertaEnFecha(a, todayStr, fSem.toISOString().split("T")[0])).length;
              const cMes = activeAlertas.filter(a => alertaEnFecha(a, todayStr, fMes.toISOString().split("T")[0])).length;
              return [
                {k:"todas" as const,l:"Todas",c:activeAlertas.length},
                {k:"vencida" as const,l:"Vencidas",c:vencidas.length},
                {k:"hoy" as const,l:"Hoy",c:(data?.alertas||[]).filter(a=>a.urgencia==="hoy").length},
                {k:"manana" as const,l:"Mañana",c:(data?.alertas||[]).filter(a=>a.urgencia==="manana").length},
                {k:"semana" as const,l:"Semana",c:cSem},
                {k:"mes" as const,l:"30 días",c:cMes},
              ];
            })().filter(f=>f.c>0||f.k==="todas").map(f=>(
              <button key={f.k} onClick={()=>setFilter(f.k)} className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold whitespace-nowrap transition-all ${filter===f.k?"bg-[var(--accent)] text-white":"bg-[var(--surface-light)] text-[var(--text-muted)] hover:bg-[var(--border)]"}`}>
                {f.l}{f.c>0?` (${f.c})`:""}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-auto px-5 py-4">
          {view === "active" && (<>
            {loading && !data && <div className="flex items-center justify-center py-16"><RefreshCw size={20} className="animate-spin text-[var(--text-muted)]"/></div>}
            {error && <div className="px-4 py-3 rounded-xl bg-[var(--red-glow)] border border-red-500/30 text-[var(--red)] text-sm">{error}</div>}

            {/* Botón para mostrar/ocultar filtros avanzados */}
            <div className="flex items-center justify-between mt-2 px-1">
              <button onClick={() => setShowAdvFilters(s => !s)} className="text-[10px] font-semibold text-[var(--accent)] hover:underline flex items-center gap-1">
                <Calendar size={11} /> {showAdvFilters ? "Ocultar filtros avanzados" : "Filtros avanzados"}
                {(mesFilter || rangoDesde || rangoHasta) && <span className="ml-1 px-1.5 py-0.5 rounded bg-[var(--accent)] text-white text-[9px]">activo</span>}
              </button>
              {(mesFilter || rangoDesde || rangoHasta) && (
                <button onClick={() => { setMesFilter(""); setRangoDesde(""); setRangoHasta(""); }} className="text-[10px] text-[var(--text-muted)] hover:text-[var(--red)]">Limpiar</button>
              )}
            </div>
            {showAdvFilters && (
              <div className="mt-2 mb-3 p-3 rounded-lg bg-[var(--surface-light)] border border-[var(--border)] space-y-2.5">
                <div>
                  <label className="text-[10px] font-semibold text-[var(--text-muted)] uppercase block mb-1">Mes específico</label>
                  <select value={mesFilter} onChange={e => setMesFilter(e.target.value)} className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-[12px] outline-none">
                    <option value="">— Todos los meses —</option>
                    {mesesDisponibles.map(ym => <option key={ym} value={ym}>{formatMesLabel(ym)}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-semibold text-[var(--text-muted)] uppercase block mb-1">Desde</label>
                    <input type="date" value={rangoDesde} onChange={e => setRangoDesde(e.target.value)} className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-[12px] outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-[var(--text-muted)] uppercase block mb-1">Hasta</label>
                    <input type="date" value={rangoHasta} onChange={e => setRangoHasta(e.target.value)} className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-[12px] outline-none" />
                  </div>
                </div>
              </div>
            )}

            {/* Vencidas banner when in "todas" view */}
            {filter === "todas" && vencidasCount > 0 && (
              <button onClick={() => setFilter("vencida")} className="w-full mb-4 flex items-center justify-between px-4 py-3 rounded-xl border border-red-500/20 bg-[var(--red-glow)] hover:border-red-500/40 transition-all">
                <div className="flex items-center gap-2.5"><AlertTriangle size={16} className="text-[var(--red)]"/><span className="text-[13px] font-semibold text-[var(--red)]">Vencidas</span></div>
                <div className="flex items-center gap-2"><span className="w-6 h-6 rounded-full bg-[var(--red)] text-white text-[11px] font-bold flex items-center justify-center">{vencidasCount}</span><ChevronRight size={14} className="text-[var(--red)]"/></div>
              </button>
            )}

            {data && filteredAlertas.length === 0 && filter !== "todas" && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-[13px] text-[var(--text-muted)]">No hay alertas {filter === "vencida" ? "vencidas" : filter === "hoy" ? "para hoy" : "para mañana"}</p>
                <button onClick={() => setFilter("todas")} className="mt-2 text-[12px] text-[var(--accent)] hover:underline">Ver todas</button>
              </div>
            )}

            {data && allActive.length === 0 && <div className="flex flex-col items-center justify-center py-16 text-center"><div className="w-14 h-14 rounded-2xl bg-[var(--green-glow)] flex items-center justify-center mb-4"><Bell size={24} className="text-[var(--green)]"/></div><p className="text-[14px] font-semibold">Todo al día</p></div>}

            {data && filteredAlertas.length === 0 && filter === "todas" && activeCount === 0 && vencidasCount > 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CheckCircle2 size={20} className="text-[var(--green)] mb-2"/>
                <p className="text-[13px] text-[var(--text-muted)]">Sin alertas activas. Revisa las vencidas arriba.</p>
              </div>
            )}

            {data && filteredAlertas.length > 0 && (
              <div className="space-y-2">
                {filteredAlertas.map(a => renderAlert(a))}
              </div>
            )}
          </>)}

          {view === "trash" && (archivedAlerts.length === 0 ? (<div className="flex flex-col items-center justify-center py-16 text-center"><Trash2 size={24} className="text-[var(--text-muted)] mb-3 opacity-40"/><p className="text-[13px] text-[var(--text-muted)]">Papelera vacía</p></div>) : (<div className="space-y-2">{archivedAlerts.map(a => renderAlert(a, true))}<button onClick={()=>setArchivedAlerts([])} className="w-full mt-3 px-3 py-2 rounded-lg text-[11px] font-medium text-[var(--red)] border border-red-500/20 hover:bg-[var(--red-glow)]">Vaciar papelera</button></div>))}
        </div>
      </div>
    </div>
  );
}
