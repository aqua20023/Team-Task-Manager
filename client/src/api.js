const TOKEN_KEY = "team-task-manager-token";

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function storeToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function apiRequest(path, options = {}) {
  const token = getStoredToken();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(path, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (response.status === 204) return null;

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
}
