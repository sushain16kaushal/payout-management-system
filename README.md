# User Payout Management System

A Low-Level Design (LLD) implementation of a payout management system for affiliate sales — handling advance payouts, reconciliation, withdrawals, and failed payout recovery with idempotency and race-condition safety.

## Tech Stack

- **Runtime:** Node.js + Express (ESM)
- **Database:** PostgreSQL (via Docker)
- **ORM:** Prisma
- **Validation:** Zod
- **Testing:** Jest + isolated test database
  
## Architecture

```mermaid
flowchart TB
  Client(["Client / curl / Postman"])

  subgraph API["Express App"]
    direction TB
    Routes["Routes<br/>sale.routes.js, withdrawal.routes.js, ..."]
    Validators["Validators (Zod)<br/>schema shape checks"]
    Controllers["Controllers<br/>req/res only"]
    Services["Services<br/>business logic + DB transactions"]
    ErrorHandler["Error Handler<br/>centralized JSON errors"]
  end

  DB[("PostgreSQL<br/>via Prisma")]

  Client -->|HTTP request| Routes
  Routes --> Validators
  Validators -->|parsed input| Controllers
  Controllers --> Services
  Services -->|"Prisma $transaction + row locking"| DB
  DB -->|data| Services
  Services --> Controllers
  Controllers -->|JSON response| Client
  Validators -.->|ZodError| ErrorHandler
  Services -.->|thrown error| ErrorHandler
  ErrorHandler -.->|formatted error| Client
```

**Layered design rationale:** Controllers stay thin (HTTP concerns only), services own all business logic and are fully reusable/testable without an HTTP layer, and validators keep input-shape checks separate from business rules. Every error — validation or business-logic — funnels through one centralized handler for consistent JSON responses.

### Folder structure

```
src/
├── config/         # DB connection (Prisma singleton), constants
├── controllers/     # HTTP layer — request/response only
├── services/        # Business logic + DB transactions
├── validators/       # Zod schemas for request validation
├── routes/           # Express route definitions
└── middlewares/       # Centralized error handling
```

**Layered design rationale:** Controllers stay thin (HTTP concerns only), services own all business logic and are fully reusable/testable without an HTTP layer, and validators keep input-shape checks separate from business rules.

## Database Schema

```mermaid
erDiagram
  USER ||--o{ SALE : has
  USER ||--o{ PAYOUT_TRANSACTION : has
  BRAND ||--o{ SALE : has
  SALE ||--o{ PAYOUT_TRANSACTION : generates
  USER {
    uuid id PK
    string email
    decimal walletBalance
    datetime lastWithdrawalAt
  }
  BRAND {
    uuid id PK
    string name
  }
  SALE {
    uuid id PK
    uuid userId FK
    uuid brandId FK
    decimal earning
    enum status
    boolean advancePaid
    decimal advanceAmount
  }
  PAYOUT_TRANSACTION {
    uuid id PK
    uuid userId FK
    uuid saleId FK
    enum type
    decimal amount
    enum status
  }
```

## Database Schema

4 core entities: `User`, `Brand`, `Sale`, `PayoutTransaction`.

- **Sale → PayoutTransaction** is one-to-many: every advance payout and every final reconciliation adjustment is recorded as an immutable transaction row, giving a full audit trail of how a user's wallet balance was derived.
- **Money fields use `Decimal(12,2)`**, not floating point, to avoid rounding drift.
- **`Sale.advancePaid` (boolean) + `Sale.status`** together drive all idempotency checks.

See `prisma/schema.prisma` for full details.

## Core Design Decisions

### 1. Idempotency via row-level locking (`SELECT ... FOR UPDATE`)
Both the advance payout engine and the reconciliation engine wrap each sale's processing in its own Prisma `$transaction`, acquiring a row lock before re-checking eligibility. This guarantees that even if the same job is triggered concurrently multiple times, a sale can only ever be advanced or reconciled once — verified by dedicated concurrency tests (`Promise.all` racing two identical calls against the same row).

### 2. Per-record transactions, not one big batch transaction
Each sale/withdrawal is processed in its own transaction rather than wrapping an entire batch in one. This means a single failure (e.g., one bad `saleId` in a bulk reconciliation request) doesn't roll back or block unrelated records — failures are isolated and reported per-item.

### 3. Wallet balance: denormalized column + ledger
`User.walletBalance` is a denormalized column for fast reads, but every change to it is *only* ever made alongside a corresponding `PayoutTransaction` row. This gives cheap balance lookups while preserving a full, independently reconstructible audit trail.

### 4. Withdrawal funds are deducted at `INITIATED`, not at `SUCCESS`
This prevents a user from withdrawing the same funds twice while a withdrawal is still in flight. If the payout later fails/is cancelled/is rejected, the funds are recredited and the 24-hour cooldown is reset — since a withdrawal that never went through shouldn't cost the user their daily withdrawal window.

### 5. Edge cases explicitly handled
- Reconciling an **approved** sale that never received an advance → full earning is paid out (nothing to deduct).
- Reconciling a **rejected** sale that never received an advance → adjustment is `0`, not negative (nothing to claw back).
- Re-reconciling an already-reconciled sale, re-running advance payout on an already-paid sale, or re-marking an already-terminal payout transaction are all no-ops, not errors.

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Health check |
| POST | `/api/sales` | Create a new (PENDING) sale |
| GET | `/api/sales?userId=&status=` | List sales, optionally filtered |
| GET | `/api/sales/:id` | Get a single sale with its transaction history |
| POST | `/api/payouts/advance/run` | Run the advance payout job (`{ userId? }` — omit for all users) |
| POST | `/api/reconciliations` | Bulk reconcile sales (`{ reconciliations: [{ saleId, status }] }`) |
| POST | `/api/withdrawals` | Initiate a withdrawal (`{ userId, amount }`) |
| PATCH | `/api/payouts/:id/status` | Update a withdrawal transaction's status (`{ status }`) — used for failed-payout recovery |
| GET | `/api/users/:id` | Get user details, wallet balance, sales, and full transaction history |

## Setup

### Prerequisites
- Node.js 18+
- Docker

### 1. Clone & install
```bash
git clone <repo-url>
cd payout-management-system
npm install
```

### 2. Start PostgreSQL (Docker)
```bash
docker compose up -d
```

### 3. Configure environment
```bash
cp .env.example .env
# adjust DATABASE_URL / PORT if needed
```

### 4. Run migrations
```bash
npx prisma migrate dev
```

### 5. (Optional) Seed sample data
```bash
npx prisma db seed
```

### 6. Start the server
```bash
npm run dev
```
Server runs at `http://localhost:3000`. Health check: `GET /api/health`.

## Running Tests

Tests run against an isolated PostgreSQL database (`payout_test_db`), never the dev database.

```bash
# One-time: create the test DB and apply the schema
docker exec -it payout_postgres psql -U payout_user -d payout_db -c "CREATE DATABASE payout_test_db;"
DATABASE_URL="postgresql://payout_user:payout_pass@localhost:5433/payout_test_db?schema=public" npx prisma migrate deploy

# Run the suite
npm test
```

24 tests covering: advance payout correctness & idempotency, reconciliation correctness & idempotency (including the exact worked example from the assignment spec), withdrawal restrictions, and failed-payout recovery — including dedicated concurrency/race-condition tests for both the advance payout and withdrawal engines.

## Trade-offs & Future Improvements

- **Sequential processing in batch jobs** (`for...of` instead of `Promise.all`) trades some throughput for connection-pool safety and lower deadlock risk. For very large batches, a bounded-concurrency approach (e.g. `p-limit`) would be a natural next step.
- **No authentication/authorization layer** — out of scope for this LLD exercise, but a real system would gate `/reconciliations` and `/payouts/:id/status` behind admin-only access.
- **No message queue for the advance payout job** — currently a synchronous HTTP-triggered job; in production this would likely be a scheduled worker consuming from a queue for better fault tolerance and retry semantics.

