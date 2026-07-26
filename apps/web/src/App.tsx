import { Outlet } from "react-router-dom";
import { useAccount } from "wagmi";
import { ConnectWallet } from "./ConnectWallet.js";
import { AppShell, type NavItem } from "./components/index.js";

const NAV: NavItem[] = [
  { label: "Wallets", to: "/", end: true },
  { label: "New wallet", to: "/new" },
  { label: "Foundations", to: "/foundations" },
];

export function App() {
  const { chain } = useAccount();
  return (
    <AppShell
      nav={NAV}
      actions={
        <>
          <span className="font-mono text-[11px] text-muted">{chain?.name ?? "not connected"}</span>
          <ConnectWallet />
        </>
      }
    >
      <Outlet />
    </AppShell>
  );
}
