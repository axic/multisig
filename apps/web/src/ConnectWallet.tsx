import { useState } from "react";
import { type Connector, useAccount, useConnect, useDisconnect } from "wagmi";
import { Button, Modal } from "./components/index.js";
import { truncateAddress } from "./lib/format.js";

/**
 * Wallet connection for the app chrome.
 *
 * We deliberately don't pull in a prebuilt modal (RainbowKit / ConnectKit /
 * Reown AppKit): wagmi already discovers every injected wallet (EIP-6963) and
 * exposes WalletConnect as a connector, so the "selector" is just a list over
 * `useConnect().connectors` rendered with the Coram design system. Zero extra
 * dependencies, and the UI matches the rest of the app.
 */

/** Friendly label + one-line hint, keyed off the connector kind. */
function describe(c: Connector): { label: string; hint: string } {
  switch (c.type) {
    case "injected":
      // Named EIP-6963 wallets (MetaMask, Rabby, …) keep their own name; the
      // generic shim reports "Injected".
      return c.name === "Injected"
        ? { label: "Browser wallet", hint: "MetaMask, Rabby, and other extensions" }
        : { label: c.name, hint: "Browser extension" };
    case "walletConnect":
      return { label: "WalletConnect", hint: "Scan with a mobile wallet" };
    default:
      return { label: c.name, hint: "" };
  }
}

/** Drop duplicate entries (the injected shim can echo a discovered wallet). */
function dedupe(connectors: readonly Connector[]): Connector[] {
  const seen = new Set<string>();
  return connectors.filter((c) => {
    const key = c.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function ConnectWallet() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending, error, variables } = useConnect();
  const { disconnect } = useDisconnect();
  const [open, setOpen] = useState(false);

  if (isConnected && address)
    return (
      <Button variant="secondary" size="sm" className="font-mono" onClick={() => disconnect()}>
        {truncateAddress(address)}
      </Button>
    );

  const options = dedupe(connectors);

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Connect wallet
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Connect a wallet">
        <div className="flex flex-col gap-2">
          {options.length === 0 && <p className="text-sm text-muted">No wallet connectors are configured.</p>}
          {options.map((c) => {
            const { label, hint } = describe(c);
            const pending = isPending && variables?.connector === c;
            return (
              <button
                key={c.uid}
                type="button"
                disabled={isPending}
                onClick={() => connect({ connector: c }, { onSuccess: () => setOpen(false) })}
                className="flex items-center gap-3 border border-line px-4 py-3 text-left transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-60"
              >
                {c.icon && <img src={c.icon} alt="" className="h-6 w-6 shrink-0" />}
                <span className="flex flex-col">
                  <span className="text-sm font-medium text-ink">{label}</span>
                  {hint && <span className="text-[11px] text-muted">{hint}</span>}
                </span>
                {pending && <span className="ml-auto font-mono text-[11px] text-muted">connecting…</span>}
              </button>
            );
          })}
          {error && <p className="text-xs text-signal">{error.message}</p>}
        </div>
      </Modal>
    </>
  );
}
