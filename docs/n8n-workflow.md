# n8n Workflow Outline

Target host: `https://n8nlocal.zoomroam.in/workflow`

Workflow asset: `n8n/workflows/create-invoice.workflow.json`

Paste-ready code node scripts:

- `n8n/code/validate-request.js`
- `n8n/code/build-duplicate-response.js`
- `n8n/code/build-invoice.js`
- `n8n/code/prepare-sequence-upsert.js`

## Suggested Nodes

1. `Webhook`: Accept `POST /create-invoice` and require a shared secret or signature header.

2. `Code` or external helper step: Normalize input, validate the idempotency key, and reject duplicates if an invoice already exists for the same key.

3. `Airtable`: Read the current financial-year sequence row.

4. `Code`: Calculate the next invoice sequence and invoice number.

5. `Code` or external helper step: Build the invoice document and render HTML.

6. `HTTP Request` or sidecar call: Convert the invoice document to PDF using the Puppeteer service.

7. `Airtable`: Create the invoice record.

8. `Airtable`: Create linked line-item records.

9. `Google Drive`: Upload the generated PDF to the configured invoice folder.

10. `Airtable`: Update the invoice record with the Google Drive link and optionally an attachment reference.

11. `Respond to Webhook`: Return invoice metadata, Airtable record id, and Google Drive file reference.

## Notes

- If you keep the PDF runtime outside n8n, expose a small internal HTTP endpoint that accepts the invoice object and returns a PDF buffer.
- If request volume is low, optimistic retries against the `Invoice Sequences` row are acceptable for MVP.
- The helper code in `src/` is designed to own business rules so the n8n workflow remains orchestration-focused.
- Google Drive is the recommended storage target for final PDFs; Airtable should store metadata and links rather than acting as the primary file store.
