import { NextResponse } from 'next/server';
import { fetchLatestWeatherByBairro, fetchAllStations } from '@/lib/policia-civil';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [bairros, stations] = await Promise.all([
      fetchLatestWeatherByBairro(),
      fetchAllStations(),
    ]);

    return NextResponse.json({
      bairros,
      stations,
      atualizadoEm: new Date().toISOString(),
      fonte: 'Polícia Civil de Itajubá - MG',
    });
  } catch (err) {
    console.error('Erro ao buscar dados da Polícia Civil:', err);
    return NextResponse.json(
      { error: 'Não foi possível consultar os dados da Polícia Civil.', detail: (err as Error).message },
      { status: 502 }
    );
  }
}