import { prisma } from '@/lib/prisma';

export interface RealDataSource {
  nome: string;
  tipo: 'cemaden' | 'inmet' | 'ana' | 'manual';
  ultimaSincronizacao: Date | null;
  ativo: boolean;
  erro?: string;
}

export interface EstacaoMonitoramento {
  id: string;
  nome: string;
  codigoExterno: string;
  latitude: number;
  longitude: number;
  bairro: string;
  rio: string;
  fonte: 'cemaden' | 'inmet' | 'ana';
  ativa: boolean;
}

export interface LeituraHidrologica {
  estacaoId: string;
  precipitacaoMm: number;
  nivelRioCm: number | null;
  vazaoM3s: number | null;
  status: 'verde' | 'amarelo' | 'vermelho';
  observacao: string;
  coletadoEm: Date;
  fonte: 'cemaden' | 'inmet' | 'ana';
}

export interface AlertaMunicipal {
  municipio: string;
  uf: string;
  evento: string;
  nivel: 'Moderado' | 'Alto' | 'Muito Alto';
  status: number;
  atualizadoEm: Date;
  fonte: 'cemaden' | 'inmet';
}

// Mapeamento de bairros de Itajubá para códigos IBGE e coordenadas
const ITAJUBA_CODIBGE = '3132406'; // Itajubá/MG
const ITAJUBA_COORDS = { lat: -22.4189, lon: -45.4531 };

// Estações conhecidas próximas a Itajubá (INMET + CEMADEN + ANA)
const ESTACOES_CONHECIDAS: EstacaoMonitoramento[] = [
  // INMET - Estação automática Itajubá (A818)
  {
    id: 'inmet-a818',
    nome: 'INMET - Itajubá (A818)',
    codigoExterno: 'A818',
    latitude: -22.4167,
    longitude: -45.4500,
    bairro: 'Centro',
    rio: 'Rio Sapucaí',
    fonte: 'inmet',
    ativa: true,
  },
  // CEMADEN - Estações pluviométricas em Itajubá
  {
    id: 'cemaden-itajuba-centro',
    nome: 'CEMADEN - Itajubá Centro',
    codigoExterno: '313240601',
    latitude: -22.4189,
    longitude: -45.4531,
    bairro: 'Centro',
    rio: 'Rio Sapucaí',
    fonte: 'cemaden',
    ativa: true,
  },
  {
    id: 'cemaden-itajuba-varginha',
    nome: 'CEMADEN - Varginha',
    codigoExterno: '313240602',
    latitude: -22.4400,
    longitude: -45.4500,
    bairro: 'Varginha',
    rio: 'Rio Sapucaí',
    fonte: 'cemaden',
    ativa: true,
  },
  {
    id: 'cemaden-itajuba-medicina',
    nome: 'CEMADEN - Medicina',
    codigoExterno: '313240603',
    latitude: -22.4200,
    longitude: -45.4500,
    bairro: 'Medicina',
    rio: 'Ribeirão José Pereira',
    fonte: 'cemaden',
    ativa: true,
  },
  // ANA - Estações telemétricas do Rio Sapucaí
  {
    id: 'ana-sapucai-itajuba',
    nome: 'ANA - Rio Sapucaí em Itajubá',
    codigoExterno: '45025000', // Código exemplo - precisa verificar real
    latitude: -22.4189,
    longitude: -45.4531,
    bairro: 'Centro',
    rio: 'Rio Sapucaí',
    fonte: 'ana',
    ativa: true,
  },
];

function calcularStatus(precipitacaoMm: number, nivelRioCm: number | null): 'verde' | 'amarelo' | 'vermelho' {
  if (precipitacaoMm >= 50 || (nivelRioCm !== null && nivelRioCm >= 300)) return 'vermelho';
  if (precipitacaoMm >= 25 || (nivelRioCm !== null && nivelRioCm >= 150)) return 'amarelo';
  return 'verde';
}

function mapearNivelCemaden(nivel: string): 'verde' | 'amarelo' | 'vermelho' {
  switch (nivel) {
    case 'Muito Alto': return 'vermelho';
    case 'Alto': return 'vermelho';
    case 'Moderado': return 'amarelo';
    default: return 'verde';
  }
}

export async function sincronizarCEMADEN(): Promise<{ alertas: number; leituras: number }> {
  let alertasCount = 0;
  let leiturasCount = 0;

  try {
    // 1. Buscar alertas municipais do CEMADEN (sem auth)
    const alertasResponse = await fetch('https://painelalertas.cemaden.gov.br/wsAlertas2', {
      headers: { 'User-Agent': 'AlertaEnchentesItajuba/1.0' },
      signal: AbortSignal.timeout(10000),
    });

    if (alertasResponse.ok) {
      const alertasData = await alertasResponse.json();
      const alertasItajuba = alertasData.alertas?.filter((a: any) => 
        a.codibge?.toString().startsWith(ITAJUBA_CODIBGE.substring(0, 6)) || 
        a.municipio?.toUpperCase().includes('ITAJUBA')
      ) || [];

      for (const alerta of alertasItajuba) {
        const nivelStatus = mapearNivelCemaden(alerta.nivel);
        
        // Criar/atualizar alerta no banco
        await prisma.alerta.upsert({
          where: { id: `cemaden-${alerta.cod_alerta}` },
          update: {
            nivel: nivelStatus === 'vermelho' ? 'vermelho' : nivelStatus === 'amarelo' ? 'amarelo' : 'verde',
            descricao: `${alerta.evento} - ${alerta.nivel} em ${alerta.municipio} (${alerta.uf})`,
            ts: new Date(alerta.ult_atualizacao),
          },
          create: {
            id: `cemaden-${alerta.cod_alerta}`,
            nivel: nivelStatus === 'vermelho' ? 'vermelho' : nivelStatus === 'amarelo' ? 'amarelo' : 'verde',
            bairro: 'Itajubá',
            descricao: `${alerta.evento} - ${alerta.nivel} em ${alerta.municipio} (${alerta.uf})`,
            ts: new Date(alerta.ult_atualizacao),
          },
        });
        alertasCount++;

        // Atualizar pontos correspondentes
        const bairrosAfetados = await prisma.bairroItajuba.findMany({
          where: { nome: { contains: alerta.municipio?.split(' ')[0] || 'Itajubá' } },
        });
        
        for (const bairro of bairrosAfetados) {
          const ponto = await prisma.ponto.findFirst({ where: { bairro: bairro.nome } });
          if (ponto) {
            const pontoStatus = nivelStatus === 'vermelho' ? 'vermelho' : nivelStatus === 'amarelo' ? 'atencao' : 'normal';
            await prisma.ponto.update({
              where: { id: ponto.id },
              data: { status: pontoStatus, ts: new Date() },
            });
          }
        }
      }
    }

    // 2. Buscar dados pluviométricos recentes do CEMADEN (endpoint público)
    // Nota: O endpoint de dados recentes precisa de token, mas podemos tentar o interativo
    try {
      const chuvaResponse = await fetch(
        `http://resources.cemaden.gov.br/graficos/interativo/getJson2.php?uf=MG`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (chuvaResponse.ok) {
        const chuvaData = await chuvaResponse.json();
        // Processar dados de chuva por estação
        // O formato varia, então deixamos como estrutura para expansão futura
        console.log('[CEMADEN] Dados pluviométricos brutos recebidos:', chuvaData.length || 'N/A');
      }
    } catch (e) {
      console.log('[CEMADEN] Endpoint pluviométrico não acessível (precisa token)');
    }

  } catch (error) {
    console.error('[CEMADEN] Erro na sincronização:', error);
  }

  return { alertas: alertasCount, leituras: leiturasCount };
}

export async function sincronizarINMET(): Promise<{ leituras: number }> {
  let leiturasCount = 0;

  try {
    // 1. Buscar lista de estações (sem auth)
    const estacoesResponse = await fetch('https://apitempo.inmet.gov.br/estacoes/T', {
      signal: AbortSignal.timeout(10000),
    });

    if (!estacoesResponse.ok) throw new Error(`INMET estações: ${estacoesResponse.status}`);

    const estacoes = await estacoesResponse.json();
    const estacaoItajuba = estacoes.find((e: any) => 
      e.CD_ESTACAO === 'A818' || 
      e.DC_NOME?.toUpperCase().includes('ITAJUBA') ||
      (Math.abs(e.VL_LATITUDE - ITAJUBA_COORDS.lat) < 0.1 && Math.abs(e.VL_LONGITUDE - ITAJUBA_COORDS.lon) < 0.1)
    );

    if (!estacaoItajuba) {
      console.log('[INMET] Estação Itajubá não encontrada na lista');
      return { leituras: 0 };
    }

    // 2. Buscar dados da estação (precisa token para dados históricos)
    // Tentar endpoint sem token para dados recentes
    try {
      const hoje = new Date().toISOString().split('T')[0];
      const ontem = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      
      // Endpoint público de dados recentes (pode não funcionar sem token)
      const dadosResponse = await fetch(
        `https://apitempo.inmet.gov.br/estacao/${estacaoItajuba.CD_ESTACAO}/${ontem}/${hoje}`,
        { signal: AbortSignal.timeout(10000) }
      );

      if (dadosResponse.ok) {
        const dados = await dadosResponse.json();
        // Processar dados - formato: [{CHUVA, PRESSAO, TEMPERATURA, ...}, ...]
        for (const registro of dados.slice(-10)) { // Últimas 10 leituras
          const chuva = parseFloat(registro.CHUVA || '0');
          const status = calcularStatus(chuva, null);
          
          await prisma.policiaCivilWeatherData.create({
            data: {
              stationId: await getOrCreateStationId('inmet-a818'),
              precipitacaoMm: chuva,
              nivelRioCm: null,
              status,
              observacao: `INMET - ${estacaoItajuba.DC_NOME} - Chuva: ${chuva}mm`,
              coletadoEm: new Date(registro.DATA + 'T' + (registro.HORA || '00:00')),
            },
          });
          leiturasCount++;
        }
      }
    } catch (e) {
      console.log('[INMET] Dados históricos precisam de token (cadastro.act@inmet.gov.br)');
    }

    // 3. Buscar alertas ativos do INMET (sem auth)
    try {
      const alertasResponse = await fetch('https://apiprevmet3.inmet.gov.br/avisos/ativos', {
        signal: AbortSignal.timeout(10000),
      });
      if (alertasResponse.ok) {
        const alertasData = await alertasResponse.json();
        const alertasMG = alertasData.hoje?.filter((a: any) => a.uf === 'MG') || [];
        
        for (const alerta of alertasMG) {
          if (alerta.municipio?.includes('Itajubá') || alerta.geojson?.features?.some((f: any) => 
            f.properties?.municipio?.includes('Itajubá')
          )) {
            await prisma.alerta.upsert({
              where: { id: `inmet-${alerta.id}` },
              update: {
                nivel: alerta.nivel === 'Perigo' ? 'vermelho' : alerta.nivel === 'Perigo Potencial' ? 'amarelo' : 'verde',
                descricao: `${alerta.evento} - ${alerta.descricao}`,
                ts: new Date(alerta.inicio),
              },
              create: {
                id: `inmet-${alerta.id}`,
                nivel: alerta.nivel === 'Perigo' ? 'vermelho' : alerta.nivel === 'Perigo Potencial' ? 'amarelo' : 'verde',
                bairro: 'Itajubá',
                descricao: `${alerta.evento} - ${alerta.descricao}`,
                ts: new Date(alerta.inicio),
              },
            });
          }
        }
      }
    } catch (e) {
      console.log('[INMET] Erro ao buscar alertas:', e);
    }

  } catch (error) {
    console.error('[INMET] Erro na sincronização:', error);
  }

  return { leituras: leiturasCount };
}

export async function sincronizarANA(): Promise<{ leituras: number }> {
  let leiturasCount = 0;

  try {
    // ANA HidroWebService precisa de token JWT (solicitar em hidro@ana.gov.br)
    // Implementação preparada para quando tiver o token
    const token = process.env.ANA_TOKEN;
    
    if (!token) {
      console.log('[ANA] Token não configurado (solicitar em hidro@ana.gov.br)');
      return { leituras: 0 };
    }

    // Buscar estações telemétricas da bacia do Rio Sapucaí
    const estacoesResponse = await fetch(
      'https://www.ana.gov.br/hidrowebservice/EstacoesTelemetricas/HidroInventarioEstacoes/v2?UF=MG',
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!estacoesResponse.ok) throw new Error(`ANA estações: ${estacoesResponse.status}`);

    const estacoes = await estacoesResponse.json();
    const estacoesSapucai = estacoes.filter((e: any) => 
      e.Nome_Rio?.includes('Sapuca') || 
      e.Nome_Estacao?.includes('Itajubá')
    );

    for (const estacao of estacoesSapucai.slice(0, 3)) {
      // Buscar série adotada (últimos 30 dias)
      const fim = new Date().toISOString().split('T')[0];
      const inicio = new Date(Date.now() - 30*86400000).toISOString().split('T')[0];
      
      const serieResponse = await fetch(
        `https://www.ana.gov.br/hidrowebservice/EstacoesTelemetricas/HidroinfoanaSerieTelemetricaAdotada/v2?Codigos_Estacoes=${estacao.Codigo_Estacao}&Data_Inicio=${inicio}&Data_Fim=${fim}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(15000),
        }
      );

      if (serieResponse.ok) {
        const serie = await serieResponse.json();
        // Processar série: {DataHora, Chuva_mm, Nivel_m, Vazao_m3s, ...}
        for (const ponto of serie.slice(-20)) {
          const chuva = parseFloat(ponto.Chuva_mm || '0');
          const nivel = ponto.Nivel_m ? Math.round(parseFloat(ponto.Nivel_m) * 100) : null;
          const status = calcularStatus(chuva, nivel);
          
          await prisma.policiaCivilWeatherData.create({
            data: {
              stationId: await getOrCreateStationId(`ana-${estacao.Codigo_Estacao}`),
              precipitacaoMm: chuva,
              nivelRioCm: nivel,
              status,
              observacao: `ANA - ${estacao.Nome_Estacao} - ${estacao.Nome_Rio}`,
              coletadoEm: new Date(ponto.DataHora),
            },
          });
          leiturasCount++;
        }
      }
    }
  } catch (error) {
    console.error('[ANA] Erro na sincronização:', error);
  }

  return { leituras: leiturasCount };
}

async function getOrCreateStationId(stationKey: string): Promise<string> {
  const station = ESTACOES_CONHECIDAS.find(s => s.id === stationKey);
  if (!station) return stationKey;

  let dbStation = await prisma.policiaCivilStation.findUnique({
    where: { id: station.id },
  });

  if (!dbStation) {
    // Buscar ou criar bairro
    let bairro = await prisma.bairroItajuba.findUnique({
      where: { nome: station.bairro },
    });
    if (!bairro) {
      bairro = await prisma.bairroItajuba.create({
        data: {
          nome: station.bairro,
          latitude: station.latitude,
          longitude: station.longitude,
          hasStation: true,
        },
      });
    }

    dbStation = await prisma.policiaCivilStation.create({
      data: {
        id: station.id,
        nome: station.nome,
        bairroId: bairro.id,
        latitude: station.latitude,
        longitude: station.longitude,
        ativo: station.ativa,
      },
    });
  }

  return dbStation.id;
}

export async function sincronizarTodasFontes(): Promise<{
  cemaden: { alertas: number; leituras: number };
  inmet: { leituras: number };
  ana: { leituras: number };
  timestamp: Date;
}> {
  console.log('[SYNC] Iniciando sincronização de dados reais...');
  
  const [cemaden, inmet, ana] = await Promise.allSettled([
    sincronizarCEMADEN(),
    sincronizarINMET(),
    sincronizarANA(),
  ]);

  const resultado = {
    cemaden: cemaden.status === 'fulfilled' ? cemaden.value : { alertas: 0, leituras: 0, erro: cemaden.reason?.message },
    inmet: inmet.status === 'fulfilled' ? inmet.value : { leituras: 0, erro: inmet.reason?.message },
    ana: ana.status === 'fulfilled' ? ana.value : { leituras: 0, erro: ana.reason?.message },
    timestamp: new Date(),
  };

  console.log('[SYNC] Concluído:', JSON.stringify(resultado, null, 2));
  return resultado;
}