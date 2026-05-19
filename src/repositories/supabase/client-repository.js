import { getSupabaseClient, getDefaultOrgId } from '../../lib/supabase.js';

export function normalizeClientRow(row) {
  return {
    id: row.id,
    name: row.name,
    gstin: row.gstin,
    state: row.state,
    stateCode: row.state_code,
    addressLines: [row.address_line_1, row.address_line_2, row.address_line_3].filter(Boolean),
    defaultSac: row.default_sac || '',
    defaultPaymentTermsDays: row.default_payment_terms_days || 10,
    email: row.email || '',
    phone: row.phone || '',
    active: Boolean(row.active),
    notes: row.notes || ''
  };
}

export async function queryClients({ search = '', active = 'all' } = {}) {
  const supabase = getSupabaseClient();
  const orgId = getDefaultOrgId();

  let query = supabase
    .from('clients')
    .select('*')
    .eq('organization_id', orgId)
    .order('name')
    .limit(100);

  if (search) {
    query = query.or(`name.ilike.%${search}%,gstin.ilike.%${search}%`);
  }

  if (active === 'active') query = query.eq('active', true);
  if (active === 'inactive') query = query.eq('active', false);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list clients: ${error.message}`);
  return (data || []).map(normalizeClientRow);
}

export async function getClientById(clientId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .single();
  if (error) throw new Error(`Client not found (${clientId}): ${error.message}`);
  return normalizeClientRow(data);
}

export async function getClientByGstin(gstin) {
  const supabase = getSupabaseClient();
  const orgId = getDefaultOrgId();
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('organization_id', orgId)
    .eq('gstin', gstin)
    .maybeSingle();
  if (error) throw new Error(`Client lookup error: ${error.message}`);
  return data ? normalizeClientRow(data) : null;
}

export async function createClientRecord(client) {
  const supabase = getSupabaseClient();
  const orgId = getDefaultOrgId();
  const { data, error } = await supabase
    .from('clients')
    .insert({
      organization_id: orgId,
      name: client.name,
      gstin: client.gstin,
      state: client.state,
      state_code: client.stateCode,
      address_line_1: client.addressLine1 || '',
      address_line_2: client.addressLine2 || '',
      address_line_3: client.addressLine3 || '',
      default_sac: client.defaultSac || '',
      default_payment_terms_days: client.defaultPaymentTermsDays || 10,
      email: client.email || '',
      phone: client.phone || '',
      notes: client.notes || '',
      active: client.active !== false
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to create client: ${error.message}`);
  return normalizeClientRow(data);
}

export async function updateClientRecord(clientId, client) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('clients')
    .update({
      name: client.name,
      gstin: client.gstin,
      state: client.state,
      state_code: client.stateCode,
      address_line_1: client.addressLine1 || '',
      address_line_2: client.addressLine2 || '',
      address_line_3: client.addressLine3 || '',
      default_sac: client.defaultSac || '',
      default_payment_terms_days: client.defaultPaymentTermsDays || 10,
      email: client.email || '',
      phone: client.phone || '',
      notes: client.notes || '',
      active: client.active !== false
    })
    .eq('id', clientId)
    .select()
    .single();
  if (error) throw new Error(`Failed to update client: ${error.message}`);
  return normalizeClientRow(data);
}
