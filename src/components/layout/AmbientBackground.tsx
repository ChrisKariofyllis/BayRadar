export function AmbientBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="app-ambient-glow" />
      <div className="app-ambient-grid" />
    </div>
  );
}
