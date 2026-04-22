# n8n Assets

This directory contains actual n8n workflow assets for the invoice automation flow.

## Files

- `workflows/create-invoice.workflow.json`: n8n workflow export scaffold for the `create-invoice` flow
- `code/validate-request.js`: code for the `Validate Request` node
- `code/hydrate-client-defaults.js`: code for the `Hydrate Client Defaults` node
- `code/build-duplicate-response.js`: code for the duplicate-idempotency branch
- `code/build-invoice.js`: code for the invoice assembly node
- `code/build-drive-update.js`: code for mapping Google Drive upload output back into Airtable update fields
- `code/prepare-sequence-upsert.js`: code for the sequence row update node

## Import Notes

1. Import `workflows/create-invoice.workflow.json` into your hosted n8n instance.
2. Open each `Code` node and replace the placeholder code with the matching file from `n8n/code/`.
3. Configure the HTTP Request nodes or swap them for Airtable nodes if you prefer native credentials.
4. Set environment variables in your Docker-backed n8n deployment using your current names, especially `AIRTABLE_API_TOKEN`, `AIRTABLE_BASE_ID`, `AIRTABLE_TABLE_CLIENTS`, `AIRTABLE_TABLE_INVOICES`, `AIRTABLE_TABLE_LINE_ITEMS`, `AIRTABLE_TABLE_SEQUENCES`, `PDF_SERVICE_URL`, and `GOOGLE_DRIVE_INVOICE_FOLDER_ID`.

Optional linked-record fields:

- `AIRTABLE_FIELD_CLIENT_LINK`: set this only if your invoice table has a linked-record field to the clients table
- `AIRTABLE_FIELD_PROFORMA_LINK`: set this only if your invoice table has a linked-record field back to the source proforma invoice
- `AIRTABLE_FIELD_INVOICE_LINK`: set this only if your line-items table has a linked-record field to the invoices table

## Current Workflow Scope

The workflow asset currently covers:

- webhook intake
- request validation
- client defaults lookup from the `clients` table
- idempotency lookup
- invoice number sequencing lookup, split by financial year and invoice type
- invoice document assembly
- Airtable invoice create payload
- Airtable line-item create payload
- financial-year sequence update payload
- template-ready invoice document output for PDF rendering
- success and duplicate webhook responses

The recommended next integration step is an HTTP Request node that posts `invoiceDocument` to `${PDF_SERVICE_URL}/render-invoice-pdf`, followed by a Google Drive upload node that stores the PDF in `GOOGLE_DRIVE_INVOICE_FOLDER_ID`.

After the Google Drive upload, use `code/build-drive-update.js` to prepare the Airtable patch payload for `Google Drive File ID` and `Google Drive URL`.
