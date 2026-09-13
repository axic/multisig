import {
  decodeFunctionResult,
  encodeFunctionData,
  erc20Abi,
  getAddress,
  hexToString,
  type Address,
  type Hex,
} from "viem";
import type { ReadClient } from "./multisig.js";

/**
 * The little we need to know about an ERC-20 to queue a `TransferToken`.
 *
 * `amount` on that operation is in the token's own base units, so `decimals`
 * is load-bearing: without it we cannot turn "1.5" in a form field into the
 * integer the contract will move. `symbol` is cosmetic.
 */
export interface TokenMeta {
  address: Address;
  decimals: number;
  /** Absent when the token doesn't implement `symbol()` readably. */
  symbol?: string;
}

/** One `eth_call`; `undefined` when the token doesn't answer at all. */
async function optionalCall(client: ReadClient, to: Address, data: Hex): Promise<Hex | undefined> {
  try {
    const { data: ret } = await client.call({ to, data });
    return ret && ret !== "0x" ? ret : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Read `decimals()` and `symbol()` off a token. A missing/unreadable
 * `decimals()` is fatal — guessing 18 would silently send a thousand times too
 * much of a 6-decimal token — while an unreadable `symbol()` is not.
 */
export async function readTokenMeta(client: ReadClient, token: string): Promise<TokenMeta> {
  const address = getAddress(token);
  const [decimalsRet, symbolRet] = await Promise.all([
    optionalCall(client, address, encodeFunctionData({ abi: erc20Abi, functionName: "decimals" })),
    optionalCall(client, address, encodeFunctionData({ abi: erc20Abi, functionName: "symbol" })),
  ]);

  if (!decimalsRet) throw new Error("no decimals() at this address — not an ERC-20?");
  const decimals = decodeFunctionResult({ abi: erc20Abi, functionName: "decimals", data: decimalsRet });

  return { address, decimals, symbol: symbolRet ? decodeSymbol(symbolRet) : undefined };
}

/** `symbol()` is `string` per ERC-20, but pre-standard tokens return `bytes32`. */
function decodeSymbol(ret: Hex): string | undefined {
  try {
    return decodeFunctionResult({ abi: erc20Abi, functionName: "symbol", data: ret }) || undefined;
  } catch {
    try {
      return hexToString(ret).replace(/\0/g, "").trim() || undefined;
    } catch {
      return undefined;
    }
  }
}
