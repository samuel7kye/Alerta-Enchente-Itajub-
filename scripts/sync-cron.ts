#!/usr/bin/env node
/**
 * Script de sincronização automática para desenvolvimento local
 * Roda a cada 15 minutos e sincroniza dados do CEMADEN, INMET e ANA
 * 
 * Uso: npx ts-node --esm scripts/sync-cron.ts
 * Ou: node scripts/sync-cron.js (após build)
 */

import { sincronizarTodasFontes } from '../src/lib/real-data-sync.js';
import { prisma } from '../src/lib/prisma.js';

const INTERVALO_MINUTOS = parseInt(process.env.SYNC_INTERVAL_MINUTES || '15', 10);
const CRON_SECRET = process.env.CRON_SECRET || 'sync-secret-change-me';

async function executarSincronizacao() {
  const inicio = Date.now();
  console.log(`\n[${new Date().toISOString()}] 🔄 Iniciando sincronização agendada...`);
  
  try {
    const resultado = await sincronizarTodasFontes();
    const duracao = ((Date.now() - inicio) / 1000).toFixed(1);
    
    console.log(`[${new Date().toISOString()}] ✅ Sincronização concluída em ${duracao}s`);
    console.log('   CEMADEN:', resultado.cemaden);
    console.log('   INMET:', resultado.inmet);
    console.log('   ANA:', resultado.ana);
    
    // Log no banco para auditoria
    await prisma.$executeRaw`
      INSERT INTO "SyncLog" ("fonte", "status", "detalhes", "duracaoSeg", "createdAt")
      VALUES ('cron', 'success', ${JSON.stringify(resultado)}, ${duracao}, ${new Date()})
    `.catch(() => {}); // Tabela pode não existir ainda
    
  } catch (error) {
    const duracao = ((Date.now() - inicio) / 1000).toFixed(1);
    console.error(`[${new Date().toISOString()}] ❌ Erro na sincronização (${duracao}s):`, error);
    
    await prisma.$executeRaw`
      INSERT INTO "SyncLog" ("fonte", "status", "detalhes", "duracaoSeg", "createdAt")
      VALUES ('cron', 'error', ${(error as Error).message}, ${duracao}, ${new Date()})
    `.catch(() => {});
  }
}

// Função principal
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  Alerta Enchentes Itajubá - Sincronização Automática      ║');
  console.log('║  Fontes: CEMADEN + INMET + ANA (quando token disponível)  ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`\n⏱️  Intervalo: ${INTERVALO_MINUTOS} minutos`);
  console.log(`🔐 CRON_SECRET: ${CRON_SECRET.substring(0, 8)}...`);
  console.log(`🌐 Banco: ${process.env.DATABASE_URL || 'file:./dev.db'}\n`);

  // Executar imediatamente na inicialização
  await executarSincronizacao();

  // Agendar execuções periódicas
  const intervaloMs = INTERVALO_MINUTOS * 60 * 1000;
  const intervalId = setInterval(executarSincronizacao, intervaloMs);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Recebido SIGINT, encerrando...');
    clearInterval(intervalId);
    await prisma.$disconnect();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n🛑 Recebido SIGTERM, encerrando...');
    clearInterval(intervalId);
    await prisma.$disconnect();
    process.exit(0);
  });

  console.log('✅ Cron job ativo. Pressione Ctrl+C para parar.\n');
}

main().catch(async (error) => {
  console.error('❌ Erro fatal:', error);
  await prisma.$disconnect();
  process.exit(1);
});