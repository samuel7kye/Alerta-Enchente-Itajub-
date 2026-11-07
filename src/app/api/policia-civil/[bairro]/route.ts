import { NextResponse } from 'next/server';
import { fetchWeatherHistoryByBairro } from '@/lib/policia-civil';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ bairro: string }> }
) {
  try {
    const { bairro } = await params;
    const { searchParams } = new URL(request.url);
    const hours = parseInt(searchParams.get('hours') || '24', 10);

    const data = await fetchWeatherHistoryByBairro(bairro, hours);

    if (data.length === 0) {
      return NextResponse.json(
        { error: 'Bairro não encontrado ou sem estação da Polícia Civil.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      bairro,
      horas: hours,
      dados: data,
    });
  } catch (err) {
    console.error('Erro ao buscar histórico da Polícia Civil:', err);
    return NextResponse.json(
      { error: 'Não foi possível consultar o histórico.', detail: (err as Error).message },
      { status: 502 }
    );
  }
}