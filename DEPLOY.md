# 部署指南

## 方式一：本地服务器部署（适合内网使用）

### 1. 准备工作
- 确保服务器已安装 Node.js（建议 v16+）
- 确保服务器防火墙开放了端口（默认 4000）

### 2. 上传文件
将整个项目文件夹上传到服务器

### 3. 安装依赖
```bash
cd /path/to/xchat
npm install
```

### 4. 启动服务
```bash
npm run server
```

### 5. 访问
- 服务器本地访问：`http://localhost:4000`
- 局域网访问：`http://服务器IP:4000`
- 外网访问：`http://公网IP:4000`（需要公网IP和端口映射）

### 6. 配置前端WebSocket地址
用户访问时，需要在"会话管理"面板的"中继服务器"输入框中填写：
- 局域网：`ws://服务器IP:4000`
- 公网：`ws://公网IP:4000` 或 `ws://域名:4000`

---

## 方式二：使用云服务器（推荐）

### 1. 购买云服务器
推荐平台：
- 阿里云 ECS
- 腾讯云 CVM
- 华为云 ECS
- 国外：Vultr、DigitalOcean、AWS

### 2. 配置服务器
```bash
# 更新系统
sudo apt update && sudo apt upgrade -y  # Ubuntu/Debian
# 或
sudo yum update -y  # CentOS

# 安装 Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs  # Ubuntu/Debian

# 验证安装
node --version
npm --version
```

### 3. 上传项目文件
使用以下方式之一：
- **SCP**：`scp -r D:\xchat user@服务器IP:/home/user/`
- **FTP工具**：FileZilla、WinSCP
- **Git**：将代码推送到Git仓库，然后在服务器上克隆

### 4. 安装依赖并启动
```bash
cd /home/user/xchat
npm install
npm run server
```

### 5. 配置防火墙
```bash
# Ubuntu/Debian (ufw)
sudo ufw allow 4000/tcp
sudo ufw enable

# CentOS (firewalld)
sudo firewall-cmd --permanent --add-port=4000/tcp
sudo firewall-cmd --reload
```

### 6. 配置域名（可选）
1. 购买域名（如：example.com）
2. 添加A记录指向服务器IP
3. 配置Nginx反向代理（见下方）

---

## 方式三：使用Nginx反向代理（推荐生产环境）

### 1. 安装Nginx
```bash
sudo apt install nginx -y  # Ubuntu/Debian
```

### 2. 配置Nginx
创建配置文件：`/etc/nginx/sites-available/xchat`
```nginx
server {
    listen 80;
    server_name your-domain.com;  # 替换为你的域名

    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 3. 启用配置
```bash
sudo ln -s /etc/nginx/sites-available/xchat /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 4. 配置SSL（HTTPS，推荐）
使用 Let's Encrypt 免费SSL证书：
```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d your-domain.com
```

### 5. 修改前端WebSocket地址
用户访问时，填写：`wss://your-domain.com`（注意是 wss，不是 ws）

---

## 方式四：使用PM2进程管理（推荐）

### 1. 安装PM2
```bash
npm install -g pm2
```

### 2. 启动服务
```bash
cd /path/to/xchat
pm2 start server.js --name xchat
```

### 3. 设置开机自启
```bash
pm2 startup
pm2 save
```

### 4. 常用命令
```bash
pm2 list          # 查看运行状态
pm2 logs xchat    # 查看日志
pm2 restart xchat # 重启服务
pm2 stop xchat    # 停止服务
pm2 delete xchat  # 删除服务
```

---

## 环境变量配置

可以通过环境变量自定义配置：

```bash
# 设置端口（默认4000）
export PORT=4000

# 设置监听地址（默认0.0.0.0，允许外部访问）
export HOST=0.0.0.0

# 启动服务
npm run server
```

或在 `.env` 文件中配置（需要安装 dotenv 包）

---

## 安全建议

1. **修改默认端口**：避免使用常见端口
   ```bash
   export PORT=8080
   ```

2. **使用HTTPS/WSS**：通过Nginx配置SSL证书

3. **限制访问**：使用防火墙规则限制特定IP访问

4. **定期备份**：备份 `data.json` 文件（用户数据）

5. **监控日志**：定期检查服务器日志

---

## 常见问题

### Q: 外网无法访问？
A: 检查：
1. 服务器防火墙是否开放端口
2. 云服务器安全组是否开放端口
3. 服务器是否监听在 0.0.0.0（不是 localhost）

### Q: WebSocket连接失败？
A: 检查：
1. WebSocket地址是否正确（ws:// 或 wss://）
2. 端口是否正确
3. 防火墙是否允许WebSocket连接
4. 如果使用Nginx，是否配置了WebSocket代理

### Q: 如何查看运行日志？
A: 
- 直接运行：查看终端输出
- 使用PM2：`pm2 logs xchat`
- 查看系统日志：`journalctl -u nginx`（如果使用systemd）

---

## 快速部署脚本

创建 `deploy.sh`：
```bash
#!/bin/bash
cd /path/to/xchat
npm install
pm2 restart xchat || pm2 start server.js --name xchat
```

赋予执行权限：`chmod +x deploy.sh`

---

## 测试部署

1. 在服务器上访问：`http://localhost:4000`
2. 在局域网其他设备访问：`http://服务器IP:4000`
3. 检查WebSocket连接是否正常

部署完成后，将访问地址和WebSocket地址告诉用户即可！

