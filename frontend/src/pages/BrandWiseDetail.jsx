import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api, { errMessage } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Money } from '../components/DataTable.jsx';
import StatusChip from '../components/StatusChip.jsx';
import Icon from '../components/Icon.jsx';
import { PageSkeleton } from '../components/Skeletons.jsx';

function dmy(value) {
  if (!value) return '';
  const d = new Date(value);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function BrandWiseDetail() {
  const { brandId } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  const load = useCallback(() => {
    let active = true;
    api.get(`/reports/brand-wise/${brandId}`)
      .then((r) => {
        if (active) {
          setData(r.data);
          setError('');
        }
      })
      .catch((e) => {
        if (active) setError(errMessage(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [brandId]);

  useEffect(load, [load]);

  if (loading && !data) return <PageSkeleton title="Loading Brand POs…" />;
  if (error) return <div className="page"><div className="alert error">{error}</div></div>;
  if (!data) return <div className="page"><div className="muted">No data available</div></div>;

  const { brand, pos } = data;

  return (
    <div className="page">
      <div className="polist-head">
        <div>
          <h1 className="page-title mono">{brand.brand_name}</h1>
          <p className="page-sub">Brand #: {brand.brand_number} — {pos.length} purchase order(s) containing this brand</p>
        </div>
        <div className="polist-head-actions">
          <button className="btn ghost sm" onClick={() => navigate('/brand-wise')}>
            <Icon name="arrowLeft" size={14} /> Back to Brand Dashboard
          </button>
          <button className="btn sm" onClick={() => window.print()}>
            <Icon name="file" size={14} /> Print
          </button>
        </div>
      </div>

      <div className="panel polist-table-card">
        <div className="polist-table-head">
          <div>
            <div className="polist-table-title">Purchase Orders for {brand.brand_name}</div>
            <div className="polist-table-sub">{pos.length} order(s) in your authorized scope</div>
          </div>
        </div>

        <div className="table-responsive">
          <table className="grid polist-table">
            <thead>
              <tr>
                <th>PO Number</th><th>Date</th><th>Version</th><th>Status</th>
                <th>Supplier</th><th>Division</th><th>Section</th>
                <th className="num">Brand Qty</th><th className="num">Brand Value</th><th className="num">PO Grand Total</th>
              </tr>
            </thead>
            <tbody>
              {pos.map((p) => (
                <tr key={p.id} className="clickable" onClick={() => navigate(`/purchase-orders/${p.id}`)}>
                  <td className="mono"><span className="po-no">{p.po_number}</span></td>
                  <td>{dmy(p.po_date)}</td>
                  <td><span className="chip">v{p.version}</span></td>
                  <td><StatusChip status={p.status} /></td>
                  <td><span className="cell-strong" title={p.supplier_name}>{p.supplier_name}</span></td>
                  <td title={p.division_name}>{p.division_name}</td>
                  <td title={p.section_name}>{p.section_name}</td>
                  <td className="num">{Number(p.brand_quantity || 0).toLocaleString('en-IN')}</td>
                  <td className="num"><Money value={p.brand_value} /></td>
                  <td className="num"><Money value={p.grand_total} /></td>
                </tr>
              ))}
              {!pos.length && (
                <tr>
                  <td colSpan={10}>
                    <div className="polist-empty">
                      <Icon name="search" size={30} />
                      <span>No purchase orders found for this brand in your authorized scope.</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}