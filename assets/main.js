 // ======= 移动端导航菜单展开/收起 =======
    const header = document.querySelector("header");
    const navToggle = document.querySelector(".nav-toggle");
    const mobileLinks = document.querySelectorAll(".nav-links-mobile .nav-link");

    navToggle.addEventListener("click", () => {
    header.classList.toggle("nav-open");
});

    // 点击移动端导航链接后自动收起菜单
    mobileLinks.forEach(link => {
    link.addEventListener("click", () => {
        header.classList.remove("nav-open");
    });
});

    // ======= 按钮 data-scroll-target 平滑滚动到区域 =======
    document.querySelectorAll("[data-scroll-target]").forEach(btn => {
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
    const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
    if (entry.isIntersecting) {
    entry.target.classList.add("in-view");
    io.unobserve(entry.target);
}
});
}, {
    threshold: 0.15
});

    revealEls.forEach(el => io.observe(el));
} else {
    // 不支持 IntersectionObserver 的情况，直接全部显示
    revealEls.forEach(el => el.classList.add("in-view"));
}

    // ======= 简单表单提交提示（仅前端示例） =======
    const form = document.getElementById("contact-form");
    form.addEventListener("submit", (e) => {
    e.preventDefault();
    alert("已收到你的小小留言（示例）～\n实际项目里可以在这里接后端或接口。");
    form.reset();
});