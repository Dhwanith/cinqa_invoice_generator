const firstItem = items[0];

if (!firstItem) {
  return [];
}

const originalContext = firstItem.json.originalContext ?? {};

return [
  {
    json: {
      ...originalContext,
      lineItemRecordCount: Number(originalContext.lineItemRecordCount ?? 0)
    }
  }
];