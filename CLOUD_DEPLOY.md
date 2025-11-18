# 云服务器部署指南

## 📋 准备工作

1. **购买云服务器**
   - 推荐：阿里云、腾讯云、华为云
   - 配置：1核2G内存即可（约50-100元/月）
   - 系统：Ubuntu 20.04/22.04 或 CentOS 7/8

2. **准备工具**
   - SSH客户端（Windows: PuTTY, Xshell / Mac/Linux: 内置终端）
   - FTP工具（可选，用于上传文件）

---

## 🚀 部署步骤

### 第一步：连接服务器

使用SSH连接到你的云服务器：
```bash
ssh root@你的服务器IP
# 或
ssh username@你的服务器IP
```

### 第二步：安装Node.js

**Ubuntu/Debian系统：**
```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证安装
node --version
npm --version
```

**CentOS系统：**
```bash
# 更新系统
sudo yum update -y

# 安装Node.js 18.x
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# 验证安装
node --version
npm --version
```

### 第三步：上传项目文件

**方式1：使用SCP（推荐）**
在本地电脑（Windows PowerShell 或 CMD）执行：
```bash
scp -r D:\xchat root@你的服务器IP:/root/
```

**方式2：使用Git**
```bash
# 在服务器上
cd /root
git clone 你的仓库地址
# 或直接上传压缩包后解压
```

**方式3：使用FTP工具**
- 使用FileZilla、WinSCP等工具上传整个项目文件夹

### 第四步：安装依赖并启动

```bash
# 进入项目目录
cd /root/xchat

# 安装依赖
npm install

# 测试启动（先测试是否正常）
npm run server
```

如果看到 `[api] listening on http://0.0.0.0:4000` 说明启动成功。

按 `Ctrl+C` 停止测试。

### 第五步：配置防火墙

**Ubuntu/Debian (ufw)：**
```bash
# 安装ufw（如果没有）
sudo apt install ufw -y

# 开放4000端口
sudo ufw allow 4000/tcp

# 启用防火墙
sudo ufw enable

# 查看状态
sudo ufw status
```

**CentOS (firewalld)：**
```bash
# 开放4000端口
sudo firewall-cmd --permanent --add-port=4000/tcp

# 重载防火墙
sudo firewall-cmd --reload

# 查看状态
sudo firewall-cmd --list-ports
```

### 第六步：配置云服务器安全组

**重要！** 必须在云服务器控制台配置安全组规则：

1. 登录云服务器控制台（阿里云/腾讯云等）
2. 找到你的服务器实例
3. 进入"安全组"设置
4. 添加入站规则：
   - 协议：TCP
   - 端口：4000
   - 源：0.0.0.0/0（允许所有IP访问）
   - 描述：XChat WebSocket服务

### 第七步：使用PM2后台运行（推荐）

```bash
# 全局安装PM2
npm install -g pm2

# 启动服务
cd /root/xchat
pm2 start server.js --name xchat

# 设置开机自启
pm2 startup
# 执行上面命令输出的命令（通常是 sudo env PATH=...）
pm2 save

# 查看运行状态
pm2 list
pm2 logs xchat
```

### 第八步：测试访问

1. **在浏览器访问**：`http://你的服务器IP:4000`
2. **WebSocket地址会自动检测**，无需手动配置
3. 如果使用域名，访问：`http://你的域名:4000`

---

## 🌐 配置域名（可选，推荐）

### 1. 购买域名
- 阿里云、腾讯云、GoDaddy等

### 2. 解析域名
在域名管理后台添加A记录：
- 主机记录：`@` 或 `www`
- 记录类型：A
- 记录值：你的服务器IP
- TTL：600

### 3. 安装Nginx

```bash
# Ubuntu/Debian
sudo apt install nginx -y

# CentOS
sudo yum install nginx -y
```

### 4. 配置Nginx反向代理

创建配置文件：`/etc/nginx/sites-available/xchat`

```nginx
server {
    listen 80;
    server_name 你的域名.com;  # 替换为你的域名

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

启用配置：
```bash
# Ubuntu/Debian
sudo ln -s /etc/nginx/sites-available/xchat /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# CentOS
sudo cp /etc/nginx/sites-available/xchat /etc/nginx/conf.d/xchat.conf
sudo nginx -t
sudo systemctl reload nginx
```

### 5. 配置SSL证书（HTTPS，推荐）

使用Let's Encrypt免费SSL证书：

```bash
# 安装certbot
sudo apt install certbot python3-certbot-nginx -y  # Ubuntu/Debian
# 或
sudo yum install certbot python3-certbot-nginx -y  # CentOS

# 申请证书
sudo certbot --nginx -d 你的域名.com

# 自动续期（已自动配置）
```

配置完成后，访问：`https://你的域名.com`

---

## 📝 常用命令

### PM2管理
```bash
pm2 list              # 查看所有进程
pm2 logs xchat        # 查看日志
pm2 restart xchat     # 重启服务
pm2 stop xchat        # 停止服务
pm2 delete xchat      # 删除服务
pm2 monit             # 监控面板
```

### 查看服务状态
```bash
# 查看端口占用
sudo netstat -tlnp | grep 4000
# 或
sudo ss -tlnp | grep 4000

# 查看进程
ps aux | grep node
```

### 查看日志
```bash
# PM2日志
pm2 logs xchat

# 实时日志
pm2 logs xchat --lines 100

# 清空日志
pm2 flush
```

---

## 🔧 环境变量配置

可以通过环境变量自定义配置：

```bash
# 设置端口
export PORT=4000

# 设置监听地址
export HOST=0.0.0.0

# 使用PM2启动时设置环境变量
pm2 start server.js --name xchat --update-env --env PORT=4000
```

或创建 `.env` 文件（需要安装dotenv包）：
```
PORT=4000
HOST=0.0.0.0
```

---

## 🔒 安全建议

1. **修改SSH端口**：避免使用默认22端口
2. **使用密钥登录**：禁用密码登录
3. **定期更新系统**：`sudo apt update && sudo apt upgrade`
4. **配置防火墙**：只开放必要端口
5. **使用HTTPS**：配置SSL证书
6. **定期备份**：备份 `data.json` 文件

---

## ❓ 常见问题

### Q1: 无法访问网站？
**检查清单：**
- ✅ 服务器是否正常运行：`pm2 list`
- ✅ 防火墙是否开放端口：`sudo ufw status`
- ✅ 云服务器安全组是否配置
- ✅ 服务器是否监听在0.0.0.0（不是localhost）

### Q2: WebSocket连接失败？
**检查清单：**
- ✅ WebSocket地址是否正确（自动检测或手动填写）
- ✅ 端口是否正确
- ✅ 防火墙是否允许WebSocket连接
- ✅ 如果使用Nginx，是否配置了WebSocket代理

### Q3: 如何查看错误日志？
```bash
pm2 logs xchat --err
# 或
pm2 logs xchat --lines 100
```

### Q4: 如何更新代码？
```bash
cd /root/xchat
# 上传新文件或 git pull
npm install  # 如果有新依赖
pm2 restart xchat
```

### Q5: 如何备份数据？
```bash
# 备份data.json
cp /root/xchat/data.json /root/xchat/data.json.backup

# 或定期自动备份（添加到crontab）
0 2 * * * cp /root/xchat/data.json /root/backup/data-$(date +\%Y\%m\%d).json
```

---

## 🎯 快速部署脚本

创建 `deploy.sh`：

```bash
#!/bin/bash
cd /root/xchat
npm install
pm2 restart xchat || pm2 start server.js --name xchat
echo "部署完成！"
```

赋予执行权限：
```bash
chmod +x deploy.sh
./deploy.sh
```

---

## 📞 部署完成后

1. **测试访问**：在浏览器打开 `http://你的服务器IP:4000`
2. **分享地址**：将访问地址告诉其他人
3. **WebSocket自动配置**：用户访问时，WebSocket地址会自动检测，无需手动配置

**如果使用域名：**
- HTTP访问：`http://你的域名.com`
- HTTPS访问：`https://你的域名.com`（配置SSL后）

---

## 🎉 完成！

现在你的聊天应用已经部署到云服务器上了，任何人都可以通过你提供的地址访问和使用！

