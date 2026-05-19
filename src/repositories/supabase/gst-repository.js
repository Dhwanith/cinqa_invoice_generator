import { getSupabaseClient, getDefaultOrgId } from '../../lib/supabase.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function r2(v) { return Math.round((Number(v) + Number.EPSILON) * 100) / 100; }

function periodToDateRange(financialYear, month) {
  const [fyStart] = financialYear.split('-').map((y) => 2000 + parseInt(y, 10));
  const calYear = month >= 4 ? fyStart : fyStart + 1;
  const monthStr = String(month).padStart(2, '0');
  const lastDay = new Date(calYear, month, 0).getDate();
  return {
    from: `${calYear}-${monthStr}-01`,
    to:   `${calYear}-${monthStr}-${String(lastDay).padStart(2, '0')}`,
  };
}

function normalizeInvoiceNo(inv) {
  return String(inv || '').toLowerCase().trim().replace(/\s+/g, '');
}

// ── GSTR-2B import ───────────────────────────────────────────────────────────

export async function createGstr2bImport({ financialYear, month, periodLabel, filename, records }) {
  const supabase = getSupabaseClient();
  const orgId = getDefaultOrgId();

  // Create import run
  const { data: importRow, error: importErr } = await supabase
    .from('gstr2b_imports')
    .insert({
      organization_id: orgId,
      financial_year: financialYear,
      month,
      period_label: periodLabel,
      filename: filename || '',
      status: 'imported',
      total_records: records.length,
      total_itc_igst: records.reduce((s, r) => s + r2(r.igst), 0),
      total_itc_cgst: records.reduce((s, r) => s + r2(r.cgst), 0),
      total_itc_sgst: records.reduce((s, r) => s + r2(r.sgst), 0),
    })
    .select()
    .single();

  if (importErr) throw new Error(`Failed to create import: ${importErr.message}`);

  // Insert records
  const recordRows = records.map((r) => ({
    import_id: importRow.id,
    organization_id: orgId,
    supplier_gstin: r.supplierGstin || '',
    supplier_name: r.supplierName || '',
    invoice_no: r.invoiceNo || '',
    invoice_type: r.invoiceType || 'Regular',
    invoice_date: r.invoiceDate || null,
    invoice_value: r2(r.invoiceValue),
    place_of_supply: r.placeOfSupply || '',
    reverse_charge: r.reverseCharge || 'N',
    taxable_amount: r2(r.taxableAmount),
    igst: r2(r.igst),
    cgst: r2(r.cgst),
    sgst: r2(r.sgst),
    cess: r2(r.cess),
    itc_available: r.itcAvailable || 'Yes',
    reason: r.reason || '',
    filing_period: r.filingPeriod || '',
    reconciliation_status: 'unmatched',
  }));

  const { error: recErr } = await supabase.from('gstr2b_records').insert(recordRows);
  if (recErr) throw new Error(`Failed to insert records: ${recErr.message}`);

  // Run reconciliation immediately
  await runReconciliation(importRow.id, orgId);

  // Reload with updated stats
  const { data: updated } = await supabase.from('gstr2b_imports').select('*').eq('id', importRow.id).single();
  return updated;
}

async function runReconciliation(importId, orgId) {
  const supabase = getSupabaseClient();

  const [{ data: gstr2bRecords }, { data: purchases }] = await Promise.all([
    supabase.from('gstr2b_records').select('id, supplier_gstin, invoice_no, igst, cgst, sgst').eq('import_id', importId),
    supabase.from('purchases').select('id, vendor_gstin, purchase_number, igst, cgst, sgst').eq('organization_id', orgId).not('vendor_gstin', 'is', null),
  ]);

  // Build lookup: normalised gstin|invoice_no → purchase
  const purchaseMap = new Map();
  for (const p of (purchases || [])) {
    if (p.vendor_gstin && p.purchase_number) {
      const key = `${p.vendor_gstin.toLowerCase()}|${normalizeInvoiceNo(p.purchase_number)}`;
      purchaseMap.set(key, p);
    }
  }

  let matchedCount = 0;
  for (const rec of (gstr2bRecords || [])) {
    const key = `${rec.supplier_gstin.toLowerCase()}|${normalizeInvoiceNo(rec.invoice_no)}`;
    const purchase = purchaseMap.get(key);
    let status = 'unmatched';
    let matchedId = null;

    if (purchase) {
      const gstTotal = r2(rec.igst) + r2(rec.cgst) + r2(rec.sgst);
      const purTotal = r2(purchase.igst) + r2(purchase.cgst) + r2(purchase.sgst);
      status = Math.abs(gstTotal - purTotal) < 1 ? 'matched' : 'amount_mismatch';
      matchedId = purchase.id;
      if (status === 'matched') matchedCount++;
    }

    await supabase.from('gstr2b_records')
      .update({ reconciliation_status: status, matched_purchase_id: matchedId })
      .eq('id', rec.id);
  }

  await supabase.from('gstr2b_imports')
    .update({ status: 'reconciled', matched_records: matchedCount })
    .eq('id', importId);
}

export async function listGstr2bImports() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('gstr2b_imports')
    .select('*')
    .eq('organization_id', getDefaultOrgId())
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to list imports: ${error.message}`);
  return data || [];
}

export async function getGstr2bRecords(importId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('gstr2b_records')
    .select('*')
    .eq('import_id', importId)
    .order('supplier_name');
  if (error) throw new Error(`Failed to get records: ${error.message}`);
  return data || [];
}

export async function getBooksOnlyForImport(importId) {
  const supabase = getSupabaseClient();
  const orgId = getDefaultOrgId();

  // Get all supplier GSTINs in this import
  const { data: importRecords } = await supabase
    .from('gstr2b_records')
    .select('supplier_gstin, invoice_no')
    .eq('import_id', importId);

  const gstr2bKeys = new Set(
    (importRecords || []).map((r) => `${r.supplier_gstin.toLowerCase()}|${normalizeInvoiceNo(r.invoice_no)}`)
  );

  // Get purchases with vendor GSTIN that don't have a match in this import
  const { data: purchases } = await supabase
    .from('purchases')
    .select('*')
    .eq('organization_id', orgId)
    .not('vendor_gstin', 'is', null)
    .neq('status', 'cancelled');

  return (purchases || []).filter((p) => {
    if (!p.vendor_gstin || !p.purchase_number) return false;
    const key = `${p.vendor_gstin.toLowerCase()}|${normalizeInvoiceNo(p.purchase_number)}`;
    return !gstr2bKeys.has(key);
  });
}

export async function manualMatchRecord(recordId, purchaseId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('gstr2b_records')
    .update({ reconciliation_status: 'manually_matched', matched_purchase_id: purchaseId })
    .eq('id', recordId)
    .select()
    .single();
  if (error) throw new Error(`Failed to match record: ${error.message}`);
  return data;
}

// ── GSTR-3B ──────────────────────────────────────────────────────────────────

export async function computeGstr3bData(financialYear, month) {
  const supabase = getSupabaseClient();
  const orgId = getDefaultOrgId();
  const { from, to } = periodToDateRange(financialYear, month);

  const [{ data: invoices }, { data: purchases }, { data: reimbursements }] = await Promise.all([
    supabase.from('invoices').select('invoice_type, amount, cgst, sgst, igst, is_rcm').eq('organization_id', orgId).gte('invoice_date', from).lte('invoice_date', to).neq('status', 'cancelled'),
    supabase.from('purchases').select('amount, cgst, sgst, igst, itc_eligible, itc_type, is_rcm').eq('organization_id', orgId).gte('purchase_date', from).lte('purchase_date', to).neq('status', 'cancelled'),
    supabase.from('reimbursements').select('gst_amount, itc_eligible').eq('organization_id', orgId).gte('date', from).lte('date', to).neq('status', 'rejected'),
  ]);

  // 3.1(a) — Outward taxable supplies (tax invoices only)
  const outward = (invoices || []).filter((i) => i.invoice_type === 'tax' && !i.is_rcm)
    .reduce((acc, i) => ({
      taxableValue: r2(acc.taxableValue + Number(i.amount || 0)),
      igst:  r2(acc.igst  + Number(i.igst  || 0)),
      cgst:  r2(acc.cgst  + Number(i.cgst  || 0)),
      sgst:  r2(acc.sgst  + Number(i.sgst  || 0)),
    }), { taxableValue: 0, igst: 0, cgst: 0, sgst: 0 });

  // 3.1(d) — RCM inward
  const rcm = (purchases || []).filter((p) => p.is_rcm)
    .reduce((acc, p) => ({
      taxableValue: r2(acc.taxableValue + Number(p.amount || 0)),
      igst: r2(acc.igst + Number(p.igst || 0)),
      cgst: r2(acc.cgst + Number(p.cgst || 0)),
      sgst: r2(acc.sgst + Number(p.sgst || 0)),
    }), { taxableValue: 0, igst: 0, cgst: 0, sgst: 0 });

  // 4A(5) — ITC from eligible purchases (full)
  const itcFull = (purchases || []).filter((p) => p.itc_eligible && p.itc_type === 'full' && !p.is_rcm)
    .reduce((acc, p) => ({ igst: r2(acc.igst + Number(p.igst || 0)), cgst: r2(acc.cgst + Number(p.cgst || 0)), sgst: r2(acc.sgst + Number(p.sgst || 0)) }), { igst: 0, cgst: 0, sgst: 0 });

  // 4B ITC reversed (restricted: 50%, blocked: 100% reversed)
  const itcRestricted = (purchases || []).filter((p) => p.itc_eligible && p.itc_type === 'restricted' && !p.is_rcm)
    .reduce((acc, p) => ({ igst: r2(acc.igst + Number(p.igst || 0) * 0.5), cgst: r2(acc.cgst + Number(p.cgst || 0) * 0.5), sgst: r2(acc.sgst + Number(p.sgst || 0) * 0.5) }), { igst: 0, cgst: 0, sgst: 0 });

  // ITC from reimbursements (split as CGST+SGST intra-state assumption)
  const reimbItcTotal = (reimbursements || []).filter((r) => r.itc_eligible)
    .reduce((s, r) => s + Number(r.gst_amount || 0), 0);
  const reimbItcHalf = r2(reimbItcTotal / 2);

  // 4A total available ITC (full purchases + reimb)
  const itcAvailable = {
    igst: r2(itcFull.igst),
    cgst: r2(itcFull.cgst + reimbItcHalf),
    sgst: r2(itcFull.sgst + reimbItcHalf),
  };

  // 4B reversed
  const itcReversed = itcRestricted;

  // 4C net ITC
  const netItc = {
    igst: r2(itcAvailable.igst - itcReversed.igst),
    cgst: r2(itcAvailable.cgst - itcReversed.cgst),
    sgst: r2(itcAvailable.sgst - itcReversed.sgst),
  };

  // 6.1 Net payable
  const netPayable = {
    igst: r2(Math.max(0, outward.igst + rcm.igst - netItc.igst)),
    cgst: r2(Math.max(0, outward.cgst + rcm.cgst - netItc.cgst)),
    sgst: r2(Math.max(0, outward.sgst + rcm.sgst - netItc.sgst)),
  };

  return {
    period: { financialYear, month, from, to },
    outward, rcm,
    itcAvailable, itcReversed, netItc,
    netPayable,
    reimbursementItc: reimbItcTotal,
    invoiceCount:     (invoices || []).filter((i) => i.invoice_type === 'tax').length,
    purchaseCount:    (purchases || []).length,
  };
}

export async function saveGstr3bReturn({ financialYear, month, periodLabel, computed, manualAdjustments, notes }) {
  const supabase = getSupabaseClient();
  const orgId = getDefaultOrgId();
  const c = computed;

  const payload = {
    organization_id: orgId,
    financial_year: financialYear,
    month,
    period_label: periodLabel,
    status: 'saved',
    outward_taxable_value: c.outward.taxableValue,
    outward_igst: c.outward.igst,
    outward_cgst: c.outward.cgst,
    outward_sgst: c.outward.sgst,
    rcm_taxable_value: c.rcm.taxableValue,
    rcm_igst: c.rcm.igst,
    rcm_cgst: c.rcm.cgst,
    rcm_sgst: c.rcm.sgst,
    itc_igst: c.itcAvailable.igst,
    itc_cgst: c.itcAvailable.cgst,
    itc_sgst: c.itcAvailable.sgst,
    itc_reversed_igst: c.itcReversed.igst,
    itc_reversed_cgst: c.itcReversed.cgst,
    itc_reversed_sgst: c.itcReversed.sgst,
    net_itc_igst: c.netItc.igst,
    net_itc_cgst: c.netItc.cgst,
    net_itc_sgst: c.netItc.sgst,
    net_igst_payable: c.netPayable.igst,
    net_cgst_payable: c.netPayable.cgst,
    net_sgst_payable: c.netPayable.sgst,
    manual_adjustments: manualAdjustments || null,
    notes: notes || '',
  };

  const { data, error } = await supabase
    .from('gstr3b_returns')
    .upsert(payload, { onConflict: 'organization_id,financial_year,month' })
    .select()
    .single();

  if (error) throw new Error(`Failed to save GSTR-3B: ${error.message}`);
  return data;
}

export async function markGstr3bFiled(id, { filedDate, filedReference }) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('gstr3b_returns')
    .update({ status: 'filed', filed_date: filedDate, filed_reference: filedReference })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(`Failed to mark filed: ${error.message}`);
  return data;
}

export async function listGstr3bReturns() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('gstr3b_returns')
    .select('*')
    .eq('organization_id', getDefaultOrgId())
    .order('financial_year', { ascending: false })
    .order('month', { ascending: false });
  if (error) throw new Error(`Failed to list returns: ${error.message}`);
  return data || [];
}

export async function getGstSummary(financialYear) {
  const supabase = getSupabaseClient();
  const orgId = getDefaultOrgId();

  const [{ data: returns }, { data: imports }] = await Promise.all([
    supabase.from('gstr3b_returns').select('*').eq('organization_id', orgId).eq('financial_year', financialYear).order('month'),
    supabase.from('gstr2b_imports').select('*').eq('organization_id', orgId).eq('financial_year', financialYear).order('month'),
  ]);

  return { returns: returns || [], imports: imports || [] };
}
