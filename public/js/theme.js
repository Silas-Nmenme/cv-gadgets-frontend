(() => {
  const storageKey = 'cv-gadgets-theme';
  let currentTheme = 'light';

  try {
    const savedTheme = localStorage.getItem(storageKey);
    if (savedTheme === 'light' || savedTheme === 'dark') {
      currentTheme = savedTheme;
    }
  } catch (error) {
    console.error('The saved theme preference could not be read.', error);
  }

  document.documentElement.dataset.theme = currentTheme;
  window.CVGadgetsTheme = {
    current: () => currentTheme,
    set(theme) {
      if (theme !== 'light' && theme !== 'dark') {
        throw new TypeError('Theme must be "light" or "dark".');
      }

      currentTheme = theme;
      document.documentElement.dataset.theme = theme;
      try {
        localStorage.setItem(storageKey, theme);
        return true;
      } catch (error) {
        console.error('The theme preference could not be saved.', error);
        return false;
      }
    },
  };
})();
