import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeClientRow } from '../src/repositories/supabase/client-repository.js';

test('normalizeClientRow maps snake_case columns to camelCase client object', () => {
  const row = {
    id: 'uuid-1',
    name: 'Test Corp',
    gstin: '24AAVCA3793L1ZY',
    state: 'Gujarat',
    state_code: 24,
    address_line_1: 'Line 1',
    address_line_2: 'Line 2',
    address_line_3: '',
    default_sac: '998314',
    default_payment_terms_days: 30,
    email: 'test@example.com',
    phone: '9876543210',
    active: true,
    notes: 'A note'
  };

  const client = normalizeClientRow(row);

  assert.equal(client.id, 'uuid-1');
  assert.equal(client.stateCode, 24);
  assert.deepEqual(client.addressLines, ['Line 1', 'Line 2']);
  assert.equal(client.defaultSac, '998314');
  assert.equal(client.defaultPaymentTermsDays, 30);
  assert.equal(client.active, true);
});

test('normalizeClientRow filters empty address lines', () => {
  const row = {
    id: 'uuid-2', name: 'X', gstin: 'G', state: 'S', state_code: 1,
    address_line_1: 'Only line', address_line_2: '', address_line_3: '',
    default_sac: '', default_payment_terms_days: 10,
    email: '', phone: '', active: false, notes: ''
  };

  const client = normalizeClientRow(row);
  assert.deepEqual(client.addressLines, ['Only line']);
  assert.equal(client.active, false);
});

test('normalizeClientRow treats null/undefined active as false', () => {
  const base = { id: 'x', name: 'X', gstin: 'G', state: 'S', state_code: 1,
    address_line_1: '', address_line_2: '', address_line_3: '',
    default_sac: '', default_payment_terms_days: 10, email: '', phone: '', notes: '' };

  assert.equal(normalizeClientRow({ ...base, active: null }).active, false);
  assert.equal(normalizeClientRow({ ...base, active: undefined }).active, false);
  assert.equal(normalizeClientRow({ ...base, active: false }).active, false);
  assert.equal(normalizeClientRow({ ...base, active: true }).active, true);
});
