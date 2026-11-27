import React from 'react';
import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import ImportData from '../src/pages/ImportData.jsx';
import api from '../src/api.js';
vi.mock('../src/api.js', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() }, errMessage: e => e.message, formatBytes: n => `${n} B` }));
const preview = { file: { fileName: 'test-only.csv' }, headers: ['SKU'], mapping: { SKU: 'sku' }, fields: [{key:'sku',label:'SKU',required:true}], summary: {create:1,update:0,invalid:0}, records:[{rowIndex:1,sheet:'CSV',action:'create',mapped:{sku:'TEST',name:'Test fixture'},errors:[],warnings:[]}] };
beforeEach(()=>{ api.get.mockResolvedValue({data:{data:[]}}); api.post.mockResolvedValue({data:{data:{importId:'test-import',preview}}}); });
async function upload() {
  render(<ImportData />);
  fireEvent.change(screen.getByLabelText('Product file'), {target:{files:[new File(['SKU\nTEST'], 'test-only.csv', {type:'text/csv'})]}});
  fireEvent.click(screen.getByRole('button',{name:'Upload and preview'}));
  await screen.findByRole('heading',{name:'Review test-only.csv'});
}
it('upload stages parsed records and never confirms without an explicit second action', async()=>{
  await upload();
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(api.post.mock.calls[0][0]).toBe('/import/upload');
  expect(screen.getByText('Test fixture')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Review and import'}));
  expect(screen.getByRole('dialog',{name:'Apply this import?'})).toBeTruthy();
  expect(api.post).toHaveBeenCalledTimes(1);
});
it('changing a column mapping prevents confirmation until revalidated', async()=>{
  await upload();
  fireEvent.change(screen.getByRole('combobox',{name:'SKU'}),{target:{value:''}});
  expect(screen.getByRole('button',{name:'Review and import'}).disabled).toBe(true);
  expect(screen.getByText(/Map required fields/)).toBeTruthy();
});
it('confirmation prevents duplicate requests and keeps failure visible in the dialog', async()=>{
  await upload();
  fireEvent.click(screen.getByRole('button',{name:'Review and import'}));
  let reject;
  api.post.mockImplementation(()=>new Promise((_,r)=>{reject=r;}));
  const button=screen.getByRole('button',{name:'Confirm import'});
  fireEvent.click(button); fireEvent.click(button);
  expect(api.post).toHaveBeenCalledTimes(2);
  reject(new Error('Import could not be saved'));
  await waitFor(()=>expect(within(screen.getByRole('dialog')).getByRole('alert').textContent).toBe('Import could not be saved'));
});
it('rejects oversized files before contacting the API',async()=>{
  render(<ImportData/>);
  const file = new File(['test'], 'large.csv'); Object.defineProperty(file,'size',{value:11*1024*1024});
  fireEvent.change(screen.getByLabelText('Product file'),{target:{files:[file]}});
  fireEvent.click(screen.getByRole('button',{name:'Upload and preview'}));
  expect(screen.getByRole('alert').textContent).toMatch(/10 MB/);
  expect(api.post).not.toHaveBeenCalled();
});
