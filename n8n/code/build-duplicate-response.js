const existingLookup = $json.records ?? [];
const existingRecord = existingLookup[0] ?? null;

return [
  {
    json: {
      ok: true,
      duplicate: true,
      message: 'Invoice already exists for the provided idempotency key.',
      recordId: existingRecord?.id ?? null,
      invoiceNo: existingRecord?.fields?.['Invoice No'] ?? null,
      total: existingRecord?.fields?.Total ?? null,
      airtableRecord: existingRecord
    }
  }
];