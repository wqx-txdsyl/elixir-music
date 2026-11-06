<p align="center"><img src="desktop/branding/runtime/elixir-wave-round-r3.png" width="112" alt="Elixir"></p>

<h1 align="center">Elixir</h1>

<p align="center">把网易云音乐、QQ 音乐、Spotify 与本地音乐放进一个桌面播放器。</p>

<p align="center">
  <a href="https://github.com/wqx-txdsyl/elixir-music/releases/latest"><img src="https://img.shields.io/github/v/release/wqx-txdsyl/elixir-music?color=31c27c" alt="Release"></a>
  <img src="https://img.shields.io/badge/platform-Windows%20x64-0078d4" alt="Windows x64">
</p>

<p align="center"><a href="https://github.com/wqx-txdsyl/elixir-music/releases/latest">下载</a> · <a href="CHANGELOG.md">更新日志</a> · <a href="https://github.com/wqx-txdsyl/elixir-music/issues">反馈问题</a></p>

## 说明

基于 Electron、React 和 Python FastAPI 开发，目前提供 Windows x64 便携版。界面支持网易云、QQ、Spotify、极光、墨刻和 Apple Music 六种风格。

## 功能

- 跨平台搜索歌曲、专辑、歌手、歌单与 MV，查看作品资料。
- 连接平台账号，读取支持的云端音乐库与歌单。
- 导入本地音乐、管理自建歌单、收藏、批量操作与排序。
- 播放队列、下一首播放、最近播放、听歌排行与播放统计。
- 歌词、桌面歌词、歌词配色与固定窗口。
- 网易云、QQ、Spotify、极光、墨刻和 Apple Music 六套界面。
- 托盘后台常驻。

歌曲可用性与音质取决于平台、账号和地区。Spotify 使用应用内官方网页音频引擎；Apple Music 目前只有界面主题，尚未接入音乐源。MV 播放及部分平台操作会打开官方页面。均衡器对不同播放引擎的支持仍有差异。

## 使用

从 [GitHub Releases](https://github.com/wqx-txdsyl/elixir-music/releases/latest) 下载 `Elixir-0.2.6-Windows.exe`，放到可写目录运行，例如 `D:\Programs\Elixir`。应用会在程序旁创建 `MusicPlatformData`，保存设置、音乐库与加密账号信息。

更新时退出 Elixir，替换程序并保留原有 `MusicPlatformData`。请勿把该数据目录、登录 Cookie 或签名凭据提交到仓库。

## 用户界面

以下为本机 Elixir 的真实运行截图。

### Apple Music 风格

![Elixir 的 Apple Music 风格首页](docs/images/theme-apple.jpg)

### QQ 音乐风格

![Elixir 的 QQ 音乐风格与最近播放](docs/images/theme-qqmusic.jpg)

## 源码使用方法

需要 Windows x64、Node.js、Python 3.11+。首次准备：

```powershell
npm ci
python -m pip install -r requirements.txt
npm run prepare:playback
npm run build
npm start
```

`prepare:playback` 下载并校验固定版本的 Castlabs Electron。开发数据默认保存在本地 `data/`，不会进入 Git。

## 打包

```powershell
python -m pip install -r requirements-build.txt
npm run pack
```

输出目录为 `release/elixir-candidate/win-unpacked`。生产媒体签名需要打包者自行配置 Castlabs EVS 账户；`npm run dist` 会签名并生成便携包。签名配置和密码不随源码分发，详见 [构建说明](docs/build.md)。

## 目录

| 目录 | 内容 |
| --- | --- |
| `frontend/` | React 界面、主题与静态图标 |
| `backend/` | 本地服务、音乐源适配、SQLite 音乐库 |
| `desktop/` | Electron、播放器、托盘与正式品牌资源 |
| `scripts/` | 运行环境准备与打包脚本 |
| `docs/` | 构建说明、平台标识与 Apple Music 调研 |

## 反馈与贡献

反馈问题时请附上版本、复现步骤和截图，并隐去账号信息。修复和功能改进可提交 Pull Request；较大的功能调整建议先通过 Issue 讨论。

## 当前版本

0.2.6 整理了源码目录，移除了临时测试和历史实验文件，并将 QQ 主题左上角统一为 Elixir 图标与名称。此版本没有接入 Apple Music 完整播放，也不声称恢复了平台全部下架曲目。

本仓库尚未授予开源许可证；第三方依赖遵循各自许可证。
