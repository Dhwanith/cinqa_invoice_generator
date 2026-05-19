import { getSupabaseClient, getDefaultOrgId } from '../../lib/supabase.js';
import { getVendorById } from './vendor-repository.js';

function normalizePurchaseLineItemRow(row) {
  return {
    id: row.id,
    purchaseId: row.purchase_id,
    lineNumber: row.line_number,
    description: row.description,
    hsnSac: row.hsn_sac || '',
    quantity: row.quantity !== null && row.quantity !== undefined ? Number(row.quantity) : null,
    unitPrice: row.unit_price !== null && row.unit_price !== undefined ? Number(row.unit_price) : null,
    amount: Number(row.amount || 0),
    gstRate: Number(row.gst_rate || 18),
    cgst: Number(row.cgst || 0),
    sgst: Number(row.sgst || 0),
    igst: Number(row.igst || 0),
    total: Number(row.total || 0)
  };
}

function normalizePurchaseRow(row) {
  const rawLineItems = row.purchase_line_items;
  const lineItems = rawLineItems
    ? [...rawLineItems].sort((a, b) => a.line_number - b.line_number).map(normalizePurchaseLineItemRow)
    : undefined;

  return {
    id: row.id,
    vendorId: row.vendor_id || null,
    vendorName: row.vendor_name,
    vendorGstin: row.vendor_gstin || '',
    vendorStateCode: row.vendor_state_code || 0,
    purchaseNumber: row.purchase_number || '',
    purchaseDate: row.purchase_date || '',
    dueDate: row.due_date || '',
    amount: Number(row.amount || 0),
    cgst: Number(row.cgst || 0),
    sgst: Number(row.sgst || 0),
    igst: Number(row.igst || 0),
    total: Number(row.total || 0),
    gstType: row.gst_type || '',
    itcEligible: Boolean(row.itc_eligible),
    itcType: row.itc_type || 'full',
    isRcm: Boolean(row.is_rcm),
    status: row.status || 'booked',
    category: row.category || 'other',
    notes: row.notes || '',
    paymentDate: row.payment_date || '',
    paymentReference: row.payment_reference || '',
    createdAt: row.created_at,
    lineItems
  };
}

export async function listPurchases({ search = '', status = 'all', dateFrom = '', dateTo = '' } = {}) {
  const supabase = getSupabaseClient();
  const orgId = getDefaultOrgId();

  let query = supabase
    .from('purchases')
    .select('*')
    .eq('organization_id', orgId)
    .order('purchase_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100);

  if (search) query = query.or(`vendor_name.ilike.%${search}%,purchase_number.ilike.%${search}%`);
  if (status && status !== 'all') query = query.eq('status', status);
  if (dateFrom) query = query.gte('purchase_date', dateFrom);
  if (dateTo) query = query.lte('purchase_date', dateTo);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list purchases: ${error.message}`);
  return (data || []).map(normalizePurchaseRow);
}

export async function getPurchaseDetail(purchaseId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('purchases')
    .select('*, purchase_line_items(*)')
    .eq('id', purchaseId)
    .single();
  if (error) throw new Error(`Purchase not found (${purchaseId}): ${error.message}`);
  return normalizePurchaseRow(data);
}

export async function createPurchase({ vendorId, purchaseDate, dueDate, purchaseNumber, category, itcType, isRcm, notes, lineItems }) {
  const supabase = getSupabaseClient();
  const orgId = getDefaultOrgId();

  const vendor = await getVendorById(vendorId);
  const companyStateCode = Number(process.env.COMPANY_STATE_CODE || '24');
  const isSameState = vendor.stateCode === companyStateCode;

  // Compute purchase totals from line items
  const totals = lineItems.reduce((acc, li) => ({
    amount: acc.amount + Number(li.amount || 0),
    cgst: acc.cgst + Number(li.cgst || 0),
    sgst: acc.sgst + Number(li.sgst || 0),
    igst: acc.igst + Number(li.igst || 0),
    total: acc.total + Number(li.total || 0)
  }), { amount: 0, cgst: 0, sgst: 0, igst: 0, total: 0 });

  const gstType = !vendor.gstin ? 'NONE' : isSameState ? 'CGST/SGST' : 'IGST';
  const hasGst = totals.cgst + totals.sgst + totals.igst > 0;

  const { data: purchaseRow, error: pErr } = await supabase
    .from('purchases')
    .insert({
      organization_id: orgId,
      vendor_id: vendorId,
      vendor_name: vendor.name,
      vendor_gstin: vendor.gstin || null,
      vendor_state_code: vendor.stateCode,
      purchase_number: purchaseNumber || '',
      purchase_date: purchaseDate,
      due_date: dueDate || null,
      amount: totals.amount,
      cgst: totals.cgst,
      sgst: totals.sgst,
      igst: totals.igst,
      total: totals.total,
      gst_type: hasGst ? gstType : 'NONE',
      itc_eligible: itcType !== 'blocked' && Boolean(vendor.gstin),
      itc_type: itcType || 'full',
      is_rcm: Boolean(isRcm),
      status: 'booked',
      category: category || 'other',
      notes: notes || '',
    })
    .select()
    .single();

  if (pErr) throw new Error(`Failed to create purchase: ${pErr.message}`);

  const lineItemRows = lineItems.map((li, index) => ({
    organization_id: orgId,
    purchase_id: purchaseRow.id,
    line_number: li.lineNumber || index + 1,
    description: li.description,
    hsn_sac: li.hsnSac || '',
    quantity: li.quantity !== null && li.quantity !== undefined ? li.quantity : null,
    unit_price: li.unitPrice !== null && li.unitPrice !== undefined ? li.unitPrice : null,
    amount: Number(li.amount || 0),
    gst_rate: Number(li.gstRate || 18),
    cgst: Number(li.cgst || 0),
    sgst: Number(li.sgst || 0),
    igst: Number(li.igst || 0),
    total: Number(li.total || 0)
  }));

  const { error: liErr } = await supabase.from('purchase_line_items').insert(lineItemRows);
  if (liErr) throw new Error(`Failed to save line items: ${liErr.message}`);

  return normalizePurchaseRow(purchaseRow);
}

export async function updatePurchaseStatus(purchaseId, status) {
  const supabase = getSupabaseClient();
  const updateData = { status };
  if (status === 'paid') updateData.payment_date = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('purchases')
    .update(updateData)
    .eq('id', purchaseId)
    .select('*')
    .single();
  if (error) throw new Error(`Failed to update purchase status: ${error.message}`);
  return normalizePurchaseRow(data);
}

export async function markPurchasePaid(purchaseId, { paymentDate, paymentReference }) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('purchases')
    .update({ status: 'paid', payment_date: paymentDate, payment_reference: paymentReference || '' })
    .eq('id', purchaseId)
    .select('*')
    .single();
  if (error) throw new Error(`Failed to mark purchase as paid: ${error.message}`);
  return normalizePurchaseRow(data);
}

export async function deletePurchase(purchaseId) {
  const supabase = getSupabaseClient();

  const { data: purchase, error: fetchErr } = await supabase
    .from('purchases')
    .select('id, vendor_name, purchase_number')
    .eq('id', purchaseId)
    .single();
  if (fetchErr) throw new Error(`Purchase not found: ${fetchErr.message}`);

  const { count } = await supabase
    .from('purchase_line_items')
    .select('*', { count: 'exact', head: true })
    .eq('purchase_id', purchaseId);

  const { error: delErr } = await supabase.from('purchases').delete().eq('id', purchaseId);
  if (delErr) throw new Error(`Failed to delete purchase: ${delErr.message}`);

  return { purchaseId: purchase.id, vendorName: purchase.vendor_name, deletedLineItems: count || 0 };
}
