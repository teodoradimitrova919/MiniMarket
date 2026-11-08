import html from './dashboard.html?raw';
import './dashboard.css';
import { showError } from '../../services/toast-service.js';

export const title = 'Dashboard';

export function mount(container, { auth }) {
  container.innerHTML = html;
  const userId = auth.getState().user.id;
  const username = auth.getState().profile?.username;
  container.querySelector('[data-dashboard-greeting]').textContent = username ? `Good to see you, ${username}.` : 'Good to see you.';
  const status = container.querySelector('[data-dashboard-status]');
  const content = container.querySelector('[data-dashboard-content]');
  const empty = container.querySelector('[data-dashboard-empty]');
  const events = new AbortController();
  let active = true;
  let loading = false;
  const isCurrent = () => active && auth.getState().user?.id === userId;

  function feedback(message, retry = false) {
    const panel = document.createElement('div');
    panel.className = 'dashboard-feedback';
    panel.setAttribute('role', retry ? 'alert' : 'status');
    const text = document.createElement('p');
    text.textContent = message;
    panel.append(text);
    if (retry) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'btn btn-outline-success'; button.textContent = 'Try again';
      button.addEventListener('click', load, { signal: events.signal });
      panel.append(button);
    }
    status.replaceChildren(panel);
  }

  async function load() {
    if (loading || !isCurrent()) return;
    loading = true;
    content.hidden = true;
    status.setAttribute('aria-busy', 'true');
    feedback('Loading your dashboard…');
    try {
      const { getDashboardStats } = await import('../../services/dashboard-service.js');
      const stats = await getDashboardStats();
      if (!isCurrent()) return;
      const numbers = new Intl.NumberFormat();
      container.querySelector('[data-stat-listings]').textContent = numbers.format(stats.totalListings);
      container.querySelector('[data-stat-favorites]').textContent = numbers.format(stats.totalFavorites);
      container.querySelector('[data-stat-categories]').textContent = numbers.format(stats.totalCategoriesUsed);
      empty.hidden = stats.totalListings > 0 && stats.totalFavorites > 0;
      if (!empty.hidden) {
        const noListings = stats.totalListings === 0;
        container.querySelector('[data-empty-title]').textContent = noListings ? 'Your next chapter starts here.' : 'A little room for your next favorite.';
        container.querySelector('[data-empty-message]').textContent = noListings
          ? 'You haven’t posted any listings yet. Explore the marketplace or add your first advertisement when you’re ready.'
          : 'You haven’t saved any favorites yet. Browse the marketplace and discover something you like.';
      }
      status.replaceChildren();
      content.hidden = false;
    } catch {
      if (isCurrent()) {
        feedback('We couldn’t load your dashboard. Please try again.', true);
        showError('Your dashboard could not be loaded. Please try again.');
      }
    } finally {
      loading = false;
      if (isCurrent()) status.setAttribute('aria-busy', 'false');
    }
  }
  void load();
  return () => { active = false; events.abort(); };
}
