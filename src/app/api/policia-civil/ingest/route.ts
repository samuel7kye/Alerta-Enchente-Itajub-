import { NextResponse } from 'next/server';
import { ingestPoliciaCivilData } from '@/lib/policia-civil';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

function adminAuth(request: Request): boolean {
  if (!ADMIN_TOKEN) return false;
  const auth = request.headers.get('authorization');
  return auth === `Bearer ${ADMIN_TOKEN}`;
}

export async function POST(request: Request) {
  if (!adminAuth(request)) {
    return NextResponse.json(
      { error: 'Token administrativo inválido ou não configurado.' },
      { status: ADMIN_TOKEN ? 401 : 503 }
    );
  }

  try {
    const body = await request.json();
    const { stationId, precipitacaoMm, nivelRioCm, status, observacao } = body;

    if (!stationId || precipitacaoMm === undefined || !status) {
      return NextResponse.json(
        { error: 'stationId, precipitacaoMm e status são obrigatórios.' },
        { status: 400 }
      );
    }

    if (!['verde', 'amarelo', 'vermelho'].includes(status)) {
      return NextResponse.json({ error: 'Status inválido. Use: verde, amarelo ou vermelho.' }, { status: 400 });
    }

    const record = await ingestPoliciaCivilData(stationId, {
      precipitacaoMm: Number(precipitacaoMm),
      nivelRioCm: nivelRioCm !== undefined ? Number(nivelRioCm) : undefined,
      status,
      observacao,
    });

    return NextResponse.json(record, { status: 201 });
  } catch (err) {
    console.error('Erro ao ingerir dados da Polícia Civil:', err);
    return NextResponse.json(
      { error: 'Erro interno ao salvar dados.', detail: (err as Error).message },
      { status: 500 }
    );
  }
}