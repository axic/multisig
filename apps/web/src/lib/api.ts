const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8787";

export interface Signer {
  address: string;
  index: number;
}

export interface Wallet {
  id: string;
  chainId: number;
  address: string;
  label?: string | null;
  signersCount: number;
  signersRequired: number;
  nonce: number;
  signers?: Signer[];
}

export interface VoteRow {
  signer: string;
  vote: "None" | "Approved" | "Rejected";
}

export interface OperationRow {
  id: string;
  index: number;
  kind: string;
  /** Decoded fields for display; uint256 values are decimal strings. */
  decoded: Record<string, string | number | undefined>;
  status: "Approvals" | "Rejected" | "Executed";
  approvals: number;
  proposer?: string | null;
  createdTxHash?: string | null;
  executedTxHash?: string | null;
  votes: VoteRow[];
}

export interface WalletDetail extends Wallet {
  signers: Signer[];
  operations: OperationRow[];
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = body?.error
      ? ` — ${typeof body.error === "string" ? body.error : JSON.stringify(body.error)}`
      : "";
    throw new Error(`${res.status} ${res.statusText}${detail}`);
  }
  return (await res.json()) as T;
}

const post = (path: string, body?: unknown) =>
  fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

export interface CreateOperationBody {
  kind: string;
  decoded: Record<string, string | number | undefined>;
  proposer?: string;
  createdTxHash?: string;
  index?: number;
}

export const api = {
  listWallets: () => fetch(`${BASE}/v1/wallets`).then((r) => json<Wallet[]>(r)),

  getWallet: (chainId: number, address: string) =>
    fetch(`${BASE}/v1/wallets/${chainId}/${address}`).then((r) => json<Wallet>(r)),

  registerWallet: (body: {
    chainId: number;
    address: string;
    label?: string;
    deployTxHash?: string;
    deployer?: string;
  }) => post(`/v1/wallets`, body).then((r) => json<Wallet>(r)),

  /** Recompute the cached index from the operation log; returns the full wallet. */
  syncWallet: (chainId: number, address: string) =>
    post(`/v1/wallets/${chainId}/${address}/sync`).then((r) => json<WalletDetail>(r)),

  listOperations: (chainId: number, address: string) =>
    fetch(`${BASE}/v1/wallets/${chainId}/${address}/operations`).then((r) => json<OperationRow[]>(r)),

  createOperation: (chainId: number, address: string, body: CreateOperationBody) =>
    post(`/v1/wallets/${chainId}/${address}/operations`, body).then((r) => json<OperationRow>(r)),

  approveOperation: (id: string, body: { signer: string; txHash?: string }) =>
    post(`/v1/operations/${id}/approve`, body).then((r) => json<OperationRow>(r)),

  rejectOperation: (id: string, body: { signer: string; txHash?: string }) =>
    post(`/v1/operations/${id}/reject`, body).then((r) => json<OperationRow>(r)),

  executeOperation: (id: string, body: { txHash?: string }) =>
    post(`/v1/operations/${id}/execute`, body).then((r) =>
      json<{ operation: OperationRow; skipped: boolean }>(r),
    ),
};
