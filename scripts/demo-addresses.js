// Separate local ports let a review run alongside an existing demonstration.
const port = (name, fallback) => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1024 || value > 65535) throw new Error(`Invalid ${name}`);
  return value;
};
export const identityPort = port('UNANYM_DEMO_PORT', 4080);
export const sitePort = port('UNANYM_DEMO_SITE_PORT', 4081);
if (identityPort === sitePort) throw new Error('The demonstration needs two different ports');
export const identityOrigin = `http://localhost:${identityPort}`;
export const siteOrigin = `http://127.0.0.1:${sitePort}`;
