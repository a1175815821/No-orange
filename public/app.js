// ---- 基础工具：简化选择与 API 调用 ----
const $ = (selector) => document.querySelector(selector);
const api = (path, options = {}) =>
  fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });

// 读取当前页面标识（public / secret / admin），便于拆分初始化逻辑
const PAGE = document.currentScript?.dataset.page || "public";

// 持久化 token，便于在各自页面中自动恢复登录态
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
  const timeline = document.getElementById("timeline");
  if (heroList) heroList.innerHTML = "";
  if (timeline) timeline.innerHTML = "";
  list.forEach((item) => {
    if (heroList) {
      const pill = document.createElement("div");
      pill.className = "card-pill";
      pill.innerHTML = `<div class="badge">${item.author}</div><div>${item.title}</div><small class="muted">${item.created_at}</small>`;
      heroList.appendChild(pill);
    }

    // 时间线样式：一条条按创建时间垂直排列
    if (timeline) {
      const row = document.createElement("div");
      row.className = "timeline__item";
      row.innerHTML = `
        <div class="dot"></div>
        <div class="line"></div>
        <div class="timeline__card">
          <div class="timeline__meta">${item.created_at} · ${item.author}</div>
          <div class="timeline__title">${item.title}</div>
          <p class="muted">${item.excerpt || "..."}</p>
        </div>
      `;
      timeline.appendChild(row);
    }
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
  if (!form) return; // 仅 A 页面需要
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
  const trigger = $("#openSecret");
  const modal = document.getElementById("secretModal");
  if (!trigger || !modal) return;
  trigger.addEventListener("click", () => modal.classList.add("active"));
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
  if (!form || !hint) return;
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
  if (wrap) wrap.innerHTML = "";
  if (adminWrap) adminWrap.innerHTML = "";
  list.forEach((item) => {
    if (wrap) {
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
    }

    if (adminWrap) {
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
    }
  });
  bindDiaryActions();
  bindAdminToggle();
  loadPrivateMessages();
}

async function loadAdminDiaries() {
  if (!requireAdmin()) return;
  const res = await api("/api/admin/diaries", {
    headers: { Authorization: `Bearer ${state.adminToken}` },
  });
  if (!res.ok) return;
  const data = await res.json();
  const list = data.items || [];
  const adminWrap = document.getElementById("adminDiaryList");
  if (!adminWrap) return;
  adminWrap.innerHTML = "";
  list.forEach((item) => {
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
  bindAdminToggle();
}

function bindDiaryActions() {
  const list = document.getElementById("secretDiaryList");
  if (!list) return;
  list.addEventListener("click", async (e) => {
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
  const board = document.getElementById("adminDiaryList");
  if (!board) return;
  board.addEventListener("click", async (e) => {
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
  if (!form || !hint) return;
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
  if (!form || !hint) return;
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
  if (wrap) {
    wrap.innerHTML = list
      .map(
        (m, idx) => `<div class="bubble ${idx % 2 === 0 ? "me" : "you"}"><small>${m.from_name} → ${m.to_name} · ${m.created_at}</small>${m.content}</div>`
      )
      .join("");
  }
}

function bindAdminLogin() {
  const form = document.getElementById("adminLoginForm");
  const hint = document.getElementById("adminHint");
  if (!form || !hint) return;
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
    loadAdminDiaries();
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
  // 只在对应页面恢复，避免不必要的 API 调用
  if (PAGE === "secret" && state.secretToken) loadSecretArea();
  if (PAGE === "admin" && state.adminToken) {
    loadStats();
    loadAdminDiaries();
  }
}

function init() {
  // A 页面：公开时间线与留言板
  if (PAGE === "public") {
    loadPublicDiaries();
    loadPublicMessages();
    setupPublicMessageForm();
    const refresh = document.getElementById("refreshDiaries");
    if (refresh) refresh.addEventListener("click", loadPublicDiaries);
  }

  // B 页面：需要密码的私密写作与纸条
  if (PAGE === "secret") {
    setupSecretModal();
    bindSecretLogin();
    bindDiaryForm();
    bindPrivateMessageForm();
  }

  // C 页面：后台管理
  if (PAGE === "admin") {
    bindAdminLogin();
    if (state.adminToken) {
      loadAdminDiaries();
    }
  }

  // 共享：恢复持久化状态、更新时钟
  handleSecretPersistence();
}

init();
