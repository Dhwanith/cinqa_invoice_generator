# Google Drive Integration

Use Google Drive as the storage layer for final invoice PDFs. This is a better fit than storing the PDF only inside Airtable because Drive is easier to share, audit, and organize by invoice number or client.

## Recommended Approach

1. Generate the invoice payload in n8n.
2. Render the invoice PDF using the local Puppeteer service.
3. Upload the PDF to Google Drive.
4. Save the Google Drive file URL or file id into the Airtable invoice record.

## Required Configuration

- `GOOGLE_DRIVE_INVOICE_FOLDER_ID`: target Drive folder for generated invoices
- a configured Google Drive credential inside n8n
- `PDF_SERVICE_URL`: URL of the local or sidecar PDF service

## Suggested Google Drive Folder Pattern

Base folder:

```text
Invoices
```

Optional subfolder pattern:

```text
Invoices/<financial-year>/
```

For the current implementation, a single folder id is enough. If you want FY-based subfolders later, create them in n8n before upload.

## Suggested Airtable Additions

In the `Invoices` table, add:

- `Google Drive File ID` - single line text
- `Google Drive URL` - url

## Suggested n8n Upload Metadata

Filename:

```text
{{$items('Build Invoice', 0, 0)[0].json.invoiceNo}}.pdf
```

Optional metadata to keep in Airtable:

- invoice number
- Google Drive file id
- Google Drive web view link
- upload timestamp

## Suggested Live n8n Nodes

After your existing `Merge Sequence Result` step, add these nodes in order:

1. `Render Invoice PDF` - HTTP Request
2. `Upload Invoice PDF` - Google Drive
3. `Build Drive Update` - Code
4. `Update Invoice Drive Fields` - HTTP Request or Airtable Update
5. `Build Success Response`

### 1. Render Invoice PDF

Use an `HTTP Request` node:

- Method: `POST`
- URL: `{{$env.PDF_SERVICE_URL || 'http://host.docker.internal:3001'}}/render-invoice-pdf`
- Send body as JSON
- JSON body:

```javascript
{{ { invoice: $items('Build Invoice', 0, 0)[0].json.invoiceDocument } }}
```

- Response format: file
- Binary property: `data`

If n8n runs in Docker, do not use `127.0.0.1` unless the PDF service is inside the same container. Use `http://host.docker.internal:3001` for a host machine service on Docker Desktop, or use the other container's service name on a shared Docker network.

For the secondary-PC deployment, use `http://pdf-service:3001` and start both services with [docker-compose.secondary.yml](docker-compose.secondary.yml).

### 2. Upload Invoice PDF

Use a `Google Drive` node:

- Operation: upload file
- Binary property: `data`
- File name:

```javascript
{{ $items('Build Invoice', 0, 0)[0].json.invoiceNo + '.pdf' }}
```

- Parent folder id:

```javascript
{{ $env.GOOGLE_DRIVE_INVOICE_FOLDER_ID }}
```

### 3. Build Drive Update

Use the code from `n8n/code/build-drive-update.js`.

### 4. Update Invoice Drive Fields

Use an `HTTP Request` node that patches Airtable:

- Method: `PATCH`
- URL:

```javascript
{{ 'https://api.airtable.com/v0/' + $env.AIRTABLE_BASE_ID + '/' + $env.AIRTABLE_TABLE_INVOICES + '/' + $json.invoiceRecordId }}
```

- Authorization header:

```javascript
Bearer {{$env.AIRTABLE_API_TOKEN}}
```

- JSON body:

```javascript
{{ { fields: $json.driveUpdateFields } }}
```

### 5. Build Success Response

Add these response fields in addition to the existing invoice metadata:

- `googleDriveFileId`
- `googleDriveUrl`

## Security Note

Do not hardcode Google credentials or Airtable tokens inside workflow node bodies. Keep them in n8n credentials or environment variables only.
