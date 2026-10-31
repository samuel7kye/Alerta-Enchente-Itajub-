import { NextResponse } from 'next/server';
import { data } from '@/lib/data';

export async function GET() {
  const db = data.getDb();
  const alertas = [...db.alertas].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts)).slice(0, 30);
  const relatos = [...db.relatos].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts)).slice(0, 30);
  return NextResponse.json({ pontos: db.pontos, alertas, relatos });
}