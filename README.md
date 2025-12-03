# No-orange

> Just to tell myself.

Made with quiet emotion.  
🌐 **No-orange**：<http://no-orange.chat/>

---

## 🧡 项目简介

**还没想好** 是一个带有私密性与情绪表达性质的个人主页网页项目。

项目整体设计、前端结构、动画效果以及页面交互均由本人 **完全自主开发**。

在别开黄灯内容上，部分 **UI 层面的视觉理念** 参考了原项目  
[NoOrange by Ninka-Rex](https://github.com/Ninka-Rex/NoOrange)（源仓库已删除），  
但 *并未使用其任何源代码*，实际实现方式与结构均为重新构建。

该项目基于 **MIT License** 开源，希望能成为你偶尔想静下来时的一个落脚点。

---

## 📧 联系表单邮件转发

项目附带了一个基于 Flask 的简易后端 `server.py`，用于把“联系我”表单中的留言转发到邮箱。

1. 安装依赖：`pip install -r requirements.txt`
2. 准备 SMTP 环境变量：
   - `SMTP_HOST`：SMTP 服务器域名
   - `SMTP_PORT`：端口（默认 587）
   - `SMTP_USER`：SMTP 登录用户名，亦作发件人
   - `SMTP_PASSWORD`：SMTP 密码或应用专用密码
   - `CONTACT_TO`：收件人邮箱（不填则默认与 `SMTP_USER` 相同）
3. 启动后端：`flask --app server run --host=0.0.0.0 --port=5000`
4. 将静态页与后端一起部署后，前端表单会调用 `/api/contact` 接口并提示发送结果。

若部署到其他路径或端口，可以在 `assets/main.js` 中调整接口地址。
