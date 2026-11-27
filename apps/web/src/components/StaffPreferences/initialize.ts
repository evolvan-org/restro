export const initializeStaffPreferences = `
(() => {
  const root = document.documentElement;
  const media = matchMedia('(prefers-color-scheme: dark)');
  const render = () => {
    const theme = root.dataset.restroTheme;
    root.classList.toggle('dark', theme === 'dark' || (theme !== 'light' && media.matches));
  };
  const read = () => {
    try {
      const theme = localStorage.getItem('restro-theme');
      const locale = localStorage.getItem('restro-locale');
      root.dataset.restroTheme = theme === 'dark' || theme === 'light' ? theme : 'system';
      root.lang = locale === 'es' || locale === 'fr' ? locale : 'en';
    } catch {}
    render();
  };
  read();
  media.addEventListener('change', render);
  addEventListener('storage', (event) => {
    if (event.key === null || event.key === 'restro-theme' || event.key === 'restro-locale') read();
  });
})();
`;
