// 拖尾
const cursor = document.querySelector('.cursor-follow');
const particles = [];

document.addEventListener('mousemove', e => {
    // 移动小圆圈
    cursor.style.left = `${e.clientX}px`;
    cursor.style.top = `${e.clientY}px`;

    // 生成粒子
    createParticle(e.clientX, e.clientY);
});

function createParticle(x, y) {
    const particle = document.createElement('div');
    particle.classList.add('particle');
    document.body.appendChild(particle);
    particle.style.left = `${x}px`;
    particle.style.top = `${y}px`;

    particles.push(particle);

    // 粒子动画后消失
    setTimeout(() => {
        particle.remove();
        particles.shift();
    }, 400); // 缩短消失时间
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