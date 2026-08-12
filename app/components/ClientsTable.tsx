"use client";
import { useState, useMemo } from "react";
import { ChevronDown, ArrowUpDown, ArrowUp, ArrowDown, X, ChevronRight, UserPlus, Loader2, Calendar } from "lucide-react";
import type { Client } from "../page";

const N8N_API_CLIENTS = "https://n8n.grupoexcelsior.co/webhook/api-clients";

interface ClientsTableProps {
  clients: Client[];
  searchQuery: string;
  loading: boolean;
  onSelectClient: (client: Client) => void;
}

type SortField = "nombre" | "cedula" | "estado" | "tipo_poliza" | "aseguradora" | "fecha";
type SortDir = "asc" | "desc";

function StatusBadge({ status }: { status: string }) {
  const isClient = status === "Cliente";
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
      isClient ? "bg-[var(--green-glow)] text-[var(--green)] border-green-500/30" : "bg-[var(--accent-glow)] text-[var(--accent)] border-amber-500/30"
    }`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

function FilterDropdown({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-flex">
      <button onClick={(e) => { e.stopPropagation(); setOpen(!open); }} className={`inline-flex items-center justify-center w-5 h-5 rounded transition-all ${value ? "text-[var(--accent)] bg-[var(--accent-glow)]" : "text-[var(--text-muted)] opacity-50 hover:opacity-100"}`}>
        <ChevronDown size={11} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-xl z-20 min-w-[140px] py-1 max-h-[200px] overflow-y-auto">
            <button onClick={() => { onChange(""); setOpen(false); }} className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--surface-hover)] ${!value ? "text-[var(--accent)] font-semibold" : "text-[var(--text-secondary)]"}`}>Todos</button>
            {options.map(opt => (
              <button key={opt} onClick={() => { onChange(opt); setOpen(false); }} className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--surface-hover)] ${value === opt ? "text-[var(--accent)] font-semibold" : "text-[var(--text-secondary)]"}`}>{opt}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function ClientsTable({ clients, searchQuery, loading, onSelectClient }: ClientsTableProps) {
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filterEstado, setFilterEstado] = useState("");
  const [filterPoliza, setFilterPoliza] = useState("");
  const [filterAseguradora, setFilterAseguradora] = useState("");
  const [filterFechaDesde, setFilterFechaDesde] = useState("");
  const [filterFechaHasta, setFilterFechaHasta] = useState("");
  // Add prospect form
  const [showAdd, setShowAdd] = useState(false);
  const [addNombre, setAddNombre] = useState("");
  const [addCedula, setAddCedula] = useState("");
  const [addTel, setAddTel] = useState("");
  const [addCorreo, setAddCorreo] = useState("");
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState("");

  const estadoOptions = useMemo(() => [...new Set(clients.map(c => c.estado).filter(Boolean))], [clients]);
  const polizaOptions = useMemo(() => [...new Set(clients.flatMap(c => (c.tipo_poliza || "").split(",").map(t => t.trim())).filter(Boolean))], [clients]);
  const aseguradoraOptions = useMemo(() => [...new Set(clients.flatMap(c => (c.aseguradora || "").split(",").map(t => t.trim())).filter(Boolean))], [clients]);

  const handleSort = (field: SortField) => {
    if (sortField === field) { if (sortDir === "asc") setSortDir("desc"); else setSortField(null); }
    else { setSortField(field); setSortDir("asc"); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown size={11} className="text-[var(--text-muted)] opacity-30" />;
    return sortDir === "asc" ? <ArrowUp size={11} className="text-[var(--accent)]" /> : <ArrowDown size={11} className="text-[var(--accent)]" />;
  };

  // Parsea fechas de cliente (formato colombiano DD/M/YYYY o similar) a timestamp
  const parseClientDate = (raw: string): number => {
    if (!raw) return 0;
    const s = String(raw).trim();
    // Formato DD/M/YYYY o D/M/YYYY o DD/MM/YY
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (m) {
      const d = parseInt(m[1]), mo = parseInt(m[2]) - 1;
      let y = parseInt(m[3]);
      if (y < 100) y += 2000;
      return new Date(y, mo, d).getTime();
    }
    // Fallback ISO
    const t = new Date(s).getTime();
    return isNaN(t) ? 0 : t;
  };

  const processed = useMemo(() => {
    let result = clients.filter(c => c.nombre.toLowerCase().includes(searchQuery.toLowerCase()) || String(c.cedula).includes(searchQuery));
    if (filterEstado) result = result.filter(c => c.estado === filterEstado);
    if (filterPoliza) result = result.filter(c => (c.tipo_poliza || "").includes(filterPoliza));
    if (filterAseguradora) result = result.filter(c => (c.aseguradora || "").includes(filterAseguradora));
    if (filterFechaDesde || filterFechaHasta) {
      const desdeTs = filterFechaDesde ? new Date(filterFechaDesde + "T00:00:00").getTime() : 0;
      const hastaTs = filterFechaHasta ? new Date(filterFechaHasta + "T23:59:59").getTime() : Number.MAX_SAFE_INTEGER;
      result = result.filter(c => {
        const t = parseClientDate(c.fecha);
        if (t === 0) return false;
        return t >= desdeTs && t <= hastaTs;
      });
    }
    if (sortField) {
      result = [...result].sort((a, b) => {
        const vA = (a[sortField] || "").toString().toLowerCase(), vB = (b[sortField] || "").toString().toLowerCase();
        if (sortField === "fecha") {
          const tA = parseClientDate(a.fecha || ""); const tB = parseClientDate(b.fecha || "");
          return sortDir === "asc" ? tA - tB : tB - tA;
        }
        return sortDir === "asc" ? vA.localeCompare(vB) : vB.localeCompare(vA);
      });
    }
    return result;
  }, [clients, searchQuery, filterEstado, filterPoliza, filterAseguradora, filterFechaDesde, filterFechaHasta, sortField, sortDir]);

  const hasFilters = filterEstado || filterPoliza || filterAseguradora || filterFechaDesde || filterFechaHasta;

  const handleAddProspect = async () => {
    if (!addNombre.trim() || !addCedula.trim()) { setAddError("Nombre y cédula son requeridos"); return; }
    setAddSaving(true); setAddError("");
    try {
      const qs = new URLSearchParams({ action: "create_prospect", cedula: addCedula.trim(), nombre: addNombre.trim(), telefono: addTel.trim(), correo: addCorreo.trim() }).toString();
      const res = await fetch(`https://n8n.grupoexcelsior.co/webhook/guardar-negocio?${qs}`);
      const data = await res.json();
      if (data.success || data.action === "prospect_created") {
        setShowAdd(false); setAddNombre(""); setAddCedula(""); setAddTel(""); setAddCorreo("");
        window.location.reload();
      } else { setAddError(data.error || data.message || "Error al crear prospecto"); }
    } catch { setAddError("Error de conexión"); }
    finally { setAddSaving(false); }
  };

  if (loading) return (
    <div className="animate-fade-in">
      <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] overflow-hidden">
        <div className="px-5 py-3.5 bg-[var(--surface-light)] border-b border-[var(--border)]"><div className="h-4 w-32 bg-[var(--surface)] rounded animate-pulse" /></div>
        {[1,2,3,4,5].map(i => <div key={i} className="px-5 py-4 border-b border-[var(--border)]"><div className="h-10 bg-[var(--surface-light)] rounded-lg animate-pulse" /></div>)}
      </div>
    </div>
  );

  const columns: { label: string; field: SortField; filter?: { value: string; onChange: (v:string) => void; options: string[] } }[] = [
    { label: "Nombre", field: "nombre" },
    { label: "Cédula", field: "cedula" },
    { label: "Estado", field: "estado", filter: { value: filterEstado, onChange: setFilterEstado, options: estadoOptions } },
    { label: "Tipo Póliza", field: "tipo_poliza", filter: { value: filterPoliza, onChange: setFilterPoliza, options: polizaOptions } },
    { label: "Aseguradora", field: "aseguradora", filter: { value: filterAseguradora, onChange: setFilterAseguradora, options: aseguradoraOptions } },
    { label: "Fecha", field: "fecha" },
  ];

  return (
    <div className="animate-fade-in">
      {/* Add Prospect Button + Form */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {hasFilters && (
            <>
              <span className="text-xs text-[var(--text-muted)]">Filtros:</span>
              {filterEstado && <button onClick={() => setFilterEstado("")} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--accent-glow)] border border-amber-500/20 text-[var(--accent)] text-xs font-medium">Estado: {filterEstado} <X size={10} /></button>}
              {filterPoliza && <button onClick={() => setFilterPoliza("")} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--accent-glow)] border border-amber-500/20 text-[var(--accent)] text-xs font-medium">Póliza: {filterPoliza} <X size={10} /></button>}
              {filterAseguradora && <button onClick={() => setFilterAseguradora("")} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--accent-glow)] border border-amber-500/20 text-[var(--accent)] text-xs font-medium">Aseg: {filterAseguradora} <X size={10} /></button>}
              {(filterFechaDesde || filterFechaHasta) && <button onClick={() => { setFilterFechaDesde(""); setFilterFechaHasta(""); }} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--accent-glow)] border border-amber-500/20 text-[var(--accent)] text-xs font-medium"><Calendar size={10} />{filterFechaDesde || "…"} → {filterFechaHasta || "…"} <X size={10} /></button>}
              <button onClick={() => { setFilterEstado(""); setFilterPoliza(""); setFilterAseguradora(""); setFilterFechaDesde(""); setFilterFechaHasta(""); }} className="text-xs text-[var(--text-muted)] hover:text-[var(--red)] ml-1">Limpiar</button>
            </>
          )}
        </div>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold text-white" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))" }}>
          <UserPlus size={15} /> Agregar Prospecto
        </button>
      </div>

      {/* Filtro por rango de fechas */}
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <Calendar size={13} />
          <span className="uppercase font-medium">Filtrar por fecha creación:</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-[var(--text-muted)]">Desde</label>
          <input
            type="date"
            value={filterFechaDesde}
            onChange={e => setFilterFechaDesde(e.target.value)}
            max={filterFechaHasta || undefined}
            className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-[var(--text-muted)]">Hasta</label>
          <input
            type="date"
            value={filterFechaHasta}
            onChange={e => setFilterFechaHasta(e.target.value)}
            min={filterFechaDesde || undefined}
            className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]"
          />
        </div>
        {(filterFechaDesde || filterFechaHasta) && (
          <button
            onClick={() => { setFilterFechaDesde(""); setFilterFechaHasta(""); }}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--red)] flex items-center gap-1"
            title="Limpiar rango"
          >
            <X size={11} />Limpiar rango
          </button>
        )}
      </div>

      {/* Add Prospect Modal */}
      {showAdd && (
        <div className="mb-4 rounded-2xl border border-[var(--accent)]/30 bg-[var(--surface)] p-5 space-y-3" style={{ background: "color-mix(in srgb, var(--accent) 3%, var(--surface))" }}>
          <div className="flex items-center justify-between">
            <h3 className="text-[14px] font-bold flex items-center gap-2"><UserPlus size={16} className="text-[var(--accent)]" /> Nuevo Prospecto</h3>
            <button onClick={() => { setShowAdd(false); setAddError(""); }} className="p-1 rounded-lg hover:bg-[var(--surface-light)] text-[var(--text-muted)]"><X size={16} /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-[var(--text-muted)] uppercase font-medium">Nombre completo *</label>
              <input value={addNombre} onChange={e => setAddNombre(e.target.value)} placeholder="Juan Pérez" className="w-full bg-[var(--surface-light)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-[13px] outline-none mt-1 focus:border-[var(--accent)]" />
            </div>
            <div>
              <label className="text-[11px] text-[var(--text-muted)] uppercase font-medium">Cédula *</label>
              <input value={addCedula} onChange={e => setAddCedula(e.target.value)} placeholder="1234567890" className="w-full bg-[var(--surface-light)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-[13px] outline-none mt-1 focus:border-[var(--accent)]" />
            </div>
            <div>
              <label className="text-[11px] text-[var(--text-muted)] uppercase font-medium">Teléfono</label>
              <input value={addTel} onChange={e => setAddTel(e.target.value)} placeholder="300 123 4567" className="w-full bg-[var(--surface-light)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-[13px] outline-none mt-1 focus:border-[var(--accent)]" />
            </div>
            <div>
              <label className="text-[11px] text-[var(--text-muted)] uppercase font-medium">Correo</label>
              <input type="email" value={addCorreo} onChange={e => setAddCorreo(e.target.value)} placeholder="correo@ejemplo.com" className="w-full bg-[var(--surface-light)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-[13px] outline-none mt-1 focus:border-[var(--accent)]" />
            </div>
          </div>
          {addError && <p className="text-[12px] text-[var(--red)]">{addError}</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={() => setShowAdd(false)} className="flex-1 px-4 py-2.5 rounded-xl text-[12px] font-medium border border-[var(--border)] text-[var(--text-muted)]">Cancelar</button>
            <button onClick={handleAddProspect} disabled={addSaving} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-semibold text-white disabled:opacity-60" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))" }}>
              {addSaving ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />}
              {addSaving ? "Creando..." : "Crear Prospecto"}
            </button>
          </div>
        </div>
      )}

      <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-[var(--border)]">
              {columns.map(col => (
                <th key={col.field} className="px-5 py-3.5 text-left bg-[var(--surface-light)]">
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => handleSort(col.field)} className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-semibold hover:text-[var(--text-secondary)]">{col.label} <SortIcon field={col.field} /></button>
                    {col.filter && <FilterDropdown options={col.filter.options} value={col.filter.value} onChange={col.filter.onChange} />}
                  </div>
                </th>
              ))}
              <th className="px-5 py-3.5 bg-[var(--surface-light)]" />
            </tr>
          </thead>
          <tbody>
            {processed.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-12 text-center text-sm text-[var(--text-muted)]">{searchQuery || hasFilters ? "Sin resultados" : "Sin registros"}</td></tr>
            ) : processed.map((client, idx) => (
              <tr key={`${client.cedula}-${idx}`} className="border-b border-[var(--border)] cursor-pointer hover:bg-[var(--surface-hover)] transition-colors group" onClick={() => onSelectClient(client)}>
                <td className="px-5 py-3.5"><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-[10px] bg-[var(--accent-glow)] flex items-center justify-center text-sm font-bold text-[var(--accent)]">{client.nombre.charAt(0)}</div><span className="text-sm font-medium">{client.nombre}</span></div></td>
                <td className="px-5 py-3.5 text-[13px] text-[var(--text-secondary)] font-mono">{client.cedula}</td>
                <td className="px-5 py-3.5"><StatusBadge status={client.estado} /></td>
                <td className="px-5 py-3.5 text-[13px] text-[var(--text-secondary)]">{client.tipo_poliza || "—"}</td>
                <td className="px-5 py-3.5 text-[13px] text-[var(--text-secondary)]">{client.aseguradora || "—"}</td>
                <td className="px-5 py-3.5 text-[13px] text-[var(--text-secondary)]">{client.fecha || "—"}</td>
                <td className="px-5 py-3.5"><ChevronRight size={16} className="text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
