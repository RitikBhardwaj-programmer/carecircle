/** localStorage key for the theme choice: "system" (default), "light" or "dark". */
export const THEME_KEY = "cc-theme";

/**
 * Runs in <head> before first paint, so the page never flashes the wrong theme.
 * It resolves "system" with prefers-color-scheme and sets data-theme on <html>.
 * Allowed by the existing CSP (script-src 'unsafe-inline'); it reads only this one key.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");var d=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.setAttribute("data-theme",d?"dark":"light");}catch(e){}})();`;
