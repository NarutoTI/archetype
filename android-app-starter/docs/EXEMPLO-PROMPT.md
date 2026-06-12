# Exemplo de prompt — criar app a partir do Archetype

Use este texto ao pedir para uma IA criar um novo produto baseado em
`android-app-starter` e `android-app-starter-backend`. Anexe também
`CREATE_NEW_PROJECT_FROM_ARCHETYPE.md` e `AGENTS.md` (raiz do archetype).

---

## Prompt (copiar a partir daqui)

```markdown
# Tarefa: criar app de mensagens 1:1 a partir do Archetype

Crie um **novo produto completo** (frontend Ionic/Vue + backend Node/MongoDB) a partir do nosso archetype Android App Starter. Siga **rigorosamente** estes documentos como fonte de verdade:

1. `archetype/android-app-starter/docs/CREATE_NEW_PROJECT_FROM_ARCHETYPE.md` — fluxo de cópia, rename, validação e entrega
2. `archetype/AGENTS.md` — convenções de código, stores Pinia, cache, performance de abertura, datas

**Não invente outro stack.** Reutilize os padrões já existentes no archetype (auth JWT/OAuth, `useEntityBucketCache`, `initialize()` nas stores, Ionic components, estrutura de rotas, etc.).

---

## Sobre o produto

App de **troca de mensagens entre 2 pessoas** (chat 1:1). Escopo inicial **mínimo e funcional**:

- Mensagens de texto simples
- Emojis/ícones na UI (picker ou teclado nativo)
- Envio de **imagens e arquivos** somente se for reaproveitar com pouco esforço os padrões da demo `Media` do archetype (`image.service`, `file.service`, galeria, anexos)
- **Nada além disso** na v1: sem grupos, sem áudio/vídeo, sem chamadas, sem status online, sem reações, sem encaminhamento, sem edição de mensagem, sem threads

O diferencial obrigatório: **chats privados/ocultos desbloqueados por senha**.

---

## Requisito crítico: modo privado por senha

O usuário autenticado **não vê** certos chats na lista normal. Para abrir um chat oculto:

1. Clica em um botão dedicado (ex.: ícone de cadeado / “Modo privado” / FAB discreto)
2. Informa uma **senha**
3. Se a senha for válida **para aquele usuário**, abre o chat correspondente

**Exemplo de comportamento esperado:**
- Senha `Xhjfdkf` → abre o chat com **Renata**
- Senha `nova_senha3344` → abre o chat com **Luiz Otávio**

Esses chats **nunca aparecem** na lista principal, busca ou histórico visível — só via desbloqueio por senha.

### O que você (IA) deve definir e documentar

Projete e implemente o modelo completo, incluindo:

- Como representar conversas ocultas vs. normais
- Como mapear **senha → conversa/contato** por usuário (cada usuário pode ter senhas diferentes para os mesmos contatos)
- Onde e como armazenar senhas (**hash**, nunca plaintext no banco)
- Se o desbloqueio é só em sessão ou persiste localmente (com TTL) — justifique a escolha
- Como o backend impede listar/buscar conversas ocultas sem desbloqueio
- Como sincronizar mensagens de chats privados após desbloqueio
- Fluxo de criação/configuração de um chat privado (quem define a senha, quando, UI mínima)

**Segurança mínima esperada:**
- Senhas com hash (bcrypt ou argon2)
- Endpoints de mensagens ocultas exigem JWT + prova de desbloqueio (token temporário, header, ou mecanismo equivalente — você define e documenta)
- Rate limit em tentativas de senha
- Logs sem expor senhas ou conteúdo sensível

---

## O que você deve decidir (não me pergunte depois de começar)

Defina **todo o sistema** antes de codar e documente em `docs/ARCHITECTURE.md` no(s) projeto(s):

| Item | Você define |
|------|-------------|
| Nome do produto | Proponha um nome curto |
| Diretórios | ex.: `whisper-chat-frontend`, `whisper-chat-backend` |
| Pacotes npm | |
| `applicationId` Android | ex.: `com.<empresa>.<app>` |
| Deep link scheme | |
| `MONGODB_DB` | |
| Coleções MongoDB | nomes, campos, índices (M0 free — só índices indispensáveis; demais comentados em `db.ts` com justificativa) |
| Tipos TypeScript | domain no backend + types no frontend |
| Rotas REST | prefixos, contratos, paginação de mensagens |
| Stores Pinia | ex.: `conversationStore`, `messageStore` |
| Telas | lista de chats visíveis, tela de chat, modal de senha, login, settings mínimo |
| i18n | `pt.json` + `en.json` completos |
| Demos do archetype | o que remover vs. reaproveitar |

---

## Parâmetros do projeto (use estes valores)

- **Idioma dos comentários no código:** português
- **Idioma da UI:** português e inglês — i18n completo em `src/i18n/pt.json` e `src/i18n/en.json`; textos de runtime nunca hardcoded
- **Portas de dev:**
  - frontend: `http://localhost:8100`
  - backend: `http://localhost:3000`
  - emulador Android: `http://10.0.2.2:3000`
- **Destino:** criar os dois projetos como **irmãos** na pasta onde estiver o archetype (ou na raiz do monorepo, se fizer mais sentido — justifique)
- **Demos do archetype:**
  - **Remover:** Tasks, Notifications, Mapa (não são do domínio)
  - **Reaproveitar como base:** padrões de Media (imagens/arquivos) **se** couber no chat sem inflar escopo
  - **Manter:** auth, version check, delete account, estrutura de tabs/menu adaptada ao domínio
- **Auth:** manter login existente (Google OAuth + email/senha do archetype)
- **Não rodar build final** — validar com lint, typecheck e testes unitários conforme o guia do archetype

---

## Modelo de domínio sugerido (ponto de partida — refine e documente)

### Coleções (nomes provisórios — renomeie se preferir)

**`users`** — manter do archetype

**`conversations`**
- participantes (2 userIds)
- `visibility`: `normal` | `hidden`
- metadados: `lastMessageAt`, `createdAt`
- **não** expor conversas `hidden` em `GET /conversations` sem desbloqueio

**`hidden_chat_unlocks`** (ou equivalente)
- `userId`
- `conversationId`
- `passwordHash`
- `label` opcional (nome exibido após desbloqueio, ex. “Renata”)
- índice único por `(userId, passwordHash)` ou estratégia que evite colisão

**`messages`**
- `conversationId`
- `senderId`
- `type`: `text` | `image` | `file`
- `content` / `mediaRef` / metadados de arquivo
- `createdAt`
- índice: `(conversationId, createdAt)`

### Fluxos principais

1. **Chat normal:** usuário A inicia conversa com B → aparece na lista
2. **Chat privado:** usuário configura chat oculto com contato X + define senha → não aparece na lista
3. **Abrir privado:** botão → modal senha → valida → navega para `ChatPage` com `conversationId` em memória/sessão
4. **Mensagens:** envio/recebimento — polling simples ou WebSocket só se couber sem complexidade; prefira o mais simples na v1

---

## UI/UX (Ionic, foco app Android)

- **Lista de chats:** só conversas `normal`; estado vazio amigável
- **Botão de modo privado:** discreto mas encontrável (toolbar ou menu)
- **Modal de senha:** `ion-modal` com ação no `ion-footer` (padrão do archetype)
- **Tela de chat:** bolhas simples, input + enviar, anexo opcional se Media for reaproveitado
- **Dark mode:** usar variáveis Ionic (`--ion-background-color`), nunca `#fff` literal
- Performance: cache local das mensagens recentes por conversa; `initialize()` restaura cache antes de sync

---

## Dados de teste esperados

- Usuário A (eu) e Usuário B (Renata) com chat privado; senha `Xhjfdkf` abre só para A
- Usuário A e Usuário C (Luiz Otávio) com outro chat privado; senha `nova_senha3344`
- Confirmar que, sem senha, a lista mostra zero chats ocultos

---

## Entregáveis obrigatórios

Ao terminar, entregue:

1. Dois projetos criados e renomeados (sem vestígios de `android-app-starter`, `starter-demo`, `com.example.*`)
2. `docs/ARCHITECTURE.md` — modelo de dados, fluxo privado, endpoints, decisões de segurança
3. `docs/MONGODB-DATA-MODEL.md` — coleções, campos, índices ativos vs. comentados
4. `AGENTS.md` copiado e ajustado na raiz do novo repo
5. Testes unitários mínimos para:
   - validação de desbloqueio por senha (backend)
   - store de mensagens/conversas (frontend), se aplicável
6. Resumo final com:
   - nomes dos projetos
   - arquivos principais alterados
   - demos removidas/mantidas
   - comandos de validação executados
   - pendências (OAuth, SMTP, keystore, produção)

---

## Restrições técnicas (não violar)

- Comentários em **português**; nomes de código em **inglês**
- UI em **português e inglês** via i18n (`pt.json` + `en.json`)
- Datas: **nunca** `date.toISOString()` nem `new Date('YYYY-MM-DD')` — usar `src/utils/date.utils.ts`
- Stores Pinia: **nunca** mutar arrays da store com `.sort()` direto — sempre cópia
- MongoDB Atlas M0: poucos índices; extras comentados em `db.ts`
- Não fazer além do escopo pedido
- Não commitar `.env`, `node_modules`, builds, keystores

---

## Ordem de execução

1. Ler `CREATE_NEW_PROJECT_FROM_ARCHETYPE.md` e `AGENTS.md`
2. Propor arquitetura em 1 página (coleções, endpoints, fluxo privado) — **implemente em seguida**, não pare só na proposta
3. Copiar archetype → renomear → remover demos desnecessárias
4. Implementar backend (conversations, messages, hidden unlock)
5. Implementar frontend (lista, chat, modal senha, stores com cache)
6. i18n pt/en, testes, docs
7. `rg` para garantir que não sobrou marca do starter
8. lint + typecheck + testes

Comece agora. Se algo do archetype for ambíguo, escolha a opção **mais simples** que atenda os requisitos e documente a escolha.
```
