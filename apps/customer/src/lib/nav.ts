/**
 * Public-site navigation model, shared by the header and the footer.
 *
 * Kept in its own (component-free) module so the presentational `marketing`
 * module exports only components — which keeps react-refresh's
 * `only-export-components` rule happy while letting both the layout and the
 * footer consume the same single source of truth for the nav links.
 */
export interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

/** Primary product pages surfaced in the top nav and the footer. */
export const PRODUCT_NAV: NavItem[] = [
  { to: '/checking', label: 'Checking' },
  { to: '/savings', label: 'Savings' },
  { to: '/cards', label: 'Cards' },
  { to: '/borrow', label: 'Loans & CDs' },
];

/** Company / informational pages. */
export const COMPANY_NAV: NavItem[] = [{ to: '/about', label: 'About' }];

/** The full set of primary nav links (Home + products + company). */
export const PRIMARY_NAV: NavItem[] = [
  { to: '/', label: 'Home', end: true },
  ...PRODUCT_NAV,
  ...COMPANY_NAV,
];
