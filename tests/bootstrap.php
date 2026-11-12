<?php
/**
 * PHPUnit test bootstrap for BCOEM.
 *
 * Defines the minimal set of path constants and stubs needed
 * to load individual library files without triggering the
 * full application bootstrap (database, sessions, etc.).
 */

// ── Path constants (mirrors paths.php) ──────────────────────
define('ROOT', dirname(__DIR__) . DIRECTORY_SEPARATOR);
define('ADMIN', ROOT . 'admin' . DIRECTORY_SEPARATOR);
define('SSO', ROOT . 'sso' . DIRECTORY_SEPARATOR);
define('EVALS', ROOT . 'eval' . DIRECTORY_SEPARATOR);
define('CLASSES', ROOT . 'classes' . DIRECTORY_SEPARATOR);
define('CONFIG', ROOT . 'site' . DIRECTORY_SEPARATOR);
define('DB', ROOT . 'includes' . DIRECTORY_SEPARATOR . 'db' . DIRECTORY_SEPARATOR);
define('IMAGES', ROOT . 'images' . DIRECTORY_SEPARATOR);
define('INCLUDES', ROOT . 'includes' . DIRECTORY_SEPARATOR);
define('LIB', ROOT . 'lib' . DIRECTORY_SEPARATOR);
define('MODS', ROOT . 'mods' . DIRECTORY_SEPARATOR);
define('PROCESS', ROOT . 'includes' . DIRECTORY_SEPARATOR . 'process' . DIRECTORY_SEPARATOR);
define('SECTIONS', ROOT . 'sections' . DIRECTORY_SEPARATOR);
define('SETUP', ROOT . 'setup' . DIRECTORY_SEPARATOR);
define('UPDATE', ROOT . 'update' . DIRECTORY_SEPARATOR);
define('OUTPUT', ROOT . 'output' . DIRECTORY_SEPARATOR);
define('USER_IMAGES', ROOT . 'user_images' . DIRECTORY_SEPARATOR);
define('USER_DOCS', ROOT . 'user_docs' . DIRECTORY_SEPARATOR);
define('USER_TEMP', ROOT . 'user_temp' . DIRECTORY_SEPARATOR);
define('LANG', ROOT . 'lang' . DIRECTORY_SEPARATOR);
define('DEBUGGING', ROOT . 'includes' . DIRECTORY_SEPARATOR . 'debug' . DIRECTORY_SEPARATOR);
define('AJAX', ROOT . 'ajax' . DIRECTORY_SEPARATOR);
define('PUB', ROOT . 'pub' . DIRECTORY_SEPARATOR);

// ── Application-level constants ─────────────────────────────
define('HOSTED', FALSE);
define('NHC', FALSE);
define('SINGLE', FALSE);
define('EVALUATION', TRUE);
define('MAINT', FALSE);
define('CDN', TRUE);
define('TESTING', FALSE);
define('DEBUG', FALSE);
define('ENABLE_MARKDOWN', FALSE);
define('ENABLE_MAILER', FALSE);

// ── Session (some functions reference $_SESSION) ────────────
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// ── Load the sterilize() function from paths.php ────────────
// common.lib.php's prep_redirect_link() calls sterilize()
// which is defined in paths.php. We extract just that function.
if (!function_exists('sterilize')) {
    function sterilize($sterilize = NULL) {
        if ($sterilize == NULL) return NULL;
        elseif (empty($sterilize)) return $sterilize;
        else {
            $sterilize = trim($sterilize);
            if (is_numeric($sterilize)) {
                if (is_float($sterilize)) $sterilize = filter_var($sterilize, FILTER_SANITIZE_NUMBER_FLOAT, FILTER_FLAG_ALLOW_FRACTION);
                if (is_int($sterilize)) {
                    if ($sterilize == 0) $sterilize = 0;
                    else $sterilize = filter_var($sterilize, FILTER_SANITIZE_NUMBER_INT);
                }
            } else {
                $sterilize = filter_var($sterilize, FILTER_SANITIZE_FULL_SPECIAL_CHARS);
            }
            $sterilize = strip_tags($sterilize);
            $sterilize = stripcslashes($sterilize);
            $sterilize = stripslashes($sterilize);
            $sterilize = addslashes($sterilize);
            return $sterilize;
        }
    }
}

// ── Stub: check_setup() is called by version_check() ───────
if (!function_exists('check_setup')) {
    function check_setup($table, $database) {
        return true; // Stub: assume tables exist in test context
    }
}

// ── Stub: is_https() lives in paths.php, which tests don't load ─
// site/config.php (included by some lib functions) calls it to build $base_url.
if (!function_exists('is_https')) {
    function is_https() {
        return false; // CLI test context is never behind TLS
    }
}

// ── $_SERVER defaults for CLI (config.php reads these) ─────────
$_SERVER['HTTP_HOST']     = $_SERVER['HTTP_HOST']     ?? 'localhost';
$_SERVER['DOCUMENT_ROOT'] = $_SERVER['DOCUMENT_ROOT'] ?? ROOT;

// ── DB wrapper (paths.php loads this; lib functions use `new MysqliDb(...)`) ──
require_once CONFIG . 'MysqliDb.php';

// ── Load the library under test ─────────────────────────────
// common.lib.php includes date_time.lib.php and version.inc.php
require_once LIB . 'common.lib.php';
