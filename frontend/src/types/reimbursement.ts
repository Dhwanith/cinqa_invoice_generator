export type ReimbursementStatus = 'pending' | 'approved' | 'reimbursed' | 'rejected';

export type ReimbursementCategory =
  | 'travel' | 'accommodation' | 'meals' | 'office_supplies'
  | 'client_entertainment' | 'software' | 'equipment'
  | 'telecom' | 'medical' | 'other';

export const REIMBURSEMENT_CATEGORY_LABELS: Record<ReimbursementCategory, string> = {
  travel:               'Travel',
  accommodation:        'Accommodation',
  meals:                'Meals & Food',
  office_supplies:      'Office Supplies',
  client_entertainment: 'Client Entertainment',
  software:             'Software & Subscriptions',
  equipment:            'Equipment & Accessories',
  telecom:              'Internet & Telecom',
  medical:              'Medical',
  other:                'Other',
};

/** ITC is blocked under Section 17(5) for meals and client entertainment */
export const ITC_BLOCKED_CATEGORIES = new Set<ReimbursementCategory>(['meals', 'client_entertainment']);

export interface Reimbursement {
  id: string;
  paidBy: string;
  date: string;
  description: string;
  category: ReimbursementCategory;
  amount: number;
  gstAmount: number;
  itcEligible: boolean;
  receiptReference: string;
  notes: string;
  status: ReimbursementStatus;
  reimbursedDate: string;
  reimbursedAmount: number | null;
  paymentReference: string;
  createdAt?: string;
}

export interface CreateReimbursementPayload {
  paidBy: string;
  date: string;
  description: string;
  category: ReimbursementCategory;
  amount: number;
  gstAmount: number;
  itcEligible: boolean;
  receiptReference: string;
  notes: string;
}
