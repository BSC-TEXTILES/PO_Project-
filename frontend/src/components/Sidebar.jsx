import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import Icon from './Icon.jsx';
import CollectionIcon from './CollectionIcon.jsx';
import { useAuth } from '../auth.jsx';
import api from '../api.js';

const SECTIONS = [
  {
    label: null,
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: 'dashboard', end: true, permission: 'dashboard.view' },
    ],
  },
  {
    label: 'Collections',
    items: [
      { to: '/catalogue', label: 'Product Catalogue', icon: 'catalogue', permission: 'catalogue.view' },
    ],
  },
  {
    label: 'Master Data',
    items: [
      { to: '/products', label: 'Products', icon: 'catalogue', permission: 'products.view' },
      { to: '/brands', label: 'Brands', icon: 'masters', permission: 'brands.view' },
      { to: '/categories', label: 'Categories', icon: 'masters', permission: 'categories.view' },
      { to: '/product-types', label: 'Product Types', icon: 'masters', permission: 'product_types.view' },
      { to: '/colors', label: 'Colors', icon: 'masters', permission: 'colors.view' },
      { to: '/sizes', label: 'Sizes', icon: 'masters', permission: 'sizes.view' },
      { to: '/manufacturers', label: 'Manufacturers', icon: 'building', permission: 'manufacturers.view' },
      { to: '/locations', label: 'Locations', icon: 'building', permission: 'locations.view' },
    ],
  },
  {
    label: 'Orders',
    items: [
      { to: '/purchase-orders', label: 'Purchase Orders', icon: 'po', permission: 'po.view' },
      { to: '/calendar', label: 'PO Calendar', icon: 'calendar', permission: 'calendar.view' },
    ],
  },
  {
    label: 'LR Tracking',
    items: [
      { to: '/lr-tracking', label: 'LR Tracking', icon: 'truck', alwaysVisible: true, end: true },
      { to: '/lr-tracking/upload', label: 'Upload LR Document', icon: 'camera', alwaysVisible: true },
      { to: '/lr-tracking/track', label: 'Track Order', icon: 'truck', alwaysVisible: true },
      { to: '/lr-tracking/receiving', label: 'Goods Received', icon: 'package', alwaysVisible: true },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/chat', label: 'Team Chat', icon: 'chat', permission: 'chat.view' },
      { to: '/approvals', label: 'Approval Queue', icon: 'approvals', permission: 'approvals.view' },
      { to: '/receipts', label: 'Receiving', icon: 'receipts', permission: 'receipt.view' },
      { to: '/auctions', label: 'Auctions', icon: 'trophy', permission: 'auctions.view' },
      { to: '/masters', label: 'Masters', icon: 'masters', permission: 'masters.view', hiddenRoles: ['purchase_executive'] },
      { to: '/pricing', label: 'Pricing', icon: 'reports', permission: 'pricing.view', hiddenRoles: ['purchase_executive'] },
      { to: '/export-data', label: 'Export Data', icon: 'reports', permission: 'reports.export', hiddenRoles: ['purchase_executive'] },
    ],
  },
  {
    label: 'Media',
    items: [
      { to: '/videos', label: 'Videos', icon: 'video', permission: 'videos.view' },
    ],
  },
  {
    label: 'Analytics',
    items: [
      { to: '/reports', label: 'Reports', icon: 'reports', permission: 'reports.view', hiddenRoles: ['purchase_executive'] },
      { to: '/brand-wise', label: 'Brand-wise Dashboard', icon: 'reports', permission: 'reports.view', hiddenRoles: ['purchase_executive'] },
    ],
  },
  {
    label: 'Administration',
    items: [
      { to: '/users', label: 'Users & Roles', icon: 'users', permission: 'users.manage' },
      { to: '/roles', label: 'Roles', icon: 'shield', permission: 'users.manage', superAdminOnly: true },
      { to: '/settings', label: 'Settings', icon: 'settings', permission: 'settings.manage' },
      { to: '/audit-logs', label: 'Audit Trail', icon: 'audit', permission: 'audit.view' },
      { to: '/import-data', label: 'Import Data', icon: 'reports', permission: 'import.manage' },
      { to: '/collections', label: 'Collections', icon: 'masters', permission: 'collections.view' },
      { to: '/dealers', label: 'Dealers', icon: 'building', permission: 'dealers.view' },
      { to: '/company', label: 'Company Settings', icon: 'settings', permission: 'company.view' },
      { to: '/attachments', label: 'Attachments', icon: 'catalogue', permission: 'attachments.view', hiddenRoles: ['purchase_executive'] },
    ],
  },
];

const DEPARTMENT_GROUPS = [
  { key: 'men', title: "Men's Collection", icon: 'men' },
  { key: 'women', title: "Women's Collection", icon: 'women' },
  { key: 'kids', title: "Kids Collection", icon: 'kids' },
  { key: 'home', title: "Home & Furnishing", icon: 'home' },
];

function canSee(item, user) {
  if (item.alwaysVisible) return true;
  if (item.permission && !user.isSuperAdmin && !user.permissions?.includes(item.permission)) return false;
  if (item.superAdminOnly && !user.isSuperAdmin) return false;
  // Role-level trimming: Purchase Executives (e.g. Sachin — DVG) get a focused
  // workspace — catalogue + orders + chat. Back-office/admin areas are hidden.
  if (item.hiddenRoles && !user.isSuperAdmin && user.roles?.some((r) => item.hiddenRoles.includes(r))) return false;
  return true;
}

export default function Sidebar({ collapsed, onToggle }) {
  const { user } = useAuth();
  const canBrowse = user.isSuperAdmin || user.permissions?.includes('masters.view') || user.permissions?.includes('catalogue.view');
  // Division Supervisor: strictly restricted — Men's collection and PO viewing
  // only. All other collections, masters and admin areas stay hidden.
  const isSupervisor = user.roles?.includes('division_supervisor') && !user.isSuperAdmin;

  // Dynamic collection navigation: known groups come from the hardcoded
  // DEPARTMENT_GROUPS; any NEW department created by the Admin in
  // Master Data (e.g. Lycra Men's, Women's Ethnic, Cricket) is
  // fetched from the API and merged in — the nav grows automatically.
  const [dynamicGroups, setDynamicGroups] = useState(DEPARTMENT_GROUPS);
  useEffect(() => {
    if (!canBrowse) return;
    api.get('/departments')
      .then((depRes) => {
        const deps = depRes.data?.data || [];
        const defaultsByKey = new Map(DEPARTMENT_GROUPS.map((g) => [g.key, g]));
        const groups = new Map();
        DEPARTMENT_GROUPS.forEach((g) => groups.set(g.key, { ...g }));
        deps.forEach((dept) => {
          const key = (dept.code || dept.name || '').toLowerCase();
          if (!groups.has(key)) {
            const base = defaultsByKey.get(key);
            groups.set(key, {
              key,
              title: base ? base.title : dept.name,
              icon: base ? base.icon : 'masters',
            });
          }
        });
        if (groups.size) setDynamicGroups([...groups.values()]);
      })
      .catch(() => {});
  }, [canBrowse]);

  const departmentGroups = isSupervisor
    ? dynamicGroups.filter((g) => g.key === 'men')
    : dynamicGroups;
  const navSections = isSupervisor
    ? SECTIONS.filter((s) => !s.label || ['Collections', 'Orders'].includes(s.label))
    : SECTIONS;
  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-brand-wrapper">
        <div className="brand donezo-brand">
          <img src="/bsc-logo.png" alt="BSC Exclusive" className="brand-mark-img" style={{ width: 36, height: 36, borderRadius: 8 }} />
          {!collapsed && (
            <div className="brand-name">BSC Exclusive</div>
          )}
        </div>
        <button
          type="button"
          className="sidebar-hamburger-btn"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <Icon name="menu" size={20} />
        </button>
      </div>
      <div className="sidebar-scroll">
        <nav>
          {navSections.map((section, si) => {
            const visible = section.items.filter((n) => canSee(n, user));
            if (!visible.length) return null;
            return (
              <div key={si} className="nav-section">
                {!collapsed && section.label && <div className="nav-section-label">{section.label}</div>}
                {visible.map((n) => (
                  <NavLink key={n.to} to={n.to} end={n.end} title={n.label}
                    className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
                    <Icon name={n.icon} size={18} />
                    {!collapsed && <span>{n.label}</span>}
                  </NavLink>
                ))}

                {/* Flat Collection Links (Men's Collection, Women's Collection, Kids Collection, Home & Furnishing) */}
                {section.label === 'Collections' && canBrowse && (
                  departmentGroups.map((g) => (
                    <NavLink
                      key={g.key}
                      to={`/collection/${g.key}`}
                      title={g.title}
                      className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                    >
                      <CollectionIcon name={g.icon} size={18} className="icon" />
                      {!collapsed && <span>{g.title}</span>}
                    </NavLink>
                  ))
                )}
              </div>
            );
          })}
        </nav>
        <div style={{ marginTop: 'auto', paddingTop: 20 }}>
          {!collapsed && (
            <div className="donezo-mobile-promo">
              <div className="promo-icon"><Icon name="po" size={24} /></div>
              <strong>BSC Exclusive Mobile App</strong>
              <span>Manage orders on the go</span>
              <button className="btn">Download</button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
