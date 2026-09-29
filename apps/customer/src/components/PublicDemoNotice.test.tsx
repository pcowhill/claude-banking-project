import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { StatusResponse } from '@simbank/shared';
import { PUBLIC_DEMO_NOTICE } from '@simbank/shared';

const mockStatus = vi.hoisted(() => ({ value: null as StatusResponse | null }));
vi.mock('../lib/useApiStatus', () => ({
  useApiStatus: () => ({ loading: false, status: mockStatus.value }),
}));

import { PublicDemoNotice } from './PublicDemoNotice';

function statusWith(publicDemo: boolean): StatusResponse {
  return {
    status: 'ok',
    version: '1.0.0',
    milestone: 'v1.0.0',
    milestoneName: 'test',
    isSimulation: true,
    environment: 'test',
    publicDemo,
    database: { connected: true, users: 4, accounts: 4 },
    serverTime: new Date().toISOString(),
  };
}

describe('PublicDemoNotice', () => {
  it('renders nothing in ordinary local development (backend says publicDemo=false)', () => {
    mockStatus.value = statusWith(false);
    const { container } = render(<PublicDemoNotice />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing while the backend is unreachable and the build flag is off', () => {
    mockStatus.value = null;
    const { container } = render(<PublicDemoNotice variant="form" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the shared-demo banner when the backend reports public-demo mode', () => {
    mockStatus.value = statusWith(true);
    render(<PublicDemoNotice variant="banner" />);
    expect(screen.getByTestId('public-demo-notice-banner')).toBeInTheDocument();
    expect(screen.getByText(PUBLIC_DEMO_NOTICE.short)).toBeVisible();
  });

  it('the form variant warns before a visitor types personal details or a password', () => {
    mockStatus.value = statusWith(true);
    render(<PublicDemoNotice variant="form" />);
    expect(screen.getByTestId('public-demo-notice-form')).toBeInTheDocument();
    expect(screen.getByText(/throwaway password you use nowhere else/i)).toBeVisible();
    expect(screen.getByText(/periodically reset/i)).toBeVisible();
  });
});
