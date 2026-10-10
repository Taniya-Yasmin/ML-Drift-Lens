import { useEffect, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { Dashboard } from './components/Dashboard';
import { PredictionForm } from './components/PredictionForm';
import { PredictionHistory } from './components/PredictionHistory';
import { SystemStatus } from './components/SystemStatus';
import { apiClient } from './services/apiClient';
import './App.css';

function DashboardHeader() {
  const [modelId, setModelId] = useState<string | null>(null);
  const [modelVersion, setModelVersion] = useState<string | null>(null);
  const [serviceStatus, setServiceStatus] = useState('Checking status...');

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([apiClient.getMetrics(), apiClient.getHealth(), apiClient.getReadiness()]).then(([metrics, health, readiness]) => {
      if (cancelled) return;
      if (metrics.status === 'fulfilled') {
        setModelId(metrics.value.model_id);
        setModelVersion(metrics.value.model_version);
      }
      const healthOk = health.status === 'fulfilled' && (health.value.status === 'healthy' || health.value.healthy !== false);
      const ready = readiness.status === 'fulfilled' && readiness.value.ready;
      setServiceStatus(healthOk && ready ? 'Operational' : 'Unavailable');
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <header className="topbar">
      <div className="topbar-heading">
        <div className="topbar-title">NID ModelWatch</div>
        <div className="topbar-subtitle">Cybersecurity Threat Detection</div>
      </div>
      <div className="header-model-meta">
        <span>Model ID <strong>{modelId || 'N/A'}</strong></span>
        <span>Version <strong>{modelVersion || 'N/A'}</strong></span>
      </div>
      <div className={`system-pill ${serviceStatus === 'Operational' ? 'healthy' : 'placeholder-status'}`}>
        <span className="status-dot" />
        {serviceStatus}
      </div>
    </header>
  );
}

function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="brand-lockup">
            <span className="brand-mark">◆</span>
            <div>
              <div className="brand-name">NID ModelWatch</div>
              <div className="brand-subtitle">Monitoring platform</div>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Main navigation">
          <NavLink to="/" end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">◫</span><span>Overview</span>
          </NavLink>
          <NavLink to="/predictions" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">◎</span><span>Predictions</span>
          </NavLink>
          <NavLink to="/history" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">▣</span><span>History</span>
          </NavLink>
          <NavLink to="/status" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">◌</span><span>System Status</span>
          </NavLink>
        </nav>
      </aside>

      <main className="main-panel">
        <DashboardHeader />

        <div className="content-area">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/predictions" element={<div className="page-shell page-shell-tight"><div className="page-header-row align-start"><div><p className="eyebrow">Predictions</p><h2>Network Intrusion Prediction</h2></div></div><PredictionForm /></div>} />
            <Route path="/history" element={<div className="page-shell page-shell-tight"><div className="page-header-row align-start"><div><p className="eyebrow">History</p><h2>Prediction History</h2></div></div><PredictionHistory /></div>} />
            <Route path="/status" element={<div className="page-shell page-shell-tight"><div className="page-header-row align-start"><div><p className="eyebrow">Status</p><h2>System Status</h2></div></div><SystemStatus /></div>} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

export default App;
