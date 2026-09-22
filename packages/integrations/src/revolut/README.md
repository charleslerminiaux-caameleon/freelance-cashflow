# Revolut Business adapter

Server entry point: `createRevolutProvider({ clientId, refreshToken, privateKey, issuer, fetch? })`.

Use Revolut **Business**, with Business API access (Grow or higher); personal Revolut and Revolut Open Banking are different APIs. Follow the official [Business API setup](https://developer.revolut.com/docs/guides/manage-accounts/get-started/make-your-first-api-request) to register a public certificate and redirect URI, authorize **READ** scope, and exchange the authorization code for the refresh token. `issuer` is the redirect URI hostname required by Revolut, `clientId` is the registered application ID, and `privateKey` is the PEM RSA private key matching that certificate. Keep all four values exclusively on the server. The adapter generates a five-minute RS256 client assertion, obtains an access token, and refreshes it before expiration. It does not execute the initial interactive consent flow.

GET `/accounts` and GET `/transactions` are the only banking operations. The latter uses the documented 1,000-row `created_at`/exclusive `to` pagination, preserving sub-millisecond timestamps and account-specific transaction legs. Transaction values are absolute cents plus direction; account balances retain their sign. Currency is preserved; values that cannot be represented in integer hundredths are rejected. IBAN is not requested.

Create a fresh provider per synchronization. Every run rescans historical transactions because a creation-time cursor cannot detect updates to old payments. `updatedFrom` deliberately does not restrict the fetch. An explicitly supplied `initialCreatedFrom` remains a creation-time lower bound; otherwise all history is read. Unexpected statuses, account mismatches, duplicate rows, malformed timestamps, unsafe amounts, nonadvancing cursors and ambiguous equal-timestamp boundaries on a full page fail the run. Failed runs must not publish partial results.

No live credentials were used in verification; RSA assertion signatures, normalization, old-history replay, pagination and failures use local fixtures. Credential expiry/revocation and actual account entitlements still need validation on the user's own account.

Contract source: [official Business API OpenAPI](https://developer.revolut.com/docs/business/business-api).
