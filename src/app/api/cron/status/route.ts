import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const logs = await prisma.syncLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const stats = await prisma.syncLog.groupBy({
      by: ['status'],
      _count: { status: true },
    });

    const ultimaSincronizacao = logs[0]?.createdAt || null;

    return NextResponse.json({
      logs,
      stats: stats.reduce((acc, s) => ({ ...acc, [s.status]: s._count.status }), {}),
      ultimaSincronizacao,
      totalExecucoes: logs.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Erro ao buscar logs de sincronização', detail: (error as Error).message },
      { status: 500 }
    );
  }
}