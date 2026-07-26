import type { HTMLAttributes, ReactNode } from "react";

/**
 * A bordered panel. Elevation is expressed by border and fill, never shadow.
 * Optional `title` renders the mono uppercase header bar seen throughout the
 * system (Buttons / Inputs / Data display cards).
 */
export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: ReactNode;
  /** Slot on the right of the header row. */
  action?: ReactNode;
  /** Remove body padding — for cards that hold their own list/table. */
  flush?: boolean;
  children?: ReactNode;
}

export function Card({ title, action, flush = false, className = "", children, ...props }: CardProps) {
  return (
    <div className={`border border-line bg-paper ${className}`} {...props}>
      {title && (
        <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-4">
          <span className="font-mono text-[11px] uppercase tracking-label text-muted">{title}</span>
          {action}
        </div>
      )}
      <div className={flush ? "" : "p-6"}>{children}</div>
    </div>
  );
}

/** The recurring mono micro-cap that names a value or a group. */
export function Label({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <span className={`font-mono text-[11px] uppercase tracking-label text-muted ${className}`}>{children}</span>
  );
}
