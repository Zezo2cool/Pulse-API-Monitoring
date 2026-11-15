# API Monitoring Platform

A web application for keeping track of API endpoints and checking whether they respond as expected. You can register endpoints through a dashboard, then run a background worker to check them regularly and save the results in PostgreSQL.

This is a learning project built to practise full-stack web development, SQL and background processing. It currently only runs locally.

## Current features

- Add, edit, pause, enable and delete monitors.
- Search and filter monitors in the React dashboard.
- Configure GET or HEAD requests, expected status codes, intervals and timeouts.
- Run a single check manually or use the background worker for scheduled checks.
- Store HTTP status codes, response times, failures and check history in PostgreSQL.
- Apply database migrations and run database, API and monitoring checks.

The dashboard currently manages monitor settings. Results are stored in the database, but performance charts and a history view have not been built yet.

## Tech stack

- **TypeScript and JavaScript** — application code and Node.js scripts.
- **Next.js and React** — web interface and HTTP API routes.
- **PostgreSQL** — monitor settings and check results.
- **Docker Compose** — local PostgreSQL container and persistent storage.
- **CSS** — responsive dashboard styling.

The application uses the `pg` driver and SQL directly. Tailwind packages remain from the starter setup, but the current dashboard uses plain CSS.

## Requirements

- Node.js 22 (tested with 22.13.1) and npm.
- Docker Desktop with Docker Compose.

## Local setup

### 1. Configure environment variables

From the project root, copy the example files:

```powershell
Copy-Item .env.example .env
Copy-Item web/.env.example web/.env
```

Skip the copy if you already have these files. Set a local database password in the root `.env` and use the same password in `web/.env`. URL-encode reserved characters in the database URL password.

The real `.env` files are ignored by Git. The example files contain placeholders only.

### 2. Start PostgreSQL

From the project root:

```powershell
docker compose up -d db
```

PostgreSQL is exposed on `127.0.0.1:5432`. Its data is kept in a Docker volume so it survives container restarts.

### 3. Install and initialise the application

```powershell
cd web
npm ci
npm run db:migrate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and add a monitor. For a local test, use `http://127.0.0.1:3000/api/health` with an expected status of `200`.

The health endpoint checks the application's connection to PostgreSQL and the required tables. It does not report whether the monitoring worker is running.

### 4. Start automatic checks

In another terminal, from `web`:

```powershell
npm run monitor:worker
```

Keep this terminal running. Closing the dashboard does not stop the worker. Use `Ctrl+C` to stop it after the current check finishes.

Run one worker instance for now. Checks run sequentially, so a slow endpoint can delay other monitors. Overdue checks run when the worker becomes available; it does not create records for checks missed while stopped.

### 5. Run a manual check

From `web`, find your monitor's ID:

```powershell
$monitorList = Invoke-RestMethod "http://localhost:3000/api/monitors"
$monitorList.monitors | Select-Object id, name, url
```

Then replace the placeholder with that ID:

```powershell
npm run monitor:check -- YOUR-MONITOR-ID
```

Manual checks also advance the monitor's next scheduled check time.

## How it works

The browser sends requests to Next.js API routes. The server validates settings and uses parameterised SQL to store them in PostgreSQL.

The worker finds enabled monitors whose `next_check_at` is due, makes the HTTP request and checks whether the returned status matches the expected status. It saves the observation and advances the schedule in one transaction. If settings changed during the request, the result is discarded.

Response time measures elapsed time until response headers arrive, not the full body download. Redirects are recorded as their original status instead of being followed. Timeouts and connection failures are saved without an HTTP status code.

The next check is scheduled one configured interval after approximately the completion of the previous check. Scheduling is approximate, rather than tied to exact wall-clock times.

## Project structure

```text
compose.yaml              Local PostgreSQL configuration
web/src/app/              Pages, layout, styles and API routes
web/src/components/       Dashboard interface
web/src/lib/              Validation, types and database operations
web/db/migrations/        Versioned database changes
web/scripts/              Migration, checking and worker commands
```

The `monitors` table contains settings. The `check_results` table contains individual observations. Deleting a monitor also deletes its check history.

## Checks

Run these from `web`:

```powershell
npm run lint
npm run build
npm run db:check
npm run monitoring:check
```

With the web server running, also run:

```powershell
npm run api:check
```

`db:check` rolls back its verification writes. `api:check` creates and removes its own test monitor. `monitoring:check` uses local HTTP fixtures and a temporary PostgreSQL schema to test the checker and worker without changing existing monitors. It removes that schema afterward and requires permission to create schemas.

On Windows, a restricted environment may block Turbopack from creating package junctions during a build. Run the build from a normal local terminal if that happens.

## Goals and future features

The goal is to build a small monitoring platform that makes API availability and performance easy to understand.

Next steps:

- Show the latest check status and recent history in the dashboard.
- Add response-time charts and availability summaries.
- Send alerts when endpoints fail or recover.
- Add authentication and user-owned monitors.
- Improve worker coordination for multiple workers and larger workloads.
- Add history retention and prepare the application for deployment.

There is no authentication yet, and the checker can request local network endpoints. Keep this as a local development application using endpoints you control until access control and request destination restrictions are implemented.
