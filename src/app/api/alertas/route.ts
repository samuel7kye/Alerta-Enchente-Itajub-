import { NextResponse } from 'next/server';
import { data } from '@/lib/data';

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
    const bairro = data.sanitizeText(body.bairro, 80);
    const descricao = data.sanitizeText(body.descricao, 400);

    if (!['amarelo', 'vermelho', 'verde'].includes(nivel) || !bairro || !descricao) {
      return NextResponse.json({ error: 'Nível, bairro e mensagem são obrigatórios.' }, { status: 400 });
    }

    const rec = {
      id: data.generateId(),
      ts: new Date().toISOString(),
      nivel,
      bairro,
      descricao,
    };

    const db = data.getDb();
    db.alertas.unshift(rec);
    db.alertas = db.alertas.slice(0, 500);

    const ponto = db.pontos.find(
      (p) => p.bairro.toLocaleLowerCase('pt-BR') === bairro.toLocaleLowerCase('pt-BR')
    );
    if (ponto) {
      ponto.status = nivel === 'vermelho' ? 'vermelho' : nivel === 'amarelo' ? 'atencao' : 'normal';
      ponto.ts = rec.ts;
    }

    await data.persist();
    return NextResponse.json({ alerta: rec, pontos: db.pontos }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Erro interno ao salvar o alerta.' }, { status: 500 });
  }
}