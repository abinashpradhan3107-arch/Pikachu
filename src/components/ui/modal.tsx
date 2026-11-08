"use client";

import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  dismissible?: boolean;
};

const SIZES = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  dismissible = true,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && dismissible) onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose, dismissible]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[150] flex items-end justify-center overflow-y-auto bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && dismissible) onClose();
      }}
    >
      <div
        className={cn(
          "animate-scale-in relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-[#101216] shadow-[0_30px_90px_rgba(0,0,0,0.6)] sm:rounded-2xl",
          SIZES[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-[0.98rem] font-semibold tracking-tight text-[#f2f2ef]">
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-[0.78rem] leading-relaxed text-[#9aa1aa]">
                {description}
              </p>
            ) : null}
          </div>
          {dismissible ? (
            <button
              type="button"
              onClick={onClose}
              className="btn btn-ghost btn-icon -mr-1 shrink-0"
              aria-label="Close dialog"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/[0.07] bg-black/20 px-5 py-3.5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

type ConfirmDialogProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  busy?: boolean;
  destructive?: boolean;
};

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  busy = false,
  destructive = true,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className={cn("btn", destructive ? "btn-danger" : "btn-primary")}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-[0.84rem] leading-relaxed text-[#9aa1aa]">
        This action cannot be undone.
      </p>
    </Modal>
  );
}
