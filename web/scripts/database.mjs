import nextEnv from '@next/env';
import pg from 'pg';
import { fileURLToPath } from 'node:url';

export const projectDirectory = fileURLToPath(new URL('../', import.meta.url));

export function createPool() {
  nextEnv.loadEnvConfig(projectDirectory);
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is missing. Configure web/.env before continuing.');
  }
  return new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  });
}
