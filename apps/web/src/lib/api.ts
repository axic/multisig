const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8787";

export interface Wallet {
  id: string;
  chainId: number;
  address: string;
  label?: string | null;
  signersCount: number;
  signersRequired: number;
  nonce: number;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export const api = {
  listWallets: () => fetch(`${BASE}/v1/wallets`).then((r) => json<Wallet[]>(r)),
  getWallet: (chainId: number, address: string) =>
    fetch(`${BASE}/v1/wallets/${chainId}/${address}`).then((r) => json<Wallet>(r)),
  registerWallet: (body: { chainId: number; address: string; label?: string; deployTxHash?: string }) =>
    fetch(`${BASE}/v1/wallets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => json<Wallet>(r)),
};
