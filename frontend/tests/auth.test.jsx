import React from 'react';
import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthProvider, CartProvider, useAuth, useCart } from '../src/auth.jsx';
import api, { setTokenGetter } from '../src/api.js';
vi.mock('../src/api.js', () => ({ default: { get: vi.fn(), post: vi.fn() }, setTokenGetter: vi.fn() }));
const alice = { id: 'alice-test', fullName: 'Alice test', permissions: [] };
const bob = { id: 'bob-test', fullName: 'Bob test', permissions: [] };
function Probe() {
  const auth = useAuth(); const cart = useCart();
  return <><span>{auth.loading ? 'Loading' : auth.user?.id || 'Signed out'}</span><span>Cart: {cart.count}</span><button onClick={() => auth.login('alice-token', alice)}>Alice</button><button onClick={() => auth.login('bob-token', bob)}>Bob</button><button onClick={() => cart.addItem({id:'po-test',po_number:'TEST-ONLY'})}>Add order</button></>;
}
const mount = () => render(<AuthProvider><CartProvider><Probe /></CartProvider></AuthProvider>);
it('installs the new login token before requesting current account permissions', async () => {
  let getter;
  setTokenGetter.mockImplementation(fn => { getter = fn; });
  api.get.mockImplementation(async () => { expect(await getter()).toBe('alice-token'); return { data: { user: alice } }; });
  mount(); await screen.findByText('Signed out');
  fireEvent.click(screen.getByText('Alice'));
  await screen.findByText('alice-test');
  expect(api.get).toHaveBeenCalledWith('/auth/me');
});
it('keeps saved order carts separate when switching accounts', async () => {
  api.get.mockImplementation(async () => ({ data: { user: localStorage.getItem('poms_token') === 'alice-token' ? alice : bob } }));
  mount(); await screen.findByText('Signed out');
  fireEvent.click(screen.getByText('Alice')); await screen.findByText('alice-test');
  fireEvent.click(screen.getByText('Add order')); await screen.findByText('Cart: 1');
  fireEvent.click(screen.getByText('Bob')); await screen.findByText('bob-test');
  await waitFor(() => expect(screen.getByText('Cart: 0')).toBeTruthy());
  fireEvent.click(screen.getByText('Alice')); await screen.findByText('alice-test');
  await screen.findByText('Cart: 1');
});
