/**
 * Formatting for machine-produced values — the mono side of the type rule.
 *
 * Addresses, amounts, hashes: consistent shape everywhere they appear.
 */

/**
 * Truncate an address: six leading hex, seven trailing. Never fewer.
 *
 *   0x4F2a91c0Ee5D3b7A8f1c2D4e6B8a0C3d5E7f91B → 0x4F2a91…5E7f91B
 *
 * Anything too short to truncate meaningfully is returned unchanged.
 */
export function truncateAddress(address: string): string {
  if (address.length <= 15) return address;
  return `${address.slice(0, 8)}…${address.slice(-7)}`;
}

/**
 * Amount as fixed six decimals — tabular, so columns of values align.
 * Accepts a number or a decimal string (already in the unit, not wei).
 */
export function formatAmount(value: number | string, decimals = 6): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(decimals);
}
