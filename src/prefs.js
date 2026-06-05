export const getPref = (key, def) => {
  try {
    const p = JSON.parse(localStorage.getItem('pf_prefs') || '{}')
    return p[key] !== undefined ? p[key] : def
  } catch { return def }
}
