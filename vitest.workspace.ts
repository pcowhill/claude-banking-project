// Root Vitest workspace. Unit/integration tests live next to the code they
// cover. For the v0.1.0 foundation, the testable surface is the shared package
// (pure logic such as ledger math) and the backend (API + seed). Frontend apps
// are exercised by Playwright smoke tests instead (see playwright.config.ts).
import { defineWorkspace } from 'vitest/config';

export default defineWorkspace(['packages/shared', 'apps/backend']);
