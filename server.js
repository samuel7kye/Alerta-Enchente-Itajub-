const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const app = express();
const PORT = Number(process.env.PORT || 5150);
const ROOT = __dirname;
const DB_FILE = process.env.DATA_FILE || path.join(ROOT, 'data.json');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const MAX_BODY = '1mb';
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast?latitude=-22.4258&longitude=-45.4528&current=precipitation,rain,showers&hourly=precipitation_probability,precipitation&forecast_days=1&timezone=America%2FSao_Paulo';
const SEED = {
  pontos: [
    { id: 'varginha', bairro: 'Varginha', ponto: 'Rio Sapucaí', latitude: -22.44, longitude: -45.45 },
    { id: 'medicina', bairro: 'Medicina', ponto: 'Ribeirão José Pereira', latitude: -22.42, longitude: -45.45 },
    { id: 'sao-sebastiao', bairro: 'São Sebastião', ponto: 'Ribeirão Anhumas', latitude: -22.41, longitude: -45.43 }
  ], alertas: [], relatos: []
};
let db;
let writeQueue = Promise.resolve();
let weatherCache = { expires: 0, data: null };

function loadDb() {
  try {
    const value = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    return { pontos: Array.isArray(value.pontos) ? value.pontos : SEED.pontos,
      alertas: Array.isArray(value.alertas) ? value.alertas : [], relatos: Array.isArray(value.relatos) ? value.relatos : [] };
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('Não foi possível ler data.json:', e.message);
    return structuredClone(SEED);
  }
}
function persist() {
  const snapshot = JSON.stringify(db, null, 2);
  writeQueue = writeQueue.then(async () => {
    try {
      const temp = DB_FILE + '.tmp';
      await fs.promises.writeFile(temp, snapshot, 'utf8');
      await fs.promises.rename(temp, DB_FILE);
    } catch (e) {
      console.error('Falha ao persistir dados (sistema de arquivos somente leitura?):', e.message);
    }
  });
  return writeQueue;
}
function id() { return crypto.randomUUID(); }
function text(value, max = 400) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function admin(req, res, next) {
  if (!ADMIN_TOKEN) return res.status(503).json({ error: 'Painel administrativo indisponível: configure ADMIN_TOKEN no servidor.' });
  if (req.get('authorization') !== `Bearer ${ADMIN_TOKEN}`) return res.status(401).json({ error: 'Token administrativo inválido.' });
  next();
}
function statusFor(rain, probability) {
  if (rain >= 15 || (rain >= 8 && probability >= 70)) return 'vermelho';
  if (rain >= 5 || probability >= 60) return 'atencao';
  return 'normal';
}
app.disable('x-powered-by');
app.use(express.json({ limit: MAX_BODY }));
app.use((req, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); res.set('Referrer-Policy', 'strict-origin-when-cross-origin'); next(); });
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'alerta-enchentes-itajuba', time: new Date().toISOString() }));
app.get('/api/status', (req, res) => res.json({ pontos: db.pontos, alertas: [...db.alertas].sort((a,b) => Date.parse(b.ts)-Date.parse(a.ts)).slice(0,30), relatos: [...db.relatos].sort((a,b) => Date.parse(b.ts)-Date.parse(a.ts)).slice(0,30) }));
app.get('/api/weather', async (req, res) => {
  try {
    if (weatherCache.data && Date.now() < weatherCache.expires) return res.json(weatherCache.data);
    const response = await fetch(WEATHER_URL, { signal: AbortSignal.timeout(7000), headers: { 'User-Agent': 'AlertaEnchentesItajuba/1.0' } });
    if (!response.ok) throw new Error(`Open-Meteo respondeu ${response.status}`);
    const raw = await response.json();
    const now = raw.current?.time;
    const hours = raw.hourly?.time || [];
    const start = Math.max(0, hours.findIndex(t => t >= now));
    const probability = Math.max(0, ...((raw.hourly?.precipitation_probability || []).slice(start, start + 6).map(Number).filter(Number.isFinite)));
    const nextRain = Math.max(0, ...((raw.hourly?.precipitation || []).slice(start, start + 6).map(Number).filter(Number.isFinite)));
    const rain = Number(raw.current?.precipitation) || 0;
    const status = statusFor(rain, probability);
    const data = { provider: 'Open-Meteo', location: 'Itajubá, MG', observedAt: now, fetchedAt: new Date().toISOString(), rainMm: rain, next6hMaxRainMm: nextRain, next6hMaxProbability: probability, status,
      message: status === 'vermelho' ? 'Chuva intensa ou previsão elevada. Evite áreas alagáveis e acompanhe a Defesa Civil.' : status === 'atencao' ? 'Condições de atenção para chuva. Evite atravessar ruas alagadas e acompanhe atualizações.' : 'Sem indicativo meteorológico elevado no momento. Continue atento aos comunicados oficiais.',
      disclaimer: 'Estimativa meteorológica automatizada; não mede o nível dos rios e não substitui alertas oficiais.' };
    weatherCache = { data, expires: Date.now() + 10 * 60_000 };
    res.json(data);
  } catch (err) { res.status(502).json({ error: 'Não foi possível consultar a previsão agora.', detail: err.message }); }
});
app.post('/api/relatos', async (req, res, next) => {
  const bairro = text(req.body?.bairro, 80), tipo = text(req.body?.tipo, 80), descricao = text(req.body?.descricao, 400);
  if (!bairro || !tipo || !descricao) return res.status(400).json({ error: 'Informe bairro, tipo e descrição.' });
  const rec = { id: id(), ts: new Date().toISOString(), bairro, tipo, descricao };
  const foto = req.body?.foto;
  if (typeof foto === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(foto) && foto.length <= 700_000) rec.foto = foto;
  db.relatos.unshift(rec); db.relatos = db.relatos.slice(0, 500);
  try { await persist(); res.status(201).json(rec); } catch (e) { next(e); }
});
app.post('/api/admin/session', (req, res) => {
  if (!ADMIN_TOKEN) return res.status(503).json({ error: 'Configure ADMIN_TOKEN no servidor para habilitar administração.' });
  if (req.body?.token !== ADMIN_TOKEN) return res.status(401).json({ error: 'Senha administrativa incorreta.' });
  res.json({ ok: true });
});
app.post('/api/alertas', admin, async (req, res, next) => {
  const nivel = req.body?.nivel, bairro = text(req.body?.bairro, 80), descricao = text(req.body?.descricao, 400);
  if (!['amarelo','vermelho','verde'].includes(nivel) || !bairro || !descricao) return res.status(400).json({ error: 'Nível, bairro e mensagem são obrigatórios.' });
  const rec = { id: id(), ts: new Date().toISOString(), nivel, bairro, descricao };
  db.alertas.unshift(rec); db.alertas = db.alertas.slice(0, 500);
  const p = db.pontos.find(x => x.bairro.toLocaleLowerCase('pt-BR') === bairro.toLocaleLowerCase('pt-BR'));
  if (p) { p.status = nivel === 'vermelho' ? 'vermelho' : nivel === 'amarelo' ? 'atencao' : 'normal'; p.ts = rec.ts; }
  try { await persist(); res.status(201).json({ alerta: rec, pontos: db.pontos }); } catch (e) { next(e); }
});
app.patch('/api/pontos/:id', admin, async (req, res, next) => {
  const p = db.pontos.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Ponto não encontrado.' });
  if (!['normal','atencao','vermelho'].includes(req.body?.status)) return res.status(400).json({ error: 'Status inválido.' });
  p.status = req.body.status; p.ts = new Date().toISOString();
  try { await persist(); res.json(p); } catch (e) { next(e); }
});
app.use(express.static(ROOT, { index: 'index.html', extensions: ['html'] }));
app.use((err, req, res, next) => { console.error(err); if (res.headersSent) return next(err); res.status(500).json({ error: 'Erro interno ao salvar os dados.' }); });

db = loadDb();
persist().catch(e => console.error('Falha ao inicializar persistência:', e));

module.exports = app;

if (require.main === module) {
  app.listen(PORT, () => console.log(`Alerta Enchentes Itajubá ativo em http://localhost:${PORT}`));
}
