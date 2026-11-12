import mysql from 'mysql2/promise';

/**
 * Direct DB access for specs that need to backdate timestamps (the 60-second
 * entry spacing and the 1-hour unpaid-delete rules are time-based) or clean up
 * their own rows. Defaults match docker-compose.yml; override with DB_HOST /
 * DB_PORT (e.g. DB_PORT=3307 when the stack runs on spare ports).
 */
export async function withDb<T>(fn: (c: mysql.Connection) => Promise<T>): Promise<T> {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? 'bcoem',
    password: process.env.DB_PASSWORD ?? 'bcoem_password',
    database: process.env.DB_NAME ?? 'bcoem',
    // DATETIME columns are written by PHP in Central time; read them back as text.
    dateStrings: true,
  });
  try {
    return await fn(conn);
  } finally {
    await conn.end();
  }
}

/** Run a statement and return its rows. */
export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  return withDb(async c => (await c.query(sql, params))[0] as T[]);
}

/** Make an entrant's entries look `minutes` old (defeats the 60s spacing / ages them for the 1h delete). */
export async function backdateEntries(brewName: string, minutes: number): Promise<void> {
  await query('UPDATE brewing_bbo_real SET brewUpdated = brewUpdated - INTERVAL ? MINUTE WHERE brewName LIKE ?', [minutes, brewName]);
}

/** Hard-delete the rows this spec created (names start with "BBO "). */
export async function purgeBboTestEntries(): Promise<void> {
  await query("DELETE FROM barcode_log WHERE entrynum IN (SELECT id FROM brewing_bbo_real WHERE brewName LIKE 'BBO %')");
  await query("DELETE FROM brewing_bbo_real WHERE brewName LIKE 'BBO %'");
}
