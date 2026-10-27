# Patotas

PWA de controle de membros por competência mensal, mensalidades e multas. Front-end em HTML/CSS/JavaScript puro (módulos ES, sem build) e backend no [Supabase](https://supabase.com) (Auth por e-mail+senha e Postgres com RLS). É necessário fazer login; os dados ficam na conta do tesoureiro.

## Estrutura

- `index.html`, `app.js`, `styles.css`, `sw.js`: aplicação e PWA.
- `src/core.js`: regras puras (datas, status, validações, texto de compartilhar).
- `src/repo.js`: acesso aos dados via Supabase.
- `config.js`: URL e chave **anon** do projeto (públicas; a proteção é RLS). Nunca coloque a `service_role`.
- `supabase/migrations/`: esquema, RLS e funções (`copy_members`, `create_member`).
- `vendor/supabase.js`: supabase-js (UMD) versionado no repo; atualizar com `npm run vendor`.

## Configurar o Supabase (produção)

1. Crie um projeto em supabase.com.
2. Aplique as migrations: `npx supabase login`, `npx supabase link --project-ref SEU_REF`, `npx supabase db push`.
3. Em **Authentication > Providers > Email**: mantenha "Confirm email" ligado e configure um SMTP próprio (o padrão tem limite baixo de e-mails).
4. Em **Authentication > URL Configuration**: defina Site URL e Redirect URLs como `https://SEU-USUARIO.github.io/patotas/`.
5. Preencha `SUPABASE_URL` e `SUPABASE_ANON_KEY` em `config.js` (Project Settings > API).
6. Publique no GitHub Pages (Settings > Pages > main / root).

## Desenvolvimento e testes

Requisitos: Node 20+, Docker (para o Supabase local).

```
npm install
npx playwright install chromium webkit
npm run supabase:start     # Postgres + Auth locais (aplica as migrations)
npm run check              # verificação de sintaxe
npm run test:unit          # regras puras e checagens estáticas
npm run test:db            # RLS, constraints e repositório contra o Supabase local
npm run test:e2e           # fluxos no Chromium (Pixel 7) e WebKit (iPhone 13); sobe scripts/serve.mjs
```

O E2E usa data fixa (15/10/2026) e aponta o app para o Supabase local sem alterar `config.js`; e-mails de confirmação são lidos do Mailpit local (porta 54324). Dica: para economizar imagens Docker, `npx supabase start -x studio,edge-runtime,storage-api,imgproxy,realtime,logflare,vector,postgres-meta,supavisor`.

O WebKit do Playwright não substitui um teste real no Safari/iPhone.
