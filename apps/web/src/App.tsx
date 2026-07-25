import { Link, Outlet } from "react-router-dom";
import { useAccount, useConnect, useDisconnect } from "wagmi";

function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected)
    return (
      <button className="rounded bg-gray-200 px-3 py-1.5 text-sm" onClick={() => disconnect()}>
        {address?.slice(0, 6)}…{address?.slice(-4)}
      </button>
    );

  const injected = connectors[0];
  return (
    <button
      className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-40"
      disabled={!injected}
      onClick={() => injected && connect({ connector: injected })}
    >
      Connect wallet
    </button>
  );
}

export function App() {
  return (
    <div className="mx-auto max-w-4xl px-4">
      <header className="flex items-center justify-between border-b py-4">
        <nav className="flex items-center gap-4 text-sm font-medium">
          <Link to="/">Multisig</Link>
          <Link to="/new" className="text-gray-500">
            New wallet
          </Link>
        </nav>
        <ConnectButton />
      </header>
      <main className="py-6">
        <Outlet />
      </main>
    </div>
  );
}
