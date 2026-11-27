import { it, expect, vi } from 'vitest';
import { executeImport } from '../../backend/src/utils/importProcessor.js';
import { withTransaction } from '../../backend/src/config/db.js';
vi.mock('../../backend/src/config/db.js',()=>({withTransaction:vi.fn(),newId:()=> 'test-only-id',nextNumber:vi.fn()}));
it('rejects confirmation of already processed sessions before touching product records',async()=>{
  const query=vi.fn().mockResolvedValue({rows:[{status:'imported'}]});
  withTransaction.mockImplementation(fn=>fn({query}));
  await expect(executeImport('test-user','test-import',[])).rejects.toThrow(/already been processed/);
  expect(query).toHaveBeenCalledTimes(1);
  expect(query.mock.calls[0][0]).toContain('FOR UPDATE');
});
it('records row failures and final status in the same transaction',async()=>{
  const query=vi.fn().mockImplementation(async sql=>sql.includes('SELECT status')?{rows:[{status:'awaiting_confirmation'}]}:{rows:[]});
  withTransaction.mockImplementation(fn=>fn({query}));
  const outcome=await executeImport('test-user','test-import',[{rowIndex:1,sheet:'CSV',action:'invalid',extracted:{},mapped:{},errors:['Missing SKU']}]);
  expect(outcome.failed).toBe(1);
  const history=query.mock.calls.find(([sql])=>sql.startsWith('UPDATE import_history'));
  const details=query.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO import_records'));
  expect(history[1][1]).toBe('failed');
  expect(details[1][5]).toBe('invalid');
  expect(withTransaction).toHaveBeenCalledTimes(1);
});
