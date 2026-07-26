import { formatAmount, truncateAddress } from "../lib/format.js";

/**
 * Machine-produced values, rendered by the one rule: if a machine produced it,
 * it is mono. These are the atoms the tables and modals compose from.
 */

/** Truncated address — six leading, seven trailing. `full` shows all of it. */
export function Address({ value, full = false, className = "" }: { value: string; full?: boolean; className?: string }) {
  return (
    <span className={`font-mono text-[13px] ${className}`} title={value}>
      {full ? value : truncateAddress(value)}
    </span>
  );
}

/** Amount — fixed six decimals, tabular, with a muted unit. */
export function Amount({
  value,
  unit = "ETH",
  className = "",
}: {
  value: number | string;
  unit?: string;
  className?: string;
}) {
  return (
    <span className={`font-mono text-[13px] ${className}`}>
      {formatAmount(value)} <span className="text-muted">{unit}</span>
    </span>
  );
}

/** Calldata — selector in ink, arguments muted, wrapping on byte boundaries. */
export function Calldata({ selector, args, className = "" }: { selector: string; args: string; className?: string }) {
  return (
    <span className={`break-all font-mono text-[13px] leading-relaxed ${className}`}>
      <span className="text-ink">{selector}</span>
      <span className="text-body">{args}</span>
    </span>
  );
}
