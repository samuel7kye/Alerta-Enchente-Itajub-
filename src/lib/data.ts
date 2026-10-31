import fs from 'fs';
import path from 'path';
import { Database, Ponto, Alerta, Relato } from '@/types';

const DB_FILE = process.env.DATA_FILE || path.join(process.cwd(), 'data.json');
const SEED: Database = {
  pontos: [
    { id: 'varginha', bairro: 'Varginha', ponto: 'Rio Sapucaí', latitude: -22.44, longitude: -45.45 },
    { id: 'medicina', bairro: 'Medicina', ponto: 'Ribeirão José Pereira', latitude: -22.42, longitude: -45.45 },
    { id: 'sao-sebastiao', bairro: 'São Sebastião', ponto: 'Ribeirão Anhumas', latitude: -22.41, longitude: -45.43 },
  ],
  alertas: [],
  relatos: [],
};

let dbCache: Database | null = null;
let writeQueue: Promise<void> = Promise.resolve();

function loadDb(): Database {
  if (dbCache) return dbCache;
  try {
    const value = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    dbCache = {
      pontos: Array.isArray(value.pontos) ? value.pontos : SEED.pontos,
      alertas: Array.isArray(value.alertas) ? value.alertas : [],
      relatos: Array.isArray(value.relatos) ? value.relatos : [],
    };
    return dbCache;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('Não foi possível ler data.json:', (e as Error).message);
    }
    dbCache = structuredClone(SEED);
    return dbCache;
  }
}

function persist(): Promise<void> {
  const db = loadDb();
  const snapshot = JSON.stringify(db, null, 2);
  writeQueue = writeQueue.then(async () => {
    try {
      const temp = DB_FILE + '.tmp';
      await fs.promises.writeFile(temp, snapshot, 'utf8');
      await fs.promises.rename(temp, DB_FILE);
    } catch (e) {
      console.error('Falha ao persistir dados:', (e as Error).message);
    }
  });
  return writeQueue;
}

function generateId(): string {
  return crypto.randomUUID();
}

function sanitizeText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function getDb(): Database {
  return loadDb();
}

export const data = {
  getDb,
  persist,
  generateId,
  sanitizeText,
  loadDb,
};