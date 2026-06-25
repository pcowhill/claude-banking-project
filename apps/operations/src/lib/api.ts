import type { StatusResponse } from '@simbank/shared';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/** Fetch backend status; returns null when the API is unreachable. */
export async function fetchStatus(): Promise<StatusResponse | null> {
  try {
    const res = await fetch(`${API_URL}/status`);
    if (!res.ok) return null;
    return (await res.json()) as StatusResponse;
  } catch {
    return null;
  }
}

export { API_URL };
