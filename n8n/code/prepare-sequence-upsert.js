const built = $items('Build Invoice', 0, 0)[0].json;

return [
  {
    json: {
      sequenceRecordId: built.sequenceRecordId,
      invoiceNo: built.invoiceNo,
      sequence: built.sequence,
      sequenceFields: {
        'Financial Year': built.metadata.financialYear,
        Type: built.request.invoiceType || 'tax',
        'Last Sequence': built.sequence,
        'Last Invoice No': built.invoiceNo
      }
    }
  }
];