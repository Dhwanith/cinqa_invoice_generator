# Cinqa Invoice Generator

This workspace contains the first implementation slice for the GST-compliant invoice automation flow used by Cinqa Tech Solutions LLP.

## What Is Implemented

- invoice domain normalization and validation
- GST calculation for same-state and cross-state invoices
- financial-year invoice numbering helpers
- invoice document assembly for multi-line invoices
- HTML rendering aligned to the provided PDF template structure
- PDF generation with Puppeteer
- a sample generator script for previewing invoice HTML locally
- a lightweight local PDF service for n8n or internal HTTP calls
- Airtable, n8n, and Google Drive integration notes for the next implementation step
- a React operator app for client registration, invoice generation, history, and status tracking
- support for both tax invoices and proforma invoices, including optional quantity and unit-price columns plus configurable proforma due dates

## Current Architecture

- `src/services/validation.js`: validates and normalizes incoming invoice payloads
- `src/services/gst.js`: computes GST split per line item and per invoice
- `src/services/financial-year.js`: derives the financial year label and due dates
- `src/services/invoice-number.js`: formats tax invoices as `CTS/<FY>/INV/<sequence>` and proformas as `CTS/<FY>/PI/<sequence>`
- `src/services/amount-in-words.js`: converts totals into Indian currency words
- `src/services/invoice.js`: assembles the final invoice document object
- `src/services/pdf.js`: renders invoice HTML to PDF using Puppeteer
- `src/templates/invoice-template.js`: renders HTML for Puppeteer or another PDF layer
- `scripts/generate-sample.js`: generates a sample HTML file from a fixture payload
- `scripts/pdf-service.js`: exposes `/render-invoice-html` and `/render-invoice-pdf` endpoints for n8n integration
- `scripts/app-server.js`: serves the operator app and secure API endpoints for clients and invoices
- `frontend/`: React/Vite operator app that consumes the app server API
- `assets/fonts/`: bundled local fonts used by the HTML template and Puppeteer PDF output
- `Cinqa Logo.jpeg`: bundled logo asset used directly in the invoice template

## Request Shape

The domain logic currently expects a payload shaped like this:

```json
{
  "idempotencyKey": "req-2026-04-06-001",
  "invoiceDate": "2026-04-04",
  "sequence": 1,
  "client": {
    "name": "AdKrity Digital Solutions Private Limited",
    "gstin": "24AAVCA3793L1ZY",
    "state": "Gujarat",
    "stateCode": 24,
    "addressLines": [
      "28 29, C K Park, Adajan, Honey Park Road,",
      "Rander, Surat - 395009, GJ(24)"
    ]
  },
  "lineItems": [
    {
      "description": "AI-based Marketing Image Generation Services (Partial Payment - Phase 1 of Project)",
      "sac": "998314",
      "amount": 300000
    }
  ]
}
```

## Run Locally

Install dependencies if you add any later, then run:

```bash
npm test
npm run generate:sample
npm run pdf:service
npm run frontend:build
npm run app:server
```

Before starting the operator app, create a local `.env` file from `.env.example` and fill in the Airtable and webhook values. The app server now loads `.env` automatically.

The sample script writes preview files to `output/sample-invoice.html` and `output/sample-invoice.pdf`.

The PDF service listens on port `3001` by default and accepts:

- `POST /render-invoice-html` with either `{ "invoice": { ... } }` or `{ "payload": { ... } }`
- `POST /render-invoice-pdf` with either `{ "invoice": { ... } }` or `{ "payload": { ... } }`

The internal operator app listens on `APP_PORT` and exposes:

- `GET /api/health`
- `GET /api/clients`
- `POST /api/clients`
- `GET /api/invoices`
- `POST /api/invoices`

The UI is served at `/` from `frontend/dist` and is intended for internal use only.

Environment values used by the PDF and storage path:

- `PDF_SERVICE_URL`
- `GOOGLE_DRIVE_INVOICE_FOLDER_ID`
- `APP_PORT`
- `CREATE_INVOICE_WEBHOOK_URL`

## Secondary PC Deployment

If Docker and n8n are hosted on the secondary PC, host the operator app there too. Running the React UI locally on this workstation without the backend environment will load the shell but not the live Airtable-backed data.

The repo includes a compose file for that setup:

```bash
docker compose -f docker-compose.secondary.yml up -d --build
```

That compose file now runs three services on the secondary PC:

- `n8n`
- `pdf-service`
- `operator-app`

For this deployment shape:

- the browser UI is available from `http://<secondary-pc-ip>:3010`
- `n8n` uses `PDF_SERVICE_URL=http://pdf-service:3001` on the internal Docker network
- the operator app uses `CREATE_INVOICE_WEBHOOK_URL=http://n8n:5678/webhook/create-invoice` on the internal Docker network

That keeps both PDF rendering and invoice generation traffic on the internal Docker network, which avoids Windows firewall, ESET, and cross-machine reachability issues.

## Airtable Design Direction

Recommended tables:

- `Invoices`
- `Invoice Line Items`
- `Invoice Sequences`

The implementation currently prepares the invoice document in a way that is friendly to either a normalized Airtable design or a serialized line-item field.

## n8n Integration Direction

The current code is designed to be called from n8n after the webhook receives input and before the workflow stores data in Airtable. The recommended production path is:

1. build the invoice document in n8n
2. call the local PDF service to render the Cinqa invoice HTML into PDF
3. upload the PDF to Google Drive
4. store the Drive file link and optionally the PDF attachment reference back in Airtable

## Internal App Slice

The repo now includes a React-based internal desk for operators.

Current UI capabilities:

- create Airtable client records
- select a client and prepare invoice line items
- submit invoice generation through the existing live n8n webhook
- view recent invoice records and open the Drive PDF link

Recommended next product steps:

1. add invoice detail pages and filters
2. support editing existing clients
3. add auth before wider internal rollout
4. add status updates such as sent and paid
