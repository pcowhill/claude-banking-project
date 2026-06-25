import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { SiteLayout } from './components/SiteLayout';
import { RequireAuth } from './components/RequireAuth';
import { AuthProvider } from './lib/AuthProvider';
import { MarketingHome } from './pages/MarketingHome';
import { Checking } from './pages/Checking';
import { Savings } from './pages/Savings';
import { Cards } from './pages/Cards';
import { Borrow } from './pages/Borrow';
import { About } from './pages/About';
import { OpenAccount } from './pages/OpenAccount';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { NotFound } from './pages/NotFound';

/**
 * Customer app routes:
 *  - "/"             public marketing home
 *  - "/checking"     checking product page
 *  - "/savings"      savings product page
 *  - "/cards"        cards overview (coming soon)
 *  - "/borrow"       loans & CDs overview (coming soon)
 *  - "/about"        about / trust / security / roadmap
 *  - "/open-account" open-account entry point (onboarding placeholder until v0.6.0)
 *  - "/login"        simulated sign-in (v0.2.0)
 *  - "/dashboard"    authenticated dashboard (protected by RequireAuth)
 *  - "*"             not found
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
            <Route path="/checking" element={<Checking />} />
            <Route path="/savings" element={<Savings />} />
            <Route path="/cards" element={<Cards />} />
            <Route path="/borrow" element={<Borrow />} />
            <Route path="/about" element={<About />} />
            <Route path="/open-account" element={<OpenAccount />} />
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
