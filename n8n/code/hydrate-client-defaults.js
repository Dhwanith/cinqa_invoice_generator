const validated = $items('Validate Request', 0, 0)[0].json;
const clientLookup = $json.records ?? [];
const clientRecord = clientLookup[0] ?? null;
const fields = clientRecord?.fields ?? {};

const request = {
  ...validated.request,
  client: {
    ...validated.request.client,
    name: validated.request.client.name || fields['Client Name'] || null,
    state: validated.request.client.state || fields.State || null,
    stateCode: validated.request.client.stateCode || Number(fields['State Code'] || 0),
    addressLines:
      validated.request.client.addressLines?.length > 0
        ? validated.request.client.addressLines
        : [fields['Address Line 1'], fields['Address Line 2']].filter(Boolean),
    defaultSac: fields['Default SAC'] || validated.request.client.defaultSac || validated.metadata.defaultSac,
    defaultPaymentTermsDays: Number(fields['Default Payment Terms Days'] || validated.request.client.defaultPaymentTermsDays || validated.metadata.paymentTermsDays)
  }
};

const lineItems = request.lineItems.map((lineItem) => ({
  ...lineItem,
  sac: lineItem.sac || request.client.defaultSac || validated.metadata.defaultSac
}));

return [
  {
    json: {
      request: {
        ...request,
        lineItems
      },
      metadata: {
        ...validated.metadata,
        paymentTermsDays: request.client.defaultPaymentTermsDays,
        clientRecordId: clientRecord?.id ?? null
      }
    }
  }
];