import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [pontos, alertas, relatos] = await Promise.all([
    prisma.ponto.findMany({ orderBy: { bairro: 'asc' } }),
    prisma.alerta.findMany({ orderBy: { ts: 'desc' }, take: 30 }),
    prisma.relato.findMany({ orderBy: { ts: 'desc' }, take: 30 }),
  ]);

  return NextResponse.json({ pontos, alertas, relatos });
}