import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './styles.css';
import { mountHeader } from './components/header/header.js';
import { mountFooter } from './components/footer/footer.js';
import { createRouter } from './router.js';
import { createAuthState } from './services/auth-state.js';

const auth = createAuthState();
const header = mountHeader(document.querySelector('#site-header'), {
  async onLogout() {
    const { logout } = await import('./services/auth-service.js');
    await logout();
    await auth.refresh();
    router.navigate('/', { replace: true });
  },
});
const unmountFooter = mountFooter(document.querySelector('#site-footer'));
const router = createRouter(document.querySelector('#main-content'), header.update, { auth });
void auth.initialize();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    auth.dispose();
    router.dispose();
    header.unmount();
    unmountFooter();
  });
}
