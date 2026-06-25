import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { APP_VERSION } from '@simbank/shared';
import { buildServer } from './server';

describe('backend server', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns ok and uptime without touching the database', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(typeof body.uptimeSeconds).toBe('number');
  });

  it('GET /status reports the platform version and the simulation flag', async () => {
    const res = await app.inject({ method: 'GET', url: '/status' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Bind to the single source of truth so this doesn't break each version bump.
    expect(body.version).toBe(APP_VERSION);
    expect(body.isSimulation).toBe(true);
    expect(['ok', 'degraded']).toContain(body.status);
  });

  it('GET /api/meta returns the simulation disclaimer', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/meta' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.isSimulation).toBe(true);
    expect(body.disclaimer).toMatch(/simulat/i);
  });

  it('GET / advertises the available endpoints', async () => {
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.endpoints).toContain('/health');
  });
});
