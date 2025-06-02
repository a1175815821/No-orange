//版本更新
const siteVersion = '20250602c'; // 你更新网页时改这个值

window.onload = () => {
    const savedVersion = localStorage.getItem('siteVersion');
    if (savedVersion !== siteVersion) {
        localStorage.setItem('siteVersion', siteVersion);
        showToast();
    }
};

function showToast() {
    const toast = document.createElement('div');
    toast.id = 'toast';
    toast.textContent = '由于 CDN 缓存原因，查看最新效果可能需要 Ctrl + F5 强制刷新浏览器缓存';
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('show');
    }, 100);

    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => {
            toast.remove();
        }, { once: true });
    }, 3100);
}

//警告
window.onload = () => {
    const toast = document.createElement('div');
    toast.id = 'toast';
    toast.textContent = '由于 CDN 缓存原因，查看最新效果可能需要 Ctrl + F5 强制刷新浏览器缓存';
    document.body.appendChild(toast);

    // 触发滑入动画
    setTimeout(() => {
        toast.classList.add('show');
    }, 100);

    // 滑出并删除节点
    setTimeout(() => {
        toast.classList.remove('show');
        // 动画结束后移除元素
        toast.addEventListener('transitionend', () => {
            toast.remove();
        }, { once: true });
    }, 2100);
};

//拖尾
const cursor = document.querySelector('.cursor-follow');
const particles = [];

document.addEventListener('mousemove', e => {
    cursor.style.left = `${e.clientX}px`;
    cursor.style.top = `${e.clientY}px`;
    createParticle(e.clientX, e.clientY);
});

document.addEventListener('touchmove', e => {
    const touch = e.touches[0];
    cursor.style.left = `${touch.clientX}px`;
    cursor.style.top = `${touch.clientY}px`;
    createParticle(touch.clientX, touch.clientY);
});

function createParticle(x, y) {
    const particle = document.createElement('div');
    particle.classList.add('particle');
    particle.style.left = `${x}px`;
    particle.style.top = `${y}px`;
    document.body.appendChild(particle);

    particles.push(particle);

    setTimeout(() => {
        particle.remove();
        particles.shift();
    }, 400);
}

//打字机效果
const text = "🟠 请你别开黄灯！";
const el = document.querySelector('.animate-text');
el.textContent = '';

let index = 0;
function type() {
    if (index < text.length) {
        el.textContent += text[index++];
        setTimeout(type, 100);
    }
}
//Scroll Fade-in
type();
document.addEventListener("DOMContentLoaded", () => {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add("visible");
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.1
    });

    document.querySelectorAll('.fade-section').forEach(el => {
        observer.observe(el);
    });
});