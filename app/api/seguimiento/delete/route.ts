import { NextRequest, NextResponse } from "next/server";

const SB = "https://uytlatezbqphqgauuvcl.supabase.co/rest/v1";
const KEY = "sb_secret_oZ9AB9pNw5W8VFKWYCxUyQ_nEQtJGt3";

const sbHeaders = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=minimal",
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Convierte "29/4/2026" o "2026-04-29" al formato ISO YYYY-MM-DD */
function toISO(fecha: string): string | null {
  if (!fecha) return null;
  const f = fecha.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(f)) return f;
  const m = f.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const dd = m[1].padStart(2, "0");
    const mm = m[2].padStart(2, "0");
    return `${m[3]}-${mm}-${dd}`;
  }
  return null;
}

/** Extrae la nota "real" sin el prefijo [autor], que es como WF-20 la guarda en la descripción del recordatorio */
function notaSinAutor(nota: string): string {
  // El frontend guarda como "[autor] texto" y WF-20 al crear la alerta usa la nota tal cual viene del create_alert
  // que es la nota completa con prefijo. Pero al hacer save_seguimiento_from_alert, la nota se guarda con [autor]
  // En el create_alert se manda: descripcion: `Seguimiento ${tipo}: ${nota}` donde nota es la del input sin prefijo.
  // Como mejor approximation: extraemos lo que viene después del primer "] "
  const m = nota.match(/^\[[^\]]+\]\s*(.+)$/);
  return m ? m[1].trim() : nota.trim();
}

export async function POST(req: NextRequest) {
  try {
    const { negocio_id, fecha, nota, id } = await req.json();
    if (!negocio_id || !fecha || !nota) {
      return NextResponse.json({ ok: false, error: "Faltan campos: negocio_id, fecha, nota" }, { status: 400 });
    }

    // 1) Borrar el seguimiento
    // Si viene `id` (row uuid de la tabla Seguimientos), usar ese para borrar EXACTAMENTE 1 fila.
    // Si no viene (compat legacy), borrar por negocio_id + fecha + nota (puede afectar múltiples si hay duplicados).
    const segParams = id
      ? new URLSearchParams({ id: `eq.${id}` })
      : new URLSearchParams({
          negocio_id: `eq.${negocio_id}`,
          fecha: `eq.${fecha}`,
          nota: `eq.${nota}`,
        });
    const rSeg = await fetch(`${SB}/Seguimientos?${segParams}`, {
      method: "DELETE",
      headers: sbHeaders,
    });
    if (!rSeg.ok) {
      const txt = await rSeg.text();
      return NextResponse.json({ ok: false, error: `Supabase Seguimientos ${rSeg.status}: ${txt.substring(0, 200)}` }, { status: rSeg.status });
    }

    // 2) Borrar SOLO UNA alerta cuya descripción contenga la nota específica del seguimiento.
    //    WF-20 crea la alerta con descripcion: `Seguimiento ${tipo_poliza}: ${nota_sin_prefijo}`.
    //    Para no tocar otras alertas con la misma fecha, filtramos por descripcion ilike *nota* y
    //    borramos SOLO la primera coincidencia (la más antigua) — así si hay duplicados en Recordatorios,
    //    solo se elimina 1 por cada seguimiento eliminado.
    let alertasEliminadas = 0;
    const fechaISO = toISO(fecha);
    const notaLimpia = notaSinAutor(nota);

    if (fechaISO && notaLimpia.length >= 3) {
      try {
        // Limpia caracteres especiales para el LIKE pattern de Postgres (escape de %, _, *)
        const notaForFilter = notaLimpia
          .replace(/[%_*]/g, "")  // Caracteres reservados de LIKE
          .substring(0, 100);     // Truncar para evitar URLs muy largas

        if (notaForFilter.length >= 3) {
          // Primero buscar las alertas que coinciden con todos los criterios, ordenadas por fecha de creación
          const checkParams = new URLSearchParams({
            negocio_id: `eq.${negocio_id}`,
            fecha_alerta: `eq.${fechaISO}`,
            activa: `eq.true`,
            descripcion: `ilike.*${notaForFilter}*`,
            select: "recordatorio_id",
            order: "created_at.asc",
          });
          const rCheck = await fetch(`${SB}/Recordatorios?${checkParams}`, {
            headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
          });
          if (rCheck.ok) {
            const arr = (await rCheck.json()) as Array<{ recordatorio_id: string }>;
            // Eliminar SOLO la primera coincidencia (la más antigua) para no borrar todas si hay duplicados.
            // Esto es 1 alerta borrada por cada 1 seguimiento borrado — cardinalidad 1:1.
            if (arr.length > 0) {
              const idToDelete = arr[0].recordatorio_id;
              const deleteParams = new URLSearchParams({
                recordatorio_id: `eq.${idToDelete}`,
              });
              await fetch(`${SB}/Recordatorios?${deleteParams}`, {
                method: "DELETE",
                headers: sbHeaders,
              });
              alertasEliminadas = 1;
            }
          }
        }
      } catch {
        // Si falla el borrado de alertas, no abortamos: el seguimiento ya fue borrado.
      }
    }

    return NextResponse.json({
      ok: true,
      alertas_eliminadas: alertasEliminadas,
      fecha_iso: fechaISO,
      nota_limpia: notaLimpia,
      metodo: id ? "por_id" : "por_fecha_nota",
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
