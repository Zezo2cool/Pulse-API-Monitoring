import "server-only";
import { Pool } from "pg";

const globalDatabase = globalThis as typeof globalThis & {
  monitoringPool?: Pool;
};

export function getDatabase(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing from the server environment.");
  }

  // Reuse connections across requests and development hot reloads.
  if (!globalDatabase.monitoringPool) {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      statement_timeout: 10000,
    });
    pool.on("error", () => {
      console.error("An idle database connection failed.");
    });
    globalDatabase.monitoringPool = pool;
  }

  return globalDatabase.monitoringPool;
}
