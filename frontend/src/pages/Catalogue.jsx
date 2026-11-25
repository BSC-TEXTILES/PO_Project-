import { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api, { errMessage, fileKind, assetUrl } from '../api.js';
import { useAuth } from '../auth.jsx';
import Icon from '../components/Icon.jsx';
import ProductGallery from '../components/ProductGallery.jsx';
import { Field } from '../components/DataTable.jsx';

// Product Catalogue — browses the full 1000+ SKU catalogue with server-side
// search / department / section / brand filters + pagination (§10, SC-6).
// Cascading filters: Department → Section → Brand → Products
export default function Catalogue() {
  const { hasPermission } = useAuth();
  const [searchParams] = useSearchParams();
  const canManage = hasPermission('masters.manage');
  const [departments, setDepartments] = useState([]);
  const [sections, setSections] = useState([]);
  const [brands, setBrands] = useState([]);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    search: searchParams.get('q') || '',
    departmentId: searchParams.get('departmentId') || '',
    sectionId: searchParams.get('sectionId') || '',
    brandId: searchParams.get('brandId') || '',
  });
  const [debouncedSearch, setDebouncedSearch] = useState(() => (searchParams.get('q') || '').trim());
  const [galleryProduct, setGalleryProduct] = useState(null);
  const [brandsLoading, setBrandsLoading] = useState(false);
  const [brandsError, setBrandsError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const pageSize = 20;

  // Load departments on mount
  useEffect(() => {
    api.get('/departments')
      .then((r) => setDepartments(r.data.data || []))
      .catch((e) => setError(errMessage(e)));
  }, []);

  // Load sections filtered by department (cascading)
  useEffect(() => {
    const controller = new AbortController();
    const params = { status: 'active' };
    if (filters.departmentId) params.departmentId = filters.departmentId;
    api.get('/sections', { params, signal: controller.signal })
      .then((r) => { if (!controller.signal.aborted) setSections(r.data.data || []); })
      .catch((e) => {
        if (e.name === 'AbortError' || controller.signal.aborted) return;
        setError(errMessage(e));
      });
    return () => controller.abort();
  }, [filters.departmentId]);

  // Load brands filtered by section (cascading) with product counts
  useEffect(() => {
    const controller = new AbortController();
    setBrandsLoading(true);
    setBrandsError('');

    const params = {};
    if (filters.sectionId) params.sectionId = filters.sectionId;
    else if (filters.departmentId) params.departmentId = filters.departmentId;
    api.get('/brands', { params, signal: controller.signal })
      .then((r) => {
        if (!controller.signal.aborted) setBrands(r.data.data || []);
      })
      .catch((e) => {
        if (e.name === 'AbortError' || controller.signal.aborted) return;
        setBrands([]);
        setBrandsError(errMessage(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setBrandsLoading(false);
      });

    return () => controller.abort();
  }, [filters.sectionId, filters.departmentId]);

  // Debounce search query (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(filters.search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [filters.search]);

  // Load products. `search` is deliberately excluded from the generic filter
  // loop so the debounced term is the only value sent to the API.
  useEffect(() => {
    const controller = new AbortController();
    const { search: _search, ...restFilters } = filters;
    const params = { page, pageSize };
    Object.entries(restFilters).forEach(([k, v]) => { if (v) params[k] = v; });
    if (debouncedSearch) params.search = debouncedSearch;

    api.get('/products', { params, signal: controller.signal })
      .then((r) => {
        if (controller.signal.aborted) return;
        setRows(r.data.data || []);
        setTotal(Number(r.data.total) || 0);
        setError('');
      })
      .catch((e) => {
        if (e.name === 'AbortError' || controller.signal.aborted) return;
        setRows([]);
        setTotal(0);
        setError(errMessage(e));
      });

    return () => controller.abort();
  }, [page, filters, debouncedSearch, pageSize, reloadToken]);

  const load = useCallback(() => setReloadToken((n) => n + 1), []);
  const pages = Math.max(1, Math.ceil(total / pageSize));

  // Cascading setF: resets downstream filters
  const setF = (patch) => {
    setPage(1);
    const next = { ...filters, ...patch };
    if ('departmentId' in patch && patch.departmentId !== filters.departmentId) {
      next.sectionId = '';
      next.brandId = '';
    }
    if ('sectionId' in patch && patch.sectionId !== filters.sectionId) {
      next.brandId = '';
    }
    setFilters(next);
  };

  return (
    <div className="page">
      <h1 className="page-title">Product Catalogue</h1>
      <p className="page-sub">{total.toLocaleString('en-IN')} products across every department — brand, manufacturer and provider visible for informed choosing (§10)</p>
      {error && <div className="alert error">{error}</div>}

      <div className="panel">
        <div className="row">
          <label className="field grow" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <span className="field-label">Search (product / SKU / brand / manufacturer / category)</span>
            <input
              value={filters.search}
              onChange={(e) => setF({ search: e.target.value })}
              placeholder="e.g. silk saree, jeans, Levi's…"
              style={{ paddingRight: filters.search ? '36px' : '12px' }}
            />
            {filters.search && (
              <button
                type="button"
                className="clear-search-btn"
                onClick={() => setF({ search: '' })}
                title="Clear search"
                style={{
                  position: 'absolute',
                  right: '8px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#9ca3af',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '24px',
                  height: '24px',
                  borderRadius: '4px',
                }}
                onMouseEnter={(e) => e.target.style.color = '#ef4444'}
                onMouseLeave={(e) => e.target.style.color = '#9ca3af'}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            )}
          </label>
          <label className="field"><span className="field-label">Department</span>
            <select value={filters.departmentId} onChange={(e) => setF({ departmentId: e.target.value })}>
              <option value="">All departments</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <label className="field"><span className="field-label">Section</span>
            <select value={filters.sectionId} onChange={(e) => setF({ sectionId: e.target.value })}>
              <option value="">All sections</option>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="field" style={{ minWidth: '200px' }}>
            <span className="field-label">Brand</span>
            <select
              value={filters.brandId}
              onChange={(e) => setF({ brandId: e.target.value })}
              disabled={brandsLoading}
            >
              <option value="">All brands ({brands.length})</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.brand_name} ({Number(b.product_count) || 0})
                </option>
              ))}
            </select>
            {brandsLoading && <span className="field-hint" style={{ fontSize: 11, color: '#6b7280', display: 'block', marginTop: 4 }}>Loading brands…</span>}
            {brandsError && <span className="field-hint" style={{ fontSize: 11, color: '#dc2626', display: 'block', marginTop: 4 }}>Could not load brands: {brandsError}</span>}
          </label>
        </div>
        {(debouncedSearch || filters.departmentId || filters.sectionId || filters.brandId) && (
          <div className="row" style={{ marginTop: 8, justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn sm ghost"
              onClick={() => setF({ search: '', departmentId: '', sectionId: '', brandId: '' })}
              style={{ fontSize: 11, padding: '2px 8px' }}
            >
              Clear All Filters
            </button>
          </div>
        )}

        <table className="grid">
          <thead>
            <tr><th>Product</th><th>Image</th><th>Brand</th><th>Manufacturer</th><th>Providers (dealers)</th><th>Department</th><th>Section</th><th>Status</th></tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td><strong>{p.name}</strong><div className="mono muted">{p.sku} · {p.product_serial}</div></td>
                <td>
                  <button className="thumb" title="Open gallery" onClick={() => setGalleryProduct(p)}>
                    {p.primary_image_key
                      ? <img src={assetUrl(`/uploads/${p.primary_image_key.split(/[\\/]/).join('/')}`)} alt={p.name} loading="lazy" />
                      : <span className="thumb-empty"><Icon name="image" size={16} /></span>}
                    {!!p.image_count && p.image_count > 0 && <span className="thumb-count">{p.image_count}</span>}
                  </button>
                </td>
                <td>{p.brand_name}<div className="mono muted">{p.brand_number}</div></td>
                <td>{p.manufacturer || '—'}</td>
                <td className="muted">{(p.providers || []).join(', ') || '—'}</td>
                <td>{p.department_name}</td>
                <td>{p.section_name}</td>
                <td>{p.status}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={8} className="muted">No products match the filters.</td></tr>}
          </tbody>
        </table>

        <div className="row mt">
          <span className="muted">Page {page} of {pages} · {total.toLocaleString('en-IN')} products</span>
          <button className="btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
          <button className="btn sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next →</button>
        </div>
      </div>

      {galleryProduct && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setGalleryProduct(null)}>
          <div className="modal wide">
            <div className="modal-head">
              <h3>{galleryProduct.name} <span className="mono muted">· {galleryProduct.sku}</span></h3>
              <button className="icon-btn" onClick={() => setGalleryProduct(null)}><Icon name="x" size={16} /></button>
            </div>
            <div className="modal-body">
              <ProductGallery product={galleryProduct} canManage={canManage} onChanged={load} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
