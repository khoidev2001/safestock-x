export interface CoordinateMarker {
  id: string;
  lat: number | null;
  lng: number | null;
}

export type CoordinateDraft = Record<
  string,
  { lat: number; lng: number }
>;

export function mergeCoordinateDrafts<T extends CoordinateMarker>(
  list: T[],
  draft: CoordinateDraft,
): T[] {
  return list.map((marker) =>
    draft[marker.id]
      ? {
          ...marker,
          lat: draft[marker.id].lat,
          lng: draft[marker.id].lng,
        }
      : marker,
  );
}

export function mergeHamletCoordinateDrafts<
  T extends CoordinateMarker & { verified: boolean },
>(list: T[], draft: CoordinateDraft): T[] {
  return mergeCoordinateDrafts(list, draft).map((hamlet) =>
    draft[hamlet.id] ? { ...hamlet, verified: false } : hamlet,
  );
}
