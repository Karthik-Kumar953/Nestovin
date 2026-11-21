# Client demo: how to run it

Development only. Nothing here touches production, and the API refuses demo mode in production.

## Start (four terminals, from the repo root)

| What | Command | Opens |
|---|---|---|
| API in demo mode | `corepack pnpm --filter @nestovin/api dev:demo` | http://localhost:4000 (test payments and demo login on) |
| Admin portal | `corepack pnpm --filter @nestovin/web dev` | http://localhost:3000/admin |
| Resident app | `cd apps/resident` then `corepack pnpm phone:demo` | QR code for Expo Go, with **Demo login** shown |
| Worker app | `cd apps/employee` then `corepack pnpm phone` | QR code for Expo Go |

The phone must be on the same Wi-Fi as the laptop, and Windows must treat that Wi-Fi as **Private** (otherwise the firewall blocks the phone). If the venue Wi-Fi is unreliable, add `-- --tunnel` to the phone commands.

## Demo logins

| App | How to sign in |
|---|---|
| Admin portal | Super Admin email, password and MFA secret are in `apps/api/.dev-superadmin.txt` (git-ignored). Add the MFA secret to an authenticator app once. |
| Worker app | Employee ID and password are in `apps/api/.dev-testworker.txt` (git-ignored). |
| Resident app | Tap **Demo login** on the welcome or sign-in screen. No phone number or code needed; it signs in as **Ananya Rao (Demo)**, Green Meadows (Demo), Tower B, flat 1204. |

## The story to show

1. **Resident app:** splash, welcome steps, Demo login, Home with today's visit.
2. **Book:** pick a plan, choose a slot, tap **Test booking (no payment)**. The result screen marks it "test, not charged".
3. **Admin portal:** the booking appears under Bookings and Payments; the service appears under Operations → Allocation as needing a worker.
4. **Allocation:** confirm worker NV-000216 as the standing worker. Visits are created and assigned.
5. **Worker app:** the visits appear on Today and Schedule; open the next visit and check in with the resident's code from the Resident app.
6. **Admin portal Home:** the run sheet shows the day's visits and their state.

## If something goes wrong

- **Demo login says "switched off on the server":** the API is not running with `dev:demo`.
- **Demo login says "demo resident not set up":** run `corepack pnpm --filter @nestovin/api seed:dev-demo` (with `DEMO_RESIDENT_PHONE=+919999900001`).
- **No "Test booking" button:** same cause as the first point, or Razorpay keys were added to `apps/api/.env` (test payments only run without them).
- **Phone shows "Something went wrong" or cannot connect:** Wi-Fi set to Public, or phone on a different network; use `--tunnel`.
