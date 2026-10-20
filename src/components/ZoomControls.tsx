interface ZoomControlsProps {
  hidden?: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

/**
 * Plain + / − zoom, stacked above the centre-on-me button. Leaflet's own zoom
 * control stays disabled so there is only ever one way to zoom on screen; the
 * menu no longer carries chart actions.
 */
export function ZoomControls({ hidden = false, onZoomIn, onZoomOut }: ZoomControlsProps) {
  return (
    <div className={`zoom-controls ${hidden ? 'is-hidden' : ''}`} role="group" aria-label="Chart zoom">
      <button
        type="button"
        className="zoom-button"
        aria-label="Zoom in"
        data-testid="zoom-in"
        onClick={onZoomIn}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
          <path d="M12 5 V19 M5 12 H19" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </button>
      <button
        type="button"
        className="zoom-button"
        aria-label="Zoom out"
        data-testid="zoom-out"
        onClick={onZoomOut}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
          <path d="M5 12 H19" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
