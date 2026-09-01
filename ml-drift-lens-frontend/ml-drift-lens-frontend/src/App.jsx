import { Route, Routes } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Dashboard from "./pages/Dashboard";
import DriftMonitoring from "./pages/DriftMonitoring";
import Models from "./pages/Models";
import Alerts from "./pages/Alerts";
import Retraining from "./pages/Retraining";
import Predictions from "./pages/Predictions";

export default function App() {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/drift" element={<DriftMonitoring />} />
          <Route path="/models" element={<Models />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/retraining" element={<Retraining />} />
          <Route path="/predictions" element={<Predictions />} />
        </Routes>
      </main>
    </div>
  );
}
