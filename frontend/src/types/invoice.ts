export interface Client {
  id: string;
  name: string;
  gstin: string;
  state: string;
  stateCode: number;
  addressLines: string[];
  defaultSac: string;
  defaultPaymentTermsDays: number;
  email: string;
  phone: string;
  active: boolean;
  notes: string;
}

export interface LineItem {
  description: string;
  sac: string;
  amount: number;
  quantity?: number | null;
  unitPrice?: number | null;
}

export interface InvoiceLineItem extends LineItem {
  id: string;
  invoiceNo: string;
  lineNumber: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

export interface SourceProformaReference {
  invoiceRecordId?: string;
  invoiceNo: string;
  invoiceDate: string;
  invoiceDateDisplay?: string;
}

export interface PurchaseOrderReference {
  number: string;
  date: string;
  dateDisplay?: string;
}

export interface Invoice {
  id: string;
  invoiceNo: string;
  idempotencyKey: string;
  invoiceType?: "tax" | "proforma";
  showQuantity?: boolean;
  includeDueDate?: boolean;
  title?: string;
  invoiceDate: string;
  dueDate: string;
  clientRecordId?: string;
  clientName: string;
  gstin: string;
  state: string;
  stateCode: number;
  sourceProforma?: SourceProformaReference | null;
  purchaseOrder?: PurchaseOrderReference | null;
  placeOfSupply: string;
  gstType: string;
  amount: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  sac: string;
  reverseCharge: string;
  paymentTermsLabel?: string;
  status: string;
  totalInWords: string;
  googleDriveUrl: string;
  googleDriveFileId: string;
  lineItems?: InvoiceLineItem[];
}

export interface HealthData {
  ok: boolean;
  appName: string;
  companyStateCode: number;
  airtableConfigured: boolean;
  invoiceWebhookConfigured: boolean;
  createInvoiceWebhookUrl: string;
  warnings: string[];
  config: {
    airtable: {
      hasApiToken: boolean;
      hasBaseId: boolean;
      tables: { clients: string; invoices: string; lineItems: string };
    };
    webhook: { source: string | null; url: string | null };
  };
}
