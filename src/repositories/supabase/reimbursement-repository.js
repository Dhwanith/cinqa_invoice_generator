import { getSupabaseClient, getDefaultOrgId } from '../../lib/supabase.js';

function normalizeRow(row) {
  return {
    id: row.id,
    paidBy: row.paid_by,
    date: row.date || '',
    description: row.description,
    category: row.category || 'other',
    amount: Number(row.amount || 0),
    gstAmount: Number(row.gst_amount || 0),
    itcEligible: Boolean(row.itc_eligible),
    receiptReference: row.receipt_reference || '',
    notes: row.notes || '',
    status: row.status || 'pending',
    reimbursedDate: row.reimbursed_date || '',
    reimbursedAmount: row.reimbursed_amount !== null && row.reimbursed_amount !== undefined
      ? Number(row.reimbursed_amount)
      : null,
    paymentReference: row.payment_reference || '',
    createdAt: row.created_at
  };
}

export async function listReimbursements({ search = '', status = 'all', paidBy = '', dateFrom = '', dateTo = '' } = {}) {
  const supabase = getSupabaseClient();
  const orgId = getDefaultOrgId();

  let query = supabase
    .from('reimbursements')
    .select('*')
    .eq('organization_id', orgId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200);

  if (search) query = query.or(`description.ilike.%${search}%,paid_by.ilike.%${search}%`);
  if (status && status !== 'all') query = query.eq('status', status);
  if (paidBy && paidBy !== 'all') query = query.eq('paid_by', paidBy);
  if (dateFrom) query = query.gte('date', dateFrom);
  if (dateTo) query = query.lte('date', dateTo);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list reimbursements: ${error.message}`);
  return (data || []).map(normalizeRow);
}

export async function createReimbursement(payload) {
  const supabase = getSupabaseClient();
  const orgId = getDefaultOrgId();

  const { data, error } = await supabase
    .from('reimbursements')
    .insert({
      organization_id: orgId,
      paid_by: payload.paidBy,
      date: payload.date,
      description: payload.description,
      category: payload.category || 'other',
      amount: Number(payload.amount || 0),
      gst_amount: Number(payload.gstAmount || 0),
      itc_eligible: Boolean(payload.itcEligible),
      receipt_reference: payload.receiptReference || '',
      notes: payload.notes || '',
      status: 'pending'
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create reimbursement: ${error.message}`);
  return normalizeRow(data);
}

export async function updateReimbursementStatus(id, { status, reimbursedDate, reimbursedAmount, paymentReference }) {
  const supabase = getSupabaseClient();
  const updateData = { status };

  if (status === 'reimbursed') {
    updateData.reimbursed_date = reimbursedDate || new Date().toISOString().slice(0, 10);
    updateData.reimbursed_amount = reimbursedAmount !== undefined ? Number(reimbursedAmount) : null;
    updateData.payment_reference = paymentReference || '';
  }

  const { data, error } = await supabase
    .from('reimbursements')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update reimbursement: ${error.message}`);
  return normalizeRow(data);
}

export async function deleteReimbursement(id) {
  const supabase = getSupabaseClient();

  const { data: row, error: fetchErr } = await supabase
    .from('reimbursements')
    .select('id, paid_by, description, amount')
    .eq('id', id)
    .single();
  if (fetchErr) throw new Error(`Reimbursement not found: ${fetchErr.message}`);

  const { error } = await supabase.from('reimbursements').delete().eq('id', id);
  if (error) throw new Error(`Failed to delete reimbursement: ${error.message}`);

  return { id: row.id, paidBy: row.paid_by, description: row.description };
}

export async function bulkApproveReimbursements(ids) {
  const supabase = getSupabaseClient();
  const orgId = getDefaultOrgId();

  const { data, error } = await supabase
    .from('reimbursements')
    .update({ status: 'approved' })
    .eq('organization_id', orgId)
    .in('id', ids)
    .eq('status', 'pending')
    .select();

  if (error) throw new Error(`Failed to bulk approve: ${error.message}`);
  return (data || []).map(normalizeRow);
}
