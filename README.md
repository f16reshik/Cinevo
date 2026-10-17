# Cinevo - Movie & Event Ticketing Platform

**Stack:** React (Vite) · Node.js + Express 5 · PostgreSQL · Prisma ORM · JWT auth · Razorpay (or built-in mock gateway)

Roles: **Customer** (browse, pick seats, pay, QR tickets, cancel/refund) · **Staff** (self-register → admin approves; venues, screens, events, shows, sales, QR check-in) · **Admin** (approvals, takedowns, users, revenue/refunds, audit log).

## 1. Run locally

Prerequisites: Node 20+, Docker (or any PostgreSQL 14+).

```bash
docker compose up -d                      # Postgres on :5432

cd backend
cp .env.example .env                      # set JWT_SECRET to any long random string
npm install
npx prisma db push                        # creates all tables
npm run seed                              # admin, cities, demo staff + demo show
npm run dev                               # API on http://localhost:4000

# new terminal
cd frontend
cp .env.example .env
npm install
npm run dev                               # http://localhost:5173
```

Seeded logins:

| Role     | Email                | Password       |
|----------|----------------------|----------------|
| Admin    | admin@cinevo.local | Admin@12345    |
| Staff    | staff@demo.com       | Staff@12345    |
| Customer | sign up in the UI    |                |

With no Razorpay keys the app uses a **mock gateway**: clicking Pay confirms instantly. 

## 2. Try the full flow (5 minutes)
1. Sign up as a customer → open "Demo Movie" (city: Delhi) → pick seats → Pay → see QR tickets in *My bookings*.
2. Open a second browser/incognito as another customer and try the same seats while the first is at checkout: they show as held .
3. Log in as staff → *Validate* → paste a ticket code (a ticket's QR contains this code) → first scan succeeds, second says "Already used".
4. Register a new staff account (checkbox on sign-up) → log in as admin → *Approvals* → approve → staff can now log in, create an event → admin publishes it.
5. Customer cancels a booking more than 2 hours before the show → refund appears in Admin → Refunds; seats become available again.
