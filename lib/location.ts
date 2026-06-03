export interface Coords {
  lat: number;
  lng: number;
}

/** 홍대 center: the default search origin before browser geolocation resolves. */
export const DEFAULT_LOCATION: Readonly<Coords> = Object.freeze({
  lat: 37.5563,
  lng: 126.9236,
});
