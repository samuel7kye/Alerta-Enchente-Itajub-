import { prisma } from '@/lib/prisma';

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
    include: { bairro: true },
  });

  if (!station) {
    throw new Error('Estação não encontrada');
  }

  const record = await prisma.policiaCivilWeatherData.create({
    data: {
      stationId,
      precipitacaoMm: data.precipitacaoMm,
      nivelRioCm: data.nivelRioCm ?? null,
      status: data.status,
      observacao: data.observacao ?? null,
      coletadoEm: new Date(),
    },
  });

  const ponto = await prisma.ponto.findFirst({
    where: { bairro: station.bairro.nome },
  });

  if (ponto) {
    const pontoStatus = data.status === 'vermelho' ? 'vermelho' : data.status === 'amarelo' ? 'atencao' : 'normal';
    await prisma.ponto.update({
      where: { id: ponto.id },
      data: { status: pontoStatus, ts: new Date() },
    });
  }

  return record;
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