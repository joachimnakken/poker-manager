import { Pool, type PoolClient } from "pg";

// Fluid Compute reuses instances, so the pool is cached on globalThis to survive
// module re-evaluation in dev and to stay warm across invocations in production.
const globalForPool = globalThis as unknown as { pokerPool?: Pool };

function pool(): Pool {
  if (!globalForPool.pokerPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }
    // A whole poker night is ~16 phones polling every 2s; each state read is six quick
    // queries. Ten connections keeps writes from queueing behind the poll traffic.
    globalForPool.pokerPool = new Pool({ connectionString, max: 10 });
  }
  return globalForPool.pokerPool;
}

export async function query<T>(text: string, params: unknown[] = []): Promise<T[]> {
  const result = await pool().query(text, params);
  return result.rows as T[];
}

/**
 * Runs `fn` in a SERIALIZABLE transaction, retrying on serialisation failure.
 * Two captains recording knockouts at the same instant is expected, not an edge case.
 */
export async function serializable<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const maxAttempts = 5;

  for (let attempt = 1; ; attempt++) {
    const client = await pool().connect();
    try {
      await client.query("begin isolation level serializable");
      const result = await fn(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => {});
      const isSerialisationFailure =
        typeof error === "object" && error !== null && (error as { code?: string }).code === "40001";
      if (!isSerialisationFailure || attempt === maxAttempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 10 * attempt));
    } finally {
      client.release();
    }
  }
}

export type { PoolClient };
