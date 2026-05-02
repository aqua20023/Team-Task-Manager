import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import Database from "better-sqlite3";
import { createId, hashPassword } from "./auth.js";

const STATUSES = ["To Do", "In Progress", "Done"];
const PRIORITIES = ["Low", "Medium", "High"];
const ROLES = ["ADMIN", "MEMBER"];

export function openDatabase() {
  const configuredPath =
    process.env.DATABASE_PATH || "server/data/task_manager.sqlite";
  const databasePath = isAbsolute(configuredPath)
    ? configuredPath
    : join(process.cwd(), configuredPath);

  mkdirSync(dirname(databasePath), { recursive: true });
  const db = new Database(databasePath);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  migrate(db);
  return db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      owner_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS memberships (
      project_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('ADMIN', 'MEMBER')),
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (project_id, user_id),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      due_date TEXT NOT NULL,
      priority TEXT NOT NULL CHECK(priority IN ('Low', 'Medium', 'High')),
      status TEXT NOT NULL CHECK(status IN ('To Do', 'In Progress', 'Done')),
      assignee_id TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TRIGGER IF NOT EXISTS tasks_updated_at
    AFTER UPDATE ON tasks
    FOR EACH ROW
    BEGIN
      UPDATE tasks SET updated_at = datetime('now') WHERE id = OLD.id;
    END;
  `);
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function inTransaction(db, callback) {
  db.exec("BEGIN");
  try {
    const result = callback();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function validateSignup({ name, email, password }) {
  if (!name || name.trim().length < 2) {
    throw new ApiError(400, "Name should be at least 2 characters.");
  }
  validateEmail(email);
  validatePassword(password);
}

export function validateEmail(email) {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, "Please enter a valid email address.");
  }
}

export function validatePassword(password) {
  if (!password || password.length < 6) {
    throw new ApiError(400, "Password should be at least 6 characters.");
  }
}

export function validateProject({ name }) {
  if (!name || name.trim().length < 2) {
    throw new ApiError(400, "Project name should be at least 2 characters.");
  }
}

export function validateTask(input, partial = false) {
  const required = ["title", "dueDate", "priority", "status"];
  for (const field of required) {
    if (!partial && !input[field]) {
      throw new ApiError(400, `${field} is required.`);
    }
  }

  if (input.title !== undefined && input.title.trim().length < 2) {
    throw new ApiError(400, "Task title should be at least 2 characters.");
  }
  if (input.dueDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) {
    throw new ApiError(400, "Due date should use YYYY-MM-DD format.");
  }
  if (input.priority !== undefined && !PRIORITIES.includes(input.priority)) {
    throw new ApiError(400, "Priority should be Low, Medium, or High.");
  }
  if (input.status !== undefined && !STATUSES.includes(input.status)) {
    throw new ApiError(400, "Status should be To Do, In Progress, or Done.");
  }
}

export function validateRole(role) {
  if (!ROLES.includes(role)) {
    throw new ApiError(400, "Role should be ADMIN or MEMBER.");
  }
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.created_at
  };
}

export function taskView(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description || "",
    dueDate: row.due_date,
    priority: row.priority,
    status: row.status,
    assigneeId: row.assignee_id,
    assigneeName: row.assignee_name || null,
    assigneeEmail: row.assignee_email || null,
    createdBy: row.created_by,
    createdByName: row.created_by_name || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function projectView(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || "",
    ownerId: row.owner_id,
    role: row.role,
    createdAt: row.created_at,
    memberCount: row.member_count || 0,
    taskCount: row.task_count || 0
  };
}

export function getUserByEmail(db, email) {
  return db
    .prepare("SELECT * FROM users WHERE lower(email) = lower(?)")
    .get(email);
}

export function getUserById(db, id) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
}

export function createUser(db, { name, email, password }) {
  const id = createId("usr");
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, lower(?), ?)"
  ).run(id, name.trim(), email.trim(), hashPassword(password));
  return getUserById(db, id);
}

export function getMembership(db, projectId, userId) {
  const membership = db
    .prepare(
      `SELECT m.*, p.name AS project_name, p.owner_id
       FROM memberships m
       JOIN projects p ON p.id = m.project_id
       WHERE m.project_id = ? AND m.user_id = ?`
    )
    .get(projectId, userId);

  if (!membership) {
    throw new ApiError(403, "You are not a member of this project.");
  }
  return membership;
}

export function requireAdmin(db, projectId, userId) {
  const membership = getMembership(db, projectId, userId);
  if (membership.role !== "ADMIN") {
    throw new ApiError(403, "Only project admins can do this.");
  }
  return membership;
}

export function ensureAssigneeIsMember(db, projectId, assigneeId) {
  if (!assigneeId) return;
  const member = db
    .prepare("SELECT 1 FROM memberships WHERE project_id = ? AND user_id = ?")
    .get(projectId, assigneeId);
  if (!member) {
    throw new ApiError(400, "Assignee should be a member of this project.");
  }
}

export function createProject(db, owner, { name, description }) {
  const projectId = createId("prj");
  const insertProject = db.prepare(
    "INSERT INTO projects (id, name, description, owner_id) VALUES (?, ?, ?, ?)"
  );
  const insertMembership = db.prepare(
    "INSERT INTO memberships (project_id, user_id, role) VALUES (?, ?, 'ADMIN')"
  );

  inTransaction(db, () => {
    insertProject.run(projectId, name.trim(), description?.trim() || "", owner.id);
    insertMembership.run(projectId, owner.id);
  });

  return projectId;
}

export function listProjects(db, userId) {
  return db
    .prepare(
      `SELECT p.*, m.role,
        COUNT(DISTINCT all_members.user_id) AS member_count,
        COUNT(DISTINCT t.id) AS task_count
       FROM memberships m
       JOIN projects p ON p.id = m.project_id
       LEFT JOIN memberships all_members ON all_members.project_id = p.id
       LEFT JOIN tasks t ON t.project_id = p.id
       WHERE m.user_id = ?
       GROUP BY p.id, m.role
       ORDER BY p.created_at DESC`
    )
    .all(userId)
    .map(projectView);
}

export function getProject(db, projectId, userId) {
  const membership = getMembership(db, projectId, userId);
  const row = db
    .prepare(
      `SELECT p.*, ? AS role,
        COUNT(DISTINCT all_members.user_id) AS member_count,
        COUNT(DISTINCT t.id) AS task_count
       FROM projects p
       LEFT JOIN memberships all_members ON all_members.project_id = p.id
       LEFT JOIN tasks t ON t.project_id = p.id
       WHERE p.id = ?
       GROUP BY p.id`
    )
    .get(membership.role, projectId);

  return projectView(row);
}

export function listMembers(db, projectId) {
  return db
    .prepare(
      `SELECT u.id, u.name, u.email, u.created_at, m.role, m.joined_at
       FROM memberships m
       JOIN users u ON u.id = m.user_id
       WHERE m.project_id = ?
       ORDER BY CASE m.role WHEN 'ADMIN' THEN 0 ELSE 1 END, u.name`
    )
    .all(projectId)
    .map((row) => ({
      ...publicUser(row),
      role: row.role,
      joinedAt: row.joined_at
    }));
}

export function listTasks(db, projectId, requester) {
  const membership = getMembership(db, projectId, requester.id);
  const baseQuery = `
    SELECT t.*, assignee.name AS assignee_name, assignee.email AS assignee_email,
      creator.name AS created_by_name
    FROM tasks t
    LEFT JOIN users assignee ON assignee.id = t.assignee_id
    JOIN users creator ON creator.id = t.created_by
    WHERE t.project_id = ?
  `;

  const params = [projectId];
  const memberFilter =
    membership.role === "MEMBER" ? " AND t.assignee_id = ?" : "";
  if (membership.role === "MEMBER") params.push(requester.id);

  return db
    .prepare(`${baseQuery}${memberFilter} ORDER BY t.due_date ASC, t.created_at DESC`)
    .all(...params)
    .map(taskView);
}

export function getTaskWithRole(db, taskId, userId) {
  const task = db
    .prepare(
      `SELECT t.*, assignee.name AS assignee_name, assignee.email AS assignee_email,
        creator.name AS created_by_name, m.role AS requester_role
       FROM tasks t
       JOIN memberships m ON m.project_id = t.project_id AND m.user_id = ?
       LEFT JOIN users assignee ON assignee.id = t.assignee_id
       JOIN users creator ON creator.id = t.created_by
       WHERE t.id = ?`
    )
    .get(userId, taskId);

  if (!task) throw new ApiError(404, "Task not found.");
  return task;
}

export function createTask(db, projectId, creatorId, input) {
  validateTask(input);
  ensureAssigneeIsMember(db, projectId, input.assigneeId);

  const taskId = createId("tsk");
  db.prepare(
    `INSERT INTO tasks
      (id, project_id, title, description, due_date, priority, status, assignee_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    taskId,
    projectId,
    input.title.trim(),
    input.description?.trim() || "",
    input.dueDate,
    input.priority,
    input.status,
    input.assigneeId || null,
    creatorId
  );

  return taskId;
}

export function updateTaskAsAdmin(db, taskId, projectId, input) {
  validateTask(input, true);
  if (input.assigneeId !== undefined) {
    ensureAssigneeIsMember(db, projectId, input.assigneeId);
  }

  const updates = [];
  const values = [];
  const fields = {
    title: "title",
    description: "description",
    dueDate: "due_date",
    priority: "priority",
    status: "status",
    assigneeId: "assignee_id"
  };

  for (const [inputKey, column] of Object.entries(fields)) {
    if (input[inputKey] !== undefined) {
      updates.push(`${column} = ?`);
      const value =
        typeof input[inputKey] === "string" ? input[inputKey].trim() : input[inputKey];
      values.push(value || null);
    }
  }

  if (updates.length === 0) return;
  values.push(taskId);

  db.prepare(`UPDATE tasks SET ${updates.join(", ")} WHERE id = ?`).run(...values);
}

export function updateTaskStatusAsMember(db, task, userId, status) {
  if (task.assignee_id !== userId) {
    throw new ApiError(403, "Members can update only their assigned tasks.");
  }
  validateTask({ status }, true);
  db.prepare("UPDATE tasks SET status = ? WHERE id = ?").run(status, task.id);
}

export function getDashboard(db, userId, projectId) {
  if (projectId) getMembership(db, projectId, userId);

  const rows = db
    .prepare(
      `SELECT t.*, assignee.name AS assignee_name, assignee.email AS assignee_email,
        m.role AS requester_role
       FROM tasks t
       JOIN memberships m ON m.project_id = t.project_id AND m.user_id = ?
       LEFT JOIN users assignee ON assignee.id = t.assignee_id
       WHERE (? IS NULL OR t.project_id = ?)
         AND (m.role = 'ADMIN' OR t.assignee_id = ?)`
    )
    .all(userId, projectId || null, projectId || null, userId);

  const today = new Date().toISOString().slice(0, 10);
  const byStatus = Object.fromEntries(STATUSES.map((status) => [status, 0]));
  const perUserMap = new Map();
  const overdue = [];

  for (const task of rows) {
    byStatus[task.status] += 1;
    const key = task.assignee_id || "unassigned";
    const label = task.assignee_name || "Unassigned";
    perUserMap.set(key, {
      userId: task.assignee_id,
      name: label,
      count: (perUserMap.get(key)?.count || 0) + 1
    });

    if (task.due_date < today && task.status !== "Done") {
      overdue.push(taskView(task));
    }
  }

  return {
    totalTasks: rows.length,
    byStatus,
    tasksPerUser: [...perUserMap.values()].sort((a, b) => b.count - a.count),
    overdueTasks: overdue
  };
}

export function seedDatabase(db) {
  const existing = db.prepare("SELECT COUNT(*) AS count FROM users").get();
  if (existing.count > 0) return false;

  const users = [
    { id: "usr_demo_admin", name: "Jai Verma", email: "jai@example.com" },
    { id: "usr_demo_member", name: "Aarav Singh", email: "aarav@example.com" },
    { id: "usr_demo_member_two", name: "Meera Shah", email: "meera@example.com" }
  ];

  const insertUser = db.prepare(
    "INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)"
  );
  const password = hashPassword("password123");

  inTransaction(db, () => {
    for (const user of users) {
      insertUser.run(user.id, user.name, user.email, password);
    }

    db.prepare(
      "INSERT INTO projects (id, name, description, owner_id) VALUES (?, ?, ?, ?)"
    ).run(
      "prj_demo_launch",
      "Launch Website Redesign",
      "Small team board for the candidate assignment demo.",
      users[0].id
    );

    db.prepare(
      "INSERT INTO memberships (project_id, user_id, role) VALUES (?, ?, ?)"
    ).run("prj_demo_launch", users[0].id, "ADMIN");
    db.prepare(
      "INSERT INTO memberships (project_id, user_id, role) VALUES (?, ?, ?)"
    ).run("prj_demo_launch", users[1].id, "MEMBER");
    db.prepare(
      "INSERT INTO memberships (project_id, user_id, role) VALUES (?, ?, ?)"
    ).run("prj_demo_launch", users[2].id, "MEMBER");

    const insertTask = db.prepare(
      `INSERT INTO tasks
        (id, project_id, title, description, due_date, priority, status, assignee_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    insertTask.run(
      "tsk_demo_one",
      "prj_demo_launch",
      "Finalize task board layout",
      "Keep the board clean on mobile and desktop.",
      "2026-05-04",
      "High",
      "In Progress",
      users[1].id,
      users[0].id
    );
    insertTask.run(
      "tsk_demo_two",
      "prj_demo_launch",
      "Write README deployment notes",
      "Document the Railway variables and local commands.",
      "2026-05-06",
      "Medium",
      "To Do",
      users[2].id,
      users[0].id
    );
    insertTask.run(
      "tsk_demo_three",
      "prj_demo_launch",
      "Record short demo video",
      "Show signup, project creation, task assignment, and dashboard.",
      "2026-05-01",
      "Low",
      "To Do",
      users[0].id,
      users[0].id
    );
  });
  return true;
}
