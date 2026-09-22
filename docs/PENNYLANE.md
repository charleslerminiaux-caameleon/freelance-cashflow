# Pennylane direct integration

Configure `PENNYLANE_API_TOKEN` in the server environment, then start synchronization from the integrations page as the installation owner. Never expose this token with a `NEXT_PUBLIC_` variable. Pennylane Company API access requires an eligible Essential or higher subscription. Grant only `customer_invoices:readonly` and `customers:readonly`.

The adapter uses Company API v2 read endpoints:

- `GET https://app.pennylane.com/api/external/v2/customer_invoices?limit=100`, following `next_cursor` while `has_more` is true.
- `GET https://app.pennylane.com/api/external/v2/customers/{id}` to resolve the customer name. Company and individual customers both supply `name`. Each customer is loaded once per synchronization.

Provider-supplied hyperlinks are ignored and HTTP redirects are refused. Authorization and response bodies never appear in application errors. The adapter makes no writes to Pennylane.

## Imported data and limitations

Only finalized EUR customer invoices with supported statuses are imported. Drafts and credit notes are skipped and counted separately. Supported statuses are `upcoming`, `late`, `partially_paid`, `paid`, and `cancelled`. All other states, including `partially_cancelled`, `archived`, `incomplete`, proformas and estimates, reject the complete snapshot instead of silently publishing partial data. Credit notes themselves are not imported or netted against revenue; the skipped count must be considered when interpreting revenue totals.

Totals use exact decimal strings from `currency_amount_before_tax`, `currency_tax`, and `currency_amount`. Conversion to integer cents uses integer arithmetic and rejects fractional cents, unsafe amounts, and inconsistent totals. Non-EUR invoices are rejected because the current dashboard does not perform currency conversion.

The outstanding receivable comes from `remaining_amount_with_tax`. The imported settled amount is invoice TTC minus that outstanding amount, or full TTC when `paid` is true. This is Pennylane settlement knowledge; it does not prove a matching cash receipt. When an unpaid invoice has no remaining amount, synchronization fails rather than assuming zero paid. Invalid dates, missing customers, inconsistent paid flags or amounts also fail the snapshot. Payment dates are always unknown (`paid_at = null`); invoice dates and synchronization dates are never used as payment dates.

Publication is atomic. Existing Pennylane objects missing from a later API response remain in Libra: absence is not evidence of cancellation or deletion. Imported invoice totals and payment amounts are managed by Pennylane and cannot be edited through the normal local invoice/payment actions.

The adapter stops after 100 pages (at most 10,000 entries), bounds each response to 5 MiB, allows 10 seconds per request and 120 seconds for the complete read. Duplicate invoice identities or pagination cursors abort the snapshot. An oversized or slow account must be handled explicitly before increasing these bounds. A failed synchronization preserves the previous published data.

## Verification

The adapter suite runs without live credentials:

```sh
pnpm --filter @fc/integrations exec vitest run src/pennylane
pnpm --filter @fc/integrations exec tsc --noEmit
```

Fixtures follow the official schemas. A real account synchronization remains necessary to verify the installation's token, subscription, scopes and actual invoice states.

Official sources: [List customer invoices](https://pennylane.readme.io/reference/getcustomerinvoices), [Retrieve a customer](https://pennylane.readme.io/reference/getcustomer), [Company API introduction](https://pennylane.readme.io/docs/introduction).
