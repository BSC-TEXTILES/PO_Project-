import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import Login from '../src/pages/Login.jsx';
import SignUp from '../src/pages/SignUp.jsx';
import Modal from '../src/components/Modal.jsx';
import Sidebar from '../src/components/Sidebar.jsx';
import Products from '../src/pages/Products.jsx';
import api from '../src/api.js';
const auth = vi.hoisted(() => ({ user: { id: 'test-only', roles: [], permissions: ['po.view'], isSuperAdmin: false }, login: vi.fn(), isSignedIn: false }));
vi.mock('../src/auth.jsx', () => ({ useAuth: () => auth }));
vi.mock('../src/api.js', () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() }, errMessage: e => e.message, assetUrl: u => u }));
const mount = node => render(<MemoryRouter>{node}</MemoryRouter>);
beforeEach(() => { api.get.mockResolvedValue({ data: { data: [], total: 0 } }); auth.user.permissions = ['po.view']; });

describe('sign-in', () => {
  it('labels credentials, toggles visibility and explains recovery without exposing demo credentials', async () => {
    mount(<Login />);
    expect(screen.queryByText(/Demo Accounts/)).toBeNull();
    const password = screen.getByLabelText(/^Password/);
    expect(password.type).toBe('password');
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password.type).toBe('text');
    await userEvent.click(screen.getByRole('button', { name: 'Need help?' }));
    expect(screen.getByRole('status').textContent).toMatch(/administrator/);
  });
  it('prevents simultaneous submissions and exposes API failure', async () => {
    let reject;
    api.post.mockImplementation(() => new Promise((_, r) => { reject = r; }));
    mount(<Login />);
    fireEvent.change(screen.getByLabelText('Work email'), { target: { value: 'test@example.invalid' } });
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'test-only' } });
    const form = screen.getByRole('button', { name: 'Sign in' }).closest('form');
    fireEvent.submit(form); fireEvent.submit(form);
    expect(api.post).toHaveBeenCalledTimes(1);
    reject(new Error('Service unavailable'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Service unavailable'));
    expect(screen.getByRole('button', { name: 'Sign in' }).disabled).toBe(false);
  });
  it('preserves the MFA challenge and sanitizes code entry', async () => {
    api.post.mockResolvedValue({ data: { mfaRequired: true, userId: 'mfa-test' } });
    mount(<Login />);
    fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }).closest('form'));
    const code = await screen.findByLabelText('Authentication code');
    fireEvent.change(code, { target: { value: '12a34b' } });
    expect(code.value).toBe('1234');
    expect(auth.login).not.toHaveBeenCalled();
  });
});

it('registration success cannot be mistaken for a failed login or resubmitted', async () => {
  api.post.mockResolvedValue({ data: {} });
  mount(<SignUp />);
  fireEvent.submit(screen.getByRole('button', { name: 'Create Account' }).closest('form'));
  expect(await screen.findByRole('heading', { name: 'Account created' })).toBeTruthy();
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: 'Create Account' })).toBeNull();
});

it('dialog has an accessible name, supports cancellation, and restores trigger focus', () => {
  const close = vi.fn();
  const trigger = document.createElement('button'); document.body.append(trigger); trigger.focus();
  const { unmount } = render(<Modal title="Edit product" onClose={close}><input aria-label="Product name" /></Modal>);
  const dialog = screen.getByRole('dialog', { name: 'Edit product' });
  fireEvent(dialog, new Event('cancel', { bubbles: false, cancelable: true }));
  expect(close).toHaveBeenCalledTimes(1);
  unmount(); expect(document.activeElement).toBe(trigger); trigger.remove();
});

it('busy dialogs cannot be dismissed during an operation', () => {
  const close = vi.fn();
  render(<Modal title="Saving" busy onClose={close}>Saving record</Modal>);
  const dialog = screen.getByRole('dialog', { name: 'Saving' });
  fireEvent(dialog, new Event('cancel', { cancelable: true }));
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Close dialog' }).disabled).toBe(true);
});

it('navigation shows permitted modules and filters their names', async () => {
  mount(<Sidebar collapsed={false} onToggle={() => {}} onCloseMobile={() => {}} />);
  expect(screen.getByRole('link', { name: 'Purchase Orders' })).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Users & Roles' })).toBeNull();
  await userEvent.type(screen.getByRole('textbox', { name: 'Find a module' }), 'tracking');
  expect(screen.queryByRole('link', { name: 'Purchase Orders' })).toBeNull();
  expect(screen.getByRole('link', { name: 'LR Tracking' })).toBeTruthy();
});

it('products ignore a slow response for an older filter', async () => {
  let resolveFirst;
  api.get.mockImplementation(path => path === '/products'
    ? new Promise(resolve => { resolveFirst = resolve; }) : Promise.resolve({ data: { data: [] } }));
  mount(<Products />);
  await waitFor(() => expect(resolveFirst).toBeTypeOf('function'));
  const old = resolveFirst;
  // A category change creates a newer request immediately.
  const selects = screen.getAllByRole('combobox');
  fireEvent.change(selects[selects.length - 1], { target: { value: 'sku' } });
  await waitFor(() => expect(resolveFirst).not.toBe(old));
  resolveFirst({ data: { data: [], total: 0 } });
  await screen.findByText('No products found');
  old({ data: { data: [{ id: 'old', name: 'Stale product', sku: 'old' }], total: 1 } });
  await waitFor(() => expect(screen.queryByText('Stale product')).toBeNull());
});
