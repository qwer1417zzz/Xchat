#!/bin/bash

echo "=========================================="
echo "第一共创聊天应用 - 云服务器部署脚本"
echo "=========================================="
echo ""

# 检查Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 未检测到Node.js，正在安装..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
    echo "✅ Node.js安装完成"
else
    echo "✅ Node.js已安装: $(node --version)"
fi

# 检查npm
if ! command -v npm &> /dev/null; then
    echo "❌ 未检测到npm"
    exit 1
else
    echo "✅ npm已安装: $(npm --version)"
fi

# 安装依赖
echo ""
echo "正在安装依赖..."
npm install

# 检查PM2
if ! command -v pm2 &> /dev/null; then
    echo ""
    echo "正在安装PM2..."
    npm install -g pm2
    echo "✅ PM2安装完成"
else
    echo "✅ PM2已安装"
fi

# 启动服务
echo ""
echo "正在启动服务..."
pm2 restart xchat 2>/dev/null || pm2 start server.js --name xchat

# 设置开机自启
echo ""
echo "正在设置开机自启..."
pm2 startup | grep -v "PM2" | bash || true
pm2 save

# 显示状态
echo ""
echo "=========================================="
echo "部署完成！"
echo "=========================================="
echo ""
pm2 list
echo ""
echo "查看日志: pm2 logs xchat"
echo "重启服务: pm2 restart xchat"
echo "停止服务: pm2 stop xchat"
echo ""

