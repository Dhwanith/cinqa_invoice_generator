# Airtable Schema

## Invoices

Recommended fields:

- `Invoice No` - single line text
- `Idempotency Key` - single line text
- `Invoice Type` - single select (`tax`, `proforma`) or single line text
- `Show Quantity` - checkbox
- `Include Due Date` - checkbox
- `Client` - single line text snapshot of the client name used on the invoice
- `Client Record` - optional link to `Clients`
- `Invoice Date` - date
- `Due Date` - date
- `Client Name` - single line text
- `GSTIN` - single line text
- `State` - single line text
- `State Code` - number
- `Proforma Invoice Record` - optional link to `Invoices` for converted tax invoices
- `Source Proforma Invoice No` - single line text
- `Source Proforma Invoice Date` - date
- `Purchase Order No` - single line text
- `Purchase Order Date` - date
- `Place of Supply` - formula or text
- `GST Type` - single select
- `Amount` - currency
- `CGST` - currency
- `SGST` - currency
- `IGST` - currency
- `Total` - currency
- `SAC` - single line text or formula summary
- `Reverse Charge` - single select
- `Status` - single select (`draft`, `generated`, `failed`, `sent`, `paid`)
- `Total In Words` - long text or single line text
- `PDF` - attachment

## Clients

Recommended fields:

- `Client Name` - primary field, single line text
- `GSTIN` - single line text
- `State` - single line text
- `State Code` - number
- `Address Line 1` - single line text
- `Address Line 2` - single line text
- `Default SAC` - single line text
- `Default Payment Terms Days` - number
- `Email` - email
- `Phone` - phone number
- `Active` - single select or checkbox
- `Notes` - long text

## Invoice Line Items

Recommended fields:

- `Invoice Record` - optional link to `Invoices`
- `Invoice No` - single line text for import convenience
- `Line No` - number
- `Description` - long text
- `SAC` - single line text
- `Quantity` - number, optional
- `Unit Price` - currency, optional
- `Amount` - currency
- `Taxable Value` - currency
- `CGST` - currency
- `SGST` - currency
- `IGST` - currency
- `Total` - currency

## Invoice Sequences

Recommended fields:

- `Financial Year` - single line text, example `26-27`
- `Type` - single select or text, example `tax` or `proforma`
- `Last Sequence` - number
- `Last Invoice No` - single line text
- `Updated At` - last modified time
The `Invoice Sequences` table should have exactly one row per financial year and type combination. The workflow should update it with retry logic to reduce sequence collisions.

## Linked Field Setup

The current workflow supports two Airtable modes:

1. Plain-text relations only.
   In this mode, keep `Client` in the `Invoices` table as text and keep `Invoice No` in the `Invoice Line Items` table as text. Do not set any extra env vars.

2. Text fields plus optional linked-record fields.
   In this mode, keep the text fields above and add separate linked-record fields so Airtable relationships work without breaking the workflow payload shape.

Recommended linked-record field names:

- In `Invoices`: `Client Record` linked to `Clients`
- In `Invoices`: `Proforma Invoice Record` linked to `Invoices`
- In `Invoice Line Items`: `Invoice Record` linked to `Invoices`

Recommended env values for linked-record mode:

- `AIRTABLE_FIELD_CLIENT_LINK=Client Record`
- `AIRTABLE_FIELD_PROFORMA_LINK=Proforma Invoice Record`
- `AIRTABLE_FIELD_INVOICE_LINK=Invoice Record`

Important constraints:

- Do not convert the existing `Client` text field into a linked-record field unless you also change the workflow logic.
- Do not rely only on linked-record fields for line items; keep `Invoice No` as a text field because the workflow uses it as a stable import and troubleshooting reference.
- `Invoices` should use `Invoice No` as the primary field.
- `Clients` should use `Client Name` as the primary field.
- `Invoice Line Items` can use a formula primary field such as `{Invoice No} & " - " & {Line No}`.

## Import Files

Import-ready CSV files are available in `airtable/`:

- `airtable/clients.csv`
- `airtable/invoice_sequences.csv`
- `airtable/invoices.csv`
- `airtable/invoice_line_items.csv`
