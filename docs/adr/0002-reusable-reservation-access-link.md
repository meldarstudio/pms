# Keep reservation access links reusable

Staff need to re-share a saved reservation's original guest link without invalidating copies already sent. The backend stores the read-only bearer token itself, rather than only a hash, so the staff route can return that same link; storing a second hashed copy alongside it provided no protection (#284).

The trade-off is that database access exposes usable links until they expire. Keep token retrieval behind staff authentication or the originating checkout's bearer, and keep token responses non-cacheable. The guest summary token is scoped to one reservation and cannot authorize checkout payments or staff actions.
