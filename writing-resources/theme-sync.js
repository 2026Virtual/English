(() => {
  const storageKey = "english-learning-theme";
  let theme = "light";

  try {
    const storedTheme = localStorage.getItem(storageKey);
    if (storedTheme === "dark" || storedTheme === "light") theme = storedTheme;
  } catch (error) {
    // Keep the default theme when storage is unavailable.
  }

  document.documentElement.dataset.theme = theme;

  let themeColor = document.querySelector('meta[name="theme-color"]');
  if (!themeColor) {
    themeColor = document.createElement("meta");
    themeColor.name = "theme-color";
    document.head.append(themeColor);
  }
  themeColor.content = theme === "dark" ? "#000000" : "#0f766e";
})();
