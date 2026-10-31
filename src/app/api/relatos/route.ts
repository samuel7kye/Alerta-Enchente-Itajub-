import { NextResponse } from 'next/server';
import { data } from '@/lib/data';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const bairro = data.sanitizeText(body.bairro, 80);
    const tipo = data.sanitizeText(body.tipo, 80);
    const descricao = data.sanitizeText(body.descricao, 400);

    if (!bairro || !tipo || !descricao) {
      return NextResponse.json({ error: 'Informe bairro, tipo e descrição.' }, { status: 400 });
    }

    const rec = {
      id: data.generateId(),
      ts: new Date().toISOString(),
      bairro,
      tipo,
      descricao,
    };

    const foto = body.foto;
    if (typeof foto === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(foto) && foto.length <= 700000) {
      (rec as any).foto = foto;
    }

    const db = data.getDb();
    db.relatos.unshift(rec as any);
    db.relatos = db.relatos.slice(0, 500);
    await data.persist();

    return NextResponse.json(rec, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Erro interno ao salvar o relato.' }, { status: 500 });
  }
}