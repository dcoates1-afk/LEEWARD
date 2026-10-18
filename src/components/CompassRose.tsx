export function CompassRose({ heading, size = 112 }: { heading: number | null; size?: number }) {
  const rotation = heading ?? 0;
  const ticks = Array.from({ length: 12 }, (_, index) => index * 30);
  return (
    <svg
      className="compass-rose"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={heading === null ? 'Compass rose, heading unavailable' : `Compass rose, heading ${Math.round(heading)} degrees`}
    >
      <circle cx="50" cy="50" r="46" className="compass-face" />
      {ticks.map((angle) => {
        const rad = ((angle - 90) * Math.PI) / 180;
        const outer = 46;
        const inner = angle % 90 === 0 ? 37 : 41;
        return (
          <line
            key={angle}
            x1={50 + Math.cos(rad) * inner}
            y1={50 + Math.sin(rad) * inner}
            x2={50 + Math.cos(rad) * outer}
            y2={50 + Math.sin(rad) * outer}
            className={angle % 90 === 0 ? 'compass-tick major' : 'compass-tick'}
          />
        );
      })}
      <text x="50" y="22" className="compass-label">N</text>
      <text x="80" y="54" className="compass-label">E</text>
      <text x="50" y="86" className="compass-label">S</text>
      <text x="20" y="54" className="compass-label">W</text>
      <g transform={`rotate(${rotation} 50 50)`}>
        <path d="M50 24 L56 52 L50 48 L44 52 Z" className="compass-needle" />
        <path d="M50 76 L56 52 L50 56 L44 52 Z" className="compass-tail" />
      </g>
      <circle cx="50" cy="50" r="4" className="compass-hub" />
    </svg>
  );
}
