# TeamFlow

TeamFlow is a collaborative project-management app with a React/Vite client, an Express REST API, MySQL persistence, JWT authentication, and Socket.IO project updates.

## Prerequisites

- Node.js 20.19+ (or 22.12+) and npm
- MySQL 8+

## Set up the database

Use the Aiven service's database `teamflow_db` and configure an application account with only the privileges needed by TeamFlow. Obtain the host, port, username, and password from Aiven; do not commit credentials.

For initial setup, run the table script against `teamflow_db` using an account permitted to create tables:

```powershell
Get-Content server/database/schema.sql -Raw | mysql --host=your-aiven-mysql-host --port=your-aiven-mysql-port --user=your-aiven-mysql-user --password --ssl-mode=VERIFY_CA --ssl-ca=server/ca.pem teamflow_db
```

The schema only creates tables in the selected database. The running application should use a restricted account and does not need database-creation or schema-modification privileges.

For an existing TeamFlow database, apply the attachment-table migration with a database account that has table-creation privileges:

```powershell
Get-Content server/database/migrations/001_create_task_attachments.sql -Raw | mysql --host=your-aiven-mysql-host --port=your-aiven-mysql-port --user=your-aiven-mysql-user --password --ssl-mode=VERIFY_CA --ssl-ca=server/ca.pem teamflow_db
```

For an existing database, apply `server/database/migrations/002_add_google_accounts.sql` once with an account allowed to alter the `users` table. It adds the unique Google subject column and permits Google-only accounts to have a null password hash. Existing password accounts are retained; Google credentials are never linked automatically by email.

```powershell
Get-Content server/database/migrations/002_add_google_accounts.sql -Raw | mysql --host=your-aiven-mysql-host --port=your-aiven-mysql-port --user=your-aiven-mysql-user --password --ssl-mode=VERIFY_CA --ssl-ca=server/ca.pem teamflow_db
```

## Configure environment

Copy `server/.env.example` to `server/.env` and set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, and `DB_SSL_CA_PATH` from your Aiven service details. Set `DB_NAME=teamflow_db`. Download the Aiven CA certificate and place it at `server/ca.pem` (ignored by Git), or set `DB_SSL_CA_PATH` to another certificate path relative to `server/`. TLS certificate verification is required; the server will not fall back to an unverified connection. `UPLOAD_DIR` defaults to `uploads` under `server/` and is suitable for local development. Also set `JWT_SECRET`, `PORT`, `NODE_ENV`, and `CLIENT_ORIGIN`; use a long, unique random JWT secret. `CLIENT_ORIGIN` accepts comma-separated allowed frontend origins. Never commit `.env`.

## Google Sign-In

Create a Google OAuth **Web application** client ID in Google Cloud Console. Add `http://localhost:5173` to **Authorized JavaScript origins** for local development. Set that same client ID in `server/.env` as `GOOGLE_CLIENT_ID` and in `client/.env` as `VITE_GOOGLE_CLIENT_ID`; the frontend variable contains only the public OAuth client ID, never a client secret. Restart the backend and Vite after changing environment variables.

For production, add each exact HTTPS frontend origin (for example, `https://app.example.com`) to the OAuth client's Authorized JavaScript origins, then set the same Web client ID in the deployed backend's `GOOGLE_CLIENT_ID` and at frontend build time as `VITE_GOOGLE_CLIENT_ID`. Configure the backend's `CLIENT_ORIGIN` for the deployed frontend separately, and serve the API over HTTPS. The browser refuses to send Google credentials to a non-local HTTP API. The server verifies Google ID-token signature, issuer, audience, expiry, and verified email with `google-auth-library`.

Google login only accepts an account already linked to TeamFlow; Google registration can create a new Google-linked account. If a verified Google email already belongs to a password account, first sign in with that password, then use **Account menu → Link Google account**. The authenticated link endpoint requires the Google token's verified email to exactly match the current TeamFlow account and rejects a Google subject already linked elsewhere.

## File attachments

Authenticated project members can upload one PDF, PNG, JPG, or JPEG attachment per request, up to 10 MiB. Files are written to the private `server/uploads/` directory (or `UPLOAD_DIR`) using random server-generated names; the database stores their task, uploader, original display name, MIME type, size, generated name, and upload timestamp. The upload directory is not served as static content; downloads pass through the authenticated task-attachment endpoint.

For production, do not rely on an ephemeral local disk or expose the upload directory through a public web server. Use durable private object storage (or a persistent, access-restricted shared volume for a single-host deployment), keep storage objects private, and serve downloads only after the same project-membership authorization. Back up stored objects together with the attachment metadata, and configure lifecycle cleanup for objects when records are deleted. `UPLOAD_DIR` configures the local disk backend; object storage requires replacing the local file-storage implementation with the chosen provider.

Copy `client/.env.example` to `client/.env` when you need to configure a non-default API URL or Vite proxy target. The development proxy targets `http://localhost:4000` by default; leave `VITE_API_URL` empty for same-origin proxy requests. For a deployed frontend, set `VITE_API_URL` to the API origin and set the backend `CLIENT_ORIGIN` to the deployed frontend origin.

## Install and run

In separate terminals:

```powershell
cd server
npm install
npm run dev
```

```powershell
cd client
npm install
npm run dev
```

Open the URL printed by Vite (normally `http://localhost:5173`). The API health endpoint is `GET http://localhost:4000/api/health`. The API logs database connection status at startup; configure MySQL before expecting data operations to work.

## Production checks

```powershell
cd client
npm run lint
npm run build
```

Start the backend with `npm start` from `server/` after setting its environment variables. The backend reports a database connection error at startup without exiting, so check the startup log and `/api/health` before relying on database-backed features.

## API

All request and response bodies are JSON. Protected endpoints require `Authorization: Bearer <token>`. Error responses use `{ "error": "..." }`.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/auth/register` | Create an account |
| POST | `/api/auth/login` | Sign in |
| POST | `/api/auth/google` | Verify a Google ID credential and log in or register (`credential`, `intent`) |
| POST | `/api/auth/google/link` | Link a verified matching Google account to the authenticated user |
| GET | `/api/auth/me` | Return the authenticated user |
| GET / POST | `/api/projects` | List accessible projects / create a project |
| GET / PATCH / DELETE | `/api/projects/:id` | Read, update, or delete a project (owner-only updates/deletes) |
| GET | `/api/projects/:id/users?q=...` | Search registered users who are not project members (owner-only) |
| POST | `/api/projects/:id/members` | Add a registered member by email (owner-only) |
| DELETE | `/api/projects/:id/members/:userId` | Remove a member (owner-only) |
| GET / POST | `/api/projects/:projectId/tasks` | List or create project tasks |
| PATCH / DELETE | `/api/tasks/:id` | Update or delete a task |
| GET / POST | `/api/tasks/:id/comments` | List or add task comments |
| DELETE | `/api/tasks/:id/comments/:commentId` | Delete your own comment |
| GET / POST | `/api/tasks/:id/attachments` | List attachments / upload one attachment as multipart field `file` |
| GET / DELETE | `/api/tasks/:id/attachments/:attachmentId` | Download / delete an attachment |
| GET | `/api/notifications` | List notifications and unread count |
| PATCH | `/api/notifications/:id/read` | Mark a notification read; use `all` to mark all read |
| GET | `/api/notifications/dashboard` | Dashboard projects, assigned tasks, and task counts |
| GET | `/api/health` | API process health |

Socket.IO uses the same JWT as REST (`auth.token`). After connection, emit `project:join` with a project ID to receive project events; membership is checked before joining. Events include `task:created`, `task:updated`, `task:deleted`, `comment:created`, `comment:deleted`, and project member changes. The server sends `notification:new` to the appropriate user room.

## Authorization and data

Project, task, comment, and notification queries are scoped to the signed-in user or project membership. Passwords are bcrypt-hashed, inputs are validated, and database access uses parameterized SQL. Notifications and project/task activity are created from real user actions; the interface contains no fake/demo records.
