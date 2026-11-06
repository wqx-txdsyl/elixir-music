# Windows 构建

## 开发运行

安装 `requirements.txt` 与 npm 依赖，然后运行 `npm run prepare:playback`、`npm run build`、`npm start`。桌面主进程会启动 Python 服务，无需另开服务进程。

运行时固定为 Castlabs Electron `44.1.0+wvcus`，下载地址与 SHA-256 位于 `scripts/prepare_ecs.py`。普通 Electron 不一定具备相同的媒体播放能力。

## 候选包

`npm run pack` 构建 Python 服务、前端和 Windows 应用目录。`scripts/build_desktop.ps1 -SkipBackend` 可复用已构建的后端。普通候选包与生产媒体签名包的播放能力可能不同。

## 生产媒体签名

`npm run dist` 使用 Castlabs EVS 对候选包签名并验证，再生成便携 EXE。打包者需要自己的 EVS 账户；仓库不提供账户或密码。

`scripts/sign_desktop.py` 支持两种配置：

- 环境变量 `ELIXIR_EVS_ACCOUNT`、`ELIXIR_EVS_PASSWORD`。
- 设置 `ELIXIR_SIGNING_DIR` 指向已有 Windows DPAPI 配置目录，读取 `evs-account.dpapi` 与 `evs-config.dpapi`。这种方式仅适用于拥有对应 Windows 用户解密权限的构建机。

签名脚本只处理 `release/elixir-candidate/win-unpacked`，不包含用户数据目录。代理可通过标准 `HTTPS_PROXY` 环境变量设置。EVS 媒体签名不等于 Windows 发布者代码签名。

## 发布内容

源码仓库不包含账号、音乐库、音乐文件、签名凭据、运行时缓存或打包产物。Release 提供 Windows x64 便携 EXE 与 SHA-256 校验文件。源码的 `package.json`、锁文件和后端版本号应保持一致。
