/**
 * Single source of truth for the platform version and current milestone.
 * Surfaced by the backend `/status` endpoint and the dev banners/footers in
 * both frontend apps so a reviewer can always see what they are running.
 */
export const APP_VERSION = '0.9.0';

/** Current milestone tag, per ROADMAP.md. */
export const MILESTONE = 'v0.9.0';

/** Short human label for the milestone. */
export const MILESTONE_NAME = 'Simulation clock & scheduled payments';

/**
 * Hard-coded simulation flag. This platform is ALWAYS a local simulation.
 * It must never be flipped to imply a real banking environment.
 */
export const IS_SIMULATION = true as const;

export interface PlatformMeta {
  version: string;
  milestone: string;
  milestoneName: string;
  isSimulation: true;
}

export const PLATFORM_META: PlatformMeta = {
  version: APP_VERSION,
  milestone: MILESTONE,
  milestoneName: MILESTONE_NAME,
  isSimulation: IS_SIMULATION,
};
