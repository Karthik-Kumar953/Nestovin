# Nestovin UAT and client demo checklist

This is a step-by-step script for the owner to walk through the whole product the way a client sees it. Tick each box. For every ✗, write what you saw in the **Notes** column, then send it to the lead.

**Before you start**
- [ ] The API and Admin portal are running (`corepack pnpm dev:api`, `corepack pnpm dev:web`). Open `http://localhost:3000/admin`.
- [ ] You have the Super Admin account and an authenticator app with its TOTP code.
- [ ] An Android phone or emulator has the Resident app (dev build) installed. Install the Worker app too once it has been merged.
- [ ] Razorpay is in **test mode**. Use only Razorpay's published test card or UPI ID (`success@razorpay`), never a real card.
- [ ] A second phone number is ready to act as a family member, plus a third for a "different household".
- [ ] Use names that start with `UAT ` so the data is easy to find and clean up later.

Use the plans, prices and percentages you actually want to demo. This script does not prescribe any.

---

## A. Admin portal (desktop browser)

| # | Step | Expected | ✓/✗ | Notes |
|---|---|---|---|---|
| A1 | Open `/admin` while signed out | You are sent to the sign-in page | | |
| A2 | Sign in with a wrong password | "Email or password is incorrect." and you stay on sign-in | | |
| A3 | Sign in correctly, then enter the authenticator code | The Admin home opens and the menu shows every module | | |
| A4 | **Access → Roles:** create the role "UAT Support viewer" with only Support → View | The role is saved and its permission list shows exactly that | | |
| A5 | **Access → Admins:** invite an admin with that role, scoped to one cluster | The invitation is sent and the admin shows as *Invited* (needs a real mailbox) | | |
| A6 | **Locations:** create the city "UAT City", the cluster "UAT North" and the community "UAT Heights" in that cluster | Each appears in its list; duplicate names are refused with a clear message | | |
| A7 | **Community → Setup:** add residence categories, then download the Excel template | The template downloads with towers and flats columns | | |
| A8 | Upload a workbook with one deliberately wrong row | The bad row is pointed out with its reason, and nothing is imported | | |
| A9 | Fix the row, or use the grid entry instead. Validate, approve, then commit | The towers and flats appear; re-importing changes only edited flats | | |
| A10 | **Catalogue:** enable Maid / Cook / Caretaker, set the time windows, create a plan and fill the price matrix, then **Publish** | Validation passes; once published, the version is read-only | | |
| A11 | **Activate** the community | Allowed only when the checklist is complete | | |
| A12 | **Demand → Cycles:** create a cycle and try 0% and then 100% as the initial payment | Both are refused (PAY-01/02) | | |
| A13 | Set a valid percentage and **Publish** the cycle, then try to edit the percentage | Publish succeeds; the percentage can no longer be edited (PAY-05) | | |
| A14 | **Scheduling → Slots:** create a continuous Cook slot and publish it | The slot shows as Published | | |
| A15 | Open the **Holidays** calendar and add then remove a test holiday | Both changes are saved | | |

## B. Resident app (phone)

| # | Step | Expected | ✓/✗ | Notes |
|---|---|---|---|---|
| B1 | Enter the phone number, then a wrong OTP | Rejected with a clear message | | |
| B2 | Enter the right OTP | You reach the city/community picker | | |
| B3 | Pick a city that is not live and vote for it | The vote is recorded; it appears in Admin → Locations → Expansion votes (Super Admin) | | |
| B4 | Pick "UAT Heights", then tower and flat, upload proof | Status shows *Pending verification*; booking is not available yet | | |
| B5 | *(Admin)* **Residents → Verifications:** approve it | The resident becomes the Primary Resident and gets a notification | | |
| B6 | Catalogue | Only enabled services and the published plan are shown, with prices from the matrix | | |
| B7 | Demand-led service: choose a plan and windows, accept the non-refundable terms, pay the initial amount with Razorpay test UPI `success@razorpay` | The request shows as *Committed* with the initial amount paid and the balance due | | |
| B8 | Start a payment and then cancel it in Razorpay | Nothing is charged; you can try again; the request stays unpaid | | |
| B9 | Continuous service (Cook): pick the slot and a start date, then pay in full | The booking is *Confirmed* | | |
| B10 | **Household:** request a family member (second phone) | The request is pending; the family phone has no household access yet | | |
| B11 | *(Admin)* **Family requests:** reject one, then approve another | Rejected: still blocked and the Primary is notified. Approved: the family member sees the household after signing in | | |
| B12 | **Support:** raise a ticket with the category "Urgent" | The ticket is created and visible in Admin → Support | | |
| B13 | Sign in on the third phone (another household) | None of B's bookings, tickets or family members are visible | | |

## C. Demand-led completion (Admin and Resident)

| # | Step | Expected | ✓/✗ | Notes |
|---|---|---|---|---|
| C1 | *(Admin)* Close the cycle, open its **Summary** | Counts by plan and preferred window match what residents chose | | |
| C2 | *(Admin)* Create a slot set with a balance deadline, allocate requests, publish | The resident sees the slot with total, paid and outstanding amounts | | |
| C3 | *(Resident)* Pay the balance | The booking is *Confirmed* and the subscription is pending activation | | |
| C4 | *(Admin)* **Payments:** find the payment and open *Needs review* | All payments are listed; review items show their reason | | |
| C5 | *(Admin)* Approve a small refund with a reason | A refund record is created and the original payment still shows its full amount; Audit shows "refund approved" | | |

## D. Workforce and service delivery (Admin and Worker app)

| # | Step | Expected | ✓/✗ | Notes |
|---|---|---|---|---|
| D1 | *(Admin)* **Employees:** add "UAT Worker", complete the checks, add a qualification, **Mark ready**, then **Enable login** | An Employee ID (`NV-…`) and a temporary password are issued | | |
| D2 | *(Worker app)* Sign in with the Employee ID and temporary password | You are asked to change the password, then the schedule opens | | |
| D3 | *(Admin)* **Allocation:** view candidates for the booking and assign "UAT Worker" | Ineligible or conflicting workers are excluded with a reason; the schedule updates (no accept step) | | |
| D4 | *(Resident)* On the visit day, show the check-in code / QR | The code is shown | | |
| D5 | *(Worker)* Enter a wrong code | Refused; no attendance is recorded | | |
| D6 | *(Worker)* Enter the right code, or scan the QR | Checked in; a check-in outside the geofence is flagged, not blocked | | |
| D7 | *(Worker)* Complete the visit; *(Resident)* leave a rating | Completion is stored; the rating can be given only once | | |
| D8 | *(Admin)* **Attendance:** open the record and approve a correction | The original event stays and the correction is linked and audited | | |
| D9 | *(Admin)* **Allocation → Overtime:** offer extra work, *(Worker)* accept, *(Admin)* confirm | Accepting alone does not assign; confirming does | | |
| D10 | Tap a push notification on the phone | ⚠️ Known: it opens the app but not the related screen yet (BUG-QA-005) | | |

## E. Support, finance and governance

| # | Step | Expected | ✓/✗ | Notes |
|---|---|---|---|---|
| E1 | *(Admin)* Open the B12 ticket | It was routed to the Cluster Admin because it is urgent | | |
| E2 | Add an internal note and a reply | The resident sees only the reply, from "Nestovin Support" | | |
| E3 | Escalate the ticket manually | It reaches the Super Admin; the history is kept | | |
| E4 | **Finance → Payroll:** prepare the month, review, approve, record payment | Lines are explainable (salary, days, entries); approving does not mark paid; payment is recorded separately | | |
| E5 | **Exports:** download residents, bookings, payments and payroll CSVs | The files open in Excel with correct characters; there are no formula cells | | |
| E6 | **Access → Audit log** | Every change above appears, with who made it and when | | |
| E7 | Sign in as the "UAT Support viewer" admin from A5 | Only Support is visible; other pages and the API refuse with "not allowed" | | |
| E8 | That admin opens a ticket from another cluster by its link | "Not found" (out-of-scope records look non-existent) | | |

## F. Demo-day sanity (5 minutes before the client joins)
- [ ] Both dev servers are running and Admin home loads in under 3 s.
- [ ] Razorpay is in test mode and `success@razorpay` works on the demo phone.
- [ ] The demo phone is signed in as a verified resident with one confirmed booking and one visit today.
- [ ] No `E2E-` or `QA` test data is visible in lists. Filter by the `UAT ` prefix.
- [ ] Known issues to avoid live: BUG-QA-005 (push tap) and, in the web preview of the Resident app, BUG-QA-004. See `BUGS.md`.
