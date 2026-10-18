import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import L from 'leaflet';
import lanes from '../data/lanes.json';
import { ialaRegion, quickInfo, symbolFor } from '../lib/navaids';
import type { Navaid } from '../lib/navaids';
import type { ChartPreferences } from '../lib/chartPreferences';
import type { GeoFix } from '../hooks/useGeolocation';
import type { AisVessel } from '../lib/ais';

export interface MapHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  flyTo: (lat: number, lon: number, zoom?: number) => void;
  getCenter: () => [number, number] | null;
  getBounds: () => [number, number, number, number] | null;
}

const TRANSPARENT_TILE =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

export interface MapCanvasProps {
  preferences: ChartPreferences;
  initialCenter?: [number, number];
  initialZoom?: number;
  marks: Navaid[];
  zoom: number;
  onSelectMark: (mark: Navaid) => void;
  onViewChange: (bounds: [number, number, number, number], zoom: number, center: [number, number]) => void;
  onNoaaCoverageChange: (covered: boolean) => void;
  onMapClick: (lat: number, lon: number) => void;
  fix: GeoFix | null;
  aisVessels: AisVessel[];
}

const US_REGIONS: [number, number, number, number][] = [
  [-125.5, 24.0, -66.0, 50.0], // CONUS
  [-171.0, 51.0, -129.0, 72.0], // Alaska
  [-161.5, 18.5, -154.0, 23.0], // Hawaii
  [-68.0, 17.0, -64.5, 19.0], // Puerto Rico / USVI
];

export function isUsWaters(lat: number, lon: number): boolean {
  return US_REGIONS.some(
    ([west, south, east, north]) => lat >= south && lat <= north && lon >= west && lon <= east,
  );
}

/**
 * NOAA ENC Direct renders raster charts through ArcGIS MapServer/export. The
 * service is split into scale bands, so each tile asks the band appropriate to
 * the zoom level. (The retired MCS/NOAAChartDisplay endpoint still answers 200
 * with a blank image, which is why it is not used here.)
 */
/**
 * One ENC Direct raster band. The bands are usage bands, not plain scales, so
 * the chart is drawn as a stack: coarse opaque coverage underneath, finer bands
 * transparent on top. That way a harbour chart adds detail where it exists
 * without blacking out the rest of the area.
 */
export const NOAA_ATTRIBUTION = 'NOAA ENC Direct (public domain)';

/** Usage band that matches the current scale. */
function noaaServiceFor(zoom: number): string {
  if (zoom >= 12) return 'enc_harbour';
  if (zoom >= 9) return 'enc_coastal';
  return 'enc_general';
}

const NoaaChartLayer = L.GridLayer.extend({
  createTile(this: L.GridLayer, coords: L.Coords): HTMLElement {
    const tile = document.createElement('img');
    tile.alt = '';
    tile.setAttribute('role', 'presentation');
    const layer = this as unknown as { _tileCoordsToBounds: (c: L.Coords) => L.LatLngBounds };
    const bounds = layer._tileCoordsToBounds(coords);
    const bbox = [
      bounds.getWest().toFixed(5),
      bounds.getSouth().toFixed(5),
      bounds.getEast().toFixed(5),
      bounds.getNorth().toFixed(5),
    ].join(',');
    const centre = bounds.getCenter();
    if (!isUsWaters(centre.lat, centre.lng)) {
      // Outside NOAA coverage there is nothing to draw, and the export service
      // answers with a non-image body that the browser blocks. Skip the request.
      tile.src = TRANSPARENT_TILE;
      return tile;
    }
    const service = noaaServiceFor(coords.z);
    tile.src =
      `https://gis.charttools.noaa.gov/arcgis/rest/services/encdirect/${service}/MapServer/export` +
      `?bbox=${bbox}&bboxSR=4326&imageSR=3857&size=256,256&format=png32&transparent=false&f=image`;
    return tile;
  },
}) as unknown as new (options?: L.GridLayerOptions) => L.GridLayer;

export function createNoaaChart(): L.GridLayer {
  return new NoaaChartLayer({ zIndex: 3, attribution: NOAA_ATTRIBUTION });
}

function ferryStyle(): L.PolylineOptions {
  return { color: '#5cc9f0', weight: 2, opacity: 0.8, dashArray: '7 7' };
}

function tssStyle(type: string): L.PolylineOptions {
  switch (type) {
    case 'separation_lane':
      return { color: '#7fd4ff', weight: 1.6, opacity: 0.9, fillColor: '#2f7fd0', fillOpacity: 0.22 };
    case 'separation_zone':
      return { color: '#f4c531', weight: 1.4, opacity: 0.85, dashArray: '3 5', fillColor: '#f4c531', fillOpacity: 0.12 };
    case 'separation_boundary':
      return { color: '#e6f4ff', weight: 1.2, opacity: 0.7, dashArray: '10 6' };
    default:
      return { color: '#9fb7c4', weight: 1, opacity: 0.6, dashArray: '2 6' };
  }
}

function aisIcon(vessel: AisVessel): L.DivIcon {
  const colour = vessel.simulated ? '#c0a35a' : vessel.shipType === 'Passenger' ? '#57d2a0' : '#ffb454';
  const rotation = vessel.cog ?? vessel.heading ?? 0;
  return L.divIcon({
    className: 'marnav-ais-wrap',
    html: `<span class="marnav-ais" style="--rot:${rotation}deg;--ais:${colour}">
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M12 2 L19 21 L12 17 L5 21 Z" fill="${colour}" stroke="#04141f" stroke-width="1.4"/></svg>
    </span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

export const MapCanvas = forwardRef<MapHandle, MapCanvasProps>(function MapCanvas(props, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const basesRef = useRef<Record<string, L.Layer>>({});
  const seaRef = useRef<L.TileLayer | null>(null);
  const groupsRef = useRef<Partial<Record<'navaids' | 'ferries' | 'tss' | 'ais', L.LayerGroup>>>({});
  const vesselRef = useRef<L.Marker | null>(null);
  const handlers = useRef(props);
  handlers.current = props;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: props.initialCenter ?? [50.76, -1.2],
      zoom: props.initialZoom ?? 11,
      zoomControl: false,
      attributionControl: true,
      doubleClickZoom: true,
      touchZoom: true,
      worldCopyJump: true,
    });
    mapRef.current = map;

    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    });
    const satellite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics' },
    );
    const noaa = createNoaaChart();
    basesRef.current = { osm, satellite, noaa };
    osm.addTo(map);

    const sea = L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', {
      maxZoom: 18,
      opacity: 1,
      zIndex: 400,
      attribution: 'Seamarks &copy; OpenSeaMap (CC-BY-SA)',
    });
    const navaids = L.layerGroup();
    const ferries = L.layerGroup();
    const tss = L.layerGroup();
    const ais = L.layerGroup();

    for (const ferry of lanes.ferries) {
      const line = L.polyline(ferry.path as [number, number][], ferryStyle());
      line.bindTooltip(`Ferry route · ${ferry.name}`, { sticky: true, className: 'marnav-tip' });
      ferries.addLayer(line);
    }
    for (const feature of lanes.tss) {
      const path = feature.path as [number, number][];
      const closed =
        path.length > 3 &&
        path[0][0] === path[path.length - 1][0] &&
        path[0][1] === path[path.length - 1][1];
      const layer = closed
        ? L.polygon(path, tssStyle(feature.type))
        : L.polyline(path, tssStyle(feature.type));
      layer.bindTooltip(`TSS · ${feature.name}`, { sticky: true, className: 'marnav-tip' });
      tss.addLayer(layer);
    }

    seaRef.current = sea;
    groupsRef.current = { navaids, ferries, tss, ais };

    const emitView = () => {
      const centre = map.getCenter();
      const bounds = map.getBounds();
      const bbox: [number, number, number, number] = [
        bounds.getSouth(),
        bounds.getWest(),
        bounds.getNorth(),
        bounds.getEast(),
      ];
      handlers.current.onViewChange(bbox, map.getZoom(), [centre.lat, centre.lng]);
      handlers.current.onNoaaCoverageChange(isUsWaters(centre.lat, centre.lng));
    };

    map.on('moveend', emitView);
    map.on('click', (event: L.LeafletMouseEvent) => {
      handlers.current.onMapClick(event.latlng.lat, event.latlng.lng);
    });
    emitView();

    return () => {
      map.off();
      map.remove();
      mapRef.current = null;
      groupsRef.current = {};
      seaRef.current = null;
      basesRef.current = {};
      vesselRef.current = null;
    };
  }, []);

  // Base map selection.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const layer of Object.values(basesRef.current)) {
      if (map.hasLayer(layer)) map.removeLayer(layer);
    }
    const next = basesRef.current[props.preferences.base];
    if (next && !map.hasLayer(next)) {
      next.addTo(map);
      if (next instanceof L.GridLayer) next.setZIndex(3);
    }
    // ENC bands cover ports and approaches, not every square mile of water.
    // Show blank chart paper rather than a black hole where a band has no tile.
    map.getContainer().classList.toggle('noaa-base', props.preferences.base === 'noaa');
  }, [props.preferences.base]);

  // Overlay toggles.
  const overlays = props.preferences.overlays;
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const sea = seaRef.current;
    if (!sea) return;
    if (overlays.openseamap) {
      if (!map.hasLayer(sea)) sea.addTo(map);
    } else if (map.hasLayer(sea)) {
      map.removeLayer(sea);
    }
  }, [overlays.openseamap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const key of ['navaids', 'ferries', 'tss', 'ais'] as const) {
      const group = groupsRef.current[key];
      if (!group) continue;
      const wanted = overlays[key];
      if (wanted) {
        if (!map.hasLayer(group)) group.addTo(map);
      } else if (map.hasLayer(group)) {
        map.removeLayer(group);
      }
    }
  }, [overlays]);

  // NAVAID markers.
  useEffect(() => {
    const group = groupsRef.current.navaids;
    if (!group) return;
    group.clearLayers();
    if (!props.preferences.overlays.navaids) return;
    // Symbols shrink at small scales so a dense harbour does not turn into a
    // wall of icons; the mark is still tappable at 16 px.
    const size = props.zoom >= 15 ? 28 : props.zoom >= 13 ? 24 : props.zoom >= 11 ? 20 : 16;
    for (const mark of props.marks) {
      const region = ialaRegion(mark.lat, mark.lon);
      const spec = symbolFor(mark.category, region);
      const html = spec.svg.replace('width="32" height="32"', `width="${size}" height="${size}"`);
      const marker = L.marker([mark.lat, mark.lon], {
        icon: L.divIcon({
          className: 'marnav-mark-wrap',
          html,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        }),
        keyboard: true,
        title: spec.label,
        riseOnHover: true,
      });
      marker.setZIndexOffset(mark.priority * 10);
      marker.bindTooltip(quickInfo(mark, ialaRegion(mark.lat, mark.lon)), {
        direction: 'top',
        offset: [0, -14],
        className: 'marnav-tip',
        opacity: 1,
      });
      marker.on('click', () => handlers.current.onSelectMark(mark));
      group.addLayer(marker);
    }
  }, [props.marks, props.zoom, props.preferences.overlays.navaids]);

  // AIS targets.
  useEffect(() => {
    const group = groupsRef.current.ais;
    if (!group) return;
    group.clearLayers();
    if (!props.preferences.overlays.ais) return;
    for (const vessel of props.aisVessels) {
      const marker = L.marker([vessel.lat, vessel.lon], {
        icon: aisIcon(vessel),
        title: vessel.name ?? `MMSI ${vessel.mmsi}`,
      });
      const speed = vessel.sog !== null ? `${vessel.sog.toFixed(1)} kn` : 'speed n/a';
      const course = vessel.cog !== null ? `${Math.round(vessel.cog)}°` : 'course n/a';
      marker.bindTooltip(
        `${vessel.name ?? `MMSI ${vessel.mmsi}`} · ${speed} · ${course}${vessel.simulated ? ' · simulated' : ''}`,
        { direction: 'top', offset: [0, -12], className: 'marnav-tip' },
      );
      group.addLayer(marker);
    }
  }, [props.aisVessels, props.preferences.overlays.ais]);

  // Own vessel.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!props.fix) {
      if (vesselRef.current) {
        map.removeLayer(vesselRef.current);
        vesselRef.current = null;
      }
      return;
    }
    const rotation = props.fix.compass ?? 0;
    const icon = L.divIcon({
      className: 'marnav-vessel-wrap',
      html: `<span class="marnav-vessel" style="--rot:${rotation}deg">
        <svg viewBox="0 0 32 32" width="34" height="34" aria-hidden="true">
          <circle cx="16" cy="16" r="13" fill="rgba(61,214,255,0.16)" stroke="#3dd6ff" stroke-width="1.5"/>
          <path d="M16 4 L23 26 L16 21 L9 26 Z" fill="#3dd6ff" stroke="#04141f" stroke-width="1.2"/>
        </svg>
      </span>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    });
    if (!vesselRef.current) {
      vesselRef.current = L.marker([props.fix.lat, props.fix.lon], { icon, interactive: false, zIndexOffset: 5000 });
      vesselRef.current.addTo(map);
    } else {
      vesselRef.current.setLatLng([props.fix.lat, props.fix.lon]);
      vesselRef.current.setIcon(icon);
    }
  }, [props.fix]);

  useImperativeHandle(ref, () => ({
    zoomIn: () => mapRef.current?.zoomIn(),
    zoomOut: () => mapRef.current?.zoomOut(),
    flyTo: (lat, lon, zoom) => mapRef.current?.flyTo([lat, lon], zoom ?? Math.max(13, mapRef.current.getZoom())),
    getCenter: () => {
      const centre = mapRef.current?.getCenter();
      return centre ? [centre.lat, centre.lng] : null;
    },
    getBounds: () => {
      const bounds = mapRef.current?.getBounds();
      if (!bounds) return null;
      return [bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getEast()];
    },
  }));

  return <div ref={containerRef} className="marnav-map" aria-label="Interactive marine chart" />;
});
