# Team Task Manager

A full-stack team task management app built with React, Node.js, Express, and SQLite. It covers signup/login, project membership, admin/member roles, task assignment, status updates, and a dashboard with task totals, workload, and overdue items.

## Features

- Secure signup and login with signed auth tokens
- Project creation where the creator automatically becomes Admin
- Admin controls for adding/removing members and managing tasks
- Member view limited to assigned work, with status updates only
- Task fields: title, description, due date, priority, status, assignee
- Dashboard cards for total tasks, status counts, workload per user, and overdue tasks
- Responsive React UI for desktop and mobile
- Railway-ready single-service deployment

## Tech Stack

- Frontend: React, Vite, CSS
- Backend: Node.js, Express
- Database: SQLite with `better-sqlite3`
- Auth: Password hashing with `crypto.scrypt`, signed JWT-style tokens with `crypto`

## Project Structure

```text
client/
  src/
    App.jsx
    api.js
    styles.css
server/
  auth.js
  db.js
  env.js
  index.js
  seed.js
scripts/
  dev.mjs
```

## Local Setup

Node.js 20 or newer is required.

1. Install dependencies:

```bash
npm install
```

2. Create a local environment file:

```bash
cp .env.example .env
```

3. Start the app in development:

```bash
npm run dev
```

The React app runs on `http://localhost:5173` and the API runs on `http://localhost:5000`.

## Optional Demo Data

```bash
npm run seed
```

Demo logins:

```text
jai@example.com / password123
aarav@example.com / password123
```

## Production Build

```bash
npm run build
npm start
```

In production, Express serves the built React files from `client/dist`, so Railway only needs one deployed service.

## Railway Deployment

1. Push this project to GitHub.
2. Create a new Railway project from the GitHub repo.
3. Add these environment variables:

```text
JWT_SECRET=use-a-long-random-secret
DATABASE_PATH=/data/task_manager.sqlite
```

4. Add a Railway volume mounted at `/data` so the SQLite database persists after redeploys.
5. Railway will use `railway.json`:
   - Build: `npm install && npm run build`
   - Start: `npm start`
6. Open the generated Railway domain and test signup/login.

## API Overview

Auth:

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/me`

Projects:

- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:projectId`
- `PATCH /api/projects/:projectId`
- `DELETE /api/projects/:projectId`

Members:

- `POST /api/projects/:projectId/members`
- `PATCH /api/projects/:projectId/members/:userId`
- `DELETE /api/projects/:projectId/members/:userId`

Tasks:

- `POST /api/projects/:projectId/tasks`
- `PATCH /api/tasks/:taskId`
- `DELETE /api/tasks/:taskId`

Dashboard:

- `GET /api/dashboard`
- `GET /api/dashboard?projectId=:projectId`

## Database Design

The main tables are:

- `users`: account details and password hashes
- `projects`: project name, description, owner
- `memberships`: connects users to projects with `ADMIN` or `MEMBER` role
- `tasks`: project tasks with status, priority, due date, assignee, and creator

The important relationship is `memberships`, because a user can belong to many projects and each project can have many users. Role-based access is checked through this table on protected routes.

## What To Explain In The Interview

I would explain the app in this order:

1. Authentication: users sign up or log in, passwords are hashed with a salt, and the server returns a signed token.
2. Authorization: every project and task request checks whether the logged-in user belongs to the project.
3. Roles: Admins can manage members and tasks. Members can only see assigned tasks and update task status.
4. Database schema: `users`, `projects`, `memberships`, and `tasks` keep the relationships normalized.
5. Dashboard: the backend calculates totals, status counts, tasks per user, and overdue tasks from accessible tasks.
6. Deployment: Railway builds the React app, starts the Express server, and the server serves both API and frontend.

## Demo Video Flow

For a 2-5 minute demo:

1. Start on signup/login.
2. Create a project.
3. Add another signed-up user as a member.
4. Create a task, set priority and due date, and assign it.
5. Show the dashboard cards and workload section.
6. Log in as the member and update the assigned task status.
7. End by showing the Railway deployment and README setup notes.
