export type VendorCategory =
  | 'software' | 'cloud' | 'office' | 'equipment'
  | 'professional_services' | 'travel' | 'marketing' | 'utilities' | 'other';

export type PurchaseCategory =
  | 'software' | 'cloud' | 'office' | 'equipment'
  | 'professional_services' | 'travel' | 'marketing'
  | 'utilities' | 'payroll_processing' | 'bank_charges' | 'other';

export type ItcType = 'full' | 'restricted' | 'blocked';
export type PurchaseStatus = 'draft' | 'booked' | 'paid' | 'cancelled';

export const VENDOR_CATEGORY_LABELS: Record<string, string> = {
  software:              'Software & Licenses',
  cloud:                 'Cloud & Hosting',
  office:                'Office & Stationery',
  equipment:             'Equipment & Hardware',
  professional_services: 'Professional Services',
  travel:                'Travel & Accommodation',
  marketing:             'Marketing & Advertising',
  utilities:             'Utilities & Telecom',
  other:                 'Other',
};

export const PURCHASE_CATEGORY_LABELS: Record<string, string> = {
  ...VENDOR_CATEGORY_LABELS,
  payroll_processing: 'Payroll Processing',
  bank_charges:       'Bank Charges',
};

export const GST_RATES = [0, 5, 12, 18, 28] as const;

export interface Vendor {
  id: string;
  name: string;
  gstin: string;
  state: string;
  stateCode: number;
  addressLines: string[];
  category: VendorCategory;
  defaultPaymentTermsDays: number;
  email: string;
  phone: string;
  active: boolean;
  notes: string;
}

export interface PurchaseLineItem {
  id?: string;
  purchaseId?: string;
  lineNumber: number;
  description: string;
  hsnSac: string;
  quantity: number | null;
  unitPrice: number | null;
  amount: number;
  gstRate: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

export interface Purchase {
  id: string;
  vendorId: string | null;
  vendorName: string;
  vendorGstin: string;
  vendorStateCode: number;
  purchaseNumber: string;
  purchaseDate: string;
  dueDate: string;
  amount: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  gstType: string;
  itcEligible: boolean;
  itcType: ItcType;
  isRcm: boolean;
  status: PurchaseStatus;
  category: PurchaseCategory;
  notes: string;
  paymentDate: string;
  paymentReference: string;
  createdAt?: string;
  lineItems?: PurchaseLineItem[];
}

export interface CreateVendorPayload {
  name: string;
  gstin: string;
  state: string;
  stateCode: number;
  addressLine1: string;
  addressLine2: string;
  addressLine3: string;
  category: VendorCategory;
  defaultPaymentTermsDays: number;
  email: string;
  phone: string;
  active: boolean;
  notes: string;
}

export interface CreatePurchasePayload {
  vendorId: string;
  purchaseNumber: string;
  purchaseDate: string;
  dueDate: string;
  category: PurchaseCategory;
  itcType: ItcType;
  isRcm: boolean;
  notes: string;
  lineItems: Omit<PurchaseLineItem, 'id' | 'purchaseId'>[];
}

/** Computed ITC claimable based on ITC type */
export function computeItcClaimable(purchase: { cgst: number; sgst: number; igst: number; itcType: ItcType; itcEligible: boolean }): number {
  if (!purchase.itcEligible || purchase.itcType === 'blocked') return 0;
  const totalGst = purchase.cgst + purchase.sgst + purchase.igst;
  if (purchase.itcType === 'restricted') return Math.round(totalGst * 0.5 * 100) / 100;
  return totalGst;
}

/** Calculate line-level GST from taxable amount, rate, and state codes */
export function calculateLineGst(
  taxableAmount: number,
  gstRate: number,
  vendorStateCode: number,
  companyStateCode = 24
): { cgst: number; sgst: number; igst: number; total: number } {
  const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
  if (!gstRate || !vendorStateCode) {
    return { cgst: 0, sgst: 0, igst: 0, total: round2(taxableAmount) };
  }
  const gstAmount = round2(taxableAmount * gstRate / 100);
  if (vendorStateCode === companyStateCode) {
    const half = round2(gstAmount / 2);
    return { cgst: half, sgst: half, igst: 0, total: round2(taxableAmount + half * 2) };
  }
  return { cgst: 0, sgst: 0, igst: gstAmount, total: round2(taxableAmount + gstAmount) };
}
