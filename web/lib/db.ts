import { Pool, type PoolClient } from "pg";

let _pool: Pool | null = null;

/**
 * Lazily-created connection pool to the Supabase Postgres. The connection string
 * is parsed into discrete fields so special characters in the password (e.g. '!')
 * are handled regardless of encoding — mirroring db.py. search_path is set on
 * every fresh connection so `poc` tables and the pgvector type/operators (which
 * live in the `extensions` schema on Supabase) resolve.
 */
export function pool(): Pool {
  if (_pool) return _pool;

  const cs = process.env.DATABASE_URL;
  if (!cs) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.",
    );
  }

  const u = new URL(cs);
  _pool = new Pool({
    host: u.hostname,
    port: u.port ? parseInt(u.port, 10) : 5432,
    user: decodeURIComponent(u.username) || "postgres",
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, "") || "postgres",
    ssl: { rejectUnauthorized: false }, // Supabase requires SSL
    max: 3, // small per-instance pool (serverless can spin up many instances)
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  });

  _pool.on("connect", (client: PoolClient) => {
    // search_path resolves poc tables + the pgvector type/operators (extensions);
    // a higher hnsw.ef_search improves recall, which matters for topic-filtered
    // (federated cross-source) searches where the default pool misses matches.
    client
      .query("SET search_path TO poc, extensions, public; SET hnsw.ef_search = 200")
      .catch((err) => {
        console.error("[db] connection setup failed:", err.message);
      });
  });
  _pool.on("error", (err) => {
    console.error("[db] idle client error:", err.message);
  });

  return _pool;
}

/** Run a parameterized query and return the rows. */
export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const res = await pool().query(text, params as unknown[]);
  return res.rows as T[];
}

/** Format a numeric array as a pgvector literal: [0.1,0.2,...]. */
export function toVector(values: number[]): string {
  return "[" + values.join(",") + "]";
}
