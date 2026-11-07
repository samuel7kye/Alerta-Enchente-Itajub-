import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sanitizeText, generateId } from '@/lib/utils';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

function adminAuth(request: Request): boolean {
  if (!ADMIN_TOKEN) return false;
  const auth = request.headers.get('authorization');
  return auth === `Bearer ${ADMIN_TOKEN}`;
}

export async function POST(request: Request) {
  if (!adminAuth(request)) {
    return NextResponse.json(
      { error: 'Token administrativo inválido ou não configurado.' },
      { status: ADMIN_TOKEN ? 401 : 503 }
    );
  }

  try {
    const body = await request.json();
    const nivel = body.nivel;
    const bairro = sanitizeText(body.bairro, 80);
    const descricao = sanitizeText(body.descricao, 400);

    if (!['amarelo', 'vermelho', 'verde'].includes(nivel) || !bairro || !descricao) {
      return NextResponse.json({ error: 'Nível, bairro e mensagem são obrigatórios.' }, { status: 400 });
    }

    const rec = await prisma.alerta.create({
      data: {
        id: generateId(),
        nivel,
        bairro,
        descricao,
        ts: new Date(),
      },
    });

    const ponto = await prisma.ponto.findFirst({
      where: { bairro: { equals: bairro } },
    });

    let pontosAtualizados = await prisma.ponto.findMany({ orderBy: { bairro: 'asc' } });

    if (ponto) {
      const pontoStatus = nivel === 'vermelho' ? 'vermelho' : nivel === 'amarelo' ? 'atencao' : 'normal';
      await prisma.ponto.update({
        where: { id: ponto.id },
        data: { status: pontoStatus, ts: new Date() },
      });
      pontosAtualizados = await prisma.ponto.findMany({ orderBy: { bairro: 'asc' } });
    }

    return NextResponse.json({ alerta: rec, pontos: pontosAtualizados }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Erro interno ao salvar o alerta.' }, { status: 500 });
  }
}