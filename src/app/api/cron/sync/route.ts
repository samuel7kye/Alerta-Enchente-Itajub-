import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sincronizarTodasFontes } from '@/lib/real-data-sync';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || request.headers.get('authorization') !== `Bearer ${segredo}`) {
    return NextResponse.json(
      { error: 'Não autorizado. Configure CRON_SECRET.' },
      { status: 401 }
    );
  }

  const inicio = Date.now();
  
  try {
    console.log('[CRON] Iniciando sincronização agendada...');
    const resultado = await sincronizarTodasFontes();
    const duracao = (Date.now() - inicio) / 1000;
    
    // Salvar log no banco
    await prisma.syncLog.create({
      data: {
        fonte: 'cron',
        status: resultado.status,
        detalhes: JSON.stringify(resultado),
        duracaoSeg: duracao,
      },
    });
    
    return NextResponse.json({
      success: resultado.status !== 'no_recent_readings',
      resultado,
      duracaoSeg: duracao,
    }, { status: resultado.status === 'no_recent_readings' ? 502 : 200 });
  } catch (error) {
    const duracao = (Date.now() - inicio) / 1000;
    console.error('[CRON] Erro na sincronização:', error);
    
    await prisma.syncLog.create({
      data: {
        fonte: 'cron',
        status: 'error',
        detalhes: (error as Error).message,
        duracaoSeg: duracao,
      },
    }).catch(() => {});
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Erro interno na sincronização',
      },
      { status: 500 }
    );
  }
}

// Permitir POST também (para webhooks)
export async function POST(request: Request) {
  return GET(request);
}
