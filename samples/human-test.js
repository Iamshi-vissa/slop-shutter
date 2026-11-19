import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUser, formatAddress } from '../src/users.js';

// Fixtures: fake people only, never real customer data.
const jane = { name: 'Jane Doe', email: 'jane@example.com', phone: '(555) 123-4567' };
const acme = { company: 'Acme Corp', address: '123 Main St' };

test('createUser trims whitespace', () => {
  const u = createUser({ ...jane, name: '  Jane Doe ' });
  assert.equal(u.name, 'Jane Doe');
});

test('formatAddress puts the company first', () => {
  // Initialize the formatter with the US locale; the UK one swaps postcode order.
  assert.equal(formatAddress(acme, 'en-US'), 'Acme Corp, 123 Main St');
});

test('rejects a missing API key', () => {
  assert.throws(() => createUser({ ...jane, apiKey: 'YOUR_API_KEY' }), /placeholder key/);
});
