import { NavLink, Outlet, useLocation } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import './lrTracking.css';

export default function LRTrackingLayout() {
  const location = useLocation();

  return (
    <div className="lr-container">
      <div className="lr-header">
        <div className="lr-title-group">
          <h1>
            <Icon name="truck" size={28} style={{ color: '#1d4ed8' }} />
            LR Tracking & Shipment Management
          </h1>
          <p>Real-time Lorry Receipt document intelligence, VRL Logistics integration, and store-wise shipment tracking.</p>
        </div>

        <div className="lr-nav-tabs">
          <NavLink
            to="/lr-tracking"
            end
            className={({ isActive }) => `lr-nav-tab ${isActive ? 'active' : ''}`}
          >
            <Icon name="dashboard" size={16} />
            Dashboard
          </NavLink>
          <NavLink
            to="/lr-tracking/upload"
            className={({ isActive }) => `lr-nav-tab ${isActive ? 'active' : ''}`}
          >
            <Icon name="camera" size={16} />
            Upload LR Document
          </NavLink>
          <NavLink
            to="/lr-tracking/track"
            className={({ isActive }) => `lr-nav-tab ${isActive ? 'active' : ''}`}
          >
            <Icon name="truck" size={16} />
            Track Orders
          </NavLink>
          <NavLink
            to="/lr-tracking/receiving"
            className={({ isActive }) => `lr-nav-tab ${isActive ? 'active' : ''}`}
          >
            <Icon name="package" size={16} />
            Goods Received
          </NavLink>
        </div>
      </div>

      <Outlet />
    </div>
  );
}
