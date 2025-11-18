@echo off
chcp 65001 >nul
echo ==========================================
echo 第一共创聊天应用 - 上传到服务器
echo ==========================================
echo.

set /p SERVER_IP="请输入服务器IP地址: "
set /p USERNAME="请输入用户名 (默认: root): "
if "%USERNAME%"=="" set USERNAME=root

echo.
echo 正在上传文件到服务器...
echo 目标: %USERNAME%@%SERVER_IP%:/root/xchat
echo.

scp -r . %USERNAME%@%SERVER_IP%:/root/xchat

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ==========================================
    echo ✅ 上传成功！
    echo ==========================================
    echo.
    echo 现在请SSH连接到服务器并执行：
    echo   cd /root/xchat
    echo   chmod +x deploy.sh
    echo   ./deploy.sh
    echo.
) else (
    echo.
    echo ❌ 上传失败！
    echo 请检查：
    echo   1. 服务器IP是否正确
    echo   2. 用户名是否正确
    echo   3. 是否已配置SSH密钥或密码
    echo.
)

pause

