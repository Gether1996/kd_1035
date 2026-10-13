/** Every page a visitor can reach without signing in. Czech pages are the same under /cz. */
export const PUBLIC = [
  '/',
  '/o-nas',
  '/navody',
  '/navody/commanderi',
  '/navody/vybava',
  '/navody/eventy',
  '/navody/tipy',
  // rendered in the browser from the API (RenderMode.Client); an auto-updated guide, so it exists on every database
  '/navody/commanderi/pary-pre-jazdu',
  '/kalendar',
  '/slovnik',
  '/podmienky',
  '/ochrana-udajov',
];

/** Pages for players: without a session they show the sign-in prompt and are `noindex`. */
export const ACCOUNT = ['/ucet', '/pripomienky', '/marche', '/kvk', '/vyhodnocovanie'];

/** Addresses that do not exist: the 404 page in the language of the address. */
export const MISSING = ['/xyz', '/cz/xyz', '/navody/neexistuje', '/navody/commanderi/neexistuje'];

export const cz = (path: string) => (path === '/' ? '/cz' : `/cz${path}`);

/** SK and CZ variant of every path. */
export const both = (paths: string[]) => paths.flatMap((p) => [p, cz(p)]);
