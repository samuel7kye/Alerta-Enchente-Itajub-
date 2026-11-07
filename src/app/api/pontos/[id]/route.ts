import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

function adminAuth(request: Request): boolean {
  if (!ADMIN_TOKEN) return false;
  const auth = request.headers.get('authorization');
  return auth === `Bearer ${ADMIN_TOKEN}`;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!adminAuth(request)) {
    return NextResponse.json(
      { error: 'Token administrativo inválido ou não configurado.' },
      { status: ADMIN_TOKEN ? 401 : 503 }
    );
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const status = body.status;

    if (!['normal', 'atencao', 'vermelho'].includes(status)) {
      return NextResponse.json({ error: 'Status inválido.' }, { status: 400 });
    }

    const ponto = await prisma.ponto.findUnique({ where: { id } });
    if (!ponto) {
      return NextResponse.json({ error: 'Ponto não encontrado.' }, { status: 404 });
    }

    const updated = await prisma.ponto.update({
      where: { id },
      data: { status, ts: new Date() },
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Erro interno ao atualizar o ponto.' }, { status: 500 });
  }
}