/**
 * Account adapter v1 (synchronous, fail closed).
 * session(req) -> {id}|null; account(id) -> {id}|null; memberships(id) -> array.
 * isOpen() must be false while unavailable. A read error must throw, not look
 * like deletion. IDs are stable opaque strings, never reassigned.
 * csrfBinding(req) binds forms to the authenticated browser session.
 * loginURL(path) returns a local sign-in path preserving the return location.
 * close() releases resources. No email or profile content crosses this boundary.
 */
export function validateAccountAdapter(adapter) {
  for(const method of ['session','account','memberships','isOpen','csrfBinding','loginURL','close']) {
    if(typeof adapter?.[method]!=='function')throw new TypeError('Account adapter v1 requires '+method);
  }
  return adapter;
}
