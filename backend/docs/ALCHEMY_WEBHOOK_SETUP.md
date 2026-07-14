# Royal Imperial AI — Alchemy Webhook Setup

## Callback URLs

Usa estas URLs en Alchemy:

- BSC / BEP20: `https://api.royalimperial.lat/api/webhooks/alchemy/bsc`
- Polygon: `https://api.royalimperial.lat/api/webhooks/alchemy/polygon`

## Variables Render Backend

```txt
ALCHEMY_NOTIFY_AUTH_TOKEN=...
ALCHEMY_BSC_WEBHOOK_ID=...
ALCHEMY_BSC_WEBHOOK_SIGNING_KEY=...
ALCHEMY_POLYGON_WEBHOOK_ID=...
ALCHEMY_POLYGON_WEBHOOK_SIGNING_KEY=...
ALCHEMY_SYNC_SECRET=...
```

## Validar configuración

```bash
curl "https://api.royalimperial.lat/api/webhooks/alchemy/health?secret=TU_ALCHEMY_SYNC_SECRET"
```

## Ver webhooks del team Alchemy

```bash
curl "https://api.royalimperial.lat/api/webhooks/alchemy/team-webhooks?secret=TU_ALCHEMY_SYNC_SECRET"
```

## Sincronizar direcciones desde PostgreSQL hacia Alchemy

Todas las redes:

```bash
curl -X POST "https://api.royalimperial.lat/api/webhooks/alchemy/sync-addresses?secret=TU_ALCHEMY_SYNC_SECRET"
```

Solo BSC:

```bash
curl -X POST "https://api.royalimperial.lat/api/webhooks/alchemy/sync-addresses?secret=TU_ALCHEMY_SYNC_SECRET&networkCode=BEP20-USDT"
```

Solo Polygon:

```bash
curl -X POST "https://api.royalimperial.lat/api/webhooks/alchemy/sync-addresses?secret=TU_ALCHEMY_SYNC_SECRET&networkCode=POLYGON-USDT"
```

## Scripts desde Render Shell

```bash
node backend/scripts/alchemy/checkAlchemyWebhookConfig.js
node backend/scripts/alchemy/syncAlchemyWebhookAddresses.js
node backend/scripts/alchemy/syncAlchemyWebhookAddresses.js BEP20-USDT
node backend/scripts/alchemy/syncAlchemyWebhookAddresses.js POLYGON-USDT
```
