import { useEffect, useRef, useState } from "react";
import { useAccount, useChains, useSwitchChain } from "wagmi";

/**
 * Network switcher for the app chrome, sitting next to Connect wallet.
 *
 * Lists the chains configured in `wagmi.ts` (resolved from VITE_* env) and
 * switches the connected wallet between them via `useSwitchChain`. We roll our
 * own dropdown rather than pull in a UI library so it matches the Coram design
 * system — a 1px-bordered trigger with a line-bordered menu panel.
 *
 * While disconnected there's no wallet to switch, so the trigger is disabled
 * and simply reports "not connected", mirroring the label it replaces.
 */
export function ChainSelector() {
  const chains = useChains();
  const { chain, isConnected } = useAccount();
  const { switchChain, isPending, variables } = useSwitchChain();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Dismiss on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = isConnected ? (chain?.name ?? "unknown network") : "not connected";
  const disabled = !isConnected || chains.length < 2;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={[
          "inline-flex items-center gap-1.5 border border-line px-3 py-2 font-mono text-[11px] text-muted transition-colors",
          "disabled:cursor-not-allowed disabled:opacity-70",
          disabled ? "" : "hover:border-ink hover:text-ink",
        ].join(" ")}
      >
        <span className={chain ? "inline-block h-1.5 w-1.5 rounded-full bg-signal" : "hidden"} aria-hidden />
        {label}
        {!disabled && <span className="text-[9px] leading-none">▾</span>}
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full z-50 mt-1 flex min-w-[180px] flex-col border border-ink bg-paper py-1"
        >
          {chains.map((c) => {
            const active = c.id === chain?.id;
            const pending = isPending && variables?.chainId === c.id;
            return (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={active}
                disabled={isPending}
                onClick={() => switchChain({ chainId: c.id }, { onSuccess: () => setOpen(false) })}
                className={[
                  "flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors",
                  "disabled:cursor-not-allowed",
                  active ? "font-medium text-ink" : "text-body hover:bg-panel hover:text-ink",
                ].join(" ")}
              >
                <span
                  className={active ? "text-signal" : "text-transparent"}
                  aria-hidden
                >
                  ✓
                </span>
                <span className="flex-1">{c.name}</span>
                {pending && <span className="font-mono text-[10px] text-muted">switching…</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
