# Top 20 working audit — October 4, 2026

Scope: the 40 AI and non-AI priorities in the completeness review. This pass checked the current local source trees for a reproducible regression before considering a revert. It did not treat a stopped server as a broken application.

| # | App | Current local check |
| ---: | --- | --- |
| 1 | homeservices | Typecheck, unit suite, production build passed. |
| 2 | beautyhqio | Typecheck, unit suite, production build passed. |
| 3 | ai-proposal-grant-development-workspace | Typecheck, test suite, production build passed. |
| 4 | petGrooming | Typecheck, unit suite, production build passed. |
| 5 | independentRestaurant | Typecheck, unit suite, production build passed. |
| 6 | AIReviewResponseManager | Backend governance tests and frontend build passed. |
| 7 | AIProposalSOWGenerator | Backend governance tests and frontend build passed. |
| 8 | AIAccessibilityAuditAgent | Backend tests and frontend build passed. |
| 9 | ai-parcel-ltl-invoice-audit-recovery | Backend tests and frontend build passed. |
| 10 | ai-commercial-lease-cam-reconciliation | Backend tests and frontend build passed. |
| 11 | ai-marketplace-seller-fee-reimbursement-recovery | Backend tests and frontend build passed. |
| 12 | ai-certified-payroll-and-prevailing-wage-control | Typecheck, test suite, production build passed. |
| 13 | AIPhotographyBusinessManager | Backend governance tests and frontend build passed. |
| 14 | AICommercialCleaningOperations | Backend tests and frontend build passed. |
| 15 | AIInvoiceProcessing | Test suite passed; frontend is static and has no build script. |
| 16 | AIConstructionBidAnalyzer | Server tests and client build passed. |
| 17 | AIDanceStudioManager | Server tests and client build passed. |
| 18 | AIMenuDigitizer | Backend tests, backend build, frontend build passed. |
| 19 | ai-restaurant-delivery-platform-commission-recovery | Backend tests and frontend build passed. |
| 20 | AIContentRepurposingEngine | Backend tests and frontend build passed. |

`git diff --check` passed in all 20 repositories. Several normal test commands skip database-gated cases; the [implementation status](TOP20_IMPLEMENTATION_STATUS_2026-10-04.md) records earlier disposable-database integration checks. This audit did not start all 20 apps, apply operational migrations, exercise public deployments, or accept live providers/devices. The source changes remain local and uncommitted.

**Decision:** No application was confirmed broken by a current local change, so no code was reverted. If a specific public deployment or user journey fails, reproduce it against that app and revert or fix the offending change without discarding unrelated work.
