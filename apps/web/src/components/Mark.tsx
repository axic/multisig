/**
 * The Coram mark — four equal bars, none first, none last, an open centre
 * where the signature goes. Every other component inherits its logic from here.
 *
 * Geometry is fixed by the design system:
 *   bar thickness = 16% of the mark, length = 60%, offset = 24%.
 * 90° rotations only, never mirrored.
 *
 * The four bars are addressable as [top, right, bottom, left] so the same
 * primitive renders the logo (top = signal, rest = ink) and the quorum gauge
 * (bars fill clockwise as signatures arrive).
 */

export type BarColors = [top: string, right: string, bottom: string, left: string];

/** Brand lockup: accent bar on top, ink for the other three. */
export const LOGO_LIGHT: BarColors = ["#D9482A", "#191918", "#191918", "#191918"];
/** On ink / dark surfaces: accent retained, ink swapped for paper. */
export const LOGO_DARK: BarColors = ["#E85736", "#F1EFE9", "#F1EFE9", "#F1EFE9"];

export interface MarkProps {
  /** Rendered width and height in pixels (the mark is always square). */
  size?: number;
  /** Per-bar fill, clockwise from the top. Defaults to the light logo. */
  colors?: BarColors;
  className?: string;
  title?: string;
}

export function Mark({ size = 22, colors = LOGO_LIGHT, className, title }: MarkProps) {
  const [top, right, bottom, left] = colors;
  return (
    <div
      className={className}
      style={{ position: "relative", flex: "none", width: size, height: size }}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <div style={{ position: "absolute", left: "24%", top: 0, width: "60%", height: "16%", background: top }} />
      <div style={{ position: "absolute", right: 0, top: "24%", width: "16%", height: "60%", background: right }} />
      <div style={{ position: "absolute", right: "24%", bottom: 0, width: "60%", height: "16%", background: bottom }} />
      <div style={{ position: "absolute", left: 0, bottom: "24%", width: "16%", height: "60%", background: left }} />
    </div>
  );
}
