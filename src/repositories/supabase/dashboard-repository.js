import { getSupabaseClient, getDefaultOrgId } from '../../lib/supabase.js';

function r2(v) { return Math.round((Number(v || 0) + Number.EPSILON) * 100) / 100; }
const mul = (type) => type === 'full' ? 1 : type === 'restricted' ? 0.5 : 0;

export async function computeDashboardSummary({ dateFrom, dateTo }) {
  const supabase = getSupabaseClient();
  const orgId = getDefaultOrgId();

  const [
    { data: periodInvoices },
    { data: periodPurchases },
    { data: periodReimbs },
    { data: unpaidInvoices },
    { data: unpaidPurchases },
    { data: pendingReimbs },
    { data: allItcPurchases },
    bankRow,
    gstRow,
    { data: recentInvoices },
    { data: recentPurchases },
    { data: employees },
  ] = await Promise.all([
    // Revenue for period (tax invoices, not cancelled)
    supabase.from('invoices').select('amount, total').eq('organization_id', orgId).eq('invoice_type', 'tax').neq('status', 'cancelled').gte('invoice_date', dateFrom).lte('invoice_date', dateTo),

    // Purchase expenses for period
    supabase.from('purchases').select('amount').eq('organization_id', orgId).neq('status', 'cancelled').gte('purchase_date', dateFrom).lte('purchase_date', dateTo),

    // Reimbursement expenses for period
    supabase.from('reimbursements').select('amount').eq('organization_id', orgId).in('status', ['approved', 'reimbursed']).gte('date', dateFrom).lte('date', dateTo),

    // All-time outstanding AR
    supabase.from('invoices').select('id,invoice_no,client_name,total,invoice_date,status').eq('organization_id', orgId).eq('invoice_type', 'tax').not('status', 'in', '("paid","cancelled")').order('invoice_date', { ascending: false }).limit(100),

    // All-time outstanding AP
    supabase.from('purchases').select('id,vendor_name,purchase_number,total,purchase_date,status').eq('organization_id', orgId).not('status', 'in', '("paid","cancelled")').order('purchase_date', { ascending: false }).limit(100),

    // Pending reimbursements
    supabase.from('reimbursements').select('id,paid_by,description,amount,date').eq('organization_id', orgId).eq('status', 'pending').order('date', { ascending: false }).limit(20),

    // ITC balance (all eligible purchases)
    supabase.from('purchases').select('cgst,sgst,igst,itc_type').eq('organization_id', orgId).eq('itc_eligible', true).neq('status', 'cancelled'),

    // Latest bank balance
    supabase.from('bank_balances').select('balance,date').eq('organization_id', orgId).order('date', { ascending: false }).limit(1).maybeSingle(),

    // Latest GSTR-3B return
    supabase.from('gstr3b_returns').select('status,period_label,filed_date,net_igst_payable,net_cgst_payable,net_sgst_payable,financial_year,month').eq('organization_id', orgId).order('year', { ascending: false }).order('month', { ascending: false }).limit(1).maybeSingle(),

    // Recent invoices (last 5 for dashboard activity)
    supabase.from('invoices').select('id,invoice_no,client_name,total,invoice_date,status,invoice_type').eq('organization_id', orgId).neq('status', 'cancelled').order('created_at', { ascending: false }).limit(5),

    // Recent purchases (last 5)
    supabase.from('purchases').select('id,vendor_name,purchase_number,total,purchase_date,status,category').eq('organization_id', orgId).neq('status', 'cancelled').order('created_at', { ascending: false }).limit(5),

    // Active employee count
    supabase.from('employees').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('active', true),
  ]);

  const revenue   = r2((periodInvoices  || []).reduce((s, i) => s + Number(i.amount || 0), 0));
  const purchases = r2((periodPurchases || []).reduce((s, p) => s + Number(p.amount || 0), 0));
  const reimbursements = r2((periodReimbs || []).reduce((s, r) => s + Number(r.amount || 0), 0));
  const totalExpenses = r2(purchases + reimbursements);
  const netProfit = r2(revenue - totalExpenses);

  const arTotal = r2((unpaidInvoices   || []).reduce((s, i) => s + Number(i.total || 0), 0));
  const apTotal = r2((unpaidPurchases  || []).reduce((s, p) => s + Number(p.total || 0), 0));
  const pendingReimbTotal = r2((pendingReimbs || []).reduce((s, r) => s + Number(r.amount || 0), 0));

  const itcTotal = r2((allItcPurchases || []).reduce((s, p) =>
    s + (Number(p.cgst || 0) + Number(p.sgst || 0) + Number(p.igst || 0)) * mul(p.itc_type), 0));

  const gst = gstRow.data;
  const gstPayable = gst ? r2(Number(gst.net_igst_payable || 0) + Number(gst.net_cgst_payable || 0) + Number(gst.net_sgst_payable || 0)) : null;

  return {
    period: { dateFrom, dateTo },
    revenue, purchases, reimbursements, totalExpenses, netProfit,
    outstandingAR: arTotal,
    outstandingAP: apTotal,
    pendingReimbursements: pendingReimbTotal,
    itcBalance: itcTotal,
    bankBalance: bankRow.data ? Number(bankRow.data.balance) : null,
    bankDate: bankRow.data?.date || null,
    gstPayable,
    latestGstr3b: gst ? { status: gst.status, periodLabel: gst.period_label, filedDate: gst.filed_date } : null,
    counts: {
      unpaidInvoices: (unpaidInvoices || []).length,
      unpaidPurchases: (unpaidPurchases || []).length,
      pendingReimbs: (pendingReimbs || []).length,
      invoiceCount: (periodInvoices || []).length,
      activeEmployees: employees?.length || 0,
    },
    recent: {
      invoices: (recentInvoices || []).map((i) => ({
        id: i.id,
        invoiceNo: i.invoice_no,
        clientName: i.client_name,
        total: Number(i.total || 0),
        invoiceDate: i.invoice_date,
        status: i.status,
        invoiceType: i.invoice_type,
      })),
      purchases: (recentPurchases || []).map((p) => ({
        id: p.id,
        vendorName: p.vendor_name,
        purchaseNumber: p.purchase_number,
        total: Number(p.total || 0),
        purchaseDate: p.purchase_date,
        status: p.status,
        category: p.category,
      })),
      pendingReimbs: (pendingReimbs || []).slice(0, 5).map((r) => ({
        id: r.id,
        paidBy: r.paid_by,
        description: r.description,
        amount: Number(r.amount || 0),
        date: r.date,
      })),
    },
  };
}
