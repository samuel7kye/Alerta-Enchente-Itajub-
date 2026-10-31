import { NextResponse } from 'next/server';
import { fetchWeather } from '@/lib/weather';

export async function GET() {
  try {
    const weather = await fetchWeather();
    return NextResponse.json(weather);
  } catch (err) {
    return NextResponse.json(
      { error: 'Não foi possível consultar a previsão agora.', detail: (err as Error).message },
      { status: 502 }
    );
  }
}