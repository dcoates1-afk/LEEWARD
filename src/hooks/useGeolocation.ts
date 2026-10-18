import { useEffect, useRef, useState } from 'react';
import { distanceMeters } from '../../shared/navaid-core.mjs';
import type { GpsMode } from '../lib/gpsPreference';

export interface GeoFix {
  lat: number;
  lon: number;
  accuracy: number;
  heading: number | null;
  sog: number | null;
  timestamp: number;
  compass: number | null;
}

export type GeoStatus = 'off' | 'idle' | 'requesting' | 'active' | 'error' | 'unsupported';

function bearing(fromLat: number, fromLon: number, toLat: number, toLon: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLon = toRad(toLon - fromLon);
  const y = Math.sin(dLon) * Math.cos(toRad(toLat));
  const x =
    Math.cos(toRad(fromLat)) * Math.sin(toRad(toLat)) -
    Math.sin(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180) / Math.PI + 360;
}

const METRES_PER_SECOND_TO_KNOTS = 1.943844;

function messageFor(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) {
    return 'Location permission denied. Allow location access for this site, or switch GPS to Always off.';
  }
  if (error.code === error.POSITION_UNAVAILABLE) return 'Position unavailable — no GPS or network fix yet.';
  return 'Timed out waiting for a position fix.';
}

/**
 * Watches position only when GPS is set to "Always on". Switching to
 * "Always off" stops the watch and clears the fix, so nothing keeps
 * interrogating the device in the background.
 */
export function useGeolocation(mode: GpsMode) {
  const [fix, setFix] = useState<GeoFix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<GeoStatus>(mode === 'off' ? 'off' : 'idle');
  const previous = useRef<GeoFix | null>(null);

  useEffect(() => {
    if (mode === 'off') {
      previous.current = null;
      setFix(null);
      setError(null);
      setStatus('off');
      return;
    }
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setStatus('unsupported');
      setError('Geolocation is not available in this browser.');
      return;
    }

    let cancelled = false;
    setStatus('requesting');
    setError(null);

    const onSuccess = (position: GeolocationPosition) => {
      if (cancelled) return;
      const { latitude, longitude, accuracy, heading } = position.coords;
      const timestamp = position.timestamp || Date.now();
      const prior = previous.current;
      let sog: number | null = null;
      let course: number | null = Number.isFinite(heading) ? heading : null;

      if (prior) {
        const seconds = (timestamp - prior.timestamp) / 1000;
        const metres = distanceMeters(prior.lat, prior.lon, latitude, longitude);
        if (seconds > 0.5 && metres < 5000) {
          sog = (metres / seconds) * METRES_PER_SECOND_TO_KNOTS;
        }
        if (course === null && metres > 2) {
          course = bearing(prior.lat, prior.lon, latitude, longitude) % 360;
        }
      }

      const next: GeoFix = {
        lat: latitude,
        lon: longitude,
        accuracy: Number.isFinite(accuracy) ? accuracy : 0,
        heading: course,
        sog: sog !== null && sog < 200 ? sog : null,
        timestamp,
        compass: course,
      };
      previous.current = next;
      setFix(next);
      setStatus('active');
      setError(null);
    };

    const onError = (positionError: GeolocationPositionError) => {
      if (cancelled) return;
      setError(messageFor(positionError));
      setStatus('error');
    };

    let watchId: number | null = null;
    try {
      watchId = navigator.geolocation.watchPosition(onSuccess, onError, {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 20_000,
      });
    } catch {
      setStatus('error');
      setError('Could not start the location watch.');
    }

    return () => {
      cancelled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, [mode]);

  return { fix, error, status };
}
