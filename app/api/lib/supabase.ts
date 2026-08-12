// Helper para llamadas server-side a Supabase usando la secret key.
// Solo se importa desde route handlers (API routes) — NUNCA desde un Client Component.

const SB_URL = "https://uytlatezbqphqgauuvcl.supabase.co/rest/v1";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5dGxhdGV6YnFwaHFnYXV1dmNsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTU5NTI4MCwiZXhwIjoyMDkxMTcxMjgwfQ.HcFRwns1UQaW5-c6yLcSBqYyST4nivLqN3cvvEaAzqY";

const baseHeaders = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  "Content-Type": "application/json",
};

export async function sbSelect<T = unknown>(table: string, query = ""): Promise<T[]> {
  const sep = query.startsWith("?") ? "" : "?";
  const url = `${SB_URL}/${table}${query ? sep + query.replace(/^\?/, "") : ""}`;
  const r = await fetch(url, { headers: baseHeaders, cache: "no-store" });
  if (!r.ok) throw new Error(`Supabase select ${table} ${r.status}: ${await r.text()}`);
  return r.json();
}

export async function sbInsert<T = unknown>(table: string, body: unknown, returning = true): Promise<T> {
  const url = `${SB_URL}/${table}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { ...baseHeaders, Prefer: returning ? "return=representation" : "return=minimal" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Supabase insert ${table} ${r.status}: ${await r.text()}`);
  if (!returning) return undefined as T;
  const data = await r.json();
  return Array.isArray(data) && data.length === 1 ? data[0] : data;
}

export async function sbUpdate<T = unknown>(table: string, filter: string, body: unknown, returning = true): Promise<T> {
  const url = `${SB_URL}/${table}?${filter}`;
  const r = await fetch(url, {
    method: "PATCH",
    headers: { ...baseHeaders, Prefer: returning ? "return=representation" : "return=minimal" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Supabase update ${table} ${r.status}: ${await r.text()}`);
  if (!returning) return undefined as T;
  const data = await r.json();
  return Array.isArray(data) && data.length === 1 ? data[0] : data;
}

export async function sbDelete(table: string, filter: string): Promise<void> {
  const url = `${SB_URL}/${table}?${filter}`;
  const r = await fetch(url, { method: "DELETE", headers: baseHeaders });
  if (!r.ok) throw new Error(`Supabase delete ${table} ${r.status}: ${await r.text()}`);
}
