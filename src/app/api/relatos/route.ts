import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sanitizeText, generateId } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const bairro = sanitizeText(body.bairro, 80);
    const tipo = sanitizeText(body.tipo, 80);
    const descricao = sanitizeText(body.descricao, 400);

    if (!bairro || !tipo || !descricao) {
      return NextResponse.json({ error: 'Informe bairro, tipo e descrição.' }, { status: 400 });
    }

    const foto = body.foto;
    const fotoValida = typeof foto === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(foto) && foto.length <= 700000;

    const rec = await prisma.relato.create({
      data: {
        id: generateId(),
        bairro,
        tipo,
        descricao,
        foto: fotoValida ? foto : null,
        ts: new Date(),
      },
    });

    return NextResponse.json(rec, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Erro interno ao salvar o relato.' }, { status: 500 });
  }
}