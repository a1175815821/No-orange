// ======= 移动端导航菜单展开/收起 =======
const header = document.querySelector("header");
const navToggle = document.querySelector(".nav-toggle");
const mobileLinks = document.querySelectorAll(".nav-links-mobile .nav-link");

navToggle.addEventListener("click", () => {
    header.classList.toggle("nav-open");
});

// 点击移动端导航链接后自动收起菜单
mobileLinks.forEach((link) => {
    link.addEventListener("click", () => {
        header.classList.remove("nav-open");
    });
});

// ======= 按钮 data-scroll-target 平滑滚动到区域 =======
document.querySelectorAll("[data-scroll-target]").forEach((btn) => {
    btn.addEventListener("click", () => {
        const target = btn.getAttribute("data-scroll-target");
        const el = document.querySelector(target);
        if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    });
});

// ======= IntersectionObserver：元素进入视口时添加 in-view 类触发动画 =======
const revealEls = document.querySelectorAll(".reveal-on-scroll");
if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("in-view");
                    io.unobserve(entry.target);
                }
            });
        },
        {
            threshold: 0.15,
        }
    );

    revealEls.forEach((el) => io.observe(el));
} else {
    // 不支持 IntersectionObserver 的情况，直接全部显示
    revealEls.forEach((el) => el.classList.add("in-view"));
}

// ======= 联系表单：调用后端接口发送邮件 =======
const form = document.getElementById("contact-form");
const statusEl = document.getElementById("contact-status");

function updateStatus(message, type = "") {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = `contact-status ${type}`.trim();
}

if (form) {
    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const formData = new FormData(form);
        const payload = {
            name: formData.get("name")?.toString().trim(),
            email: formData.get("email")?.toString().trim(),
            message: formData.get("message")?.toString().trim(),
        };

        updateStatus("正在发送留言到邮箱...", "");

        try {
            const response = await fetch("/api/contact", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const result = await response.json();
            if (response.ok) {
                updateStatus(result.message || "留言已成功发送！", "success");
                form.reset();
            } else {
                updateStatus(result.message || "发送失败，请稍后再试。", "error");
            }
        } catch (error) {
            updateStatus("网络异常，暂时无法发送邮件，请稍后再试。", "error");
        }
    });
}
