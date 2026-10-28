export function Logo({ size = 28, left = "#ffffff", right = "#e39a2e", dots = "#14162b" }: { size?: number; left?: string; right?: string; dots?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M4 29V15A11 11 0 0 1 15 4v25z" fill={left} />
      <path d="M17 4a11 11 0 0 1 11 11v14H17z" fill={right} />
      <circle cx="11.5" cy="18" r="1.6" fill={dots} />
      <circle cx="20.5" cy="18" r="1.6" fill={dots} />
    </svg>
  );
}
