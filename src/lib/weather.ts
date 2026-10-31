import { WeatherData } from '@/types';

const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast?latitude=-22.4258&longitude=-45.4528&current=precipitation,rain,showers&hourly=precipitation_probability,precipitation&forecast_days=1&timezone=America%2FSao_Paulo';

let weatherCache: { expires: number; data: WeatherData | null } = { expires: 0, data: null };

function statusFor(rain: number, probability: number): 'normal' | 'atencao' | 'vermelho' {
  if (rain >= 15 || (rain >= 8 && probability >= 70)) return 'vermelho';
  if (rain >= 5 || probability >= 60) return 'atencao';
  return 'normal';
}

function getMessage(status: 'normal' | 'atencao' | 'vermelho'): string {
  switch (status) {
    case 'vermelho':
      return 'Chuva intensa ou previsão elevada. Evite áreas alagáveis e acompanhe a Defesa Civil.';
    case 'atencao':
      return 'Condições de atenção para chuva. Evite atravessar ruas alagadas e acompanhe atualizações.';
    default:
      return 'Sem indicativo meteorológico elevado no momento. Continue atento aos comunicados oficiais.';
  }
}

export async function fetchWeather(): Promise<WeatherData> {
  const now = Date.now();
  if (weatherCache.data && now < weatherCache.expires) {
    return weatherCache.data;
  }

  try {
    const response = await fetch(WEATHER_URL, {
      signal: AbortSignal.timeout(7000),
      headers: { 'User-Agent': 'AlertaEnchentesItajuba/1.0' },
    });

    if (!response.ok) {
      throw new Error(`Open-Meteo respondeu ${response.status}`);
    }

    const raw = await response.json();
    const currentTime = raw.current?.time;
    const hours = raw.hourly?.time || [];
    const start = Math.max(0, hours.findIndex((t: string) => t >= currentTime));

    const probability = Math.max(
      0,
      ...((raw.hourly?.precipitation_probability || []).slice(start, start + 6).map(Number).filter(Number.isFinite))
    );
    const nextRain = Math.max(
      0,
      ...((raw.hourly?.precipitation || []).slice(start, start + 6).map(Number).filter(Number.isFinite))
    );
    const rain = Number(raw.current?.precipitation) || 0;
    const status = statusFor(rain, probability);

    const data: WeatherData = {
      provider: 'Open-Meteo',
      location: 'Itajubá, MG',
      observedAt: currentTime,
      fetchedAt: new Date().toISOString(),
      rainMm: rain,
      next6hMaxRainMm: nextRain,
      next6hMaxProbability: probability,
      status,
      message: getMessage(status),
      disclaimer: 'Estimativa meteorológica automatizada; não mede o nível dos rios e não substitui alertas oficiais.',
    };

    weatherCache = { data, expires: now + 10 * 60 * 1000 };
    return data;
  } catch (err) {
    throw new Error(`Não foi possível consultar a previsão agora. ${(err as Error).message}`);
  }
}