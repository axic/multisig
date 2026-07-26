import { Outlet } from "react-router-dom";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { AppShell, Button, type NavItem } from "./components/index.js";
import { truncateAddress } from "./lib/format.js";

const NAV: NavItem[] = [
  { label: "Wallets", to: "/", end: true },
  { label: "New wallet", to: "/new" },
  { label: "Foundations", to: "/foundations" },
];

function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address)
    return (
      <Button variant="secondary" size="sm" className="font-mono" onClick={() => disconnect()}>
        {truncateAddress(address)}
      </Button>
    );

  const injected = connectors[0];
  return (
    <Button size="sm" disabled={!injected} onClick={() => injected && connect({ connector: injected })}>
      Connect wallet
    </Button>
  );
}

export function App() {
  const { chain } = useAccount();
  return (
    <AppShell
      nav={NAV}
      actions={
        <>
          <span className="font-mono text-[11px] text-muted">{chain?.name ?? "not connected"}</span>
          <ConnectButton />
        </>
      }
    >
      <Outlet />
    </AppShell>
  );
}
