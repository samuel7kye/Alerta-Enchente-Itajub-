import { prisma } from '@/lib/prisma';
import { sincronizarEstacoes } from '@/lib/station-sync';

const IBGE_ITAJUBA = '3132404';

type Aviso = { id: string; nivel: 'verde' | 'amarelo' | 'vermelho'; descricao: string; ts: Date };

async function gravarAvisos(avisos: Aviso[]) {
  await Promise.all(avisos.map(({ id, ...dados }) => prisma.alerta.upsert({
    where: { id },
    update: dados,
    create: { id, ...dados, bairro: 'Itajubá' },
  })));
  return avisos.length;
}

async function sincronizarAvisosCemaden() {
  const resposta = await fetch('https://painelalertas.cemaden.gov.br/wsAlertas2', {
    signal: AbortSignal.timeout(6500), cache: 'no-store',
  });
  if (!resposta.ok) throw new Error(`Cemaden: HTTP ${resposta.status}`);
  const dados: { alertas: {
    codibge: number;
    cod_alerta: number;
    nivel: string;
    evento: string;
    ult_atualizacao: string;
  }[] } = await resposta.json();
  if (!Array.isArray(dados.alertas)) throw new Error('Resposta de avisos do Cemaden inválida');

  const avisos: Aviso[] = [];
  for (const alerta of dados.alertas) {
    if (String(alerta.codibge) !== IBGE_ITAJUBA) continue;
    const ts = new Date(`${alerta.ult_atualizacao.replace(' ', 'T')}Z`);
    if (!Number.isFinite(ts.getTime())) continue;
    const nivel = alerta.nivel === 'Muito Alto' || alerta.nivel === 'Alto' ? 'vermelho' : 'amarelo';
    avisos.push({ id: `cemaden-${alerta.cod_alerta}`, nivel, descricao: alerta.evento, ts });
  }
  return gravarAvisos(avisos);
}

async function sincronizarAvisosInmet() {
  const resposta = await fetch('https://apiprevmet3.inmet.gov.br/avisos/ativos', {
    signal: AbortSignal.timeout(6500), cache: 'no-store',
  });
  if (!resposta.ok) throw new Error(`INMET: HTTP ${resposta.status}`);
  const dados: { hoje: {
    id_aviso: number;
    geocodes: string;
    severidade: string;
    descricao: string;
    inicio: string;
    encerrado: boolean;
  }[] } = await resposta.json();
  if (!Array.isArray(dados.hoje)) throw new Error('Resposta de avisos do INMET inválida');

  const avisos: Aviso[] = [];
  for (const alerta of dados.hoje) {
    if (alerta.encerrado || !alerta.geocodes?.split(',').map(codigo => codigo.trim()).includes(IBGE_ITAJUBA)) continue;
    const ts = new Date(`${alerta.inicio.replace(' ', 'T')}-03:00`);
    if (!Number.isFinite(ts.getTime())) continue;
    const nivel = ['Perigo', 'Grande Perigo'].includes(alerta.severidade) ? 'vermelho' : 'amarelo';
    avisos.push({ id: `inmet-${alerta.id_aviso}`, nivel, descricao: `${alerta.descricao} · ${alerta.severidade}`, ts });
  }
  return gravarAvisos(avisos);
}

export async function sincronizarTodasFontes() {
  const [estacoes, [cemaden, inmet]] = await Promise.all([
    sincronizarEstacoes(false),
    Promise.allSettled([sincronizarAvisosCemaden(), sincronizarAvisosInmet()]),
  ]);
  const limite = Date.now() - 2 * 60 * 60 * 1000;
  const recentes = estacoes.filter(e => e.coletadoEm && Date.parse(e.coletadoEm) > limite).length;
  const avisosFalharam = cemaden.status === 'rejected' || inmet.status === 'rejected';
  const status = recentes === 0 ? 'no_recent_readings'
    : recentes < estacoes.length || avisosFalharam ? 'partial' : 'success';

  return {
    status,
    estacoes,
    avisos: {
      cemaden: cemaden.status === 'fulfilled' ? cemaden.value : null,
      inmet: inmet.status === 'fulfilled' ? inmet.value : null,
    },
  };
}
