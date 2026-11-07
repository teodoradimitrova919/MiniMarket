import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './styles.css';
import { mountHeader } from './components/header/header.js';
import { mountFooter } from './components/footer/footer.js';
import { createRouter } from './router.js';

const header = mountHeader(document.querySelector('#site-header'));
const unmountFooter = mountFooter(document.querySelector('#site-footer'));
const stopRouter = createRouter(document.querySelector('#main-content'), header.update);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    stopRouter();
    header.unmount();
    unmountFooter();
  });
}
