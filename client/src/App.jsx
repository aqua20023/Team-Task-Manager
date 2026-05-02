import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  CircleDot,
  Clock3,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  Loader2,
  LogOut,
  Pencil,
  Plus,
  Trash2,
  UserPlus,
  Users,
  X
} from "lucide-react";
import { apiRequest, clearToken, getStoredToken, storeToken } from "./api.js";

const STATUSES = ["To Do", "In Progress", "Done"];
const PRIORITIES = ["Low", "Medium", "High"];

const emptyTaskForm = {
  title: "",
  description: "",
  dueDate: new Date().toISOString().slice(0, 10),
  priority: "Medium",
  status: "To Do",
  assigneeId: ""
};

export default function App() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [detail, setDetail] = useState(null);
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [taskModal, setTaskModal] = useState(null);
  const [statusFilter, setStatusFilter] = useState("All");

  const selectedProject = detail?.project;
  const isAdmin = selectedProject?.role === "ADMIN";

  useEffect(() => {
    async function boot() {
      const token = getStoredToken();
      if (!token) {
        setAuthChecked(true);
        return;
      }

      try {
        const data = await apiRequest("/api/auth/me");
        setUser(data.user);
        await loadProjects();
      } catch {
        clearToken();
      } finally {
        setAuthChecked(true);
      }
    }

    boot();
  }, []);

  useEffect(() => {
    if (selectedProjectId) loadProjectDetail(selectedProjectId);
  }, [selectedProjectId]);

  async function loadProjects(projectToSelect) {
    const data = await apiRequest("/api/projects");
    setProjects(data.projects);

    const nextProjectId =
      projectToSelect ||
      selectedProjectId ||
      data.projects[0]?.id ||
      "";

    setSelectedProjectId(nextProjectId);
    if (nextProjectId) {
      await loadProjectDetail(nextProjectId);
    } else {
      setDetail(null);
    }
  }

  async function loadProjectDetail(projectId = selectedProjectId) {
    if (!projectId) return;
    setLoading(true);
    try {
      const data = await apiRequest(`/api/projects/${projectId}`);
      setDetail(data);
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleAuth(payload, mode) {
    setLoading(true);
    try {
      const data = await apiRequest(`/api/auth/${mode}`, {
        method: "POST",
        body: payload
      });
      storeToken(data.token);
      setUser(data.user);
      await loadProjects();
      showToast(mode === "signup" ? "Account created." : "Welcome back.");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    clearToken();
    setUser(null);
    setProjects([]);
    setDetail(null);
    setSelectedProjectId("");
  }

  async function createProject(values) {
    setLoading(true);
    try {
      const data = await apiRequest("/api/projects", {
        method: "POST",
        body: values
      });
      setShowProjectForm(false);
      await loadProjects(data.project.id);
      showToast("Project created.");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function addMember(values) {
    try {
      const data = await apiRequest(`/api/projects/${selectedProjectId}/members`, {
        method: "POST",
        body: values
      });
      setDetail((current) => ({ ...current, members: data.members }));
      await loadProjectDetail();
      showToast("Member added.");
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  async function changeMemberRole(userId, role) {
    try {
      const data = await apiRequest(
        `/api/projects/${selectedProjectId}/members/${userId}`,
        {
          method: "PATCH",
          body: { role }
        }
      );
      setDetail((current) => ({ ...current, members: data.members }));
      showToast("Role updated.");
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  async function removeMember(userId) {
    try {
      await apiRequest(`/api/projects/${selectedProjectId}/members/${userId}`, {
        method: "DELETE"
      });
      await loadProjectDetail();
      showToast("Member removed.");
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  async function saveTask(values, taskId) {
    try {
      const endpoint = taskId
        ? `/api/tasks/${taskId}`
        : `/api/projects/${selectedProjectId}/tasks`;
      await apiRequest(endpoint, {
        method: taskId ? "PATCH" : "POST",
        body: values
      });
      setTaskModal(null);
      await loadProjectDetail();
      await loadProjects(selectedProjectId);
      showToast(taskId ? "Task updated." : "Task created.");
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  async function updateStatus(task, status) {
    try {
      await apiRequest(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: { status }
      });
      await loadProjectDetail();
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  async function deleteTask(taskId) {
    try {
      await apiRequest(`/api/tasks/${taskId}`, { method: "DELETE" });
      await loadProjectDetail();
      await loadProjects(selectedProjectId);
      showToast("Task deleted.");
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  function showToast(message, type = "success") {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3200);
  }

  const tasks = detail?.tasks || [];
  const filteredTasks = useMemo(() => {
    if (statusFilter === "All") return tasks;
    return tasks.filter((task) => task.status === statusFilter);
  }, [tasks, statusFilter]);

  if (!authChecked) {
    return <FullPageLoader />;
  }

  if (!user) {
    return (
      <>
        <AuthPage onSubmit={handleAuth} loading={loading} />
        {toast && <Toast toast={toast} />}
      </>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-row">
          <div className="brand-mark">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <strong>Team Task Manager</strong>
            <span>Workspace</span>
          </div>
        </div>

        <button className="button primary full" onClick={() => setShowProjectForm(true)}>
          <Plus size={17} />
          New Project
        </button>

        <nav className="project-list" aria-label="Projects">
          {projects.map((project) => (
            <button
              key={project.id}
              className={`project-link ${
                selectedProjectId === project.id ? "active" : ""
              }`}
              onClick={() => setSelectedProjectId(project.id)}
            >
              <span className="project-icon">
                <FolderKanban size={16} />
              </span>
              <span>
                <strong>{project.name}</strong>
                <small>
                  {project.role === "ADMIN" ? "Admin" : "Member"} · {project.taskCount} tasks
                </small>
              </span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">Signed in as</span>
            <h1>{user.name}</h1>
          </div>
          <button className="icon-button" onClick={logout} title="Log out" aria-label="Log out">
            <LogOut size={18} />
          </button>
        </header>

        {projects.length === 0 ? (
          <EmptyWorkspace onCreate={() => setShowProjectForm(true)} />
        ) : (
          <section className="project-space">
            <ProjectHeader
              project={selectedProject}
              loading={loading}
              isAdmin={isAdmin}
              onCreateTask={() => setTaskModal({ mode: "create" })}
            />

            {detail && (
              <>
                <DashboardStrip dashboard={detail.dashboard} />

                <div className="content-grid">
                  <section className="board-panel">
                    <div className="panel-heading">
                      <div>
                        <span className="eyebrow">Tasks</span>
                        <h2>Board</h2>
                      </div>
                      <SegmentedFilter
                        value={statusFilter}
                        onChange={setStatusFilter}
                      />
                    </div>

                    <TaskBoard
                      tasks={filteredTasks}
                      members={detail.members}
                      isAdmin={isAdmin}
                      onEdit={(task) => setTaskModal({ mode: "edit", task })}
                      onDelete={deleteTask}
                      onStatusChange={updateStatus}
                    />
                  </section>

                  <aside className="side-panels">
                    <MembersPanel
                      members={detail.members}
                      isAdmin={isAdmin}
                      currentUserId={user.id}
                      onAdd={addMember}
                      onRoleChange={changeMemberRole}
                      onRemove={removeMember}
                    />
                    <WorkloadPanel dashboard={detail.dashboard} />
                  </aside>
                </div>
              </>
            )}
          </section>
        )}
      </main>

      {showProjectForm && (
        <ProjectModal
          onClose={() => setShowProjectForm(false)}
          onSubmit={createProject}
        />
      )}

      {taskModal && detail && (
        <TaskModal
          mode={taskModal.mode}
          task={taskModal.task}
          members={detail.members}
          onClose={() => setTaskModal(null)}
          onSubmit={saveTask}
        />
      )}

      {toast && <Toast toast={toast} />}
    </div>
  );
}

function AuthPage({ onSubmit, loading }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: ""
  });

  function submit(event) {
    event.preventDefault();
    const payload =
      mode === "signup"
        ? form
        : { email: form.email, password: form.password };
    onSubmit(payload, mode);
  }

  return (
    <main className="auth-shell">
      <section className="auth-intro">
        <div className="brand-row">
          <div className="brand-mark">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <strong>Team Task Manager</strong>
            <span>Full-stack assignment</span>
          </div>
        </div>
        <h1>Plan work, assign ownership, and keep progress visible.</h1>
        <div className="auth-preview">
          <div>
            <span className="preview-dot green" />
            <strong>12</strong>
            <small>Total tasks</small>
          </div>
          <div>
            <span className="preview-dot amber" />
            <strong>5</strong>
            <small>In progress</small>
          </div>
          <div>
            <span className="preview-dot coral" />
            <strong>2</strong>
            <small>Overdue</small>
          </div>
        </div>
      </section>

      <section className="auth-card">
        <div className="auth-tabs">
          <button
            className={mode === "login" ? "active" : ""}
            onClick={() => setMode("login")}
            type="button"
          >
            Login
          </button>
          <button
            className={mode === "signup" ? "active" : ""}
            onClick={() => setMode("signup")}
            type="button"
          >
            Signup
          </button>
        </div>

        <form onSubmit={submit} className="stacked-form">
          {mode === "signup" && (
            <label>
              Name
              <input
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                placeholder="Jai Verma"
                required
              />
            </label>
          )}

          <label>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(event) =>
                setForm({ ...form, email: event.target.value })
              }
              placeholder="you@example.com"
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={form.password}
              onChange={(event) =>
                setForm({ ...form, password: event.target.value })
              }
              placeholder="Minimum 6 characters"
              required
            />
          </label>

          <button className="button primary full" disabled={loading}>
            {loading && <Loader2 className="spin" size={16} />}
            {mode === "signup" ? "Create Account" : "Login"}
          </button>
        </form>
      </section>
    </main>
  );
}

function ProjectHeader({ project, loading, isAdmin, onCreateTask }) {
  if (!project) return null;

  return (
    <div className="project-header">
      <div>
        <div className="project-title-row">
          <h2>{project.name}</h2>
          <span className={`role-pill ${isAdmin ? "admin" : "member"}`}>
            {isAdmin ? "Admin" : "Member"}
          </span>
        </div>
        <p>{project.description || "No description yet."}</p>
      </div>

      {isAdmin && (
        <button className="button primary" onClick={onCreateTask} disabled={loading}>
          <Plus size={17} />
          Task
        </button>
      )}
    </div>
  );
}

function DashboardStrip({ dashboard }) {
  const cards = [
    {
      label: "Total tasks",
      value: dashboard.totalTasks,
      icon: ListChecks,
      tone: "blue"
    },
    {
      label: "To do",
      value: dashboard.byStatus["To Do"],
      icon: CircleDot,
      tone: "plain"
    },
    {
      label: "In progress",
      value: dashboard.byStatus["In Progress"],
      icon: Clock3,
      tone: "amber"
    },
    {
      label: "Overdue",
      value: dashboard.overdueTasks.length,
      icon: AlertTriangle,
      tone: "coral"
    }
  ];

  return (
    <div className="metric-grid">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <article className={`metric-card ${card.tone}`} key={card.label}>
            <Icon size={18} />
            <div>
              <strong>{card.value}</strong>
              <span>{card.label}</span>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function SegmentedFilter({ value, onChange }) {
  return (
    <div className="segmented" aria-label="Task status filter">
      {["All", ...STATUSES].map((status) => (
        <button
          key={status}
          className={value === status ? "active" : ""}
          onClick={() => onChange(status)}
          type="button"
        >
          {status}
        </button>
      ))}
    </div>
  );
}

function TaskBoard({ tasks, members, isAdmin, onEdit, onDelete, onStatusChange }) {
  return (
    <div className="task-board">
      {STATUSES.map((status) => {
        const columnTasks = tasks.filter((task) => task.status === status);
        return (
          <section className="task-column" key={status}>
            <header>
              <span>{status}</span>
              <strong>{columnTasks.length}</strong>
            </header>

            <div className="task-list">
              {columnTasks.length === 0 ? (
                <div className="empty-column">Clear</div>
              ) : (
                columnTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    members={members}
                    isAdmin={isAdmin}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onStatusChange={onStatusChange}
                  />
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function TaskCard({ task, isAdmin, onEdit, onDelete, onStatusChange }) {
  const isOverdue =
    task.dueDate < new Date().toISOString().slice(0, 10) && task.status !== "Done";

  return (
    <article className="task-card">
      <div className="task-card-top">
        <span className={`priority ${task.priority.toLowerCase()}`}>
          {task.priority}
        </span>
        {isAdmin && (
          <div className="task-actions">
            <button
              className="icon-button small"
              title="Edit task"
              aria-label="Edit task"
              onClick={() => onEdit(task)}
            >
              <Pencil size={15} />
            </button>
            <button
              className="icon-button small danger"
              title="Delete task"
              aria-label="Delete task"
              onClick={() => onDelete(task.id)}
            >
              <Trash2 size={15} />
            </button>
          </div>
        )}
      </div>

      <h3>{task.title}</h3>
      {task.description && <p>{task.description}</p>}

      <div className="task-meta">
        <span className={isOverdue ? "overdue" : ""}>
          <CalendarDays size={14} />
          {formatDate(task.dueDate)}
        </span>
        <span>
          <Users size={14} />
          {task.assigneeName || "Unassigned"}
        </span>
      </div>

      <select
        className="status-select"
        value={task.status}
        onChange={(event) => onStatusChange(task, event.target.value)}
      >
        {STATUSES.map((status) => (
          <option key={status}>{status}</option>
        ))}
      </select>
    </article>
  );
}

function MembersPanel({
  members,
  isAdmin,
  currentUserId,
  onAdd,
  onRoleChange,
  onRemove
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("MEMBER");

  function submit(event) {
    event.preventDefault();
    onAdd({ email, role });
    setEmail("");
    setRole("MEMBER");
  }

  return (
    <section className="panel">
      <div className="panel-heading compact">
        <div>
          <span className="eyebrow">Team</span>
          <h2>Members</h2>
        </div>
        <Users size={18} />
      </div>

      {isAdmin && (
        <form className="member-form" onSubmit={submit}>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="teammate@email.com"
            required
          />
          <select value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="MEMBER">Member</option>
            <option value="ADMIN">Admin</option>
          </select>
          <button className="icon-button solid" title="Add member" aria-label="Add member">
            <UserPlus size={17} />
          </button>
        </form>
      )}

      <div className="member-list">
        {members.map((member) => (
          <div className="member-row" key={member.id}>
            <div className="avatar">{initials(member.name)}</div>
            <div className="member-copy">
              <strong>{member.name}</strong>
              <small>{member.email}</small>
            </div>

            {isAdmin ? (
              <select
                value={member.role}
                onChange={(event) => onRoleChange(member.id, event.target.value)}
                disabled={member.id === currentUserId && member.role === "ADMIN"}
              >
                <option value="MEMBER">Member</option>
                <option value="ADMIN">Admin</option>
              </select>
            ) : (
              <span className="role-text">{member.role}</span>
            )}

            {isAdmin && member.id !== currentUserId && (
              <button
                className="icon-button small danger"
                title="Remove member"
                aria-label="Remove member"
                onClick={() => onRemove(member.id)}
              >
                <X size={15} />
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function WorkloadPanel({ dashboard }) {
  const maxCount = Math.max(1, ...dashboard.tasksPerUser.map((item) => item.count));

  return (
    <section className="panel">
      <div className="panel-heading compact">
        <div>
          <span className="eyebrow">Dashboard</span>
          <h2>Workload</h2>
        </div>
        <LayoutDashboard size={18} />
      </div>

      <div className="workload-list">
        {dashboard.tasksPerUser.length === 0 ? (
          <div className="empty-column">No tasks yet</div>
        ) : (
          dashboard.tasksPerUser.map((item) => (
            <div className="workload-item" key={item.userId || "unassigned"}>
              <div>
                <strong>{item.name}</strong>
                <span>{item.count} tasks</span>
              </div>
              <div className="bar-track">
                <span style={{ width: `${(item.count / maxCount) * 100}%` }} />
              </div>
            </div>
          ))
        )}
      </div>

      {dashboard.overdueTasks.length > 0 && (
        <div className="overdue-list">
          <span className="eyebrow">Overdue</span>
          {dashboard.overdueTasks.slice(0, 4).map((task) => (
            <div key={task.id}>
              <strong>{task.title}</strong>
              <small>{formatDate(task.dueDate)}</small>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ProjectModal({ onClose, onSubmit }) {
  const [form, setForm] = useState({ name: "", description: "" });

  function submit(event) {
    event.preventDefault();
    onSubmit(form);
  }

  return (
    <Modal title="New Project" onClose={onClose}>
      <form className="stacked-form" onSubmit={submit}>
        <label>
          Name
          <input
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="Product Launch"
            required
          />
        </label>
        <label>
          Description
          <textarea
            value={form.description}
            onChange={(event) =>
              setForm({ ...form, description: event.target.value })
            }
            placeholder="Short project summary"
            rows={4}
          />
        </label>
        <div className="form-actions">
          <button className="button ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary">Create</button>
        </div>
      </form>
    </Modal>
  );
}

function TaskModal({ mode, task, members, onClose, onSubmit }) {
  const [form, setForm] = useState(() => {
    if (!task) return emptyTaskForm;
    return {
      title: task.title,
      description: task.description,
      dueDate: task.dueDate,
      priority: task.priority,
      status: task.status,
      assigneeId: task.assigneeId || ""
    };
  });

  function submit(event) {
    event.preventDefault();
    onSubmit(form, task?.id);
  }

  return (
    <Modal title={mode === "edit" ? "Edit Task" : "New Task"} onClose={onClose}>
      <form className="stacked-form" onSubmit={submit}>
        <label>
          Title
          <input
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            placeholder="Design review"
            required
          />
        </label>
        <label>
          Description
          <textarea
            value={form.description}
            onChange={(event) =>
              setForm({ ...form, description: event.target.value })
            }
            placeholder="Add useful task context"
            rows={4}
          />
        </label>
        <div className="form-grid">
          <label>
            Due date
            <input
              type="date"
              value={form.dueDate}
              onChange={(event) =>
                setForm({ ...form, dueDate: event.target.value })
              }
              required
            />
          </label>
          <label>
            Priority
            <select
              value={form.priority}
              onChange={(event) =>
                setForm({ ...form, priority: event.target.value })
              }
            >
              {PRIORITIES.map((priority) => (
                <option key={priority}>{priority}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-grid">
          <label>
            Status
            <select
              value={form.status}
              onChange={(event) => setForm({ ...form, status: event.target.value })}
            >
              {STATUSES.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </label>
          <label>
            Assignee
            <select
              value={form.assigneeId}
              onChange={(event) =>
                setForm({ ...form, assigneeId: event.target.value })
              }
            >
              <option value="">Unassigned</option>
              {members.map((member) => (
                <option value={member.id} key={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-actions">
          <button className="button ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary">
            {mode === "edit" ? "Save" : "Create"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} title="Close" aria-label="Close">
            <X size={18} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function EmptyWorkspace({ onCreate }) {
  return (
    <section className="empty-workspace">
      <FolderKanban size={36} />
      <h2>Create your first project</h2>
      <p>Start with a team space, then add members and assign tasks.</p>
      <button className="button primary" onClick={onCreate}>
        <Plus size={17} />
        New Project
      </button>
    </section>
  );
}

function Toast({ toast }) {
  return <div className={`toast ${toast.type}`}>{toast.message}</div>;
}

function FullPageLoader() {
  return (
    <div className="full-loader">
      <Loader2 className="spin" size={24} />
    </div>
  );
}

function initials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric"
  }).format(new Date(`${date}T00:00:00`));
}
