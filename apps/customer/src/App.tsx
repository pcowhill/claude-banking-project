import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { SiteLayout } from './components/SiteLayout';
import { MarketingHome } from './pages/MarketingHome';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { NotFound } from './pages/NotFound';

/**
 * Customer app routes (v0.1.0 shell):
 *  - "/"          public marketing home
 *  - "/login"     placeholder login (real auth in v0.2.0)
 *  - "/dashboard" placeholder authenticated dashboard
 *  - "*"          not found
 */
export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<SiteLayout />}>
          <Route path="/" element={<MarketingHome />} />
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
