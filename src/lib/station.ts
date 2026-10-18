export type StationTab = 'ais' | 'colregs' | 'weather';

export const STATION_LABELS: Record<StationTab, string> = {
  ais: 'AIS live traffic',
  colregs: 'COLREGs guide',
  weather: 'Weather & tides',
};
