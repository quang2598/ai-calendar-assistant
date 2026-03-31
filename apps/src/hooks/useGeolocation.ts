import { useEffect, useState, useCallback, useRef } from "react";

export type GeolocationCoordinates = {
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number | null;
  altitudeAccuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
};

export type GeolocationStatus = "idle" | "loading" | "success" | "error";

export type GeolocationState = {
  coordinates: GeolocationCoordinates | null;
  status: GeolocationStatus;
  error: string | null;
};

/**
 * Hook to get user's current location using the Geolocation Web API.
 *
 * Features:
 * - Requests precise location from browser on mount
 * - Watches for location changes and updates state
 * - Gracefully handles permission denials and errors
 * - Provides error messages for debugging
 *
 * @param enabled - Whether to request geolocation (default: true)
 * @param enableWatch - Whether to continuously watch for location changes (default: false)
 * @returns Object containing coordinates, status, and error
 *
 * @example
 * const { coordinates, status, error } = useGeolocation();
 * if (status === "success" && coordinates) {
 *   console.log(`User at ${coordinates.latitude}, ${coordinates.longitude}`);
 * }
 */
export function useGeolocation(
  enabled: boolean = true,
  enableWatch: boolean = false,
): GeolocationState {
  const [state, setState] = useState<GeolocationState>({
    coordinates: null,
    status: "idle",
    error: null,
  });

  const watchIdRef = useRef<number | null>(null);
  const requestIdRef = useRef<boolean>(false);

  const requestLocation = useCallback(() => {
    if (!enabled || requestIdRef.current) {
      return;
    }

    // Check if browser supports Geolocation API
    if (!navigator.geolocation) {
      setState({
        coordinates: null,
        status: "error",
        error: "Geolocation API is not supported by this browser.",
      });
      return;
    }

    requestIdRef.current = true;
    setState((prev) => ({
      ...prev,
      status: "loading",
    }));

    const successCallback = (position: GeolocationPosition) => {
      const {
        latitude,
        longitude,
        accuracy,
        altitude,
        altitudeAccuracy,
        heading,
        speed,
      } = position.coords;

      setState({
        coordinates: {
          latitude,
          longitude,
          accuracy,
          altitude,
          altitudeAccuracy,
          heading,
          speed,
        },
        status: "success",
        error: null,
      });
      requestIdRef.current = false;
    };

    const errorCallback = (error: GeolocationPositionError) => {
      let errorMessage = "Failed to get user location.";

      switch (error.code) {
        case error.PERMISSION_DENIED:
          errorMessage =
            "Location permission denied. Please enable location access in browser settings.";
          break;
        case error.POSITION_UNAVAILABLE:
          errorMessage = "Location information is unavailable.";
          break;
        case error.TIMEOUT:
          errorMessage = "Location request timeout. Please try again.";
          break;
      }

      setState({
        coordinates: null,
        status: "error",
        error: errorMessage,
      });
      requestIdRef.current = false;
    };

    const options: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 10000, // 10 seconds
      maximumAge: 0, // Don't use cached position
    };

    if (enableWatch) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        successCallback,
        errorCallback,
        options,
      );
    } else {
      navigator.geolocation.getCurrentPosition(
        successCallback,
        errorCallback,
        options,
      );
    }
  }, [enabled, enableWatch]);

  // Request location on mount and when dependencies change
  useEffect(() => {
    requestLocation();

    // Cleanup: stop watching position if enabled
    return () => {
      if (watchIdRef.current !== null && enableWatch) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [requestLocation, enableWatch]);

  return state;
}
