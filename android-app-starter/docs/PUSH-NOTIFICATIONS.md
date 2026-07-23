# Push notifications (Android + servidor)

Stack funcional do starter: **cliente Capacitor** + **backend FCM + tick**.

## Fluxo

1. App registra o device (`POST /api/push/devices`) com token FCM e timezone.
2. Ao criar/atualizar Task pendente, o backend materializa `push.nextAtUtc`
   (`dueDate` + `09:00` no TZ da conta).
3. Scheduler (~60s) faz claim CAS em `tasks` com `push.nextAtUtc <= now`, envia
   FCM e remove o cursor (`$unset: push`) — lembrete one-shot.
4. Com `effectiveMode === 'local'`, o app agenda LocalNotifications; com
   `push`, só o servidor dispara.

## App

| Peça | Papel |
|------|--------|
| `reminderDelivery.service.ts` | desired vs effective (`push` / `local`) |
| `pushNotification.service.ts` | registro, reconcile, logout |
| `notification.service.ts` | agenda local só se effective = local |
| `notificationEntry.ts` | badge lê bandeja local + push |
| Menu → entrega | troca push ↔ local (Android); seções com `ion-list-header` |
| Menu → teste | toque dispara push (`POST /api/push/test`) ou local conforme o modo efetivo |

## Backend

| Peça | Papel |
|------|--------|
| `push.routes.ts` | `/api/push/*` (JWT) |
| `pushDeviceService.ts` | coleção `push_devices` |
| `fcmService.ts` | Firebase Admin / FCM |
| `pushSchedulerService.ts` | tick + health |
| `taskReminderScheduleService.ts` | materializa `push` em Tasks |
| `taskService.ts` | create/update ligam o schedule |

### `lastSeenAt` (device vivo)

`lastSeenAt` significa **último check-in do app** (registro, reconcile ou troca de
modo). **Não** é atualizado quando o FCM aceita um envio. Bumpar no delivery
igualava todos os devices da conta a cada tick e atrapalhava a poda por
recência (`cap` de devices). Sucesso de entrega só zera `failCount`.

### HTTP (JWT)

- `POST /api/push/devices`
- `GET /api/push/devices/:deviceId`
- `PUT /api/push/devices/:deviceId/delivery-mode`
- `DELETE /api/push/devices/:deviceId`
- `PUT /api/push/timezone`
- `POST /api/push/test` — `{ deviceId }`

Payload FCM de lembrete: `routePath`/`path` → `/tabs/tasks`, `taskId`, `key`.

### Env (backend `.env`)

```env
FIREBASE_SERVICE_ACCOUNT_B64=...   # service account JSON em base64
PUSH_SCHEDULER_ENABLED=true        # só em UMA instância
PUSH_TICK_MS=60000
PUSH_LATE_GRACE_MIN=30
PUSH_DEFAULT_TZ=America/Sao_Paulo
FRONTEND_URL=http://localhost:8101
```

Health: `GET /api/health` → `scheduler.status`
(`disabled` | `starting` | `ok` | `stale` | `error`).

## Setup mínimo

1. Firebase project + `android/app/google-services.json` (Gradle já aplica o plugin).
2. Service account → `FIREBASE_SERVICE_ACCOUNT_B64` + `PUSH_SCHEDULER_ENABLED=true`.
3. `npx cap sync` no app após `@capacitor/push-notifications`.

Sem Firebase/credenciais o reconcile do app cai para **local** e o scheduler
fica `disabled` / não arma.

## Fora deste starter

- **Web Push** (Firebase JS / FID no browser): copie do My Memories se precisar.
- Horário do lembrete é fixo (`09:00`, igual ao `taskStore`); produtos reais
  podem expor `reminderTime` no CRUD.
