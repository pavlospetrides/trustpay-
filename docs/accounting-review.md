# Accounting review and Cyprus VAT

`POST /api/v1/accounting/review` answers the brief's second question, "is this invoice mathematically and financially consistent, and how should it be booked?", separately from the fraud score. It is review item 11 of the financial-controls review, first slice.

**Principles**
- Deterministic TypeScript on integer cents (`frontend/src/lib/server/accounting/`). No AI decides a rate, a treatment or an entry.
- Stateless: nothing is stored, posted to a ledger or filed. Every result is a suggestion for an authorised accountant.
- Confirmed errors are kept apart from possible tax issues. Missing amounts are reported, never invented. VAT is never assumed recoverable.
- Buyer details are never assumed. The Cyprus VAT treatment, the Cyprus-specific notes and the draft entry are given only when the buyer is confirmed to be in Cyprus (by `country` or a `CY` VAT number) **and** `vat_registered` is supplied. Otherwise the arithmetic checks, rate checks and category suggestions still run, and the review asks for the missing details or reports that a non-Cyprus buyer is out of scope.
- Any authenticated organization member can call it (PostgreSQL mode); the local demo serves it without sign-in.

## Input

JSON, amounts in integer cents, rates as text (`"19"`, `"19%"`).

```json
{
  "document_type": "invoice",
  "invoice_date": "2026-11-20",
  "currency": "EUR",
  "supplier": { "name": "Aegean Supplies Synthetic Ltd", "country": "CY", "vat_number": "CY10012345A" },
  "buyer": { "country": "CY", "vat_registered": true },
  "totals": { "net_cents": 100000, "vat_cents": 19000, "gross_cents": 119000 },
  "vat_breakdown": [{ "rate": "19", "net_cents": 100000, "vat_cents": 19000 }],
  "lines": [{ "description": "Printing paper and toner", "quantity": "10", "unit_price_cents": 10000, "net_cents": 100000, "vat_rate": "19", "vat_cents": 19000 }],
  "capitalisation_threshold_cents": 100000
}
```

`document_type` (`invoice` or `credit_note`), `vat_breakdown`, `lines` and the threshold are optional. `buyer.country` and `buyer.vat_registered` are optional in the request, but without both (for a Cyprus buyer) no VAT treatment or entry is suggested. An organization may pass its own `categories` (`id`, `name`, `account`, `keywords`, optional `capitalisable`). The fields match what the universal invoice reader in PR #34 extracts (net, VAT, VAT breakdown, line items, supplier and buyer details), so a screen can pass reviewed values straight through.

## Output

- `status`: `errors_found`, `needs_review` or `consistent`.
- `findings`: each with `code`, `severity` (`error` = confirmed, `review` = accountant to decide, `info`), `field` and a plain message.
- `treatment`: a suggested VAT treatment with an explanation.
- `category` and per-line suggestions, each naming the keywords that matched.
- `journal`: a balanced draft entry, or `null` with `journal_unavailable_reason` when amounts are missing or wrong.
- `rules_version` and a disclaimer.

## Checks

| Code | Severity | When |
|---|---|---|
| `GROSS_MISMATCH` | error | net + VAT ≠ total |
| `LINE_AMOUNT_MISMATCH` | error | quantity × unit price − discount ≠ line net (±1 cent) |
| `LINE_VAT_MISMATCH`, `BREAKDOWN_VAT_MISMATCH` | error | VAT ≠ rate × net, rounded half up (±1 cent) |
| `LINES_NET_MISMATCH`, `LINES_VAT_MISMATCH`, `BREAKDOWN_TOTAL_MISMATCH` | error | parts do not add up to the totals |
| `RATE_NOT_CYPRUS` | error for a Cyprus supplier, review if the country is unknown | a stated rate that is not a Cyprus rate on the invoice date |
| `IMPLIED_RATE_UNUSUAL` | review | no rates stated and VAT ÷ net matches no single rate |
| `MISSING_NET_OR_VAT` | review | the document lacks net or VAT, so nothing can be checked |
| `INPUT_VAT_RECOVERABILITY` | review | domestic VAT charged to a VAT-registered Cyprus buyer: confirm taxable use and no blocked item before claiming |
| `MISSING_SUPPLIER_VAT_NUMBER` | review | VAT charged without the supplier's VAT number |
| `ZERO_RATED_OR_EXEMPT` | review | a Cyprus supplier charges no VAT |
| `POSSIBLE_DOMESTIC_REVERSE_CHARGE` | review | construction (Article 11B), scrap, or phones and tablets (Article 11E) wording from a Cyprus supplier, buyer VAT-registered |
| `EU_REVERSE_CHARGE` | review | an EU supplier charges no VAT: the buyer self-accounts |
| `FOREIGN_VAT_CHARGED` | review | foreign VAT is not recoverable through the Cyprus return |
| `NON_EU_SUPPLY` | review | services: reverse charge; goods: import VAT at customs |
| `BUYER_DETAILS_MISSING` | review | the buyer's country or VAT registration status is missing: no Cyprus treatment or entry until both are given |
| `BUYER_OUTSIDE_SCOPE` | review | the buyer is outside Cyprus: Cyprus treatment and the entry are outside this review's scope |
| `SUPPLIER_COUNTRY_UNKNOWN` | review | the treatment cannot be suggested safely |
| `CAPITALISATION_REVIEW` | review | equipment at or above the threshold (default €1,000) |
| `CATEGORY_NOT_RECOGNISED` | review | no category keyword matched |
| `NON_EUR_CURRENCY` | review | the VAT return is in euro |
| `CREDIT_NOTE`, `BUYER_NOT_VAT_REGISTERED` | info | the entry is reversed, or VAT becomes part of the cost |

## Draft journal entry

- Domestic, buyer VAT-registered: debit expense (net) and "Input VAT (recoverability to confirm)", credit "Accounts payable – supplier" (gross).
- EU reverse charge and domestic reverse charge: the same, plus a self-assessed debit "Input VAT – reverse charge" and credit "Output VAT – reverse charge" at the 19% standard rate, marked "confirm the applicable rate".
- Foreign VAT, non-EU supplies, or a buyer that is not VAT-registered: VAT is added to the cost, split across lines to the cent.
- Credit notes reverse every line. Every entry balances; the code refuses to return one that does not.

## Cyprus VAT rates used

| Rate | From | Source |
|---|---|---|
| 19% standard, 9% and 5% reduced, 0% | 13 January 2014 | [PwC Worldwide Tax Summaries](https://taxsummaries.pwc.com/cyprus/corporate/other-taxes) |
| 3% (books, newspapers, periodicals, orthopaedic and disability items) | 21 July 2023, Law 75(I)/2023 | [EY Global Tax News](https://globaltaxnews.ey.com/news/2023-1270-cyprus-introduces-3-percent-vat-rate-and-adds-goods-to-0-percent-vat-list) |

The temporary 0% on certain basic goods runs to 31 December 2026 (Decree 337/2025, [KPMG](https://kpmg.com/us/en/taxnewsflash/news/2025/12/cyprus-extension-zero-vat-rate-reduced-educational-buildings.html)). Domestic reverse-charge categories follow [EY's summary of the 2020 amendments](https://globaltaxnews.ey.com/news/2020-6158-cyprus-amends-vat-law-to-improve-tax-collection-and-address-vat-fraud). These were checked on 25 November 2026 from adviser publications; the Tax Department's own pages were not reachable from the tools used. **Confirm against the VAT Law 95(I)/2000 and current Tax Department guidance before relying on them for a filing**, and re-check the 0% decree after 31 December 2026.

Which goods take which reduced rate is a legal classification, so the review checks that a stated rate exists and that the sums are right; it does not decide which rate a product should carry.

## Limits and next steps

- No screen calls it yet. The universal invoice reader that extracts net, VAT, VAT breakdown and line items reached `main` with PR #41, so the next step is to pass its reviewed fields, plus the organization's own country and VAT registration, into this review on the invoice screens (GUI owner).
- Organization category lists are passed per request; storing them per organization needs a table (schema change).
- Keyword categories are simple rules. They explain themselves, but they are not a classifier; the accountant decides.
- Partial exemption, blocked-input rules, import VAT and the 0% product lists are flagged for review, not computed.
