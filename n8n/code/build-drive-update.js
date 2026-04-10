const drive = $json;
const invoice = $items('Build Invoice', 0, 0)[0].json;
const invoiceRecord = $items('Create Invoice Record', 0, 0)[0].json;

const driveFileId = drive.id ?? drive.fileId ?? drive.driveFileId ?? null;
const driveUrl =
  drive.webViewLink ??
  drive.webContentLink ??
  drive.alternateLink ??
  drive.url ??
  (driveFileId ? `https://drive.google.com/file/d/${driveFileId}/view` : null);

return [
  {
    json: {
      invoiceRecordId: invoiceRecord.id,
      invoiceNo: invoice.invoiceNo,
      driveFileId,
      driveUrl,
      driveUpdateFields: {
        ...(driveFileId ? { 'Google Drive File ID': driveFileId } : {}),
        ...(driveUrl ? { 'Google Drive URL': driveUrl } : {})
      }
    }
  }
];