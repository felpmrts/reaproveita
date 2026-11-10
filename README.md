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
