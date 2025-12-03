const $ = (selector) => document.querySelector(selector);
const api = (path, options = {}) => fetch(path, {
  headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  ...options,
});

const state = {
  secretToken: localStorage.getItem("secretToken") || "",
  adminToken: localStorage.getItem("adminToken") || "",
};

function updateClock() {
  const el = $("#clock");
  if (!el) return;
  const now = new Date();
  const intl = new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "full",
    timeStyle: "medium",
  });
  el.textContent = intl.format(now);
}
setInterval(updateClock, 1000);
updateClock();

async function loadPublicDiaries() {
  const res = await api("/api/public/diaries");
  const data = await res.json();
  const list = data.items || [];
  const heroList = document.getElementById("publicDiaryList");
  const grid = document.getElementById("diaryGrid");
  heroList.innerHTML = "";
  grid.innerHTML = "";
  list.forEach((item) => {
    const pill = document.createElement("div");
    pill.className = "card-pill";
    pill.innerHTML = `<div class="badge">${item.author}</div><div>${item.title}</div><small class="muted">${item.created_at}</small>`;
    heroList.appendChild(pill);

    const card = document.createElement("div");
    card.className = "diary-card card-sparkle";
    card.innerHTML = `
      <div class="badge">${item.title}</div>
      <p>${item.excerpt || "..."}</p>
      <small class="muted">${item.created_at} · ${item.author}</small>
    `;
    grid.appendChild(card);
  });
}

async function loadPublicMessages() {
  const res = await api("/api/public/messages");
  const data = await res.json();
  const list = data.items || [];
  const wrap = document.getElementById("publicMessageList");
  wrap.innerHTML = list
    .map(
      (m) => `<div class="message-item"><div>${m.content}</div><div class="message-meta">${m.nickname} · ${m.created_at}</div></div>`
    )
    .join("");
}

function setupPublicMessageForm() {
  const form = document.getElementById("publicMessageForm");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const body = Object.fromEntries(formData.entries());
    const res = await api("/api/public/messages", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const data = await res.json();
    const hint = document.getElementById("publicMessageHint");
    if (!res.ok) {
      hint.textContent = data.error || "提交失败";
      return;
    }
    hint.textContent = data.message || "已发布";
    form.reset();
    loadPublicMessages();
  });
}

function setupSecretModal() {
  const modal = document.getElementById("secretModal");
  $("#openSecret").addEventListener("click", () => modal.classList.add("active"));
  $("#closeModal").addEventListener("click", () => modal.classList.remove("active"));
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.remove("active");
  });
}

function requireSecret() {
  return state.secretToken;
}

function requireAdmin() {
  return state.adminToken;
}

function bindSecretLogin() {
  const form = document.getElementById("secretLoginForm");
  const hint = document.getElementById("secretHint");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const { password } = Object.fromEntries(new FormData(form).entries());
    const res = await api("/api/secret/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok) {
      hint.textContent = data.error || "密码错误";
      return;
    }
    state.secretToken = data.token;
    localStorage.setItem("secretToken", data.token);
    document.getElementById("secretModal").classList.remove("active");
    hint.textContent = "欢迎回到花园";
    loadSecretArea();
  });
}

async function loadSecretArea() {
  if (!requireSecret()) return;
  const res = await api("/api/secret/diaries", {
    headers: { Authorization: `Bearer ${state.secretToken}` },
  });
  if (!res.ok) return;
  const data = await res.json();
  const list = data.items || [];
  const wrap = document.getElementById("secretDiaryList");
  const adminWrap = document.getElementById("adminDiaryList");
  wrap.innerHTML = "";
  adminWrap.innerHTML = "";
  list.forEach((item) => {
    const div = document.createElement("div");
    div.className = "diary-item";
    div.innerHTML = `
      <div class="title">${item.title}</div>
      <div class="muted">${item.created_at} · ${item.author}</div>
      <p>${item.content}</p>
      <div class="tools">
        <span class="tool" data-action="toggle" data-id="${item.id}" data-public="${item.is_public ? 1 : 0}">${
          item.is_public ? "取消公开" : "标记公开"
        }</span>
        <span class="tool danger" data-action="delete" data-id="${item.id}">删除</span>
      </div>
    `;
    wrap.appendChild(div);

    const row = document.createElement("div");
    row.className = "admin-row";
    row.innerHTML = `
      <div>${item.title}</div>
      <div class="muted">${item.author} · ${item.created_at}</div>
      <button class="btn soft" data-admin-toggle="${item.id}" data-public="${item.is_public ? 1 : 0}">${
        item.is_public ? "公开中" : "未公开"
      }</button>
    `;
    adminWrap.appendChild(row);
  });
  bindDiaryActions();
  bindAdminToggle();
  loadPrivateMessages();
}

function bindDiaryActions() {
  document.getElementById("secretDiaryList").addEventListener("click", async (e) => {
    const action = e.target.dataset.action;
    if (!action) return;
    const id = e.target.dataset.id;
    if (action === "delete") {
      await api(`/api/secret/diaries/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${state.secretToken}` },
      });
    } else if (action === "toggle") {
      const isPublic = e.target.dataset.public === "1" ? 0 : 1;
      await api(`/api/secret/diaries/${id}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${state.secretToken}` },
        body: JSON.stringify({ is_public: isPublic }),
      });
    }
    loadSecretArea();
  });
}

function bindAdminToggle() {
  document.getElementById("adminDiaryList").addEventListener("click", async (e) => {
    const id = e.target.dataset.adminToggle;
    if (!id || !requireAdmin()) return;
    const isPublic = e.target.dataset.public === "1" ? 0 : 1;
    await api(`/api/admin/diaries/${id}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${state.adminToken}` },
      body: JSON.stringify({ is_public: isPublic }),
    });
    loadSecretArea();
    loadStats();
  });
}

function bindDiaryForm() {
  const form = document.getElementById("diaryForm");
  const hint = document.getElementById("diaryHint");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!requireSecret()) {
      hint.textContent = "请先解锁花园";
      return;
    }
    const data = Object.fromEntries(new FormData(form).entries());
    data.is_public = form.is_public.checked;
    const res = await api("/api/secret/diaries", {
      method: "POST",
      headers: { Authorization: `Bearer ${state.secretToken}` },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    hint.textContent = json.message || json.error;
    if (res.ok) {
      form.reset();
      loadSecretArea();
    }
  });
}

function bindPrivateMessageForm() {
  const form = document.getElementById("privateMessageForm");
  const hint = document.getElementById("privateHint");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!requireSecret()) {
      hint.textContent = "先解锁花园再写纸条";
      return;
    }
    const data = Object.fromEntries(new FormData(form).entries());
    const res = await api("/api/secret/messages", {
      method: "POST",
      headers: { Authorization: `Bearer ${state.secretToken}` },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    hint.textContent = json.message || json.error;
    if (res.ok) {
      form.reset();
      loadPrivateMessages();
    }
  });
}

async function loadPrivateMessages() {
  if (!requireSecret()) return;
  const res = await api("/api/secret/messages", {
    headers: { Authorization: `Bearer ${state.secretToken}` },
  });
  if (!res.ok) return;
  const data = await res.json();
  const list = data.items || [];
  const wrap = document.getElementById("privateMessages");
  wrap.innerHTML = list
    .map(
      (m, idx) => `<div class="bubble ${idx % 2 === 0 ? "me" : "you"}"><small>${m.from_name} → ${m.to_name} · ${m.created_at}</small>${m.content}</div>`
    )
    .join("");
}

function bindAdminLogin() {
  const form = document.getElementById("adminLoginForm");
  const hint = document.getElementById("adminHint");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const res = await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) {
      hint.textContent = json.error || "登录失败";
      return;
    }
    state.adminToken = json.token;
    localStorage.setItem("adminToken", json.token);
    hint.textContent = "进入后台";
    loadStats();
  });
}

async function loadStats() {
  if (!requireAdmin()) return;
  const res = await api("/api/admin/summary", {
    headers: { Authorization: `Bearer ${state.adminToken}` },
  });
  if (!res.ok) return;
  const data = await res.json();
  const board = document.getElementById("statBoard");
  board.innerHTML = `
    <div class="stat-card">日记总数 <strong>${data.diary_total}</strong></div>
    <div class="stat-card">公开日记 <strong>${data.diary_public}</strong></div>
    <div class="stat-card">游客留言 <strong>${data.messages_public}</strong></div>
    <div class="stat-card">小纸条 <strong>${data.messages_private}</strong></div>
  `;
}

function handleSecretPersistence() {
  if (state.secretToken) loadSecretArea();
  if (state.adminToken) loadStats();
}

function init() {
  loadPublicDiaries();
  loadPublicMessages();
  setupPublicMessageForm();
  setupSecretModal();
  bindSecretLogin();
  bindDiaryForm();
  bindPrivateMessageForm();
  bindAdminLogin();
  handleSecretPersistence();
  document.getElementById("refreshDiaries").addEventListener("click", loadPublicDiaries);
}

init();
