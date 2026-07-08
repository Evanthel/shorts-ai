import type { HourlyForecast, WeatherSnapshot } from "../domain";

export type GeoLocation = {
  id: number;
  name: string;
  country: string;
  admin1?: string;
  latitude: number;
  longitude: number;
  timezone: string;
};

type GeocodingResponse = {
  results?: Array<{
    id: number;
    name: string;
    country?: string;
    admin1?: string;
    latitude: number;
    longitude: number;
    timezone?: string;
  }>;
};

type ForecastResponse = {
  timezone: string;
  hourly: {
    time: string[];
    temperature_2m: number[];
    apparent_temperature: number[];
    relative_humidity_2m: number[];
    precipitation_probability: number[];
    uv_index: number[];
    wind_speed_10m: number[];
  };
};

export type LocationForecast = {
  location: GeoLocation;
  hourly: HourlyForecast[];
};

const hourlyVariables = [
  "temperature_2m",
  "apparent_temperature",
  "relative_humidity_2m",
  "precipitation_probability",
  "uv_index",
  "wind_speed_10m",
].join(",");

export async function searchLocations(query: string): Promise<GeoLocation[]> {
  const trimmedQuery = query.trim();

  if (trimmedQuery.length < 2) {
    return [];
  }

  const params = new URLSearchParams({
    name: trimmedQuery,
    count: "6",
    language: "en",
    format: "json",
  });
  const response = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`,
  );

  if (!response.ok) {
    throw new Error("Location search failed.");
  }

  const data = (await response.json()) as GeocodingResponse;

  return (data.results ?? []).map((result) => ({
    id: result.id,
    name: result.name,
    country: result.country ?? "",
    admin1: result.admin1,
    latitude: result.latitude,
    longitude: result.longitude,
    timezone: result.timezone ?? "auto",
  }));
}

export async function fetchLocationForecast(
  location: GeoLocation,
): Promise<LocationForecast> {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    hourly: hourlyVariables,
    forecast_days: "3",
    timezone: "auto",
    wind_speed_unit: "kmh",
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);

  if (!response.ok) {
    throw new Error("Weather forecast failed.");
  }

  const data = (await response.json()) as ForecastResponse;

  return {
    location: {
      ...location,
      timezone: data.timezone || location.timezone,
    },
    hourly: mapHourlyForecast(data, location),
  };
}

export function findClosestForecast(
  hourly: HourlyForecast[],
  targetTime: string,
): HourlyForecast {
  const target = new Date(targetTime).getTime();

  if (!Number.isFinite(target)) {
    return hourly[0];
  }

  return hourly.reduce((closest, current) => {
    const closestDistance = Math.abs(new Date(closest.time).getTime() - target);
    const currentDistance = Math.abs(new Date(current.time).getTime() - target);

    return currentDistance < closestDistance ? current : closest;
  }, hourly[0]);
}

export function formatLocationLabel(location: GeoLocation) {
  return [location.name, location.admin1, location.country].filter(Boolean).join(", ");
}

function mapHourlyForecast(data: ForecastResponse, location: GeoLocation): HourlyForecast[] {
  return data.hourly.time.map((time, index) =>
    createWeatherSnapshot(time, index, data, formatLocationLabel(location)),
  );
}

function createWeatherSnapshot(
  time: string,
  index: number,
  data: ForecastResponse,
  locationLabel: string,
): WeatherSnapshot {
  return {
    temperatureC: roundNumber(data.hourly.temperature_2m[index]),
    feelsLikeC: roundNumber(data.hourly.apparent_temperature[index]),
    windKph: roundNumber(data.hourly.wind_speed_10m[index]),
    humidityPercent: Math.round(data.hourly.relative_humidity_2m[index]),
    rainProbabilityPercent: Math.round(data.hourly.precipitation_probability[index] ?? 0),
    uvIndex: roundNumber(data.hourly.uv_index[index]),
    time,
    locationLabel,
  };
}

function roundNumber(value: number) {
  return Math.round(value * 10) / 10;
}
