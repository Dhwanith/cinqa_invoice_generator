import { getSupabaseClient, getDefaultOrgId } from '../../lib/supabase.js';

function r2(v) { return Math.round((Number(v || 0) + Number.EPSILON) * 100) / 100; }

// ── Category → display label maps ────────────────────────────────────────────

const PURCHASE_CAT = {
  software: 'Software & Licenses', cloud: 'Cloud & Hosting', office: 'Office & Stationery',
  equipment: 'Equipment & Accessories', professional_services: 'Professional Services',
  travel: 'Travel & Accommodation', marketing: 'Marketing & Advertising',
  utilities: 'Utilities & Telecom', payroll_processing: 'Payroll Processing',
  bank_charges: 'Bank Charges', other: 'Other Expenses',
};

const REIMB_CAT = {
  travel: 'Travel & Accommodation', accommodation: 'Travel & Accommodation',
  meals: 'Meals & Entertainment', office_supplies: 'Office & Stationery',
  client_entertainment: 'Meals & Entertainment', software: 'Software & Licenses',
  equipment: 'Equipment & Accessories', telecom: 'Utilities & Telecom',
  medical: 'Other Expenses', other: 'Other Expenses',
};

function mergeByKey(target, source) {
  for (const [k, v] of Object.entries(source)) {
    target[k] = r2((target[k] || 0) + v);
  }
}

// ── Chart of Accounts ─────────────────────────────────────────────────────────

export async function listAccounts() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('organization_id', getDefaultOrgId())
    .eq('active', true)
    .order('sort_order');
  if (error) throw new Error(`Failed to list accounts: ${error.message}`);
  return data || [];
}

// ── Manual Journal Entries ────────────────────────────────────────────────────

export async function listJournalEntries({ dateFrom = '', dateTo = '' } = {}) {
  const supabase = getSupabaseClient();
  let query = supabase
    .from('journal_entries')
    .select(`*, journal_lines(*, account:accounts(id,code,name,type))`)
    .eq('organization_id', getDefaultOrgId())
    .eq('entry_type', 'manual')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });
  if (dateFrom) query = query.gte('date', dateFrom);
  if (dateTo) query = query.lte('date', dateTo);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to list journals: ${error.message}`);
  return data || [];
}

export async function createJournalEntry({ date, description, lines }) {
  const supabase = getSupabaseClient();
  const orgId = getDefaultOrgId();

  const totalDebit = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(`Journal entry does not balance: debits ₹${totalDebit.toFixed(2)} ≠ credits ₹${totalCredit.toFixed(2)}`);
  }

  const { data: entry, error: entryErr } = await supabase
    .from('journal_entries')
    .insert({ organization_id: orgId, date, description, entry_type: 'manual' })
    .select()
    .single();
  if (entryErr) throw new Error(`Failed to create journal: ${entryErr.message}`);

  const { error: linesErr } = await supabase.from('journal_lines').insert(
    lines.map((l) => ({
      journal_entry_id: entry.id,
      organization_id: orgId,
      account_id: l.accountId,
      debit: Number(l.debit || 0),
      credit: Number(l.credit || 0),
      description: l.description || '',
    }))
  );
  if (linesErr) throw new Error(`Failed to save lines: ${linesErr.message}`);
  return entry;
}

export async function deleteJournalEntry(id) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('journal_entries').delete().eq('id', id).eq('entry_type', 'manual');
  if (error) throw new Error(`Failed to delete journal: ${error.message}`);
}

// ── Bank Balance ──────────────────────────────────────────────────────────────

export async function getLatestBankBalance(asOfDate) {
  const supabase = getSupabaseClient();
  let query = supabase.from('bank_balances').select('*').eq('organization_id', getDefaultOrgId()).order('date', { ascending: false }).limit(1);
  if (asOfDate) query = query.lte('date', asOfDate);
  const { data } = await query.maybeSingle();
  return data || null;
}

export async function saveBankBalance({ date, balance, notes }) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from('bank_balances')
    .insert({ organization_id: getDefaultOrgId(), date, balance: Number(balance), notes: notes || '' })
    .select().single();
  if (error) throw new Error(`Failed to save bank balance: ${error.message}`);
  return data;
}

// ── Capital Entries ───────────────────────────────────────────────────────────

export async function getLatestCapitalEntry(asOfDate) {
  const supabase = getSupabaseClient();
  let query = supabase.from('capital_entries').select('*').eq('organization_id', getDefaultOrgId()).order('date', { ascending: false }).limit(1);
  if (asOfDate) query = query.lte('date', asOfDate);
  const { data } = await query.maybeSingle();
  return data || null;
}

export async function saveCapitalEntry({ date, openingBalance, drawings, notes }) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from('capital_entries')
    .insert({ organization_id: getDefaultOrgId(), date, opening_balance: Number(openingBalance || 0), drawings: Number(drawings || 0), notes: notes || '' })
    .select().single();
  if (error) throw new Error(`Failed to save capital entry: ${error.message}`);
  return data;
}

// ── Profit & Loss ─────────────────────────────────────────────────────────────

export async function computeProfitLoss({ dateFrom, dateTo }) {
  const supabase = getSupabaseClient();
  const orgId = getDefaultOrgId();

  const [
    { data: invoices },
    { data: purchases },
    { data: reimbursements },
    { data: journalEntries },
  ] = await Promise.all([
    supabase.from('invoices').select('amount,cgst,sgst,igst,total,invoice_no').eq('organization_id', orgId).eq('invoice_type', 'tax').neq('status', 'cancelled').gte('invoice_date', dateFrom).lte('invoice_date', dateTo),
    supabase.from('purchases').select('category,amount').eq('organization_id', orgId).neq('status', 'cancelled').gte('purchase_date', dateFrom).lte('purchase_date', dateTo),
    supabase.from('reimbursements').select('category,amount').eq('organization_id', orgId).in('status', ['approved', 'reimbursed']).gte('date', dateFrom).lte('date', dateTo),
    supabase.from('journal_entries').select(`date, journal_lines(debit, credit, account:accounts(type, sub_type, name))`).eq('organization_id', orgId).eq('entry_type', 'manual').gte('date', dateFrom).lte('date', dateTo),
  ]);

  // Revenue
  const revenue = r2((invoices || []).reduce((s, i) => s + Number(i.amount || 0), 0));
  const outputCgst = r2((invoices || []).reduce((s, i) => s + Number(i.cgst || 0), 0));
  const outputSgst = r2((invoices || []).reduce((s, i) => s + Number(i.sgst || 0), 0));
  const outputIgst = r2((invoices || []).reduce((s, i) => s + Number(i.igst || 0), 0));

  // Expenses from purchases
  const purchaseExpenses = {};
  for (const p of (purchases || [])) {
    const cat = PURCHASE_CAT[p.category] || 'Other Expenses';
    purchaseExpenses[cat] = r2((purchaseExpenses[cat] || 0) + Number(p.amount || 0));
  }

  // Expenses from reimbursements
  const reimbExpenses = {};
  for (const r of (reimbursements || [])) {
    const cat = REIMB_CAT[r.category] || 'Other Expenses';
    reimbExpenses[cat] = r2((reimbExpenses[cat] || 0) + Number(r.amount || 0));
  }

  // Manual journal adjustments
  const manualIncome = {};
  const manualExpenses = {};
  for (const je of (journalEntries || [])) {
    for (const line of (je.journal_lines || [])) {
      const acc = line.account;
      if (!acc) continue;
      if (acc.type === 'income') {
        manualIncome[acc.name] = r2((manualIncome[acc.name] || 0) + Number(line.credit || 0) - Number(line.debit || 0));
      } else if (acc.type === 'expense') {
        manualExpenses[acc.name] = r2((manualExpenses[acc.name] || 0) + Number(line.debit || 0) - Number(line.credit || 0));
      }
    }
  }

  // Consolidate expenses (all sources combined by label)
  const expenses = { ...purchaseExpenses };
  mergeByKey(expenses, reimbExpenses);
  for (const [k, v] of Object.entries(manualExpenses)) {
    if (v !== 0) expenses[k] = r2((expenses[k] || 0) + v);
  }

  // Remove zero/negative entries
  for (const k of Object.keys(expenses)) {
    if (expenses[k] <= 0) delete expenses[k];
  }

  const otherIncome = r2(Object.values(manualIncome).reduce((s, v) => s + v, 0));
  const totalRevenue = r2(revenue + otherIncome);
  const totalExpenses = r2(Object.values(expenses).reduce((s, v) => s + v, 0));
  const grossProfit = r2(totalRevenue - totalExpenses);

  return {
    period: { dateFrom, dateTo },
    invoiceCount: (invoices || []).length,
    revenue,
    otherIncome: Object.keys(manualIncome).length > 0 ? manualIncome : null,
    totalRevenue,
    outputGst: { cgst: outputCgst, sgst: outputSgst, igst: outputIgst, total: r2(outputCgst + outputSgst + outputIgst) },
    expenses,
    totalExpenses,
    grossProfit,
    ebitda: grossProfit,
    netProfit: grossProfit,
  };
}

// ── Balance Sheet ─────────────────────────────────────────────────────────────

export async function computeBalanceSheet({ asOfDate }) {
  const supabase = getSupabaseClient();
  const orgId = getDefaultOrgId();

  const [
    { data: unpaidInvoices },
    { data: unpaidPurchases },
    { data: eligiblePurchases },
    { data: approvedReimbs },
    bankRow,
    capitalRow,
    { data: latestGstr3b },
  ] = await Promise.all([
    supabase.from('invoices').select('total').eq('organization_id', orgId).eq('invoice_type', 'tax').not('status', 'in', '("paid","cancelled")').lte('invoice_date', asOfDate),
    supabase.from('purchases').select('total').eq('organization_id', orgId).not('status', 'in', '("paid","cancelled")').lte('purchase_date', asOfDate),
    supabase.from('purchases').select('cgst,sgst,igst,itc_type').eq('organization_id', orgId).eq('itc_eligible', true).neq('status', 'cancelled').lte('purchase_date', asOfDate),
    supabase.from('reimbursements').select('amount').eq('organization_id', orgId).eq('status', 'approved').lte('date', asOfDate),
    getLatestBankBalance(asOfDate),
    getLatestCapitalEntry(asOfDate),
    supabase.from('gstr3b_returns').select('net_igst_payable,net_cgst_payable,net_sgst_payable,period_label').eq('organization_id', orgId).lte('created_at', asOfDate + 'T23:59:59').order('created_at', { ascending: false }).limit(1),
  ]);

  const accountsReceivable = r2((unpaidInvoices || []).reduce((s, i) => s + Number(i.total || 0), 0));
  const accountsPayable = r2((unpaidPurchases || []).reduce((s, p) => s + Number(p.total || 0), 0));

  const multiplier = (type) => type === 'full' ? 1 : type === 'restricted' ? 0.5 : 0;
  const itcCgst = r2((eligiblePurchases || []).reduce((s, p) => s + Number(p.cgst || 0) * multiplier(p.itc_type), 0));
  const itcSgst = r2((eligiblePurchases || []).reduce((s, p) => s + Number(p.sgst || 0) * multiplier(p.itc_type), 0));
  const itcIgst = r2((eligiblePurchases || []).reduce((s, p) => s + Number(p.igst || 0) * multiplier(p.itc_type), 0));
  const itcTotal = r2(itcCgst + itcSgst + itcIgst);

  const reimbursementsPayable = r2((approvedReimbs || []).reduce((s, r) => s + Number(r.amount || 0), 0));

  const bankBalance = Number(bankRow?.balance || 0);
  const bankDate = bankRow?.date || null;

  const gst3b = latestGstr3b?.[0];
  const gstPayable = gst3b
    ? r2(Number(gst3b.net_igst_payable || 0) + Number(gst3b.net_cgst_payable || 0) + Number(gst3b.net_sgst_payable || 0))
    : null;
  const gstLabel = gst3b ? `GSTR-3B (${gst3b.period_label})` : null;

  const openingCapital = Number(capitalRow?.opening_balance || 0);
  const drawings = Number(capitalRow?.drawings || 0);

  const totalCurrentAssets = r2(bankBalance + accountsReceivable + itcTotal);
  const totalAssets = totalCurrentAssets;
  const totalLiabilities = r2(accountsPayable + (gstPayable || 0) + reimbursementsPayable);
  const plugCapital = r2(totalAssets - totalLiabilities);

  return {
    asOfDate,
    assets: { bankBalance, bankDate, accountsReceivable, itcCgst, itcSgst, itcIgst, itcTotal, totalCurrentAssets, totalAssets },
    liabilities: { accountsPayable, gstPayable, gstLabel, reimbursementsPayable, totalLiabilities },
    capital: { openingCapital, drawings, plugCapital },
    bankRowId: bankRow?.id || null,
    capitalRowId: capitalRow?.id || null,
  };
}

// ── Trial Balance ─────────────────────────────────────────────────────────────

export async function computeTrialBalance({ dateFrom, dateTo }) {
  const [pl, bs] = await Promise.all([
    computeProfitLoss({ dateFrom, dateTo }),
    computeBalanceSheet({ asOfDate: dateTo }),
  ]);

  const lines = [];

  // Income side (credits)
  lines.push({ code: '4100', name: 'Revenue from IT Services', type: 'income', debit: 0, credit: pl.revenue });
  if (pl.otherIncome) {
    for (const [name, val] of Object.entries(pl.otherIncome)) {
      if (val > 0) lines.push({ code: '4200', name, type: 'income', debit: 0, credit: val });
    }
  }

  // Expense side (debits)
  for (const [name, val] of Object.entries(pl.expenses)) {
    lines.push({ code: '5xxx', name, type: 'expense', debit: val, credit: 0 });
  }

  // Assets (debits)
  lines.push({ code: '1110', name: 'Bank - Axis Bank', type: 'asset', debit: bs.assets.bankBalance, credit: 0 });
  lines.push({ code: '1200', name: 'Accounts Receivable', type: 'asset', debit: bs.assets.accountsReceivable, credit: 0 });
  if (bs.assets.itcCgst > 0) lines.push({ code: '1210', name: 'ITC Receivable - CGST', type: 'asset', debit: bs.assets.itcCgst, credit: 0 });
  if (bs.assets.itcSgst > 0) lines.push({ code: '1211', name: 'ITC Receivable - SGST', type: 'asset', debit: bs.assets.itcSgst, credit: 0 });
  if (bs.assets.itcIgst > 0) lines.push({ code: '1212', name: 'ITC Receivable - IGST', type: 'asset', debit: bs.assets.itcIgst, credit: 0 });

  // Liabilities (credits)
  lines.push({ code: '2100', name: 'Accounts Payable', type: 'liability', debit: 0, credit: bs.liabilities.accountsPayable });
  if (bs.liabilities.gstPayable !== null) lines.push({ code: '2200', name: 'GST Payable', type: 'liability', debit: 0, credit: bs.liabilities.gstPayable });
  if (bs.liabilities.reimbursementsPayable > 0) lines.push({ code: '2500', name: 'Reimbursements Payable', type: 'liability', debit: 0, credit: bs.liabilities.reimbursementsPayable });

  // Partners' Capital (credit — plug to balance)
  lines.push({ code: '3100', name: "Partners' Capital", type: 'equity', debit: 0, credit: bs.capital.plugCapital });

  const totalDebit = r2(lines.reduce((s, l) => s + l.debit, 0));
  const totalCredit = r2(lines.reduce((s, l) => s + l.credit, 0));
  const difference = r2(totalDebit - totalCredit);
  const balanced = Math.abs(difference) < 1;

  return { period: { dateFrom, dateTo }, lines, totalDebit, totalCredit, difference, balanced };
}
