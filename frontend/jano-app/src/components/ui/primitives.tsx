import { clsx } from "clsx";
import type { ReactNode } from "react";

export function Card({ children, className, ai = false, title, action }: { children: ReactNode; className?: string; ai?: boolean; title?: ReactNode; action?: ReactNode }) {
  return (
    <section className={clsx("min-w-0 rounded-2xl border border-jano-linea bg-jano-papel p-5", ai && "ai-border", className)}>
      {(title || action) && (
        <header className="mb-3 flex items-center gap-2">
          {title && <h2 className="font-display flex items-center gap-2 text-[17px] font-bold">{title}</h2>}
          {action && <div className="ml-auto flex items-center gap-2">{action}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export type Tone = "g" | "b" | "r" | "v" | "n";

const TONES: Record<Tone, string> = {
  g: "bg-jano-verde-tinte text-jano-verde-texto",
  b: "bg-jano-bronce-tinte text-jano-bronce-texto",
  r: "bg-jano-rojo-tinte text-jano-rojo-texto",
  v: "bg-jano-cobalto-tinte text-jano-cobalto-oscuro",
  n: "bg-jano-gris text-jano-gris-texto",
};

export function Pill({ tone = "n", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={clsx("inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold", TONES[tone], className)}>{children}</span>;
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "outline" | "ghost"; size?: "sm" | "md" | "lg" }) {
  const base = "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-60";
  const variants = {
    primary: "bg-jano-cobalto text-white hover:bg-jano-cobalto-oscuro",
    outline: "bg-jano-papel text-jano-tinta shadow-[inset_0_0_0_1px_var(--color-jano-linea)] hover:bg-jano-niebla",
    ghost: "text-jano-tinta hover:bg-jano-niebla",
  };
  const sizes = { sm: "px-3 py-1.5 text-[13px]", md: "px-3.5 py-2 text-[13.5px]", lg: "px-4.5 py-2.5 text-[15px]" };
  return (
    <button className={clsx(base, variants[variant], sizes[size], className)} {...rest}>
      {children}
    </button>
  );
}

export function Dot({ tone = "g", className }: { tone?: "g" | "w" | "c" | "n"; className?: string }) {
  const map = {
    g: "bg-jano-verde shadow-[0_0_0_3px_rgba(27,127,92,0.18)]",
    w: "bg-jano-bronce shadow-[0_0_0_3px_rgba(227,154,46,0.2)]",
    c: "bg-jano-cobalto-claro shadow-[0_0_0_3px_rgba(123,115,240,0.25)]",
    n: "bg-jano-nav-muted",
  };
  return <span className={clsx("inline-block h-2 w-2 shrink-0 rounded-full", map[tone], className)} />;
}

export function Spark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={clsx("h-4 w-4 text-jano-cobalto", className)} aria-hidden="true">
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />
    </svg>
  );
}

export function Sparkline({ points, color = "var(--color-jano-cobalto)" }: { points: readonly number[]; color?: string }) {
  const max = Math.max(...points, 1);
  const n = points.length;
  const d = points.map((v, i) => `${i === 0 ? "M" : "L"}${((i * 90) / Math.max(n - 1, 1)).toFixed(1)} ${(28 - (26 * v) / max).toFixed(1)}`).join(" ");
  return (
    <svg width="90" height="30" viewBox="0 0 90 30" fill="none" aria-hidden="true">
      <path d={d} stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("flex items-center gap-3", className)}>{children}</div>;
}

export function ListItem({ children, className }: { children: ReactNode; className?: string }) {
  return <li className={clsx("flex items-center gap-3 border-t border-jano-linea py-2.5 first:border-t-0", className)}>{children}</li>;
}

export function DemoPill() {
  return <Pill tone="b">Datos de ejemplo</Pill>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse rounded-xl bg-jano-gris", className)} aria-hidden="true" />;
}
