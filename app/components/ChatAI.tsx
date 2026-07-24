"use client";
import { useState, useRef, useEffect } from "react";
import { Send, Paperclip, X, FileText, Upload, BarChart3 } from "lucide-react";

interface AnalisisData {
  texto: string;
  footer?: string;
  negocio_id?: string;
}

interface Message {
  role: "user" | "assistant";
  text: string;
  files?: { name: string; size: number }[];
  analisis?: AnalisisData;
}

interface PendingCotizacionUpload {
  endpoint: string;
  data: {
    tipo_registro: string;
    cedula: string;
    negocio_id: string;
    aseguradora: string;
    valor?: string;
    coberturas?: string;
    fecha?: string;
    moneda?: string;
    motivo?: string;
  };
}

// ====== CONFIGURACIÓN - URLs de tu n8n ======
const N8N_BASE = "https://n8n.grupoexcelsior.co/webhook";
const N8N_WEBHOOK_URL = `${N8N_BASE}/chat-seguros`;
const N8N_UPLOAD_URL = `${N8N_BASE}/upload-documento`;
// ============================================

function generateSessionId() {
  return "web_" + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Lee del localStorage el nombre del operador logueado (para autoría de seguimientos, etc). */
function getOperatorName(): string {
  if (typeof window === "undefined") return "Operador";
  try {
    const u = localStorage.getItem("excelsior-user");
    if (!u) return "Operador";
    const parsed = JSON.parse(u);
    return parsed.nombre || parsed.name || parsed.email || "Operador";
  } catch {
    return "Operador";
  }
}

const INITIAL_MESSAGE: Message = {
  role: "assistant",
  text: "¡Hola! Soy el asistente de Excelsior Seguros. ¿En qué puedo ayudarte?\n\nPuedo:\n• Crear un nuevo prospecto (con correo)\n• Agregar documentos a un cliente o subcarpeta\n• Convertir un prospecto a cliente\n• Consultar información de una cédula\n• Revertir un cliente a prospecto\n• Listar clientes o prospectos\n• Crear subcarpetas (una o varias a la vez)\n• Mover documentos entre carpetas\n• Crear/avanzar negocios y agregar seguimientos\n• Gestionar propuestas (subir cotizaciones, marcar no representa)",
};

export default function ChatAI() {
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingCotizacion, setPendingCotizacion] = useState<PendingCotizacionUpload | null>(null);
  const [sessionId] = useState(() => generateSessionId());
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  useEffect(() => {
    chatInputRef.current?.focus();
  }, [messages]);

  /** Sube archivo a WF-30 (subir-cotizacion-chat) usando datos preparados por la IA */
  const uploadCotizacion = async (file: File, ctx: PendingCotizacionUpload): Promise<string> => {
    const base64 = await fileToBase64(file);
    const res = await fetch(`${N8N_BASE}/${ctx.endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...ctx.data,
        archivo: { name: file.name, mimeType: file.type || "application/pdf", base64 },
      }),
    });
    const data = await res.json();
    return data.status === "success"
      ? `✅ ${data.message || "Archivo subido"}\n\n¿Continuamos con la siguiente aseguradora? Dime "continuar propuesta del ${ctx.data.negocio_id}" para ver qué falta.`
      : `⚠️ ${data.message || "Error subiendo el archivo"}`;
  };

  const handleSend = async () => {
    if (!input.trim() && files.length === 0) return;

    const userMsg: Message = {
      role: "user",
      text: input,
      files: files.map((f) => ({ name: f.name, size: f.size })),
    };
    setMessages((prev) => [...prev, userMsg]);

    const currentInput = input;
    const currentFiles = [...files];
    setInput("");
    setFiles([]);

    // CASO ESPECIAL: si hay una cotización pendiente y el usuario subió un archivo,
    // NO mandamos al chat — vamos directo al endpoint de cotización.
    if (pendingCotizacion && currentFiles.length > 0) {
      const ctx = pendingCotizacion;
      setPendingCotizacion(null);
      setIsUploading(true);
      setIsTyping(true);
      try {
        const botResponse = await uploadCotizacion(currentFiles[0], ctx);
        setMessages((prev) => [...prev, { role: "assistant", text: botResponse }]);
      } catch (err) {
        console.error("Cotizacion upload error:", err);
        setMessages((prev) => [...prev, {
          role: "assistant",
          text: "⚠️ Error subiendo la cotización al servidor.\n\nIntenta de nuevo o sube el archivo desde el frontend."
        }]);
      } finally {
        setIsUploading(false);
        setIsTyping(false);
      }
      return;
    }

    setIsTyping(true);

    if (currentFiles.length > 0) {
      setPendingFiles(currentFiles);
    }

    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("excelsior-token") || "" : "";
      const response = await fetch(N8N_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: currentInput,
          session_id: sessionId,
          has_files: currentFiles.length > 0,
          file_names: currentFiles.map((f) => f.name),
          file_count: currentFiles.length,
          token,
          usuario_nombre: getOperatorName(),
        }),
      });

      const data = await response.json();
      let botResponse = data.response || data.output || "No recibí respuesta del servidor.";
      botResponse = typeof botResponse === "string" ? botResponse.replace(/^"|"$/g, "").replace(/\\n/g, "\n") : botResponse;

      // CASO 1: La IA pidió que el usuario suba un archivo (cotización o evidencia no representa)
      if (data.type === "upload_required" && data.upload_endpoint && data.upload_data) {
        // Si en este mismo mensaje ya hay archivos adjuntos, subirlos directamente
        if (currentFiles.length > 0) {
          const ctx: PendingCotizacionUpload = { endpoint: data.upload_endpoint, data: data.upload_data };
          setIsUploading(true);
          try {
            botResponse = await uploadCotizacion(currentFiles[0], ctx);
          } catch (err) {
            console.error("Cotizacion upload error:", err);
            botResponse = "⚠️ Error subiendo la cotización.\n\nIntenta de nuevo.";
          } finally {
            setIsUploading(false);
          }
        } else {
          // Si NO hay archivo todavía, guardar el contexto y esperar a que el usuario lo adjunte
          setPendingCotizacion({ endpoint: data.upload_endpoint, data: data.upload_data });
        }
      }
      // CASO 2: Acción que requiere upload genérico (AGREGAR_DOCUMENTOS clásico)
      else if (data.upload_cedula && (currentFiles.length > 0 || pendingFiles.length > 0)) {
        const filesToUpload = currentFiles.length > 0 ? currentFiles : pendingFiles;
        setMessages((prev) => [...prev, { role: "assistant", text: "📤 Subiendo " + filesToUpload.length + " archivo(s) a la cédula " + data.upload_cedula + "..." }]);
        setIsUploading(true);
        try {
          const fileData = await Promise.all(
            filesToUpload.map(async (f) => ({
              name: f.name,
              mimeType: f.type || "application/octet-stream",
              base64: await fileToBase64(f),
              size: f.size,
            }))
          );
          const uploadRes = await fetch(N8N_UPLOAD_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              cedula: data.upload_cedula,
              subfolder: data.upload_subfolder || "",
              session_id: sessionId,
              files: fileData,
            }),
          });
          const uploadData = await uploadRes.json();
          botResponse = uploadData.status === "success"
            ? "✅ " + (uploadData.message || filesToUpload.length + " archivo(s) subido(s) exitosamente") + "\n\n¿Necesitas algo más?"
            : "⚠️ " + (uploadData.message || "Error subiendo archivos") + "\n\nIntenta de nuevo.";
        } catch (uploadErr) {
          console.error("Upload error:", uploadErr);
          botResponse = "⚠️ Error subiendo archivos al servidor.\n\nIntenta de nuevo.";
        } finally {
          setIsUploading(false);
          setPendingFiles([]);
        }
      }

      setMessages((prev) => {
        const filtered = prev.filter((m) => !m.text.startsWith("📤 Subiendo"));
        // Si la respuesta es un análisis IA, adjuntar estructura especial al mensaje
        if (data.type === "analisis_ia" && data.analisis) {
          return [...filtered, {
            role: "assistant",
            text: botResponse,
            analisis: {
              texto: String(data.analisis),
              footer: data.footer ? String(data.footer) : undefined,
              negocio_id: data.negocio_id ? String(data.negocio_id) : undefined
            }
          }];
        }
        return [...filtered, { role: "assistant", text: botResponse }];
      });
    } catch (error) {
      console.error("Error connecting to n8n:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "⚠️ Error de conexión con el servidor.\n\nVerifica que:\n1. El workflow WF-07 esté activo en n8n\n2. La URL del webhook sea correcta\n3. Tu n8n esté en línea",
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    setFiles((prev) => [...prev, ...droppedFiles]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  return (
    <div
      className="flex flex-col h-[calc(100vh-180px)] animate-fade-in relative"
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 bg-[var(--accent-glow)] border-2 border-dashed border-[var(--accent)] rounded-2xl flex items-center justify-center z-10 backdrop-blur-sm">
          <div className="text-center">
            <Paperclip size={40} className="text-[var(--accent)] mx-auto mb-2" />
            <div className="text-lg font-semibold text-[var(--accent)]">Suelta los archivos aquí</div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 pb-3 mb-3 border-b border-[var(--border)]">
        <div className="w-2 h-2 rounded-full bg-[var(--green)] animate-pulse" />
        <span className="text-[11px] text-[var(--text-muted)]">
          Sesión activa · Conectado a n8n
        </span>
        {isUploading && (
          <span className="text-[11px] text-[var(--accent)] flex items-center gap-1">
            <Upload size={10} className="animate-bounce" /> Subiendo archivos...
          </span>
        )}
        {pendingCotizacion && (
          <span className="text-[11px] text-[var(--accent)]">
            ⏳ Esperando archivo de {pendingCotizacion.data.aseguradora}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col gap-4 pb-4 relative">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-slide-up`}>
            <div className={`${msg.analisis ? "max-w-[90%] w-full" : "max-w-[70%]"} ${msg.analisis ? "" : "px-4 py-3.5"} text-sm leading-relaxed whitespace-pre-line ${
              msg.role === "user"
                ? "bg-gradient-to-r from-[var(--accent)] to-[var(--accent-dark)] text-[var(--bg)] rounded-2xl rounded-br-sm px-4 py-3.5"
                : msg.analisis
                  ? ""
                  : "bg-[var(--surface)] text-[var(--text-primary)] border border-[var(--border)] rounded-2xl rounded-bl-sm"
            }`}>
              {!msg.analisis && msg.text}
              {msg.analisis && (
                <div className="flex flex-col gap-3">
                  {/* Header corto del análisis */}
                  <div className="px-4 py-3 bg-[var(--surface)] border border-[var(--border)] rounded-2xl rounded-bl-sm text-[var(--text-primary)]">
                    {msg.text}
                  </div>
                  {/* Panel destacado con el análisis completo */}
                  <div className="rounded-2xl border border-[#f59e0b]/40 overflow-hidden"
                       style={{ background: "linear-gradient(135deg, rgba(245,158,11,0.08), rgba(245,158,11,0.02))" }}>
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#f59e0b]/30 bg-[#f59e0b]/10">
                      <div className="flex items-center gap-2">
                        <BarChart3 size={14} className="text-[#f59e0b]" />
                        <span className="text-[11px] uppercase font-semibold tracking-wider text-[#f59e0b]">
                          Análisis Técnico IA
                        </span>
                        {msg.analisis.negocio_id && (
                          <span className="text-[10px] text-[var(--text-muted)] font-mono">
                            {msg.analisis.negocio_id}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)]">
                        ✅ Guardado en el negocio
                      </div>
                    </div>
                    <div className="px-4 py-3 text-[13px] leading-relaxed whitespace-pre-wrap text-[var(--text-primary)] max-h-[420px] overflow-y-auto">
                      {msg.analisis.texto}
                    </div>
                    {msg.analisis.footer && (
                      <div className="px-4 py-2.5 border-t border-[#f59e0b]/20 bg-[#f59e0b]/5 text-[11px] italic text-[var(--text-muted)] whitespace-pre-wrap">
                        {msg.analisis.footer}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {msg.files && msg.files.length > 0 && (
                <div className="mt-2 pt-2 border-t border-black/10 flex flex-col gap-1">
                  {msg.files.map((f, j) => (
                    <div key={j} className="flex items-center gap-2 text-xs opacity-80">
                      <FileText size={12} /> {f.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start animate-slide-up">
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl rounded-bl-sm px-5 py-4 flex gap-1.5">
              <div className="w-2 h-2 rounded-full bg-[var(--text-muted)] typing-dot" />
              <div className="w-2 h-2 rounded-full bg-[var(--text-muted)] typing-dot" />
              <div className="w-2 h-2 rounded-full bg-[var(--text-muted)] typing-dot" />
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {files.length > 0 && (
        <div className="flex gap-2 flex-wrap pb-3">
          {files.map((file, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-xs">
              <FileText size={14} className="text-[var(--accent)]" />
              <span className="text-[var(--text-secondary)] max-w-[150px] truncate">{file.name}</span>
              <span className="text-[var(--text-muted)]">({(file.size / 1024).toFixed(0)}KB)</span>
              <button onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} className="text-[var(--red)] hover:text-red-400">
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3 pt-4 border-t border-[var(--border)]">
        <input type="file" ref={fileInputRef} multiple onChange={handleFileSelect} className="hidden" />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-[52px] h-[52px] rounded-xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-all shrink-0"
        >
          <Paperclip size={20} />
        </button>
        <input
          ref={chatInputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
          placeholder={pendingCotizacion ? `Adjunta el archivo de ${pendingCotizacion.data.aseguradora}...` : "Escribe tu mensaje o arrastra archivos aquí..."}
          disabled={isTyping || isUploading}
          autoFocus
          className="flex-1 px-5 py-3.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] text-sm outline-none focus:border-[var(--accent)] transition-colors placeholder:text-[var(--text-muted)] disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={isTyping || isUploading || (!input.trim() && files.length === 0)}
          className="w-[52px] h-[52px] rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent-dark)] flex items-center justify-center text-[var(--bg)] hover:scale-105 transition-transform shrink-0 disabled:opacity-50 disabled:hover:scale-100"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}
