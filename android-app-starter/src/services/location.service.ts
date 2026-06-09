import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { logger } from '@/utils/logger';

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp?: number;
}

export interface AppLocation {
  address?: string;
  coordinates?: LocationData;
}

export class LocationService {
  static async isLocationAvailable(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      return 'geolocation' in navigator;
    }

    try {
      const result = await Geolocation.checkPermissions();
      return result.location !== 'denied';
    } catch {
      return true;
    }
  }

  static async requestLocationPermission(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      return 'geolocation' in navigator;
    }

    const result = await Geolocation.requestPermissions();
    return result.location === 'granted';
  }

  static async getCurrentLocation(withAddress = true): Promise<AppLocation> {
    let position: GeolocationPosition | any;

    if (!Capacitor.isNativePlatform()) {
      position = await new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error('Geolocation not supported'));
          return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 300000,
        });
      });
    } else {
      position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 300000,
      });
    }

    const coordinates: LocationData = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      timestamp: position.timestamp,
    };

    return {
      coordinates,
      address: withAddress
        ? await this.reverseGeocode(coordinates.latitude, coordinates.longitude)
        : undefined,
    };
  }

  static formatLocationForDisplay(location?: AppLocation): string {
    if (!location) return '';
    if (location.address) return location.address;
    return this.formatCoordinatesForDisplay(location.coordinates);
  }

  static formatCoordinatesForDisplay(coordinates?: LocationData): string {
    if (!coordinates) return '';
    return `${coordinates.latitude.toFixed(4)}, ${coordinates.longitude.toFixed(4)}`;
  }

  static async reverseGeocode(latitude: number, longitude: number): Promise<string> {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
        { headers: { 'User-Agent': 'Android App Starter' } },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return data?.display_name || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
    } catch (error) {
      logger.error('Error reverse geocoding:', error);
      return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
    }
  }

  static async debugLocationStatus(): Promise<string> {
    const native = Capacitor.isNativePlatform();
    const available = await this.isLocationAvailable();
    return [
      `Platform: ${native ? Capacitor.getPlatform() : 'web'}`,
      `Available: ${available ? 'yes' : 'no'}`,
      `Host: ${window.location.hostname}`,
    ].join('\n');
  }

  static openInMaps(latitude: number, longitude: number, address?: string): void {
    const label = encodeURIComponent(address || 'Location');
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const url = isMobile
      ? `geo:${latitude},${longitude}?q=${label}`
      : `https://www.google.com/maps?q=${latitude},${longitude}`;
    window.open(url, isMobile ? '_system' : '_blank');
  }
}
