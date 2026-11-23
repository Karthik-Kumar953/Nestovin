# NESTOVIN — Complete System Workflows

**Document ID:** NV-FWS-03  
**Version:** 0.1 — End-to-end workflow review draft  
**Prepared by:** Nexif Technologies  
**Product:** Nestovin V1  
**Date:** 5 November 2026  
**Status:** Working specification for client walkthrough; not an approved final functional baseline

---

## 1. Purpose

This document connects the individual Resident App, Employee App, Admin Portal, Public Website and shared-backend workflows into complete business journeys. It shows how records and decisions move across modules, from platform setup and resident demand through payment, workforce allocation, service delivery, support and payroll.

This is a functional workflow document, not a screen specification, API contract, database schema, infrastructure architecture or low-level implementation design. Each Mermaid block is a **separate diagram**. Render or copy them one at a time.

## 2. Scope and modelling rules

| Area | V1 boundary used in these diagrams |
|---|---|
| Resident App | 14 capability areas; Android and iOS |
| Employee App | 10 capability areas; Android and iOS |
| Unified Admin Portal | 15 selected capability areas; the other 19 from the 34-module inventory are deferred |
| Public Website | 10 pages/functions; informational and enquiry-led; no online service booking |
| Shared backend | Authentication, authorisation, central records, business workflows, integrations and audit |
| Service catalogue | Maid, Cook and Caretaker only |
| Operating model | Nestovin-managed workforce; not an open marketplace |

### Rules that must remain distinct

- A **demand request** is not a confirmed booking, and a 30% demand commitment does not activate service.
- A **booking**, **subscription**, **payment transaction** and **service occurrence** are related but separate records.
- Demand-led mode requires verified 30% at request, then verified remaining 70% after the commencement date is announced and before service begins.
- Continuous mode requires verified 100% before service begins.
- Razorpay provider response, redirect or client-side success screen is not proof of payment. Backend verification is authoritative.
- Routine employee assignments do not require employee accept/reject. Optional additional-work/overtime offers do require employee accept/reject and subsequent Admin confirmation.
- Allocation is recommendation-led; authorised Operations/Admin confirms or overrides. Employee assignment must remain within authorised cluster scope.
- Attendance uses OTP or QR, with location evidence at the verification event only. Continuous live employee tracking is outside V1.
- A notification communicates a business event; it does not itself change payment, booking, attendance or service state.

### Diagram notation

| Shape | Meaning |
|---|---|
| Rounded node | Start, end or system hand-off |
| Rectangle | Process or record operation |
| Diamond | Decision or validation |
| Arrow label | Condition or outcome |

## 3. System-wide context

The five product surfaces use the shared backend as the source of truth. External providers are called through backend-controlled workflows. The Public Website does not create bookings.

## WF-00 — Overall system context and module connections
Shows the main actors, product surfaces, shared business records and external integrations. The resident, employee and Admin apps do not maintain independent business truth.

```mermaid
flowchart TD
    RESIDENT([Resident])
    EMPLOYEE([Employee])
    ADMIN([Authorised Admin users])
    VISITOR([Public visitor])
    RES_APP["Resident App"]
    EMP_APP["Employee App"]
    ADM_PORTAL["Unified Admin Portal"]
    WEBSITE["Public Website"]
    BACKEND["Shared Backend and System of Record"]
    AUTH["Authentication and Authorisation"]
    CONFIG["Master Data, Services, Plans and Pricing"]
    DEMAND["Demand, Booking, Subscription and Payment Records"]
    WORKFORCE["Employee Readiness, Schedule and Allocation"]
    SERVICE["Attendance, Service, Feedback and History"]
    SUPPORT["Support and Website Enquiry Records"]
    FINANCE["Finance, Payroll and Basic Reports"]
    NOTIFY["Notification and Audit Services"]
    OTP["OTP Provider"]
    RAZORPAY["Razorpay"]
    MSG["Push, SMS and Email Providers"]

    RESIDENT --> RES_APP
    EMPLOYEE --> EMP_APP
    ADMIN --> ADM_PORTAL
    VISITOR --> WEBSITE
    RES_APP --> BACKEND
    EMP_APP --> BACKEND
    ADM_PORTAL --> AUTH
    AUTH --> BACKEND
    WEBSITE --> BACKEND
    BACKEND --> CONFIG
    BACKEND --> DEMAND
    BACKEND --> WORKFORCE
    BACKEND --> SERVICE
    BACKEND --> SUPPORT
    BACKEND --> FINANCE
    BACKEND --> NOTIFY
    BACKEND --> OTP
    BACKEND --> RAZORPAY
    BACKEND --> MSG
    NOTIFY --> MSG
    DEMAND --> WORKFORCE
    WORKFORCE --> SERVICE
    SERVICE --> FINANCE
    DEMAND --> FINANCE
    SERVICE --> RES_APP
    SUPPORT --> RES_APP
    NOTIFY --> RES_APP
    NOTIFY --> EMP_APP
    NOTIFY --> ADM_PORTAL
```

## WF-01 — Admin account provisioning and permission enforcement
Super Admin creates Admin accounts and grants module-level access with optional action restrictions. Cluster scope and backend enforcement apply on every protected operation.

```mermaid
flowchart TD
    START([Start])
    SA["Super Admin signs in"]
    DETAILS["Enter Admin account details and account category"]
    MODULES["Select permitted Admin modules"]
    ACTIONS{"Are action-level restrictions needed?"}
    SET_ACTIONS["Configure permitted actions"]
    CLUSTER{"Is this a Cluster Admin?"}
    SET_SCOPE["Assign permitted cluster scope"]
    VALIDATE["Validate creator authority, permissions and scope"]
    VALID{"Configuration valid?"}
    SAVE[("Save Admin account and permission records")]
    ENABLE["Activate or invite Admin user"]
    REQUEST["Admin requests a protected operation"]
    AUTHN["Backend authenticates user"]
    MOD_CHECK{"Module permission granted?"}
    ACT_CHECK{"Action permitted?"}
    SCOPE_CHECK{"Record within assigned scope?"}
    ALLOW["Allow operation and audit where required"]
    DENY([Deny operation])
    END([End])

    START --> SA --> DETAILS --> MODULES --> ACTIONS
    ACTIONS -->|Yes| SET_ACTIONS --> CLUSTER
    ACTIONS -->|No| CLUSTER
    CLUSTER -->|Yes| SET_SCOPE --> VALIDATE
    CLUSTER -->|No| VALIDATE
    VALIDATE --> VALID
    VALID -->|No| MODULES
    VALID -->|Yes| SAVE --> ENABLE --> REQUEST
    REQUEST --> AUTHN --> MOD_CHECK
    MOD_CHECK -->|No| DENY
    MOD_CHECK -->|Yes| ACT_CHECK
    ACT_CHECK -->|No| DENY
    ACT_CHECK -->|Yes| SCOPE_CHECK
    SCOPE_CHECK -->|No| DENY
    SCOPE_CHECK -->|Yes| ALLOW --> END
```

## WF-02 — Location master data and community activation
Authorised Admins create or import City, Community, Cluster, Tower and Flat records with required parent relationships. The exact hierarchy cardinality and some uniqueness rules remain client decisions.

```mermaid
flowchart TD
    START([Start])
    ADMIN["Authorised Admin opens Master Data"]
    SOURCE{"Create records manually or import Excel?"}
    MANUAL["Select entity level and enter fields plus parent relationship"]
    UPLOAD["Upload approved Excel template"]
    VALIDATE["Validate columns, required fields, parent references and duplicates"]
    ERRORS{"Blocking validation errors?"}
    FIX["Review errors and correct source data"]
    PREVIEW["Show validated import preview"]
    CONFIRM{"Admin confirms save or import?"}
    SAVE[("Save master records and audit history")]
    ACTIVATE["Activate community separately when operationally ready"]
    AVAILABLE["Expose valid active records to resident and operations workflows"]
    END([End])

    START --> ADMIN --> SOURCE
    SOURCE -->|Manual| MANUAL --> VALIDATE
    SOURCE -->|Excel| UPLOAD --> VALIDATE
    VALIDATE --> ERRORS
    ERRORS -->|Yes| FIX --> SOURCE
    ERRORS -->|No| PREVIEW --> CONFIRM
    CONFIRM -->|No| END
    CONFIRM -->|Yes| SAVE --> ACTIVATE --> AVAILABLE --> END
```

## WF-03 — Resident registration, residence verification and family access
Connects OTP login, residence selection, document review and the separate family-member approval process. A pending residence or family request does not grant verified access.

```mermaid
flowchart TD
    START([Start])
    OPEN["Resident opens Resident App"]
    PHONE["Enter phone number and request OTP"]
    OTP["OTP provider sends code"]
    ENTER["Resident enters OTP"]
    VALID_OTP{"OTP valid and not expired?"}
    AUTH["Create or retrieve resident identity and session"]
    LOCATION["Select City and Community"]
    FLAT["Select configured Tower and Flat and enter occupancy details"]
    PROOF["Submit required residence proof"]
    CHECK["Backend validates fields and creates residence request"]
    REVIEW["Authorised Admin reviews request where manual review is required"]
    APPROVED{"Residence approved?"}
    ACTIVE["Activate resident to flat association"]
    PROFILE["Resident views profile and approved household data"]
    EDIT{"Is the requested profile change self-service permitted?"}
    SAVE_PROFILE["Validate and save permitted profile change"]
    PROFILE_REQ["Create correction or verification request for Admin review"]
    BLOCK["Keep verified-household functions restricted"]
    FAMILY{"Does resident request family access?"}
    FAMILY_REQ["Submit family details and supporting information"]
    PHYSICAL["Authorised reviewer performs physical verification outside the app"]
    DECISION["Reviewer records decision, reviewer and timestamp"]
    FAMILY_OK{"Family request approved?"}
    FAMILY_ON["Enable permitted family-member access"]
    FAMILY_BLOCK["Keep family access blocked and notify requester"]
    HOME([Resident home with permitted access])

    START --> OPEN --> PHONE --> OTP --> ENTER --> VALID_OTP
    VALID_OTP -->|No| ENTER
    VALID_OTP -->|Yes| AUTH --> LOCATION --> FLAT --> PROOF --> CHECK --> REVIEW --> APPROVED
    APPROVED -->|No| BLOCK --> HOME
    APPROVED -->|Yes| ACTIVE --> PROFILE --> EDIT
    EDIT -->|Yes| SAVE_PROFILE --> FAMILY
    EDIT -->|No| PROFILE_REQ --> FAMILY
    FAMILY -->|No| HOME
    FAMILY -->|Yes| FAMILY_REQ --> PHYSICAL --> DECISION --> FAMILY_OK
    FAMILY_OK -->|Yes| FAMILY_ON --> HOME
    FAMILY_OK -->|No| FAMILY_BLOCK --> HOME
```

## WF-04 — Employee onboarding, verification and deployment readiness
Connects applicant interest, HR verification, employee qualifications, simple training, readiness and employee account enablement. This is not a full recruitment ATS.

```mermaid
flowchart TD
    START([Start])
    APPLICANT["Applicant submits interest form"]
    STORE[("Store applicant-interest record")]
    HR["HR reviews applicant information"]
    PROCEED{"HR proceeds with applicant?"}
    CLOSE["Record not proceeding or close intake"]
    PROFILE["Create or update employee profile and documents"]
    VERIFY["HR records identity, document and qualification outcomes"]
    COMPLETE{"Required verification complete?"}
    MISSING["Request missing evidence and keep not ready"]
    TRAIN["Employee views assigned training videos"]
    TRAIN_DONE{"Required training complete where configured?"}
    PENDING["Keep deployment readiness pending"]
    READY["Mark employee ready and set service or task eligibility"]
    ACCOUNT["Enable Employee ID and password account"]
    SCHEDULE["Employee accesses schedule and availability features"]
    END([Eligible for allocation when all matching rules pass])

    START --> APPLICANT --> STORE --> HR --> PROCEED
    PROCEED -->|No| CLOSE --> END
    PROCEED -->|Yes| PROFILE --> VERIFY --> COMPLETE
    COMPLETE -->|No| MISSING --> VERIFY
    COMPLETE -->|Yes| TRAIN --> TRAIN_DONE
    TRAIN_DONE -->|No| PENDING --> TRAIN
    TRAIN_DONE -->|Yes| READY --> ACCOUNT --> SCHEDULE --> END
```

## WF-05 — Service catalogue, plan configuration and operating-mode routing
Admin configuration feeds the Resident App. Only the three approved V1 services are presented. The selected community operating mode determines which booking journey follows.

```mermaid
flowchart TD
    ADMIN["Authorised Admin configures V1 services and tasks"]
    PLAN["Configure plan, entitlements, duration and start rules"]
    PRICE["Configure price by approved community and residence inputs"]
    VALIDATE["Validate required service, plan and pricing values"]
    APPROVE{"Configuration approved and published?"}
    CORRECT["Return for correction; affected option stays unavailable"]
    CONFIG[("Versioned active service and plan configuration")]
    RESIDENT["Resident opens service catalogue"]
    FETCH["Backend loads active services and eligible plans for resident context"]
    SERVICES["Show Maid, Cook and Caretaker where enabled"]
    SELECT["Resident selects service and plan"]
    MODE{"Community operating mode?"}
    DEMAND([Continue to demand-led request flow WF-06])
    CONTINUOUS([Continue to continuous booking flow WF-07])

    ADMIN --> PLAN --> PRICE --> VALIDATE --> APPROVE
    APPROVE -->|No| CORRECT --> PLAN
    APPROVE -->|Yes| CONFIG --> FETCH
    RESIDENT --> FETCH --> SERVICES --> SELECT --> MODE
    MODE -->|Demand-led| DEMAND
    MODE -->|Continuous| CONTINUOUS
```

## WF-06 — Demand-led journey: request, commitment, planning, balance and service
This is the full demand-led path. Each demand cycle is configurable and repeatable. The 30% payment records a commitment only; service cannot begin until the remaining 70% is verified.

```mermaid
flowchart TD
    ADMIN["Authorised Admin opens demand cycle for community"]
    RULES["Set collection window, eligible services and request rules"]
    PUBLISH["Publish open demand cycle"]
    RESIDENT["Resident selects service and plan"]
    REQUEST["Submit hours or duration, frequency and preferred time slots"]
    CHECK["Validate resident context, plan, service and cycle eligibility"]
    VALID{"Request valid?"}
    FIX["Show errors and allow correction"]
    CALC["Calculate mandatory 30 percent commitment"]
    ORDER["Backend creates Razorpay payment order"]
    CHECKOUT["Resident completes payment checkout"]
    VERIFY["Backend verifies amount, currency, order and provider status"]
    PAID{"30 percent payment verified?"}
    UNPAID["Keep request uncommitted; display payment pending or failed"]
    RETRY_ALLOWED{"Retry permitted under approved payment rules?"}
    NO_COMMIT([No paid demand commitment is created])
    COMMIT[("Save paid demand commitment and payment record")]
    AGG["Aggregate paid demand by service, hours, frequency and preferred slots"]
    CAPACITY["Operations reviews workforce requirement and capacity gap"]
    READINESS["HR updates employee verification, qualifications and readiness"]
    SLOT["Admin creates slots manually or reviews system recommendations"]
    APPROVED{"Admin approves slots and commencement date?"}
    REVISE["Revise workforce plan, capacity or slot set"]
    RELEASE["Publish approved slots, commencement date and balance deadline"]
    REMIND["Notify resident of remaining 70 percent payment"]
    BALANCE["Resident pays remaining 70 percent"]
    VERIFY_BAL["Backend verifies remaining balance"]
    FULL{"Full 100 percent payment verified before start?"}
    PENDING["Keep service inactive and display current payment status"]
    DEADLINE{"Configured payment deadline reached?"}
    EXTEND{"Authorised Admin extends deadline before expiry?"}
    UPDATE["Update deadline and send reminder"]
    EXPIRE["Expire commitment and retain 30 percent under confirmed rule"]
    NO_START([No service starts for expired commitment])
    ACTIVATE["Activate subscription for approved commencement date"]
    BOOKING["Create confirmed service booking or occurrence schedule"]
    ALLOCATE([Continue to shared workforce allocation WF-08])

    ADMIN --> RULES --> PUBLISH --> RESIDENT
    RESIDENT --> REQUEST --> CHECK --> VALID
    VALID -->|No| FIX --> REQUEST
    VALID -->|Yes| CALC --> ORDER --> CHECKOUT --> VERIFY --> PAID
    PAID -->|No| UNPAID --> RETRY_ALLOWED
    RETRY_ALLOWED -->|Yes| ORDER
    RETRY_ALLOWED -->|No| NO_COMMIT
    PAID -->|Yes| COMMIT --> AGG --> CAPACITY --> READINESS --> SLOT --> APPROVED
    APPROVED -->|No| REVISE --> SLOT
    APPROVED -->|Yes| RELEASE --> REMIND --> BALANCE --> VERIFY_BAL --> FULL
    FULL -->|No| PENDING --> DEADLINE
    FULL -->|Yes| ACTIVATE --> BOOKING --> ALLOCATE
    DEADLINE -->|No| BALANCE
    DEADLINE -->|Yes| EXTEND
    EXTEND -->|Yes| UPDATE --> BALANCE
    EXTEND -->|No| EXPIRE --> NO_START
```

## WF-07 — Continuous-mode journey: live availability, full payment and booking
Continuous mode exposes only feasible slots derived from current workforce capacity. The selected slot is revalidated before payment and booking confirmation.

```mermaid
flowchart TD
    OPS["Operations maintains employee readiness, schedules and availability"]
    LEAVE["Include approved leave and existing assignments"]
    CAPACITY["Backend calculates current feasible capacity"]
    SLOTS[("Current available slot records")]
    RESIDENT["Resident selects service, plan and available slot"]
    RECHECK["Backend revalidates slot and capacity"]
    AVAILABLE{"Slot still feasible?"}
    REFRESH["Refresh availability and ask resident to select again"]
    AMOUNT["Calculate full 100 percent amount"]
    ORDER["Backend creates Razorpay payment order"]
    PAY["Resident completes checkout"]
    VERIFY["Backend verifies payment with Razorpay"]
    PAID{"Full payment verified?"}
    FAILED["Do not confirm booking; show current payment state"]
    NO_BOOKING([Booking remains unconfirmed])
    CONFIRM["Confirm booking and reserve capacity"]
    ASSIGN([Continue to shared workforce allocation WF-08])

    OPS --> LEAVE --> CAPACITY --> SLOTS --> RESIDENT
    RESIDENT --> RECHECK --> AVAILABLE
    AVAILABLE -->|No| REFRESH --> SLOTS
    AVAILABLE -->|Yes| AMOUNT --> ORDER --> PAY --> VERIFY --> PAID
    PAID -->|No| FAILED --> NO_BOOKING
    PAID -->|Yes| CONFIRM --> ASSIGN
```

## WF-08 — Shared workforce allocation, confirmation and replacement
Both demand-led and continuous bookings enter the same allocation workflow after their required payment and booking conditions are satisfied. Routine assignments do not require employee acceptance.

```mermaid
flowchart TD
    START([Paid and service-ready booking requires employee])
    LOAD["Load service, task, date, time, location and capacity requirement"]
    FILTER["Filter employees by qualification, readiness, availability, assignments and cluster scope"]
    ELIGIBLE{"Eligible employee available?"}
    GAP["Record capacity gap and route to Operations review"]
    RECOMMEND["Generate allocation recommendation"]
    REVIEW["Operations reviews recommendation"]
    CHOICE{"Use recommended employee?"}
    MANUAL["Operations selects an alternative eligible employee"]
    VALIDATE["Validate cluster scope, availability and assignment conflicts"]
    VALID{"Assignment valid?"}
    RETRY["Return to eligible candidate selection"]
    SAVE[("Save confirmed assignment and audit history")]
    SCHEDULE["Update Employee App work schedule"]
    NOTIFY["Notify employee of assignment"]
    READY([Assignment ready for service execution WF-09])
    GAP_END([No assignment until Operations resolves gap])

    START --> LOAD --> FILTER --> ELIGIBLE
    ELIGIBLE -->|No| GAP --> GAP_END
    ELIGIBLE -->|Yes| RECOMMEND --> REVIEW --> CHOICE
    CHOICE -->|Yes| VALIDATE
    CHOICE -->|No| MANUAL --> VALIDATE
    VALIDATE --> VALID
    VALID -->|No| RETRY --> FILTER
    VALID -->|Yes| SAVE --> SCHEDULE --> NOTIFY --> READY
```

## WF-09 — Assigned service visit: attendance, execution, completion and resident history
The confirmed employee schedule connects to attendance verification and service completion. Completed service records feed resident history, eligible feedback, Admin operations and payroll inputs.

```mermaid
flowchart TD
    ASSIGN["Confirmed assignment appears in Employee App"]
    OPEN["Employee opens assigned service occurrence"]
    METHOD{"Configured attendance method?"}
    OTP["Complete OTP verification"]
    QR["Scan or present QR verification"]
    LOCATION["Capture location evidence at verification event"]
    VALIDATE["Backend validates assignment, token, time and location rules"]
    VALID{"Attendance valid?"}
    EXCEPTION["Reject verification and route to retry or Operations correction"]
    ATTEND[("Record verified attendance event")]
    TASKS["Employee performs configured service tasks"]
    SUBMIT["Employee submits service completion details"]
    CHECK["Backend validates assignment and service occurrence"]
    RESIDENT_CONFIRM{"Resident confirmation required?"}
    CONFIRM["Resident confirms service outcome"]
    COMPLETE[("Save service completion and confirmation record")]
    STATUS["Update resident booking and service status"]
    HISTORY["Make completed occurrence available in resident service history"]
    FEEDBACK{"Feedback enabled for this occurrence?"}
    RATE["Resident submits permitted rating and feedback"]
    FEEDBACK_REC[("Save feedback for authorised Admin review")]
    ADMIN["Expose attendance and service record to authorised Admin"]
    PAYROLL["Make approved attendance and service data available to payroll"]
    END([Service occurrence completed])

    ASSIGN --> OPEN --> METHOD
    METHOD -->|OTP| OTP --> LOCATION
    METHOD -->|QR| QR --> LOCATION
    LOCATION --> VALIDATE --> VALID
    VALID -->|No| EXCEPTION --> OPEN
    VALID -->|Yes| ATTEND --> TASKS --> SUBMIT --> CHECK --> RESIDENT_CONFIRM
    RESIDENT_CONFIRM -->|Yes| CONFIRM --> COMPLETE
    RESIDENT_CONFIRM -->|No| COMPLETE
    COMPLETE --> STATUS --> HISTORY --> FEEDBACK
    FEEDBACK -->|Yes| RATE --> FEEDBACK_REC --> ADMIN
    FEEDBACK -->|No| ADMIN
    ADMIN --> PAYROLL --> END
```

## WF-10 — Attendance exceptions, no-show and correction review
Captures two exception paths: a resident no-show and an employee request to correct an attendance record. The original event and the correction decision remain auditable.

```mermaid
flowchart TD
    START([Scheduled service visit])
    ARRIVE["Employee reaches service location and attempts verification"]
    RESIDENT_PRESENT{"Resident available for service?"}
    WAIT["Employee waits 15 minutes"]
    NO_SHOW["Record resident no-show outcome"]
    DEDUCT["Apply service-day deduction only under client-approved rule"]
    STORED[("Save no-show and attendance records")]
    CORRECTION{"Does employee request attendance correction?"}
    REQUEST["Employee submits correction request and explanation"]
    REVIEW["Authorised Admin reviews original evidence and request"]
    APPROVE{"Admin approves correction?"}
    REJECT["Record rejection and reason"]
    UPDATE["Record approved effective correction"]
    AUDIT[("Preserve original event and correction audit history")]
    NOTIFY["Notify employee of decision"]
    END([Exception review completed])

    START --> ARRIVE --> RESIDENT_PRESENT
    RESIDENT_PRESENT -->|No| WAIT --> NO_SHOW --> DEDUCT --> STORED --> CORRECTION
    RESIDENT_PRESENT -->|Yes| CORRECTION
    CORRECTION -->|No| END
    CORRECTION -->|Yes| REQUEST --> REVIEW --> APPROVE
    APPROVE -->|No| REJECT --> AUDIT
    APPROVE -->|Yes| UPDATE --> AUDIT
    AUDIT --> NOTIFY --> END
```

## WF-11 — Employee leave and availability change affecting capacity
An approved leave or availability decision changes future employee eligibility and the capacity used by continuous availability and allocation. Exact handling of already-confirmed conflicting assignments remains an open operating rule.

```mermaid
flowchart TD
    EMPLOYEE["Employee submits leave or availability request"]
    SAVE[("Store pending request")]
    REVIEW["HR or Operations reviews request"]
    DECISION{"Approve request?"}
    REJECT["Record rejection and notify employee"]
    APPROVE["Record approval and reviewer"]
    UPDATE["Update effective employee availability"]
    CONFLICT{"Does approved change conflict with an existing assignment?"}
    NO_CONFLICT["Use updated availability for future capacity calculations"]
    REVIEW_ASSIGN["Route conflicting assignment to Operations for review"]
    REPLACE["Use shared allocation and replacement workflow WF-08 where replacement is required"]
    CAPACITY["Recalculate feasible slots and employee eligibility"]
    NOTIFY["Notify employee and relevant operations users"]
    END([Availability state updated])

    EMPLOYEE --> SAVE --> REVIEW --> DECISION
    DECISION -->|No| REJECT --> END
    DECISION -->|Yes| APPROVE --> UPDATE --> CONFLICT
    CONFLICT -->|No| NO_CONFLICT --> CAPACITY
    CONFLICT -->|Yes| REVIEW_ASSIGN --> REPLACE --> CAPACITY
    CAPACITY --> NOTIFY --> END
```

## WF-12 — Additional work and overtime offer to payroll
This is the exception to routine assignment. Employee acceptance or rejection is recorded, and an accepted offer becomes an assignment only after Admin confirmation.

```mermaid
flowchart TD
    OPS["Operations identifies additional work requirement"]
    FILTER["Identify eligible employees within authorised scope"]
    OFFER["Admin sends optional additional-work offer"]
    EMPLOYEE["Employee receives offer in Employee App"]
    RESPONSE{"Employee accepts?"}
    REJECT["Record rejection; no assignment created"]
    ACCEPT["Record employee acceptance"]
    REVIEW["Admin reviews and confirms accepted offer"]
    CONFIRM{"Admin confirms?"}
    DECLINE["Record not confirmed and notify employee"]
    ASSIGN["Create confirmed additional-work assignment"]
    SCHEDULE["Update Employee schedule and notify employee"]
    SERVICE([Execute attendance and service through WF-09])
    INPUT["Include approved additional-work and rate inputs in payroll"]
    END([End])

    OPS --> FILTER --> OFFER --> EMPLOYEE --> RESPONSE
    RESPONSE -->|No| REJECT --> END
    RESPONSE -->|Yes| ACCEPT --> REVIEW --> CONFIRM
    CONFIRM -->|No| DECLINE --> END
    CONFIRM -->|Yes| ASSIGN --> SCHEDULE --> SERVICE --> INPUT --> END
```

## WF-13 — Payment processing, verification and failure recovery
All payment use cases pass through one backend verification process. The owning workflow determines whether verified payment means a 30% commitment, a 70% balance or a fully paid continuous booking.

```mermaid
flowchart TD
    REQUEST["Demand or booking workflow requests payment"]
    CASE{"Payment purpose and amount?"}
    P30["Demand-led commitment: 30 percent"]
    P70["Demand-led balance: remaining 70 percent"]
    P100["Continuous booking: 100 percent"]
    ORDER["Backend creates Razorpay order and stores attempt"]
    CHECKOUT["Resident completes or cancels provider checkout"]
    PROVIDER["Razorpay response, callback or webhook"]
    VERIFY["Backend verifies transaction and checks amount, currency, order and purpose"]
    VALID{"Verified successful payment?"}
    SUCCESS[("Store verified transaction with provider reference")]
    UPDATE["Send verified result to owning business workflow"]
    FAILED["Store failed, cancelled or invalid outcome"]
    RETRY{"Retry permitted under approved rules?"}
    WAIT["Keep business state pending; show current payment status"]
    DUPLICATE{"Duplicate provider event?"}
    IDEMPOTENT["Ignore duplicate processing and retain one financial effect"]
    REVIEW["Route mismatch or reconciliation exception to authorised review"]
    END([End])

    REQUEST --> CASE
    CASE -->|30 percent| P30 --> ORDER
    CASE -->|Remaining 70 percent| P70 --> ORDER
    CASE -->|100 percent| P100 --> ORDER
    ORDER --> CHECKOUT --> PROVIDER --> VERIFY --> DUPLICATE
    DUPLICATE -->|Yes| IDEMPOTENT --> END
    DUPLICATE -->|No| VALID
    VALID -->|Yes| SUCCESS --> UPDATE --> END
    VALID -->|No| FAILED --> RETRY
    RETRY -->|Yes| WAIT --> ORDER
    RETRY -->|No| REVIEW --> END
```

## WF-14A — Public Website information browsing and enquiry entry

Connects the informational website pages to the Contact Us path. Careers content is informational only; the website does not create resident accounts, bookings or recruitment applications.

```mermaid
flowchart TD
    VISITOR([Public visitor opens website])
    HOME["View Home page"]
    BROWSE{"Which public information does visitor need?"}
    SERVICES["View Maid, Cook or Caretaker service information"]
    HOW["View How It Works"]
    ABOUT["View About Us"]
    FAQ["View FAQ"]
    LEGAL["View Privacy Policy or Terms and Conditions"]
    CAREERS["View informational Careers content"]
    CONTACT["Open Contact Us and Enquiry Form"]
    SUBMIT["Enter approved enquiry details and submit"]
    STORE[("Store website enquiry record")]
    ROUTE["Route enquiry to approved Support destination through WF-14"]
    END([Visitor leaves or receives enquiry confirmation])

    VISITOR --> HOME --> BROWSE
    BROWSE -->|Services| SERVICES --> BROWSE
    BROWSE -->|How it works| HOW --> BROWSE
    BROWSE -->|About| ABOUT --> BROWSE
    BROWSE -->|FAQ| FAQ --> BROWSE
    BROWSE -->|Legal information| LEGAL --> BROWSE
    BROWSE -->|Careers information| CAREERS --> BROWSE
    BROWSE -->|Contact| CONTACT --> SUBMIT --> STORE --> ROUTE --> END
    BROWSE -->|Leave| END
```

## WF-14 — Resident support, website enquiries and support resolution
Resident tickets and public website enquiries both reach an authorised Support destination, but they remain distinct intake records unless the client confirms an automatic conversion rule. Refund-related tickets require manual authorised review.

```mermaid
flowchart TD
    SOURCE{"Where does the issue originate?"}
    RESIDENT["Resident submits support ticket in Resident App"]
    WEBSITE["Receive stored website enquiry from WF-14A"]
    VALIDATE["Backend validates resident ticket details and intake references"]
    SAVE_TICKET[("Store resident support ticket with reference and linked records where applicable")]
    ENQUIRY_RECORD[("Use existing stored website enquiry record")]
    ROUTE["Route record to approved Support destination"]
    REACHABLE{"Destination configured and reachable?"}
    FAILURE["Record routing failure and expose it to authorised Admin"]
    QUEUE["Support user opens assigned intake record"]
    REVIEW["Review resident, booking, payment or service context within permission scope"]
    REFUND{"Is refund or financial exception involved?"}
    MANUAL["Route for manual authorised Support or Finance review"]
    ACTION["Categorise, assign, investigate and record updates"]
    RESOLVED{"Issue resolved?"}
    CONTINUE["Request information or continue investigation"]
    CLOSE["Record resolution and update status"]
    NOTIFY["Notify resident where applicable; acknowledge website enquiry"]
    END([End])

    SOURCE -->|Resident App| RESIDENT --> VALIDATE
    SOURCE -->|Public Website| WEBSITE --> ENQUIRY_RECORD --> ROUTE
    SOURCE -->|Resident App| RESIDENT --> VALIDATE --> SAVE_TICKET --> ROUTE
    ROUTE --> REACHABLE
    REACHABLE -->|No| FAILURE --> END
    REACHABLE -->|Yes| QUEUE --> REVIEW --> REFUND
    REFUND -->|Yes| MANUAL --> ACTION
    REFUND -->|No| ACTION
    ACTION --> RESOLVED
    RESOLVED -->|No| CONTINUE --> ACTION
    RESOLVED -->|Yes| CLOSE --> NOTIFY --> END
```

## WF-15 — Notifications across resident, employee and Admin workflows
Notifications are triggered only after the originating business event is committed. Delivery failure is recorded where available and never rolls back the underlying business decision.

```mermaid
flowchart TD
    EVENT["Originating module commits a business event"]
    RESOLVE["Resolve recipient, permitted channel and message template"]
    ENABLED{"Notification required and enabled?"}
    SKIP["Do not send; business record remains available"]
    QUEUE["Queue notification request"]
    PROVIDER["Push, SMS or Email provider"]
    RESULT{"Provider accepts or delivers message?"}
    SUCCESS["Record provider result where available"]
    FAILURE["Record delivery failure where available"]
    APP["Resident or employee opens app and retrieves current backend status"]
    MANUAL{"Was notification manually initiated by Admin?"}
    PERMISSION["Check sender permission and audit manual send"]
    END([End])

    EVENT --> RESOLVE --> ENABLED
    ENABLED -->|No| SKIP --> APP
    ENABLED -->|Yes| QUEUE --> MANUAL
    MANUAL -->|Yes| PERMISSION --> PROVIDER
    MANUAL -->|No| PROVIDER
    PROVIDER --> RESULT
    RESULT -->|Yes| SUCCESS --> APP
    RESULT -->|No| FAILURE --> APP
    APP --> END
```

## WF-16 — Finance overview, payroll calculation, approval and reports
Payroll uses verified payment and booking summaries plus approved attendance, service and additional-work inputs. Client-approved rates and deduction rules are required; the platform does not disburse salaries or replace an ERP/accounting system.

```mermaid
flowchart TD
    START([Authorised Payroll user opens Finance])
    PERIOD["Select payroll or reporting period and permitted scope"]
    REVENUE["Load verified booking and payment summaries"]
    ATTENDANCE["Load approved attendance and service records"]
    OVERTIME["Load approved additional-work, overtime and incentive inputs"]
    RULES["Load client-approved rates, deductions and calculation rules"]
    PREPARE["Prepare basic revenue view and payroll inputs"]
    CALCULATE["Calculate payroll preview"]
    VALID{"Inputs complete and valid?"}
    CORRECT["Flag missing or invalid input for authorised correction"]
    RECALC["Update source input and recalculate"]
    SAVE[("Store payroll calculation, source inputs and draft result")]
    APPROVER["Authorised approver reviews supporting records and totals"]
    DECISION{"Approve payroll result?"}
    RETURN["Return for correction with reason"]
    REPORT["Generate permitted basic payroll and operational reports"]
    EXPORT["Export or view report according to permissions"]
    END([Approved report available; no salary disbursement])

    START --> PERIOD
    PERIOD --> REVENUE
    PERIOD --> ATTENDANCE
    PERIOD --> OVERTIME
    PERIOD --> RULES
    REVENUE --> PREPARE
    ATTENDANCE --> PREPARE
    OVERTIME --> PREPARE
    RULES --> PREPARE
    PREPARE --> CALCULATE --> VALID
    VALID -->|No| CORRECT --> RECALC --> CALCULATE
    VALID -->|Yes| SAVE --> APPROVER --> DECISION
    DECISION -->|No| RETURN --> CORRECT
    DECISION -->|Yes| REPORT --> EXPORT --> END
```

## WF-17 — Admin operational oversight and record traceability
Shows how the selected Admin modules support oversight without bypassing permission checks. The Admin Portal reads and updates authorised records; the backend remains the system of record.

```mermaid
flowchart TD
    ADMIN["Admin opens assigned dashboard or module"]
    AUTH["Backend checks identity, module, action and data scope"]
    ALLOW{"Access authorised?"}
    DENY([Hide or deny protected data and action])
    VIEW["Load permitted operational records"]
    CYCLE["Demand cycles, bookings and payment states"]
    PEOPLE["Residents, family approvals and employee readiness"]
    OPS["Schedules, allocation, attendance and service records"]
    SUPPORT["Support tickets and website enquiry routing"]
    FINANCE["Finance summary and payroll approval records"]
    ACTION{"Does Admin submit an authorised change?"}
    VALIDATE["Validate business rule, scope and action permission"]
    SAVE[("Persist change and audit history")]
    REFRESH["Refresh relevant status and notify recipients where configured"]
    END([End])

    ADMIN --> AUTH --> ALLOW
    ALLOW -->|No| DENY
    ALLOW -->|Yes| VIEW
    VIEW --> CYCLE
    VIEW --> PEOPLE
    VIEW --> OPS
    VIEW --> SUPPORT
    VIEW --> FINANCE
    CYCLE --> ACTION
    PEOPLE --> ACTION
    OPS --> ACTION
    SUPPORT --> ACTION
    FINANCE --> ACTION
    ACTION -->|No| END
    ACTION -->|Yes| VALIDATE --> SAVE --> REFRESH --> END
```

## 4. Cross-module coverage index

This index maps the capability IDs from the individual-module specification to the end-to-end diagrams above. A capability may appear in more than one diagram because its output is consumed by another part of the system.

| Product area | Capability IDs | Covered in |
|---|---|---|
| Resident App | RES-01 to RES-04 | WF-03; WF-14; WF-15 |
| Resident App | RES-05 to RES-07 | WF-05; WF-06; WF-07 |
| Resident App | RES-08 | WF-06; WF-07; WF-13 |
| Resident App | RES-09 to RES-11 | WF-09; WF-10; WF-15 |
| Resident App | RES-12 to RES-13 | WF-14; WF-15 |
| Resident App | RES-14 | WF-03; WF-17 |
| Employee App | EMP-01 to EMP-04 | WF-04 |
| Employee App | EMP-05 to EMP-07 | WF-08; WF-09; WF-10 |
| Employee App | EMP-08 | WF-12; WF-16 |
| Employee App | EMP-09 | WF-11 |
| Employee App | EMP-10 | WF-08 to WF-12; WF-15 |
| Admin Portal | ADM-01 to ADM-02 | WF-01; WF-17 |
| Admin Portal | ADM-03 to ADM-04 | WF-02 |
| Admin Portal | ADM-05 to ADM-06 | WF-03; WF-17 |
| Admin Portal | ADM-07 | WF-05 |
| Admin Portal | ADM-08 | WF-06; WF-07; WF-13; WF-17 |
| Admin Portal | ADM-09 | WF-04; WF-06; WF-08 |
| Admin Portal | ADM-10 | WF-05 to WF-07 |
| Admin Portal | ADM-11 | WF-08; WF-11 |
| Admin Portal | ADM-12 | WF-09; WF-10; WF-17 |
| Admin Portal | ADM-13 | WF-14; WF-17 |
| Admin Portal | ADM-14 to ADM-15 | WF-16 |
| Public Website | WEB-01 to WEB-04; WEB-06 to WEB-09 | WF-14A |
| Public Website | WEB-05 and WEB-10 | WF-14A; WF-14 |

## 5. Open decisions that affect cross-module behaviour

The following items are deliberately not hard-coded into these diagrams because the current workflow baseline marks them as unresolved or client-supplied:

1. **Master data structure:** exact parent-child cardinality among City, Community, Cluster, Tower and Flat; uniqueness, inactive-record and reassignment rules.
2. **Resident verification:** whether every residence submission requires manual review; accepted proof types; resubmission policy; exact family permissions and revocation rules.
3. **Commercial configuration:** final service/task matrix, plan entitlements, prices, duration, start-date rules, taxes/discount display and effect of future configuration changes on existing subscriptions.
4. **Demand operations:** collection-window settings, duplicate/amended request rules, 30% calculation basis, capacity reservation between slot release and 70% payment, and workforce-shortage recovery.
5. **Payment timing:** remaining-balance deadline, reminder cadence, payment-in-progress at expiry, late/duplicate payment reconciliation, refund approval matrix and treatment of date changes after publication.
6. **Scheduling and allocation:** labour/capacity formula, slot granularity, buffer/travel rules, ranking/tie-breakers, workload limits, assignment conflicts and backup/replacement rules.
7. **Employee policies:** readiness checklist, training completion conditions, leave types and notice rules, conflict handling for existing assignments, overtime rate/expiry/maximum hours and payroll treatment.
8. **Attendance and service:** OTP/QR validity, location tolerance, offline synchronisation, resident confirmation method, partial service/rework, no-show reason codes and exact service-day deduction calculation.
9. **Support and website:** final ticket categories/SLA/escalation; enquiry fields/consent; approved enquiry destination; whether website enquiries are converted into Support Tickets or remain separate records.
10. **Notifications and finance:** final provider/event/channel matrix, templates and retries; payroll period, approved rates, formulas, deductions, approver separation and export format.

## 6. Explicit exclusions and safeguards

- No open marketplace or independent-provider onboarding flow.
- No online booking through the Public Website.
- No extra service categories beyond Maid, Cook and Caretaker in this V1 baseline.
- No full recruitment ATS or enterprise LMS; employee onboarding and simple training only.
- No employee assignment across unauthorised clusters.
- No routine employee accept/reject step for standard assignments; accept/reject applies to optional additional-work offers.
- No continuous background/live employee tracking; location evidence is event-based at attendance verification.
- No automated salary disbursement and no ERP/accounting replacement.
- No AI/ML predictive workforce optimisation; allocation remains rule-based/recommendation-led with authorised Admin/Operations control.
- No automatic refund from a support ticket; refund exceptions require manual authorised review.

## 7. Source basis and status

This document is derived primarily from **`01_individual_module_workflows.md` (NV-FWS-01, Version 0.1, dated 4 November 2026)**, which records the current consolidated V1 workflow inventory, client clarifications through 4 November 2026, and open decisions. The delivery scope is aligned with the **Nestovin Client Delivery Roadmap v1.2 — Corrected client review copy, issued 31 October 2026**. The Master Services Agreement effective 12 October 2026 remains the governing agreement for contractual scope and change control.

Where exact rules remain open, this document keeps the decision visible instead of inventing a business rule. These diagrams are a working functional model for review; they do not by themselves approve new scope or replace the contractual documents.

---

**End of document — NV-FWS-03, Version 0.1.**
