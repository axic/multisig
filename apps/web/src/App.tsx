import { Outlet } from "react-router-dom";
import { ChainSelector } from "./ChainSelector.js";
import { ConnectWallet } from "./ConnectWallet.js";
import { AppShell, type NavItem } from "./components/index.js";

const NAV: NavItem[] = [
  { label: "Wallets", to: "/", end: true },
  { label: "New wallet", to: "/new" },
  { label: "Foundations", to: "/foundations" },
];

export function App() {
  return (
    <AppShell
      nav={NAV}
      actions={
        <>
          <ChainSelector />
          <ConnectWallet />
        </>
      }
    >
      <Outlet />
    </AppShell>
  );
}
