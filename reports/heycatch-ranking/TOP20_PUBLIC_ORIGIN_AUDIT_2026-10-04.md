# Top 20 public-origin audit — October 4, 2026

## Finding

The earlier local build and API checks did not exercise a browser opening each app through a public hostname. AIContentRepurposingEngine exposed a real CORS failure in that situation: its frontend proxy forwarded the public `Origin` header to a backend allowlist containing only local origins. A separate browser-side problem existed in four other apps: their API address was `localhost`, which points at the visitor's own device.

## Source audit and changes

| Rank | App | Public-origin result |
| ---: | --- | --- |
| 1–5 | homeservices, beautyhqio, ai-proposal-grant-development-workspace, petGrooming, independentRestaurant | No browser API request to a loopback backend found. Homeservices and beautyhqio have server-side localhost URL fallbacks; set their public application URL variables when deployed. |
| 6 | AIReviewResponseManager | Fixed browser localhost API fallback and added a same-origin `/api` proxy. |
| 7 | AIProposalSOWGenerator | Fixed six browser localhost API fallbacks and added a same-origin `/api` proxy. |
| 8 | AIAccessibilityAuditAgent | Fixed launcher-provided browser API URL from loopback to `/api`; existing Vite proxy handles it. |
| 9–12 | Four recovery apps and ai-certified-payroll-and-prevailing-wage-control | No browser API request to a loopback backend found. |
| 13 | AIPhotographyBusinessManager | Fixed localhost API fallbacks in 31 frontend files; proxy now targets the backend port independently of the browser API setting. |
| 14 | AICommercialCleaningOperations | Replaced the fixed-port CRA proxy with a backend-port-aware `/api` proxy. |
| 15 | AIInvoiceProcessing | Its hand-written frontend proxy now handles a request from its own public host without forwarding that host's `Origin` to the local-only backend CORS allowlist. |
| 16–19 | AIConstructionBidAnalyzer, AIDanceStudioManager, AIMenuDigitizer, ai-restaurant-delivery-platform-commission-recovery | No browser API request to a loopback backend found; browser API calls use same-origin routes/proxies. |
| 20 | AIContentRepurposingEngine | Current tunnel's exact origin was added to the ignored local `.env`; frontend proxy now handles same-origin public requests when the incoming `Host` is preserved. |

The new proxies remove an `Origin` header only when its URL host matches the incoming request's `Host`. Requests with other origins retain the header and remain subject to each backend's CORS policy. The browser API variables in the ignored local `.env` files for ranks 6, 7, 8, and 13 were set to relative URLs; no secret values were copied to this report.

## Verification and limits

- Review Response, Photography, Cleaning, and Accessibility Audit frontend builds passed. Proposal/SOW built with existing lint warnings; `CI=true` treats those existing warnings as errors.
- Mock backend smoke checks passed for the `/api/health` route in Review Response, Proposal/SOW, Photography, Cleaning, Invoice Processing, and Content Repurposing: own-host `Origin` reached the backend, unrelated `Origin` stayed blocked.
- The current Content Repurposing public page returned HTTP 200 after its access gate. Its app dashboard was also exercised through that public URL earlier in this session.
- The current Content Repurposing access gate rewrites `Host` to a local address, so its exact public origin still needs to remain in the backend allowlist. The source proxy fix applies when a public host reaches the frontend unchanged.
- The other 19 apps were **not** opened through public tunnels in this audit. A local source scan and mock proxy check do not prove a complete live deployment. Direct cross-origin API clients still require an exact allowed public origin in deployment configuration.
