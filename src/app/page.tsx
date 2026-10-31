'use client';

import { useState, useEffect, useCallback } from 'react';
import { Ponto, Alerta, Relato, WeatherData, StatusResponse } from '@/types';

const TZ = 'America/Sao_Paulo';
const fmt = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

function when(ts?: string): string {
  if (!ts) return 'sem data';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return 'sem data';
  const parts: Record<string, string> = {};
  fmt.formatToParts(d).forEach((x) => { parts[x.type] = x.value; });
  return `${parts.day}/${parts.month} ${parts.hour}:${parts.minute}`;
}

const STATUS = {
  normal: { label: 'Normal', rank: 0, lvl: '34%' },
  atencao: { label: 'Atenção', rank: 1, lvl: '67%' },
  vermelho: { label: 'Alerta vermelho', rank: 2, lvl: '100%' },
} as const;

const NIVEL = {
  verde: { label: 'Normalizado', status: 'normal' as const },
  amarelo: { label: 'Alerta amarelo', status: 'atencao' as const },
  vermelho: { label: 'Alerta vermelho', status: 'vermelho' as const },
} as const;

const BASE_PONTOS = [
  { id: 'varginha', bairro: 'Varginha', ponto: 'Rio Sapucaí', latitude: -22.44, longitude: -45.45, status: 'normal' as const, ts: '2026-10-14T10:00:00-03:00' },
  { id: 'medicina', bairro: 'Medicina', ponto: 'Ribeirão José Pereira', latitude: -22.42, longitude: -45.45, status: 'atencao' as const, ts: '2026-10-14T10:15:00-03:00' },
  { id: 'sao-sebastiao', bairro: 'São Sebastião', ponto: 'Ribeirão Anhumas', latitude: -22.41, longitude: -45.43, status: 'vermelho' as const, ts: '2026-10-14T10:30:00-03:00' },
];

const TIPO_OPTIONS = [
  'Rua alagada',
  'Rio ou ribeirão subindo',
  'Bueiro entupido',
  'Carro ou casa atingidos',
  'Outro',
];

function listJoin(arr: string[]): string {
  return arr.length < 2 ? arr.join('') : `${arr.slice(0, -1).join(', ')} e ${arr[arr.length - 1]}`;
}

function shareLink(msg: string) {
  return (
    <a className="share btn" href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener">
      Enviar no WhatsApp
    </a>
  );
}

async function copyText(txt: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(txt);
    return true;
  } catch {
    try {
      const t = document.createElement('textarea');
      t.readOnly = true;
      t.style.position = 'fixed';
      t.style.opacity = '0';
      t.value = txt;
      document.body.appendChild(t);
      t.select();
      const ok = document.execCommand('copy');
      t.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export default function HomePage() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Admin state
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminToken, setAdminToken] = useState('');
  const [showAdminLogin, setShowAdminLogin] = useState(false);

  // Local relatos (offline fallback)
  const [localRelatos, setLocalRelatos] = useState<Relato[]>(() => {
    try {
      const stored = localStorage.getItem('alerta-enchentes-relatos');
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  // DB state from server
  const [dbPontos, setDbPontos] = useState<Record<string, Ponto>>({});
  const [dbAlertas, setDbAlertas] = useState<Record<string, Alerta>>({});
  const [dbRelatos, setDbRelatos] = useState<Relato[]>([]);

  // Form states
  const [relatoForm, setRelatoForm] = useState({ bairro: '', tipo: 'Rua alagada', descricao: '', foto: '' as string | null, preview: '' as string | null });
  const [avisoForm, setAvisoForm] = useState({ nivel: 'amarelo' as 'verde' | 'amarelo' | 'vermelho', bairro: '', descricao: '' });
  const [avisoMsg, setAvisoMsg] = useState<{ text: string; kind?: 'err' | 'ok' }>({ text: '' });
  const [relatoMsg, setRelatoMsg] = useState<{ text: string; kind?: 'err' | 'ok' }>({ text: '' });
  const [adminLoginMsg, setAdminLoginMsg] = useState<{ text: string; kind?: 'err' | 'ok' }>({ text: '' });
  const [pontosMsg, setPontosMsg] = useState<{ text: string; kind?: 'err' | 'ok' }>({ text: '' });

  // Admin token from sessionStorage
  useEffect(() => {
    try {
      const token = sessionStorage.getItem('alerta-admin-token');
      if (token) {
        setAdminToken(token);
        verifyAdminToken(token);
      }
    } catch {}
  }, []);

  async function verifyAdminToken(token: string) {
    try {
      const res = await fetch('/api/admin/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (res.ok) setIsAdmin(true);
      else sessionStorage.removeItem('alerta-admin-token');
    } catch {
      sessionStorage.removeItem('alerta-admin-token');
    }
  }

  async function fetchData() {
    try {
      const [statusRes, weatherRes] = await Promise.all([
        fetch('/api/status'),
        fetch('/api/weather'),
      ]);
      if (statusRes.ok) {
        const data = await statusRes.json();
        setStatus(data);
        setDbPontos(Object.fromEntries(data.pontos.map((p: Ponto) => [p.id, p])));
        setDbAlertas(Object.fromEntries(data.alertas.map((a: Alerta) => [a.id, a])));
        setDbRelatos(data.relatos || []);
      }
      if (weatherRes.ok) setWeather(await weatherRes.json());
    } catch (err) {
      setError('Erro ao carregar dados. Verifique sua conexão.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  function saveLocalRelato(rec: Relato) {
    const list = [rec, ...localRelatos].slice(0, 10);
    setLocalRelatos(list);
    try { localStorage.setItem('alerta-enchentes-relatos', JSON.stringify(list)); } catch {}
  }

  function pontosList(): Ponto[] {
        const baseMap = new Map<string, Ponto>(BASE_PONTOS.map(p => [p.id, p]));
        Object.entries(dbPontos).forEach(([id, d]) => {
          const base = baseMap.get(id) || { id, bairro: '', ponto: '', latitude: 0, longitude: 0, status: 'normal' as const, ts: '' };
          baseMap.set(id, { ...base, ...d, id });
        });
        return Array.from(baseMap.values())
          .filter(p => STATUS[p.status as keyof typeof STATUS] && p.bairro)
          .sort((a, b) => STATUS[b.status as keyof typeof STATUS].rank - STATUS[a.status as keyof typeof STATUS].rank || a.bairro.localeCompare(b.bairro, 'pt-BR'));
      }

  function alertasList(): Alerta[] {
    const map = new Map<string, Alerta>();
    Object.entries(dbAlertas).forEach(([id, d]) => map.set(id, { ...(map.get(id) || {}), ...d, id }));
    return Array.from(map.values())
      .filter(a => NIVEL[a.nivel as keyof typeof NIVEL] && a.descricao)
      .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
      .slice(0, 12);
  }

  function renderBannerContent() {
    const ps = pontosList();
    const as = alertasList();
    const worst = Math.max(...ps.map(p => STATUS[p.status as keyof typeof STATUS].rank));
    const hot = ps.filter(p => STATUS[p.status as keyof typeof STATUS].rank === worst);
    const key = worst === 2 ? 'vermelho' : worst === 1 ? 'atencao' : 'normal';
    const names = listJoin(hot.map(p => p.bairro));
    const head = worst === 0 ? 'Todos os pontos estão normais' : `${STATUS[key as keyof typeof STATUS].label} em ${names}`;
    const latest = as.find(a => hot.some(p => p.bairro === a.bairro) && NIVEL[a.nivel as keyof typeof NIVEL].status === key);
    const detail = worst === 0 ? 'Nenhum ponto monitorado pede cuidado agora. Volte aqui para ver novos avisos.' : (latest?.descricao || 'Fique atento e evite áreas alagadas.');
    const last = Math.max(...ps.map(p => Date.parse(p.ts || '') || 0));
        const msg = `Alerta Enchentes Itajubá · ${head}. ${detail} Em emergência, ligue 199 (Defesa Civil).`;

        return (
          <>
            <p className="kicker">Situação agora</p>
            <h2>{head}</h2>
            <p>{detail}</p>
            <div className="row">
              {shareLink(msg)}
              <button className="btn" type="button" onClick={async () => {
                const ok = await copyText(msg);
                alert(ok ? 'Mensagem copiada' : 'Não foi possível copiar');
              }}>Copiar mensagem</button>
              {last && <time>Última atualização {when(new Date(last).toISOString())}</time>}
            </div>
          </>
        );
  }

  async function handleSubmitRelato(e: React.FormEvent) {
    e.preventDefault();
    setRelatoMsg({ text: '' });
    if (!relatoForm.descricao.trim()) { setRelatoMsg({ text: 'Descreva o que você está vendo.', kind: 'err' }); return; }

    const rec = {
      bairro: relatoForm.bairro,
      tipo: relatoForm.tipo,
      descricao: relatoForm.descricao.trim(),
      ...(relatoForm.foto ? { foto: relatoForm.foto } : {}),
    };

    try {
      const res = await fetch('/api/relatos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rec),
      });
      if (res.ok) {
        const saved = await res.json();
        setDbRelatos(prev => [saved, ...prev].slice(0, 500));
        setRelatoForm({ bairro: '', tipo: 'Rua alagada', descricao: '', foto: null, preview: null });
        setRelatoMsg({ text: 'Relato enviado. Obrigado por avisar.', kind: 'ok' });
      } else throw new Error((await res.json()).error || 'Falha ao enviar');
    } catch (err) {
      const recWithTs = { ...rec, id: crypto.randomUUID(), ts: new Date().toISOString(), local: true };
      saveLocalRelato(recWithTs);
      setRelatoMsg({ text: 'Servidor indisponível. O relato ficou salvo só neste aparelho.', kind: 'err' });
    }
  }

  async function handleSubmitAviso(e: React.FormEvent) {
    e.preventDefault();
    setAvisoMsg({ text: '' });
    if (!avisoForm.descricao.trim()) { setAvisoMsg({ text: 'Escreva a mensagem do aviso.', kind: 'err' }); return; }

    try {
      const res = await fetch('/api/alertas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify(avisoForm),
      });
      if (res.ok) {
        const result = await res.json();
        setDbAlertas(prev => ({ ...prev, [result.alerta.id]: result.alerta }));
        setDbPontos(Object.fromEntries(result.pontos.map((p: Ponto) => [p.id, p])));
        setAvisoForm({ nivel: 'amarelo', bairro: '', descricao: '' });
        setAvisoMsg({ text: `Aviso publicado e status de ${avisoForm.bairro} atualizado.`, kind: 'ok' });
      } else throw new Error((await res.json()).error || 'Falha ao publicar');
    } catch (err) {
      setAvisoMsg({ text: (err as Error).message, kind: 'err' });
    }
  }

  async function setStatusPonto(p: Ponto, newStatus: 'normal' | 'atencao' | 'vermelho') {
    setPontosMsg({ text: '' });
    try {
      const res = await fetch(`/api/pontos/${encodeURIComponent(p.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        const updated = await res.json();
        setDbPontos(prev => ({ ...prev, [updated.id]: updated }));
        setPontosMsg({ text: `${p.bairro} agora está como ${STATUS[newStatus].label}.`, kind: 'ok' });
      } else throw new Error((await res.json()).error || 'Falha ao atualizar');
    } catch (err) {
      setPontosMsg({ text: (err as Error).message, kind: 'err' });
    }
  }

  async function handleAdminLogin(e: React.FormEvent) {
    e.preventDefault();
    setAdminLoginMsg({ text: '' });
    const token = adminToken.trim();
    if (!token) { setAdminLoginMsg({ text: 'Informe a senha.', kind: 'err' }); return; }

    try {
      const res = await fetch('/api/admin/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (res.ok) {
        sessionStorage.setItem('alerta-admin-token', token);
        setIsAdmin(true);
        setShowAdminLogin(false);
        setAdminToken('');
        setAdminLoginMsg({ text: 'Acesso liberado.', kind: 'ok' });
      } else throw new Error((await res.json()).error || 'Senha incorreta');
    } catch (err) {
      setAdminLoginMsg({ text: (err as Error).message, kind: 'err' });
    }
  }

  function handleLogout() {
    sessionStorage.removeItem('alerta-admin-token');
    setIsAdmin(false);
    setAdminToken('');
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setRelatoForm(prev => ({ ...prev, foto: result, preview: result }));
    };
    reader.readAsDataURL(file);
  }

  if (loading) {
    return (
      <div className="page" style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="staff" style={{ width: '48px', height: '48px', borderRadius: '50%', border: '4px solid var(--ink)', borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />
        <style jsx>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="top">
        <div className="id">
          <p className="kicker">Itajubá · MG · Projeto Bota pra Fazer</p>
          <h1>Alerta<br />Enchentes</h1>
          <p className="lede">Situação dos pontos de risco da cidade, avisos recentes e relatos de moradores. Consulte antes de sair de casa ou de deixar o carro na rua.</p>
        </div>
        <aside className="sos" aria-label="Emergência">
          <p className="kicker">Emergência</p>
          <p className="sos-num">199</p>
          <p className="sos-name">Defesa Civil de Itajubá</p>
          <a className="btn" href="tel:199">Ligar para a Defesa Civil</a>
        </aside>
      </header>

      <section id="banner" className="banner" data-s={(() => {
        const ps = pontosList();
        const worst = Math.max(...ps.map(p => STATUS[p.status as keyof typeof STATUS].rank));
        return worst === 2 ? 'vermelho' : worst === 1 ? 'atencao' : 'normal';
      })()} aria-live="polite" aria-label="Situação agora">
        {renderBannerContent()}
      </section>

      <section aria-labelledby="h-pontos">
        <h2 className="sec" id="h-pontos">Pontos de risco</h2>
        <div id="pontos" className="grid">
          {pontosList().map(p => {
            const st = STATUS[p.status as keyof typeof STATUS];
            return (
              <article key={p.id} className="ponto" data-s={p.status}>
                <div className="staff" role="img" aria-label={`Régua do rio: ${st.label}`} style={{ '--lvl': st.lvl } as React.CSSProperties}>
                  <i />
                </div>
                <div className="body">
                  <p className="bairro">{p.bairro}</p>
                  <p className="local">{p.ponto || ''}</p>
                  <span className="pill">{st.label}</span>
                  <p className="stamp">Atualizado {when(p.ts)}</p>
                  {isAdmin && (
                    <label className="team-set" htmlFor={`set-${p.id}`}>
                      Alterar status (equipe)
                      <select id={`set-${p.id}`} onChange={e => setStatusPonto(p, e.target.value as any)} defaultValue={p.status}>
                        {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                    </label>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        <p id="pontos-msg" className={`msg ${pontosMsg.kind || ''}`} role="status">{pontosMsg.text}</p>
      </section>

      <div className="cols">
        <section aria-labelledby="h-avisos">
          <h2 className="sec" id="h-avisos">Avisos recentes</h2>
          {isAdmin && (
            <details className="admin" id="admin">
              <summary>Painel da equipe: publicar aviso</summary>
              <form id="form-aviso" onSubmit={handleSubmitAviso}>
                <div className="field">
                  <label htmlFor="av-nivel">Nível</label>
                  <select id="av-nivel" value={avisoForm.nivel} onChange={e => setAvisoForm(prev => ({ ...prev, nivel: e.target.value as any }))}>
                    <option value="amarelo">Alerta amarelo (atenção)</option>
                    <option value="vermelho">Alerta vermelho (perigo)</option>
                    <option value="verde">Normalizado</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="av-bairro">Bairro</label>
                  <select id="av-bairro" value={avisoForm.bairro} onChange={e => setAvisoForm(prev => ({ ...prev, bairro: e.target.value }))}>
                    {BASE_PONTOS.map(p => <option key={p.id} value={p.bairro}>{p.bairro}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="av-desc">Mensagem</label>
                  <textarea id="av-desc" maxLength={400} placeholder="Ex.: Chuva forte na cabeceira. Elevação do nível prevista." value={avisoForm.descricao} onChange={e => setAvisoForm(prev => ({ ...prev, descricao: e.target.value }))} />
                </div>
                <button className="btn" type="submit" id="av-btn">Publicar aviso</button>
                <p className={`msg ${avisoMsg.kind || ''}`} id="av-msg" role="status">{avisoMsg.text}</p>
              </form>
            </details>
          )}
          <ol id="timeline" className="tl">
            {alertasList().map(a => {
              const nv = NIVEL[a.nivel as keyof typeof NIVEL];
              const msg = `Alerta Enchentes Itajubá · ${when(a.ts)} · ${nv.label} em ${a.bairro}. ${a.descricao} Em emergência, ligue 199.`;
              return (
                <li key={a.id} className="ev" data-s={nv.status}>
                  <div className="ev-meta">
                    <time dateTime={a.ts}>{when(a.ts)}</time>
                    <span className="chip">{nv.label}</span>
                    <strong>{a.bairro}</strong>
                  </div>
                  <p>{a.descricao}</p>
                  {shareLink(msg)}
                </li>
              );
            })}
            {!alertasList().length && <li className="empty">Nenhum aviso publicado ainda.</li>}
          </ol>
        </section>

        <section aria-labelledby="h-contatos">
          <h2 className="sec" id="h-contatos">Contatos úteis</h2>
          <ul className="contacts">
            <li><span>Defesa Civil de Itajubá</span><a className="num" href="tel:199">199</a></li>
            <li><span>Corpo de Bombeiros</span><a className="num" href="tel:193">193</a></li>
            <li><span>Polícia Militar</span><a className="num" href="tel:190">190</a></li>
          </ul>
        </section>
      </div>

      <div className="cols">
        <section aria-labelledby="h-reportar">
          <h2 className="sec" id="h-reportar">Avise a vizinhança</h2>
          <p className="sec-note">Viu rua alagada, rio subindo ou bueiro entupido? Conte aqui. Em risco imediato, ligue 199.</p>
          <form id="form-relato" onSubmit={handleSubmitRelato}>
            <div className="field">
              <label htmlFor="r-bairro">Bairro</label>
              <select id="r-bairro" value={relatoForm.bairro} onChange={e => setRelatoForm(prev => ({ ...prev, bairro: e.target.value }))}>
                {BASE_PONTOS.map(p => <option key={p.id} value={p.bairro}>{p.bairro}</option>)}
                <option value="Outro bairro">Outro bairro</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="r-tipo">O que você viu</label>
              <select id="r-tipo" value={relatoForm.tipo} onChange={e => setRelatoForm(prev => ({ ...prev, tipo: e.target.value }))}>
                {TIPO_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="r-desc">Descrição</label>
              <textarea id="r-desc" maxLength={400} placeholder="Ex.: Água na altura do meio-fio na rua principal, trânsito parado." value={relatoForm.descricao} onChange={e => setRelatoForm(prev => ({ ...prev, descricao: e.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="r-foto">Foto (opcional)</label>
              <input id="r-foto" type="file" accept="image/*" onChange={handleFileChange} />
              {relatoForm.preview && <img id="r-prev" className="preview" src={relatoForm.preview} alt="Prévia da foto escolhida" />}
            </div>
            <button className="btn" type="submit" id="r-btn">Enviar relato</button>
            <p className={`msg ${relatoMsg.kind || ''}`} id="r-msg" role="status">{relatoMsg.text}</p>
          </form>
        </section>

        <section aria-labelledby="h-relatos">
          <h2 className="sec" id="h-relatos">Relatos de moradores</h2>
          <p className="sec-note">Enviados pela comunidade, ainda não verificados pela Defesa Civil.</p>
          <ul id="relatos" className="rel">
            {[
              ...dbRelatos.map(r => ({ ...r, local: false })),
              ...localRelatos.map(r => ({ ...r, local: true })),
            ]
              .filter(r => r && r.descricao)
              .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
              .slice(0, 8)
              .map(r => (
                <li key={r.id || r.ts}>
                  <div className="meta">
                    <span className="tipo">{r.tipo || 'Relato'}</span>
                    <span>{r.bairro || ''}</span>
                    <time dateTime={r.ts}>{when(r.ts)}</time>
                    {r.local && <span className="local-tag">salvo só neste aparelho</span>}
                  </div>
                  <p>{r.descricao}</p>
                  {r.foto && r.foto.startsWith('data:image/') && <img src={r.foto} alt="Foto enviada pelo morador" />}
                </li>
              ))}
            {!dbRelatos.length && !localRelatos.length && (
              <li className="empty">Nenhum relato ainda. Quem vir água subindo pode ser o primeiro a avisar.</li>
            )}
          </ul>
        </section>
      </div>

      <footer>
        <p>Projeto Bota pra Fazer · Itajubá/MG. Protótipo universitário que não substitui os comunicados oficiais da Defesa Civil.</p>
        <p>Leituras meteorológicas são estimativas públicas e não substituem os comunicados oficiais da Defesa Civil.</p>
      </footer>

      {/* Admin Login Modal */}
      {showAdminLogin && !isAdmin && (
        <div className="modal-overlay" onClick={() => setShowAdminLogin(false)}>
          <div className="modal admin-modal admin-login-form" onClick={e => e.stopPropagation()}>
            <h2>Acesso da equipe</h2>
            <form onSubmit={handleAdminLogin}>
              <div className="field">
                <label>Senha da equipe</label>
                <input type="password" autoComplete="current-password" placeholder="Senha administrativa" aria-label="Senha administrativa" required
                  value={adminToken} onChange={e => setAdminToken(e.target.value)} />
              </div>
              <div className="btn-row">
                <button className="btn ghost" type="button" onClick={() => { setShowAdminLogin(false); setAdminToken(''); }}>Cancelar</button>
                <button className="btn" type="submit">Entrar</button>
              </div>
              <p className={`msg ${adminLoginMsg.kind || ''}`} role="status">{adminLoginMsg.text}</p>
            </form>
          </div>
        </div>
      )}

      {/* Weather info appended to banner */}
      {weather && (
        <script dangerouslySetInnerHTML={{
          __html: `
            (function() {
              var banner = document.getElementById('banner');
              if (banner && !banner.querySelector('.weather-note')) {
                var p = document.createElement('p');
                p.className = 'sec-note weather-note';
                p.textContent = 'Meteorologia · Open-Meteo · ${weather.rainMm} mm de chuva observada · probabilidade máx. nas próximas 6h: ${weather.next6hMaxProbability}%. ${weather.disclaimer}';
                banner.appendChild(p);
              }
            })();
          `
        }} />
      )}
    </div>
  );
}