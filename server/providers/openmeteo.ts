import type { LiveAirQuality, LiveProvider, LiveWeather } from './types';

/**
 * Open-Meteo — live weather and air quality over Lucknow.
 *
 * Chosen because it is the only provider of either that needs no API key at all
 * for non-commercial use, which means these two layers work on a fresh clone
 * with no .env and no signup. OpenWeatherMap, WeatherAPI, AQICN and AirVisual
 * all gate their free tiers behind a key, and a layer that silently reports
 * "provider unavailable" until someone registers is a dummy button in practice.
 *
 * Weather:      https://open-meteo.com/en/docs
 * Air quality:  https://open-meteo.com/en/docs/air-quality-api
 *
 * Both return one CURRENT observation for the point, so `items` has length 1.
 * That is deliberate rather than awkward — the envelope contract is a list, and
 * a city-wide reading is a list of one.
 */

/** Hazratganj, near enough the centre for a city-wide reading. */
const LAT = 26.8467;
const LON = 80.9462;

/** WMO weather interpretation codes -> short English. */
const WMO: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Depositing rime fog',
  51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
  56: 'Light freezing drizzle', 57: 'Dense freezing drizzle',
  61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
  66: 'Light freezing rain', 67: 'Heavy freezing rain',
  71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
  85: 'Slight snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail',
};

/**
 * US EPA AQI bands. Open-Meteo returns the index itself; this is only the label,
 * so the number and its category can never disagree.
 */
function aqiCategory(aqi: number): string {
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Unhealthy for Sensitive Groups';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very Unhealthy';
  return 'Hazardous';
}

async function getJSON(url: string): Promise<any> {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  return res.json();
}

export class OpenMeteoWeatherProvider implements LiveProvider<LiveWeather> {
  public readonly name = 'Open-Meteo';

  // No key required, so this adapter can always run.
  public isConfigured(): boolean { return true; }
  public unavailableReason(): string { return ''; }

  public async fetch(): Promise<LiveWeather[]> {
    const url = 'https://api.open-meteo.com/v1/forecast'
      + `?latitude=${LAT}&longitude=${LON}`
      + '&current=temperature_2m,relative_humidity_2m,apparent_temperature,'
      + 'wind_speed_10m,wind_direction_10m,weather_code,is_day,precipitation,surface_pressure'
      + '&timezone=Asia%2FKolkata';

    const j = await getJSON(url);
    const c = j?.current;
    if (!c || typeof c.temperature_2m !== 'number') {
      throw new Error('Open-Meteo returned no current observation');
    }

    return [{
      observedAt: c.time ? Date.parse(`${c.time}+05:30`) : null,
      temperatureC: c.temperature_2m,
      apparentTemperatureC: c.apparent_temperature ?? null,
      humidityPct: c.relative_humidity_2m ?? null,
      windSpeedKph: c.wind_speed_10m ?? null,
      windDirectionDeg: c.wind_direction_10m ?? null,
      precipitationMm: c.precipitation ?? null,
      pressureHpa: c.surface_pressure ?? null,
      isDay: c.is_day === 1,
      code: typeof c.weather_code === 'number' ? c.weather_code : null,
      description: WMO[c.weather_code] ?? 'Unknown',
    }];
  }
}

export class OpenMeteoAirQualityProvider implements LiveProvider<LiveAirQuality> {
  public readonly name = 'Open-Meteo Air Quality';

  public isConfigured(): boolean { return true; }
  public unavailableReason(): string { return ''; }

  public async fetch(): Promise<LiveAirQuality[]> {
    const url = 'https://air-quality-api.open-meteo.com/v1/air-quality'
      + `?latitude=${LAT}&longitude=${LON}`
      + '&current=pm2_5,pm10,us_aqi,carbon_monoxide,nitrogen_dioxide,ozone,sulphur_dioxide'
      + '&timezone=Asia%2FKolkata';

    const j = await getJSON(url);
    const c = j?.current;
    if (!c || typeof c.us_aqi !== 'number') {
      throw new Error('Open-Meteo air quality returned no current observation');
    }

    // Which pollutant is actually driving the index. Lucknow is almost always
    // PM2.5, but stating it is only honest if it is derived rather than assumed.
    const pm25 = c.pm2_5 ?? 0;
    const pm10 = c.pm10 ?? 0;
    const dominant = pm25 / 35 >= pm10 / 154 ? 'PM2.5' : 'PM10';

    return [{
      observedAt: c.time ? Date.parse(`${c.time}+05:30`) : null,
      usAqi: c.us_aqi,
      category: aqiCategory(c.us_aqi),
      dominantPollutant: dominant,
      pm25: c.pm2_5 ?? null,
      pm10: c.pm10 ?? null,
      carbonMonoxide: c.carbon_monoxide ?? null,
      nitrogenDioxide: c.nitrogen_dioxide ?? null,
      ozone: c.ozone ?? null,
      sulphurDioxide: c.sulphur_dioxide ?? null,
    }];
  }
}
