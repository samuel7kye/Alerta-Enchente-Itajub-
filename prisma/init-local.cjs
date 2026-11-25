const { PrismaClient } = require('@prisma/client');
const pontos = require('./pontos-monitorados.json');

const prisma = new PrismaClient();

async function iniciar() {
  const { count } = await prisma.ponto.createMany({ data: pontos, skipDuplicates: true });
  console.log(`Pontos de monitoramento adicionados: ${count}`);
}

iniciar()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
