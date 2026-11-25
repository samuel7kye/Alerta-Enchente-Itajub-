import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { buscarLeiturasDosPontos } from '@/lib/policia-civil';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [pontos, alertas, relatos] = await Promise.all([
    prisma.ponto.findMany({ orderBy: { bairro: 'asc' } }),
    prisma.alerta.findMany({ orderBy: { ts: 'desc' }, take: 30 }),
    prisma.relato.findMany({ orderBy: { ts: 'desc' }, take: 30 }),
  ]);

  const leiturasPorPonto = await buscarLeiturasDosPontos(pontos);
  return NextResponse.json(
    { pontos, alertas, relatos, leiturasPorPonto },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
