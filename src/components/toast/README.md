# Toast notifications

The application shell initializes one notification container in `src/main.js`. It lives outside the router's page region, survives History API navigation, and is disposed on hot reload. Pages may import:

```js
import { showError, showSuccess, showInfo } from '../../services/toast-service.js';

showError('The action could not be completed. Please try again.');
showSuccess('Your changes were saved.');
showInfo('Please review the details before continuing.');
```

Use short, curated UI messages. Do not pass raw errors, database responses, passwords, tokens, or codes. Text is rendered with `textContent`, never parsed as HTML. Error objects and recognized credential/token/code patterns fall back to generic copy; this is a safeguard, not a substitute for choosing safe messages.

Success and info toasts dismiss after 5 seconds; errors after 7 seconds. Bootstrap pauses dismissal while the user hovers/focuses a toast. Every notification includes a keyboard-accessible close button. Stable assertive/polite live regions exist before messages are inserted, and notification colors are supplemented by titles and icons. Showing a toast does not steal focus. Animations are disabled, including for users requesting reduced motion.

The stack is top-right, fits small screens, and holds at most three notifications. Identical type/message pairs are suppressed while visible and for one second after dismissal. Bootstrap instances, timers, and hidden-event listeners are disposed when a toast is removed. `clearToasts()` removes current messages; `disposeToasts()` also removes the container and global listeners. Initialization is idempotent.

## Existing integration

The listings, categories, and favorites mutation services publish curated success/error feedback through `utils/operation-feedback.js`; the shell's toast service listens using a native browser event. Data services do not import Bootstrap or manipulate DOM. Their queries, authentication checks, RLS behavior, results, and thrown errors remain unchanged. The event helper is inert outside a browser.

- Successful create/update/delete operations show their corresponding messages.
- Favorites additions/removals notify only after the actual operation; removing an already-absent favorite stays quiet.
- Validation errors remain the caller's responsibility and do not toast.
- Permission/auth-required, duplicate, and other operation errors use safe copy. The original error is rethrown for normal handling.
- An error object already reported by an operation is not reported again as an unexpected unhandled error. Callers should retain useful inline feedback and avoid adding a second toast for a mutation service error.
- Home keeps section errors/retry buttons and adds one shared deduplicated error toast when marketplace loading fails. Late responses after unmount remain ignored.
- The existing non-admin redirect from `/admin` adds permission feedback. The guard and redirect destination are unchanged.
- Unexpected uncaught application errors/rejections get a generic message, never their raw details. Resource/image error events are not treated as uncaught application errors.

Successful reads, navigation, search, login, registration, and logout do not trigger routine toasts. Authentication and form errors remain inline. Listing/category/favorite UI pages still have their existing scope; no forms or buttons were added to demonstrate notifications. Upload notifications are deferred until image upload functionality exists.

## Verification

Run `npm test`, `npm run test:auth`, and `npm run build`. Service tests use mocked queries to verify success/error feedback, silent validation/reads, and unchanged return/error behavior.

`scripts/verify-toasts.mjs` uses an independently installed Playwright tool, not a new application dependency. Start Vite; optionally set `TOAST_TEST_URL` (default `http://127.0.0.1:5180`), `PLAYWRIGHT_MODULE_PATH` to the tool's index.mjs, and `CHROME_PATH` to an installed Chrome executable. Run `node scripts/verify-toasts.mjs`.

Browser verification covers all variants, configured auto-dismiss times, manual/keyboard dismissal, duplicates, bounded stacks, text/credential safety, live regions, 320px placement, navigation persistence, singleton initialization, disposal, inline auth/validation errors, silent login/logout, and existing admin-denial feedback. It writes no marketplace records and does not change any account passwords or roles. Screenshots are saved under ignored `node_modules/.toast-verification/`.
