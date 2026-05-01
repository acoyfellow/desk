// Wrangler's `rules` config (see wrangler.jsonc) makes *.html imports
// available as text strings at build time.
declare module "*.html" {
  const value: string;
  export default value;
}
