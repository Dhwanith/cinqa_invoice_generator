# Airtable Import Files

This directory contains CSV files that can be imported directly into Airtable to bootstrap the base structure for the invoice automation project.

## Suggested Import Order

1. `clients.csv`
2. `invoice_sequences.csv`
3. `invoices.csv`
4. `invoice_line_items.csv`

## Notes

- `clients.csv` is the separate sheet for reusable client variables.
- `invoices.csv` keeps invoice-time snapshots of client data and also includes a `Client` column that can be converted into a linked record to the `Clients` table.
- `invoice_line_items.csv` includes an `Invoice No` column so you can map or link line items back to the invoice table after import.
- `invoice_sequences.csv` should have one row per financial year.
