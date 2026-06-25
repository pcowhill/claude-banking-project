import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { OpsLayout } from './components/OpsLayout';
import { OpsDashboard } from './pages/OpsDashboard';
import { NotFound } from './pages/NotFound';

/**
 * Operations simulator routes (v0.1.0 shell). For now everything lives on the
 * dashboard; queue/simulation/audit views become real routes in v0.5.0.
 */
export function App() {
  return (
    <BrowserRouter>
      <OpsLayout>
        <Routes>
          <Route path="/" element={<OpsDashboard />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </OpsLayout>
    </BrowserRouter>
  );
}
