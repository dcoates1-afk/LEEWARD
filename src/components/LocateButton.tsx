import type { GeoFix, GeoStatus } from '../hooks/useGeolocation';

interface LocateButtonProps {
  fix: GeoFix | null;
  status: GeoStatus;
  hidden?: boolean;
  onLocate: () => void;
}

/**
 * Floating "centre on me" control, in the place a phone map puts it: bottom
 * right, above the attribution. It never opens a location watch of its own —
 * GPS is a persisted on/off setting — it just recentres on whatever fix exists
 * and explains itself when position is unavailable.
 */
export function LocateButton({ fix, status, hidden = false, onLocate }: LocateButtonProps) {
  const busy = status === 'requesting';
  const hasFix = Boolean(fix);
  const label = busy
    ? 'Finding your position'
    : hasFix
      ? 'Centre chart on my position'
      : 'Centre chart on my position (no fix yet)';
  return (
    <button
      type="button"
      className={`locate-button ${hasFix ? 'has-fix' : ''} ${busy ? 'is-busy' : ''} ${
        hidden ? 'is-hidden' : ''
      }`}
      aria-label={label}
      aria-busy={busy}
      data-testid="locate-button"
      onClick={onLocate}
    >
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="4.4" fill={hasFix ? '#3dd6ff' : 'none'} stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M12 2.5 V6.4 M12 17.6 V21.5 M2.5 12 H6.4 M17.6 12 H21.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
