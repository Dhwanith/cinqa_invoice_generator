import { getSupabaseClient, getDefaultOrgId } from '../../lib/supabase.js';

function normalizeLineItemRow(row) {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    lineNumber: row.line_number,
    description: row.description,
    sac: row.sac || '',
    quantity: row.quantity !== null && row.quantity !== undefined ? Number(row.quantity) : null,
    unitPrice: row.unit_price !== null && row.unit_price !== undefined ? Number(row.unit_price) : null,
    amount: Number(row.amount || 0),
    taxableValue: Number(row.taxable_value || 0),
    cgst: Number(row.cgst || 0),
    sgst: Number(row.sgst || 0),
    igst: Number(row.igst || 0),
    total: Number(row.total || 0)
  };
}

function normalizeInvoiceRow(row) {
  const rawLineItems = row.invoice_line_items;
  const lineItems = rawLineItems
    ? [...rawLineItems]
        .sort((a, b) => a.line_number - b.line_number)
        .map(normalizeLineItemRow)
    : undefined;

  return {
    id: row.id,
    invoiceNo: row.invoice_no,
    idempotencyKey: row.idempotency_key || '',
    invoiceType: row.invoice_type || 'tax',
    showQuantity: Boolean(row.show_quantity),
    includeDueDate: row.include_due_date !== false,
    invoiceDate: row.invoice_date || '',
    dueDate: row.due_date || '',
    clientRecordId: row.client_id || '',
    clientName: row.client_name || '',
    gstin: row.gstin || '',
    state: row.state || '',
    stateCode: row.state_code || 0,
    sourceProforma: row.source_proforma_no
      ? {
          invoiceRecordId: row.source_proforma_id || null,
          invoiceNo: row.source_proforma_no,
          invoiceDate: row.source_proforma_date || ''
        }
      : null,
    purchaseOrder: row.purchase_order_number
      ? { number: row.purchase_order_number, date: row.purchase_order_date || '' }
      : null,
    placeOfSupply: row.place_of_supply || '',
    gstType: row.gst_type || '',
    amount: Number(row.amount || 0),
    cgst: Number(row.cgst || 0),
    sgst: Number(row.sgst || 0),
    igst: Number(row.igst || 0),
    total: Number(row.total || 0),
    sac: row.sac || '',
    reverseCharge: row.reverse_charge || 'No',
    status: row.status || 'generated',
    totalInWords: row.total_in_words || '',
    paymentTermsLabel: row.payment_terms_label || '',
    pdfStoragePath: row.pdf_storage_path || null,
    lineItems
  };
}

export async function listInvoices({ search = '', status = 'all' } = {}) {
  const supabase = getSupabaseClient();
  const orgId = getDefaultOrgId();

  let query = supabase
    .from('invoices')
    .select('*')
    .eq('organization_id', orgId)
    .order('invoice_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(50);

  if (search) {
    query = query.or(`invoice_no.ilike.%${search}%,client_name.ilike.%${search}%`);
  }

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list invoices: ${error.message}`);
  return (data || []).map(normalizeInvoiceRow);
}

async function getInvoiceById(invoiceId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .single();
  if (error) throw new Error(`Invoice not found (${invoiceId}): ${error.message}`);
  return normalizeInvoiceRow(data);
}

export async function getInvoiceByIdempotencyKey(idempotencyKey, organizationId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('invoices')
    .select('id, invoice_no, total, status')
    .eq('organization_id', organizationId)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  if (error) throw new Error(`Idempotency lookup error: ${error.message}`);
  if (!data) return null;
  return {
    invoiceRecordId: data.id,
    invoiceNo: data.invoice_no,
    total: Number(data.total),
    status: data.status
  };
}

export async function getInvoiceDetail(invoiceId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('invoices')
    .select('*, invoice_line_items(*)')
    .eq('id', invoiceId)
    .single();
  if (error) throw new Error(`Invoice not found (${invoiceId}): ${error.message}`);
  return normalizeInvoiceRow(data);
}

export async function deleteInvoice(invoiceId) {
  const supabase = getSupabaseClient();

  // Fetch invoice first for the response
  const invoice = await getInvoiceById(invoiceId);

  // Count line items before cascade delete
  const { count } = await supabase
    .from('invoice_line_items')
    .select('*', { count: 'exact', head: true })
    .eq('invoice_id', invoiceId);

  // Delete invoice — invoice_line_items cascade automatically
  const { error } = await supabase
    .from('invoices')
    .delete()
    .eq('id', invoiceId);

  if (error) throw new Error(`Failed to delete invoice: ${error.message}`);

  return {
    invoiceId: invoice.id,
    invoiceNo: invoice.invoiceNo,
    deletedLineItems: count || 0,
    pdfStoragePath: invoice.pdfStoragePath || null
  };
}

export async function updateInvoiceStatus(invoiceId, status) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('invoices')
    .update({ status })
    .eq('id', invoiceId)
    .select('*')
    .single();
  if (error) throw new Error(`Failed to update status: ${error.message}`);
  return normalizeInvoiceRow(data);
}

export async function createInvoice({ organizationId, clientId, invoiceDoc }) {
  const supabase = getSupabaseClient();

  const { data: invoiceRow, error: invError } = await supabase
    .from('invoices')
    .insert({
      organization_id: organizationId,
      invoice_no: invoiceDoc.invoiceNo,
      idempotency_key: invoiceDoc.idempotencyKey,
      invoice_type: invoiceDoc.invoiceType,
      show_quantity: invoiceDoc.showQuantity,
      include_due_date: invoiceDoc.includeDueDate,
      invoice_date: invoiceDoc.invoiceDate,
      due_date: invoiceDoc.dueDate || null,
      client_id: clientId || null,
      client_name: invoiceDoc.client.name,
      gstin: invoiceDoc.client.gstin,
      state: invoiceDoc.client.state,
      state_code: invoiceDoc.client.stateCode,
      place_of_supply: invoiceDoc.placeOfSupply,
      gst_type: invoiceDoc.gstType,
      amount: invoiceDoc.amount,
      cgst: invoiceDoc.cgst,
      sgst: invoiceDoc.sgst,
      igst: invoiceDoc.igst,
      total: invoiceDoc.total,
      sac: invoiceDoc.sac,
      reverse_charge: invoiceDoc.reverseCharge,
      status: 'generated',
      total_in_words: invoiceDoc.totalInWords,
      payment_terms_label: invoiceDoc.paymentTermsLabel || '',
      source_proforma_id: invoiceDoc.sourceProforma?.invoiceRecordId || null,
      source_proforma_no: invoiceDoc.sourceProforma?.invoiceNo || null,
      source_proforma_date: invoiceDoc.sourceProforma?.invoiceDate || null,
      purchase_order_number: invoiceDoc.purchaseOrder?.number || null,
      purchase_order_date: invoiceDoc.purchaseOrder?.date || null
    })
    .select()
    .single();

  if (invError) {
    if (invError.code === '23505') {
      throw new Error('Invoice already exists for this idempotency key.');
    }
    throw new Error(`Failed to create invoice: ${invError.message}`);
  }

  const lineItemRows = invoiceDoc.lineItems.map((li) => ({
    organization_id: organizationId,
    invoice_id: invoiceRow.id,
    line_number: li.lineNumber,
    description: li.description,
    sac: li.sac || '',
    quantity: li.quantity !== null && li.quantity !== undefined ? li.quantity : null,
    unit_price: li.unitPrice !== null && li.unitPrice !== undefined ? li.unitPrice : null,
    amount: li.amount,
    taxable_value: li.taxableValue || li.amount,
    cgst: li.cgst || 0,
    sgst: li.sgst || 0,
    igst: li.igst || 0,
    total: li.total || li.amount
  }));

  const { error: liError } = await supabase
    .from('invoice_line_items')
    .insert(lineItemRows);

  if (liError) throw new Error(`Failed to save line items: ${liError.message}`);

  // Enqueue background PDF generation job (best-effort — doesn't fail invoice creation)
  // Supabase v2 query builders are PromiseLike, not full Promises — use destructuring, not .catch()
  const { error: jobError } = await supabase
    .from('pdf_generation_jobs')
    .insert({ organization_id: organizationId, invoice_id: invoiceRow.id, status: 'pending' });
  if (jobError) {
    console.error('[Invoice] Failed to enqueue PDF job:', jobError.message);
  }

  return {
    invoiceNo: invoiceRow.invoice_no,
    invoiceRecordId: invoiceRow.id,
    total: Number(invoiceRow.total),
    status: invoiceRow.status
  };
}

export async function updateInvoice({ organizationId, invoiceId, clientId, invoiceDoc }) {
  const supabase = getSupabaseClient();

  const { data: invoiceRow, error: invError } = await supabase
    .from('invoices')
    .update({
      invoice_type: invoiceDoc.invoiceType,
      show_quantity: invoiceDoc.showQuantity,
      include_due_date: invoiceDoc.includeDueDate,
      invoice_date: invoiceDoc.invoiceDate,
      due_date: invoiceDoc.dueDate || null,
      client_id: clientId || null,
      client_name: invoiceDoc.client.name,
      gstin: invoiceDoc.client.gstin,
      state: invoiceDoc.client.state,
      state_code: invoiceDoc.client.stateCode,
      place_of_supply: invoiceDoc.placeOfSupply,
      gst_type: invoiceDoc.gstType,
      amount: invoiceDoc.amount,
      cgst: invoiceDoc.cgst,
      sgst: invoiceDoc.sgst,
      igst: invoiceDoc.igst,
      total: invoiceDoc.total,
      sac: invoiceDoc.sac,
      reverse_charge: invoiceDoc.reverseCharge,
      total_in_words: invoiceDoc.totalInWords,
      payment_terms_label: invoiceDoc.paymentTermsLabel || '',
      pdf_storage_path: null,
      pdf_generated_at: null
    })
    .eq('id', invoiceId)
    .select()
    .single();

  if (invError) {
    throw new Error(`Failed to update invoice: ${invError.message}`);
  }

  // Delete existing line items
  const { error: delError } = await supabase
    .from('invoice_line_items')
    .delete()
    .eq('invoice_id', invoiceId);

  if (delError) throw new Error(`Failed to update line items (delete step): ${delError.message}`);

  // Insert updated line items
  const lineItemRows = invoiceDoc.lineItems.map((li) => ({
    organization_id: organizationId,
    invoice_id: invoiceRow.id,
    line_number: li.lineNumber,
    description: li.description,
    sac: li.sac || '',
    quantity: li.quantity !== null && li.quantity !== undefined ? li.quantity : null,
    unit_price: li.unitPrice !== null && li.unitPrice !== undefined ? li.unitPrice : null,
    amount: li.amount,
    taxable_value: li.taxableValue || li.amount,
    cgst: li.cgst || 0,
    sgst: li.sgst || 0,
    igst: li.igst || 0,
    total: li.total || li.amount
  }));

  const { error: liError } = await supabase
    .from('invoice_line_items')
    .insert(lineItemRows);

  if (liError) throw new Error(`Failed to save updated line items: ${liError.message}`);

  // Enqueue background PDF generation job
  const { error: jobError } = await supabase
    .from('pdf_generation_jobs')
    .insert({ organization_id: organizationId, invoice_id: invoiceRow.id, status: 'pending' });
  if (jobError) {
    console.error('[Invoice] Failed to enqueue PDF job on update:', jobError.message);
  }

  return {
    invoiceNo: invoiceRow.invoice_no,
    invoiceRecordId: invoiceRow.id,
    total: Number(invoiceRow.total),
    status: invoiceRow.status
  };
}

