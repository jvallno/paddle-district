// App entry: registers routes and starts the hash router. Firebase / auth are
// not wired yet — they arrive with the first feature that needs them.
import { createRouter } from './router.js';
import { init as home } from '../features/home/home.js';

const routes = {
  home,
};

const view = document.getElementById('view');
createRouter(routes, { container: view, fallback: 'home' }).start();
document.getElementById('boot')?.remove();
