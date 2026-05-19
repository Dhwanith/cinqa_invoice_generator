import { getSupabaseClient, getDefaultOrgId } from '../../lib/supabase.js';

export function normalizeVendorRow(row) {
  return {
    id: row.id,
    name: row.name,
    gstin: row.gstin || '',
    state: row.state,
    stateCode: row.state_code,
    addressLines: [row.address_line_1, row.address_line_2, row.address_line_3].filter(Boolean),
    category: row.category || 'other',
    defaultPaymentTermsDays: row.default_payment_terms_days || 30,
    email: row.email || '',
    phone: row.phone || '',
    notes: row.notes || '',
    active: Boolean(row.active)
  };
}

export async function listVendors({ search = '', active = 'all', category = '' } = {}) {
  const supabase = getSupabaseClient();
  const orgId = getDefaultOrgId();

  let query = supabase
    .from('vendors')
    .select('*')
    .eq('organization_id', orgId)
    .order('name')
    .limit(200);

  if (search) query = query.or(`name.ilike.%${search}%,gstin.ilike.%${search}%`);
  if (active === 'active')   query = query.eq('active', true);
  if (active === 'inactive') query = query.eq('active', false);
  if (category && category !== 'all') query = query.eq('category', category);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list vendors: ${error.message}`);
  return (data || []).map(normalizeVendorRow);
}

export async function getVendorById(vendorId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('vendors')
    .select('*')
    .eq('id', vendorId)
    .single();
  if (error) throw new Error(`Vendor not found (${vendorId}): ${error.message}`);
  return normalizeVendorRow(data);
}

export async function getVendorByGstin(gstin) {
  const supabase = getSupabaseClient();
  const orgId = getDefaultOrgId();
  const { data, error } = await supabase
    .from('vendors')
    .select('*')
    .eq('organization_id', orgId)
    .eq('gstin', gstin)
    .maybeSingle();
  if (error) throw new Error(`Vendor lookup error: ${error.message}`);
  return data ? normalizeVendorRow(data) : null;
}

export async function createVendorRecord(vendor) {
  const supabase = getSupabaseClient();
  const orgId = getDefaultOrgId();
  const { data, error } = await supabase
    .from('vendors')
    .insert({
      organization_id: orgId,
      name: vendor.name,
      gstin: vendor.gstin || null,
      state: vendor.state || '',
      state_code: vendor.stateCode || 0,
      address_line_1: vendor.addressLine1 || '',
      address_line_2: vendor.addressLine2 || '',
      address_line_3: vendor.addressLine3 || '',
      category: vendor.category || 'other',
      default_payment_terms_days: vendor.defaultPaymentTermsDays || 30,
      email: vendor.email || '',
      phone: vendor.phone || '',
      notes: vendor.notes || '',
      active: vendor.active !== false
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to create vendor: ${error.message}`);
  return normalizeVendorRow(data);
}

export async function updateVendorRecord(vendorId, vendor) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('vendors')
    .update({
      name: vendor.name,
      gstin: vendor.gstin || null,
      state: vendor.state || '',
      state_code: vendor.stateCode || 0,
      address_line_1: vendor.addressLine1 || '',
      address_line_2: vendor.addressLine2 || '',
      address_line_3: vendor.addressLine3 || '',
      category: vendor.category || 'other',
      default_payment_terms_days: vendor.defaultPaymentTermsDays || 30,
      email: vendor.email || '',
      phone: vendor.phone || '',
      notes: vendor.notes || '',
      active: vendor.active !== false
    })
    .eq('id', vendorId)
    .select()
    .single();
  if (error) throw new Error(`Failed to update vendor: ${error.message}`);
  return normalizeVendorRow(data);
}
