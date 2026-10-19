/**
 * Environment settings. Defaults match docker-compose.yml; CI overrides them with env vars.
 */
export const settings = {
  baseURL: process.env.BASE_URL ?? 'http://localhost:5080',
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://qa:qa@localhost:5432/servicedesk',
  /** Customer ids from db/init.sql that tests are allowed to use. */
  activeCustomerId: 1,
  inactiveCustomerId: 3,
} as const;
