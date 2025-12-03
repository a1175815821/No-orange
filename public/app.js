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
  userToken: localStorage.getItem("userToken") || "",
  adminToken: localStorage.getItem("adminToken") || "",
  currentUserName: localStorage.getItem("currentUserName") || "",
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
  const heroList = document.getElementById("publicDiaryList");
  const timeline = document.getElementById("timeline");
  if (heroList) heroList.innerHTML = "";
  if (timeline) timeline.innerHTML = "";
  try {
    const res = await api("/api/public/diaries");
    if (!res.ok) throw new Error("load_failed");
    const data = await res.json();
    const list = data.items || [];
    if (!list.length) {
      if (heroList) heroList.innerHTML = '<div class="muted">暂时没有公开的花瓣</div>';
      if (timeline) timeline.innerHTML = '<div class="muted">这里还空空的，等一等会有新日记。</div>';
      return;
    }
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
  } catch (err) {
    if (heroList) heroList.innerHTML = '<div class="muted">加载失败，请稍后再试。</div>';
    if (timeline) timeline.innerHTML = '<div class="muted">花瓣躲起来了，点右上角刷新试试。</div>';
  }
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

async function loadPublicUserMessages() {
  const res = await api("/api/public/user-messages");
  if (!res.ok) return;
  const data = await res.json();
  const list = data.items || [];
  const wrap = document.getElementById("userMessageList");
  if (!wrap) return;
  wrap.innerHTML = list
    .map(
      (m) => `
        <div class="message-item">
          <div>${m.content}</div>
          <div class="message-meta">${m.username} · ${m.created_at}</div>
        </div>`
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
  trigger.addEventListener("click", () => {
    if (requireUser()) {
      logoutUser();
    } else {
      modal.classList.add("active");
    }
  });
  $("#closeModal").addEventListener("click", () => modal.classList.remove("active"));
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.remove("active");
  });
}

function requireAdmin() {
  return state.adminToken;
}

function requireUser() {
  return state.userToken;
}

function logoutUser() {
  state.userToken = "";
  state.currentUserName = "";
  localStorage.removeItem("userToken");
  localStorage.removeItem("currentUserName");
  document.getElementById("secretModal")?.classList.remove("active");
  updateAuthButton();
  loadUserSummary();
  const diaryList = document.getElementById("secretDiaryList");
  if (diaryList) diaryList.innerHTML = "";
  const privateList = document.getElementById("privateMessages");
  if (privateList) privateList.innerHTML = "";
}

function updateAuthButton() {
  const trigger = document.getElementById("openSecret");
  if (!trigger) return;
  trigger.textContent = requireUser() ? "退出登录" : "登录 / 注册";
}

function bindAuthForms() {
  const loginForm = document.getElementById("secretLoginForm");
  const registerForm = document.getElementById("registerForm");
  const hint = document.getElementById("secretHint");
  const regHint = document.getElementById("registerHint");
  const tabs = document.querySelectorAll(".auth-tabs .tab");
  const panes = document.querySelectorAll(".auth-pane");

  tabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabs.forEach((b) => b.classList.remove("active"));
      panes.forEach((pane) => pane.classList.remove("active"));
      btn.classList.add("active");
      const mode = btn.dataset.mode;
      panes.forEach((pane) => pane.setAttribute("aria-hidden", "true"));
      const target = document.querySelector(mode === "login" ? "#secretLoginForm" : "#registerForm");
      target?.classList.add("active");
      target?.setAttribute("aria-hidden", "false");
    });
  });
  if (loginForm && hint) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const payload = Object.fromEntries(new FormData(loginForm).entries());
      const res = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        hint.textContent = data.error || "登录失败";
        return;
      }
      state.userToken = data.token;
      state.currentUserName = data.username || "";
      localStorage.setItem("userToken", data.token);
      if (state.currentUserName) localStorage.setItem("currentUserName", state.currentUserName);
      hint.textContent = `欢迎回来，${data.username}`;
      document.getElementById("secretModal")?.classList.remove("active");
      loadSecretArea();
      loadUserSummary();
      updateAuthButton();
    });
  }

  if (registerForm && regHint) {
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const payload = Object.fromEntries(new FormData(registerForm).entries());
      if (payload.password !== payload.confirm_password) {
        regHint.textContent = "两次密码不一致";
        return;
      }
      const res = await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        regHint.textContent = data.error || "注册失败";
        return;
      }
      state.userToken = data.token;
      state.currentUserName = data.username || "";
      localStorage.setItem("userToken", data.token);
      if (state.currentUserName) localStorage.setItem("currentUserName", state.currentUserName);
      regHint.textContent = `注册成功，欢迎 ${data.username}`;
      document.getElementById("secretModal")?.classList.remove("active");
      loadSecretArea();
      loadUserSummary();
      updateAuthButton();
    });
  }
}

async function loadSecretArea() {
  if (!requireUser()) return;
  const res = await api("/api/secret/diaries", {
    headers: { Authorization: `Bearer ${state.userToken}` },
  });
  if (!res.ok) {
    if (res.status === 401) logoutUser();
    return;
  }
  const data = await res.json();
  const list = data.items || [];
  if (!state.currentUserName && list[0]?.author) {
    state.currentUserName = list[0].author;
    localStorage.setItem("currentUserName", state.currentUserName);
  }
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
          ${
            item.can_edit
              ? `<span class="tool" data-action="toggle" data-id="${item.id}" data-public="${item.is_public ? 1 : 0}">${
                  item.is_public ? "取消公开" : "标记公开"
                }</span>
                <span class="tool danger" data-action="delete" data-id="${item.id}" data-can-edit="true">删除</span>`
              : '<span class="tool muted">仅作者可操作</span>'
          }
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

async function loadAdminMessages() {
  const pubWrap = document.getElementById("adminMessages");
  const priWrap = document.getElementById("adminPrivateMessages");
  if (!requireAdmin() || (!pubWrap && !priWrap)) return;
  const [pubRes, priRes] = await Promise.all([
    api("/api/admin/messages/public", { headers: { Authorization: `Bearer ${state.adminToken}` } }),
    api("/api/admin/messages/private", { headers: { Authorization: `Bearer ${state.adminToken}` } }),
  ]);
  if (pubWrap && pubRes.ok) {
    const data = await pubRes.json();
    pubWrap.innerHTML = (data.items || [])
      .map(
        (m) => `
          <div class="admin-row">
            <div>${m.content}</div>
            <div class="muted">${m.nickname} · ${m.created_at}</div>
            <div class="action-group" data-id="${m.id}" data-hidden="${m.is_hidden ? 1 : 0}">
              <button class="btn soft" data-message-action="toggle">${m.is_hidden ? "已隐藏" : "显示中"}</button>
              <button class="btn ghost" data-message-action="delete">删除</button>
            </div>
          </div>`
      )
      .join("");
  }

  if (priWrap && priRes.ok) {
    const data = await priRes.json();
    priWrap.innerHTML = (data.items || [])
      .map(
        (m) => `
          <div class="admin-row">
            <div>${m.content}</div>
            <div class="muted">${m.from_name} → ${m.to_name} · ${m.created_at}</div>
            <button class="btn ghost" data-private-id="${m.id}">删除</button>
          </div>`
      )
      .join("");
  }
}

async function loadAdminUsers() {
  const wrap = document.getElementById("adminUsers");
  if (!wrap || !requireAdmin()) return;
  const res = await api("/api/admin/users", {
    headers: { Authorization: `Bearer ${state.adminToken}` },
  });
  if (!res.ok) return;
  const data = await res.json();
  wrap.innerHTML = (data.items || [])
    .map(
      (u) => `
        <div class="admin-row">
          <div>${u.username} <span class="badge">${u.role}</span></div>
          <div class="muted">注册: ${u.created_at} @ ${u.registration_ip || "-"}</div>
          <div class="muted">最近登录: ${u.last_login_at || "-"} ${u.last_login_ip ? "@" + u.last_login_ip : ""}</div>
        </div>`
    )
    .join("");
}

function bindAdminMessageActions() {
  const pubWrap = document.getElementById("adminMessages");
  if (pubWrap) {
    pubWrap.addEventListener("click", async (e) => {
      const action = e.target.dataset.messageAction;
      const holder = e.target.closest(".action-group");
      if (!action || !holder) return;
      const id = holder.dataset.id;
      if (action === "toggle") {
        const isHidden = holder.dataset.hidden === "1" ? 0 : 1;
        await api(`/api/admin/messages/public/${id}`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${state.adminToken}` },
          body: JSON.stringify({ is_hidden: isHidden }),
        });
      } else if (action === "delete") {
        await api(`/api/admin/messages/public/${id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${state.adminToken}` },
        });
      }
      loadAdminMessages();
      loadStats();
    });
  }

  const priWrap = document.getElementById("adminPrivateMessages");
  if (priWrap) {
    priWrap.addEventListener("click", async (e) => {
      const id = e.target.dataset.privateId;
      if (!id) return;
      await api(`/api/admin/messages/private/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${state.adminToken}` },
      });
      loadAdminMessages();
      loadStats();
    });
  }
}

function bindDiaryActions() {
  const list = document.getElementById("secretDiaryList");
  if (!list) return;
  list.addEventListener("click", async (e) => {
    const action = e.target.dataset.action;
    if (!action) return;
    const id = e.target.dataset.id;
    if (action === "delete") {
      if (!e.target.dataset.canEdit) return;
      await api(`/api/secret/diaries/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${state.userToken}` },
      });
    } else if (action === "toggle") {
      const isPublic = e.target.dataset.public === "1" ? 0 : 1;
      await api(`/api/secret/diaries/${id}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${state.userToken}` },
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
    if (!requireUser()) {
      hint.textContent = "请先登录/注册";
      return;
    }
    const data = Object.fromEntries(new FormData(form).entries());
    data.is_public = form.is_public.checked;
    const res = await api("/api/secret/diaries", {
      method: "POST",
      headers: { Authorization: `Bearer ${state.userToken}` },
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
    if (!requireUser()) {
      hint.textContent = "先登录/注册再写纸条";
      return;
    }
    const data = Object.fromEntries(new FormData(form).entries());
    const res = await api("/api/secret/messages", {
      method: "POST",
      headers: { Authorization: `Bearer ${state.userToken}` },
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

function bindUserMessageForm() {
  const form = document.getElementById("userMessageForm");
  const hint = document.getElementById("userMessageHint");
  if (!form || !hint) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!requireUser()) {
      hint.textContent = "登录后才能发布正式留言";
      return;
    }
    const data = Object.fromEntries(new FormData(form).entries());
    const res = await api("/api/secret/user-messages", {
      method: "POST",
      headers: { Authorization: `Bearer ${state.userToken}` },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    hint.textContent = json.message || json.error;
    if (res.ok) {
      form.reset();
      loadPublicUserMessages();
      loadUserSummary();
    }
  });
}

async function loadPrivateMessages() {
  if (!requireUser()) return;
  const res = await api("/api/secret/messages", {
    headers: { Authorization: `Bearer ${state.userToken}` },
  });
  if (!res.ok) return;
  const data = await res.json();
  const list = data.items || [];
  const wrap = document.getElementById("privateMessages");
  const receivedWrap = document.getElementById("receivedMessages");
  const me = state.currentUserName || "";
  if (wrap) {
    wrap.innerHTML = list
      .map(
        (m, idx) => `<div class="bubble ${idx % 2 === 0 ? "me" : "you"}"><small>${m.from_name} → ${m.to_name} · ${m.created_at}</small>${m.content}</div>`
      )
      .join("");
  }
  if (receivedWrap) {
    const received = me ? list.filter((m) => m.to_name === me) : [];
    receivedWrap.innerHTML = received.length
      ? received
          .map(
            (m) =>
              `<div class="bubble you"><small>${m.from_name} → ${m.to_name} · ${m.created_at}</small>${m.content}</div>`
          )
          .join("")
      : '<div class="muted">暂时没有收到新的纸条</div>';
  }
}

async function loadUserSummary() {
  const panel = document.getElementById("userSummary");
  if (!panel) return;
  if (!requireUser()) {
    panel.textContent = "登录后展示你的用户名与加入天数。";
    updateAuthButton();
    return;
  }
  const [meRes, statRes] = await Promise.all([
    api("/api/auth/me", { headers: { Authorization: `Bearer ${state.userToken}` } }),
    api("/api/auth/summary", { headers: { Authorization: `Bearer ${state.userToken}` } }),
  ]);
  if (!meRes.ok || !statRes.ok) {
    if (meRes.status === 401 || statRes.status === 401) {
      logoutUser();
      panel.textContent = "登录状态已失效，请重新登录。";
    } else {
      panel.textContent = "加载信息失败，请稍后再试。";
    }
    return;
  }
  const me = await meRes.json();
  const stat = await statRes.json();
  state.currentUserName = me.username || state.currentUserName;
  if (state.currentUserName) localStorage.setItem("currentUserName", state.currentUserName);
  const created = me.created_at ? new Date(me.created_at) : null;
  const days = created ? Math.max(1, Math.floor((Date.now() - created.getTime()) / 86400000) + 1) : 1;
  panel.innerHTML = `
    <div class="subhead">${me.username}</div>
    <div class="muted">已在花园的第 ${days} 天</div>
    <div class="muted">注册朋友：${stat.user_count || 0} · 写过日记：${stat.poster_count || 0}</div>
    <div class="muted">正式留言：${stat.user_messages || 0}</div>
  `;
  if (PAGE === "secret") {
    loadPrivateMessages();
  }
  updateAuthButton();
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
    loadAdminMessages();
    loadAdminUsers();
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
  if (PAGE === "secret") {
    updateAuthButton();
    loadUserSummary();
    if (state.userToken) {
      loadSecretArea();
    }
  }
  if (PAGE === "admin" && state.adminToken) {
    loadStats();
    loadAdminDiaries();
    loadAdminMessages();
    loadAdminUsers();
  }
}

function init() {
  // A 页面：公开时间线与留言板
  if (PAGE === "public") {
    loadPublicDiaries();
    loadPublicMessages();
    loadPublicUserMessages();
    setupPublicMessageForm();
    const refresh = document.getElementById("refreshDiaries");
    if (refresh) refresh.addEventListener("click", loadPublicDiaries);
  }

  // B 页面：需要密码的私密写作与纸条
  if (PAGE === "secret") {
    setupSecretModal();
    bindAuthForms();
    bindDiaryForm();
    bindPrivateMessageForm();
    bindUserMessageForm();
  }

  // C 页面：后台管理
  if (PAGE === "admin") {
    bindAdminLogin();
    bindAdminMessageActions();
    if (state.adminToken) {
      loadAdminDiaries();
      loadAdminMessages();
      loadAdminUsers();
    }
  }

  // 共享：恢复持久化状态、更新时钟
  handleSecretPersistence();
}

init();
