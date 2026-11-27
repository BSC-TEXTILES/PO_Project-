import { useEffect, useRef, useState } from 'react';
import api, { errMessage, formatBytes } from '../api.js';
import Modal from '../components/Modal.jsx';
import Icon from '../components/Icon.jsx';

const pageSize = 20;
export default function ImportData() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const fileInput = useRef(null);
  const [file, setFile] = useState(null);
  const [session, setSession] = useState(null);
  const [mapping, setMapping] = useState({});
  const [dirty, setDirty] = useState(false);
  const [page, setPage] = useState(1);
  const [historyLimit, setHistoryLimit] = useState(20);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [results, setResults] = useState(null);
  async function loadHistory() {
    setLoading(true);
    try { const { data } = await api.get('/import/history', { params: { limit: historyLimit, status } }); setHistory(data.data || []); }
    catch (e) { setError(errMessage(e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { loadHistory(); }, [status, historyLimit]);
  async function perform(action) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); }
    catch (e) { setError(errMessage(e)); }
    finally { pending.current = false; setBusy(false); }
  }
  function showPreview(data) {
    setSession(data); setMapping(data.preview.mapping || {}); setDirty(false); setPage(1);
  }
  function upload(event) {
    event.preventDefault();
    if (!file) { setError('Choose a CSV, Excel or PDF file.'); return; }
    if (!/\.(csv|xlsx|xls|pdf)$/i.test(file.name)) { setError('Supported formats: CSV, XLSX, XLS and PDF.'); return; }
    if (file.size > 10 * 1024 * 1024) { setError('Choose a file smaller than 10 MB.'); return; }
    perform(async () => {
      const body = new FormData(); body.append('file', file);
      const { data } = await api.post('/import/upload', body, { timeout: 120000 });
      showPreview(data.data); await loadHistory();
    });
  }
  function revalidate() {
    perform(async () => {
      const { data } = await api.post(`/import/${session.importId}/preview`, { mapping }, { timeout: 120000 });
      showPreview(data.data);
    });
  }
  function finish() {
    const action = confirmation;
    perform(async () => {
      if (action.kind === 'cancel') {
        await api.delete(`/import/${action.id}`);
        setNotice('Import cancelled. Product records were not changed.');
      } else {
        const { data } = await api.post(`/import/${action.id}/confirm`, { mapping }, { timeout: 120000 });
        const outcome = data.data;
        setNotice(`Import finished: ${outcome.imported} created, ${outcome.updated} updated, ${outcome.failed} failed. Review the history for details.`);
      }
      setConfirmation(null); setSession(null); setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      await loadHistory();
    });
  }
  const preview = session?.preview;
  const records = preview?.records || [];
  const invalid = preview?.summary?.invalid || 0;
  const missingRequired = (preview?.fields || []).filter(field => field.required && !Object.values(mapping).includes(field.key));
  const pages = Math.max(1, Math.ceil(records.length / pageSize));
  return <div className="page import-page">
    <div className="page-header"><div><h1 className="page-title">Import Data</h1><p className="page-sub">Upload, map and review product records before applying changes.</p></div><button className="btn" disabled={busy || loading} onClick={loadHistory}><Icon name="refresh" size={16} />Refresh history</button></div>
    {error && <div className="alert error" role="alert">{error}</div>}
    {notice && <div className="alert ok" role="status">{notice}</div>}
    {!session ? <section className="panel"><h2>Upload a product file</h2><p className="muted">CSV, Excel (.xlsx, .xls) or PDF · Maximum 10 MB. Existing products are matched by SKU. Uploading stages the file for review; confirming applies product changes.</p>
      <form onSubmit={upload} className="import-upload"><label className="field">Product file<input ref={fileInput} type="file" accept=".csv,.xlsx,.xls,.pdf" disabled={busy} onChange={e => setFile(e.target.files?.[0] || null)} /></label><button className="btn primary" disabled={!file || busy}>{busy ? 'Preparing preview…' : 'Upload and preview'}</button></form>
    </section> : <>
      <section className="panel"><div className="page-header"><div><h2>Review {preview.file?.fileName || file?.name}</h2><p className="muted">{records.length} parsed rows · {preview.summary?.create || 0} new · {preview.summary?.update || 0} updates · {invalid} invalid</p></div><button className="btn" disabled={busy} onClick={() => setConfirmation({kind:'cancel',id:session.importId})}>Cancel import</button></div>
        <h3>Column mapping</h3><div className="import-mapping">{(preview.headers || []).map(header => <label className="field" key={header}>{header}<select value={mapping[header] || ''} disabled={busy} onChange={e => { setMapping(current => ({...current,[header]:e.target.value || null})); setDirty(true); }}><option value="">Do not import</option>{(preview.fields || []).map(field => <option key={field.key} value={field.key}>{field.label}{field.required ? ' *' : ''}</option>)}</select></label>)}</div>
        {!!missingRequired.length && <p className="alert error">Map required fields: {missingRequired.map(f=>f.label).join(', ')}.</p>}
        {dirty && <p className="alert info">The mapping has changed. Validate it to refresh the preview before importing.</p>}
        <div className="page-actions"><button className="btn" disabled={busy || !!missingRequired.length} onClick={revalidate}>{busy ? 'Working…' : 'Validate mapping'}</button><button className="btn primary" disabled={busy || dirty || !!invalid || !!missingRequired.length || !records.length} onClick={() => setConfirmation({kind:'confirm',id:session.importId})}>Review and import</button></div>
      </section>
      <section className="panel"><h3>Parsed records</h3><div className="table-wrap"><table className="grid"><thead><tr><th>Row</th><th>Sheet</th><th>SKU</th><th>Product</th><th>Action</th><th>Validation</th></tr></thead><tbody>{records.slice((page-1)*pageSize,page*pageSize).map((record,i)=><tr key={`${record.sheet}-${record.rowIndex}-${i}`}><td>{record.rowIndex}</td><td>{record.sheet}</td><td>{record.mapped?.sku || '—'}</td><td>{record.mapped?.name || '—'}</td><td>{record.action}</td><td>{[...(record.errors||[]),...(record.warnings||[])].join('; ') || 'Ready'}</td></tr>)}</tbody></table></div><div className="import-pagination"><button className="btn" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page} of {pages}</span><button className="btn" disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>Next</button></div></section>
    </>}
    <section className="panel"><div className="page-header"><h2>Import history</h2><label className="field">Status<select value={status} onChange={e=>{setStatus(e.target.value);setHistoryLimit(20);}}><option value="">All statuses</option>{['awaiting_confirmation','imported','partially_imported','failed','cancelled','processing'].map(s=><option key={s} value={s}>{s.replaceAll('_',' ')}</option>)}</select></label></div>
      {loading ? <p role="status">Loading import history…</p> : !history.length ? <div className="empty-state">No imports found for this filter.</div> : <div className="table-wrap"><table className="grid"><thead><tr><th>File</th><th>Uploaded</th><th>Rows</th><th>Result</th><th>Actions</th></tr></thead><tbody>{history.map(row=><tr key={row.id}><td><strong>{row.fileName}</strong><div className="muted">{formatBytes(row.fileSizeBytes)}</div></td><td>{row.uploadedAt ? new Date(row.uploadedAt).toLocaleString('en-IN') : '—'}<div className="muted">{row.uploadedBy}</div></td><td>{row.rowsFound ?? '—'}</td><td>{row.status?.replaceAll('_',' ')}{row.errorSummary && <div className="muted">{row.errorSummary}</div>}</td><td>{row.status==='awaiting_confirmation' ? <button className="btn sm" disabled={busy} onClick={()=>perform(async()=>{const {data}=await api.get(`/import/${row.id}`,{timeout:120000});showPreview(data.data);})}>Review</button> : <button className="btn sm" disabled={busy} onClick={()=>perform(async()=>{const {data}=await api.get(`/import/${row.id}/records`);setResults({name:row.fileName,rows:data.data||[]});})}>View results</button>}</td></tr>)}</tbody></table></div>}
      {history.length===historyLimit && historyLimit<200 && <button className="btn mt" disabled={loading} onClick={()=>setHistoryLimit(n=>Math.min(200,n+20))}>Load more imports</button>}
    </section>
    {confirmation && <Modal title={confirmation.kind==='cancel'?'Cancel this import?':'Apply this import?'} busy={busy} onClose={()=>setConfirmation(null)}><p>{confirmation.kind==='cancel'?'The staged import will be cancelled. Existing product records will remain unchanged.':'This will create new products and update matching SKUs using the reviewed values. Check the mapping and validation before continuing.'}</p>{error && <p className="alert error" role="alert">{error}</p>}<div className="modal-actions"><button className="btn" disabled={busy} onClick={()=>setConfirmation(null)}>Keep reviewing</button><button className={`btn ${confirmation.kind==='cancel'?'danger':'primary'}`} disabled={busy} onClick={finish}>{busy?'Working…':confirmation.kind==='cancel'?'Cancel import':'Confirm import'}</button></div></Modal>}
    {results && <Modal wide title={`Results: ${results.name}`} onClose={()=>setResults(null)}>{!results.rows.length?<p>No row results were recorded for this import.</p>:<div className="table-wrap"><table className="grid"><thead><tr><th>Row</th><th>Operation</th><th>Details</th></tr></thead><tbody>{results.rows.map((row,i)=><tr key={i}><td>{row.rowIndex}</td><td>{row.operation}</td><td>{[...(row.errors||[]),...(row.warnings||[])].join('; ') || 'Completed'}</td></tr>)}</tbody></table></div>}</Modal>}
  </div>;
}
