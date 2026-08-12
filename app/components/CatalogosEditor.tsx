"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Trash2, Loader2, Building2, GitBranch, Package, PhoneCall, AlertTriangle, CheckCircle2, X, Percent, Edit2, Save } from "lucide-react";

const N8N_URL = "https://n8n.grupoexcelsior.co/webhook/catalogos";

type CatalogKey = "Aseguradoras" | "Ramos" | "Productos";

interface Item {
  id: number;
  nombre: string;
  created_at?: string;
  aseguradora_id?: number;
  ramo_id?: number;
  comision?: number;
}

async function callAPI(action: "list" | "add" | "update" | "delete", catalog: CatalogKey, extras: Record<string, unknown> = {}) {
  const r = await fetch(N8N_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, catalog, ...extras }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  if (data && (data.error || data.success === false)) throw new Error(data.message || "Error desconocido");
  return data;
}

interface SectionProps {
  catalog: CatalogKey;
  singular: string;
  title: string;
  Icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  color: string;
  glow: string;
  placeholder: string;
  parentId?: number;
  selectedId?: number;
  onSelect?: (item: Item | null) => void;
  cascadeMsg: string;
}

function Section({ catalog, singular, title, Icon, color, glow, placeholder, parentId, selectedId, onSelect, cascadeMsg }: SectionProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newComision, setNewComision] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editComision, setEditComision] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Item | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Para Ramos/Productos, no cargar si no hay parent
  const shouldLoad = catalog === "Aseguradoras" || !!parentId;

  const load = useCallback(async () => {
    if (!shouldLoad) { setItems([]); setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const extras: Record<string, unknown> = {};
      if (parentId) extras.parent_id = parentId;
      const res = await callAPI("list", catalog, extras);
      const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
      setItems(list.sort((a: Item, b: Item) => (a.nombre || "").localeCompare(b.nombre || "")));
    } catch (e) {
      setError(`Error: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally {
      setLoading(false);
    }
  }, [catalog, parentId, shouldLoad]);

  useEffect(() => { load(); }, [load]);

  const doAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    if (items.some(i => (i.nombre || "").toUpperCase() === name.toUpperCase())) {
      setError(`"${name}" ya existe`);
      setTimeout(() => setError(""), 4000);
      return;
    }
    // Validar comision si es Productos
    let comisionNum: number | undefined = undefined;
    if (catalog === "Productos" && newComision.trim() !== "") {
      const parsed = parseFloat(newComision.replace(",", "."));
      if (isNaN(parsed) || parsed < 0 || parsed > 999.99) {
        setError("Comisión inválida. Ingresa un número entre 0 y 999.99");
        setTimeout(() => setError(""), 4000);
        return;
      }
      comisionNum = Math.round(parsed * 100) / 100;
    }
    setAdding(true); setError(""); setSuccess("");
    try {
      const extras: Record<string, unknown> = { nombre: name };
      if (parentId) extras.parent_id = parentId;
      if (comisionNum !== undefined) extras.comision = comisionNum;
      await callAPI("add", catalog, extras);
      setSuccess(`"${name.toUpperCase()}" agregado`);
      setNewName("");
      setNewComision("");
      await load();
      setTimeout(() => setSuccess(""), 3000);
    } catch (e) {
      setError(`No se pudo agregar: ${e instanceof Error ? e.message : "desconocido"}`);
      setTimeout(() => setError(""), 5000);
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (item: Item) => {
    setEditingId(item.id);
    setEditComision(item.comision !== undefined && item.comision !== null ? String(item.comision) : "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditComision("");
  };

  const saveEdit = async (item: Item) => {
    const parsed = parseFloat(editComision.replace(",", "."));
    if (isNaN(parsed) || parsed < 0 || parsed > 999.99) {
      setError("Comisión inválida. Ingresa un número entre 0 y 999.99");
      setTimeout(() => setError(""), 4000);
      return;
    }
    const comisionNum = Math.round(parsed * 100) / 100;
    setSavingEdit(true); setError("");
    try {
      await callAPI("update", catalog, { id: item.id, comision: comisionNum });
      setSuccess(`Comisión actualizada a ${comisionNum}%`);
      cancelEdit();
      await load();
      setTimeout(() => setSuccess(""), 3000);
    } catch (e) {
      setError(`No se pudo actualizar: ${e instanceof Error ? e.message : "desconocido"}`);
      setTimeout(() => setError(""), 5000);
    } finally {
      setSavingEdit(false);
    }
  };

  const doDelete = async () => {
    if (!confirmDel) return;
    setDeleting(true); setError("");
    try {
      await callAPI("delete", catalog, { id: confirmDel.id });
      // Si eliminé el seleccionado, deseleccionar
      if (selectedId === confirmDel.id && onSelect) onSelect(null);
      setSuccess(`"${confirmDel.nombre}" eliminado`);
      setConfirmDel(null);
      await load();
      setTimeout(() => setSuccess(""), 3000);
    } catch (e) {
      setError(`No se pudo eliminar: ${e instanceof Error ? e.message : "desconocido"}`);
      setTimeout(() => setError(""), 5000);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-6 mb-4">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: glow }}>
          <Icon size={20} style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[17px] font-bold text-[var(--text-primary)] truncate">{title}</h3>
          <p className="text-[12px] text-[var(--text-muted)]">
            {loading ? "Cargando..." : `${items.length} ${items.length === 1 ? "registro" : "registros"}`}
            {onSelect && !loading && items.length > 0 && ` · Click para seleccionar`}
          </p>
        </div>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <input
          type="text"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") doAdd(); }}
          placeholder={placeholder}
          disabled={adding}
          className="flex-1 min-w-[200px] bg-[var(--surface-light)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-[14px] outline-none focus:border-[var(--accent)] disabled:opacity-50"
        />
        {catalog === "Productos" && (
          <div className="flex items-center gap-2 bg-[var(--surface-light)] border border-[var(--border)] rounded-xl px-3 py-1 focus-within:border-[var(--green)]">
            <Percent size={14} className="text-[var(--text-muted)]" />
            <input
              type="number"
              step="0.01"
              min="0"
              max="999.99"
              value={newComision}
              onChange={e => setNewComision(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") doAdd(); }}
              placeholder="Comisión %"
              disabled={adding}
              className="w-24 bg-transparent text-[14px] outline-none disabled:opacity-50"
            />
          </div>
        )}
        <button
          onClick={doAdd}
          disabled={!newName.trim() || adding}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-white text-[14px] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          style={{ background: color }}
        >
          {adding ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          Agregar {singular}
        </button>
      </div>

      {error && (
        <div className="mb-3 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--red-glow)] border border-red-500/30">
          <AlertTriangle size={14} className="text-[var(--red)] shrink-0" />
          <span className="text-[13px] text-[var(--red)] flex-1">{error}</span>
        </div>
      )}
      {success && (
        <div className="mb-3 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--green-glow)] border border-green-500/30">
          <CheckCircle2 size={14} className="text-[var(--green)] shrink-0" />
          <span className="text-[13px] text-[var(--green)] flex-1">{success}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-6 text-[var(--text-muted)]">
          <Loader2 size={18} className="animate-spin mr-2" />
          <span className="text-[13px]">Cargando...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="py-6 text-center">
          <p className="text-[13px] text-[var(--text-muted)]">Sin {catalog.toLowerCase()} aún. Agrega el primero arriba.</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map(it => {
            const isSelected = selectedId === it.id;
            const isSelectable = !!onSelect;
            const isProducto = catalog === "Productos";
            const isEditing = editingId === it.id;
            return (
              <div
                key={it.id}
                onClick={() => isSelectable && !isEditing && onSelect(isSelected ? null : it)}
                className={`group flex items-center gap-2 rounded-lg px-3 py-2.5 border transition-all ${
                  isSelected
                    ? "border-transparent shadow-md"
                    : `bg-[var(--surface-light)] border-[var(--border)] ${isSelectable ? "hover:border-opacity-70" : ""}`
                } ${isSelectable && !isEditing ? "cursor-pointer" : ""}`}
                style={isSelected ? { background: glow, borderColor: color, borderWidth: "2px" } : {}}
              >
                <span
                  className="text-[13px] font-medium truncate max-w-[180px]"
                  style={isSelected ? { color } : { color: "var(--text-primary)" }}
                >
                  {it.nombre}
                </span>
                {isProducto && !isEditing && (
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--green-glow)]">
                    <Percent size={10} className="text-[var(--green)]" />
                    <span className="text-[11px] font-semibold text-[var(--green)]">
                      {it.comision !== undefined && it.comision !== null ? Number(it.comision).toFixed(2) : "0.00"}
                    </span>
                  </div>
                )}
                {isProducto && isEditing && (
                  <div className="flex items-center gap-1 bg-[var(--surface)] border border-[var(--green)] rounded-md px-2 py-0.5" onClick={e => e.stopPropagation()}>
                    <Percent size={10} className="text-[var(--green)]" />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="999.99"
                      value={editComision}
                      onChange={e => setEditComision(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") saveEdit(it); if (e.key === "Escape") cancelEdit(); }}
                      className="w-14 bg-transparent text-[11px] font-semibold text-[var(--green)] outline-none"
                      autoFocus
                    />
                  </div>
                )}
                {isSelected && !isEditing && <CheckCircle2 size={13} style={{ color }} className="shrink-0" />}
                {isProducto && !isEditing && (
                  <button
                    onClick={(e) => { e.stopPropagation(); startEdit(it); }}
                    className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent-glow)] opacity-40 group-hover:opacity-100 transition-all shrink-0"
                    title="Editar comisión"
                  >
                    <Edit2 size={11} />
                  </button>
                )}
                {isProducto && isEditing && (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); saveEdit(it); }}
                      disabled={savingEdit}
                      className="p-1 rounded text-[var(--green)] hover:bg-[var(--green-glow)] transition-all shrink-0"
                      title="Guardar"
                    >
                      {savingEdit ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); cancelEdit(); }}
                      disabled={savingEdit}
                      className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--red)] hover:bg-[var(--red-glow)] transition-all shrink-0"
                      title="Cancelar"
                    >
                      <X size={11} />
                    </button>
                  </>
                )}
                {!isEditing && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDel(it); }}
                    className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--red)] hover:bg-[var(--red-glow)] opacity-40 group-hover:opacity-100 transition-all shrink-0"
                    title={`Eliminar ${singular}`}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {confirmDel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => !deleting && setConfirmDel(null)}>
          <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[var(--red-glow)] flex items-center justify-center shrink-0">
                <AlertTriangle size={20} className="text-[var(--red)]" />
              </div>
              <div className="flex-1">
                <h4 className="text-[16px] font-bold text-[var(--text-primary)]">¿Eliminar {singular}?</h4>
                <p className="text-[13px] text-[var(--text-secondary)] mt-1">
                  Se eliminará <strong>{confirmDel.nombre}</strong>. {cascadeMsg}
                </p>
                {catalog !== "Productos" && (
                  <p className="text-[12px] text-[var(--red)] mt-2 font-medium">
                    ⚠️ Esta acción NO se puede deshacer.
                  </p>
                )}
              </div>
              {!deleting && <button onClick={() => setConfirmDel(null)} className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X size={16} /></button>}
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDel(null)} disabled={deleting} className="px-4 py-2 rounded-xl text-[13px] font-medium bg-[var(--surface-light)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50">Cancelar</button>
              <button onClick={doDelete} disabled={deleting} className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-medium bg-[var(--red)] text-white disabled:opacity-50">
                {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CatalogosEditor() {
  const [selectedAseg, setSelectedAseg] = useState<Item | null>(null);
  const [selectedRamo, setSelectedRamo] = useState<Item | null>(null);
  const ramosRef = useRef<HTMLDivElement>(null);
  const productosRef = useRef<HTMLDivElement>(null);

  // Auto-scroll a la nueva sección cuando se abre
  useEffect(() => {
    if (selectedAseg && ramosRef.current) {
      setTimeout(() => ramosRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 100);
    }
  }, [selectedAseg]);

  useEffect(() => {
    if (selectedRamo && productosRef.current) {
      setTimeout(() => productosRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 100);
    }
  }, [selectedRamo]);

  // Al cambiar de aseguradora, resetear ramo seleccionado
  const handleAsegSelect = (item: Item | null) => {
    setSelectedAseg(item);
    setSelectedRamo(null);
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Nivel 1: Aseguradoras */}
      <Section
        catalog="Aseguradoras"
        singular="aseguradora"
        title="Aseguradoras"
        Icon={Building2}
        color="var(--accent)"
        glow="var(--accent-glow)"
        placeholder="Ej. SURA, MAPFRE, POSITIVA..."
        selectedId={selectedAseg?.id}
        onSelect={handleAsegSelect}
        cascadeMsg="Se eliminarán TODOS los ramos y productos asociados."
      />

      {/* Nivel 2: Ramos (solo si hay aseguradora seleccionada) */}
      {selectedAseg && (
        <div ref={ramosRef}>
          <Section
            catalog="Ramos"
            singular="ramo"
            title={`Ramos de ${selectedAseg.nombre}`}
            Icon={GitBranch}
            color="var(--purple)"
            glow="rgba(139,92,246,0.15)"
            placeholder="Ej. HOGAR, AUTOS, VIDA..."
            parentId={selectedAseg.id}
            selectedId={selectedRamo?.id}
            onSelect={setSelectedRamo}
            cascadeMsg="Se eliminarán TODOS los productos de este ramo."
          />
        </div>
      )}

      {/* Nivel 3: Productos (solo si hay ramo seleccionado) */}
      {selectedRamo && (
        <div ref={productosRef}>
          <Section
            catalog="Productos"
            singular="producto"
            title={`Productos de ${selectedRamo.nombre}`}
            Icon={Package}
            color="var(--green)"
            glow="var(--green-glow)"
            placeholder="Ej. TODO RIESGO, RC EVENTOS..."
            parentId={selectedRamo.id}
            cascadeMsg="Se eliminará solo este producto."
          />
        </div>
      )}

      {/* Placeholder - Info Contacto Inicial */}
      <div className="bg-[var(--surface)] rounded-2xl border border-dashed border-[var(--border)] p-6 opacity-60 mt-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--surface-light)] flex items-center justify-center">
            <PhoneCall size={20} className="text-[var(--text-muted)]" />
          </div>
          <div className="flex-1">
            <h3 className="text-[18px] font-bold text-[var(--text-muted)]">Info Contacto Inicial</h3>
            <p className="text-[12px] text-[var(--text-muted)]">Próximamente</p>
          </div>
        </div>
      </div>
    </div>
  );
}
