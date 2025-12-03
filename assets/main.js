document.addEventListener("DOMContentLoaded", () => {
    // ======= 移动端导航菜单展开/收起 =======
    const header = document.querySelector("header");
    const navToggle = document.querySelector(".nav-toggle");
    const mobileLinks = document.querySelectorAll(".nav-links-mobile .nav-link");

    if (header && navToggle) {
        navToggle.addEventListener("click", () => {
            header.classList.toggle("nav-open");
        });

        mobileLinks.forEach((link) => {
            link.addEventListener("click", () => {
                header.classList.remove("nav-open");
            });
        });
    }

    // ======= 按钮 data-scroll-target 平滑滚动到区域 =======
    document.querySelectorAll("[data-scroll-target]").forEach((btn) => {
        btn.addEventListener("click", () => {
            const target = btn.getAttribute("data-scroll-target");
            const el = target ? document.querySelector(target) : null;
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
            { threshold: 0.15 }
        );

        revealEls.forEach((el) => io.observe(el));
    } else {
        revealEls.forEach((el) => el.classList.add("in-view"));
    }

    // ======= 简单表单提交提示（仅前端示例） =======
    const form = document.getElementById("contact-form");
    if (form) {
        form.addEventListener("submit", (e) => {
            e.preventDefault();
            alert("已收到你的小小留言（示例）～\n实际项目里可以在这里接后端或接口。");
            form.reset();
        });
    }

    // ======= 指针时钟 & 人生倒计时 =======
    const hourHand = document.getElementById("clock-hour");
    const minuteHand = document.getElementById("clock-minute");
    const secondHand = document.getElementById("clock-second");

    const lifeYearsEl = document.getElementById("life-years");
    const lifeDaysEl = document.getElementById("life-days");
    const lifeMealsEl = document.getElementById("life-meals");
    const lifeSleepEl = document.getElementById("life-sleep");
    const lifeTimeEl = document.getElementById("life-time");
    const lifeProgressEl = document.getElementById("life-progress");

    const MS_IN_SECOND = 1000;
    const MS_IN_MINUTE = 60 * MS_IN_SECOND;
    const MS_IN_HOUR = 60 * MS_IN_MINUTE;
    const MS_IN_DAY = 24 * MS_IN_HOUR;
    const MS_IN_YEAR = 365.25 * MS_IN_DAY;

    const CURRENT_LEVEL_AGE = 19;
    const LIFE_EXPECTANCY = 80;
    const MEALS_PER_DAY = 3;
    const SLEEP_PER_DAY = 8;

    const formatNumber = (value) => value.toLocaleString("zh-CN");
    const pad = (value) => value.toString().padStart(2, "0");

    const getLifeWindow = () => {
        const now = new Date();
        const birth = new Date(now);
        birth.setFullYear(now.getFullYear() - CURRENT_LEVEL_AGE);
        const end = new Date(birth);
        end.setFullYear(birth.getFullYear() + LIFE_EXPECTANCY);
        return { now, birth, end };
    };

    const updateAnalogClock = () => {
        if (!hourHand || !minuteHand || !secondHand) return;
        const now = new Date();
        const seconds = now.getSeconds();
        const minutes = now.getMinutes();
        const hours = now.getHours();

        const secondDeg = seconds * 6; // 360 / 60
        const minuteDeg = minutes * 6 + secondDeg / 60;
        const hourDeg = (hours % 12) * 30 + minuteDeg / 12; // 360 / 12

        hourHand.style.transform = `translate(-50%, 0) rotate(${hourDeg}deg)`;
        minuteHand.style.transform = `translate(-50%, 0) rotate(${minuteDeg}deg)`;
        secondHand.style.transform = `translate(-50%, 0) rotate(${secondDeg}deg)`;
    };

    const updateLifeWidget = () => {
        if (!lifeYearsEl || !lifeDaysEl || !lifeMealsEl || !lifeSleepEl || !lifeTimeEl || !lifeProgressEl) return;

        const { now, birth, end } = getLifeWindow();
        const totalSpan = end.getTime() - birth.getTime();
        const remaining = Math.max(end.getTime() - now.getTime(), 0);

        const remainingYears = Math.floor(remaining / MS_IN_YEAR);
        const remainingDays = Math.floor(remaining / MS_IN_DAY);
        const remainingHours = Math.floor((remaining % MS_IN_DAY) / MS_IN_HOUR);
        const remainingMinutes = Math.floor((remaining % MS_IN_HOUR) / MS_IN_MINUTE);
        const remainingSeconds = Math.floor((remaining % MS_IN_MINUTE) / MS_IN_SECOND);

        const mealsLeft = Math.max(Math.floor((remaining / MS_IN_DAY) * MEALS_PER_DAY), 0);
        const sleepHoursLeft = Math.max(Math.floor((remaining / MS_IN_DAY) * SLEEP_PER_DAY), 0);

        const lifeProgress = Math.min(((totalSpan - remaining) / totalSpan) * 100, 100);

        lifeYearsEl.textContent = formatNumber(remainingYears);
        lifeDaysEl.textContent = formatNumber(remainingDays);
        lifeMealsEl.textContent = formatNumber(mealsLeft);
        lifeSleepEl.textContent = formatNumber(sleepHoursLeft);
        lifeTimeEl.textContent = `${remainingDays} 天 ${pad(remainingHours)}:${pad(remainingMinutes)}:${pad(remainingSeconds)}`;
        lifeProgressEl.style.width = `${lifeProgress}%`;
    };

    if (hourHand && minuteHand && secondHand) {
        updateAnalogClock();
        setInterval(updateAnalogClock, 1000);
    }

    if (lifeYearsEl && lifeDaysEl && lifeMealsEl && lifeSleepEl && lifeTimeEl && lifeProgressEl) {
        updateLifeWidget();
        setInterval(updateLifeWidget, 1000);
    }
});
