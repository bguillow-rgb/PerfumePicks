// Split a long article title into the question it answers and the rest, so
// lists can set the question as the headline and the remainder quieter.
export function splitTitle(t: string): [string, string] {
  const q = t.indexOf('? ');
  if (q > 0) return [t.slice(0, q + 1), t.slice(q + 2)];
  const c = t.indexOf(': ');
  if (c > 0) return [t.slice(0, c), t.slice(c + 2)];
  return [t, ''];
}
