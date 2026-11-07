import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...');

  // Limpar dados existentes
  await prisma.policiaCivilWeatherData.deleteMany();
  await prisma.policiaCivilStation.deleteMany();
  await prisma.weatherSnapshot.deleteMany();
  await prisma.bairroItajuba.deleteMany();
  await prisma.relato.deleteMany();
  await prisma.alerta.deleteMany();
  await prisma.ponto.deleteMany();

  // 1. Bairros de Itajubá com coordenadas
  const bairros = [
    { nome: 'Varginha', latitude: -22.44, longitude: -45.45, hasStation: true },
    { nome: 'Medicina', latitude: -22.42, longitude: -45.45, hasStation: true },
    { nome: 'São Sebastião', latitude: -22.41, longitude: -45.43, hasStation: true },
    { nome: 'Centro', latitude: -22.4189, longitude: -45.4531, hasStation: true },
    { nome: 'Santo Antônio', latitude: -22.4256, longitude: -45.4478, hasStation: false },
    { nome: 'Santa Luzia', latitude: -22.4312, longitude: -45.4590, hasStation: false },
    { nome: 'Cruzeiro', latitude: -22.4150, longitude: -45.4620, hasStation: false },
    { nome: 'Ponte Alta', latitude: -22.4380, longitude: -45.4420, hasStation: false },
    { nome: 'Jardim Europa', latitude: -22.4080, longitude: -45.4480, hasStation: false },
    { nome: 'Vila Regina', latitude: -22.4220, longitude: -45.4650, hasStation: false },
    { nome: 'Parque Industrial', latitude: -22.3980, longitude: -45.4550, hasStation: false },
    { nome: 'Vila São José', latitude: -22.4280, longitude: -45.4350, hasStation: false },
    { nome: 'Bairro Fátima', latitude: -22.4350, longitude: -45.4510, hasStation: false },
    { nome: 'Bairro Brasil', latitude: -22.4120, longitude: -45.4400, hasStation: false },
    { nome: 'Jardim América', latitude: -22.4050, longitude: -45.4580, hasStation: false },
  ];

  const createdBairros = await Promise.all(
    bairros.map((b) => prisma.bairroItajuba.create({ data: b }))
  );
  console.log(`✅ ${createdBairros.length} bairros criados`);

  // 2. Pontos de monitoramento (rios/ribeirões)
  const pontos = [
    { id: 'varginha', bairro: 'Varginha', ponto: 'Rio Sapucaí', latitude: -22.44, longitude: -45.45 },
    { id: 'medicina', bairro: 'Medicina', ponto: 'Ribeirão José Pereira', latitude: -22.42, longitude: -45.45 },
    { id: 'sao-sebastiao', bairro: 'São Sebastião', ponto: 'Ribeirão Anhumas', latitude: -22.41, longitude: -45.43 },
    { id: 'centro-sapucai', bairro: 'Centro', ponto: 'Rio Sapucaí - Centro', latitude: -22.4189, longitude: -45.4531 },
    { id: 'santo-antonio', bairro: 'Santo Antônio', ponto: 'Ribeirão Anhumas - Santo Antônio', latitude: -22.4256, longitude: -45.4478 },
    { id: 'ponte-alta', bairro: 'Ponte Alta', ponto: 'Rio Sapucaí - Ponte Alta', latitude: -22.4380, longitude: -45.4420 },
  ];

  const createdPontos = await Promise.all(
    pontos.map((p) => prisma.ponto.create({ data: p }))
  );
  console.log(`✅ ${createdPontos.length} pontos de monitoramento criados`);

  // 3. Estações da Polícia Civil (delegacias que reportam dados climáticos)
  const bairrosMap = new Map(createdBairros.map((b) => [b.nome, b.id]));

  const stations = [
    { nome: '1ª Delegacia de Polícia Civil - Centro', bairroId: bairrosMap.get('Centro')!, latitude: -22.4189, longitude: -45.4531 },
    { nome: 'Delegacia de Polícia Civil - Varginha', bairroId: bairrosMap.get('Varginha')!, latitude: -22.44, longitude: -45.45 },
    { nome: 'Delegacia de Polícia Civil - Medicina', bairroId: bairrosMap.get('Medicina')!, latitude: -22.42, longitude: -45.45 },
    { nome: 'Delegacia de Polícia Civil - São Sebastião', bairroId: bairrosMap.get('São Sebastião')!, latitude: -22.41, longitude: -45.43 },
    { nome: 'Delegacia de Polícia Civil - Santo Antônio', bairroId: bairrosMap.get('Santo Antônio')!, latitude: -22.4256, longitude: -45.4478 },
  ];

  const createdStations = await Promise.all(
    stations.map((s) => prisma.policiaCivilStation.create({ data: s }))
  );
  console.log(`✅ ${createdStations.length} estações da Polícia Civil criadas`);

  // 4. Dados meteorológicos simulados da Polícia Civil (últimas 24h)
  const now = new Date();
  const weatherData = [];
  for (const station of createdStations) {
    for (let h = 0; h < 24; h++) {
      const timestamp = new Date(now.getTime() - h * 60 * 60 * 1000);
      const rainMm = Math.random() * 15;
      const nivelRio = rainMm > 10 ? 50 + Math.random() * 100 : 10 + Math.random() * 40;
      const status = rainMm >= 15 ? 'vermelho' : rainMm >= 8 ? 'amarelo' : 'verde';
      
      weatherData.push({
        stationId: station.id,
        precipitacaoMm: Math.round(rainMm * 10) / 10,
        nivelRioCm: Math.round(nivelRio * 10) / 10,
        status,
        observacao: status === 'vermelho' ? 'Chuva intensa - risco de alagamento' : status === 'amarelo' ? 'Atenção - monitorar nível do rio' : 'Normal',
        coletadoEm: timestamp,
      });
    }
  }

  await prisma.policiaCivilWeatherData.createMany({ data: weatherData });
  console.log(`✅ ${weatherData.length} registros de dados da Polícia Civil criados`);

  // 5. Snapshots de weather históricos (Open-Meteo + outros)
  const snapshots = [];
  for (const bairro of createdBairros) {
    for (let d = 0; d < 7; d++) {
      const date = new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
      snapshots.push({
        bairroId: bairro.id,
        provider: 'Open-Meteo',
        rainMm: Math.random() * 12,
        next6hMaxRainMm: Math.random() * 8,
        next6hMaxProbability: Math.floor(Math.random() * 80),
        status: Math.random() > 0.7 ? 'atencao' : 'normal',
        message: 'Estimativa meteorológica automatizada',
        observedAt: date,
        fetchedAt: date,
      });
    }
  }

  await prisma.weatherSnapshot.createMany({ data: snapshots });
  console.log(`✅ ${snapshots.length} snapshots de weather criados`);

  // 6. Alertas iniciais
  const alertas = [
    {
      nivel: 'amarelo',
      bairro: 'Varginha',
      descricao: 'Elevação do nível do Rio Sapucaí. Monitoramento intensificado.',
      ts: new Date(now.getTime() - 2 * 60 * 60 * 1000),
    },
    {
      nivel: 'verde',
      bairro: 'Medicina',
      descricao: 'Condições normalizadas. Nível do Ribeirão José Pereira estável.',
      ts: new Date(now.getTime() - 5 * 60 * 60 * 1000),
    },
  ];

  await prisma.alerta.createMany({ data: alertas });
  console.log(`✅ ${alertas.length} alertas criados`);

  // 7. Relatos iniciais
  const relatos = [
    {
      bairro: 'Varginha',
      tipo: 'Rio subindo',
      descricao: 'Água subiu cerca de 1 metro nas últimas 2 horas na altura da ponte.',
      ts: new Date(now.getTime() - 30 * 60 * 1000),
    },
    {
      bairro: 'Centro',
      tipo: 'Bueiro entupido',
      descricao: 'Bueiro na rua principal não está escoando. Acúmulo de água.',
      ts: new Date(now.getTime() - 1 * 60 * 60 * 1000),
    },
  ];

  await prisma.relato.createMany({ data: relatos });
  console.log(`✅ ${relatos.length} relatos criados`);

  console.log('🎉 Seed concluído com sucesso!');
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });