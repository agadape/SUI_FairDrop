"use client";

import { createContext, useContext, useState, useCallback, useRef, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";

export type ToastKind = "success" | "error" | "info" | "pending";
export type Toast = { id: number; kind: ToastKind; title: string; detail?: string; href?: string };

type ToastCtx = {
  push: (t: Omit<Toast, "id">) => number;
  update: (id: number, patch: Partial<Omit<Toast, "id">>) => void;
  dismiss: (id: number) => void;
};

const Ctx = createContext<ToastCtx | null>(null);

export function useToast(): ToastCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useToast must be used within <ToastProvider>");
  return c;
}

const TONE: Record<ToastKind, string> = {
  success: "border-emerald-500/40 bg-emerald-950/40 text-emerald-200",
  error: "border-red-500/40 bg-red-950/40 text-red-200",
  info: "border-cyan-500/40 bg-cyan-950/40 text-cyan-200",
  pending: "border-amber-500/40 bg-amber-950/40 text-amber-200",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const dismiss = useCallback((id: number) => {
    setToasts((s) => s.filter((t) => t.id !== id));
    if (timers.current[id]) { clearTimeout(timers.current[id]); delete timers.current[id]; }
  }, []);

  const arm = useCallback((id: number, kind: ToastKind) => {
    if (timers.current[id]) clearTimeout(timers.current[id]);
    if (kind !== "pending") timers.current[id] = setTimeout(() => dismiss(id), 5500);
  }, [dismiss]);

  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = ++seq.current;
    setToasts((s) => [...s, { ...t, id }]);
    arm(id, t.kind);
    return id;
  }, [arm]);

  const update = useCallback((id: number, patch: Partial<Omit<Toast, "id">>) => {
    setToasts((s) => s.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    if (patch.kind) arm(id, patch.kind);
  }, [arm]);

  return (
    <Ctx.Provider value={{ push, update, dismiss }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-[min(92vw,360px)]">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 40, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 320, damping: 26 }}
              className={`rounded-xl border px-4 py-3 shadow-lg backdrop-blur-md ${TONE[t.kind]}`}
            >
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex-shrink-0">
                  {t.kind === "pending" ? (
                    <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                  ) : t.kind === "success" ? "✓" : t.kind === "error" ? "✕" : "ℹ"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-snug">{t.title}</p>
                  {t.detail && <p className="text-[12px] opacity-80 mt-0.5 break-words">{t.detail}</p>}
                  {t.href && (
                    <a href={t.href} target="_blank" rel="noopener noreferrer" className="text-[12px] underline mt-1 inline-block">
                      View on SuiScan ↗
                    </a>
                  )}
                </div>
                <button onClick={() => dismiss(t.id)} className="flex-shrink-0 opacity-50 hover:opacity-100 text-sm leading-none">✕</button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}
