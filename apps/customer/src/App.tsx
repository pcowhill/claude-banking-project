import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { SiteLayout } from './components/SiteLayout';
import { RequireAuth } from './components/RequireAuth';
import { AuthProvider } from './lib/AuthProvider';
import { MarketingHome } from './pages/MarketingHome';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { NotFound } from './pages/NotFound';

/**
 * Customer app routes:
 *  - "/"          public marketing home
 *  - "/login"     simulated sign-in (v0.2.0)
 *  - "/dashboard" authenticated dashboard (protected by RequireAuth)
 *  - "*"          not found
 *
 * The whole tree is wrapped in <AuthProvider> so the nav and protected routes
 * share one session, hydrated once on mount from GET /api/auth/me.
 */
export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<SiteLayout />}>
            <Route path="/" element={<MarketingHome />} />
            <Route path="/login" element={<Login />} />
            <Route
              path="/dashboard"
              element={
                <RequireAuth>
                  <Dashboard />
                </RequireAuth>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
