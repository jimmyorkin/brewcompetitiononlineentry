import { test, expect, Browser } from '@playwright/test';
import { loginAsAdmin } from '../helpers/auth';
import { createEntrantWithEntry } from '../helpers/entries';
import { query } from '../helpers/db';

/**
 * includes/process/process_barcode_check_in_bbo.inc.php (the file actually
 * wired to live barcode check-in traffic - index.php:237 routes
 * section=admin&go=checkin to admin/barcode_check-in-bbo.admin.php, which
 * includes this file when action=="add") builds every query with sprintf()
 * straight from $_POST['eid'<n>], no escaping at all. Admin/judge-gated
 * (index.php:43-64 requires $logged_in and userLevel<=1), but real staff
 * use this during judging day with a barcode scanner feeding the eid
 * field, so a scanned/typed payload reaches raw SQL.
 *
 * This form posts directly to index.php (not through includes/process.inc.php),
 * so it carries no CSRF token and needs none here - posting straight to the
 * URL the real form's `action` attribute names is the actual request shape,
 * not a shortcut around it.
 */
const payload = "x' OR '1'='1";

test.beforeEach(async () => {
  // Idempotent: a prior run's log row for the fixed payload must not make
  // this run's row count look wrong.
  await query('DELETE FROM barcode_log WHERE entrynum = ?', [payload]);
});

test('barcode check-in survives a single-quote/OR payload in the entry number', async ({ page, browser }: { page: any; browser: Browser }) => {
  // Guarantee at least one real row in `brewing` for the injection to match,
  // independent of whatever other specs have left behind.
  await createEntrantWithEntry(browser);

  await loginAsAdmin(page);

  await page.request.post('/index.php?section=admin&go=checkin&action=add', {
    form: {
      'id[]': '1',
      eid1: payload,
      tableNumber1: '',
      judgingNumber1: '',
      box1: '',
    },
  });

  // Safe behaviour: the literal payload matches no real brewing.id, so the
  // "entry number not found" branch logs it verbatim. A vulnerable query
  // instead turns `WHERE id='<payload>'` into `WHERE id='x' OR '1'='1'`,
  // which matches an arbitrary real row and skips this branch entirely -
  // the existence check is bypassed.
  const rows = await query<{ errortext: string }>(
    "SELECT errortext FROM barcode_log WHERE entrynum = ? AND errortext LIKE '1#%'",
    [payload],
  );
  expect(rows).toHaveLength(1);
});

/**
 * Regression safety for the fix above: a real entry's own id must still be
 * recognized by the (now parameterized) existence lookup. If the fix broke
 * the lookup instead of just closing the injection, a real check-in would
 * wrongly fall into the "entry number not found" branch.
 */
test('barcode check-in still recognizes a real entry by its own id', async ({ page, browser }: { page: any; browser: Browser }) => {
  const entry = await createEntrantWithEntry(browser);
  const [row] = await query<{ id: number }>('SELECT id FROM brewing WHERE brewName = ?', [entry.entryName]);
  expect(row).toBeDefined();

  await loginAsAdmin(page);
  await page.request.post('/index.php?section=admin&go=checkin&action=add', {
    form: {
      'id[]': '1',
      eid1: String(row.id),
      tableNumber1: '',
      judgingNumber1: '',
      box1: '',
    },
  });

  const notFound = await query<{ errortext: string }>(
    "SELECT errortext FROM barcode_log WHERE entrynum = ? AND errortext LIKE '1#%'",
    [String(row.id)],
  );
  expect(notFound).toHaveLength(0);
});
