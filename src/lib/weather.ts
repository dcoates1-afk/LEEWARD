export interface SeriesPoint {
  time: string;
  value: number;
}

export interface WeatherReport {
  lat: number;
  lon: number;
  fetchedAt: number;
  wind: SeriesPoint[];
  gusts: SeriesPoint[];
  windDirection: SeriesPoint[];
  temperature: SeriesPoint[];
  waves: SeriesPoint[];
  wavePeriod: SeriesPoint[];
  seaTemperature: SeriesPoint[];
  marineAvailable: boolean;
}

export interface TideStation {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export interface TideEvent {
  time: string;
  value: number;
  type: 'H' | 'L';
}

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine';

interface OpenMeteoResponse {
  hourly?: Record<string, unknown>;
}

function series(hourly: Record<string, unknown> | undefined, key: string): SeriesPoint[] {
  const times = (hourly?.time as string[] | undefined) ?? [];
  const values = (hourly?.[key] as (number | null)[] | undefined) ?? [];
  const points: SeriesPoint[] = [];
  for (let index = 0; index < times.length; index += 1) {
    const value = values[index];
    if (typeof value === 'number' && Number.isFinite(value)) {
      points.push({ time: times[index], value });
    }
  }
  return points;
}

export async function fetchWeather(lat: number, lon: number, signal?: AbortSignal): Promise<WeatherReport> {
  const forecastParams = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    hourly: 'temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    wind_speed_unit: 'kn',
    timezone: 'UTC',
    forecast_days: '2',
  });
  const marineParams = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    hourly: 'wave_height,wave_period,sea_surface_temperature',
    timezone: 'UTC',
    forecast_days: '2',
  });

  const [forecastResponse, marineResponse] = await Promise.all([
    fetch(`${FORECAST_URL}?${forecastParams}`, { signal }),
    fetch(`${MARINE_URL}?${marineParams}`, { signal }).catch(() => null),
  ]);

  if (!forecastResponse.ok) throw new Error(`Weather service returned HTTP ${forecastResponse.status}`);
  const forecast = (await forecastResponse.json()) as OpenMeteoResponse;

  let marine: OpenMeteoResponse | null = null;
  let marineAvailable = false;
  if (marineResponse && marineResponse.ok) {
    marine = (await marineResponse.json()) as OpenMeteoResponse;
    marineAvailable = Array.isArray(marine.hourly?.wave_height);
  }

  return {
    lat,
    lon,
    fetchedAt: Date.now(),
    wind: series(forecast.hourly, 'wind_speed_10m'),
    gusts: series(forecast.hourly, 'wind_gusts_10m'),
    windDirection: series(forecast.hourly, 'wind_direction_10m'),
    temperature: series(forecast.hourly, 'temperature_2m'),
    waves: series(marine?.hourly, 'wave_height'),
    wavePeriod: series(marine?.hourly, 'wave_period'),
    seaTemperature: series(marine?.hourly, 'sea_surface_temperature'),
    marineAvailable,
  };
}

/** Principal NOAA tide-prediction stations, used for nearest-station lookup. */
export const TIDE_STATIONS: TideStation[] = [
  { id: '8518750', name: 'The Battery, New York', lat: 40.7, lon: -74.014 },
  { id: '8531680', name: 'Sandy Hook, New Jersey', lat: 40.467, lon: -74.009 },
  { id: '8516945', name: 'Kings Point, New York', lat: 40.81, lon: -73.765 },
  { id: '8510560', name: 'Montauk, New York', lat: 41.048, lon: -71.959 },
  { id: '8443970', name: 'Boston, Massachusetts', lat: 42.354, lon: -71.05 },
  { id: '8447930', name: 'Woods Hole, Massachusetts', lat: 41.524, lon: -70.671 },
  { id: '8454000', name: 'Providence, Rhode Island', lat: 41.807, lon: -71.401 },
  { id: '8461490', name: 'New London, Connecticut', lat: 41.361, lon: -72.09 },
  { id: '8545240', name: 'Philadelphia, Pennsylvania', lat: 39.933, lon: -75.142 },
  { id: '8575512', name: 'Baltimore, Maryland', lat: 39.267, lon: -76.578 },
  { id: '8638610', name: 'Sewells Point, Virginia', lat: 36.947, lon: -76.33 },
  { id: '8658120', name: 'Wilmington, North Carolina', lat: 34.227, lon: -77.953 },
  { id: '8665530', name: 'Charleston, South Carolina', lat: 32.781, lon: -79.925 },
  { id: '8670870', name: 'Fort Pulaski, Georgia', lat: 32.037, lon: -80.902 },
  { id: '8720218', name: 'Mayport, Florida', lat: 30.398, lon: -81.428 },
  { id: '8724580', name: 'Key West, Florida', lat: 24.551, lon: -81.808 },
  { id: '8726520', name: 'St. Petersburg, Florida', lat: 27.761, lon: -82.627 },
  { id: '8735180', name: 'Dauphin Island, Alabama', lat: 30.25, lon: -88.075 },
  { id: '8770570', name: 'Sabine Pass, Texas', lat: 29.728, lon: -93.87 },
  { id: '9410230', name: 'La Jolla, California', lat: 32.867, lon: -117.257 },
  { id: '9414290', name: 'San Francisco, California', lat: 37.806, lon: -122.465 },
  { id: '9435380', name: 'South Beach, Oregon', lat: 44.625, lon: -124.045 },
  { id: '9447130', name: 'Seattle, Washington', lat: 47.602, lon: -122.339 },
  { id: '9455920', name: 'Anchorage, Alaska', lat: 61.238, lon: -149.89 },
  { id: '1612340', name: 'Honolulu, Hawaii', lat: 21.307, lon: -157.867 },
  { id: '9755371', name: 'San Juan, Puerto Rico', lat: 18.466, lon: -66.116 },
];

const EARTH_RADIUS_KM = 6371;

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function nearestTideStation(
  lat: number,
  lon: number,
  stations: TideStation[] = TIDE_STATIONS,
  maxKm = 350,
): { station: TideStation; distanceKm: number } | null {
  let best: { station: TideStation; distanceKm: number } | null = null;
  for (const station of stations) {
    const km = distanceKm(lat, lon, station.lat, station.lon);
    if (!best || km < best.distanceKm) best = { station, distanceKm: km };
  }
  if (!best || best.distanceKm > maxKm) return null;
  return best;
}

function noaaDate(date: Date): string {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(
    date.getUTCDate(),
  ).padStart(2, '0')}`;
}

export async function fetchTideEvents(stationId: string, days = 3, signal?: AbortSignal): Promise<TideEvent[]> {
  const begin = new Date();
  const end = new Date(begin.getTime() + days * 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    product: 'predictions',
    application: 'MARNAV',
    begin_date: noaaDate(begin),
    end_date: noaaDate(end),
    datum: 'MLLW',
    station: stationId,
    time_zone: 'gmt',
    units: 'metric',
    interval: 'hilo',
    format: 'json',
  });
  const response = await fetch(
    `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?${params}`,
    { signal },
  );
  if (!response.ok) throw new Error(`Tide service returned HTTP ${response.status}`);
  const payload = (await response.json()) as { predictions?: { t: string; v: string; type: string }[] };
  return (payload.predictions ?? []).map((entry) => ({
    time: entry.t,
    value: Number(entry.v),
    type: entry.type === 'H' ? 'H' : 'L',
  }));
}
