"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { completeAlertAfterChange } from "./NotificationsPanel";
import {
  ArrowLeft, Car, Heart, Home, Bike, Shield, Umbrella,
  Snowflake, Eye as EyeIcon, ClipboardCheck, Receipt, XCircle,
  Calendar, FileText, ChevronRight, Edit2, Phone, Search as SearchIcon,
  CheckCircle2, TrendingUp, ChevronDown, Briefcase, Upload,
  CreditCard, Banknote, AlertTriangle, Loader2, RefreshCw, Clock,
  UserPlus, BarChart3, FileSpreadsheet, Send, DollarSign, Plus, Trash2, Download, X} from "lucide-react";
import type { Client, Poliza } from "../page";

const WF20 = "https://n8n.grupoexcelsior.co/webhook/guardar-negocio";
function getToken() { return typeof window !== "undefined" ? localStorage.getItem("excelsior-token") || "" : ""; }
async function wf20(params: Record<string, string>, retries = 2): Promise<any> {
  params.token = getToken();
  // For save actions with large data, split: small params in URL, large in body via POST-style encoding
  const allQs = new URLSearchParams(params).toString();
  const url = `${WF20}?${allQs}`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1500 * (attempt + 1))); // wait 1.5s, 3s
        continue;
      }
      throw err;
    }
  }
}
async function uploadDoc(cedula: string, subfolder: string, files: any[], negocioFolderId?: string) {
  return fetch("https://n8n.grupoexcelsior.co/webhook/upload-documento", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cedula, subfolder, files, token: getToken(), negocio_folder_id: negocioFolderId || "" })
  });
}
async function resolveNegocioFolder(cedula: string, negocioName: string, clientFolderId?: string, renameFrom?: string): Promise<string> {
  try {
    const r = await fetch("https://n8n.grupoexcelsior.co/webhook/resolver-carpeta-negocio", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cedula, negocio_name: negocioName, client_folder_id: clientFolderId || "", parent_folder_id: clientFolderId || "", rename_from: renameFrom || "" })
    });
    const d = await r.json();
    return d.negocio_folder_id || "";
  } catch { return ""; }
}

const ASEGURADORAS_ALIADAS = ["Sura", "AXA Colpatria", "Seguros Mundial", "BMI", "Mapfre", "Positiva", "Lob&Seguros"];
const TIPOS_POLIZA_OPTIONS = ["Autos", "Vida", "Hogar", "Salud", "SOAT", "ARL", "Responsabilidad Civil", "Cumplimiento", "Transporte", "Otro"];

const POLICY_TYPES: Record<string, { icon: React.ReactNode; color: string; glow: string }> = {
  "autos": { icon: <Car size={18} />, color: "var(--blue)", glow: "var(--blue-glow)" },
  "vida": { icon: <Heart size={18} />, color: "var(--red)", glow: "var(--red-glow)" },
  "hogar": { icon: <Home size={18} />, color: "var(--green)", glow: "var(--green-glow)" },
  "motos": { icon: <Bike size={18} />, color: "var(--purple)", glow: "var(--purple-glow)" },
  "salud": { icon: <Shield size={18} />, color: "var(--cyan)", glow: "var(--cyan-glow)" },
  "soat": { icon: <Umbrella size={18} />, color: "var(--secondary)", glow: "var(--secondary-glow)" },
};
const defCfg = { icon: <FileText size={18} />, color: "var(--text-muted)", glow: "rgba(100,116,139,0.15)" };
function getPCfg(t: string) { return POLICY_TYPES[t.toLowerCase().trim()] || defCfg; }

// ═══ 7 ETAPAS DEL PIPELINE (ORDEN CORRECTO) ═══
type Stage = "contacto_inicial" | "seguimiento" | "propuesta" | "analisis_tecnico" | "emitido" | "recaudo" | "perdido";
const STAGES: { id: Stage; label: string; icon: React.ReactNode; color: string; glow: string }[] = [
  { id: "contacto_inicial", label: "Contacto Inicial", icon: <UserPlus size={16} />, color: "var(--stage-cold)", glow: "var(--stage-cold-glow)" },
  { id: "seguimiento", label: "Seguimiento", icon: <EyeIcon size={16} />, color: "var(--stage-follow)", glow: "var(--stage-follow-glow)" },
  { id: "propuesta", label: "Propuesta", icon: <FileSpreadsheet size={16} />, color: "#8b5cf6", glow: "rgba(139,92,246,0.12)" },
  { id: "analisis_tecnico", label: "Análisis Técnico", icon: <BarChart3 size={16} />, color: "#f59e0b", glow: "rgba(245,158,11,0.12)" },
  { id: "emitido", label: "Emitido / Cerrado", icon: <ClipboardCheck size={16} />, color: "var(--stage-emitted)", glow: "var(--stage-emitted-glow)" },
  { id: "recaudo", label: "Recaudo", icon: <Receipt size={16} />, color: "var(--stage-collected)", glow: "var(--stage-collected-glow)" },
  { id: "perdido", label: "Perdido", icon: <XCircle size={16} />, color: "var(--stage-lost)", glow: "var(--stage-lost-glow)" },
];

interface Cotizacion { aseguradora: string; valor: string; coberturas: string; fecha: string; archivo?: string; }

interface Deal {
  id: string; cedula: string; tipo_poliza: string; aseguradora: string; etapa: Stage;
  fecha_creacion: string; fecha_actualizacion: string; fecha_limite: string; observacion: string;
  seguimientos: { fecha: string; nota: string; alert_id?: string }[];
  caratula: string; modalidad_pago: string; fecha_limite_pago: string;
  pagado: boolean; evidencia_pago: string; cuotas_total: number; cuotas_pagadas: number;
  fecha_corte: string; fecha_perdido: string; activo: boolean;
  nit?: string; valor_cotizado?: string; promedio_prima?: string; ramo?: string; contacto_nombre?: string; contacto_tel?: string;
  cotizaciones?: Cotizacion[]; notas_analisis?: string;
  propuesta_enviada?: boolean; propuesta_archivos?: { nombre: string; fecha: string; aseguradora?: string }[]; propuesta_fecha?: string;
  condiciones_rechazadas?: { aseguradora: string; motivo: string; evidencia?: string; fecha: string }[];
  historial_cuotas?: { cuota: number; fecha_vencimiento: string; fecha_pago: string; evidencia: string }[];
  etapa_antes_perdido?: string; endoso?: string; cert_pago?: string;
  documentos_cliente?: { nombre: string; fecha: string }[];
  numero_poliza?: string; vigencia_desde?: string; vigencia_hasta?: string; prima?: string; archivo?: string;
}

function getStageIndex(s: Stage) { return s === "perdido" ? -1 : STAGES.findIndex(x => x.id === s); }
function StatusBadge({ status }: { status: string }) { const c = status === "Cliente"; return <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border ${c ? "bg-[var(--green-glow)] text-[var(--green)] border-green-500/30" : "bg-[var(--accent-glow)] text-[var(--accent)] border-[var(--accent)]/30"}`}><span className="w-2 h-2 rounded-full bg-current" />{status}</span>; }

function PipelineBar({ etapa }: { etapa: Stage }) {
  const idx = getStageIndex(etapa); const lost = etapa === "perdido"; const main = STAGES.filter(s => s.id !== "perdido");
  return (<div className="flex items-center gap-1 w-full">{main.map((s, i) => { const done = !lost && idx > i, cur = !lost && idx === i; return (<div key={s.id} className="flex items-center flex-1 gap-1"><div className={`h-2 flex-1 rounded-full transition-all duration-500 ${lost ? "bg-[var(--stage-lost-glow)]" : done || cur ? "" : "bg-[var(--surface-light)]"}`} style={{ background: lost ? undefined : done ? s.color : cur ? `linear-gradient(90deg, ${s.color}, ${s.color}50)` : undefined }} />{i < main.length - 1 && <ChevronRight size={10} className={`shrink-0 ${done ? "text-[var(--green)]" : "text-[var(--border)]"}`} />}</div>); })}{lost && <div className="ml-2 flex items-center gap-1 text-[var(--red)]"><XCircle size={12} /><span className="text-[10px] font-semibold">PERDIDO</span></div>}</div>);
}

function StageSection({ title, icon, color, glow, children }: { title: string; icon: React.ReactNode; color: string; glow: string; children: React.ReactNode }) {
  return (
    <div className="mb-5 p-4 rounded-xl" style={{ background: glow, border: `1px solid color-mix(in srgb, ${color} 20%, transparent)` }}>
      <div className="flex items-center gap-2 mb-3"><span style={{ color }}>{icon}</span><span className="text-[16px] font-semibold" style={{ color }}>{title}</span></div>
      {children}
    </div>
  );
}

// ═══ DEAL CARD ═══
function DealCard({ deal, onSave, client, onLocalUpdate }: { deal: Deal; onSave: (u: Partial<Deal> & { id: string }) => Promise<void>; client: Client; onLocalUpdate?: (u: Partial<Deal> & { id: string }) => void }) {
  const [exp, setExp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [advanceError, setAdvanceError] = useState("");
  const [editCI, setEditCI] = useState(false);
  const [ciNit, setCiNit] = useState(deal.nit || client.cedula || "");
  const [ciPromedio, setCiPromedio] = useState(deal.promedio_prima || deal.prima || "");
  const [ciRamo, setCiRamo] = useState(deal.ramo || deal.tipo_poliza || "");
  const [ciNombre, setCiNombre] = useState(deal.contacto_nombre || client.nombre || "");
  const [ciTel, setCiTel] = useState(deal.contacto_tel || client.telefono || "");
  const [newCotAseg, setNewCotAseg] = useState(""); const [newCotValor, setNewCotValor] = useState("");
  const [newCotCob, setNewCotCob] = useState(""); const [notasAnalisis, setNotasAnalisis] = useState(""); const [savingNota, setSavingNota] = useState(false);
  // Parsear historial de notas del análisis. Si es JSON array -> historial; si es string plano legacy -> 1 entrada.
  const parseNotasHistorial = (raw?: string): { autor: string; fecha: string; texto: string }[] => {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter(n => n && typeof n === "object" && n.texto);
    } catch {}
    // Legacy string plano
    return [{ autor: "", fecha: "", texto: raw }];
  };
  const notasHistorial = parseNotasHistorial(deal.notas_analisis);
  const handleGuardarNota = async () => {
    const texto = notasAnalisis.trim();
    if (!texto || savingNota) return;
    setSavingNota(true);
    try {
      let userName = "";
      try {
        const u = typeof window !== "undefined" ? localStorage.getItem("excelsior-user") : null;
        if (u) { const parsed = JSON.parse(u); userName = parsed.nombre || parsed.email || ""; }
      } catch {}
      const nueva = { autor: userName, fecha: new Date().toLocaleString("es-CO"), texto };
      const nuevoHistorial = [...notasHistorial, nueva];
      await sv({ notas_analisis: JSON.stringify(nuevoHistorial) });
      setNotasAnalisis("");
    } finally { setSavingNota(false); }
  };
  const propRef = useRef<HTMLInputElement>(null);
  const [newSegNota, setNewSegNota] = useState(""); const [newSegFecha, setNewSegFecha] = useState(new Date().toISOString().split("T")[0]);
  const [segError, setSegError] = useState("");
  const [segSuccess, setSegSuccess] = useState("");
  const [segSaving, setSegSaving] = useState(false);
  const [negAlerts, setNegAlerts] = useState<any[]>([]);
  const [negAlertHist, setNegAlertHist] = useState<any[]>([]);
  const [negAlertsLoaded, setNegAlertsLoaded] = useState(false);
  const [expandedAlertIds, setExpandedAlertIds] = useState<Set<string>>(new Set());
  const [crearAlertaVenc, setCrearAlertaVenc] = useState(true);
  const [msgAlerta, setMsgAlerta] = useState("");
  const caRef = useRef<HTMLInputElement>(null);
  const endosoRef = useRef<HTMLInputElement>(null);
  const evRef = useRef<HTMLInputElement>(null);
  const certPagoRef = useRef<HTMLInputElement>(null);
  const cuotaRef = useRef<HTMLInputElement>(null);
  const [uploadingCuota, setUploadingCuota] = useState<number | null>(null);
  // ═══ Documentos del cliente (CC, RUT, RUNT, etc) ═══
  const docsClienteRef = useRef<HTMLInputElement>(null);
  const [uploadingDocsCliente, setUploadingDocsCliente] = useState(false);
  const [deleteDocCliente, setDeleteDocCliente] = useState<{ idx: number; nombre: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ idx: number; nombre: string; aseg?: string } | null>(null);
  const [noCondAseg, setNoCondAseg] = useState<string | null>(null);
  const [noCondMotivo, setNoCondMotivo] = useState("");
  const [noCondImg, setNoCondImg] = useState<{ name: string; base64: string; mimeType: string } | null>(null);
  // ═══ Agregar/editar aseguradoras aliadas del negocio ═══
  const [editAsegOpen, setEditAsegOpen] = useState(false);
  const [editAsegSel, setEditAsegSel] = useState<string[]>([]);
  const [editAsegCustom, setEditAsegCustom] = useState("");

  const mappedEtapa: Stage = (deal.etapa === ("negocio_frio" as any)) ? "contacto_inicial" : (deal.etapa as Stage);
  const pc = getPCfg(deal.tipo_poliza); const cs = STAGES.find(s => s.id === mappedEtapa) || STAGES[0]; const idx = getStageIndex(mappedEtapa);
  const sv = async (u: Partial<Deal>) => { setSaving(true); await onSave({ id: deal.id, ...u }); setSaving(false); };
  // Get negocio folder name for Drive organization
  // Incluye tipo + aseguradoras. Cuando el usuario agrega/quita aseguradoras,
  // el nombre cambia y la carpeta en Drive se RENOMBRA (no se duplica) gracias al parámetro rename_from.
  const getNegName = () => {
    const tipo = (deal.tipo_poliza || "General").trim();
    const aseg = (deal.aseguradora || "").trim();
    return aseg ? `${tipo} - ${aseg}` : tipo;
  };
  // Construye el nombre que tenía la carpeta ANTES de un cambio de aseguradoras.
  // Se usa al guardar el cambio para que WF-28 pueda encontrar la carpeta vieja y renombrarla.
  const buildNegNameWith = (asegStr: string) => {
    const tipo = (deal.tipo_poliza || "General").trim();
    const a = (asegStr || "").trim();
    return a ? `${tipo} - ${a}` : tipo;
  };
  // Parse aseguradoras list from deal
  const asegList = (deal.aseguradora || "").split(",").map(s => s.trim()).filter(Boolean);
  const propRefByAseg = useRef<Record<string, HTMLInputElement | null>>({});

  // ═══ Abrir/guardar selector de aseguradoras aliadas ═══
  const openEditAseg = () => {
    // Pre-cargar las aseguradoras actuales en el checklist
    setEditAsegSel(asegList);
    setEditAsegCustom("");
    setEditAsegOpen(true);
  };
  const toggleEditAseg = (aseg: string) => {
    setEditAsegSel(prev => prev.includes(aseg) ? prev.filter(a => a !== aseg) : [...prev, aseg]);
  };
  const saveEditAseg = async () => {
    // Construir lista final combinando seleccionadas + custom (si viene)
    const custom = editAsegCustom.trim();
    const finalList = custom ? [...editAsegSel, custom] : [...editAsegSel];
    // Dedupe case-insensitive preservando primera ocurrencia
    const seen = new Set<string>();
    const deduped = finalList.filter(a => {
      const k = a.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const nueva = deduped.join(", ");
    setEditAsegOpen(false);
    // Si existe una carpeta en Drive con el nombre viejo, renombrarla ANTES de guardar en Supabase.
    // Ignoramos errores del rename porque puede ser que todavía no exista carpeta (negocio recién creado sin archivos).
    const oldName = buildNegNameWith(deal.aseguradora || "");
    const newName = buildNegNameWith(nueva);
    if (oldName !== newName) {
      try { await resolveNegocioFolder(deal.cedula, newName, client.folder_id, oldName); } catch {}
    }
    await sv({ aseguradora: nueva });
  };

  // ═══ Upload de documentos del cliente (múltiples archivos, carpeta Documentos) ═══
  const handleUploadDocsCliente = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploadingDocsCliente(true);
    try {
      const b64Files = await Promise.all(files.map(async f => {
        const base64 = await new Promise<string>((res) => {
          const reader = new FileReader();
          reader.onload = () => res((reader.result as string).split(",")[1]);
          reader.readAsDataURL(f);
        });
        return { name: f.name, mimeType: f.type || "application/octet-stream", base64 };
      }));
      await uploadToNeg("Documentos", b64Files);
      const fecha = new Date().toLocaleDateString("es-CO");
      const nuevos = files.map(f => ({ nombre: f.name, fecha }));
      const actuales = deal.documentos_cliente || [];
      await sv({ documentos_cliente: [...actuales, ...nuevos] });
    } catch {}
    setUploadingDocsCliente(false);
    if (docsClienteRef.current) docsClienteRef.current.value = "";
  };
  const confirmDeleteDocCliente = async () => {
    if (!deleteDocCliente) return;
    const doc = deleteDocCliente;
    setDeleteDocCliente(null);
    setSaving(true);
    const updated = (deal.documentos_cliente || []).filter((_, i) => i !== doc.idx);
    await sv({ documentos_cliente: updated });
    try {
      await fetch("https://n8n.grupoexcelsior.co/webhook/delete-drive-file", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cedula: deal.cedula, subfolder: "Documentos", negocio_name: getNegName(), fileName: doc.nombre })
      });
    } catch {}
    setSaving(false);
  };

  // Upload to negocio subfolder: resolves nested folders via WF-28, then uploads
  const uploadToNeg = async (subfolder: string, files: any[]) => {
    let parentFolderId = await resolveNegocioFolder(deal.cedula, getNegName(), client.folder_id);
    if (!parentFolderId) return;
    
    // If subfolder has nested path like "Propuestas/AXA", resolve each level
    if (subfolder.includes("/")) {
      const parts = subfolder.split("/");
      // Resolve each subfolder level using WF-28 (it creates if not exists)
      for (const part of parts) {
        const resolvedId = await resolveNegocioFolder(deal.cedula, part, parentFolderId);
        if (resolvedId) parentFolderId = resolvedId;
      }
      // Upload files directly to the resolved folder (no subfolder needed)
      return uploadDoc(deal.cedula, "", files, parentFolderId);
    }
    
    return uploadDoc(deal.cedula, subfolder, files, parentFolderId);
  };

  const advance = async () => {
    setAdvanceError("");
    const m = STAGES.filter(s => s.id !== "perdido");
    const nextIdx = idx + 1;
    if (nextIdx >= m.length) return;
    if (mappedEtapa === "seguimiento" && deal.seguimientos.length === 0) { setAdvanceError("Debes agregar al menos un seguimiento con fecha y observación antes de avanzar."); return; }
    await sv({ etapa: m[nextIdx].id });
  };

  const lose = () => sv({ etapa: "perdido", fecha_perdido: new Date().toLocaleDateString("es-CO"), etapa_antes_perdido: mappedEtapa });
  const recover = () => sv({ etapa: (deal.etapa_antes_perdido as Stage) || "contacto_inicial", fecha_perdido: "" });

  const loadNegocioAlerts = async () => {
    if (negAlertsLoaded) return;
    try {
      const r = await fetch("https://n8n.grupoexcelsior.co/webhook/api-alertas");
      const d = await r.json();
      const all = [...(d.alertas || []), ...(d.historial || [])];
      const mine = all.filter((a: any) => a.negocio_id === deal.id);
      const roots = mine.filter((a: any) => !a.parent_id);
      const children = mine.filter((a: any) => a.parent_id);
      setNegAlerts(roots);
      setNegAlertHist(children);
      setNegAlertsLoaded(true);
    } catch {}
  };

  // Auto-load alerts when card is expanded
  useEffect(() => { if (exp && !negAlertsLoaded) loadNegocioAlerts(); }, [exp]);

  const delSeg = async (s: { fecha: string; nota: string }) => {
    const restantes = deal.seguimientos.filter(x => !(x.fecha === s.fecha && x.nota === s.nota));
    onLocalUpdate?.({ id: deal.id, seguimientos: restantes });
    try {
      await fetch("/api/seguimiento/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ negocio_id: deal.id, fecha: s.fecha, nota: s.nota }),
      });
    } catch {}
    // Completar alertas pendientes de "Gestionar" para este cliente
    completeAlertAfterChange(client.cedula).catch(() => {});
  };

  const addSeg = async () => {
    if (segSaving) return; // Prevent double click
    if (!newSegFecha) { setSegError("La fecha es obligatoria"); return; }
    if (!newSegNota.trim()) { setSegError("La observación es obligatoria"); return; }
    setSegSaving(true); setSegError(""); setAdvanceError(""); setSegSuccess("");
    const fechaFormatted = new Date(newSegFecha + "T00:00:00").toLocaleDateString("es-CO");
    // Prefijar la nota con el nombre del usuario para que todos vean quién la escribió
    let userName = "";
    try {
      const u = typeof window !== "undefined" ? localStorage.getItem("excelsior-user") : null;
      if (u) { const parsed = JSON.parse(u); userName = parsed.nombre || parsed.email || ""; }
    } catch {}
    const notaConAutor = userName ? `[${userName}] ${newSegNota}` : newSegNota;
    // 1) Crear alerta de recordatorio para esta fecha
    try { await wf20({ action: "create_alert", cedula: deal.cedula, negocio_id: deal.id, descripcion: `Seguimiento ${deal.tipo_poliza}: ${newSegNota}`, fecha: newSegFecha }); } catch {}
    // 2) Guardar el seguimiento en Supabase (queda en historial visible para todos)
    try { await wf20({ action: "save_seguimiento_from_alert", cedula: deal.cedula, negocio_id: deal.id, nota: notaConAutor, fecha: fechaFormatted }); } catch {}
    // 3) Actualización optimista del estado local: agrega el seguimiento sin recargar la página
    onLocalUpdate?.({ id: deal.id, seguimientos: [...deal.seguimientos, { fecha: fechaFormatted, nota: notaConAutor }] });
    setSegSuccess(`Seguimiento agregado para ${fechaFormatted}`);
    setTimeout(() => setSegSuccess(""), 4000);
    setNewSegNota(""); setNewSegFecha(new Date().toISOString().split("T")[0]);
    setSegSaving(false);
    // Completar alertas pendientes de "Gestionar" para este cliente
    completeAlertAfterChange(client.cedula).catch(() => {});
  };

  const addCotizacion = () => {
    if (!newCotAseg.trim() || !newCotValor.trim()) return;
    sv({ cotizaciones: [...(deal.cotizaciones || []), { aseguradora: newCotAseg, valor: newCotValor, coberturas: newCotCob, fecha: new Date().toLocaleDateString("es-CO") }] });
    setNewCotAseg(""); setNewCotValor(""); setNewCotCob("");
  };

  const rok = deal.modalidad_pago === "contado" ? deal.pagado && !!deal.evidencia_pago : deal.modalidad_pago === "financiado" ? deal.cuotas_pagadas >= deal.cuotas_total : false;

  // ═══ Bloque visual reutilizable: botón + formulario para agregar aseguradoras ═══
  const renderEditAsegBlock = (label = "Agregar aseguradoras aliadas") => {
    if (mappedEtapa === "perdido") return null;
    return (
      <div className="mt-3">
        {!editAsegOpen ? (
          <button onClick={openEditAseg} className="flex items-center gap-2 px-3 py-2 rounded-xl text-[13px] font-semibold bg-[var(--accent-glow)] text-[var(--accent)] border border-[var(--accent)]/20 hover:border-[var(--accent)]/40 transition-all">
            <Plus size={14} />{label}
          </button>
        ) : (
          <div className="p-4 rounded-xl bg-[var(--surface)] border border-[var(--accent)]/30 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-semibold text-[var(--accent)] flex items-center gap-2"><Shield size={14} />Aseguradoras aliadas</p>
              <button onClick={() => setEditAsegOpen(false)} className="p-1 rounded-lg hover:bg-[var(--surface-light)] text-[var(--text-muted)]"><XCircle size={14} /></button>
            </div>
            <p className="text-[11px] text-[var(--text-muted)]">Las ya seleccionadas aparecen marcadas. Puedes agregar o quitar.</p>
            <div className="grid grid-cols-2 gap-2">
              {ASEGURADORAS_ALIADAS.map(aseg => {
                const sel = editAsegSel.some(a => a.toLowerCase() === aseg.toLowerCase());
                return (
                  <button key={aseg} type="button" onClick={() => toggleEditAseg(aseg)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-[13px] font-medium border transition-all ${
                      sel ? "bg-[var(--accent-glow)] border-[var(--accent)] text-[var(--accent)]" : "bg-[var(--surface-light)] border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)]/50"
                    }`}>
                    <div className={`w-4 h-4 rounded-md flex items-center justify-center border transition-all shrink-0 ${sel ? "bg-[var(--accent)] border-[var(--accent)]" : "border-[var(--border)]"}`}>
                      {sel && <CheckCircle2 size={10} className="text-white" />}
                    </div>
                    {aseg}
                  </button>
                );
              })}
            </div>
            <div>
              <label className="text-[11px] text-[var(--text-muted)] uppercase font-medium">Otra (opcional)</label>
              <input value={editAsegCustom} onChange={e => setEditAsegCustom(e.target.value)} placeholder="Ej: Liberty, Allianz..." className="w-full bg-[var(--surface-light)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-[13px] outline-none mt-1 focus:border-[var(--accent)]" />
            </div>
            {editAsegSel.length + (editAsegCustom.trim() ? 1 : 0) > 0 && (
              <p className="text-[11px] text-[var(--accent)]">Quedarán: {[...editAsegSel, editAsegCustom.trim()].filter(Boolean).join(", ")}</p>
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setEditAsegOpen(false)} className="flex-1 px-4 py-2.5 rounded-xl text-[12px] font-medium border border-[var(--border)] text-[var(--text-muted)]">Cancelar</button>
              <button onClick={saveEditAseg} disabled={saving || (editAsegSel.length === 0 && !editAsegCustom.trim())} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-semibold text-white disabled:opacity-50" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))" }}>
                {saving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="rounded-2xl border transition-all overflow-hidden" style={{ borderColor: `color-mix(in srgb, ${pc.color} 30%, transparent)`, background: exp ? "var(--surface-light)" : "var(--surface)" }}>
      <div className="flex items-center gap-4 p-5 cursor-pointer hover:bg-[var(--surface-hover)]" onClick={() => setExp(!exp)}>
        <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: pc.glow, color: pc.color }}>{pc.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1"><span className="text-[16px] font-semibold">{deal.tipo_poliza}</span><span className="text-[13px] text-[var(--text-muted)]">• {deal.aseguradora}</span>{deal.numero_poliza && <span className="text-[12px] text-[var(--text-muted)] font-mono">#{deal.numero_poliza}</span>}</div>
          <PipelineBar etapa={mappedEtapa} />
          {(deal.prima || deal.vigencia_desde) && <div className="flex items-center gap-3 mt-1.5 text-[12px] text-[var(--text-muted)]">{deal.prima && <span>Prima: <strong className="text-[var(--text-secondary)]">${Number(deal.prima).toLocaleString("es-CO")}</strong></span>}{deal.vigencia_desde && <span>Vigencia: {deal.vigencia_desde} → {deal.vigencia_hasta}</span>}
            {deal.vigencia_hasta && !deal.vigencia_hasta.toLowerCase().includes("terminaci") && (() => {
              let expD: Date | null = null; const vh = deal.vigencia_hasta;
              if (vh.match(/^\d{4}-\d{2}-\d{2}/)) expD = new Date(vh + "T00:00:00");
              else if (vh.match(/^\d{1,2}\/\d{1,2}\/\d{4}/)) { const p = vh.split("/"); expD = new Date(parseInt(p[2]), parseInt(p[1])-1, parseInt(p[0])); }
              if (expD && !isNaN(expD.getTime())) {
                const diff = Math.round((expD.getTime() - new Date().setHours(0,0,0,0)) / 86400000);
                if (diff <= 0) return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[var(--red-glow)] text-[var(--red)]">VENCIDA</span>;
                if (diff <= 30) return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[var(--red-glow)] text-[var(--red)]">{diff}d para renovar</span>;
                if (diff <= 60) return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[var(--secondary-glow)] text-[var(--secondary)]">{diff}d para renovar</span>;
                if (diff <= 90) return <span className="px-2 py-0.5 rounded text-[10px] font-bold" style={{background:"rgba(245,158,11,0.12)",color:"#f59e0b"}}>{diff}d para renovar</span>;
              }
              return null;
            })()}
          </div>}
        </div>
        <div className="flex items-center gap-3 shrink-0">{saving && <Loader2 size={14} className="animate-spin text-[var(--accent)]" />}<span className="px-3 py-1.5 rounded-lg text-[13px] font-semibold" style={{ background: cs.glow, color: cs.color }}>{cs.label}</span><ChevronDown size={16} className={`text-[var(--text-muted)] transition-transform ${exp ? "rotate-180" : ""}`} /></div>
      </div>

      {exp && (
        <div className="px-5 pb-5 animate-scale-in">

          {/* ═══ Respuestas del Formulario Público (si vino de un formulario) ═══ */}
          <RespuestasFormulario negocioId={deal.id} />

          {/* ═══ 1. CONTACTO INICIAL ═══ */}
          {(mappedEtapa === "contacto_inicial" || idx > 0 || mappedEtapa === "perdido") && (
            <StageSection title="Contacto Inicial" icon={<UserPlus size={16} />} color="var(--stage-cold)" glow="var(--stage-cold-glow)">
              {editCI ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-[12px] text-[var(--text-muted)] uppercase font-medium">NIT / Empresa</label><input className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 text-[15px] outline-none mt-1" value={ciNit} onChange={e => setCiNit(e.target.value)} placeholder="NIT o razón social" /></div>
                    <div><label className="text-[12px] text-[var(--text-muted)] uppercase font-medium">Contacto</label><input className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 text-[15px] outline-none mt-1" value={ciNombre} onChange={e => setCiNombre(e.target.value)} placeholder="Nombre contacto" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-[12px] text-[var(--text-muted)] uppercase font-medium">Promedio Prima</label><input className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 text-[15px] outline-none mt-1" value={ciPromedio} onChange={e => setCiPromedio(e.target.value)} placeholder="$0" /></div>
                    <div><label className="text-[12px] text-[var(--text-muted)] uppercase font-medium">Ramo</label><input className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 text-[15px] outline-none mt-1" value={ciRamo} onChange={e => setCiRamo(e.target.value)} placeholder="Ej: Vida, Autos" /></div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1"><label className="text-[12px] text-[var(--text-muted)] uppercase font-medium">Teléfono Contacto</label><input className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 text-[15px] outline-none mt-1" value={ciTel} onChange={e => setCiTel(e.target.value)} placeholder="300..." /></div>
                    <button onClick={() => { sv({ nit: ciNit, promedio_prima: ciPromedio, ramo: ciRamo, contacto_nombre: ciNombre, contacto_tel: ciTel }); setEditCI(false); }} className="self-end px-6 py-3 bg-[var(--accent)] text-white text-[14px] font-semibold rounded-xl">Guardar</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-3 text-[14px]">
                    <div><span className="text-[var(--text-muted)] text-[12px] uppercase">NIT</span><p className="text-[var(--text-secondary)] font-medium">{deal.nit || client.cedula || "—"}</p></div>
                    <div><span className="text-[var(--text-muted)] text-[12px] uppercase">Promedio Prima</span><p className="text-[var(--text-secondary)] font-medium">{deal.promedio_prima || deal.prima ? `$${deal.promedio_prima || deal.prima}` : "—"}</p></div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-[14px]">
                    <div><span className="text-[var(--text-muted)] text-[12px] uppercase">Ramo</span><p className="text-[var(--text-secondary)] font-medium">{deal.ramo || deal.tipo_poliza || "—"}</p></div>
                    <div><span className="text-[var(--text-muted)] text-[12px] uppercase">Contacto</span><p className="text-[var(--text-secondary)] font-medium">{deal.contacto_nombre || client.nombre || "—"}</p></div>
                    <div><span className="text-[var(--text-muted)] text-[12px] uppercase">Tel Contacto</span><p className="text-[var(--text-secondary)] font-medium">{deal.contacto_tel || client.telefono || "—"}</p></div>
                  </div>
                  {client.correo && <div className="text-[14px]"><span className="text-[var(--text-muted)] text-[12px] uppercase">Email</span><p className="text-[var(--text-secondary)] font-medium">{client.correo}</p></div>}
                  {/* ═══ Aseguradoras aliadas del negocio ═══ */}
                  <div className="pt-1">
                    <span className="text-[var(--text-muted)] text-[12px] uppercase">Aseguradoras aliadas</span>
                    {asegList.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {asegList.map(aseg => (
                          <span key={aseg} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-medium bg-[var(--accent-glow)] text-[var(--accent)] border border-[var(--accent)]/20">
                            <Shield size={11} />{aseg}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[13px] text-[var(--text-muted)] italic mt-1">Sin aseguradoras seleccionadas</p>
                    )}
                    {renderEditAsegBlock(asegList.length > 0 ? "Agregar o editar aseguradoras" : "Agregar aseguradoras aliadas")}
                  </div>
                  {/* ═══ Documentos del cliente (CC, RUT, RUNT, etc) - siempre visibles ═══ */}
                  <div className="pt-1">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[var(--text-muted)] text-[12px] uppercase">Documentos del cliente</span>
                      {(deal.documentos_cliente || []).length > 0 && <span className="text-[11px] text-[var(--text-muted)]">{(deal.documentos_cliente || []).length} {(deal.documentos_cliente || []).length === 1 ? "archivo" : "archivos"}</span>}
                    </div>
                    {(deal.documentos_cliente || []).length > 0 && (
                      <div className="space-y-1.5 mb-2">
                        {(deal.documentos_cliente || []).map((doc, idx) => (
                          <div key={idx} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                            <FileText size={13} className="text-[var(--accent)] shrink-0" />
                            <span className="text-[13px] text-[var(--text-secondary)] flex-1 truncate">{doc.nombre}</span>
                            <span className="text-[11px] text-[var(--text-muted)] shrink-0">{doc.fecha}</span>
                            {mappedEtapa !== "perdido" && (
                              <button onClick={() => setDeleteDocCliente({ idx, nombre: doc.nombre })} className="p-1 rounded hover:bg-[var(--red-glow)] text-[var(--text-muted)] hover:text-[var(--red)]"><Trash2 size={12} /></button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {mappedEtapa !== "perdido" && (
                      <>
                        <button onClick={() => docsClienteRef.current?.click()} disabled={uploadingDocsCliente} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] text-[13px] font-medium disabled:opacity-60">
                          {uploadingDocsCliente ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                          {uploadingDocsCliente ? "Subiendo..." : "Subir documentos"}
                        </button>
                        <input ref={docsClienteRef} type="file" multiple className="hidden" onChange={handleUploadDocsCliente} />
                      </>
                    )}
                  </div>
                  {deleteDocCliente && (
                    <div className="p-3 rounded-xl bg-[var(--red-glow)] border border-[var(--red)]/30 space-y-2">
                      <p className="text-[13px] text-[var(--red)]">¿Eliminar "{deleteDocCliente.nombre}"? Se borrará del Drive.</p>
                      <div className="flex gap-2">
                        <button onClick={() => setDeleteDocCliente(null)} className="flex-1 px-3 py-2 rounded-lg text-[12px] font-medium border border-[var(--border)] text-[var(--text-muted)]">Cancelar</button>
                        <button onClick={confirmDeleteDocCliente} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold bg-[var(--red)] text-white"><Trash2 size={12} />Eliminar</button>
                      </div>
                    </div>
                  )}
                  {mappedEtapa !== "perdido" && <button onClick={() => { setCiNit(deal.nit || client.cedula || ""); setCiPromedio(deal.promedio_prima || deal.prima || ""); setCiRamo(deal.ramo || deal.tipo_poliza || ""); setCiNombre(deal.contacto_nombre || client.nombre || ""); setCiTel(deal.contacto_tel || client.telefono || ""); setEditCI(true); }} className="mt-2 flex items-center gap-2 text-[13px] text-[var(--accent)] hover:underline"><Edit2 size={14} />Editar información</button>}
                </div>
              )}
            </StageSection>
          )}

          {/* ═══ 2. SEGUIMIENTO (idx=1) ═══ */}
          {(mappedEtapa === "seguimiento" || idx > 1 || mappedEtapa === "perdido") && (
            <StageSection title="Seguimiento" icon={<EyeIcon size={16} />} color="var(--stage-follow)" glow="var(--stage-follow-glow)">
              <div className="space-y-2 mb-3 max-h-[300px] overflow-y-auto">{deal.seguimientos.length === 0 ? <p className="text-[14px] text-[var(--text-muted)] italic py-2">Sin seguimientos — debes agregar al menos uno para avanzar</p> : [...deal.seguimientos].reverse().map((s, i) => (
                <div key={i} className="group flex items-start gap-3 bg-[var(--surface)] rounded-xl px-4 py-3 border border-[var(--border)]"><Calendar size={14} className="text-[var(--stage-follow)] mt-0.5 shrink-0" /><div className="flex-1 min-w-0"><span className="text-[12px] font-semibold text-[var(--stage-follow)]">{s.fecha}</span><p className="text-[14px] text-[var(--text-secondary)] mt-0.5 break-words">{s.nota}</p></div>{mappedEtapa !== "perdido" && <button onClick={() => delSeg(s)} className="shrink-0 p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--red)] hover:bg-[var(--red-glow)] opacity-60 hover:opacity-100 transition-all" title="Eliminar seguimiento"><X size={14} /></button>}</div>
              ))}</div>
              {mappedEtapa !== "perdido" && (<div className="space-y-2"><div className="grid grid-cols-[1fr_140px_auto] gap-3"><div><label className="text-[12px] text-[var(--text-muted)] uppercase font-medium">Observación *</label><input className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 text-[14px] outline-none mt-1" value={newSegNota} onChange={e => { setNewSegNota(e.target.value); setSegError(""); setSegSuccess(""); }} placeholder="Ej: Se contactó al cliente..." onKeyDown={e => e.key === "Enter" && addSeg()} /></div><div><label className="text-[12px] text-[var(--text-muted)] uppercase font-medium">Fecha *</label><input type="date" className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl px-3 py-3 text-[14px] outline-none mt-1" value={newSegFecha} onChange={e => { setNewSegFecha(e.target.value); setSegError(""); }} /></div><button onClick={addSeg} disabled={segSaving} className="self-end px-5 py-3 bg-[var(--stage-follow)] text-[var(--bg)] text-[14px] font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed">{segSaving ? "Guardando..." : "Agregar"}</button></div>{segError && <div className="flex items-center gap-2 text-[var(--red)] text-[13px] font-medium"><AlertTriangle size={14} />{segError}</div>}{segSuccess && <div className="flex items-center gap-2 text-[var(--green)] text-[13px] font-medium bg-[var(--green-glow)] px-3 py-2 rounded-lg border border-green-500/20 animate-scale-in"><CheckCircle2 size={14} />{segSuccess}</div>}</div>)}
            </StageSection>
          )}

          {/* ═══ 3. PROPUESTA (idx=2) ═══ */}
          {(mappedEtapa === "propuesta" || idx > 2 || mappedEtapa === "perdido") && (
            <StageSection title="Elaboración de Propuesta" icon={<FileSpreadsheet size={16} />} color="#8b5cf6" glow="rgba(139,92,246,0.12)">
              <p className="text-[13px] text-[var(--text-muted)] mb-3">Sube las cotizaciones por cada aseguradora. La IA extraerá automáticamente los datos para Análisis Técnico.</p>
              {/* ═══ Botón para agregar aseguradoras (también disponible aquí) ═══ */}
              {renderEditAsegBlock("Agregar otra aseguradora")}
              <div className="space-y-3 mt-3">
                {asegList.map((aseg) => {
                  const archivos = (deal.propuesta_archivos || []).filter(a => a.aseguradora === aseg);
                  const archivosLegacy = (deal.propuesta_archivos || []).filter(a => !a.aseguradora);
                  const rechazada = (deal.condiciones_rechazadas || []).find(c => c.aseguradora === aseg);
                  const isNoCondOpen = noCondAseg === aseg;
                  return (
                    <div key={aseg} className={`rounded-xl border overflow-hidden ${rechazada ? "border-red-500/30 bg-[var(--red-glow)]" : "border-[var(--border)] bg-[var(--surface)]"}`}>
                      {/* Header */}
                      <div className={`px-4 py-2.5 flex items-center gap-2 ${rechazada ? "bg-[rgba(239,68,68,0.08)]" : "bg-[rgba(139,92,246,0.06)]"}`}>
                        <Shield size={14} className={rechazada ? "text-[var(--red)]" : "text-[#8b5cf6]"} />
                        <span className={`text-[13px] font-semibold flex-1 ${rechazada ? "text-[var(--red)]" : "text-[var(--text-primary)]"}`}>{aseg}</span>
                        {rechazada && <span className="text-[8px] px-1.5 py-0.5 rounded bg-[rgba(239,68,68,0.15)] text-[var(--red)] font-bold">NO PRESENTA</span>}
                        {archivos.length > 0 && !rechazada && <span className="text-[8px] px-1.5 py-0.5 rounded bg-[var(--green-glow)] text-[var(--green)] font-bold">{archivos.length} doc{archivos.length > 1 ? "s" : ""}</span>}
                      </div>
                      <div className="px-4 py-3">
                        {rechazada ? (
                          <div className="space-y-2">
                            <p className="text-[12px] text-[var(--red)]"><span className="font-semibold">Motivo:</span> {rechazada.motivo}</p>
                            {rechazada.evidencia && <p className="text-[11px] text-[var(--text-muted)]">Evidencia: {rechazada.evidencia}</p>}
                            <p className="text-[10px] text-[var(--text-muted)]">{rechazada.fecha}</p>
                            {mappedEtapa !== "perdido" && <button onClick={() => { const updated = (deal.condiciones_rechazadas || []).filter(c => c.aseguradora !== aseg); sv({ condiciones_rechazadas: updated }); }} className="text-[11px] text-[var(--accent)] hover:underline">Revertir</button>}
                          </div>
                        ) : (
                          <>
                            {/* Archivos subidos */}
                            {archivos.length > 0 && (<div className="space-y-1.5 mb-2">{archivos.map((arch, ai) => {
                              const globalIdx = (deal.propuesta_archivos || []).findIndex(a => a.nombre === arch.nombre && a.aseguradora === aseg);
                              return (
                                <div key={ai} className="flex items-center gap-2 p-2 bg-[var(--green-glow)] rounded-lg border border-green-500/20">
                                  <FileText size={13} className="text-[var(--green)] shrink-0" />
                                  <span className="text-[12px] text-[var(--green)] font-medium flex-1 truncate">{arch.nombre}</span>
                                  <span className="text-[10px] text-[var(--text-muted)]">{arch.fecha}</span>
                                  {mappedEtapa !== "perdido" && <button onClick={() => setDeleteConfirm({ idx: globalIdx, nombre: arch.nombre, aseg })} className="p-0.5 rounded hover:bg-[rgba(239,68,68,0.15)] text-[var(--text-muted)] hover:text-[var(--red)]"><Trash2 size={11} /></button>}
                                </div>
                              );
                            })}</div>)}
                            {/* Upload + No presenta */}
                            {mappedEtapa !== "perdido" && !isNoCondOpen && (
                              <div className="flex gap-2">
                                <button onClick={() => propRefByAseg.current[aseg]?.click()} className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 border-dashed border-[var(--border)] text-[var(--text-muted)] hover:border-[#8b5cf6] text-[13px]"><Upload size={14} />{archivos.length > 0 ? "Agregar" : "Subir cotización"}</button>
                                <button onClick={() => { setNoCondAseg(aseg); setNoCondMotivo(""); setNoCondImg(null); }} className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-[11px] font-semibold bg-[var(--red-glow)] text-[var(--red)] border border-red-500/20 hover:border-red-500/40 whitespace-nowrap"><XCircle size={12} />No presenta</button>
                              </div>
                            )}
                            {/* No presenta condiciones form */}
                            {isNoCondOpen && (
                              <div className="space-y-2 p-3 rounded-xl bg-[var(--surface-light)] border border-red-500/20" onClick={e => e.stopPropagation()}>
                                <p className="text-[12px] font-semibold text-[var(--red)]">No presenta condiciones — {aseg}</p>
                                <div><label className="text-[10px] text-[var(--text-muted)] uppercase">Motivo *</label><textarea value={noCondMotivo} onChange={e => setNoCondMotivo(e.target.value)} placeholder="Explique por qué no presenta condiciones..." className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[12px] outline-none mt-0.5 resize-none" rows={2} /></div>
                                <div><label className="text-[10px] text-[var(--text-muted)] uppercase">Evidencia (pegar con Ctrl+V o subir)</label>
                                  <div className="mt-0.5 relative" onPaste={async (e) => {
                                    const items = e.clipboardData?.items;
                                    if (!items) return;
                                    for (const item of Array.from(items)) {
                                      if (item.type.startsWith("image/")) {
                                        const file = item.getAsFile();
                                        if (!file) continue;
                                        const base64 = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res((r.result as string).split(",")[1]); r.readAsDataURL(file); });
                                        setNoCondImg({ name: `evidencia_${aseg.replace(/\s+/g, "_")}_${Date.now()}.png`, base64, mimeType: file.type });
                                      }
                                    }
                                  }}>
                                    {noCondImg ? (
                                      <div className="flex items-center gap-2 p-2 bg-[var(--green-glow)] rounded-lg border border-green-500/20">
                                        <FileText size={12} className="text-[var(--green)]" /><span className="text-[11px] text-[var(--green)] flex-1 truncate">{noCondImg.name}</span>
                                        <button onClick={() => setNoCondImg(null)} className="text-[var(--red)] text-[10px]">✕</button>
                                      </div>
                                    ) : (
                                      <div className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-lg border-2 border-dashed border-[var(--border)] text-[var(--text-muted)] text-[11px] cursor-pointer hover:border-red-500/30" onClick={() => { const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*"; inp.onchange = async () => { const f = inp.files?.[0]; if (!f) return; const b = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res((r.result as string).split(",")[1]); r.readAsDataURL(f); }); setNoCondImg({ name: f.name, base64: b, mimeType: f.type }); }; inp.click(); }}>
                                        Ctrl+V para pegar imagen o click para subir
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={() => setNoCondAseg(null)} className="flex-1 px-3 py-2 rounded-lg text-[11px] font-medium text-[var(--text-muted)] border border-[var(--border)]">Cancelar</button>
                                  <button onClick={async () => {
                                    if (!noCondMotivo.trim()) return;
                                    setSaving(true);
                                    const now = new Date().toLocaleDateString("es-CO");
                                    let evidName = "";
                                    if (noCondImg) {
                                      try { await uploadToNeg(`Propuestas/${aseg}`, [{ name: noCondImg.name, mimeType: noCondImg.mimeType, base64: noCondImg.base64 }]); evidName = noCondImg.name; } catch {}
                                    }
                                    const updated = [...(deal.condiciones_rechazadas || []), { aseguradora: aseg, motivo: noCondMotivo, evidencia: evidName, fecha: now }];
                                    await sv({ condiciones_rechazadas: updated });
                                    setNoCondAseg(null); setNoCondMotivo(""); setNoCondImg(null); setSaving(false);
                                  }} disabled={!noCondMotivo.trim() || saving} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold bg-[var(--red)] text-white disabled:opacity-50">{saving ? <Loader2 size={11} className="animate-spin" /> : <XCircle size={11} />}Confirmar</button>
                                </div>
                              </div>
                            )}
                            {/* Hidden file input per aseguradora */}
                            <input ref={el => { propRefByAseg.current[aseg] = el; }} type="file" multiple className="hidden" onChange={async e => {
                              const files = e.target.files;
                              if (!files || files.length === 0) return;
                              setSaving(true);
                              const existingArchivos = [...(deal.propuesta_archivos || [])];
                              const existingCots = [...(deal.cotizaciones || [])];
                              const now = new Date().toLocaleDateString("es-CO");
                              const b64Files: { name: string; mimeType: string; base64: string }[] = [];
                              for (let i = 0; i < files.length; i++) {
                                const f = files[i];
                                const base64 = await new Promise<string>((res) => { const reader = new FileReader(); reader.onload = () => res((reader.result as string).split(",")[1]); reader.readAsDataURL(f); });
                                b64Files.push({ name: f.name, mimeType: f.type || "application/octet-stream", base64 });
                                existingArchivos.push({ nombre: f.name, fecha: now, aseguradora: aseg });
                                // Only analyze with AI if it's a document (not an image evidence)
                                if (!f.type.startsWith("image/")) {
                                  try {
                                    const aiResp = await fetch("https://n8n.grupoexcelsior.co/webhook/analizar-propuesta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ base64, mimeType: f.type || "application/pdf", fileName: f.name, token: getToken() }) });
                                    const aiData = await aiResp.json();
                                    if (aiData.success && aiData.cotizaciones && aiData.cotizaciones.length > 0) {
                                      for (const cot of aiData.cotizaciones) {
                                        if (cot.aseguradora) existingCots.push({ aseguradora: cot.aseguradora, valor: cot.valor || "", coberturas: cot.coberturas || "", fecha: now, archivo: f.name });
                                      }
                                    }
                                  } catch {}
                                }
                                if (i < files.length - 1) await new Promise(r => setTimeout(r, 1000));
                              }
                              try { await uploadToNeg(`Propuestas/${aseg}`, b64Files); } catch {}
                              await new Promise(r => setTimeout(r, 500));
                              await sv({ propuesta_archivos: existingArchivos, propuesta_fecha: now, cotizaciones: existingCots });
                              setSaving(false);
                              if (propRefByAseg.current[aseg]) propRefByAseg.current[aseg]!.value = "";
                            }} />
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Legacy files without aseguradora */}
              {(deal.propuesta_archivos || []).filter(a => !a.aseguradora).length > 0 && (
                <div className="mt-3 space-y-1.5"><p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase">Documentos anteriores</p>{(deal.propuesta_archivos || []).filter(a => !a.aseguradora).map((arch, i) => { const globalIdx = (deal.propuesta_archivos || []).indexOf(arch); return (<div key={i} className="flex items-center gap-2 p-2 bg-[var(--green-glow)] rounded-lg border border-green-500/20"><FileText size={13} className="text-[var(--green)]" /><span className="text-[12px] text-[var(--green)] font-medium flex-1 truncate">{arch.nombre}</span><span className="text-[10px] text-[var(--text-muted)]">{arch.fecha}</span>{mappedEtapa !== "perdido" && <button onClick={() => setDeleteConfirm({ idx: globalIdx, nombre: arch.nombre })} className="p-0.5 rounded hover:bg-[rgba(239,68,68,0.15)] text-[var(--text-muted)] hover:text-[var(--red)]"><Trash2 size={11} /></button>}</div>); })}</div>
              )}
              {saving && <div className="flex items-center gap-2 text-[13px] text-[#8b5cf6] mt-2"><Loader2 size={14} className="animate-spin" />Analizando documentos con IA...</div>}
              {!deal.propuesta_enviada && (deal.propuesta_archivos || []).length > 0 && mappedEtapa !== "perdido" && (<button onClick={() => sv({ propuesta_enviada: true, propuesta_fecha: new Date().toLocaleDateString("es-CO") })} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#8b5cf6] text-white text-[14px] font-semibold mt-3"><Send size={16} />Marcar propuesta como enviada</button>)}
              {deal.propuesta_enviada && (<div className="flex items-center gap-2 p-2.5 bg-[var(--green-glow)] rounded-lg border border-green-500/20 mt-3"><Send size={14} className="text-[var(--green)]" /><span className="text-[13px] text-[var(--green)] font-semibold">Propuesta enviada</span>{deal.propuesta_fecha && <span className="text-[11px] text-[var(--text-muted)]">{deal.propuesta_fecha}</span>}</div>)}
              {(deal.propuesta_archivos || []).length === 0 && !deal.propuesta_enviada && mappedEtapa === "perdido" && (<p className="text-[14px] text-[var(--text-muted)] italic">Pendiente</p>)}
            </StageSection>
          )}

          {/* ═══ 4. ANÁLISIS TÉCNICO (idx=3) ═══ */}
          {(mappedEtapa === "analisis_tecnico" || idx > 3 || mappedEtapa === "perdido") && (
            <StageSection title="Análisis Técnico" icon={<BarChart3 size={16} />} color="#f59e0b" glow="rgba(245,158,11,0.12)">
              <p className="text-[13px] text-[var(--text-muted)] mb-3">Cotizaciones extraídas automáticamente por IA. Verifica y ajusta si es necesario.</p>
              <div className="space-y-2 mb-3 max-h-[200px] overflow-y-auto">
                {(deal.cotizaciones || []).length === 0 ? <p className="text-[14px] text-[var(--text-muted)] italic py-2">Sin cotizaciones registradas</p> : (deal.cotizaciones || []).map((c, i) => (<div key={i} className="flex items-center gap-3 bg-[var(--surface)] rounded-xl px-4 py-3 border border-[var(--border)]"><DollarSign size={14} className="text-[#f59e0b] shrink-0" /><div className="flex-1"><span className="text-[13px] font-semibold">{c.aseguradora}</span><span className="text-[12px] text-[var(--text-muted)] ml-2">{/^\$|COP|USD|EUR|US\$|€/.test(c.valor || "") ? c.valor : `$ ${c.valor}`}</span>{c.coberturas && <p className="text-[12px] text-[var(--text-muted)]">{c.coberturas}</p>}</div><span className="text-[11px] text-[var(--text-muted)]">{c.fecha}</span></div>))}
              </div>
              {mappedEtapa !== "perdido" && (
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
                  {/* Columna izquierda: agregar cotización */}
                  <div className="space-y-2">
                    <div className="grid grid-cols-[1fr_120px_1fr_auto] gap-2">
                      <input className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-3 py-3 text-[14px] outline-none" value={newCotAseg} onChange={e => setNewCotAseg(e.target.value)} placeholder="Aseguradora" />
                      <input className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-3 py-3 text-[14px] outline-none" value={newCotValor} onChange={e => setNewCotValor(e.target.value)} placeholder="$ Valor" />
                      <input className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-3 py-3 text-[14px] outline-none" value={newCotCob} onChange={e => setNewCotCob(e.target.value)} placeholder="Coberturas" />
                      <button onClick={addCotizacion} className="px-4 py-3 bg-[#f59e0b] text-white text-[14px] font-semibold rounded-xl">+</button>
                    </div>
                  </div>
                  {/* Columna derecha: notas con historial */}
                  <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 flex flex-col">
                    <label className="text-[12px] text-[var(--text-muted)] uppercase font-medium mb-2 flex items-center gap-1.5">
                      <BarChart3 size={12} className="text-[#f59e0b]" />
                      Notas del Análisis
                    </label>
                    {/* Historial */}
                    <div className="flex-1 space-y-2 mb-3 max-h-[180px] overflow-y-auto pr-1">
                      {notasHistorial.length === 0 ? (
                        <p className="text-[12px] text-[var(--text-muted)] italic">Sin notas registradas aún</p>
                      ) : notasHistorial.map((n, i) => (
                        <div key={i} className="bg-[var(--surface-light)] border border-[var(--border)] rounded-lg px-3 py-2">
                          <div className="flex items-center gap-2 mb-1 text-[10px] text-[var(--text-muted)]">
                            {n.autor && <span className="font-semibold text-[#f59e0b]">[{n.autor}]</span>}
                            {n.fecha && <span>· {n.fecha}</span>}
                          </div>
                          <p className="text-[12px] whitespace-pre-wrap break-words">{n.texto}</p>
                        </div>
                      ))}
                    </div>
                    {/* Campo de entrada + botón guardar */}
                    <textarea
                      className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13px] outline-none resize-none mb-2"
                      rows={2}
                      value={notasAnalisis}
                      onChange={e => setNotasAnalisis(e.target.value)}
                      placeholder="Escribe una nota..."
                    />
                    <button
                      onClick={handleGuardarNota}
                      disabled={!notasAnalisis.trim() || savingNota}
                      className="px-3 py-2 bg-[#f59e0b] text-white text-[12px] font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {savingNota ? "Guardando..." : "Guardar nota"}
                    </button>
                  </div>
                </div>
              )}
              {/* Generar Cuadro Comparativo */}
              {(deal.cotizaciones || []).length >= 2 && (
                <button onClick={async () => {
                  setSaving(true);
                  try {
                    // @ts-ignore
                    const { jsPDF } = await import("jspdf");
                    // @ts-ignore
                    const autoTable = (await import("jspdf-autotable")).default;
                    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });
                    const pw = doc.internal.pageSize.getWidth();
                    const ph = doc.internal.pageSize.getHeight();
                    const cots = deal.cotizaciones || [];
                    const M = 14; const HH = 38; const FH = 20;

                    const drawHeader = () => {
                      doc.setFillColor(0, 62, 107); doc.rect(0, 0, pw, HH, "F");
                      doc.setFillColor(0, 140, 190); doc.triangle(pw * 0.55, 0, pw, 0, pw, HH, "F");
                      doc.setFillColor(0, 110, 160); doc.triangle(pw * 0.7, 0, pw, 0, pw, 22, "F");
                      doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(28);
                      doc.text("EXCELSIOR", 20, 21);
                      doc.setFontSize(7); doc.setFont("helvetica", "normal");
                      doc.text("AGENCIA DE SEGUROS Y RIESGOS LABORALES", 20, 29);
                    };
                    const drawFooter = () => {
                      doc.setFillColor(0, 62, 107); doc.rect(0, ph - FH, pw, FH, "F");
                      doc.setFillColor(0, 140, 190); doc.triangle(0, ph - FH, 90, ph - FH, 0, ph, "F");
                      doc.setFillColor(0, 110, 160); doc.triangle(0, ph - FH, 50, ph - FH, 0, ph - 8, "F");
                      doc.setTextColor(255, 255, 255); doc.setFontSize(7); doc.setFont("helvetica", "normal");
                      doc.text("Dirección: Avenida 26 con Carrera 5 Local 106 — Antiguo aeropuerto | Cel: 3150733399", pw / 2, ph - 12, { align: "center" });
                      doc.text("Email: gerencia@grupoexcelsior.co  |  www.excelsiorseguros.com", pw / 2, ph - 6, { align: "center" });
                    };

                    drawHeader();
                    doc.setTextColor(0, 0, 0); doc.setFont("helvetica", "bold"); doc.setFontSize(18);
                    doc.text(`COMPARATIVO— ${(deal.tipo_poliza || "PÓLIZA").toUpperCase()}`, pw / 2, HH + 14, { align: "center" });

                    // === BUILD COMPARISON TABLE ===
                    const headers = ["Aspecto", ...cots.map(c => c.aseguradora || "Aseguradora")];
                    const tableRows: string[][] = [];

                    // 1. Prima
                    tableRows.push(["Prima total (con IVA y gastos)", ...cots.map(c => c.valor || "—")]);

                    // 2. Parse coberturas by ; and : into comparable rows
                    const allKeys: string[] = [];
                    const kvMaps: Record<string, string>[] = cots.map(c => {
                      const map: Record<string, string> = {};
                      (c.coberturas || "").split(";").map(s => s.trim()).filter(Boolean).forEach(item => {
                        const ci = item.indexOf(":");
                        if (ci > 0) {
                          const k = item.substring(0, ci).trim();
                          if (!allKeys.includes(k)) allKeys.push(k);
                          map[k] = item.substring(ci + 1).trim();
                        } else {
                          if (!allKeys.includes(item)) allKeys.push(item);
                          map[item] = "Sí ampara";
                        }
                      });
                      return map;
                    });

                    // Add each cobertura as a row — side by side comparison
                    if (allKeys.length > 0) {
                      allKeys.forEach(key => {
                        tableRows.push([key, ...kvMaps.map(m => m[key] || "—")]);
                      });
                    } else {
                      // Fallback: show raw coberturas text
                      tableRows.push(["Coberturas", ...cots.map(c => c.coberturas || "—")]);
                    }

                    // === DRAW TABLE ===
                    autoTable(doc, {
                      startY: HH + 20,
                      head: [headers],
                      body: tableRows,
                      theme: "grid",
                      headStyles: { fillColor: [0, 62, 107], textColor: 255, fontSize: 9, fontStyle: "bold", halign: "center", cellPadding: 4 },
                      bodyStyles: { fontSize: 8.5, cellPadding: 3.5, lineColor: [180, 180, 180], lineWidth: 0.2, textColor: [30, 30, 30] },
                      columnStyles: { 0: { fontStyle: "bold", cellWidth: 60, fillColor: [230, 238, 248] } },
                      alternateRowStyles: { fillColor: [245, 248, 252] },
                      margin: { left: M, right: M, top: HH + 8, bottom: FH + 10 },
                      styles: { overflow: "linebreak", font: "helvetica" },
                      didDrawPage: () => { drawHeader(); drawFooter(); },
                    });

                    // === CONCLUSION ===
                    // @ts-ignore
                    let curY = doc.lastAutoTable?.finalY || 140;
                    // Reconstruir notas del análisis — puede ser JSON array (nuevo) o string plano (legacy)
                    let notasTexto = "";
                    if (deal.notas_analisis) {
                      try {
                        const parsed = JSON.parse(deal.notas_analisis);
                        if (Array.isArray(parsed)) {
                          notasTexto = parsed.map((n: any) => {
                            const hdr = [n.autor ? `[${n.autor}]` : "", n.fecha || ""].filter(Boolean).join(" · ");
                            return hdr ? `${hdr}\n${n.texto || ""}` : (n.texto || "");
                          }).filter(Boolean).join("\n\n");
                        } else {
                          notasTexto = deal.notas_analisis;
                        }
                      } catch {
                        notasTexto = deal.notas_analisis;
                      }
                    }
                    if (notasTexto) {
                      if (curY > ph - FH - 45) { doc.addPage(); drawHeader(); drawFooter(); curY = HH + 10; }
                      curY += 8;
                      doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(0, 0, 0);
                      doc.text("Conclusión estratégica", M, curY); curY += 8;
                      doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(40, 40, 40);
                      const notes = doc.splitTextToSize(notasTexto, pw - M * 2);
                      doc.text(notes, M, curY);
                    }

                    doc.setTextColor(170, 170, 170); doc.setFontSize(6.5);
                    doc.text(`Documento generado — ${new Date().toLocaleDateString("es-CO")}`, pw - M, ph - FH - 4, { align: "right" });

                    const fileName = `Comparativo_${(deal.tipo_poliza || "poliza").replace(/\s+/g, "_")}_${client.cedula}.pdf`;
                    doc.save(fileName);
                    const pdfBase64 = doc.output("datauristring").split(",")[1];
                    try { await uploadToNeg("Comparativos", [{ name: fileName, mimeType: "application/pdf", base64: pdfBase64 }]); } catch {}

                  } catch (err) { console.error("Error generating PDF:", err); }
                  finally { setSaving(false); }
                }} disabled={saving} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[14px] font-semibold bg-gradient-to-r from-[#f59e0b] to-[#d97706] text-white mt-3 disabled:opacity-50">
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                  {saving ? "Generando..." : "Generar Cuadro Comparativo PDF"}
                </button>
              )}
            </StageSection>
          )}

          {/* ═══ 5. EMITIDO (idx=4) ═══ */}
          {(mappedEtapa === "emitido" || idx >= 4 || mappedEtapa === "perdido") && (
            <StageSection title="Emitido / Cerrado" icon={<ClipboardCheck size={18} />} color="var(--stage-emitted)" glow="var(--stage-emitted-glow)">
              {saving && <div className="flex items-center gap-2 mb-3 text-[14px] text-[var(--accent)]"><Loader2 size={16} className="animate-spin" />Subiendo archivo...</div>}
              {msgAlerta && <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-[var(--green-glow)] border border-green-500/20 text-[13px] text-[var(--green)]"><AlertTriangle size={14} />{msgAlerta}</div>}
              {(deal.caratula || deal.archivo) && <div className="flex items-center gap-3 p-3 bg-[var(--green-glow)] rounded-lg border border-green-500/20 mb-3"><FileText size={18} className="text-[var(--green)]" /><span className="text-[15px] text-[var(--green)] flex-1">{deal.caratula || deal.archivo}</span><CheckCircle2 size={18} className="text-[var(--green)]" /></div>}
              <div className="bg-[var(--surface)] rounded-xl p-4 border border-[var(--border)] mb-3">
                <label className="text-[14px] text-[var(--text-muted)] uppercase font-medium mb-2 block">Carátula</label>
                {/* Campo: Vencimiento de la póliza + checkbox de alerta automática */}
                {mappedEtapa !== "perdido" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 p-3 rounded-lg bg-[var(--surface-light)] border border-[var(--border)]">
                    <div>
                      <label className="text-[12px] text-[var(--text-muted)] uppercase font-medium block mb-1">Vencimiento póliza</label>
                      <input type="date" value={deal.vigencia_hasta || ""} onChange={e => sv({ vigencia_hasta: e.target.value })} className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13px] outline-none" />
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 text-[12px] text-[var(--text-muted)] cursor-pointer select-none">
                        <input type="checkbox" checked={crearAlertaVenc} onChange={e => setCrearAlertaVenc(e.target.checked)} className="w-4 h-4 accent-[var(--accent)]" />
                        Crear alertas automáticas (60d, 30d, 15d antes)
                      </label>
                    </div>
                  </div>
                )}
                {(deal.caratula || deal.archivo) ? (<div className="space-y-2">{mappedEtapa !== "perdido" && <button onClick={() => caRef.current?.click()} className="text-[13px] text-[var(--accent)] hover:underline flex items-center gap-1"><Upload size={14} />Reemplazar carátula</button>}</div>) : (<button onClick={() => caRef.current?.click()} className="w-full flex items-center justify-center gap-3 px-4 py-5 rounded-xl border-2 border-dashed border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--stage-emitted)] text-[16px]"><Upload size={20} /> Subir carátula</button>)}
                <input ref={caRef} type="file" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (!f) return; setSaving(true); const base64 = await new Promise<string>((res) => { const reader = new FileReader(); reader.onload = () => res((reader.result as string).split(",")[1]); reader.readAsDataURL(f); }); try { await uploadToNeg("Polizas", [{ name: f.name, mimeType: f.type || "application/pdf", base64 }]); } catch {} await sv({ caratula: f.name }); /* Crear alertas de vencimiento si checkbox activo y hay fecha */ if (crearAlertaVenc && deal.vigencia_hasta) { try { const r = await fetch("/api/alertas/poliza", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cedula: deal.cedula, negocio_id: deal.id, tipo_poliza: deal.tipo_poliza || "Póliza", aseguradora: deal.aseguradora || "", fecha_vencimiento: deal.vigencia_hasta }) }); const d = await r.json(); if (d.ok && d.creadas > 0) { setMsgAlerta(`✅ ${d.creadas} alerta(s) de vencimiento creada(s)`); setTimeout(() => setMsgAlerta(""), 4000); } } catch {} } setSaving(false); }} />
              </div>
              {/* Endoso (opcional) */}
              <div className="bg-[var(--surface)] rounded-xl p-4 border border-[var(--border)]"><label className="text-[14px] text-[var(--text-muted)] uppercase font-medium mb-2 block">Endoso <span className="text-[12px] normal-case font-normal">(no obligatorio)</span></label>{deal.endoso ? (<div className="flex items-center gap-3 p-3 bg-[var(--green-glow)] rounded-lg border border-green-500/20"><FileText size={16} className="text-[var(--green)]" /><span className="text-[14px] text-[var(--green)] flex-1">{deal.endoso}</span>{mappedEtapa !== "perdido" && <button onClick={() => endosoRef.current?.click()} className="text-[12px] text-[var(--accent)] hover:underline flex items-center gap-1"><Upload size={12} />Reemplazar</button>}</div>) : mappedEtapa !== "perdido" ? (<button onClick={() => endosoRef.current?.click()} className="w-full flex items-center justify-center gap-3 px-4 py-4 rounded-xl border-2 border-dashed border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--stage-emitted)] text-[15px]"><Upload size={18} /> Subir endoso</button>) : null}<input ref={endosoRef} type="file" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (!f) return; setSaving(true); const base64 = await new Promise<string>((res) => { const reader = new FileReader(); reader.onload = () => res((reader.result as string).split(",")[1]); reader.readAsDataURL(f); }); try { await uploadToNeg("Endosos", [{ name: f.name, mimeType: f.type || "application/pdf", base64 }]); } catch {} await sv({ endoso: f.name }); setSaving(false); }} /></div>
            </StageSection>
          )}

          {/* ═══ 6. RECAUDO ═══ */}
          {mappedEtapa === "recaudo" && (
            <StageSection title="Recaudo" icon={<Receipt size={16} />} color="var(--stage-collected)" glow="var(--stage-collected-glow)">
              {saving && <div className="flex items-center gap-2 mb-3 text-[14px] text-[var(--accent)]"><Loader2 size={16} className="animate-spin" />Subiendo archivo...</div>}
              {msgAlerta && <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-[var(--green-glow)] border border-green-500/20 text-[13px] text-[var(--green)]"><AlertTriangle size={14} />{msgAlerta}</div>}
              {rok && <div className="flex items-center gap-1.5 text-[13px] text-[var(--green)] font-semibold bg-[var(--green-glow)] px-3 py-1.5 rounded-lg mb-3"><CheckCircle2 size={14} />Recaudo Completo</div>}
              {!deal.modalidad_pago && (<div className="mb-3"><label className="text-[13px] text-[var(--text-muted)] uppercase font-medium mb-3 block">Modalidad de Pago</label><div className="flex gap-4"><button onClick={() => sv({ modalidad_pago: "contado" })} className="flex-1 flex flex-col items-center gap-3 p-5 rounded-xl bg-[var(--surface)] border-2 border-[var(--border)] hover:border-[var(--green)]"><Banknote size={28} className="text-[var(--green)]" /><span className="text-[15px] font-semibold">Contado</span></button><button onClick={() => sv({ modalidad_pago: "financiado" })} className="flex-1 flex flex-col items-center gap-3 p-5 rounded-xl bg-[var(--surface)] border-2 border-[var(--border)] hover:border-[var(--purple)]"><CreditCard size={28} className="text-[var(--purple)]" /><span className="text-[15px] font-semibold">Financiado</span></button></div></div>)}
              {deal.modalidad_pago === "contado" && (<div className="bg-[var(--surface)] rounded-xl p-4 border border-[var(--border)] space-y-4"><div className="flex items-center gap-2"><Banknote size={18} className="text-[var(--green)]" /><span className="text-[15px] font-semibold">Contado</span></div><div><label className="text-[12px] text-[var(--text-muted)] uppercase font-medium">Fecha Límite</label><input type="date" className="w-full bg-[var(--surface-light)] border border-[var(--border)] rounded-xl px-4 py-3 text-[14px] outline-none mt-1" value={deal.fecha_limite_pago} onChange={async e => { const fecha = e.target.value; await sv({ fecha_limite_pago: fecha }); if (fecha) { try { await wf20({ action: "create_alert", cedula: deal.cedula, negocio_id: deal.id, descripcion: `Pago contado ${deal.tipo_poliza} - ${deal.aseguradora}`, fecha }); } catch {} } }} />{deal.fecha_limite_pago && !deal.pagado && <p className="text-[13px] text-[var(--secondary)] mt-2 flex items-center gap-1.5"><AlertTriangle size={13} />Alerta creada para {deal.fecha_limite_pago}</p>}</div><div className="flex items-center gap-4"><label className="text-[12px] text-[var(--text-muted)] uppercase font-medium">Pago</label><button onClick={() => sv({ pagado: !deal.pagado })} className={`px-6 py-2.5 rounded-xl text-[14px] font-semibold ${deal.pagado ? "bg-[var(--green)] text-white" : "bg-[var(--surface-light)] border border-[var(--border)] text-[var(--text-muted)]"}`}>{deal.pagado ? "✓ Pagado" : "Pendiente"}</button></div><div><label className="text-[12px] text-[var(--text-muted)] uppercase font-medium">Evidencia</label>{deal.evidencia_pago ? (<div className="flex items-center gap-3 mt-1 p-3 bg-[var(--green-glow)] rounded-lg"><FileText size={16} className="text-[var(--green)]" /><span className="text-[14px] text-[var(--green)] flex-1">{deal.evidencia_pago}</span></div>) : (<button onClick={() => evRef.current?.click()} className="mt-1 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--green)] text-[14px]"><Upload size={16} />Subir evidencia</button>)}<input ref={evRef} type="file" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (!f) return; setSaving(true); const base64 = await new Promise<string>((res) => { const reader = new FileReader(); reader.onload = () => res((reader.result as string).split(",")[1]); reader.readAsDataURL(f); }); try { await uploadToNeg("Evidencias", [{ name: f.name, mimeType: f.type || "application/pdf", base64 }]); } catch {} await sv({ evidencia_pago: f.name }); setSaving(false); }} /></div><div><label className="text-[13px] text-[var(--text-muted)] uppercase font-medium">Certificado de pago</label>{deal.cert_pago ? (<div className="flex items-center gap-3 mt-1 p-3 bg-[var(--green-glow)] rounded-lg"><FileText size={16} className="text-[var(--green)]" /><span className="text-[14px] text-[var(--green)] flex-1">{deal.cert_pago}</span></div>) : (<button onClick={() => certPagoRef.current?.click()} className="mt-1 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--green)] text-[14px]"><Upload size={16} />Subir certificado</button>)}<input ref={certPagoRef} type="file" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (!f) return; setSaving(true); const base64 = await new Promise<string>((res) => { const reader = new FileReader(); reader.onload = () => res((reader.result as string).split(",")[1]); reader.readAsDataURL(f); }); try { await uploadToNeg("Certificados", [{ name: f.name, mimeType: f.type || "application/pdf", base64 }]); } catch {} await sv({ cert_pago: f.name }); setSaving(false); }} /></div></div>)}
              {deal.modalidad_pago === "financiado" && (<div className="bg-[var(--surface)] rounded-xl p-4 border border-[var(--border)] space-y-4"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><CreditCard size={18} className="text-[var(--purple)]" /><span className="text-[15px] font-semibold">Financiado</span></div>{deal.cuotas_total > 0 && <span className="text-[13px] font-bold" style={{color: deal.cuotas_pagadas >= deal.cuotas_total ? "var(--green)" : "var(--purple)"}}>{deal.cuotas_pagadas}/{deal.cuotas_total}</span>}</div>{deal.cuotas_total > 0 && (<div className="h-2 rounded-full bg-[var(--surface-light)] overflow-hidden"><div className="h-full rounded-full transition-all duration-700" style={{width: `${Math.max((deal.cuotas_pagadas / deal.cuotas_total) * 100, 2)}%`, background: deal.cuotas_pagadas >= deal.cuotas_total ? "var(--green)" : "linear-gradient(90deg, var(--purple), #a78bfa)"}} /></div>)}
                <div className="grid grid-cols-2 gap-3"><div><label className="text-[11px] text-[var(--text-muted)] uppercase font-medium">Plazo</label><select className="w-full bg-[var(--surface-light)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-[13px] outline-none mt-1" value={deal.cuotas_total} onChange={e => sv({ cuotas_total: parseInt(e.target.value) })}><optgroup label="Corto plazo">{[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n} cuotas</option>)}</optgroup><optgroup label="Mediano plazo">{[7,8,9,10,11,12].map(n => <option key={n} value={n}>{n} cuotas{n===12?" (1 año)":""}</option>)}</optgroup><optgroup label="Largo plazo">{[18,24,30,36,42,48].map(n => <option key={n} value={n}>{n} cuotas ({n/12 % 1 === 0 ? `${n/12} años` : `${Math.floor(n/12)}a ${n%12}m`})</option>)}</optgroup></select></div><div><label className="text-[11px] text-[var(--text-muted)] uppercase font-medium">Fecha 1ra cuota</label><input type="date" className="w-full bg-[var(--surface-light)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-[13px] outline-none mt-1" value={deal.fecha_corte} onChange={async e => { const fecha = e.target.value; await sv({ fecha_corte: fecha }); if (fecha) { try { await wf20({ action: "create_alert", cedula: deal.cedula, negocio_id: deal.id, descripcion: `Cuota #1 ${deal.tipo_poliza} - ${deal.aseguradora}`, fecha }); } catch {} } }} /></div></div>
                {(() => { const total = deal.cuotas_total || 6; const all = Array.from({ length: total }, (_, i) => { const n = i + 1; const paid = i < deal.cuotas_pagadas; const hist = (deal.historial_cuotas || []).find(h => h.cuota === n); let venc = hist?.fecha_vencimiento || ""; if (!venc && deal.fecha_corte) { const b = new Date(deal.fecha_corte + "T00:00:00"); b.setMonth(b.getMonth() + i); venc = b.toISOString().split("T")[0]; } return { n, paid, hist, venc, isNext: n === deal.cuotas_pagadas + 1 }; }); const groups: { label: string; items: typeof all; paidCount: number }[] = []; const perGroup = total > 12 ? 12 : total; for (let y = 0; y < Math.ceil(total / perGroup); y++) { const items = all.slice(y * perGroup, Math.min((y + 1) * perGroup, total)); groups.push({ label: total > 12 ? `Año ${y + 1}` : "", items, paidCount: items.filter(c => c.paid).length }); } return (<div className="space-y-2">{groups.map((g, gi) => { const allGroupPaid = g.items.every(c => c.paid); const hasNext = g.items.some(c => c.isNext); const shouldOpen = hasNext || (gi === 0 && !allGroupPaid) || g.items.some(c => !c.paid && c.n <= deal.cuotas_pagadas + 3); const content = (<div className="space-y-1">{g.items.map(({ n, paid, hist, venc, isNext }) => { const vLabel = venc ? new Date(venc + "T00:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short" }) : ""; return (<div key={n} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[12px] transition-all ${paid ? "bg-[rgba(139,92,246,0.06)]" : isNext ? "bg-[var(--surface-light)] ring-1 ring-[var(--purple)]/30" : "opacity-50"}`}><div className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 ${paid ? "bg-[var(--purple)] text-white" : isNext ? "border-2 border-[var(--purple)] text-[var(--purple)]" : "border border-[var(--border)] text-[var(--text-muted)]"}`}>{paid ? "✓" : n}</div><div className="flex-1 min-w-0"><span className={`text-[11px] ${paid ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}>{vLabel}{paid && hist?.fecha_pago ? <span className="text-[var(--green)] ml-1.5">• {hist.fecha_pago}</span> : null}</span>{paid && hist?.evidencia && <span className="text-[9px] text-[var(--green)] ml-1.5">📎 {hist.evidencia}</span>}</div>{isNext && !paid && (<button onClick={async (e) => { e.preventDefault(); e.stopPropagation(); const fp = new Date().toLocaleDateString("es-CO"); const nh = [...(deal.historial_cuotas || []), { cuota: n, fecha_vencimiento: venc, fecha_pago: fp, evidencia: "" }]; await sv({ cuotas_pagadas: n, historial_cuotas: nh }); if (n < deal.cuotas_total && deal.fecha_corte) { const nb = new Date(deal.fecha_corte + "T00:00:00"); nb.setMonth(nb.getMonth() + n); try { await wf20({ action: "create_alert", cedula: deal.cedula, negocio_id: deal.id, descripcion: `Cuota #${n + 1} ${deal.tipo_poliza} - ${deal.aseguradora}`, fecha: nb.toISOString().split("T")[0] }); } catch {} } }} className="px-2 py-1 rounded text-[10px] font-semibold bg-[var(--purple)] text-white shrink-0">Pagar</button>)}{paid && !hist?.evidencia && (<button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setUploadingCuota(n); setTimeout(() => cuotaRef.current?.click(), 50); }} className="px-2 py-1 rounded text-[10px] border border-[var(--purple)]/30 text-[var(--purple)] shrink-0 flex items-center gap-0.5"><Upload size={9} />Recibo</button>)}</div>); })}</div>); if (!g.label) return <div key={gi}>{content}</div>; return (<details key={gi} open={shouldOpen} className="group"><summary className="flex items-center gap-2 py-1.5 px-1 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden"><ChevronRight size={12} className="text-[var(--text-muted)] transition-transform group-open:rotate-90 shrink-0" /><span className={`text-[11px] font-semibold uppercase tracking-wide ${allGroupPaid ? "text-[var(--green)]" : "text-[var(--text-muted)]"}`}>{g.label}</span><span className="text-[10px] text-[var(--text-muted)]">{g.paidCount}/{g.items.length}</span><div className="flex-1 flex gap-px items-center ml-1">{g.items.map((c, ci) => <div key={ci} className="h-1 flex-1 rounded-full" style={{background: c.paid ? "var(--purple)" : "var(--border)", maxWidth: "8px"}} />)}</div>{allGroupPaid && <CheckCircle2 size={12} className="text-[var(--green)] shrink-0" />}</summary><div className="mt-1 ml-3">{content}</div></details>); })}</div>); })()}
                <input ref={cuotaRef} type="file" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (!f || uploadingCuota === null) return; setSaving(true); const base64 = await new Promise<string>((res) => { const reader = new FileReader(); reader.onload = () => res((reader.result as string).split(",")[1]); reader.readAsDataURL(f); }); try { await uploadToNeg("Recibos", [{ name: f.name, mimeType: f.type || "application/pdf", base64 }]); } catch {} const newHist = (deal.historial_cuotas || []).map(h => h.cuota === uploadingCuota ? { ...h, evidencia: f.name } : h); await sv({ historial_cuotas: newHist }); setUploadingCuota(null); setSaving(false); if (cuotaRef.current) cuotaRef.current.value = ""; }} />
                {deal.cuotas_pagadas >= deal.cuotas_total && deal.cuotas_total > 0 && !deal.pagado && (<button onClick={() => sv({ pagado: true })} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[var(--green)] text-white text-[14px] font-semibold"><CheckCircle2 size={16} />Confirmar recaudo completo</button>)}
                {deal.pagado && <p className="text-[13px] text-[var(--green)] flex items-center gap-1.5 font-semibold"><CheckCircle2 size={14} />Financiación completada y confirmada</p>}
                <div><label className="text-[13px] text-[var(--text-muted)] uppercase font-medium">Certificado de pago</label>{deal.cert_pago ? (<div className="flex items-center gap-3 mt-1 p-3 bg-[var(--green-glow)] rounded-lg"><FileText size={16} className="text-[var(--green)]" /><span className="text-[14px] text-[var(--green)] flex-1">{deal.cert_pago}</span></div>) : (<button onClick={() => certPagoRef.current?.click()} className="mt-1 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--purple)] text-[14px]"><Upload size={16} />Subir certificado</button>)}</div>
              </div>)}
            </StageSection>
          )}

          {/* ═══ PERDIDO ═══ */}
          {mappedEtapa === "perdido" && (
            <StageSection title="Perdido" icon={<XCircle size={16} />} color="var(--stage-lost)" glow="var(--stage-lost-glow)">
              <p className="text-[14px] text-[var(--text-muted)] mb-3">Fecha: {deal.fecha_perdido || "—"}</p>
              {deal.etapa_antes_perdido && <p className="text-[13px] text-[var(--text-muted)] mb-3">Última etapa: <span className="font-medium text-[var(--text-secondary)]">{STAGES.find(s => s.id === deal.etapa_antes_perdido)?.label || deal.etapa_antes_perdido}</span></p>}
              <button onClick={recover} disabled={saving} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[14px] font-semibold bg-[var(--accent-glow)] text-[var(--accent)] border border-[var(--accent)]/20 hover:border-[var(--accent)]/40"><RefreshCw size={16} />Recuperar negocio{deal.etapa_antes_perdido ? ` → ${STAGES.find(s => s.id === deal.etapa_antes_perdido)?.label || ""}` : ""}</button>
            </StageSection>
          )}

          {advanceError && (<div className="mb-3 px-4 py-3 rounded-xl bg-[var(--red-glow)] border border-red-500/30 flex items-center gap-2"><AlertTriangle size={16} className="text-[var(--red)] shrink-0" /><span className="text-[14px] text-[var(--red)] font-medium">{advanceError}</span></div>)}

          {mappedEtapa !== "perdido" && mappedEtapa !== "recaudo" && (
            <div className="flex gap-3 pt-2">
              <button onClick={advance} disabled={saving} className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[15px] font-semibold bg-[var(--green-glow)] text-[var(--green)] border border-green-500/20 hover:border-green-500/40"><TrendingUp size={16} />Avanzar Etapa</button>
              <button onClick={lose} disabled={saving} className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[15px] font-semibold bg-[var(--red-glow)] text-[var(--red)] border border-red-500/20 hover:border-red-500/40"><XCircle size={16} />Perdido</button>
            </div>
          )}
        </div>
      )}

      {/* Modal Confirmar Eliminación Documento */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
          <div className="w-full max-w-[380px] rounded-2xl border border-red-500/30 bg-[var(--surface)] p-6 space-y-4 animate-scale-in" style={{ boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)" }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--red-glow)] flex items-center justify-center"><Trash2 size={20} className="text-[var(--red)]" /></div>
              <div>
                <h3 className="text-[15px] font-bold">Eliminar documento</h3>
                <p className="text-[12px] text-[var(--text-muted)]">Esta acción no se puede deshacer</p>
              </div>
            </div>
            <div className="bg-[var(--surface-light)] rounded-xl p-3 border border-[var(--border)]">
              <p className="text-[13px] text-[var(--text-primary)] font-medium">{deleteConfirm.nombre}</p>
              <p className="text-[11px] text-[var(--text-muted)] mt-1">Se eliminará el documento y las cotizaciones asociadas del análisis técnico.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-3 rounded-xl text-[13px] font-medium border border-[var(--border)] text-[var(--text-muted)]">Cancelar</button>
              <button onClick={async () => { const arch = deleteConfirm; setDeleteConfirm(null); setSaving(true); const updated = (deal.propuesta_archivos || []).filter((_, idx) => idx !== arch.idx); const updatedCots = (deal.cotizaciones || []).filter(c => c.archivo !== arch.nombre); await sv({ propuesta_archivos: updated, cotizaciones: updatedCots }); const sub = arch.aseg ? `Propuestas/${arch.aseg}` : "Propuestas"; try { await fetch("https://n8n.grupoexcelsior.co/webhook/delete-drive-file", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cedula: deal.cedula, subfolder: sub, negocio_name: getNegName(), fileName: arch.nombre }) }); } catch {} setSaving(false); }} className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[13px] font-semibold bg-[var(--red)] text-white"><Trash2 size={14} />Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══ MAIN ═══
export default function ClientDetail({ client, onBack, expandedNegocioId, onNegocioExpanded }: { client: Client; onBack: () => void; expandedNegocioId?: string; onNegocioExpanded?: () => void }) {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiOk, setApiOk] = useState(true);
  const [highlightNegocioId, setHighlightNegocioId] = useState<string | undefined>(undefined);
  const dealRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const polizas = client.polizas || [];

  const polizaToDeal = (p: Poliza): Deal => ({
    id: p.id || `local-${Math.random()}`, cedula: p.cedula, tipo_poliza: p.tipo_poliza || "General",
    aseguradora: p.aseguradora || "—", etapa: "contacto_inicial", fecha_creacion: p.fecha_registro || "",
    fecha_actualizacion: "", fecha_limite: "", observacion: "", seguimientos: [],
    caratula: "", modalidad_pago: "", fecha_limite_pago: "", pagado: false, evidencia_pago: "",
    cuotas_total: 6, cuotas_pagadas: 0, fecha_corte: "", fecha_perdido: "", activo: true,
    cotizaciones: [], numero_poliza: p.numero_poliza, vigencia_desde: p.vigencia_desde, vigencia_hasta: p.vigencia_hasta,
    prima: p.prima, archivo: p.archivo,
  });

  const loadDeals = useCallback(async () => {
    setLoading(true);
    try {
      const data = await wf20({ action: "get_client", cedula: client.cedula });
      const serverDeals: Deal[] = (data.negocios || []).map((sd: any) => {
        let archivos = sd.propuesta_archivos || sd.propuesta_archivo || [];
        // Legacy: condiciones antes venían embebidas en el string JSON de propuesta_archivo.
        // Ahora el backend las devuelve como array directo en sd.condiciones_rechazadas.
        let condiciones: any[] = Array.isArray(sd.condiciones_rechazadas) ? sd.condiciones_rechazadas : [];
        if (typeof archivos === 'string') {
          try {
            const parsed = JSON.parse(archivos);
            if (parsed && parsed.archivos) { archivos = parsed.archivos; if (!condiciones.length) condiciones = parsed.condiciones || []; }
            else if (Array.isArray(parsed)) { archivos = parsed; }
            else { archivos = archivos ? [{ nombre: archivos, fecha: '' }] : []; }
          } catch { archivos = archivos ? [{ nombre: archivos, fecha: '' }] : []; }
        }
        let extras: any = {};
        try { const p = JSON.parse(sd.observacion || ''); if (typeof p === 'object') extras = p; } catch {}
        // historial_cuotas: preferir el array directo del backend; si no viene, caer a los extras del observacion (legacy)
        const histCuotas = Array.isArray(sd.historial_cuotas) && sd.historial_cuotas.length ? sd.historial_cuotas : (extras.historial_cuotas || []);
        return { ...sd, cotizaciones: sd.cotizaciones || [], seguimientos: sd.seguimientos || [], propuesta_archivos: archivos, condiciones_rechazadas: condiciones, historial_cuotas: histCuotas, etapa_antes_perdido: extras.etapa_antes_perdido || "", endoso: extras.endoso || "", cert_pago: extras.cert_pago || "", documentos_cliente: extras.documentos_cliente || [], observacion: typeof extras === 'object' && Object.keys(extras).length > 0 ? '' : sd.observacion };
      });
      if (serverDeals.length > 0) {
        const merged = serverDeals.map(sd => {
          const mp = polizas.find(p => p.tipo_poliza?.toLowerCase() === sd.tipo_poliza?.toLowerCase() && p.aseguradora?.toLowerCase() === sd.aseguradora?.toLowerCase());
          return { ...sd, numero_poliza: mp?.numero_poliza, vigencia_desde: mp?.vigencia_desde, vigencia_hasta: mp?.vigencia_hasta, prima: mp?.prima, archivo: mp?.archivo };
        });
        setDeals(merged); setApiOk(true);
      } else { setDeals([]); setApiOk(true); }
    } catch { setApiOk(false); setDeals(polizas.length > 0 ? polizas.map(polizaToDeal) : []); }
    finally { setLoading(false); }
  }, [client.cedula, polizas]);

  useEffect(() => { loadDeals(); }, [loadDeals]);

  // Retry pending saves from localStorage (saved when previous save failed)
  useEffect(() => {
    if (loading || deals.length === 0) return;
    const retryPending = async () => {
      for (const deal of deals) {
        const key = `pending_save_${deal.id}`;
        const pending = localStorage.getItem(key);
        if (!pending) continue;
        try {
          const params = JSON.parse(pending);
          const result = await wf20(params);
          if (!result.error) {
            localStorage.removeItem(key);
            console.log(`Pending save for ${deal.id} succeeded on retry`);
          }
        } catch { /* will retry next time */ }
      }
    };
    retryPending();
  }, [loading, deals.length]);

  // Auto-scroll to negocio from alert "Gestionar"
  useEffect(() => {
    if (expandedNegocioId && !loading && deals.length > 0) {
      setHighlightNegocioId(expandedNegocioId);
      setTimeout(() => {
        const el = dealRefs.current[expandedNegocioId];
        if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); }
        onNegocioExpanded?.();
      }, 300);
      setTimeout(() => setHighlightNegocioId(undefined), 4000);
    }
  }, [expandedNegocioId, loading, deals.length]);

  // Modal for creating new deal
  const [showNewDeal, setShowNewDeal] = useState(false);
  const [newDealTipo, setNewDealTipo] = useState("");
  const [newDealAseguradoras, setNewDealAseguradoras] = useState<string[]>([]);
  const [creatingDeal, setCreatingDeal] = useState(false);

  const toggleNewDealAseg = (aseg: string) => {
    setNewDealAseguradoras(prev => prev.includes(aseg) ? prev.filter(a => a !== aseg) : [...prev, aseg]);
  };

  const handleCreateDeal = async () => {
    if (!newDealTipo.trim()) return;
    setCreatingDeal(true);
    try {
      await wf20({ action: "create", cedula: client.cedula, tipo_poliza: newDealTipo.trim(), aseguradora: newDealAseguradoras.length > 0 ? newDealAseguradoras.join(", ") : "Por definir", etapa: "contacto_inicial" });
      setShowNewDeal(false); setNewDealTipo(""); setNewDealAseguradoras([]);
      loadDeals();
    } catch {}
    finally { setCreatingDeal(false); }
  };

  const [saveError, setSaveError] = useState("");

  const saveDeal = async (updates: Partial<Deal> & { id: string }) => {
    setDeals(prev => prev.map(d => d.id === updates.id ? { ...d, ...updates } as Deal : d));
    setSaveError("");
    if (!apiOk) return;
    const params: Record<string, string> = { action: "save", id: updates.id };
    if (updates.etapa) params.etapa = updates.etapa;
    if (updates.tipo_poliza !== undefined) params.tipo_poliza = updates.tipo_poliza;
    if (updates.aseguradora !== undefined) params.aseguradora = updates.aseguradora;
    if (updates.fecha_limite !== undefined) params.fecha_limite = updates.fecha_limite;
    if (updates.observacion !== undefined) params.observacion = updates.observacion;
    if (updates.caratula !== undefined) params.caratula = updates.caratula;
    if (updates.modalidad_pago !== undefined) params.modalidad_pago = updates.modalidad_pago;
    if (updates.fecha_limite_pago !== undefined) params.fecha_limite_pago = updates.fecha_limite_pago;
    if (updates.pagado !== undefined) params.pagado = updates.pagado ? "SI" : "NO";
    if (updates.evidencia_pago !== undefined) params.evidencia_pago = updates.evidencia_pago;
    if (updates.cuotas_total !== undefined) params.cuotas_total = String(updates.cuotas_total);
    if (updates.cuotas_pagadas !== undefined) params.cuotas_pagadas = String(updates.cuotas_pagadas);
    if (updates.fecha_corte !== undefined) params.fecha_corte = updates.fecha_corte;
    if (updates.fecha_perdido !== undefined) params.fecha_perdido = updates.fecha_perdido;
    if (updates.seguimientos) params.seg = JSON.stringify(updates.seguimientos);
    if (updates.nit !== undefined) params.nit = updates.nit;
    if (updates.contacto_nombre !== undefined) params.contacto_nombre = updates.contacto_nombre;
    if (updates.contacto_tel !== undefined) params.contacto_tel = updates.contacto_tel;
    if (updates.valor_cotizado !== undefined) params.valor_cotizado = updates.valor_cotizado;
    if (updates.promedio_prima !== undefined) params.promedio_prima = updates.promedio_prima;
    if (updates.ramo !== undefined) params.ramo = updates.ramo;
    if (updates.cotizaciones) params.cotizaciones_json = JSON.stringify(updates.cotizaciones);
    if (updates.notas_analisis !== undefined) params.notas_analisis = updates.notas_analisis;
    if (updates.propuesta_enviada !== undefined) params.propuesta_enviada = updates.propuesta_enviada ? "SI" : "NO";
    if (updates.propuesta_archivos !== undefined || updates.condiciones_rechazadas !== undefined) {
      const deal = deals.find(d => d.id === updates.id);
      const archivos = updates.propuesta_archivos !== undefined ? updates.propuesta_archivos : (deal?.propuesta_archivos || []);
      const condiciones = updates.condiciones_rechazadas !== undefined ? updates.condiciones_rechazadas : (deal?.condiciones_rechazadas || []);
      params.propuesta_archivo = JSON.stringify({ archivos, condiciones });
    }
    if (updates.propuesta_fecha !== undefined) params.propuesta_fecha = updates.propuesta_fecha;
    if (updates.historial_cuotas !== undefined || updates.etapa_antes_perdido !== undefined || updates.endoso !== undefined || updates.cert_pago !== undefined || updates.documentos_cliente !== undefined) {
      const deal = deals.find(d => d.id === updates.id);
      const extras: Record<string, any> = {};
      if (updates.historial_cuotas !== undefined) extras.historial_cuotas = updates.historial_cuotas;
      else if (deal?.historial_cuotas?.length) extras.historial_cuotas = deal.historial_cuotas;
      if (updates.etapa_antes_perdido !== undefined) extras.etapa_antes_perdido = updates.etapa_antes_perdido;
      else if (deal?.etapa_antes_perdido) extras.etapa_antes_perdido = deal.etapa_antes_perdido;
      if (updates.endoso !== undefined) extras.endoso = updates.endoso;
      else if (deal?.endoso) extras.endoso = deal.endoso;
      if (updates.cert_pago !== undefined) extras.cert_pago = updates.cert_pago;
      else if (deal?.cert_pago) extras.cert_pago = deal.cert_pago;
      if (updates.documentos_cliente !== undefined) extras.documentos_cliente = updates.documentos_cliente;
      else if (deal?.documentos_cliente?.length) extras.documentos_cliente = deal.documentos_cliente;
      params.observacion = JSON.stringify(extras);
    }
    if (updates.etapa === "emitido" && client.estado?.toLowerCase() === "prospecto") {
      try { await wf20({ action: "convert", cedula: client.cedula }); } catch {}
    }
    try {
      const result = await wf20(params);
      if (result.error) {
        console.error("Save failed:", result);
        setSaveError(`Error guardando: ${result.message || "Error desconocido"}. Los datos se mantienen localmente.`);
        // Save pending data to localStorage as backup
        try { localStorage.setItem(`pending_save_${updates.id}`, JSON.stringify(params)); } catch {}
        setTimeout(() => setSaveError(""), 8000);
        // DO NOT reload from server - keep local state so user doesn't lose data
      } else {
        // Clear any pending save backup
        try { localStorage.removeItem(`pending_save_${updates.id}`); } catch {}
        completeAlertAfterChange(client.cedula).catch(() => {});
      }
    } catch (err) {
      console.error("Save network error:", err);
      setSaveError("Error de conexión. Los datos se mantienen localmente. Intenta de nuevo.");
      // Save pending data to localStorage as backup
      try { localStorage.setItem(`pending_save_${updates.id}`, JSON.stringify(params)); } catch {}
      setTimeout(() => setSaveError(""), 8000);
      // DO NOT reload from server - keep local state so user doesn't lose data
    }
  };

  return (
    <div className="animate-slide-in-left">
      <button onClick={onBack} className="flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--accent)] text-[15px] mb-5"><ArrowLeft size={18} /> Volver a la lista</button>
      <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-6 mb-6" style={{ boxShadow: "var(--shadow)" }}>
        <div className="flex items-center gap-5">
          <div className="rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-dark)] flex items-center justify-center text-2xl font-bold text-white" style={{ width: 72, height: 72 }}>{client.nombre.charAt(0)}</div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1"><h2 className="text-2xl font-bold">{client.nombre}</h2><StatusBadge status={client.estado} /></div>
            <div className="flex items-center gap-5 text-[15px] text-[var(--text-muted)]"><span>CC: {client.cedula}</span>{client.telefono && <span>Tel: {client.telefono}</span>}{client.correo && <span>Email: {client.correo}</span>}</div>
            {deals.length > 0 && (<div className="flex items-center gap-2 mt-2 flex-wrap">{deals.map(d => { const c = getPCfg(d.tipo_poliza); return (<span key={d.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-medium" style={{ background: c.glow, color: c.color }}>{c.icon} {d.tipo_poliza}</span>); })}</div>)}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={loadDeals} className="p-2.5 rounded-xl bg-[var(--surface-light)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--accent)]"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /></button>
            <div className="text-right"><div className="text-[13px] text-[var(--text-muted)] uppercase">Pólizas</div><div className="text-3xl font-bold text-[var(--accent)]">{deals.length}</div></div>
          </div>
        </div>
      </div>
      {saveError && <div className="mb-4 px-4 py-3 rounded-xl bg-[var(--red-glow)] border border-red-500/30 flex items-center gap-2 animate-scale-in"><AlertTriangle size={16} className="text-[var(--red)] shrink-0" /><span className="text-[14px] text-[var(--red)] font-medium">{saveError}</span></div>}
      <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-6" style={{ boxShadow: "var(--shadow)" }}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[17px] font-semibold flex items-center gap-2"><Briefcase size={18} className="text-[var(--accent)]" />Pipeline de Negocios</h3>
          {apiOk ? <span className="text-[12px] text-[var(--green)] bg-[var(--green-glow)] px-3 py-1 rounded-lg flex items-center gap-1.5"><CheckCircle2 size={12} />Conectado</span> : <span className="text-[12px] text-[var(--secondary)] bg-[var(--secondary-glow)] px-3 py-1 rounded-lg">Modo local</span>}
        </div>
        {loading ? (<div className="flex items-center justify-center py-12 gap-3 text-[var(--text-muted)]"><Loader2 size={20} className="animate-spin" /><span className="text-[15px]">Cargando negocios...</span></div>)
        : deals.length > 0 ? (<div className="space-y-4">
          {deals.map(d => <div key={d.id} ref={el => { dealRefs.current[d.id] = el; }} className={`transition-all duration-700 rounded-2xl ${highlightNegocioId === d.id ? "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg)]" : ""}`}><DealCard deal={d} onSave={saveDeal} client={client} onLocalUpdate={(u) => setDeals(prev => prev.map(x => x.id === u.id ? { ...x, ...u } as Deal : x))} /></div>)}
          <button onClick={() => setShowNewDeal(true)} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all"><Plus size={16} /> Agregar otro negocio</button>
        </div>)
        : (<div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[var(--accent-glow)] flex items-center justify-center mb-4"><Briefcase size={28} className="text-[var(--accent)]" /></div>
            <p className="text-[16px] font-semibold mb-2">Sin negocios activos</p>
            <p className="text-[13px] text-[var(--text-muted)] mb-6">Este prospecto aún no tiene negocios en el pipeline</p>
            <button onClick={() => setShowNewDeal(true)} className="flex items-center gap-2 px-5 py-3 rounded-xl text-[14px] font-semibold text-white" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))" }}><Plus size={16} /> Agregar Negocio</button>
          </div>)
        }
      </div>

      {/* Modal Nuevo Negocio */}
      {showNewDeal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
          <div className="w-full max-w-[480px] rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-4 animate-scale-in" style={{ boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)" }}>
            <div className="flex items-center justify-between">
              <h3 className="text-[16px] font-bold flex items-center gap-2"><Briefcase size={18} className="text-[var(--accent)]" /> Nuevo Negocio</h3>
              <button onClick={() => { setShowNewDeal(false); setNewDealTipo(""); setNewDealAseguradoras([]); }} className="p-1.5 rounded-lg hover:bg-[var(--surface-light)] text-[var(--text-muted)]"><XCircle size={18} /></button>
            </div>
            <div>
              <label className="text-[11px] text-[var(--text-muted)] uppercase font-medium">Tipo de póliza *</label>
              <input value={newDealTipo} onChange={e => setNewDealTipo(e.target.value)} placeholder="Ej: Autos, Vida, Hogar, SOAT..." className="w-full bg-[var(--surface-light)] border border-[var(--border)] rounded-xl px-4 py-3 text-[14px] outline-none mt-1 focus:border-[var(--accent)]" autoFocus onKeyDown={e => e.key === "Enter" && handleCreateDeal()} />
            </div>
            <div>
              <label className="text-[11px] text-[var(--text-muted)] uppercase font-medium mb-2 block">Aseguradoras aliadas</label>
              <div className="grid grid-cols-2 gap-2">
                {ASEGURADORAS_ALIADAS.map(aseg => {
                  const sel = newDealAseguradoras.includes(aseg);
                  return (
                    <button key={aseg} type="button" onClick={() => toggleNewDealAseg(aseg)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-[13px] font-medium border transition-all ${
                        sel ? "bg-[var(--accent-glow)] border-[var(--accent)] text-[var(--accent)]" : "bg-[var(--surface-light)] border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)]/50"
                      }`}>
                      <div className={`w-4 h-4 rounded-md flex items-center justify-center border transition-all shrink-0 ${sel ? "bg-[var(--accent)] border-[var(--accent)]" : "border-[var(--border)]"}`}>
                        {sel && <CheckCircle2 size={10} className="text-white" />}
                      </div>
                      {aseg}
                    </button>
                  );
                })}
              </div>
              {newDealAseguradoras.length > 0 && (
                <p className="text-[11px] text-[var(--accent)] mt-2">{newDealAseguradoras.join(", ")}</p>
              )}
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => { setShowNewDeal(false); setNewDealTipo(""); setNewDealAseguradoras([]); }} className="flex-1 px-4 py-3 rounded-xl text-[13px] font-medium border border-[var(--border)] text-[var(--text-muted)]">Cancelar</button>
              <button onClick={handleCreateDeal} disabled={creatingDeal || !newDealTipo.trim()} className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[13px] font-semibold text-white disabled:opacity-50" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))" }}>
                {creatingDeal ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {creatingDeal ? "Creando..." : "Crear Negocio"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// COMPONENTE: muestra las respuestas del formulario público
// ═══════════════════════════════════════════════════════════
interface RespuestaSeccion {
  seccion: string;
  preguntas: { pregunta_id: string; pregunta: string; respuesta: unknown }[];
}
interface RespuestasFormData {
  slug?: string;
  ramo?: string;
  fecha?: string;
  secciones?: RespuestaSeccion[];
  // Compat con formato viejo (array plano)
  respuestas?: { pregunta_id: string; pregunta: string; respuesta: unknown }[];
}

function RespuestasFormulario({ negocioId }: { negocioId: string }) {
  const [origen, setOrigen] = useState<string>("");
  const [data, setData] = useState<RespuestasFormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/negocio/${negocioId}/respuestas`);
        const d = await r.json();
        if (!cancelled && d.ok) {
          setOrigen(d.origen || "manual");
          setData(d.respuestas_formulario || null);
        }
      } catch {} finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [negocioId]);

  if (loading) return null;
  if (origen !== "formulario" || !data) return null;

  // Normalizar: si tiene secciones, usarlas; si no, construir una sección genérica desde respuestas planas
  const secciones: RespuestaSeccion[] = Array.isArray(data.secciones) && data.secciones.length > 0
    ? data.secciones
    : Array.isArray(data.respuestas)
    ? [{ seccion: "Información", preguntas: data.respuestas }]
    : [];

  if (secciones.length === 0) return null;

  const renderRespuesta = (resp: unknown): React.ReactNode => {
    if (resp === null || resp === undefined || resp === "") return <span className="text-[var(--text-muted)] italic">Sin respuesta</span>;
    // Archivo único
    if (typeof resp === "object" && resp !== null && "tipo" in resp && (resp as { tipo: string }).tipo === "archivo") {
      const f = resp as unknown as { nombre: string };
      return <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-[var(--accent-glow)] text-[var(--accent)] rounded-md text-[12px]"><FileText size={12} />{f.nombre}</span>;
    }
    // Array de archivos
    if (Array.isArray(resp) && resp.length > 0 && typeof resp[0] === "object" && resp[0] !== null && "tipo" in resp[0]) {
      return (
        <div className="flex flex-wrap gap-1.5">
          {(resp as unknown as { nombre: string }[]).map((f, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 px-2 py-1 bg-[var(--accent-glow)] text-[var(--accent)] rounded-md text-[12px]"><FileText size={12} />{f.nombre}</span>
          ))}
        </div>
      );
    }
    // Array simple (checkbox)
    if (Array.isArray(resp)) return resp.join(", ");
    return String(resp);
  };

  return (
    <div className="mb-5 p-4 rounded-xl border border-blue-500/30 bg-blue-500/5">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-2 text-left"
      >
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-blue-500" />
          <span className="text-[15px] font-semibold text-blue-500">Respuestas del Formulario</span>
          <span className="px-2 py-0.5 bg-blue-500/10 text-blue-500 text-[10px] font-bold rounded-md uppercase tracking-wide">Vino del formulario</span>
        </div>
        <ChevronDown size={16} className={`text-blue-500 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="mt-4 space-y-4">
          {data.fecha && (
            <p className="text-[11px] text-[var(--text-muted)]">
              Recibido: {new Date(data.fecha).toLocaleString("es-CO")}
            </p>
          )}
          {secciones.map((sec, i) => (
            <div key={i} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3">
              <h4 className="text-[13px] font-semibold text-[var(--text)] mb-3 flex items-center gap-2">
                <span className="w-1 h-4 bg-blue-500 rounded-full" />
                {sec.seccion}
              </h4>
              <div className="space-y-2.5">
                {sec.preguntas.map((qa, j) => (
                  <div key={j} className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-1 md:gap-3 text-[13px]">
                    <span className="text-[var(--text-muted)]">{qa.pregunta}</span>
                    <span className="text-[var(--text)] break-words">{renderRespuesta(qa.respuesta)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

