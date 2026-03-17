"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";

interface MapUpdaterProps {
  center: { lat: number; lng: number } | null;
  zoom: number;
}

export default function MapUpdater({ center, zoom }: MapUpdaterProps) {
  const map = useMap();

  useEffect(() => {
    if (center) {
      map.setView([center.lat, center.lng], zoom, { animate: true, duration: 1.5 });
    }
  }, [center, zoom, map]);

  return null;
}
