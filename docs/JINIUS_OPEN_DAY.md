# Jinius Open Day — API checklist

Official Open Day stated for **Tuesday 24 November 2026 at 17:30** (confirm joining details with organizer). Hackathon: 27–29 November 2026.

Ask the organizers / Jinius technical mentors:

1. Are invoice listing/details APIs available to hackathon teams? What version, base URL and sandbox schema?
2. Can we query supplier IDs, company registration numbers, creditor accounts, invoice references and status/amount history legally in the demo environment?
3. Are remittance or completed payment histories available? Which test cases and how many historic records?
4. How do we authenticate (OAuth2, API keys, scopes, token lifetimes) and obtain **sandbox-only credentials**?
5. Which actions (if any) are permitted: read invoices, receive events, create remittance advice, or initiate a payment? We are comfortable remaining read-only.
6. Rate limits, webhook signing, pagination, reconciliation identifiers and error formats?
7. Are there prebuilt synthetic suppliers / duplicate-payment / account-change cases we can demonstrate?
8. How is 'Best Use of Jinius APIs' judged? Is one deep integration preferred to multiple shallow ones?
9. Can screenshots of sandbox data be used in final demos and public presentations?
10. How should we credit Jinius and display integration status without falsely implying official endorsement?

**Integration proof checklist**

- Secure server-side token only (never client JS).
- Successful documented authenticated test request with redacted logs.
- Typed normalized invoice object with source ID and sync timestamp.
- Deterministic risk engine uses that object as an input.
- UI shows 'Jinius sandbox connected' **only when a real request succeeds**.
- Fallback synthetic fixture mode labeled plainly.
- No real money sent or real client data used.

Useful official links:
- https://bochackathon.net/en/
- https://help.jinius.com.cy/hc/en-us/articles/23333712658961-How-to-get-your-API-Key
- https://business.jinius.com.cy/services/
