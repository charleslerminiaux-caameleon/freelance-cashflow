# bunq adapter

Server entry point: `createBunqProvider({ apiKey, contextPath, fetch? })`.

For a personal installation accessing only the owner's bank, generate a production API key in the bunq app. Public applications must instead implement bunq OAuth. See [API keys](https://doc.bunq.com/basics/authentication/api-keys) and [authentication](https://doc.bunq.com/basics/authentication). The API key has broad permissions even though this adapter only reads banking data.

Supply a persistent `contextPath` outside public/static directories and exclude it from Git/backups that are not encrypted. The application uses `.libra/bunq-context.json`. The adapter stores its generated RSA private key, installation token, server verification key and API-key fingerprint atomically with mode `0600`; the parent directory is created with mode `0700`. This file contains secrets. The API key itself and session token are not written. A new process reuses the installation/device and opens a fresh session; changing the API key creates a new context. Do not delete the file while keeping the same registered API key. Omit the path/use `null` only for ephemeral fixtures. Local disk must persist across app restarts. Concurrent syncs must be serialized by the existing provider lock.

The adapter calls POST `/installation`, POST `/device-server` and POST `/session-server` for authentication. It does not enable wildcard IP access. Follow bunq's [device registration](https://doc.bunq.com/tutorials/your-first-payment/creating-the-api-context/device-registration) requirements for the server's IPv4 address. Requests with bodies are RSA-SHA256 signed; responses after installation require a valid server signature. Failed/expired sessions fail the sync; the next run starts a fresh session.

Banking operations are GET `/user/{id}/monetary-account-bank` and GET `/user/{id}/monetary-account/{id}/payment`. This covers bank accounts and booked payments, including card payments once booked. Savings/investment account types and pending card authorizations are not imported. Payment timestamps are interpreted as UTC and converted to the business timezone. Transaction amounts are absolute integer cents plus direction; source currency is preserved. Every run reads all booked history through `older_url`, so edits to old records are picked up. Only pagination links with the same origin and exact account path are accepted. Duplicates, malformed values, account mismatches or bad signatures fail the entire run.

No live bank calls were used in verification. Fixtures cover authentication signatures, context reuse, file mode, masked IBANs, dates, amounts, malicious pagination and repeated payment rows. Validate live account access/IP binding once the owner's credentials are configured.

Contract source: [official bunq OpenAPI](https://github.com/bunq/doc/blob/develop/swagger.json), [pagination](https://doc.bunq.com/basics/pagination), [signing](https://doc.bunq.com/basics/signing).
