# 🚀 快速部署到云服务器

## 最简单的方式（3步完成）

### 1️⃣ 上传文件到服务器

**Windows用户：**
```bash
# 双击运行 upload-to-server.bat
# 或手动执行：
scp -r D:\xchat root@你的服务器IP:/root/
```

**Mac/Linux用户：**
```bash
scp -r /path/to/xchat root@你的服务器IP:/root/
```

### 2️⃣ SSH连接服务器并部署

```bash
# 连接服务器
ssh root@你的服务器IP

# 进入项目目录
cd /root/xchat

# 运行部署脚本
chmod +x deploy.sh
./deploy.sh
```

### 3️⃣ 配置防火墙和安全组

**服务器防火墙：**
```bash
# Ubuntu/Debian
sudo ufw allow 4000/tcp
sudo ufw enable

# CentOS
sudo firewall-cmd --permanent --add-port=4000/tcp
sudo firewall-cmd --reload
```

**云服务器安全组：**
- 登录云服务器控制台
- 找到你的服务器 → 安全组
- 添加入站规则：TCP 端口 4000，源 0.0.0.0/0

### ✅ 完成！

访问：`http://你的服务器IP:4000`

---

## 📖 详细部署指南

查看 `CLOUD_DEPLOY.md` 获取完整部署说明，包括：
- 域名配置
- Nginx反向代理
- SSL证书配置
- 常见问题解答

---

## 💡 重要提示

1. **WebSocket地址自动检测**：用户访问时无需手动配置，系统会自动检测
2. **数据备份**：定期备份 `data.json` 文件
3. **使用PM2**：确保服务在后台稳定运行
4. **配置域名**：建议配置域名和HTTPS，更安全

---

## 🔧 常用命令

```bash
pm2 list              # 查看服务状态
pm2 logs xchat        # 查看日志
pm2 restart xchat     # 重启服务
pm2 stop xchat        # 停止服务
```

---

## 📞 需要帮助？

查看 `CLOUD_DEPLOY.md` 获取详细帮助和故障排除指南。

