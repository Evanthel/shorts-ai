"use client";

import { useEffect, useState } from "react";
import {
  fetchLocationForecast,
  findClosestForecast,
  searchLocations,
} from "@/features/weather/open-meteo";
import type { GeoLocation, LocationForecast } from "@/features/weather/open-meteo";
import { subscribeWeatherPreviewForecast } from "@/features/weather/preview-events";
import type { WeatherSnapshot } from "@/types/domain";

type WeatherMood = "calm" | "rain" | "wind" | "heat";
type ChartPoint = {
  label: string;
  weather: WeatherSnapshot | null;
  x: number;
  y: number;
};

export function HeroWeatherVisual() {
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [weatherSeries, setWeatherSeries] = useState<WeatherSnapshot[]>([]);
  const [mood, setMood] = useState<WeatherMood>("calm");
  const chartPoints = getChartPoints(weatherSeries);
  const routePath = getRoutePath(chartPoints);
  const moodLabel = getWeatherMoodLabel(mood);

  useEffect(() => {
    let ignore = false;
    let plannerForecastReceived = false;

    function applyForecast(forecast: LocationForecast) {
      const series = getPreviewSeries(forecast);
      const current = series[0];

      if (!current || ignore) {
        return;
      }

      setWeather(current);
      setWeatherSeries(series);
      setMood(getWeatherMood(current));
    }

    const unsubscribePreview = subscribeWeatherPreviewForecast((forecast) => {
      plannerForecastReceived = true;
      applyForecast(forecast);
    });

    async function loadWeather(location: GeoLocation) {
      try {
        const forecast = await fetchLocationForecast(location);

        if (!plannerForecastReceived) {
          applyForecast(forecast);
        }
      } catch {
        if (!ignore) {
          setMood("calm");
        }
      }
    }

    async function loadFallbackWeather() {
      const results = await searchLocations("Warsaw");

      if (results[0]) {
        await loadWeather(results[0]);
      }
    }

    if (!navigator.geolocation) {
      void loadFallbackWeather();
      return () => {
        ignore = true;
        unsubscribePreview();
      };
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        void loadWeather({
          id: 0,
          name: "Your location",
          country: "",
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          timezone: "auto",
        });
      },
      () => {
        void loadFallbackWeather();
      },
      {
        enableHighAccuracy: false,
        maximumAge: 30 * 60 * 1000,
        timeout: 2500,
      },
    );

    return () => {
      ignore = true;
      unsubscribePreview();
    };
  }, []);

  return (
    <div className="hero-visual" aria-label="Weather route preview">
      <div className={`route-map route-weather-${mood}`}>
        <span className="map-grid" />
        <span className="weather-atmosphere" aria-hidden="true" />
        {Array.from({ length: 12 }, (_, index) => (
          <span
            key={index}
            className={`weather-particle particle-${index + 1}`}
            aria-hidden="true"
          />
        ))}
        <div className="weather-mood-pill" aria-live="polite">
          <span>{moodLabel}</span>
          <strong>
            {weather
              ? `${weather.rainProbabilityPercent}% rain | ${weather.windKph} km/h`
              : "Loading live weather"}
          </strong>
        </div>
        <svg viewBox="0 0 620 520" role="img" aria-label="Running route and forecast timeline">
          <path
            className="terrain-line terrain-line-a"
            d="M20 118 C120 60 200 160 292 104 C400 36 478 128 604 72"
          />
          <path
            className="terrain-line terrain-line-b"
            d="M14 326 C126 256 196 386 312 302 C418 226 492 332 610 270"
          />
          <path
            className="route-line"
            d={routePath}
          />
          {chartPoints.map((point, index) => (
            <circle
              key={point.label}
              className={index === 1 ? "route-point mid" : "route-point"}
              cx={point.x}
              cy={point.y}
              r={index === 1 ? 9 : 12}
            />
          ))}
        </svg>
        {chartPoints.map((point) => (
          <div
            key={point.label}
            className="forecast-chip"
            style={{
              left: `${(point.x / 620) * 100}%`,
              top: `${(point.y / 520) * 100}%`,
            }}
          >
            <span>{point.label}</span>
            <strong>
              {point.weather ? `${point.weather.temperatureC} C` : point.label === "Now" ? "Live" : "Forecast"}
            </strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function getChartPoints(series: WeatherSnapshot[]): ChartPoint[] {
  const labels = ["Now", "+1h", "+3h"];
  const xPositions = [104, 310, 516];
  const values = series.map((item) => item.temperatureC);
  const fallbackY = [346, 252, 188];

  if (values.length === 0) {
    return labels.map((label, index) => ({
      label,
      weather: null,
      x: xPositions[index],
      y: fallbackY[index],
    }));
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(4, max - min);
  const visualMin = min - (range - (max - min)) / 2;
  const chartTop = 118;
  const chartBottom = 382;

  return labels.map((label, index) => {
    const item = series[index] ?? null;
    const value = item?.temperatureC ?? min;
    const normalized = (value - visualMin) / range;
    const y = chartBottom - normalized * (chartBottom - chartTop);

    return {
      label,
      weather: item,
      x: xPositions[index],
      y: Math.round(y),
    };
  });
}

function getPreviewSeries(forecast: LocationForecast) {
  const now = new Date();

  return [0, 1, 3].map((hourOffset) =>
    findClosestForecast(forecast.hourly, addHours(now, hourOffset).toISOString()),
  );
}

function getRoutePath(points: ChartPoint[]) {
  const [first, second, third] = points;

  return [
    `M${first.x} ${first.y}`,
    `C${first.x + 86} ${first.y} ${second.x - 86} ${second.y} ${second.x} ${second.y}`,
    `S${third.x - 86} ${third.y} ${third.x} ${third.y}`,
  ].join(" ");
}

function getWeatherMood(weather: WeatherSnapshot): WeatherMood {
  if (weather.rainProbabilityPercent >= 35) {
    return "rain";
  }

  if (weather.windKph >= 18) {
    return "wind";
  }

  if (weather.temperatureC >= 23) {
    return "heat";
  }

  return "calm";
}

function getWeatherMoodLabel(mood: WeatherMood) {
  if (mood === "rain") {
    return "Rain signal";
  }

  if (mood === "wind") {
    return "Wind signal";
  }

  if (mood === "heat") {
    return "Heat signal";
  }

  return "Calm signal";
}

function addHours(date: Date, hours: number) {
  const next = new Date(date);
  next.setHours(next.getHours() + hours);

  return next;
}
