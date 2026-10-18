import { ialaRegion, formatPosition, symbolFor, CATEGORY_LABELS } from '../lib/navaids';
import type { Navaid } from '../lib/navaids';

interface NavaidSheetProps {
  mark: Navaid;
  onCentre: (mark: Navaid) => void;
  onClose: () => void;
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="sheet-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function NavaidSheet({ mark, onCentre, onClose }: NavaidSheetProps) {
  const region = ialaRegion(mark.lat, mark.lon);
  const spec = symbolFor(mark.category, region);
  const title = mark.name ?? CATEGORY_LABELS[mark.category] ?? 'Unnamed mark';

  return (
    <div className="sheet-scrim" onClick={onClose} role="presentation">
      <section
        className="navaid-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`Mark reference: ${title}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-grabber" aria-hidden="true" />
        <header className="sheet-head">
          <span className="sheet-symbol" dangerouslySetInnerHTML={{ __html: spec.svg }} aria-hidden="true" />
          <div>
            <p className="eyebrow">{CATEGORY_LABELS[mark.category]}</p>
            <h2>{title}</h2>
            <p className="sheet-sub">
              {formatPosition(mark.lat, mark.lon)} · IALA region {region}
            </p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close mark reference">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M6 6 L18 18 M18 6 L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <dl className="sheet-body">
          <Row label="Form" value={mark.form === 'beacon' && mark.lit === false ? 'Unlit beacon (day mark)' : mark.form} />
          <Row label="Light character" value={mark.light} />
          <Row label="Colour" value={mark.colour} />
          <Row label="Shape / topmark" value={mark.shape} />
          <Row label="Height" value={mark.height} />
          <Row label="Nominal range" value={mark.range ? `${mark.range} NM` : null} />
          <Row label="Description" value={mark.description} />
          <Row label="Source" value={mark.source === 'osm' ? 'OpenStreetMap seamarks (ODbL)' : mark.source} />
          <Row label="Last mapped" value={mark.updated ? new Date(mark.updated).toLocaleDateString() : null} />
          <Row label="Reference" value={mark.id} />
        </dl>

        <footer className="sheet-actions">
          <button type="button" className="primary-button" onClick={() => onCentre(mark)}>
            Centre chart on mark
          </button>
          <button type="button" className="secondary-button" onClick={onClose}>
            Back to chart
          </button>
        </footer>
      </section>
    </div>
  );
}
