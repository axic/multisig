import type { OperationTag } from "@multisig/core";

const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8787";

export interface Signer {
  id: string;
  walletId: string;
  address: string;
  index: number;
}

export interface Vote {
  id: string;
  operationId: string;
  signer: string;
  vote: "None" | "Approved" | "Rejected";
}

/** Decoded fields for display; shape depends on `kind`. */
export type OperationDecoded = {
  target?: string;
  amount?: string;
  token?: string;
  value?: string;
  payload?: string;
  hash?: string;
  signer?: string;
  count?: string | number;
};

export interface Operation {
  id: string;
  walletId: string;
  index: number;
  kind: OperationTag;
  decoded: OperationDecoded;
  status: "Approvals" | "Rejected" | "Executed";
  approvals: number;
  proposer?: string | null;
  createdTxHash?: string | null;
  executedTxHash?: string | null;
  createdAt: string;
  executedAt?: string | null;
  votes: Vote[];
}

export interface Wallet {
  id: string;
  chainId: number;
  address: string;
  label?: string | null;
  deployTxHash?: string | null;
  signersCount: number;
  signersRequired: number;
  nonce: number;
  operationsCount: number;
  balanceWei: string;
  signers: Signer[];
  _count?: { operations: number };
}

export interface OperationList {
  nonce: number;
  signersRequired: number;
  operations: Operation[];
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
    const msg =
      body && typeof body.error === "string"
        ? body.error
        : body?.error
          ? JSON.stringify(body.error)
          : `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then((r) => json<T>(r));
}

export interface RecordQueueBody {
  kind: OperationTag;
  decoded: OperationDecoded;
  txHash?: string;
  proposer?: string;
  preimage?: { hash: string; target: string; value: string; payload: string };
}

export const api = {
  listWallets: () => fetch(`${BASE}/v1/wallets`).then((r) => json<Wallet[]>(r)),
  getWallet: (chainId: number, address: string) =>
    fetch(`${BASE}/v1/wallets/${chainId}/${address}`).then((r) => json<Wallet>(r)),
  registerWallet: (body: { chainId: number; address: string; deployer: string; label?: string; deployTxHash?: string }) =>
    post<Wallet>("/v1/wallets", body),
  syncWallet: (chainId: number, address: string) => post<Wallet>(`/v1/wallets/${chainId}/${address}/sync`),

  listOperations: (chainId: number, address: string) =>
    fetch(`${BASE}/v1/wallets/${chainId}/${address}/operations`).then((r) => json<OperationList>(r)),
  recordQueue: (chainId: number, address: string, body: RecordQueueBody) =>
    post<Operation>(`/v1/wallets/${chainId}/${address}/operations`, body),
  approveOp: (id: string, body: { signer: string; txHash?: string }) =>
    post<Operation>(`/v1/operations/${id}/approve`, body),
  rejectOp: (id: string, body: { signer: string; txHash?: string }) =>
    post<Operation>(`/v1/operations/${id}/reject`, body),
  executeOp: (id: string, body: { txHash?: string }) => post<{ wallet: Wallet; skipped: boolean }>(`/v1/operations/${id}/execute`, body),
};
