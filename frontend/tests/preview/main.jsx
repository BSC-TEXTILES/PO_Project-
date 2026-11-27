import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from '../../src/App.jsx';
import '../../src/styles.css';
import '../../src/workspace.css';
createRoot(document.getElementById('root')).render(<BrowserRouter><div className="service-layout"><aside className="service-notice">UI review only · Empty test responses · No database connection or writes</aside><div className="service-content"><App /></div></div></BrowserRouter>);
