<?php
// ====================================================================
// SECTION 1: 配置与初始化 (请确保这里的参数是正确的)
// ====================================================================

// 数据库连接信息
$servername = "localhost";
$username = "****";
$password = "****";
$dbname = "****";

// 分页配置
$results_per_page = 20;
$current_page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
$offset = ($current_page - 1) * $results_per_page;
$search_term = isset($_GET['q']) ? trim($_GET['q']) : "";
$error = "";
$results = [];
$total_pages = 0;
$total_results = 0;

// ====================================================================
// SECTION 2: 后端逻辑 (修正后的干净逻辑)
// ====================================================================

try {
    // 1. 尝试连接数据库 (如果连接失败，下面的查询就不用跑了)
    $conn = new PDO("mysql:host=$servername;dbname=$dbname;charset=utf8mb4", $username, $password);
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // 2. 只有在用户输入了搜索词时，才执行耗时的查询逻辑
    if (!empty($search_term)) {

        // === [优化点 1: 最小搜索长度检查] ===
        if (mb_strlen($search_term, 'utf8') < 2) {
            $error = "搜索词太短了呢，为了避免服务器超时，请至少输入 2 个字符以上再搜索吧 (｡•́︿•̀｡)";
            // $results 保持为空，不会有查询结果
        } else {
            // === [优化点 2: PHP 临时延长执行时间 (应急)] ===
            // 给数据库多一些时间来处理复杂查询
            set_time_limit(60);

            // --- 3. 查询总结果数 (使用 UNION ALL 优化性能) ---
            $count_sql = "SELECT COUNT(*) FROM (
                (SELECT guid FROM avatar WHERE name LIKE :term OR author LIKE :term)
                UNION ALL
                (SELECT guid FROM avatarnworld WHERE name LIKE :term OR authorname LIKE :term)
            ) AS combined_count";

            $stmt_count = $conn->prepare($count_sql);
            $stmt_count->bindValue(':term', "%$search_term%");
            $stmt_count->execute();
            $total_results = $stmt_count->fetchColumn();
            $total_pages = ceil($total_results / $results_per_page);

            // --- 4. 构造分页主查询 ---
            $main_sql = "SELECT * FROM (
                (SELECT name, description, author, guid, 'Avatar库1' as source FROM avatar WHERE name LIKE :term OR author LIKE :term)
                UNION ALL
                (SELECT name, authorname as description, authorname as author, guid as guid, 'Avatar库2' as source FROM avatarnworld WHERE name LIKE :term OR authorname LIKE :term)
            ) AS combined_results
            LIMIT :limit OFFSET :offset";

            $stmt = $conn->prepare($main_sql);
            $stmt->bindValue(':term', "%$search_term%");
            $stmt->bindValue(':limit', $results_per_page, PDO::PARAM_INT);
            $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
            $stmt->execute();
            $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
        } // 结束 else (最小长度检查)
    } // 结束 if (!empty($search_term))

} catch(PDOException $e) {
    // 捕获数据库连接或查询错误
    $error = "数据库连接或查询失败: " . $e->getMessage();
}

// ====================================================================
// SECTION 3: 局部渲染逻辑 (关键修改点)
// ====================================================================

// 如果是 AJAX 请求，只输出结果部分的 HTML
if (isset($_GET['ajax'])) {
    renderResults($results, $search_term, $total_pages, $current_page, $total_results);
    exit; // 结束脚本，不输出原本的 header/footer
}

// 封装一个函数用来输出结果列表，方便复用
function renderResults($results, $search_term, $total_pages, $current_page, $total_results) {
    ?>
    <div class="results-container-inner"> <div class="results">
            <?php if(count($results) > 0): ?>
                <?php foreach($results as $row): ?>
                    <div class="card">
                        <span class="tag"><?php echo htmlspecialchars($row['source']); ?></span>
                        <h3><?php echo htmlspecialchars($row['name']); ?></h3>
                        <div class="info-row">🆔 GUID: <?php echo htmlspecialchars($row['guid']); ?></div>
                        <div class="info-row">👤 作者: <?php echo htmlspecialchars($row['author']); ?></div>
                        <div class="info-row">📝 描述: <?php echo htmlspecialchars($row['description']); ?></div>
                    </div>
                <?php endforeach; ?>
            <?php elseif(!empty($search_term)): ?>
                <div class="empty-state">
                    (｡•́︿•̀｡) 抱歉，没有找到与 "<?php echo htmlspecialchars($search_term); ?>" 相关的任何结果呢...
                </div>
            <?php endif; ?>
        </div>

        <?php if($total_pages > 1 && !empty($search_term)): ?>
            <div class="pagination" style="text-align: center; margin-top: 30px;">
                <p style="color: rgba(255,255,255,0.8); margin-bottom: 15px;">
                    总共找到 <strong><?php echo $total_results; ?></strong> 条结果，当前在第 <strong><?php echo $current_page; ?> / <?php echo $total_pages; ?></strong> 页
                </p>

                <?php 
                    $q_safe = urlencode($search_term); 
                    if ($current_page > 1):
                ?>
                    <a href="?q=<?php echo $q_safe; ?>&page=<?php echo $current_page - 1; ?>" class="page-link">&laquo; 上一页</a>
                <?php endif; ?>

                <?php 
                    $start_page = max(1, $current_page - 2);
                    $end_page = min($total_pages, $current_page + 2);
                    
                    for($i = $start_page; $i <= $end_page; $i++): 
                ?>
                    <a href="?q=<?php echo $q_safe; ?>&page=<?php echo $i; ?>" 
                       class="page-link"
                       style="
                           background: <?php echo ($i == $current_page) ? '#5c8a82' : '#fff'; ?>;
                           color: <?php echo ($i == $current_page) ? 'white' : '#666'; ?>;
                       "
                    ><?php echo $i; ?></a>
                <?php endfor; ?>
                
                <?php if ($current_page < $total_pages): ?>
                    <a href="?q=<?php echo $q_safe; ?>&page=<?php echo $current_page + 1; ?>" class="page-link">下一页 &raquo;</a>
                <?php endif; ?>
            </div>
        <?php endif; ?>
    </div>
    <?php
}
?>

<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Yingxue的VRChat资源检索库</title>
    <style>
        /* ================= 基础样式 (保留你原有的) ================= */
        :root {
            --primary: #a1c4fd; 
            --secondary: #fbc2eb; 
            --glass: rgba(255, 255, 255, 0.7);
            --text: #4a4a4a;
        }

        body {
            margin: 0; padding: 0;
            font-family: "Microsoft YaHei", sans-serif;
            background-image: linear-gradient(120deg, var(--primary) 0%, var(--secondary) 100%); 
            min-height: 100vh;
            color: var(--text);
            display: flex; flex-direction: column; align-items: center;
            overflow-y: scroll; /* 防止滚动条出现导致页面跳动 */
        }

        .container { width: 90%; max-width: 900px; margin-top: 50px; margin-bottom: 50px; }
        .header { text-align: center; margin-bottom: 40px; animation: float 3s ease-in-out infinite; }
        .header h1 { color: #fff; text-shadow: 0 2px 4px rgba(0,0,0,0.15); font-size: 2.8rem; margin-bottom: 5px; }
        .header p { color: #fff; opacity: 0.9; }

        .search-box {
            background: var(--glass); backdrop-filter: blur(8px); padding: 25px;
            border-radius: 25px; box-shadow: 0 10px 35px 0 rgba(31, 38, 135, 0.18);
            display: flex; gap: 15px;
        }
        input[type="text"] { flex: 1; padding: 18px; border: none; border-radius: 15px; font-size: 17px; background: rgba(255,255,255,0.95); outline: none; transition: 0.3s; }
        button { padding: 0 35px; border: none; border-radius: 15px; background: linear-gradient(to right, #6a85b6 0%, #bac8e0 100%); color: white; font-weight: bold; font-size: 17px; cursor: pointer; transition: 0.3s; }
        button:hover { transform: translateY(-2px); box-shadow: 0 5px 15px rgba(0,0,0,0.15); }

        .card { background: rgba(255, 255, 255, 0.85); border-radius: 20px; padding: 25px; box-shadow: 0 6px 15px rgba(0,0,0,0.08); border-left: 6px solid var(--secondary); margin-bottom: 20px;} /* 增加 margin-bottom */
        .card h3 { margin: 0 0 10px 0; color: #555; border-bottom: 1px dashed #eee; padding-bottom: 5px; }
        .tag { display: inline-block; padding: 5px 12px; background: #e9f5ff; color: #4a90e2; border-radius: 20px; font-size: 13px; font-weight: 600; margin-bottom: 12px; }
        .info-row { font-size: 15px; color: #666; margin: 6px 0; word-break: break-all; }
        .empty-state { text-align: center; color: rgba(255,255,255,0.9); margin-top: 50px; font-size: 1.2rem; }
        .pagination a { display: inline-block; padding: 8px 15px; margin: 0 4px; border-radius: 10px; text-decoration: none; font-weight: bold; border: 1px solid #ccc; transition: all 0.2s;}

        @media (max-width: 600px) { .search-box { flex-direction: column; } button { padding: 15px; } }
        @keyframes float { 0% { transform: translateY(0px); } 50% { transform: translateY(-5px); } 100% { transform: translateY(0px); } }

        /* ================= SECTION 4: 新增动画样式 ================= */
        
        /* 结果容器 */
        #dynamic-content {
            min-height: 200px; /* 避免加载时高度坍塌 */
            position: relative;
            margin-top: 30px;
        }

        /* 动画过渡类 */
        .fade-enter { opacity: 0; transform: translateY(20px); }
        .fade-enter-active { opacity: 1; transform: translateY(0); transition: opacity 0.4s ease-out, transform 0.4s ease-out; }
        .fade-exit { opacity: 1; transform: translateY(0); }
        .fade-exit-active { opacity: 0; transform: translateY(-20px); transition: opacity 0.3s ease-in, transform 0.3s ease-in; }

        /* 加载动画 (可爱的小圆点跳动) */
        .loading-overlay {
            position: absolute; top: 0; left: 0; width: 100%; height: 200px;
            display: flex; justify-content: center; align-items: center;
            opacity: 0; pointer-events: none; transition: opacity 0.3s;
            z-index: 10;
        }
        .loading-overlay.show { opacity: 1; }
        
        .loading-dots div {
            width: 12px; height: 12px; background: #fff; border-radius: 50%;
            margin: 0 5px; animation: bounce 0.6s infinite alternate;
        }
        .loading-dots div:nth-child(2) { animation-delay: 0.2s; }
        .loading-dots div:nth-child(3) { animation-delay: 0.4s; }

        @keyframes bounce { to { transform: translateY(-15px); opacity: 0.5; } }
    </style>
</head>
<body>

    <div class="container">
        <div class="header">
            <h1>✨ Asset Search</h1>
            <p>VRChat 资源检索系统</p>
        </div>

        <form class="search-box" id="search-form" method="GET">
            <input type="text" name="q" id="search-input" placeholder="输入模型名称、作者或ID..." value="<?php echo htmlspecialchars($search_term); ?>">
            <button type="submit">搜 索</button>
        </form>

        <?php if(!empty($error)): ?>
            <div style="color: white; background: #e57373; padding: 15px; border-radius: 10px; margin-top: 20px; text-align: center; font-weight: bold;">
                连接错误，请检查配置：<?php echo $error; ?>
            </div>
        <?php endif; ?>

        <div id="dynamic-content">
            <div class="loading-overlay" id="loading">
                <div class="loading-dots"><div></div><div></div><div></div></div>
            </div>
            
            <div id="results-wrapper">
                <?php 
                    // 初始加载时直接渲染
                    renderResults($results, $search_term, $total_pages, $current_page, $total_results); 
                ?>
            </div>
        </div>
    </div>

    <script>
        // ================= SECTION 5: 丝滑切换逻辑 (JavaScript) =================

        document.addEventListener('DOMContentLoaded', function() {
            const form = document.getElementById('search-form');
            const wrapper = document.getElementById('results-wrapper');
            const loading = document.getElementById('loading');
            
            // 核心：加载数据的函数
            async function loadData(url) {
                // 1. 开始动画：旧内容淡出
                wrapper.classList.remove('fade-enter-active');
                wrapper.classList.add('fade-exit-active');
                loading.classList.add('show'); // 显示加载动画

                try {
                    // 2. 偷偷发起请求 (加上 &ajax=1 参数)
                    const fetchUrl = url.includes('?') ? url + '&ajax=1' : url + '?ajax=1';
                    const response = await fetch(fetchUrl);
                    const html = await response.text();

                    // 等待旧内容淡出动画完成 (300ms)
                    setTimeout(() => {
                        // 3. 替换内容
                        wrapper.innerHTML = html;
                        
                        // 4. 新内容进场
                        wrapper.classList.remove('fade-exit-active');
                        wrapper.classList.add('fade-enter');
                        loading.classList.remove('show');

                        // 强制浏览器重绘以触发进场动画
                        void wrapper.offsetWidth; 
                        
                        wrapper.classList.add('fade-enter-active');
                        
                        // 重新绑定翻页链接的点击事件 (因为内容被替换了)
                        bindPaginationLinks();
                    }, 300);

                } catch (error) {
                    console.error('加载失败:', error);
                    loading.classList.remove('show');
                    wrapper.classList.remove('fade-exit-active');
                }
            }

            // 拦截搜索表单提交
            form.addEventListener('submit', function(e) {
                e.preventDefault(); // 阻止浏览器刷新
                const query = document.getElementById('search-input').value;
                const newUrl = '?q=' + encodeURIComponent(query);
                
                // 修改浏览器地址栏，但不刷新
                window.history.pushState(null, '', newUrl);
                loadData(newUrl);
            });

            // 拦截翻页点击
            function bindPaginationLinks() {
                const links = document.querySelectorAll('.page-link');
                links.forEach(link => {
                    link.addEventListener('click', function(e) {
                        e.preventDefault(); // 阻止浏览器刷新
                        const url = this.getAttribute('href');
                        
                        window.history.pushState(null, '', url);
                        loadData(url);
                        
                        // 平滑滚动回顶部
                        document.querySelector('.search-box').scrollIntoView({ 
                            behavior: 'smooth', block: 'center' 
                        });
                    });
                });
            }

            // 处理浏览器的“后退”按钮
            window.addEventListener('popstate', function() {
                loadData(window.location.href);
            });

            // 初始化绑定
            bindPaginationLinks();
            wrapper.classList.add('fade-enter-active'); // 首次加载也给个动画
        });
    </script>
</body>
</html>