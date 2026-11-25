import { prisma } from '@/lib/prisma';
import type { LeituraPonto } from '@/types';

const PRAZO_LEITURA_MS = 2 * 60 * 60 * 1000;
const FONTE_LEGADA = 'Polícia Civil - Itajubá';
const OBSERVACOES_SEED = [
  'Chuva intensa - risco de alagamento',
  'Atenção - monitorar nível do rio',
  'Normal',
];

export async function buscarLeiturasDosPontos(
  pontos: { id: string; bairro: string }[]
): Promise<Record<string, LeituraPonto>> {
  if (pontos.length === 0) return {};

  const agora = new Date();
  const estacoes = await prisma.policiaCivilStation.findMany({
    where: { ativo: true, bairro: { nome: { in: pontos.map(ponto => ponto.bairro) } } },
    select: {
      nome: true,
      bairro: { select: { nome: true } },
      weatherData: {
        where: {
          coletadoEm: { lte: agora },
          precipitacaoMm: { gte: 0, lt: Number.MAX_VALUE },
          fonte: { not: 'simulacao' },
          // A carga inicial antiga usava a fonte padrão e uma destas mensagens fixas.
          OR: [
            { fonte: { not: FONTE_LEGADA } },
            { observacao: null },
            { observacao: { notIn: OBSERVACOES_SEED } },
          ],
        },
        orderBy: [{ coletadoEm: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        take: 1,
        select: {
          coletadoEm: true,
          createdAt: true,
          precipitacaoMm: true,
          nivelRioCm: true,
          fonte: true,
          observacao: true,
        },
      },
    },
  });

  const porBairro = new Map<string, (typeof estacoes)[number]>();
  for (const estacao of estacoes) {
    const leitura = estacao.weatherData[0];
    if (!leitura) continue;

    const anterior = porBairro.get(estacao.bairro.nome)?.weatherData[0];
    if (!anterior || leitura.coletadoEm > anterior.coletadoEm ||
        (leitura.coletadoEm.getTime() === anterior.coletadoEm.getTime() &&
          leitura.createdAt > anterior.createdAt)) {
      porBairro.set(estacao.bairro.nome, estacao);
    }
  }

  const resultado: Record<string, LeituraPonto> = Object.create(null);
  for (const ponto of pontos) {
    const estacao = porBairro.get(ponto.bairro);
    if (!estacao) continue;

    const leitura = estacao.weatherData[0];
    // Importações antigas do cron usavam a fonte padrão e registravam a origem na observação.
    const fonteImportada = leitura.observacao?.match(/^(INMET|ANA) - /)?.[1];
    resultado[ponto.id] = {
      estacao: estacao.nome,
      fonte: leitura.fonte === FONTE_LEGADA ? fonteImportada ?? leitura.fonte : leitura.fonte,
      coletadoEm: leitura.coletadoEm.toISOString(),
      precipitacaoMm: leitura.precipitacaoMm,
      nivelRioCm: Number.isFinite(leitura.nivelRioCm) ? leitura.nivelRioCm : null,
      desatualizada: agora.getTime() - leitura.coletadoEm.getTime() >= PRAZO_LEITURA_MS,
    };
  }

  return resultado;
}

export interface PoliciaCivilWeatherRecord {
  id: string;
  stationId: string;
  stationNome: string;
  bairro: string;
  precipitacaoMm: number;
  nivelRioCm: number | null;
  status: 'verde' | 'amarelo' | 'vermelho';
  observacao: string | null;
  coletadoEm: Date;
}

export interface BairroWeatherSummary {
  bairro: string;
  latitude: number;
  longitude: number;
  ultimaAtualizacao: Date | null;
  precipitacaoAtualMm: number;
  nivelRioCm: number | null;
  status: 'verde' | 'amarelo' | 'vermelho';
  tendencia: 'subindo' | 'estavel' | 'baixando';
  observacao: string;
  historico1h: { timestamp: Date; precipitacaoMm: number; nivelRioCm: number | null }[];
}

export interface PoliciaCivilStationInfo {
  id: string;
  nome: string;
  bairro: string;
  latitude: number;
  longitude: number;
  ativo: boolean;
  ultimaLeitura: Date | null;
}

async function getStationWithBairro(stationId: string) {
  return prisma.policiaCivilStation.findUnique({
    where: { id: stationId },
    include: { bairro: true },
  });
}

export async function fetchAllStations(): Promise<PoliciaCivilStationInfo[]> {
  const stations = await prisma.policiaCivilStation.findMany({
    where: { ativo: true },
    include: { bairro: true },
    orderBy: { nome: 'asc' },
  });

  const stationsWithLastReading = await Promise.all(
    stations.map(async (station) => {
      const lastReading = await prisma.policiaCivilWeatherData.findFirst({
        where: { stationId: station.id },
        orderBy: { coletadoEm: 'desc' },
      });

      return {
        id: station.id,
        nome: station.nome,
        bairro: station.bairro.nome,
        latitude: station.latitude,
        longitude: station.longitude,
        ativo: station.ativo,
        ultimaLeitura: lastReading?.coletadoEm ?? null,
      };
    })
  );

  return stationsWithLastReading;
}

async function buildBairroSummary(bairro: {
  nome: string;
  latitude: number;
  longitude: number;
  policiaCivilStations: Array<{
    id: string;
    weatherData: Array<{
      precipitacaoMm: number;
      nivelRioCm: number | null;
      status: string;
      observacao: string | null;
      coletadoEm: Date;
    }>;
  }>;
}): Promise<BairroWeatherSummary> {
  const station = bairro.policiaCivilStations[0];
  const latest = station?.weatherData[0];

  let status: 'verde' | 'amarelo' | 'vermelho' = 'verde';
  let precipitacaoAtualMm = 0;
  let nivelRioCm: number | null = null;
  let observacao = 'Sem dados recentes';
  let tendencia: 'subindo' | 'estavel' | 'baixando' = 'estavel';
  let historico1h: { timestamp: Date; precipitacaoMm: number; nivelRioCm: number | null }[] = [];

  if (latest) {
    precipitacaoAtualMm = latest.precipitacaoMm;
    nivelRioCm = latest.nivelRioCm;
    status = latest.status as 'verde' | 'amarelo' | 'vermelho';
    observacao = latest.observacao ?? 'Dados da Polícia Civil';

    const umaHoraAtras = new Date(Date.now() - 60 * 60 * 1000);
    const historico = await prisma.policiaCivilWeatherData.findMany({
      where: {
        stationId: station.id,
        coletadoEm: { gte: umaHoraAtras },
      },
      orderBy: { coletadoEm: 'asc' },
    });

    historico1h = historico.map((h) => ({
      timestamp: h.coletadoEm,
      precipitacaoMm: h.precipitacaoMm,
      nivelRioCm: h.nivelRioCm,
    }));

    if (historico.length >= 2) {
      const primeiro = historico[0].nivelRioCm ?? 0;
      const ultimo = historico[historico.length - 1].nivelRioCm ?? 0;
      if (ultimo > primeiro + 5) tendencia = 'subindo';
      else if (ultimo < primeiro - 5) tendencia = 'baixando';
    }
  }

  return {
    bairro: bairro.nome,
    latitude: bairro.latitude,
    longitude: bairro.longitude,
    ultimaAtualizacao: latest?.coletadoEm ?? null,
    precipitacaoAtualMm,
    nivelRioCm,
    status,
    tendencia,
    observacao,
    historico1h,
  };
}

export async function fetchLatestWeatherByBairro(): Promise<BairroWeatherSummary[]> {
  const bairros = await prisma.bairroItajuba.findMany({
    include: {
      policiaCivilStations: {
        where: { ativo: true },
        include: {
          weatherData: {
            orderBy: { coletadoEm: 'desc' },
            take: 1,
          },
        },
      },
    },
  });

  return Promise.all(bairros.map(buildBairroSummary));
}

export async function fetchWeatherHistoryByStation(
  stationId: string,
  hours: number = 24
): Promise<PoliciaCivilWeatherRecord[]> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const records = await prisma.policiaCivilWeatherData.findMany({
    where: {
      stationId,
      coletadoEm: { gte: since },
    },
    orderBy: { coletadoEm: 'desc' },
    include: {
      station: {
        include: { bairro: true },
      },
    },
  });

  return records.map((r) => ({
    id: r.id,
    stationId: r.stationId,
    stationNome: r.station.nome,
    bairro: r.station.bairro.nome,
    precipitacaoMm: r.precipitacaoMm,
    nivelRioCm: r.nivelRioCm,
    status: r.status as 'verde' | 'amarelo' | 'vermelho',
    observacao: r.observacao,
    coletadoEm: r.coletadoEm,
  }));
}

export async function fetchWeatherHistoryByBairro(
  bairroNome: string,
  hours: number = 24
): Promise<PoliciaCivilWeatherRecord[]> {
  const bairro = await prisma.bairroItajuba.findUnique({
    where: { nome: bairroNome },
    include: {
      policiaCivilStations: {
        where: { ativo: true },
        take: 1,
      },
    },
  });

  if (!bairro || bairro.policiaCivilStations.length === 0) {
    return [];
  }

  return fetchWeatherHistoryByStation(bairro.policiaCivilStations[0].id, hours);
}

export async function ingestPoliciaCivilData(
  stationId: string,
  data: {
    precipitacaoMm: number;
    nivelRioCm?: number;
    status: 'verde' | 'amarelo' | 'vermelho';
    observacao?: string;
  }
) {
  const station = await prisma.policiaCivilStation.findUnique({
    where: { id: stationId },
    select: { ativo: true },
  });

  if (!station?.ativo) {
    throw new Error('Estação ativa não encontrada');
  }

  return prisma.policiaCivilWeatherData.create({
    data: {
      stationId,
      precipitacaoMm: data.precipitacaoMm,
      nivelRioCm: data.nivelRioCm ?? null,
      status: data.status,
      fonte: 'Polícia Civil de Itajubá',
      observacao: data.observacao ?? null,
      coletadoEm: new Date(),
    },
  });
}

export async function getBairrosWithStations() {
  return prisma.bairroItajuba.findMany({
    where: {
      policiaCivilStations: {
        some: { ativo: true },
      },
    },
    include: {
      policiaCivilStations: {
        where: { ativo: true },
      },
    },
    orderBy: { nome: 'asc' },
  });
}
