import React, { useEffect, useState, Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Sidebar from './components/Sidebar.jsx';
import Topbar from './components/Topbar.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { PageSkeleton, DashboardSkeleton } from './components/Skeletons.jsx';

// Public direct imports (instant auth & legal landing)
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import SignUpPage from './pages/SignUp.jsx';
import CookieConsent from './components/CookieConsent.jsx';
import { PrivacyPolicy, Terms, Security } from './pages/Legal.jsx';
import NotFound from './pages/NotFound.jsx';
import ProfileModal from './components/ProfileModal.jsx';

// Optimized Lazy-Loaded Application Modules (Code Splitting)
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const POList = lazy(() => import('./pages/POList.jsx'));
const POCreate = lazy(() => import('./pages/POCreate.jsx'));
const PODetails = lazy(() => import('./pages/PODetails.jsx'));
const Approvals = lazy(() => import('./pages/Approvals.jsx'));
const Receipts = lazy(() => import('./pages/Receipts.jsx'));
const Masters = lazy(() => import('./pages/Masters.jsx'));
const Catalogue = lazy(() => import('./pages/Catalogue.jsx'));
const CollectionView = lazy(() => import('./pages/CollectionView.jsx'));
const Calendar = lazy(() => import('./pages/Calendar.jsx'));
const Chat = lazy(() => import('./pages/Chat.jsx'));
const Users = lazy(() => import('./pages/Users.jsx'));
const Reports = lazy(() => import('./pages/Reports.jsx'));
const BrandWiseDashboard = lazy(() => import('./pages/BrandWiseDashboard.jsx'));
const BrandWiseDetail = lazy(() => import('./pages/BrandWiseDetail.jsx'));
const AuditLogs = lazy(() => import('./pages/AuditLogs.jsx'));
const Products = lazy(() => import('./pages/Products.jsx'));
const ProductDetail = lazy(() => import('./pages/ProductDetail.jsx'));
const ProductForm = lazy(() => import('./pages/ProductForm.jsx'));
const ProductTypes = lazy(() => import('./pages/ProductTypes.jsx'));
const Brands = lazy(() => import('./pages/Brands.jsx'));
const Categories = lazy(() => import('./pages/Categories.jsx'));
const Colors = lazy(() => import('./pages/Colors.jsx'));
const Sizes = lazy(() => import('./pages/Sizes.jsx'));
const Attributes = lazy(() => import('./pages/Attributes.jsx'));
const ExportData = lazy(() => import('./pages/ExportData.jsx'));
const Videos = lazy(() => import('./pages/Videos.jsx'));
const VideoDetail = lazy(() => import('./pages/VideoDetail.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
const Roles = lazy(() => import('./pages/Roles.jsx'));
const UserAccess = lazy(() => import('./pages/UserAccess.jsx'));
const Manufacturers = lazy(() => import('./pages/Manufacturers.jsx'));
const Locations = lazy(() => import('./pages/Locations.jsx'));
const Pricing = lazy(() => import('./pages/Pricing.jsx'));
const Collections = lazy(() => import('./pages/Collections.jsx'));
const Dealers = lazy(() => import('./pages/Dealers.jsx'));
const CompanySettings = lazy(() => import('./pages/CompanySettings.jsx'));
const Attachments = lazy(() => import('./pages/Attachments.jsx'));
const Checkout = lazy(() => import('./pages/Checkout.jsx'));
const ImportData = lazy(() => import('./pages/ImportData.jsx'));
const ProfilePage = lazy(() => import('./pages/ProfilePage.jsx'));

// LR Tracking System (Universal Access)
const LRTrackingLayout = lazy(() => import('./pages/LRTracking/LRTrackingLayout.jsx'));
const LRDashboard = lazy(() => import('./pages/LRTracking/LRDashboard.jsx'));
const LRUpload = lazy(() => import('./pages/LRTracking/LRUpload.jsx'));
const LRTrackOrder = lazy(() => import('./pages/LRTracking/LRTrackOrder.jsx'));
const LRGoodsReceiving = lazy(() => import('./pages/LRTracking/LRGoodsReceiving.jsx'));

function RequireAuth({ children, permission, superAdmin }) {
  const { user, hasPermission, loading, isSignedIn } = useAuth();

  if (loading) {
    return <PageSkeleton title="Authenticating…" />;
  }
  if (!isSignedIn) return <Navigate to="/login" replace />;
  if (superAdmin && !user?.isSuperAdmin) {
    return (
      <div className="page" style={{ padding: '24px' }}>
        <div className="alert error">Only the Administrator can manage roles and permissions.</div>
      </div>
    );
  }
  if (permission && !hasPermission(permission)) {
    return (
      <div className="page" style={{ padding: '24px' }}>
        <div className="alert error">You do not have permission to view this screen ({permission}).</div>
      </div>
    );
  }
  return children;
}

export default function App() {
  const { user, loading, isSignedIn } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('poms_sidebar') === '1');

  useEffect(() => {
    localStorage.setItem('poms_sidebar', collapsed ? '1' : '0');
  }, [collapsed]);

  // While auth is initialising, display responsive skeleton
  if (loading) {
    return (
      <div className="shell">
        <div className="main" style={{ padding: '40px' }}>
          <DashboardSkeleton />
        </div>
      </div>
    );
  }

  // Public routes: landing page, login and legal pages
  if (!isSignedIn) {
    return (
      <>
        <Routes>
          <Route path="/landing" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<SignUpPage />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/security" element={<Security />} />
          <Route path="*" element={<Navigate to="/landing" replace />} />
        </Routes>
        <CookieConsent />
      </>
    );
  }

  if (location.pathname === '/login' || location.pathname === '/landing') {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className={`shell ${collapsed ? 'collapsed' : ''}`}>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <div className="main">
        <Topbar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
        <main className="content">
          {/* Mandatory profile completion for admin-created accounts */}
          {user && !user.profileUpdatedAt && <ProfileModal />}
          <ErrorBoundary>
            <Suspense fallback={<PageSkeleton />}>
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<RequireAuth permission="dashboard.view"><Dashboard /></RequireAuth>} />
                <Route path="/purchase-orders" element={<RequireAuth permission="po.view"><POList /></RequireAuth>} />
                <Route path="/purchase-orders/new" element={<RequireAuth permission="po.create"><POCreate /></RequireAuth>} />
                <Route path="/purchase-orders/:id" element={<RequireAuth><PODetails /></RequireAuth>} />

                {/* LR Tracking Module — Available to all authenticated users */}
                <Route path="/lr-tracking" element={<RequireAuth><LRTrackingLayout /></RequireAuth>}>
                  <Route index element={<LRDashboard />} />
                  <Route path="upload" element={<LRUpload />} />
                  <Route path="track" element={<LRTrackOrder />} />
                  <Route path="receiving" element={<LRGoodsReceiving />} />
                </Route>

                <Route path="/calendar" element={<RequireAuth permission="calendar.view"><Calendar /></RequireAuth>} />
                <Route path="/approvals" element={<RequireAuth permission="approvals.view"><Approvals /></RequireAuth>} />
                <Route path="/receipts" element={<RequireAuth permission="receipt.view"><Receipts /></RequireAuth>} />
                <Route path="/masters" element={<RequireAuth permission="masters.view"><Masters /></RequireAuth>} />
                <Route path="/catalogue" element={<RequireAuth permission="catalogue.view"><Catalogue /></RequireAuth>} />
                <Route path="/collection/:deptKey" element={<RequireAuth><CollectionView /></RequireAuth>} />
                <Route path="/chat" element={<RequireAuth permission="chat.view"><Chat /></RequireAuth>} />
                <Route path="/users" element={<RequireAuth permission="users.manage"><Users /></RequireAuth>} />
                <Route path="/reports" element={<RequireAuth permission="reports.view"><Reports /></RequireAuth>} />
                <Route path="/brand-wise" element={<RequireAuth permission="reports.view"><BrandWiseDashboard /></RequireAuth>} />
                <Route path="/brand-wise/:brandId" element={<RequireAuth permission="reports.view"><BrandWiseDetail /></RequireAuth>} />
                <Route path="/audit-logs" element={<RequireAuth permission="audit.view"><AuditLogs /></RequireAuth>} />
                <Route path="/collections" element={<RequireAuth permission="collections.view"><Collections /></RequireAuth>} />
                <Route path="/dealers" element={<RequireAuth permission="dealers.view"><Dealers /></RequireAuth>} />
                <Route path="/company" element={<RequireAuth permission="company.view"><CompanySettings /></RequireAuth>} />
                <Route path="/attachments" element={<RequireAuth permission="attachments.view"><Attachments /></RequireAuth>} />
                <Route path="/checkout" element={<RequireAuth><Checkout /></RequireAuth>} />
                <Route path="/products" element={<RequireAuth permission="products.view"><Products /></RequireAuth>} />
                <Route path="/products/new" element={<RequireAuth permission="products.create"><ProductForm /></RequireAuth>} />
                <Route path="/products/:id" element={<RequireAuth permission="products.view"><ProductDetail /></RequireAuth>} />
                <Route path="/products/:id/edit" element={<RequireAuth permission="products.edit"><ProductForm /></RequireAuth>} />
                <Route path="/product-types" element={<RequireAuth permission="product_types.view"><ProductTypes /></RequireAuth>} />
                <Route path="/brands" element={<RequireAuth permission="brands.view"><Brands /></RequireAuth>} />
                <Route path="/categories" element={<RequireAuth permission="categories.view"><Categories /></RequireAuth>} />
                <Route path="/colors" element={<RequireAuth permission="colors.view"><Colors /></RequireAuth>} />
                <Route path="/sizes" element={<RequireAuth permission="sizes.view"><Sizes /></RequireAuth>} />
                <Route path="/attributes" element={<RequireAuth permission="masters.view"><Attributes /></RequireAuth>} />
                <Route path="/export-data" element={<RequireAuth permission="reports.export"><ExportData /></RequireAuth>} />
                <Route path="/import-data" element={<RequireAuth permission="import.manage"><ImportData /></RequireAuth>} />
                <Route path="/videos" element={<RequireAuth permission="videos.view"><Videos /></RequireAuth>} />
                <Route path="/videos/:id" element={<RequireAuth permission="videos.view"><VideoDetail /></RequireAuth>} />
                <Route path="/settings" element={<RequireAuth permission="settings.manage"><Settings /></RequireAuth>} />
                <Route path="/roles" element={<RequireAuth permission="users.manage" superAdmin><Roles /></RequireAuth>} />
                <Route path="/users/:id/access" element={<RequireAuth permission="users.manage"><UserAccess /></RequireAuth>} />
                <Route path="/privacy" element={<PrivacyPolicy />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/security" element={<Security />} />
                <Route path="/manufacturers" element={<RequireAuth permission="manufacturers.view"><Manufacturers /></RequireAuth>} />
                <Route path="/locations" element={<RequireAuth permission="locations.view"><Locations /></RequireAuth>} />
                <Route path="/pricing" element={<RequireAuth permission="pricing.view"><Pricing /></RequireAuth>} />
                <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
