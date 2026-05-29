"use client";

import { useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Route } from "next";

import { Button } from "@/components/ui/button";

type Props = {
  currentPath?: string;
};

export function GeoDiscoveryButton({ currentPath = "/discover" }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleNearMe() {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.");
      return;
    }

    setLoading(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;

        try {
          const resp = await fetch(
            `/api/geocode/reverse?lat=${latitude.toFixed(6)}&lon=${longitude.toFixed(6)}`
          );

          if (!resp.ok) throw new Error("Reverse geocoding failed.");

          const data = (await resp.json()) as { locality?: string | null };
          const locality = data.locality ?? null;

          if (!locality) {
            setError("Could not determine your area. Please type a city name instead.");
            setLoading(false);
            return;
          }

          const url = new URL(currentPath, window.location.origin);
          url.searchParams.set("city", locality);
          router.push((url.pathname + url.search) as Route);
        } catch {
          setError("Unable to detect your location. Please type a suburb or city manually.");
          setLoading(false);
        }
      },
      (err) => {
        const messages: Record<number, string> = {
          1: "Location access was denied. Enable it in your browser settings.",
          2: "Location could not be determined. Try typing your suburb.",
          3: "Location request timed out. Try again."
        };
        setError(messages[err.code] ?? "Unable to get your location.");
        setLoading(false);
      },
      { timeout: 10_000, maximumAge: 60_000 }
    );
  }

  return (
    <div className="space-y-1">
      <Button
        variant="secondary"
        onClick={handleNearMe}
        disabled={loading}
        className="w-full"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <MapPin className="h-4 w-4" />
        )}
        {loading ? "Detecting location…" : "Near me"}
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
