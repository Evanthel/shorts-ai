import type { LocationForecast } from "@/features/weather/open-meteo";

const weatherPreviewEventName = "shorts-ai:weather-preview";

export function publishWeatherPreviewForecast(forecast: LocationForecast) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<LocationForecast>(weatherPreviewEventName, {
      detail: forecast,
    }),
  );
}

export function subscribeWeatherPreviewForecast(
  onForecast: (forecast: LocationForecast) => void,
) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handler = (event: Event) => {
    onForecast((event as CustomEvent<LocationForecast>).detail);
  };

  window.addEventListener(weatherPreviewEventName, handler);

  return () => {
    window.removeEventListener(weatherPreviewEventName, handler);
  };
}
