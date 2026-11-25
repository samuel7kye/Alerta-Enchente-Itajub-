const { loadEnvConfig } = require('@next/env');

loadEnvConfig(process.cwd());

const segredo = process.env.CRON_SECRET;
const url = new URL('/api/cron/sync', process.env.SYNC_BASE_URL || 'http://localhost:3000');
const intervalo = Number(process.env.SYNC_INTERVAL_MINUTES || 15) * 60_000;

if (!segredo || !Number.isFinite(intervalo) || intervalo < 60_000) {
  console.error('Configure CRON_SECRET e use um intervalo de pelo menos um minuto.');
  process.exit(1);
}

async function sincronizar() {
  try {
    const resposta = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${segredo}` },
      signal: AbortSignal.timeout(30_000),
    });
    console.log(new Date().toISOString(), resposta.status, await resposta.json());
  } catch (error) {
    console.error(new Date().toISOString(), 'Falha ao chamar o cron:', error.message);
  } finally {
    setTimeout(sincronizar, intervalo);
  }
}

void sincronizar();
