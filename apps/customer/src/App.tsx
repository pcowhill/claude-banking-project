import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { SiteLayout } from './components/SiteLayout';
import { RequireAuth } from './components/RequireAuth';
import { ScrollToTop } from './components/ScrollToTop';
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
import { AccountDetail } from './pages/AccountDetail';
import { MoveMoney } from './pages/MoveMoney';
import { Wallet } from './pages/Wallet';
import { Statements } from './pages/Statements';
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
 *  - "/login"        simulated sign-in (v0.2.0); "already signed in" when authed
 *  - "/dashboard"    authenticated accounts overview (protected by RequireAuth)
 *  - "/accounts/:id" authenticated account detail + transactions (protected)
 *  - "/move-money"   authenticated money movement — transfer/deposit/send/bill (protected)
 *  - "/wallet"       authenticated cards manager — freeze/replace/travel notices (protected)
 *  - "/statements"   authenticated statements/documents placeholder (protected)
 *  - "*"             not found
 *
 * The whole tree is wrapped in <AuthProvider> so the nav and protected routes
 * share one session, hydrated once on mount from GET /api/auth/me.
 */
export function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
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
            <Route
              path="/accounts/:id"
              element={
                <RequireAuth>
                  <AccountDetail />
                </RequireAuth>
              }
            />
            <Route
              path="/move-money"
              element={
                <RequireAuth>
                  <MoveMoney />
                </RequireAuth>
              }
            />
            <Route
              path="/wallet"
              element={
                <RequireAuth>
                  <Wallet />
                </RequireAuth>
              }
            />
            <Route
              path="/statements"
              element={
                <RequireAuth>
                  <Statements />
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
