/**
 * Build-time settings, from web/.env (local) or GitHub repository variables
 * (the Pages workflow). Leave VITE_API_URL empty to run in demo mode with
 * sample results — handy before the Worker is deployed.
 */
export const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '';
export const DEMO = !API_URL;
