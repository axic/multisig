import { useEffect } from "react";
import type { ReactNode } from "react";
import { Mark } from "./Mark.js";

/**
 * A modal dialog. Bordered in ink (not line) to lift it off the scrim; header
 * carries the mark, body is caller-supplied, footer holds the actions. Escape
 * and scrim-click both dismiss.
 */
export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  /** Action row, right-aligned in the footer. */
  footer?: ReactNode;
}

export function Modal({ open, onClose, title, children, footer }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-[460px] border border-ink bg-paper"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3.5 border-b border-line px-7 py-6">
          <Mark size={20} />
          <span className="text-[17px] font-bold tracking-tight">{title}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto font-mono text-base text-muted hover:text-ink"
          >
            ×
          </button>
        </div>
        <div className="flex flex-col gap-4 p-7">{children}</div>
        {footer && <div className="flex justify-end gap-3 border-t border-line px-7 py-5">{footer}</div>}
      </div>
    </div>
  );
}
