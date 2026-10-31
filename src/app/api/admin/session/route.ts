import { NextResponse } from 'next/server';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

export async function POST(request: Request) {
  if (!ADMIN_TOKEN) {
    return NextResponse.json(
      { error: 'Configure ADMIN_TOKEN no servidor para habilitar administração.' },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    if (body?.token !== ADMIN_TOKEN) {
      return NextResponse.json({ error: 'Senha administrativa incorreta.' }, { status: 401 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }
}