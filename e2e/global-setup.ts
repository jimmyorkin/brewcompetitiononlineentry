import { FullConfig } from '@playwright/test';

/**
 * Wait until the app is really serving, not just the containers being "up".
 * MariaDB's first-run init executes docker/0*.sql against a temporary server and
 * then restarts, so for a short window after `docker compose up` the web
 * container is reachable but every DB-backed page fails. We poll the entrant
 * registration page until its form renders (that page needs the DB, the seeded
 * contest dates and the open-registration fixture all at once).
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0].use.baseURL ?? process.env.BASE_URL ?? 'http://localhost:8080';
  const url = `${baseURL}/index.php?section=register&go=entrant`;
  const deadline = Date.now() + 120_000;
  let last = 'no response';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      const body = await res.text();
      if (res.ok && body.includes('id="submit-form"')) return;
      last = `HTTP ${res.status}, registration form not rendered`;
    } catch (e) {
      last = String(e);
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error(`App at ${baseURL} not ready after 120s (${last})`);
}
