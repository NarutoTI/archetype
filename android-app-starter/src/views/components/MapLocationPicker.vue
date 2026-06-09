<template>
  <ion-modal :is-open="props.isOpen" @did-dismiss="closeModal">
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ $t('location.chooseLocation') }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="false">
      <!-- Search Bar -->
      <div class="search-container">
        <ion-searchbar
          v-model="searchQuery"
          :placeholder="$t('location.searchLocation')"
          @ionInput="onSearchInput"
          :debounce="500"
        />
      </div>

      <!-- Search Results -->
      <ion-list v-if="searchResults.length > 0" class="search-results">
        <ion-item
          v-for="(result, index) in searchResults"
          :key="`${result.lat}-${result.lon}-${index}`"
          button
          @click="selectSearchResult(result)"
        >
          <ion-icon :icon="locationOutline" slot="start" color="primary" />
          <ion-label>
            <h3>{{ result.display_name }}</h3>
          </ion-label>
        </ion-item>
      </ion-list>

      <!-- Map Container -->
      <div class="map-container">
        <div ref="mapContainer" class="map"></div>

        <!-- Instructions Overlay -->
        <div v-if="!selectedLocation" class="map-instructions">
          <ion-icon :icon="informationCircleOutline" color="primary" />
          <span>{{ $t('location.tapToSelect') }}</span>
        </div>

        <!-- Coordinates Display -->
        <div v-if="selectedLocation?.coordinates" class="coordinates-info">
          <ion-chip color="primary">
            <ion-icon :icon="locationOutline" />
            <ion-label>
              {{ LocationService.formatCoordinatesForDisplay(selectedLocation.coordinates) }}
            </ion-label>
          </ion-chip>
        </div>
      </div>

      <!-- Loading indicator for reverse geocoding -->
      <div v-if="isLoadingAddress" class="loading-address">
        <ion-spinner name="crescent" />
        <span>{{ $t('common.loading') }}...</span>
      </div>
    </ion-content>

    <ion-footer>
      <ion-toolbar>
        <ion-buttons slot="secondary">
          <ion-button color="secondary" @click="closeModal">
            {{ $t('common.cancel') }}
          </ion-button>
        </ion-buttons>
        <ion-buttons slot="primary">
          <ion-button
            class="modal-primary-action"
            :disabled="!selectedLocation"
            @click="confirmLocation"
          >
            {{ $t('location.confirmLocation') }}
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-footer>
  </ion-modal>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onBeforeUnmount } from 'vue';
import {
  IonButton,
  IonButtons,
  IonChip,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonSearchbar,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/vue';
import { informationCircleOutline, locationOutline } from 'ionicons/icons';

import L from 'leaflet';
import { LocationService, type AppLocation } from '@/services/location.service';
import { logger } from '@/utils/logger';

// Fix Leaflet default marker icon issue under bundlers
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
}

const props = withDefaults(defineProps<{
  isOpen: boolean;
  initialLocation?: AppLocation;
}>(), {
  isOpen: false,
  initialLocation: undefined,
});

const emit = defineEmits<{
  select: [location: AppLocation];
  close: [];
}>();

const mapContainer = ref<HTMLElement | null>(null);
const map = ref<L.Map | null>(null);
const marker = ref<L.Marker | null>(null);
const selectedLocation = ref<AppLocation | undefined>(undefined);
const searchQuery = ref('');
const searchResults = ref<NominatimResult[]>([]);
const isLoadingAddress = ref(false);
let initTimeoutId: ReturnType<typeof setTimeout> | null = null;

// Initialize map when modal opens
watch(
  () => props.isOpen,
  async (isOpen) => {
    if (!isOpen) {
      cleanupMap();
      return;
    }

    // Wait for modal to fully render before initializing map
    await nextTick();

    // Delay so modal animations and layout are complete. The handle is kept so
    // a quick close cancels it, and `props.isOpen` is re-checked after every
    // await: geolocation can resolve after the modal was dismissed.
    initTimeoutId = setTimeout(async () => {
      initTimeoutId = null;
      if (!props.isOpen) return;

      // Without an initial location, try centering on the user position
      if (!props.initialLocation?.coordinates) {
        try {
          const hasPermission = await LocationService.requestLocationPermission();
          if (!props.isOpen) return;
          if (hasPermission) {
            const currentLocation = await LocationService.getCurrentLocation(false);
            if (!props.isOpen) return;
            initializeMap(
              currentLocation.coordinates?.latitude,
              currentLocation.coordinates?.longitude,
            );
            return;
          }
        } catch (error) {
          logger.warn('Could not get current location for map, using default:', error);
          if (!props.isOpen) return;
        }
      }

      initializeMap();

      if (props.initialLocation?.coordinates) {
        selectedLocation.value = props.initialLocation;
        const { latitude, longitude } = props.initialLocation.coordinates;
        if (map.value) {
          map.value.setView([latitude, longitude], 15);
          placeMarker(latitude, longitude);
        }
      }
    }, 200);
  },
);

const initializeMap = (userLat?: number, userLng?: number) => {
  if (!mapContainer.value || map.value) return;

  try {
    // Default center (world view) unless a better location is known
    let center: [number, number] = [20, 0];
    let zoom = 2;

    if (userLat !== undefined && userLng !== undefined) {
      center = [userLat, userLng];
      zoom = 13;
    } else if (props.initialLocation?.coordinates) {
      center = [
        props.initialLocation.coordinates.latitude,
        props.initialLocation.coordinates.longitude,
      ];
      zoom = 15;
    }

    map.value = L.map(mapContainer.value, {
      preferCanvas: true,
      attributionControl: true,
    }).setView(center, zoom);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map.value as L.Map);

    // Force map to recalculate size (fixes rendering inside modals)
    setTimeout(() => map.value?.invalidateSize(), 100);

    map.value.on('click', async (event: L.LeafletMouseEvent) => {
      const { lat, lng } = event.latlng;
      placeMarker(lat, lng);
      await updateLocationFromCoordinates(lat, lng);
    });
  } catch (error) {
    logger.error('Error initializing map:', error);
  }
};

const placeMarker = (lat: number, lng: number) => {
  if (!map.value) return;

  if (marker.value) {
    map.value.removeLayer(marker.value as L.Marker);
  }

  marker.value = L.marker([lat, lng], { draggable: true }).addTo(map.value as L.Map);
  marker.value.on('dragend', async (event: any) => {
    const position = event.target.getLatLng();
    await updateLocationFromCoordinates(position.lat, position.lng);
  });
};

const updateLocationFromCoordinates = async (lat: number, lng: number) => {
  isLoadingAddress.value = true;
  try {
    const address = await LocationService.reverseGeocode(lat, lng);
    selectedLocation.value = {
      address,
      coordinates: { latitude: lat, longitude: lng },
    };
  } catch (error) {
    logger.error('Error reverse geocoding:', error);
    // Fallback to coordinates only
    selectedLocation.value = {
      address: LocationService.formatCoordinatesForDisplay({ latitude: lat, longitude: lng }),
      coordinates: { latitude: lat, longitude: lng },
    };
  } finally {
    isLoadingAddress.value = false;
  }
};

const onSearchInput = async () => {
  if (!searchQuery.value || searchQuery.value.length < 3) {
    searchResults.value = [];
    return;
  }

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery.value)}&limit=5`,
      { headers: { 'User-Agent': 'Android App Starter' } },
    );
    searchResults.value = response.ok ? ((await response.json()) as NominatimResult[]) : [];
  } catch (error) {
    logger.error('Error searching location:', error);
    searchResults.value = [];
  }
};

const selectSearchResult = async (result: NominatimResult) => {
  const lat = parseFloat(result.lat);
  const lng = parseFloat(result.lon);

  if (map.value) {
    map.value.setView([lat, lng], 15);
    placeMarker(lat, lng);
    await updateLocationFromCoordinates(lat, lng);
  }

  searchQuery.value = '';
  searchResults.value = [];
};

const confirmLocation = () => {
  if (selectedLocation.value) {
    emit('select', selectedLocation.value);
    closeModal();
  }
};

const closeModal = () => {
  searchQuery.value = '';
  searchResults.value = [];
  emit('close');
};

const cleanupMap = () => {
  if (initTimeoutId !== null) {
    clearTimeout(initTimeoutId);
    initTimeoutId = null;
  }
  if (map.value) {
    map.value.remove();
    map.value = null;
  }
  marker.value = null;
  selectedLocation.value = undefined;
  searchQuery.value = '';
  searchResults.value = [];
};

onBeforeUnmount(() => {
  cleanupMap();
});
</script>

<style scoped>
.search-container {
  padding: 8px;
  background: var(--ion-background-color);
  border-bottom: 1px solid var(--ion-color-light-shade);
}

.search-results {
  position: absolute;
  top: 120px;
  left: 0;
  right: 0;
  z-index: 1000;
  max-height: 300px;
  overflow-y: auto;
  background: var(--ion-background-color);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.map-container {
  position: relative;
  width: 100%;
  height: 500px;
  min-height: 400px;
  max-height: 70vh;
}

.map {
  width: 100%;
  height: 100%;
  z-index: 1;
  background: var(--ion-color-light-shade);
}

.map-instructions {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--ion-color-primary);
  color: var(--ion-color-primary-contrast);
  padding: 8px 16px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 1000;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  font-size: 0.9em;
}

.map-instructions ion-icon {
  font-size: 1.2em;
}

.coordinates-info {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
}

.coordinates-info ion-chip {
  --background: var(--ion-color-primary);
  --color: var(--ion-color-primary-contrast);
  font-family: 'Courier New', monospace;
  font-size: 0.9em;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.loading-address {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px;
  background: var(--ion-color-background, var(--ion-background-color));
  border-radius: 8px;
  margin: 8px 16px;
}

.loading-address span {
  font-size: 0.9em;
  color: var(--ion-color-medium-shade);
}
</style>
