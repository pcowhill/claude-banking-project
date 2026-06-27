import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { OpsLayout } from './components/OpsLayout';
import { SimulationBanner } from './components/SimulationBanner';
import { OpsDashboard } from './pages/OpsDashboard';
import { RequestQueues } from './pages/RequestQueues';
import { SimulatedMessaging } from './pages/SimulatedMessaging';
import { SimulationClock } from './pages/SimulationClock';
import { AdminUsers } from './pages/AdminUsers';
import { Login } from './pages/Login';
import { NotFound } from './pages/NotFound';
import { AuthProvider } from './lib/AuthContext';
import { OpsDataProvider } from './lib/OpsDataContext';
import { isOperatorRole, useAuth } from './lib/auth-context';

/**
 * While the initial session check is in flight, hold the chrome rather than
 * flashing the login screen and then swapping it out a moment later.
 */
function AuthLoading() {
  return (
    <div className="flex min-h-screen flex-col">
      <SimulationBanner />
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="flex items-center gap-3 text-sm text-slate-400">
          <span className="h-2 w-2 animate-pulse rounded-full bg-brand-teal" />
          Checking operator session…
        </div>
      </div>
    </div>
  );
}

/**
 * Auth gate for the console. The operations app authenticates any valid user via
 * the backend, but only ADMITS bank staff (ops_agent / admin). Everyone else —
 * logged out or a customer-role session — sees the operator login screen.
 */
function OpsConsole() {
  const { user, loading } = useAuth();

  if (loading) return <AuthLoading />;
  if (!user || !isOperatorRole(user.role)) return <Login />;

  return (
    <OpsDataProvider>
      <OpsLayout>
        <Routes>
          <Route path="/" element={<OpsDashboard />} />
          <Route path="/queues" element={<RequestQueues />} />
          <Route path="/messaging" element={<SimulatedMessaging />} />
          <Route path="/clock" element={<SimulationClock />} />
          <Route path="/admin" element={<AdminUsers />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </OpsLayout>
    </OpsDataProvider>
  );
}

/**
 * Operations simulator app. v0.2.0 adds operator authentication: the console is
 * gated behind an operator login; queue/simulation/audit views become real
 * routes in v0.5.0.
 */
export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <OpsConsole />
      </BrowserRouter>
    </AuthProvider>
  );
}
