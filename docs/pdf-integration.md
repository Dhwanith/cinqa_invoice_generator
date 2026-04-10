# PDF Integration

The current implementation uses the existing Cinqa invoice structure from `Cinqa_Invoice_Template.pdf` as the visual baseline and renders HTML that Puppeteer converts to PDF.

The invoice template now bundles local Poppins and Syne font files from `assets/fonts/`, and it embeds the exact `Cinqa Logo.jpeg` asset directly into the HTML. PDF rendering does not depend on Google Fonts or external network access.

## Local PDF Service

Start the service:

```bash
npm run pdf:service
```

Default URL:

```text
http://127.0.0.1:3001
```

If n8n runs in Docker and the PDF service runs on your Windows host, set `PDF_SERVICE_URL` to:

```text
http://host.docker.internal:3001
```

If both services run in Docker Compose, use the PDF service container name instead, for example `http://invoice-pdf-service:3001`.

For the current two-machine setup, the recommended production path is to run the PDF service on the same secondary PC as n8n and expose it to n8n through Docker Compose with:

```text
PDF_SERVICE_URL=http://pdf-service:3001
```

The repo includes [docker-compose.secondary.yml](docker-compose.secondary.yml) and [Dockerfile.pdf-service](Dockerfile.pdf-service) for that deployment shape.

Endpoints:

- `GET /health`
- `POST /render-invoice-html`
- `POST /render-invoice-pdf`

## Request Formats

You can send either a full invoice object that already matches the HTML template, or a raw invoice payload that the service will normalize first.

Example request using the raw payload format:

```json
{
  "payload": {
    "idempotencyKey": "req-2026-04-04-001",
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
        "sac": 998314,
        "amount": 300000
      }
    ]
  }
}
```

## n8n Direction

After the invoice record and line items are created, add an HTTP Request node that posts to:

```text
${PDF_SERVICE_URL:-http://host.docker.internal:3001}/render-invoice-pdf
```

When using the secondary-PC compose setup, the effective URL should be:

```text
http://pdf-service:3001/render-invoice-pdf
```

Send the invoice object from the `Build Invoice` node or the raw invoice payload if you prefer the service to assemble it.

Then add a Google Drive upload step that stores the PDF in the folder identified by `GOOGLE_DRIVE_INVOICE_FOLDER_ID`.

Recommended Google Drive upload filename:

```text
{{$items('Build Invoice', 0, 0)[0].json.invoiceNo}}.pdf
```

Recommended follow-up after the upload:

1. capture the Drive file id and web link
2. update the Airtable invoice row with the Drive link or file id
3. optionally attach the PDF back to Airtable only if you need in-base downloads as well

The helper code for step 2 is available in `n8n/code/build-drive-update.js`.

Recommended n8n node order after invoice creation:

1. `Build Invoice`
2. `Create Invoice Record`
3. `Create Line Items`
4. `Prepare Sequence Upsert`
5. `Update/Create Sequence Row`
6. `HTTP Request` to `POST /render-invoice-pdf`
7. `Google Drive` upload to `GOOGLE_DRIVE_INVOICE_FOLDER_ID`
8. `Airtable` update of the invoice row with the Drive URL
9. `Respond to Webhook`
