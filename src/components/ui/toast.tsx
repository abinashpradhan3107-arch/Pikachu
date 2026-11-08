"use client";

import {
  AlertCircle,
  CheckCircle2,
  Info,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

type ToastVariant = "success" | "error" | "info" | "warning";

export type ToastInput = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
};

type ToastItem = ToastInput & { id: string };

type ToastApi = {
  toast: (input: ToastInput | string) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

let toastCounter = 0;

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: "border-emerald-400/25 bg-[#0d1714]",
  error: "border-red-400/25 bg-[#1a0f10]",
  info: "border-sky-400/25 bg-[#0c1319]",
  warning: "border-amber-400/25 bg-[#181307]",
};

const VARIANT_ICONS: Record<ToastVariant, ReactNode> = {
  success: <CheckCircle2 className="size-4 text-emerald-300" />,
  error: <AlertCircle className="size-4 text-red-300" />,
  info: <Info className="size-4 text-sky-300" />,
  warning: <TriangleAlert className="size-4 text-amber-300" />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (input: ToastInput | string) => {
      const value: ToastInput =
        typeof input === "string" ? { title: input } : input;
      const id = `toast-${++toastCounter}`;
      const item: ToastItem = {
        variant: "info",
        duration: 4800,
        ...value,
        id,
      };
      setItems((current) => [...current.slice(-4), item]);
      if (item.duration && item.duration > 0) {
        window.setTimeout(() => dismiss(id), item.duration);
      }
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      toast,
      dismiss,
      success: (title, description) =>
        toast({ title, description, variant: "success" }),
      error: (title, description) =>
        toast({ title, description, variant: "error", duration: 6500 }),
      info: (title, description) => toast({ title, description, variant: "info" }),
      warning: (title, description) =>
        toast({ title, description, variant: "warning" }),
    }),
    [toast, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-3 bottom-3 z-[200] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[380px]"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "animate-fade-up pointer-events-auto flex w-full items-start gap-3 rounded-xl border p-3.5 shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur",
              VARIANT_STYLES[item.variant ?? "info"],
            )}
          >
            <div className="mt-0.5 shrink-0">{VARIANT_ICONS[item.variant ?? "info"]}</div>
            <div className="min-w-0 flex-1">
              <p className="text-[0.82rem] font-semibold text-[#f2f2ef]">
                {item.title}
              </p>
              {item.description ? (
                <p className="mt-0.5 text-[0.76rem] leading-relaxed text-[#9aa1aa]">
                  {item.description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              className="btn btn-ghost btn-icon -m-1 shrink-0 p-1 text-[#6d747d] hover:text-white"
              aria-label="Dismiss notification"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside ToastProvider");
  }
  return context;
}
