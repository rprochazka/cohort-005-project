# Notification delivery options for Cadence

Research for [#3](https://github.com/rprochazka/cohort-005-project/issues/3), part of map [#2](https://github.com/rprochazka/cohort-005-project/issues/2). Gathered 2026-11-12. This note reports trade-offs. It does not choose an option.

Question: how can a React Router 8 + SQLite app get **Notifications** to a signed-in user, either built in-house or through a hosted service? Live delivery is not a hard requirement.

## How Cadence is set up today

Facts from the repo that decide how well each option fits:

- **Runtime.** React Router `8.3.0` in framework mode with `ssr: true` (`react-router.config.ts`). It runs in production with `react-router-serve ./build/server/index.js` (`package.json`). There is no custom server file.
- **`react-router-serve` is Express plus `compression()`.** It calls `app.listen(...)` and keeps the HTTP server in a local variable. It never exposes the server and adds no `upgrade` listener. Source: [`packages/react-router-serve/cli.ts`](https://github.com/remix-run/react-router/blob/main/packages/react-router-serve/cli.ts).
- **Database.** One SQLite file (`data.db`) opened through `better-sqlite3` in WAL mode (`app/db/index.ts`). A file on local disk only works with **one server process on one machine**. Multi-instance fan-out is not a concern unless the database changes, and that is a much bigger decision (ADR 0006).
- **Session.** A signed cookie session that holds `userId` (`app/lib/session.ts`). Any resource route can tell who the user is.
- **App shell.** `app/routes/layout.app.tsx` has a `loader` that already queries per-user data on every request: user, team, course progress. A bell with an unread count fits naturally here. `sonner`'s `<Toaster>` is already mounted there for toasts.
- **Existing resource routes** follow the `api.*.ts` convention (`api.switch-user.ts`, `api.video-tracking.ts`).

## In-house delivery

In every in-house option the store is a Drizzle table in the same SQLite file. The options differ only in **how the browser finds out** that a new row exists.

### 1. Show on navigation (loader revalidation)

- **How:** the layout loader returns `unreadCount` and maybe the latest N Notifications. Marking a Notification read is a `<Form>` or `useFetcher` action.
- **React Router fit:** native. In framework mode with SSR, "route loaders are automatically revalidated after all navigations and form submissions", and actions revalidate every loader on the page ([Route Module](https://reactrouter.com/start/framework/route-module)). `shouldRevalidate` lets a route opt out if the query gets expensive (same page).
- **Complexity:** lowest. One table, one query in an existing loader, one action.
- **Infrastructure:** none.
- **Multiple tabs:** each tab updates the next time it navigates. An idle tab stays stale.
- **Multiple instances:** not relevant (stateless).
- **Latency:** as soon as the user clicks anything. Nothing arrives while they watch a video.

### 2. Polling

- **How:** call `useRevalidator().revalidate()` on a timer or on window focus. The docs list exactly this use: "revalidating on window focus or polling on an interval" ([useRevalidator](https://reactrouter.com/api/hooks/useRevalidator)). A lighter variant polls a small resource route (`api.notifications.ts`) with `useFetcher`, so it doesn't re-run the whole layout loader.
- **React Router fit:** native. It builds on option 1.
- **Complexity:** low. Two things to decide: the interval, and whether to pause when `document.hidden`.
- **Infrastructure:** none. The cost is one cheap indexed SQLite read per tab per interval.
- **Multiple tabs:** every open tab polls on its own. That's fine at this scale.
- **Latency:** at most one interval.

### 3. Server-Sent Events (SSE)

- **How:** a resource route whose `loader` returns `new Response(readableStream, { headers: { "Content-Type": "text/event-stream" } })`. Resource routes can return any `Response` ([Resource Routes](https://reactrouter.com/how-to/resource-routes)). The browser uses `EventSource`, which reconnects automatically. The `id` and `retry` fields support resuming with `Last-Event-ID` ([MDN: Using SSE](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)). The server needs an in-process event emitter. When code inserts a Notification it emits `userId`, and the open streams for that user write a frame.
- **React Router fit:** works, but the docs don't cover it. The Resource Routes page has nothing on streaming bodies or SSE.
- **Gotcha: compression.** `react-router-serve` applies Express `compression()` (see above). Its README says it "does not work out of the box with server-sent events", and the fix it gives is `res.flush()` ([compression README](https://github.com/expressjs/compression)). A React Router loader can't reach `res`. The default filter compresses any `text/*` type ([compressible](https://github.com/jshttp/compressible), `/^text\/|\+(?:json|text|xml)$/`), so `text/event-stream` would be buffered. The README says responses with `Cache-Control: no-transform` are never compressed. Setting that header on the SSE response should avoid the problem. Running a custom Express server would avoid it as well. I have not tested either fix here.
- **Complexity:** medium. The work is the stream lifecycle: abort on `request.signal`, keep-alive comment frames, removing listeners, and resuming missed events with `Last-Event-ID`.
- **Infrastructure:** none while there is one process. An in-memory emitter only reaches clients on the same process. Several instances would need pub/sub (Redis or similar) or sticky routing, but SQLite already rules out several instances.
- **Multiple tabs:** each tab holds one connection. Over HTTP/1.1, browsers allow **6 SSE connections per domain across all tabs**, and Chrome and Firefox have marked this "Won't fix". HTTP/2 negotiates the limit, which defaults to 100 (MDN, same page). Whether production serves HTTP/2 depends on the proxy in front of Node. A user with many Cadence tabs open over HTTP/1.1 could starve normal requests. A `BroadcastChannel` or leader-tab pattern avoids that, at the cost of more code.
- **Latency:** immediate.

### 4. WebSockets

- **How:** Node 22 ships only a WebSocket *client*. A server needs a library such as `ws`, attached to the HTTP server's `upgrade` event.
- **React Router fit:** poor with the current runtime. `react-router-serve` doesn't expose its server and adds no upgrade handler (see above). We would need a custom Express or Node entry, replace `npm start`, and wire up Vite dev mode as well. Auth on upgrade means parsing the cookie session by hand.
- **Complexity:** highest. It adds two-way messaging that Notifications don't need, because they only flow from server to client.
- **Infrastructure:** same as SSE (in-memory with one process, pub/sub or sticky sessions with several). Some proxies and hosts need extra configuration for upgrades.
- **Multiple tabs:** one socket per tab. The 6-connection HTTP/1.1 limit doesn't apply.
- **Latency:** immediate.

### In-house summary

| | Navigation | Polling | SSE | WebSockets |
|---|---|---|---|---|
| Fits `react-router-serve` as is | Yes | Yes | Yes, with `no-transform` caveat | No, needs custom server |
| New infrastructure | None | None | None (one process) | Custom server, `ws` |
| Complexity | Very low | Low | Medium | High |
| Idle-tab freshness | Stale | One interval | Live | Live |
| Multi-tab cost | None | N polls | N connections (6-per-domain limit on HTTP/1.1) | N sockets |

These options stack. Option 1 is the base of options 2 and 3, and polling or SSE can be added later without changing the data model.

## Hosted services

Every vendor below offers a prebuilt React inbox, its own Notification store, and real-time delivery from its own infrastructure. With any of them, Cadence keeps **no Notification table**. The server calls the vendor API ("trigger workflow X for user Y with data Z"), and the browser talks to the vendor directly with a per-user token.

| | Free tier | First paid tier | React inbox | Real-time transport (client deps) | EU data residency |
|---|---|---|---|---|---|
| **Knock** | 10,000 messages/mo, in-app feed included | Starter $250/mo, 50,000 msgs, then $0.005 each | `@knocklabs/react`: `NotificationFeedPopover`, `NotificationFeed`, `NotificationIconButton`, plus headless hooks | WebSocket through Phoenix channels (`phoenix` dep in `@knocklabs/client`) | **Not yet.** Docs say "coming soon", expected by end of 2026. Today it relies on SCCs and the EU-US DPF |
| **Novu Cloud** | 10,000 workflow runs/mo, 5 workflows, 3 members, 24h activity retention | Pro from $30/mo (30,000 runs, then $1.20 per 1K). Team from $250/mo | `@novu/react` `<Inbox />` with Bell, Notifications, Preferences, plus headless hooks and `@novu/js` | `socket.io-client` and `partysocket` in `@novu/js` | **Yes, US or EU, on the Free plan too** |
| **Novu self-hosted** | Software is free (MIT outside `enterprise/packages`) | "Self-hosted" is listed under Enterprise on the pricing page | Same `@novu/react` | Its own WS service | Wherever you host it |
| **MagicBell** | 1,000 deliveries/mo, 1 project | Startup $249/mo, 50,000 deliveries, then $0.0025 each | `@magicbell/react`: `FloatingInbox`, `Inbox`, `ToastContainer`, `UserPreferences` | Not stated in the docs I read | Not stated on pricing or docs index |
| **Courier** | 10,000 sends/mo | Business: $0.005 per send from the first one ($250 for 50,000) | `@trycourier/courier-react`: `CourierInbox`, theming, `useCourier()` | Real-time sync across devices. Transport not stated | Listed as a Business-plan feature |
| **SuprSend** | 10,000 notifications/mo, in-app feed shows SuprSend branding | Essentials $100/mo, 50,000, then $2 per 1K (unbranded feed) | In-app feed included | Not checked | Multi-region listed under Enterprise only |

Sources: pricing pages for [Knock](https://knock.app/pricing), [Novu](https://novu.co/pricing), [MagicBell](https://www.magicbell.com/pricing), [Courier](https://www.courier.com/pricing) and [SuprSend](https://www.suprsend.com/pricing), all read 2026-11-12. [Knock plans doc](https://docs.knock.app/manage-your-account/knock-plans) (EU residency) and [Knock privacy policy](https://knock.app/legal/privacy-policy). [Knock React overview](https://docs.knock.app/in-app-ui/react/overview). [`@knocklabs/client` package.json](https://github.com/knocklabs/javascript/blob/main/packages/client/package.json). [Novu Inbox overview](https://docs.novu.co/platform/inbox/overview). [`@novu/js` package.json](https://github.com/novuhq/novu/blob/next/packages/js/package.json). [MagicBell React docs](https://www.magicbell.com/docs/libraries/magicbell-react). [Courier Inbox overview](https://www.courier.com/docs/platform/inbox/inbox-overview).

### Notes per vendor

- **Knock.** The in-app feed and prebuilt components come with every plan, Free included. The paid tier is a big step up ($0 to $250/mo). The Free plan has no hard cap: Knock contacts you to add billing. The lack of EU data residency matters if Cadence has EU users and stores names or course activity in Notification payloads.
- **Novu Cloud.** It has the cheapest paid step ($30/mo) and the only EU region available on the Free plan. The unit is a *workflow run*. Retention on the Free plan is 24h for the activity feed (the dashboard log), which is a different thing from the subscriber's inbox.
- **Novu self-hosted.** The code is MIT except `enterprise/packages`, which uses a proprietary license that requires written approval ([LICENSE-ENTERPRISE](https://github.com/novuhq/novu/blob/next/LICENSE-ENTERPRISE)). The infrastructure it needs is heavy for this app: API, Worker, WS and Dashboard services, plus **MongoDB, Redis with AOF, and S3-compatible storage**. Minimum single-VM sizing is 4 vCPU and 8 GB ([self-hosting overview](https://docs.novu.co/community/self-hosting-novu/overview)). Some cloud-only features are missing, including social login. This is several times the footprint of Cadence itself, which is one Node process and one SQLite file.
- **MagicBell.** It has the smallest free tier (1,000 deliveries). One in-app Notification plus one email to the same person count as two deliveries.
- **Courier.** On Business, every send is billed from the first one. One template sent to one recipient is one send, whatever channels it uses.
- **SuprSend.** It has the cheapest unbranded paid tier among the $100+ vendors. Each channel sent to a user counts as a separate notification.

### Lock-in and exit path (all vendors)

- **The vendor owns the store.** Notification history, read and seen state, and preferences live with the vendor. Leaving means exporting through their API (if they offer one) and backfilling a local table, then replacing the inbox UI and every trigger call.
- **Trigger calls and workflow definitions** (templates, batching, digest rules) are written in the vendor's DSL or dashboard. Business rules like "when, what, to whom" would sit partly outside the repo, unless workflows are kept thin and the rules stay in Cadence code.
- **User sync.** Every vendor needs users (subscribers or recipients) identified by our `userId` and a server-signed token (Knock user token, Novu `subscriberHash` HMAC, MagicBell User JWT, Courier JWT). That adds a secret and a signing step to the layout loader.
- **Do we still need our own store?** Not for the Notifications themselves. We might keep an outbox or audit table anyway, to make triggers idempotent or retryable. The dev setup (DevUI user switching, seeded SQLite) would have to reach a vendor dev environment, so tests and seed data become network-dependent unless the vendor client is mocked.
- **Email stays separate.** Every vendor here is multi-channel. Map #2 rules out unifying email with in-app, so a vendor would be used for the in-app channel only. That is the case where in-house costs least compared with buying.

## Trade-off summary

- **Building in-house (navigation plus optional polling)** needs no new infrastructure, no vendor, no new secret, and no data-residency question. It fits `react-router-serve` and the existing layout loader with no changes to the runtime. The cost: we build the inbox UI, read state, and any batching ourselves, and idle tabs are stale up to the polling interval.
- **Building SSE in-house** gives live delivery with no new infrastructure while Cadence is one process, which SQLite already guarantees. The costs are the compression caveat, stream-lifecycle code, and the 6-connections-per-domain limit if production uses HTTP/1.1.
- **WebSockets** cost the most to adopt here, because they need a custom server, and they add nothing over SSE for one-way Notifications.
- **Hosted services** come with a polished inbox, real-time delivery, preferences UI (relevant to the later "muting" item in #2) and digesting. In exchange they bring a monthly cost cliff once past the free tier (from $30 at Novu to about $250 at most others), vendor-held data, EU-residency gaps (Knock today, unclear for MagicBell), user-token plumbing, and an exit path that means migrating data and UI.
- **Self-hosted Novu** removes the vendor dependency but adds MongoDB, Redis and S3. That is out of proportion with a single-SQLite app.

## Not verified

- Whether `Cache-Control: no-transform` fully stops buffering of a streamed `Response` through `@remix-run/node-fetch-server` under `react-router-serve`. This needs a quick prototype.
- Whether production sits behind an HTTP/2 proxy. That decides whether the SSE connection limit matters.
- Real-time transport for MagicBell and Courier, and the data residency details for MagicBell and SuprSend below Enterprise.
- Vendor pricing changes often. All figures are as read on 2026-11-12.
