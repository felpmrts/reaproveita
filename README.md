# Reaproveita

Uma plataforma web responsiva (PWA) que conecta estabelecimentos comerciais (restaurantes, padarias, mercados e hortifrutis) com pessoas físicas ou instituições sociais para reaproveitar alimentos próximos do vencimento ou excedentes do expediente.

---

## Arquitetura & Stack Técnica

Conforme documentado em [`agent/rules/contex.md`](./agent/rules/contex.md) e nos documentos em [`docs/`](./docs):

- **Frontend & BFF:** Next.js 14+ (App Router) + TypeScript
- **Estilização:** Tailwind CSS (Mobile-First)
- **Validação de Contratos:** Zod
- **Banco de Dados & Auth:** PostgreSQL 15+ (Supabase) + `@supabase/ssr` (Cookies `HttpOnly`, `Secure`, `SameSite=Lax`)
- **Testes Automatizados:** Vitest + Testing Library

---

## Como Executar Localmente

### Opção 1: Com Node.js / NVM (Recomendado)

1. **Selecione a versão padronizada do Node.js (Node 20 LTS):**
   ```bash
   nvm use
   ```
   *(Caso ainda não tenha a versão instalada no NVM, rode `nvm install 20`)*

2. **Instale as dependências (respeitando o [package-lock.json](./package-lock.json)):**
   ```bash
   npm install
   ```

3. **Configure as variáveis de ambiente (opcional para desenvolvimento local em memória):**
   ```bash
   cp .env.example .env.local
   ```
   > Caso as credenciais do Supabase ainda não estejam preenchidas no `.env.local`, o sistema utiliza automaticamente o `InMemoryUserRepository` no servidor para desenvolvimento e testes locais.

4. **Inicie o servidor de desenvolvimento:**
   ```bash
   npm run dev
   ```
   Acesse `http://localhost:3000/register` para visualizar a tela de cadastro.

5. **Execute a suíte de testes (Unitários + Integração + Componentes):**
   ```bash
   npm test
   ```

### Opção 2: Com Docker / Docker Compose (Zero configuração local)

1. **Suba o ambiente de desenvolvimento:**
   ```bash
   docker compose up --build
   ```
2. **Rode os testes dentro do container:**
   ```bash
   docker compose run --rm app npm test
   ```

---

## Entregas — História: Cadastro de Usuários (RF01 / RN01)

- **[BE] Modelagem e schema de usuário:**
  - Migration SQL PostgreSQL/Supabase: [`supabase/migrations/20261106000001_create_users_profiles_schema.sql`](./supabase/migrations/20261106000001_create_users_profiles_schema.sql)
  - Tipagem de domínio: [`src/types/user.ts`](./src/types/user.ts)
  - Schemas Zod: [`src/schemas/auth.schema.ts`](./src/schemas/auth.schema.ts)
  - Repositório com garantia de unicidade de e-mail (`RN01`): [`src/repositories/user.repository.ts`](./src/repositories/user.repository.ts)
- **[BE] Endpoint de Registro (`POST /auth/register`):**
  - Route Handler: [`src/app/auth/register/route.ts`](./src/app/auth/register/route.ts) (e espelho em [`src/app/api/auth/register/route.ts`](./src/app/api/auth/register/route.ts))
  - Server Action (BFF): [`src/actions/auth.actions.ts`](./src/actions/auth.actions.ts)
  - Serviço de domínio e hash seguro (`scrypt`): [`src/services/auth.service.ts`](./src/services/auth.service.ts)
- **[FE] Tela de Cadastro (`/register`):**
  - Página: [`src/app/register/page.tsx`](./src/app/register/page.tsx)
  - Componente de formulário interativo com seletor visual Doador/Receptor e validação em tempo real: [`src/components/auth/RegisterForm.tsx`](./src/components/auth/RegisterForm.tsx)
- **[QA] Testes de Validação:**
  - Testes unitários de schema e payloads inválidos: [`src/__tests__/unit/auth.schema.test.ts`](./src/__tests__/unit/auth.schema.test.ts)
  - Testes de integração da rota `POST /auth/register` e unicidade de e-mail (`RN01`): [`src/__tests__/integration/register.route.test.ts`](./src/__tests__/integration/register.route.test.ts)
  - Testes de componente da tela de cadastro: [`src/__tests__/unit/register-form.test.tsx`](./src/__tests__/unit/register-form.test.tsx)

## Entregas — ST05 / SCRUM-16: Cadastro de Estabelecimento (RF02 / RN02 / RN03)

- Migration com CNPJ único, endereço, localização PostGIS obrigatória e status de aprovação.
- Endpoint canônico protegido `GET/POST /establishments`, restrito ao perfil `DONOR` e vinculado ao usuário autenticado; o caminho anterior permanece como alias.
- Tela mobile-first em `/painel/doador/estabelecimentos/novo` integrada ao painel do doador.
- Validação Zod, persistência Supabase com fallback em memória e testes unitários, de integração e de componente.
- Trava de domínio `requireApprovedEstablishmentForPublication`, que bloqueia estabelecimentos `PENDING`, `REJECTED` ou `SUSPENDED` e também valida o vínculo do Doador antes da publicação.
- Máscaras progressivas para CNPJ, telefone e CEP, além de preenchimento do endereço por geocodificação reversa após consentimento explícito do usuário.
