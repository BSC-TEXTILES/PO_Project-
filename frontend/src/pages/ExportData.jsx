import { useState, useEffect } from 'react';
import api, { errMessage } from '../api.js';
import DateRangeBar from '../components/DateRangeBar.jsx';

export default function ExportData() {
  const [dataType, setDataType] = useState('po-register');
  const [format, setFormat] = useState('xlsx');
  const [dateState, setDateState] = useState({ preset: 'all', from: '', to: '' });
  const [locationFilter, setLocationFilter] = useState('');
  const [divisions, setDivisions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    api.get('/divisions').then((r) => setDivisions(r.data?.data || [])).catch(() => {});
  }, []);

  const exportTypes = [
    { value: 'po-register', label: 'PO Register' },
    { value: 'purchase-summary', label: 'Purchase Summary' },
    { value: 'dealer', label: 'Dealer Report' },
    { value: 'size', label: 'Size Report' },
    { value: 'margin', label: 'Margin Report' },
    { value: 'receiving', label: 'Receiving Report' },
  ];

  const handleExport = async () => {
    setLoading(true); setError(''); setSuccess('');
    try {
      const params = { format };
      if (dateState.from) params.from = dateState.from;
      if (dateState.to) params.to = dateState.to;
      if (locationFilter) params.location = locationFilter;
      const r = await api.get(`/reports/${dataType}`, { params, responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${dataType}-${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setSuccess(`${exportTypes.find((t) => t.value === dataType)?.label || dataType} exported as ${format.toUpperCase()} successfully.`);
    } catch (e) { setError(errMessage(e)); }
    setLoading(false);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Export Data</h1>
          <p className="page-sub" style={{ margin: 0 }}>Download formatted business reports as Excel (.xlsx), PDF, or CSV</p>
        </div>
      </div>
      {error && <div className="alert error" style={{ marginTop: 12 }}>{error}</div>}
      {success && <div className="alert ok" style={{ marginTop: 12 }}>{success}</div>}

      <div style={{ marginTop: 14 }}>
        <DateRangeBar preset={dateState.preset} from={dateState.from} to={dateState.to} onChange={setDateState} />
      </div>

      <div className="panel" style={{ maxWidth: 560 }}>
        <h3>Export Configuration</h3>
        <label className="field"><span className="field-label">Report Dataset</span>
          <select value={dataType} onChange={(e) => setDataType(e.target.value)}>
            {exportTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <label className="field"><span className="field-label">Location</span>
          <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)}>
            <option value="">All Authorized Locations</option>
            {divisions.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.code})</option>)}
          </select>
        </label>
        <label className="field"><span className="field-label">File Format</span>
          <select value={format} onChange={(e) => setFormat(e.target.value)}>
            <option value="xlsx">Excel Workbook (.xlsx)</option>
            <option value="pdf">Printable Document (.pdf)</option>
            <option value="csv">CSV Spreadsheet (.csv)</option>
          </select>
        </label>
        <button className="btn primary lg" onClick={handleExport} disabled={loading} style={{ marginTop: 10 }}>
          {loading ? 'Generating Export…' : `⬇ Download ${format.toUpperCase()}`}
        </button>
      </div>
    </div>
  );
}
