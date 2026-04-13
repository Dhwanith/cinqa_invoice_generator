const env = typeof $env === 'object' && $env !== null ? $env : {};

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function chunkArray(values, size) {
  const chunks = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

assert(env.AIRTABLE_BASE_ID, 'Missing AIRTABLE_BASE_ID.');
assert(env.AIRTABLE_TABLE_LINE_ITEMS, 'Missing AIRTABLE_TABLE_LINE_ITEMS.');

const invoiceNo = $items('Build Invoice', 0, 0)[0].json.invoiceNo;
const invoiceLinkField = env.AIRTABLE_FIELD_INVOICE_LINK || null;
const airtableUrl = `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(env.AIRTABLE_TABLE_LINE_ITEMS)}`;

const outputItems = [];

for (const item of items) {
  const invoiceRecordId = item.json.id;
  const lineItemFields = Array.isArray(item.json.lineItemFields) ? item.json.lineItemFields : [];

  const records = lineItemFields.map((fields) => ({
    fields: {
      ...fields,
      'Invoice No': invoiceNo,
      ...(invoiceLinkField ? { [invoiceLinkField]: [invoiceRecordId] } : {})
    }
  }));

  const lineItemRecordCount = records.length;
  const originalContext = {
    ...item.json,
    lineItemRecordCount
  };

  for (const [batchIndex, recordBatch] of chunkArray(records, 10).entries()) {
    outputItems.push({
      json: {
        airtableUrl,
        requestBody: {
          records: recordBatch
        },
        batchIndex,
        batchCount: Math.ceil(lineItemRecordCount / 10),
        lineItemRecordCount,
        originalContext
      }
    });
  }
}

return outputItems;