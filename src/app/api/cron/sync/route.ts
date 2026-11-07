import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sincronizarTodasFontes } from '@/lib/real-data-sync';

export const dynamic = 'force-dynamic';

const CRON_SECRET = process.env.CRON_SECRET || 'sync-secret-change-me';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret');

  // Verificar autenticação via header ou query param
  const providedSecret = authHeader?.replace('Bearer ', '') || secret;
  
  if (providedSecret !== CRON_SECRET) {
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
        status: 'success',
        detalhes: JSON.stringify(resultado),
        duracaoSeg: duracao,
      },
    }).catch(() => {}); // Não falhar se tabela não existir
    
    return NextResponse.json({
      success: true,
      message: 'Sincronização concluída',
      resultado,
      duracaoSeg: duracao,
    });
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
        detail: (error as Error).message 
      },
      { status: 500 }
    );
  }
}

// Permitir POST também (para webhooks)
export async function POST(request: Request) {
  return GET(request);
}