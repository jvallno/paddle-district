// @handle rules for player profiles (spec §4.1). Pure — node-tested.
const HANDLE_RE = /^[a-z0-9_]{3,20}$/;

// "  @Maria_D " → "maria_d". Does not validate; pair with isValidHandle.
export function normalizeHandle(input) {
  return String(input ?? '').trim().replace(/^@+/, '').toLowerCase();
}

export function isValidHandle(handle) {
  return HANDLE_RE.test(handle);
}

// Starting suggestion for the setup screen: "María Dela Cruz" → "maria_dela_cruz".
// Always returns a valid handle; uniqueness is checked against Firestore later.
export function suggestHandle(displayName) {
  const base = String(displayName ?? '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20)
    .replace(/_+$/, '');
  if (base.length >= 3) return base;
  return (base ? `${base}_player` : 'player').slice(0, 20);
}
