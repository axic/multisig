import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { Logo } from "./Logo.js";

/**
 * The application shell — a fixed sidebar and a titled content column, drawn in
 * 1px line borders with panel fills for state. Light-first; the dark parity
 * surface is one token swap away (see `d-` colours in the Tailwind config).
 */
export interface NavItem {
  label: string;
  to: string;
  /** Match only the exact path (for the index route). */
  end?: boolean;
}

export interface AppShellProps {
  nav: NavItem[];
  /** Mono footer lines under the nav (threshold, wallet address). */
  meta?: ReactNode;
  /** Page title in the content header. Omit to let the page own its heading. */
  title?: ReactNode;
  /** Right side of the content header (network label, actions). */
  actions?: ReactNode;
  children: ReactNode;
}

export function AppShell({ nav, meta, title, actions, children }: AppShellProps) {
  return (
    <div className="mx-auto flex min-h-screen max-w-[1180px] border-x border-line">
      <aside className="flex w-[220px] flex-none flex-col border-r border-line py-5">
        <div className="px-5 pb-6">
          <Logo size={20} />
        </div>
        <nav className="flex flex-col">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                [
                  "border-l-2 px-5 py-3 text-sm transition-colors",
                  isActive
                    ? "border-signal bg-panel font-medium text-ink"
                    : "border-transparent text-body hover:bg-panel hover:text-ink",
                ].join(" ")
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        {meta && <div className="mt-auto px-5 font-mono text-[11px] leading-relaxed text-muted">{meta}</div>}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-line px-6">
          <span className="text-[19px] font-medium tracking-tight">{title}</span>
          <div className="flex items-center gap-2.5">{actions}</div>
        </header>
        {/* title may be empty; the header row still carries actions/network. */}
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
