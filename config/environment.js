/**
 * Single source of truth for which environment the server is running in.
 *
 * This exists because the previous pattern — `process.env.NODE_ENV ||
 * 'development'` repeated in several files — fails open. A single unset
 * variable in production would silently have:
 *
 *   - selected the PhonePe SANDBOX credentials instead of the live ones,
 *   - enabled POST /api/payment/test, which mints confirmed tickets with no
 *     payment at all,
 *   - made checkStatus treat any TEST-prefixed order as COMPLETED without
 *     ever contacting PhonePe.
 *
 * Every default here is therefore the restrictive one. An unknown environment
 * is treated as production: worst case a developer sees a loud error telling
 * them to set NODE_ENV, rather than a live site quietly giving tickets away.
 */
import dotenv from 'dotenv';

dotenv.config();

const rawNodeEnv = process.env.NODE_ENV?.trim().toLowerCase();

// Vercel sets VERCEL=1 on every deployment, and VERCEL_ENV to one of
// production / preview / development. Used only to tell a deployed host from
// a laptop so the error messages can be specific.
const IS_DEPLOYED = process.env.VERCEL === '1' || !!process.env.VERCEL_ENV;

/**
 * Resolve the mode. Note the absence of a permissive fallback: if we cannot
 * tell, we assume production.
 */
const resolveNodeEnv = () => {
  if (rawNodeEnv) return rawNodeEnv;

  if (IS_DEPLOYED) {
    console.error(
      '🚨 NODE_ENV is not set on a deployed host. Assuming production. ' +
      'Set NODE_ENV explicitly in the Vercel project settings.',
    );
    return 'production';
  }

  console.error(
    '🚨 NODE_ENV is not set. Assuming production so that test payment routes ' +
    'stay disabled. For local development set NODE_ENV=development in .env.',
  );
  return 'production';
};

export const NODE_ENV = resolveNodeEnv();
export const IS_PRODUCTION = NODE_ENV === 'production';
export const IS_DEVELOPMENT = NODE_ENV === 'development';

/**
 * Whether the routes that issue tickets without payment may run.
 *
 * Deliberately requires an explicit opt-in rather than inferring it from
 * NODE_ENV alone, and can never be true on a deployed host. Two independent
 * mistakes are now needed to expose them, instead of one missing variable.
 */
export const TEST_PAYMENTS_ENABLED = (() => {
  const optedIn = process.env.ENABLE_TEST_PAYMENTS === 'true';

  if (!optedIn) return false;

  if (IS_PRODUCTION) {
    console.error('🚨 ENABLE_TEST_PAYMENTS is set but NODE_ENV is production — refusing to enable test payments.');
    return false;
  }

  if (IS_DEPLOYED) {
    console.error('🚨 ENABLE_TEST_PAYMENTS is set on a deployed host — refusing to enable test payments.');
    return false;
  }

  console.warn('⚠️  TEST PAYMENTS ENABLED — tickets can be issued without payment. Local development only.');
  return true;
})();

/**
 * Fails loudly when the credentials for the resolved mode are missing, rather
 * than falling back to the other environment's keys. Called at startup for
 * visibility; payment handlers still check again before use.
 */
export const assertPaymentConfig = () => {
  const required = IS_PRODUCTION
    ? ['PHONEPE_PROD_MERCHANT_ID', 'PHONEPE_PROD_SALT_KEY', 'PHONEPE_PROD_SALT_INDEX']
    : ['PHONEPE_DEV_MERCHANT_ID', 'PHONEPE_DEV_SALT_KEY', 'PHONEPE_DEV_SALT_INDEX'];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length) {
    console.error(
      `🚨 Missing PhonePe credentials for ${NODE_ENV}: ${missing.join(', ')}. ` +
      'Payments will fail until these are set.',
    );
    return false;
  }
  return true;
};

console.log('🌍 Environment:', NODE_ENV.toUpperCase(),
  IS_DEPLOYED ? '(deployed)' : '(local)',
  TEST_PAYMENTS_ENABLED ? '— TEST PAYMENTS ON' : '');
