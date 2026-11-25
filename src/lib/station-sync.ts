import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';

const CEMADEN_URL = 'https://mapservices.cemaden.gov.br/MapaInterativoWS/resources/horario';
const ANA_URL = 'https://www.ana.gov.br/telemetria1ws/ServiceANA.asmx/DadosHidrometeorologicos';
const ANA_CODIGO = '61271000';
export const ANA_SAPUCAI_ID = `ana-${ANA_CODIGO}`;
export const CEMADEN_PLUVIOMETROS = ['cemaden-9347', 'cemaden-9348'];

const ESTACOES = [
  { id: ANA_SAPUCAI_ID, codigo: ANA_CODIGO, nome: 'Estação ANA Itajubá — Rio Sapucaí', bairro: 'Centro', latitude: -22.4458, longitude: -45.4242, fonte: 'ANA' },
  { id: CEMADEN_PLUVIOMETROS[0], codigo: '313240402A', nome: 'São Vicente', bairro: 'São Vicente', latitude: -22.43051, longitude: -45.45631, fonte: 'CEMADEN' },
  { id: CEMADEN_PLUVIOMETROS[1], codigo: '313240401A', nome: 'Estiva', bairro: 'Estiva', latitude: -22.41234, longitude: -45.43586, fonte: 'CEMADEN' },
] as const;

type Estacao = typeof ESTACOES[number];
interface Amostra {
  coletadoEm: string;
  precipitacaoMm: number;
  nivelRioCm: number | null;
}

function numero(valor: unknown): number | null {
  if (typeof valor === 'string' && valor.trim()) valor = Number(valor.trim().replace(',', '.'));
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null;
}

function maisRecente(amostras: Amostra[], agora: Date): Amostra | null {
  return amostras.reduce<Amostra | null>((ultima, amostra) => (
    amostra.coletadoEm <= agora.toISOString() && (!ultima || amostra.coletadoEm > ultima.coletadoEm)
      ? amostra : ultima
  ), null);
}

export function lerChuvaCemaden(payload: unknown, codigo: string, agora: Date): Amostra | null {
  const dados = payload as {
    estacao?: { codEstacao?: string };
    datas?: string[];
    horarios?: string[];
    acumulados?: unknown[][];
  } | null;
  if (dados?.estacao?.codEstacao !== codigo || !Array.isArray(dados.datas) ||
      !Array.isArray(dados.horarios) || !Array.isArray(dados.acumulados)) {
    throw new Error('Série horária do Cemaden inválida para a estação');
  }

  const { datas, horarios, acumulados } = dados;
  const amostras: Amostra[] = [];
  datas.forEach((data, i) => {
    const partes = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(data);
    if (!partes || !Array.isArray(acumulados[i])) return;
    const [, dia, mes, ano] = partes;
    horarios.forEach((hora, j) => {
      const horario = /^(\d{1,2})h$/.exec(hora);
      const chuva = numero(acumulados[i][j]);
      if (!horario || chuva === null || chuva < 0) return;

      const coleta = new Date(`${ano}-${mes}-${dia}T${horario[1].padStart(2, '0')}:00:00Z`);
      if (Number.isNaN(coleta.getTime()) || coleta.toISOString().slice(0, 10) !== `${ano}-${mes}-${dia}`) return;
      amostras.push({ coletadoEm: coleta.toISOString(), precipitacaoMm: chuva, nivelRioCm: null });
    });
  });
  return maisRecente(amostras, agora);
}

export function lerTelemetriaAna(xml: string, agora: Date): Amostra | null {
  if (!xml.includes('<DataTable') || !xml.includes('DadosHidrometereologicos')) {
    throw new Error('Série telemétrica da ANA inválida');
  }
  const amostras: Amostra[] = [];
  for (const [, registro] of Array.from(xml.matchAll(/<DadosHidrometereologicos\b[^>]*>([\s\S]*?)<\/DadosHidrometereologicos>/g))) {
    if (registro.match(/<CodEstacao>\s*(\d+)\s*<\/CodEstacao>/)?.[1] !== ANA_CODIGO) continue;
    const data = registro.match(/<DataHora>\s*(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})\s*<\/DataHora>/);
    const chuva = numero(registro.match(/<Chuva>([^<]+)<\/Chuva>/)?.[1]);
    const nivel = numero(registro.match(/<Nivel>([^<]+)<\/Nivel>/)?.[1]);
    if (!data || chuva === null || chuva < 0 || nivel === null || nivel < 0) continue;

    // A mesma leitura da ANA é publicada em UTC na série da UNIFEI.
    const coleta = new Date(`${data[1]}T${data[2]}Z`);
    if (Number.isNaN(coleta.getTime()) || coleta.toISOString().slice(0, 10) !== data[1]) continue;
    amostras.push({ coletadoEm: coleta.toISOString(), precipitacaoMm: chuva, nivelRioCm: nivel });
  }
  return maisRecente(amostras, agora);
}

async function coletar(estacao: Estacao) {
  const agora = new Date();
  const inicio = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' })
    .format(new Date(agora.getTime() - 86400000));
  const parametros = new URLSearchParams({ CodEstacao: ANA_CODIGO, DataInicio: inicio, DataFim: '' });
  const url = estacao.fonte === 'ANA'
    ? `${ANA_URL}?${parametros}`
    : `${CEMADEN_URL}/${estacao.id.slice('cemaden-'.length)}/24`;
  const resposta = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(6500) });
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);

  return estacao.fonte === 'ANA'
    ? lerTelemetriaAna(await resposta.text(), agora)
    : lerChuvaCemaden(await resposta.json(), estacao.codigo, agora);
}

async function coletarEstacoes() {
  return Promise.all(ESTACOES.map(async estacao => {
    try {
      return { estacao, amostra: await coletar(estacao) };
    } catch (error) {
      return { estacao, amostra: null, erro: error instanceof Error ? error.message : 'Erro de coleta' };
    }
  }));
}

const coletarComCache = unstable_cache(coletarEstacoes, ['estacoes-itajuba-telemetria-v1'], { revalidate: 300 });

interface ResultadoEstacao {
  fonte: string;
  estacao: string;
  gravadas: number;
  coletadoEm?: string;
  erro?: string;
}

export async function sincronizarEstacoes(usarCache: boolean): Promise<ResultadoEstacao[]> {
  const coletas = await (usarCache ? coletarComCache() : coletarEstacoes());
  return Promise.all(coletas.map(async ({ estacao, amostra, erro }) => {
    const origem = { fonte: estacao.fonte, estacao: estacao.nome };
    if (!amostra) return { ...origem, gravadas: 0, erro: erro ?? 'Sem leitura válida' };

    const id = `${estacao.id}:${amostra.coletadoEm}`;
    if (await prisma.policiaCivilWeatherData.findUnique({ where: { id }, select: { id: true } })) {
      return { ...origem, gravadas: 0, coletadoEm: amostra.coletadoEm };
    }

    const { bairro: nome, latitude, longitude } = estacao;
    const existente = await prisma.policiaCivilStation.findUnique({ where: { id: estacao.id }, select: { ativo: true } });
    if (existente && !existente.ativo) return { ...origem, gravadas: 0, erro: 'Estação desativada' };

    if (!existente) {
      const bairro = await prisma.bairroItajuba.upsert({
        where: { nome }, update: { hasStation: true }, create: { nome, latitude, longitude, hasStation: true },
      });
      await prisma.policiaCivilStation.createMany({
        data: [{ id: estacao.id, nome: estacao.nome, bairroId: bairro.id, latitude, longitude }],
        skipDuplicates: true,
      });
    }

    const { count } = await prisma.policiaCivilWeatherData.createMany({
      data: [{
        id,
        stationId: estacao.id,
        precipitacaoMm: amostra.precipitacaoMm,
        nivelRioCm: amostra.nivelRioCm,
        coletadoEm: new Date(amostra.coletadoEm),
        fonte: estacao.fonte,
        status: 'verde',
        observacao: estacao.fonte === 'CEMADEN' ? 'Chuva acumulada em uma hora' : 'Telemetria da estação ANA Itajubá',
      }],
      skipDuplicates: true,
    });
    return { ...origem, gravadas: count, coletadoEm: amostra.coletadoEm };
  }));
}
