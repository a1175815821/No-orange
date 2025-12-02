// 开屏动画控制
function initLoadingScreen() {
    // 创建开屏动画HTML
    const loadingHTML = `
        <div id="loading-screen">
            <div class="loading-content">
                <div class="loading-icon">🟠</div>
                <div class="loading-text">Please Don't Ask Me</div>
                <div class="loading-subtitle">Now loading<span class="dots"></span></div>
            </div>
        </div>
    `;

    // 插入到页面开头
    document.body.insertAdjacentHTML('afterbegin', loadingHTML);

    // 隐藏主内容
    const container = document.getElementById('container');
    container.style.opacity = '0';
    container.style.transform = 'translateY(20px)';

    // 启动动态省略号动画
    startDotsAnimation();

    // 2.5秒后隐藏加载屏幕
    setTimeout(() => {
        const loadingScreen = document.getElementById('loading-screen');
        loadingScreen.classList.add('hidden');

        // 显示主内容
        setTimeout(() => {
            container.style.transition = 'opacity 1s ease, transform 1s ease';
            container.style.opacity = '1';
            container.style.transform = 'translateY(0)';
        }, 300);

    }, 2500);
}

// 动态省略号动画
function startDotsAnimation() {
    const dotsElement = document.querySelector('.dots');
    if (!dotsElement) return;

    let dotCount = 0;
    const maxDots = 3;
    
    const dotsInterval = setInterval(() => {
        dotCount = (dotCount + 1) % (maxDots + 1);
        dotsElement.textContent = '.'.repeat(dotCount);
        
        // 当加载屏幕隐藏时停止动画
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen && loadingScreen.classList.contains('hidden')) {
            clearInterval(dotsInterval);
        }
    }, 200); // 每500毫秒更新一次
}

// 页面加载时启动
document.addEventListener('DOMContentLoaded', initLoadingScreen);