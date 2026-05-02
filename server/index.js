import express from "express";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadEnv } from "./env.js";
import { signToken, verifyPassword, verifyToken } from "./auth.js";
import {
  ApiError,
  createProject,
  createTask,
  createUser,
  getDashboard,
  getMembership,
  getProject,
  getTaskWithRole,
  getUserByEmail,
  getUserById,
  listMembers,
  listProjects,
  listTasks,
  openDatabase,
  publicUser,
  requireAdmin,
  taskView,
  updateTaskAsAdmin,
  updateTaskStatusAsMember,
  validateEmail,
  validateProject,
  validateRole,
  validateSignup
} from "./db.js";

loadEnv();

const app = express();
const db = openDatabase();
const port = Number(process.env.PORT || 5000);
const jwtSecret =
  process.env.JWT_SECRET || "local-development-secret-change-before-deploy";

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigin = process.env.CLIENT_ORIGIN;
  const localOrigin = origin && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);

  if ((allowedOrigin && origin === allowedOrigin) || (!allowedOrigin && localOrigin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

app.use(express.json({ limit: "1mb" }));

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function requireAuth(req, _res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    next(new ApiError(401, "Please log in first."));
    return;
  }

  let payload = null;
  try {
    payload = verifyToken(token, jwtSecret);
  } catch {
    payload = null;
  }

  if (!payload?.sub) {
    next(new ApiError(401, "Your session is invalid or expired."));
    return;
  }

  const user = getUserById(db, payload.sub);
  if (!user) {
    next(new ApiError(401, "User account no longer exists."));
    return;
  }

  req.user = publicUser(user);
  next();
}

function authResponse(user) {
  const safeUser = publicUser(user);
  return {
    user: safeUser,
    token: signToken(safeUser, jwtSecret)
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "team-task-manager" });
});

app.post(
  "/api/auth/signup",
  asyncRoute((req, res) => {
    validateSignup(req.body);

    if (getUserByEmail(db, req.body.email)) {
      throw new ApiError(409, "An account with this email already exists.");
    }

    const user = createUser(db, req.body);
    res.status(201).json(authResponse(user));
  })
);

app.post(
  "/api/auth/login",
  asyncRoute((req, res) => {
    validateEmail(req.body.email);
    const user = getUserByEmail(db, req.body.email);

    if (!user || !verifyPassword(req.body.password || "", user.password_hash)) {
      throw new ApiError(401, "Email or password is incorrect.");
    }

    res.json(authResponse(user));
  })
);

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.get(
  "/api/projects",
  requireAuth,
  asyncRoute((req, res) => {
    res.json({ projects: listProjects(db, req.user.id) });
  })
);

app.post(
  "/api/projects",
  requireAuth,
  asyncRoute((req, res) => {
    validateProject(req.body);
    const projectId = createProject(db, req.user, req.body);
    res.status(201).json({
      project: getProject(db, projectId, req.user.id)
    });
  })
);

app.get(
  "/api/projects/:projectId",
  requireAuth,
  asyncRoute((req, res) => {
    const { projectId } = req.params;
    const project = getProject(db, projectId, req.user.id);
    res.json({
      project,
      members: listMembers(db, projectId),
      tasks: listTasks(db, projectId, req.user),
      dashboard: getDashboard(db, req.user.id, projectId)
    });
  })
);

app.patch(
  "/api/projects/:projectId",
  requireAuth,
  asyncRoute((req, res) => {
    const { projectId } = req.params;
    requireAdmin(db, projectId, req.user.id);
    validateProject({ name: req.body.name });

    db.prepare("UPDATE projects SET name = ?, description = ? WHERE id = ?").run(
      req.body.name.trim(),
      req.body.description?.trim() || "",
      projectId
    );

    res.json({ project: getProject(db, projectId, req.user.id) });
  })
);

app.delete(
  "/api/projects/:projectId",
  requireAuth,
  asyncRoute((req, res) => {
    const { projectId } = req.params;
    requireAdmin(db, projectId, req.user.id);
    db.prepare("DELETE FROM projects WHERE id = ?").run(projectId);
    res.status(204).end();
  })
);

app.post(
  "/api/projects/:projectId/members",
  requireAuth,
  asyncRoute((req, res) => {
    const { projectId } = req.params;
    requireAdmin(db, projectId, req.user.id);
    validateEmail(req.body.email);

    const role = req.body.role || "MEMBER";
    validateRole(role);

    const user = getUserByEmail(db, req.body.email);
    if (!user) {
      throw new ApiError(404, "That user needs to sign up before you can add them.");
    }

    const existing = db
      .prepare("SELECT 1 FROM memberships WHERE project_id = ? AND user_id = ?")
      .get(projectId, user.id);
    if (existing) throw new ApiError(409, "This user is already in the project.");

    db.prepare("INSERT INTO memberships (project_id, user_id, role) VALUES (?, ?, ?)").run(
      projectId,
      user.id,
      role
    );

    res.status(201).json({ members: listMembers(db, projectId) });
  })
);

app.patch(
  "/api/projects/:projectId/members/:userId",
  requireAuth,
  asyncRoute((req, res) => {
    const { projectId, userId } = req.params;
    requireAdmin(db, projectId, req.user.id);
    validateRole(req.body.role);

    const membership = getMembership(db, projectId, userId);
    if (membership.role === "ADMIN" && req.body.role === "MEMBER") {
      const adminCount = db
        .prepare(
          "SELECT COUNT(*) AS count FROM memberships WHERE project_id = ? AND role = 'ADMIN'"
        )
        .get(projectId).count;
      if (adminCount <= 1) {
        throw new ApiError(400, "A project needs at least one admin.");
      }
    }

    db.prepare("UPDATE memberships SET role = ? WHERE project_id = ? AND user_id = ?").run(
      req.body.role,
      projectId,
      userId
    );

    res.json({ members: listMembers(db, projectId) });
  })
);

app.delete(
  "/api/projects/:projectId/members/:userId",
  requireAuth,
  asyncRoute((req, res) => {
    const { projectId, userId } = req.params;
    requireAdmin(db, projectId, req.user.id);
    const membership = getMembership(db, projectId, userId);

    if (membership.role === "ADMIN") {
      const adminCount = db
        .prepare(
          "SELECT COUNT(*) AS count FROM memberships WHERE project_id = ? AND role = 'ADMIN'"
        )
        .get(projectId).count;
      if (adminCount <= 1) {
        throw new ApiError(400, "A project needs at least one admin.");
      }
    }

    db.prepare("UPDATE tasks SET assignee_id = NULL WHERE project_id = ? AND assignee_id = ?").run(
      projectId,
      userId
    );
    db.prepare("DELETE FROM memberships WHERE project_id = ? AND user_id = ?").run(
      projectId,
      userId
    );

    res.status(204).end();
  })
);

app.post(
  "/api/projects/:projectId/tasks",
  requireAuth,
  asyncRoute((req, res) => {
    const { projectId } = req.params;
    requireAdmin(db, projectId, req.user.id);
    const taskId = createTask(db, projectId, req.user.id, req.body);
    const task = getTaskWithRole(db, taskId, req.user.id);
    res.status(201).json({ task: taskView(task) });
  })
);

app.patch(
  "/api/tasks/:taskId",
  requireAuth,
  asyncRoute((req, res) => {
    const task = getTaskWithRole(db, req.params.taskId, req.user.id);

    if (task.requester_role === "ADMIN") {
      updateTaskAsAdmin(db, task.id, task.project_id, req.body);
    } else {
      if (!req.body.status) {
        throw new ApiError(400, "Members can update task status only.");
      }
      updateTaskStatusAsMember(db, task, req.user.id, req.body.status);
    }

    const updated = getTaskWithRole(db, req.params.taskId, req.user.id);
    res.json({ task: taskView(updated) });
  })
);

app.delete(
  "/api/tasks/:taskId",
  requireAuth,
  asyncRoute((req, res) => {
    const task = getTaskWithRole(db, req.params.taskId, req.user.id);
    if (task.requester_role !== "ADMIN") {
      throw new ApiError(403, "Only project admins can delete tasks.");
    }

    db.prepare("DELETE FROM tasks WHERE id = ?").run(task.id);
    res.status(204).end();
  })
);

app.get(
  "/api/dashboard",
  requireAuth,
  asyncRoute((req, res) => {
    res.json({ dashboard: getDashboard(db, req.user.id, req.query.projectId) });
  })
);

const distPath = join(process.cwd(), "client", "dist");
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get(/.*/, (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(join(distPath, "index.html"));
  });
}

app.use((req, _res, next) => {
  next(new ApiError(404, `Route not found: ${req.method} ${req.path}`));
});

app.use((error, _req, res, _next) => {
  const status = error.status || 500;
  if (status >= 500) {
    console.error(error);
  }

  res.status(status).json({
    error: error.message || "Something went wrong."
  });
});

app.listen(port, () => {
  console.log(`Team Task Manager running on http://localhost:${port}`);
});
