const EARTH_RADIUS_KM = 6371;

const toRad = (value: number) => (value * Math.PI) / 180;

/** Great-circle distance in kilometres. */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

const COMPASS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
];

/** Sixteen-point compass name for a bearing in degrees true. */
export function compassPoint(degrees: number): string {
  const normalised = ((degrees % 360) + 360) % 360;
  return COMPASS[Math.round(normalised / 22.5) % 16];
}
