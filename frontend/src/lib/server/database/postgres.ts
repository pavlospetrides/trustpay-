import { sourceText } from "../../i18n/core";
import { Pool, types, type PoolClient } from "pg";
import { readFileSync } from "node:fs";

// DATE has no time zone. Keep PostgreSQL's "YYYY-MM-DD" text, as Python's date did; pg's default Date at local
// midnight turns 2026-11-25 into 2026-11-24 in UTC when the server runs east of UTC (Cyprus).
types.setTypeParser(types.builtins.DATE, (value: string) => value);

export interface QueryConnection {
  // Row shapes depend on the SQL projection and are checked at the repository boundary.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query(sql: string, values?: unknown[]): Promise<{ rows: any[] }>;
}
export interface TransactionConnection extends QueryConnection { release(): void }
export interface ConnectionPool { connect(): Promise<TransactionConnection> }

export async function transaction<T>(pool: ConnectionPool, work: (connection: QueryConnection) => Promise<T>): Promise<T> {
  const connection = await pool.connect();
  try {
    await connection.query("BEGIN");
    const result = await work(connection);
    await connection.query("COMMIT");
    return result;
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  } finally {
    connection.release();
  }
}

declare global { var trustpayPool: Pool | undefined }
export function poolConfig(dsn: string, ca?: string): { connectionString: string; ssl?: { ca: string; rejectUnauthorized: true } } {
  const url = new URL(dsn);
  const hostedPooler = url.hostname.endsWith(".pooler.supabase.com");
  if (hostedPooler && !ca) throw new Error(sourceText("a-supabase-ca-certificate-is-required-for-verified"));
  if (!ca) return { connectionString: dsn };
  url.searchParams.delete("sslmode");
  url.searchParams.delete("sslrootcert");
  return { connectionString: url.toString(), ssl: { ca, rejectUnauthorized: true } };
}

export function databasePool(): Pool {
  const dsn = process.env.TRUSTPAY_DATABASE_URL;
  if (!dsn) throw new Error("TRUSTPAY_DATABASE_URL is required in PostgreSQL mode");
  if (!globalThis.trustpayPool) {
    const caPath = process.env.TRUSTPAY_DATABASE_CA_CERT_PATH;
    const ca = caPath ? readFileSync(caPath, "utf8") : undefined;
    globalThis.trustpayPool = new Pool({ ...poolConfig(dsn, ca), max: Number(process.env.TRUSTPAY_DB_POOL_SIZE || 5), connectionTimeoutMillis: 10_000, idleTimeoutMillis: 60_000, application_name: "trustpay-node" });
  }
  return globalThis.trustpayPool;
}

export async function read<T>(work: (connection: PoolClient) => Promise<T>): Promise<T> {
  const connection = await databasePool().connect();
  try { return await work(connection); } finally { connection.release(); }
}
