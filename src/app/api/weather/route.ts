import { NextResponse } from 'next/server';
import { fetchWeather } from '@/lib/weather';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const weather = await fetchWeather();

    // Store snapshot for each bairro with station
    const bairrosComStation = await prisma.bairroItajuba.findMany({
      where: {
        policiaCivilStations: { some: { ativo: true } },
      },
    });

    await Promise.all(
      bairrosComStation.map((bairro) =>
        prisma.weatherSnapshot.create({
          data: {
            bairroId: bairro.id,
            provider: weather.provider,
            rainMm: weather.rainMm,
            next6hMaxRainMm: weather.next6hMaxRainMm,
            next6hMaxProbability: weather.next6hMaxProbability,
            status: weather.status,
            message: weather.message,
            observedAt: new Date(weather.observedAt),
            fetchedAt: new Date(weather.fetchedAt),
          },
        })
      )
    );

    return NextResponse.json(weather);
  } catch (err) {
    return NextResponse.json(
      { error: 'Não foi possível consultar a previsão agora.', detail: (err as Error).message },
      { status: 502 }
    );
  }
}