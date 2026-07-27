import { getAddress, type Address, type Hex } from "viem";

/**
 * Browser-local persistence — the last thing the app used the backend DB for.
 *
 * Two stores, both in `localStorage`:
 *
 *  - **Tracked wallets**: which Multisig addresses to list on the home page.
 *    All of a wallet's *state* is read from chain (see `multisig.ts`); this is
 *    just the set of addresses you've deployed or chosen to follow, plus an
 *    optional label.
 *
 *  - **UnstoredCall preimages**: an `UnstoredCall` op stores only a hash on
 *    chain, so the `[target][value][payload]` preimage must be kept somewhere to
 *    supply at execute time. This replaces the DB's `UnstoredCallPreimage`.
 *
 * Everything is keyed so it round-trips through JSON; addresses are checksummed
 * on the way in and hashes lower-cased for stable keys.
 */

const WALLETS_KEY = "multisig.trackedWallets.v1";
const PREIMAGES_KEY = "multisig.preimages.v1";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

// ─── tracked wallets ─────────────────────────────────────────────────────────

export interface TrackedWallet {
  chainId: number;
  address: Address;
  label?: string;
}

const walletKey = (chainId: number, address: string) => `${chainId}:${getAddress(address)}`;

export function listTrackedWallets(): TrackedWallet[] {
  return read<TrackedWallet[]>(WALLETS_KEY, []);
}

export function getTrackedWallet(chainId: number, address: string): TrackedWallet | undefined {
  const key = walletKey(chainId, address);
  return listTrackedWallets().find((w) => walletKey(w.chainId, w.address) === key);
}

/** Add (or update the label of) a tracked wallet. */
export function trackWallet(wallet: TrackedWallet): TrackedWallet {
  const entry: TrackedWallet = { chainId: wallet.chainId, address: getAddress(wallet.address), label: wallet.label };
  const key = walletKey(entry.chainId, entry.address);
  const next = listTrackedWallets().filter((w) => walletKey(w.chainId, w.address) !== key);
  next.push(entry);
  write(WALLETS_KEY, next);
  return entry;
}

export function forgetWallet(chainId: number, address: string): void {
  const key = walletKey(chainId, address);
  write(
    WALLETS_KEY,
    listTrackedWallets().filter((w) => walletKey(w.chainId, w.address) !== key),
  );
}

// ─── UnstoredCall preimages ──────────────────────────────────────────────────

export interface StoredPreimage {
  target: Address;
  /** wei, as a decimal string (JSON has no bigint). */
  value: string;
  payload: Hex;
}

type PreimageMap = Record<string, StoredPreimage>;

export function savePreimage(hash: Hex, preimage: StoredPreimage): void {
  const map = read<PreimageMap>(PREIMAGES_KEY, {});
  map[hash.toLowerCase()] = {
    target: getAddress(preimage.target),
    value: preimage.value,
    payload: preimage.payload,
  };
  write(PREIMAGES_KEY, map);
}

export function getPreimage(hash: Hex): StoredPreimage | undefined {
  return read<PreimageMap>(PREIMAGES_KEY, {})[hash.toLowerCase()];
}
