# CONTEXTO DO PROJETO: PLATAFORMA REAPROVEITA
**Tipo:** Plataforma Web (PWA) para Resgate e Reaproveitamento de Alimentos  
**Propósito deste Documento:** Servir como fonte única de verdade (Single Source of Truth) sobre regras de negócio, requisitos e arquitetura técnica para orientar assistentes de IA na geração de código, modelagem de dados e tomada de decisões arquiteturais.

---

## 1. VISÃO GERAL E PROPÓSITO DO PRODUTO

### 1.1. O que é o Reaproveita?
Uma plataforma web responsiva (PWA) projetada para conectar estabelecimentos comerciais que possuem alimentos excedentes (próximos do vencimento ou sobras de expediente em plenas condições de consumo) a pessoas físicas ou instituições sociais interessadas em resgatá-los presencialmente.

### 1.2. Limites de Escopo (O que o sistema NÃO é)
* **Não é um app de delivery:** Toda retirada é estritamente presencial no estabelecimento doador.
* **Não é um ERP:** Não gerencia estoque comercial completo, apenas lotes excedentes publicados.
* **Sem app mobile nativo:** O foco é 100% Web Responsivo / PWA via Next.js.
* **Sem Redis na fase inicial:** Filas e agendamentos temporais são geridos diretamente pelo PostgreSQL (`pg_cron`).

---

## 2. ARQUITETURA TÉCNICA E STACK TECNOLÓGICA

### 2.1. Padrão Arquitetural (BFF via Next.js)
O sistema adota o padrão **Backend-for-Frontend (BFF)** integrado ao **Next.js 14+ (App Router)** rodando em Node.js runtime. O cliente (navegador) é desacoplado de acessos diretos de escrita ao banco de dados; todas as regras de negócio, validações e controles transacionais ficam centralizados no servidor Next.js em comunicação com o **Supabase**.

```text
[Cliente Web / PWA]
       │ (HTTPS: Chamadas de Server Actions / Route Handlers)
       ▼
[Next.js: Camada de Aplicação & BFF]
  ├── Server Actions & Route Handlers (Regras de negócio, validações Zod e ACID)
  └── Supabase SSR Client (Gestão de sessão em Cookies HttpOnly, Secure, SameSite=Lax)
       │ (Conexão transacional direta / RPC / PostGIS)
       ▼
[Supabase: Infraestrutura & Dados]
  ├── PostgreSQL 15+ com PostGIS (Consultas espaciais e bloqueio pessimista FOR UPDATE)
  ├── Supabase Auth (Identidade e RBAC)
  ├── pg_cron (Jobs a cada minuto para expiração automática de lotes e reservas)
  └── Supabase Storage (Imagens de lotes e comprovantes de estabelecimentos)
```

### 2.2. Matriz da Stack Técnica

| Camada / Domínio | Tecnologia | Responsabilidade Técnica |
| :--- | :--- | :--- |
| **Frontend & BFF** | Next.js 14+ (App Router) + TypeScript | Renderização híbrida (SSR/Client), PWA, Route Handlers e mutações exclusivas via Server Actions. |
| **Estilização** | Tailwind CSS | Design declarativo, mobile-first e otimizado para uso rápido em campo. |
| **Validação de Dados** | Zod | Validação estrita de contratos de entrada em todas as Server Actions e webhooks antes do processamento. |
| **Banco de Dados** | PostgreSQL 15+ (Supabase) | Persistência relacional ACID, integridade referencial e controle de concorrência (`SELECT ... FOR UPDATE` / PL/pgSQL RPC). |
| **Motor Geoespacial** | PostGIS | Coordenadas geográficas (`GEOMETRY(Point, 4326)`), índices `GIST` e buscas de proximidade via `ST_DWithin`. |
| **Autenticação & Sessão** | Supabase Auth + `@supabase/ssr` | Controle de acesso baseado em papéis (RBAC). Sessões mantidas estritamente em cookies `HttpOnly`. |
| **Jobs e Ciclo de Vida (TTL)** | `pg_cron` (Extensão Postgres) | Execução programada no banco (a cada minuto) para expirar lotes vencidos e atualizar reservas não coletadas. |
| **Mapas Interativos** | Mapbox GL (ou MapLibre GL) | Renderização vetorial de mapas no cliente para busca visual de pontos de coleta. |
| **Pagamentos / Taxas (Se aplicável)**| AbacatePay | Processamento Pix assíncrono orientado a eventos via webhooks idempotentes. *(Nota: No MVP acadêmico puro as reservas são gratuitas, mas a arquitetura prevê este provedor caso taxas operacionais/doações sejam ativadas).* |
| **E-mails Transacionais** | Resend | Disparo de magic links, confirmações de conta e alertas críticos de reserva. |
| **Notificações Push** | OneSignal (Web Push) | Alertas em tempo real no navegador/PWA para novos lotes próximos e lembretes de janela de coleta. |
| **Deploy & Monitoramento** | Vercel + Sentry | Hospedagem Serverless/Edge e rastreamento contínuo de exceções. |

---

## 3. DIRETRIZES INEGOCIÁVEIS DE IMPLEMENTAÇÃO (REGRAS PARA A IA)

1. **Proibição de Escrita Direta pelo Cliente (Client-Side):**
   * **NUNCA** utilize o SDK do Supabase no navegador (`client component`) para executar `INSERT`, `UPDATE` ou `DELETE` em tabelas críticas (lotes, estoques, reservas, estabelecimentos).
   * Toda mutação **DEVE** passar por uma *Server Action* ou *Route Handler*, validada previamente com **Zod**.
2. **Prevenção de Condição de Corrida (Race Conditions em Reservas):**
   * O abatimento e o estorno de estoque de um lote devem ser 100% atômicos no PostgreSQL.
   * Utilize funções **PL/pgSQL (RPC)** ou transações com bloqueio de linha pessimista (`SELECT ... FOR UPDATE`) para impedir que dois usuários reservem a última unidade simultaneamente.
3. **Isolamento de Credenciais:**
   * A chave `service_role` do Supabase jamais deve vazar para o bundle do cliente (`NEXT_PUBLIC_*`). O cliente opera estritamente com a `anon_key` + sessão via cookie seguro.
4. **Idempotência em Webhooks e Confirmações:**
   * Webhooks externos (ex.: AbacatePay) e a confirmação de retirada presencial (RN12) devem exigir chaves/verificações de idempotência no banco de dados para evitar duplicidade de processamento em caso de retentativas de rede.

---

## 4. PERFIS DE USUÁRIOS E CONTROLE DE ACESSO (RBAC)

O sistema possui três papéis (roles) distintos, que determinam o acesso a rotas, Server Actions e políticas de segurança:

| Perfil | Identificador Técnico (Sugerido) | Atribuições Principais |
| :--- | :--- | :--- |
| **Doador / Comerciante** | `DONOR` | Cadastrar/gerenciar seu estabelecimento; publicar, editar e encerrar lotes excedentes; visualizar fila de reservas; validar e confirmar a retirada presencial; acessar métricas do seu estabelecimento. |
| **Receptor / Beneficiário** | `RECEIVER` | Explorar catálogo e mapa de ofertas; filtrar por categoria, validade e distância (`PostGIS`); reservar frações/totalidade de lotes; cancelar reservas dentro do prazo; apresentar código de coleta presencialmente. |
| **Administrador** | `ADMIN` | Auditar e validar cadastros de estabelecimentos e usuários; monitorar fluxo global de ofertas/reservas; intervir/moderar publicações irregulares; acessar dashboards globais de impacto. |

---

## 5. REQUISITOS FUNCIONAIS (RF)

* **RF01:** Cadastrar e gerenciar contas de usuários da plataforma.
* **RF02:** Cadastrar e gerenciar dados cadastrais, operacionais e coordenadas geográficas de estabelecimentos comerciais.
* **RF03:** Realizar autenticação (login), encerramento de sessão (logout) e controle de sessão ativa via Cookies HttpOnly.
* **RF04:** Consultar e atualizar informações do perfil do usuário autenticado.
* **RF05:** Publicar, editar, inativar e gerenciar lotes de alimentos excedentes (com fotos via Supabase Storage).
* **RF06:** Consultar listagens de ofertas ativas e visualizar a página de detalhes de cada lote.
* **RF07:** Pesquisar e filtrar ofertas por nome do alimento, categoria, data de validade, disponibilidade e localização.
* **RF08:** Localizar estabelecimentos comerciais e ofertas próximas à localização do usuário (via PostGIS `ST_DWithin` e Mapbox/MapLibre).
* **RF09:** Reservar quantidades disponíveis de um lote de alimentos ativo em tempo real.
* **RF10:** Cancelar reservas ativas em conformidade com as regras de negócio.
* **RF11:** Registrar e confirmar a retirada presencial dos alimentos reservados pelo estabelecimento.
* **RF12:** Manter o registro histórico completo e auditável de ofertas, reservas, cancelamentos e retiradas.
* **RF13:** Controlar automaticamente a validade e a expiração temporal de ofertas e reservas (via `pg_cron`).
* **RF14:** Calcular e apresentar indicadores visuais de urgência para escoamento dos lotes (Motor de Urgência).
* **RF15:** Disponibilizar painéis analíticos (dashboards) com indicadores de alimentos publicados, reservados e efetivamente resgatados.

---

## 6. REGRAS DE NEGÓCIO (RN) E MAPEAMENTO TÉCNICO

| Código | Regra de Negócio | Implementação Técnica Obrigatória |
| :--- | :--- | :--- |
| **RN01** | **Unicidade de Usuário:** ID único e e-mail exclusivo por usuário. | Constraint `UNIQUE` no Supabase Auth / tabela `profiles`. |
| **RN02** | **Cadastro de Estabelecimento:** Obrigatório registro próprio e validado antes de publicar ofertas. | Verificação de status do estabelecimento na Server Action antes do `INSERT` de lotes. |
| **RN03** | **Vínculo de Autorização:** Apenas usuários `DONOR` vinculados ao estabelecimento gerenciam suas ofertas. | Validação de propriedade (`user_id == establishment.owner_id`) na Server Action + RLS. |
| **RN04** | **Restrição de Validade na Publicação:** Bloquear cadastro de lote com data/hora de validade no passado. | Validação no schema `Zod` (`z.date().min(new Date())`) e `CHECK constraint` no PostgreSQL. |
| **RN05** | **Responsabilidade Sanitária:** O doador é responsável pela higiene, veracidade e adequação do alimento. | Termo de aceite obrigatório (checkbox validado pelo Zod) no momento da publicação do lote. |
| **RN06** | **Consistência de Estoque:** Quantidade disponível nunca pode ser menor que zero (`< 0`). | `CHECK (available_quantity >= 0)` diretamente na tabela de lotes no PostgreSQL. |
| **RN07** | **Validação de Reserva:** Só efetivar se houver saldo suficiente e prazo limite de retirada vigente. | Verificação dentro da função transacional RPC no banco (`available_quantity >= req_qty AND expires_at > NOW()`). |
| **RN08** | **Controle de Concorrência:** Impedir que requisições simultâneas ultrapassem o estoque do lote. | Uso obrigatório de `SELECT ... FOR UPDATE` na linha do lote durante a transação de reserva. |
| **RN09** | **Estorno por Cancelamento:** Cancelamento válido restitui imediatamente o saldo ao lote (se o lote ainda não expirou). | Transação atômica que muda o status da reserva para `CANCELLED` e incrementa `available_quantity` se `expires_at > NOW()`. |
| **RN10** | **Imutabilidade de Reserva Concluída:** Reservas já retiradas (`COMPLETED`) não podem ser canceladas ou alteradas. | Validação de máquina de estados na Server Action e trigger/RPC no banco bloqueando mutações após status `COMPLETED`. |
| **RN11** | **Pré-condição de Retirada:** Apenas reservas ativas e dentro da validade podem ter retirada registrada. | Verificação de `status = 'ACTIVE'` antes de confirmar a coleta presencial. |
| **RN12** | **Unicidade de Baixa (Idempotência):** Uma reserva não pode ter retirada confirmada mais de uma vez. | Atualização atômica condicional (`UPDATE reservations SET status = 'COMPLETED' WHERE id = $1 AND status = 'ACTIVE'`). |
| **RN13** | **Bloqueio de Ofertas Expiradas:** Lotes que atingirem a data/hora de expiração têm reservas bloqueadas. | Job do `pg_cron` rodando a cada minuto marcando lotes vencidos como `EXPIRED`, somado à validação em tempo de execução na reserva. |
| **RN14** | **RBAC Estrito:** Cada perfil (`DONOR`, `RECEIVER`, `ADMIN`) acessa apenas suas rotas e operações. | Middleware do Next.js para proteção de rotas + verificação explícita do role na sessão em cada Server Action. |
| **RN15** | **Rastreabilidade e Auditoria:** Operações críticas (publicação, reserva, cancelamento, expiração, retirada) devem ficar no histórico. | Tabela de log de eventos/histórico (`audit_logs` ou histórico de status) alimentada por triggers ou dentro das transações. |
| **RN16** | **Critério de Contabilização de Impacto:** Indicadores de "alimentos resgatados" somam **exclusivamente** retiradas presenciais confirmadas. | Queries de dashboard devem filtrar estritamente por `reservation.status = 'COMPLETED'` (ignorando publicados, expirados, pendentes ou cancelados). |

---

## 7. REQUISITOS NÃO FUNCIONAIS (RNF)

* **RNF01 - Usabilidade:** Interface simples, intuitiva e mobile-first (PWA), exigindo o mínimo de cliques para buscar e reservar.
* **RNF02 - Desempenho:** Consultas de ofertas, filtros geoespaciais e reservas devem responder em menos de 3 segundos (uso de índices `GIST` no PostGIS e `B-Tree` em chaves estrangeiras/status).
* **RNF03 - Segurança:** Senhas com hash criptográfico (Supabase Auth), RBAC estrito, cookies `HttpOnly` e proteção contra exposição de chaves no cliente.
* **RNF04 - Integridade e Confiabilidade:** Conformidade ACID total nas operações de abatimento e estorno de estoque.
* **RNF05 - Manutenibilidade:** Arquitetura modular separando claramente UI (Componentes React), validação/regras de aplicação (Zod + Server Actions) e persistência transacional (Supabase/Postgres).
* **RNF06 - Escalabilidade:** Estrutura preparada para acoplar módulos futuros sem reescrita do núcleo.
* **RNF07 - Compatibilidade:** Compatível com navegadores modernos (Chrome, Firefox, Edge, Safari) em desktop e mobile.
* **RNF08 - Privacidade (LGPD):** Coleta e tratamento de dados pessoais restritos ao estritamente necessário para a operação de reserva e auditoria (Lei nº 13.709/2018).

---

## 8. ESTRUTURA DE TELAS E INTERFACE (UI/UX)

1. **Landing Page / Home (`/`)**: Apresentação institucional, contadores globais de impacto (baseados na RN16) e vitrine de lotes com alta urgência.
2. **Autenticação e Cadastro (`/login`, `/register`)**: Fluxo unificado com seleção de perfil inicial (`RECEIVER` ou `DONOR`).
3. **Catálogo e Mapa de Ofertas (`/explorar`)**:
   * Visão em lista e visão em mapa interativo (Mapbox/MapLibre).
   * Filtros combinados: busca textual, categoria, validade e raio de distância.
   * Ordenação destacada pelo **Motor de Urgência** (sinalização visual clara para lotes prestes a vencer).
4. **Detalhes do Lote (`/lotes/[id]`)**: Especificações completas, janela de horário para retirada, localização do estabelecimento, selo de urgência, seletor de quantidade e botão de ação para reserva imediata.
5. **Painel do Doador (`/painel/doador`)**: Gestão do estabelecimento, formulário de publicação rápida de lotes, fila de reservas ativas, botão de confirmação rápida de retirada presencial (mediante código do receptor) e métricas locais.
6. **Painel do Receptor (`/painel/receptor`)**: Lista de reservas ativas (exibindo o código/identificador para apresentar na coleta presencial), botão de cancelamento e histórico de alimentos já resgatados.
7. **Painel Administrativo (`/painel/admin`)**: Console de governança para aprovar/auditar estabelecimentos, moderar lotes, visualizar logs de auditoria (RN15) e acompanhar os dashboards consolidados da plataforma.