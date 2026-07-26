import type { InputHTMLAttributes, ReactNode } from "react";

/**
 * Text input. Values are machine-produced (addresses, amounts), so the field
 * itself is mono. Labels are the mono uppercase micro-caps used everywhere a
 * key names a value. An `error` string flips label, border, and message to
 * signal — the one place orange means "fix this".
 */
export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: ReactNode;
  /** Trailing unit inside the border (e.g. `ETH`). Rendered muted. */
  unit?: ReactNode;
  /** When set, the field renders its error state and shows this message. */
  error?: string;
}

export function Input({ label, unit, error, className = "", id, ...props }: InputProps) {
  const invalid = Boolean(error);
  const borderColor = invalid ? "border-signal" : "border-line";
  const field = (
    <input
      id={id}
      aria-invalid={invalid || undefined}
      className={[
        "w-full min-w-0 bg-white px-3.5 py-3 font-mono text-[13px] text-ink outline-none",
        "placeholder:text-faint focus:border-ink",
        unit ? "border-0 bg-transparent focus:border-0" : `border ${borderColor}`,
        className,
      ].join(" ")}
      {...props}
    />
  );

  return (
    <label className="flex flex-col gap-2">
      {label && (
        <span
          className={[
            "font-mono text-[11px] uppercase tracking-label",
            invalid ? "text-signal" : "text-body",
          ].join(" ")}
        >
          {label}
        </span>
      )}
      {unit ? (
        <div className={`flex bg-white ${invalid ? "border border-signal" : "border border-line focus-within:border-ink"}`}>
          {field}
          <span className="border-l border-line px-3.5 py-3 font-mono text-xs text-muted">{unit}</span>
        </div>
      ) : (
        field
      )}
      {error && <span className="text-xs text-signal">{error}</span>}
    </label>
  );
}
