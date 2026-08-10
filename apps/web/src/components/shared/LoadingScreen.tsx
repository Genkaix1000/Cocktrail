type Props = {
  label: string;
};

/** Pantalla de carga full-viewport: anillo + barra + glow (indeterminada). */
export default function LoadingScreen({ label }: Props) {
  return (
    <main
      className="relative min-h-[100dvh] overflow-hidden bg-[var(--bg-app)] text-[var(--text-primary)] flex items-center justify-center"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 loading-screen-ambient"
      />

      <div className="relative z-10 flex flex-col items-center gap-7 px-6">
        <div className="relative grid place-items-center">
          <div
            aria-hidden
            className="absolute h-28 w-28 rounded-full bg-[var(--accent-primary)]/20 blur-2xl loading-screen-glow"
          />
          <svg
            className="loading-screen-ring h-16 w-16"
            viewBox="0 0 64 64"
            fill="none"
            aria-hidden
          >
            <circle
              cx="32"
              cy="32"
              r="26"
              stroke="var(--border-subtle)"
              strokeWidth="3"
            />
            <circle
              className="loading-screen-ring-arc"
              cx="32"
              cy="32"
              r="26"
              stroke="var(--accent-primary)"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
          <span
            aria-hidden
            className="absolute h-2 w-2 rounded-full bg-[var(--accent-bright)] loading-screen-dot"
          />
        </div>

        <div className="flex w-[min(16rem,70vw)] flex-col items-center gap-3">
          <p className="text-center text-[13px] font-medium tracking-[0.04em] text-[var(--text-secondary)]">
            {label}
          </p>
          <div
            aria-hidden
            className="h-[2px] w-full overflow-hidden rounded-full bg-[var(--border-subtle)]"
          >
            <div className="loading-screen-bar h-full w-1/3 rounded-full bg-[var(--accent-primary)]" />
          </div>
        </div>
      </div>
    </main>
  );
}
