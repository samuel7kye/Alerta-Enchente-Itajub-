# Alerta Enchentes Itajubá

Sistema comunitário de monitoramento e alertas de risco de enchentes em Itajubá/MG. Projeto desenvolvido para a disciplina de **Gerência de Software** / **Engenharia de Software** — protótipo universitário (Projeto "Bota pra Fazer").

> ⚠️ **Aviso importante**: Este é um protótipo acadêmico. **Não substitui** os comunicados oficiais da Defesa Civil. Em situação de emergência, ligue **199**.

---

## 📋 Funcionalidades

- **Painel de situação em tempo real** — Faixa superior colorida (verde/amarelo/vermelho) indicando o pior status entre os pontos monitorados
- **Pontos de risco com régua linimétrica** — 3 pontos monitorados (Varginha/Rio Sapucaí, Medicina/Ribeirão José Pereira, São Sebastião/Ribeirão Anhumas) com barra visual de nível do rio
- **Avisos oficiais (área administrativa)** — Publicação de alertas por nível (verde/amarelo/vermelho) com atualização automática do status do ponto
- **Relatos da comunidade** — Moradores enviam relatos com bairro, tipo (rua alagada, rio subindo, bueiro entupido, etc.), descrição e foto opcional
- **Meteorologia automatizada** — Integração com **Open-Meteo** (chuva atual, previsão 6h, probabilidade) com cache de 10 min
- **Modo offline** — Relatos ficam salvos no `localStorage` se o servidor estiver indisponível
- **Dark mode automático** — Baseado na preferência do sistema
- **Compartilhamento** — Botão "Copiar mensagem" e "Enviar no WhatsApp" para divulgar a situação
- **Contatos de emergência** — Defesa Civil (199), Bombeiros (193), PM (190) com links diretos para ligação

---

## 🛠️ Stack Tecnológica

| Camada | Tecnologia |
|--------|------------|
| **Frontend** | Next.js 14 (App Router), React 18, TypeScript |
| **Estilos** | CSS customizado (CSS Variables) + TailwindCSS 3 |
| **Backend/API** | Next.js Route Handlers (API Routes) |
| **Persistência** | Arquivo JSON local (`data.json`) — simula banco de dados |
| **Meteorologia** | Open-Meteo API (gratuita, sem chave) |
| **Fontes** | Archivo (display), Source Sans 3 (corpo), IBM Plex Mono (monoespaçada) |

---

## 🚀 Como rodar localmente

### Pré-requisitos
- Node.js 18+ (testado com 20.x)
- npm 9+

### Instalação

```bash
# Clone o repositório
git clone https://github.com/SilencerReigns/Staander.git
cd "Site Alerta Enchente"

# Instale dependências
npm install

# Configure variáveis de ambiente (opcional)
cp .env.example .env.local
# Edite .env.local e defina ADMIN_TOKEN para habilitar a área administrativa

# Rode em desenvolvimento
npm run dev
```

Acesse: **http://localhost:3000**

### Build de produção

```bash
npm run build
npm start
```

---

## ⚙️ Variáveis de ambiente

Crie um arquivo `.env.local` na raiz:

```env
# Token para acesso à área administrativa (painel de alertas)
# Gere uma string aleatória segura: openssl rand -hex 32
ADMIN_TOKEN=seu-token-seguro-aqui

# Caminho alternativo para o arquivo de dados (opcional)
# DATA_FILE=C:/caminho/absoluto/para/data.json
```

> **Nota**: Sem `ADMIN_TOKEN`, a área administrativa fica desabilitada (segurança).

---

## 📁 Estrutura do projeto

```
site-alerta-enchente/
├── public/
│   └── index.html          # Versão estática original (referência)
├── src/
│   ├── app/
│   │   ├── api/            # API Routes (backend)
│   │   │   ├── health/     # Health check
│   │   │   ├── status/     # Pontos, alertas, relatos
│   │   │   ├── weather/    # Dados meteorológicos (Open-Meteo)
│   │   │   ├── relatos/    # POST relatos da comunidade
│   │   │   ├── alertas/    # POST alertas (admin)
│   │   │   ├── admin/
│   │   │   │   └── session/ # Autenticação admin
│   │   │   └── pontos/[id]/ # PATCH status do ponto (admin)
│   │   ├── globals.css     # Estilos completos (idênticos ao index.html)
│   │   ├── layout.tsx      # Layout raiz + fontes Google Fonts
│   │   └── page.tsx        # Dashboard principal (Client Component)
│   ├── lib/
│   │   ├── data.ts         # Persistência em data.json (thread-safe)
│   │   └── weather.ts      # Cache + fetch Open-Meteo
│   └── types/
│       └── index.ts        # Tipos TypeScript (Ponto, Alerta, Relato, Weather)
├── data.json               # Banco de dados local (pontos, alertas, relatos)
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── postcss.config.js
├── next.config.js
├── vercel.json             # Config deploy Vercel
└── .gitignore
```

---

## 🔌 API Endpoints

| Método | Rota | Descrição | Auth |
|--------|------|-----------|------|
| `GET` | `/api/health` | Health check | — |
| `GET` | `/api/status` | Lista pontos, alertas, relatos | — |
| `GET` | `/api/weather` | Dados meteorológicos (cache 10min) | — |
| `POST` | `/api/relatos` | Enviar relato da comunidade | — |
| `POST` | `/api/alertas` | Publicar alerta oficial | Bearer `ADMIN_TOKEN` |
| `POST` | `/api/admin/session` | Validar token admin | Body `{token}` |
| `PATCH` | `/api/pontos/:id` | Atualizar status do ponto | Bearer `ADMIN_TOKEN` |

### Exemplo: Enviar relato (fetch)

```js
await fetch('/api/relatos', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    bairro: 'Varginha',
    tipo: 'Rua alagada',
    descricao: 'Água na altura do meio-fio na rua principal',
    foto: 'data:image/jpeg;base64,...' // opcional
  })
});
```

### Exemplo: Publicar alerta (admin)

```js
await fetch('/api/alertas', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${ADMIN_TOKEN}`
  },
  body: JSON.stringify({
    nivel: 'amarelo',        // 'verde' | 'amarelo' | 'vermelho'
    bairro: 'Medicina',
    descricao: 'Chuva forte na cabeceira. Elevação do nível prevista.'
  })
});
```

---

## 🎨 Design System (CSS Variables)

O projeto usa **CSS Variables** no `:root` para tematização completa (light/dark):

```css
:root {
  --bg: #edf2f5;           /* fundo geral */
  --surface: #f8fbfc;      /* cards, modais */
  --ink: #0c2837;          /* texto principal */
  --ink-2: #47606f;        /* texto secundário */
  --line: #c9d7df;         /* bordas */
  --river: #0a6285;        /* cor primária (botões, links) */
  --river-ink: #fff;       /* texto sobre primária */
  --ok: #1f8a57;           /* verde (normal) */
  --warn: #d99100;         /* amarelo (atenção) */
  --red: #c8261f;          /* vermelho (perigo) */
  /* ... variantes de fundo/texto para cada nível */
  --f-display: "Archivo", ...;
  --f-body: "Source Sans 3", ...;
  --f-mono: "IBM Plex Mono", ...;
}
```

Níveis são aplicados via atributo `data-s="normal|atencao|vermelho"` nos containers, que ativam as variáveis `--c`, `--ct`, `--cb` etc. automaticamente.

---

## 🧪 Testando a área administrativa

1. Defina `ADMIN_TOKEN` no `.env.local` (ex: `ADMIN_TOKEN=minha-senha-secreta`)
2. Reinicie o servidor: `npm run dev`
3. Clique em **"Acesso da equipe"** (rodapé da seção "Avisos recentes")
4. Insira o token e clique em **Entrar**
5. O painel "Publicar aviso" aparecerá — você pode:
   - Selecionar nível (amarelo/vermelho/verde)
   - Escolher bairro
   - Escrever mensagem
   - Publicar → atualiza automaticamente o status do ponto e a faixa superior

---

## 📦 Deploy (Vercel)

O projeto já inclui `vercel.json` configurado:

```json
{
  "buildCommand": "npm run build",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "framework": "nextjs",
  "regions": ["gru1"]
}
```

1. Faça push para o GitHub
2. Importe o repositório no [Vercel](https://vercel.com)
3. Adicione `ADMIN_TOKEN` nas **Environment Variables** do projeto
4. Deploy automático a cada push na `main`

---

## 📚 Referências e créditos

- **Open-Meteo** — API meteorológica gratuita: https://open-meteo.com/
- **Google Fonts** — Archivo, Source Sans 3, IBM Plex Mono
- **Projeto "Bota pra Fazer"** — Iniciativa acadêmica Itajubá/MG
- **Defesa Civil de Itajubá** — Referência para contatos e procedimentos oficiais

---

## 👥 Autores

Desenvolvido como trabalho escolar de **Gerência de Software / Engenharia de Software**.

- **Repositório**: https://github.com/SilencerReigns/Staander
- **Branch principal**: `main` (backend original) / `feat/backend-alertas` (esta versão Next.js)

---

## 📄 Licença

Uso educacional / acadêmico. Protótipo não destinado a produção real sem validação dos órgãos competentes.
