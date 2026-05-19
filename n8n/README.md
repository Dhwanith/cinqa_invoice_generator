# n8n — Archived

> **This directory is archived.** The n8n workflow was the original invoice automation layer when the stack used Airtable + Google Drive. It has been fully replaced by the app layer as of the Supabase migration.

## What replaced each piece

| n8n node / code file | Replaced by |
|---|---|
| `validate-request.js` | `src/services/validation.js` — `normalizeInvoiceRequest` |
| `hydrate-client-defaults.js` | `src/repositories/supabase/client-repository.js` — `getClientById` |
| `build-invoice.js` | `src/services/invoice.js` — `buildInvoiceDocument` |
| `create-line-items.js` | `src/repositories/supabase/invoice-repository.js` — `createInvoice` |
| `finalize-line-items.js` | Eliminated — Supabase FK cascade handles cleanup |
| `prepare-sequence-upsert.js` | PostgreSQL `next_invoice_sequence()` function (atomic) |
| `build-drive-update.js` | `src/services/pdf-storage.js` — `uploadInvoicePdf` to Supabase Storage |
| Google Drive upload node | Supabase Storage — `invoices` bucket |
| Idempotency-check branch | `UNIQUE(organization_id, idempotency_key)` PG constraint |

## Decommissioning the old n8n instance

The old monolithic workflow (validate → lookup → build → Airtable write → Drive upload → respond) is entirely replaced by the app layer. You can safely remove or disable it.

**Checklist before decommissioning:**
1. Confirm no external tools are still POSTing directly to the old n8n webhook URL.
2. Point any remaining callers at `POST /webhook/create-invoice` on the app server (see below).
3. Disable or delete the old workflow in your n8n instance.
4. Remove the `N8N_WEBHOOK_SECRET`, `CREATE_INVOICE_WEBHOOK_URL`, and `WEBHOOK_URL` env vars from all deployments.

## External integrations — migration path

If anything was calling the old n8n webhook directly, change it to:

```
POST https://your-app-server/webhook/create-invoice
Headers:
  Content-Type: application/json
  x-webhook-secret: <WEBHOOK_API_KEY>   # only if WEBHOOK_API_KEY is set
```

**Payload format is identical** to the old n8n input — no changes needed on the caller side:

```json
{
  "idempotencyKey": "req-2026-04-04-001",
  "invoiceDate": "2026-04-04",
  "invoiceType": "tax",
  "showQuantity": false,
  "client": {
    "name": "AdKrity Digital Solutions Private Limited",
    "gstin": "24AAVCA3793L1ZY",
    "state": "Gujarat",
    "stateCode": 24,
    "addressLines": ["28 29, C K Park, Adajan, Honey Park Road,", "Rander, Surat - 395009, GJ(24)"]
  },
  "lineItems": [
    { "description": "AI-based Marketing Services", "sac": "998314", "amount": 300000 }
  ]
}
```

`sequence` in the payload is accepted but **ignored** — the atomic `next_invoice_sequence()` PostgreSQL function always assigns the real number.

**Response:**
```json
{ "ok": true, "duplicate": false, "invoiceNo": "CTS/26-27/INV003", "invoiceRecordId": "uuid", "total": 354000 }
```
Submitting the same `idempotencyKey` twice returns `"duplicate": true` with the existing invoice data — no second invoice is created.

## Minimal n8n pass-through (if you want to keep n8n as an automation trigger)

If n8n is used for other automations and you want to keep it as an entry point, replace the old monolithic workflow with a two-node workflow:

```
[Webhook trigger]  →  [HTTP Request]
  POST /webhook/create-invoice-n8n     POST https://your-app-server/webhook/create-invoice
  (your n8n URL)                       body: {{ $json.body }}
                                       headers: x-webhook-secret: {{ $env.WEBHOOK_API_KEY }}
```

That's the entire workflow. All business logic lives in the app server.

## Archived assets

- `workflows/create-invoice.workflow.json` — original monolithic workflow export, kept for reference only

## Current invoice flow (no n8n in critical path)

```
POST /api/invoices                         <100 ms end-to-end
  → next_invoice_sequence()  [PostgreSQL — atomic, no race condition]
  → buildInvoiceDocument()   [app layer — validates, computes taxes]
  → createInvoice()          [Supabase: invoices + invoice_line_items + pdf_generation_jobs]
  → 201 { invoiceNo, invoiceRecordId, total }

[Background, ~2–5 s later]
  → renderInvoicePdfBuffer()  [Puppeteer]
  → uploadInvoicePdf()        [Supabase Storage bucket: invoices]
  → invoices.pdf_storage_path set

GET /api/invoices/:id/pdf
  → pdf_storage_path set   → 302 redirect to Supabase signed URL  (instant)
  → pdf_storage_path null  → on-demand Puppeteer render            (fallback)

GET /api/invoices/:id/pdf-status
  → { ready: boolean, generatedAt: string | null }
```
