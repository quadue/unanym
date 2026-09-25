# A website with a hosted authentication backend

A confidential OIDC client may register `authentication_origin` when its callback
is served by a separate authentication backend, such as its own Supabase project.
Its `homepage` still identifies the actual website on the consent screen.

```json
{
  "client_id": "example-community",
  "name": "Example community",
  "homepage": "https://community.example/",
  "authentication_origin": "https://project.supabase.co",
  "redirect_uris": ["https://project.supabase.co/auth/v1/callback"],
  "token_endpoint_auth_method": "client_secret_basic"
}
```

The operator explicitly registers the HTTPS origin and exact redirect URI. The
client secret stays in the private secret store. Public clients cannot use this
option. The existing one-host-per-client-sector constraint remains in force;
register separate backend projects for unrelated sites.

The backend receives the information the member shares with that website and is
part of its trust boundary. A homepage is a display address, not an additional
redirect URI or CORS permission. The identifier still belongs to this client.

For CoCo's first integration the only requested scopes are `openid profile`.
Supabase verifies the issuer, signatures, audience and nonce and runs the OAuth
code flow with PKCE. Its authorization parameters explicitly request
`claims={"id_token":{"name":{"essential":true}}}` using OIDC's standard claims
parameter, because this provider consumes the ID token rather than UserInfo.
Only the member's chosen name is added; other profile/membership claims do not
automatically move into ID tokens. Email is optional and Unanym does not issue one. Existing
accounts use explicit Supabase `linkIdentity`; no email/name matching is added.
External membership approval is not used for CoCo admission. A Supabase session
has its own lifetime: disconnecting at Unanym stops future Unanym authentication,
but does not revoke an already-issued CoCo session. Receiving sites must add
current-membership checks before using memberships to protect any content.

## Independent member sign-in

Use the standalone entry point when the identity service has its own domain and
email-code accounts. The FRRN adapter intentionally redirects unauthenticated
members to FRRN and is not an independent sign-in installation. A public docs
site alone does not supply an issuer: route the standalone service separately
and register its discovery URL with the website's authentication backend.

Treat this as a new issuer, with a new private data directory and client secret.
Do not change an existing store's issuer or match accounts by email. Before
switching an existing client, establish whether either side has linked members;
a non-empty installation needs a deliberate, explicit continuity plan. Preserve
older issuers for clients that still use them. The standalone regression covers
cold email-code sign-in, the selected name in a verified ID token, no email
claim, and a returning visit that retains its subject after one consent.
