# Legacy browser fixture

This package exists only to exercise earlier wire formats in regression tests.
It is not a supported integration release. WordPress is the current target.

The test host supplies its loopback issuer, client ID and callback. Never ship
this fixture configuration to a real site. Signing in to a browser page does
not protect public documents or create a server-side member area.
