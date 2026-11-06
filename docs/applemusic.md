# Apple Music 接入调研

调研日期：2026-11-06。范围：Elixir Windows 桌面版。用户最新条件：**不付开发者年费，也不付 Apple Music 订阅费**。状态：已核对官方文档、现有代码和相关公开客户端源码；未进行 Apple 账号授权或完整歌曲播放实测。本文件是接入调查，不代表功能已经上线。

## 结论

在用户要求的零费用条件下，**本轮未找到可可靠接入 Apple 原源完整歌曲点播的方案**。目前可确认的免费范围是公开搜索与资料、歌曲/MV 预览，以及指定直播电台。不能据此承诺完整点播、完整云端音乐库或官方歌词。

免费版本可考虑把 Apple 作为公开资料与预览来源，再匹配用户已有本地文件或其他平台允许播放的音源，并明确显示实际播放来源。跨平台匹配不保证所有录音都有替代源，也不能将它标成 Apple 原源播放。

下文保留官方 SDK 能力与项目适配位置，供条件变化时参考；**需要订阅的完整播放路线不符合当前零费用要求，不作为已选定的实施方案**。

## 零费用路线的核查结果

| 路线 | 能否免开发者年费 | 能否免音乐订阅并完整点播 Apple 曲库 | 当前证据 |
| --- | --- | --- | --- |
| 官方公开网页 | 可以 | 未开放这个能力 | Apple 文档明确无订阅可搜索及播放预览 |
| 用户自己的网页会话 + MusicKit | 存在免自有开发者密钥的社区实现 | 未找到；社区实现仍要求有效订阅 | 查到令牌与 API 源码，不是完整播放实测 |
| 私有 API / 第三方客户端 | 一些实现可以 | 不能由“客户端免费”推出“音乐订阅免费” | 查到的会话方案仍要求订阅；无订阅完整播放未证实 |
| Apple 直播电台 | 不需要自有开发者密钥才能在官方网页收听 | 可听指定直播，不能按歌点播、倒带或跳曲 | 官方用户文档支持，地区可用性不同 |
| 自有本地音频、此前购买的文件 | 不需要 | 可播放用户已拥有且当前播放器支持的文件 | 不等于获得 Apple 流媒体目录权限 |

Apple 官方确认，无订阅仍可搜索和播放歌曲/MV 预览。[无订阅搜索与预览](https://support.apple.com/guide/music-web-review/search-for-music-apdmca22e054/web)

官方网页的指定直播电台及 Apple Music TV 无需音乐订阅，但需要登录 Apple Account；直播不能当成任意歌曲点播。[官方网页电台](https://support.apple.com/guide/music-web/listen-to-radio-apdmdb465399/web)、[直播限制](https://support.apple.com/guide/iphone/listen-to-radio-iph0fc7cdac1/ios)

社区实现核对到：

- [applemusic-agent-skill](https://github.com/jamiezigelbaum/applemusic-agent-skill) 从用户已登录网页会话取得授权，提供目录查询和音乐库写入。README 明确要求有效订阅；实际 [Python 源码](https://github.com/jamiezigelbaum/applemusic-agent-skill/blob/main/scripts/applemusic_library.py) 使用 Developer Token 与 Music User Token。其标题“不需要 token”是指不要求用户自行申请，不能解释成请求没有令牌。
- [systemyongsan82/applemusic](https://github.com/systemyongsan82/applemusic) 描述从官方网页会话取得两类令牌；[client.ts](https://github.com/systemyongsan82/applemusic/blob/main/src/client.ts) 包含目录与内部歌词请求。它是资料/接口调查参照，不能证明无订阅完整播放。
- [applemusic-private](https://github.com/anselmoshim/applemusic-private) 同样明确使用有效订阅账号。刷新网页令牌能处理部分到期问题，不能生成账号原本没有的订阅权限。

本轮仅访问公开源码和匿名官方网页。匿名 `https://music.apple.com/us/browse` 返回 HTTP 200，仅证明页面可访问；未读取用户浏览器凭据，也未把这个响应视为完整音频播放成功。

限时试用与付费家庭共享不属于持续零费用方案。当前可执行建议是先确定是否需要 Apple 公开资料/预览这一层；完整音乐仍使用已有可播放来源。若要求“Apple 原源、任意完整点播、无订阅”，该目标本轮尚无可交付方案。

## 有订阅时的官方技术路线（当前未采用）

可采用 **Apple Music API 读取资料与音乐库，MusicKit JS 在应用进程内播放**。先验证 Windows 完整播放，再扩展搜索、个人歌单和歌词。

这个方案使用 Apple 提供的网页播放引擎，声音由 Elixir 内的播放器输出，无需控制外部浏览器或已安装的 Apple Music 客户端；它也不是原生 Swift MusicKit 的 Windows 移植。Apple 官方列出的 SDK 路线是 Apple 平台 MusicKit、Android SDK 和 Web MusicKit，未列出可直接嵌入本项目的 Windows 原生播放 SDK。[MusicKit 概览](https://developer.apple.com/musickit/)、[Web SDK 文档](https://js-cdn.music.apple.com/musickit/v3/docs/)

现有 Apple Music 主题只是外观。`backend/app.py` 的 provider 注册表、`frontend/src/api.js` 的音乐源列表目前仍只有网易云、QQ、Spotify 和本地；没有 Apple 音乐源。

## 授权、费用与会话

需要区分应用身份与用户身份：

| 项目 | 官方方式 | 对 Elixir 的影响 |
| --- | --- | --- |
| 应用身份 | 开发者用 MusicKit 私钥签发 Developer Token | 自有官方凭据路线需要 Apple Developer Program；普通用户无需各自开开发者账户 |
| 用户身份 | 用户通过 MusicKit 授权，得到 Music User Token | 读取个人音乐库和个人化内容；不能把普通 Cookie 当成等价凭据 |
| 完整歌曲 | 有效 Apple Music 订阅及该地区的播放权限 | Developer Token 或登录成功均不等于可以播放完整歌曲 |
| 续期 | 开发者 JWT 到期前重签；Web SDK 管理用户令牌 | 撤销授权、账号失效时仍需重新登录，不能承诺 Cookie 永久自动恢复 |

Developer Token 使用 ES256，最长有效期为 15,777,000 秒，约六个月。分发版不能包含签名私钥 `.p8`；可由小型签发服务向应用提供令牌，或由个人部署者配置自己的密钥。公开的开发者令牌本身不应被当作私钥。[开发者令牌](https://developer.apple.com/documentation/applemusicapi/generating-developer-tokens)

Web MusicKit 自动管理用户令牌，并为其 API 请求附加授权。若由 Python 后端请求个人接口，还需明确设计 SDK 与后端之间的授权传递和加密保存。[用户授权](https://developer.apple.com/documentation/applemusicapi/user-authentication-for-musickit)

Apple Developer Program 标准费用为 **99 美元/年或当地货币价格**，与用户的音乐订阅分开计算。这是自有官方开发者身份路线的成本，不据此断言所有可能的个人客户端路线都必须另付这笔费用；复用官方网页会话属于另一项待验证方案。[官方费用](https://developer.apple.com/help/account/membership/program-enrollment)

## 功能与接口

下表的“可接入”表示有文档依据，尚未在 Elixir 实测。API 基地址为 `https://api.music.apple.com`；个人接口还需要用户授权。

| 功能 | 入口 | 判断 |
| --- | --- | --- |
| 歌曲、专辑、歌手、歌单、MV 搜索 | `GET /v1/catalog/{storefront}/search`，按 `types` 查询 | 可接入；单独分页并保留地区 |
| 歌曲资料、专辑曲序、歌手关联作品、封面 | `/v1/catalog/{storefront}/songs|albums|artists/{id}` 及 relationships | 可接入；关联内容也需要翻页 |
| 用户地区 | `GET /v1/me/storefront` | 用真实账号地区决定曲库与播放检查 |
| 个人歌曲、专辑、歌单 | `/v1/me/library/songs|albums|playlists` | 可读取；不是只有目录歌曲 |
| 个人库搜索 | `GET /v1/me/library/search` | 可接入 |
| 新建个人歌单 | `POST /v1/me/library/playlists` | 已有公开文档 |
| 歌单追加曲目 | `POST /v1/me/library/playlists/{id}/tracks` | 已有公开文档，追加到末尾；可能有可见性延迟 |
| 个人推荐 | `GET /v1/me/recommendations` | 可接入 |
| 最近播放 | `GET /v1/me/recent/played` | 可接入；不等于完整历史账本 |
| 排行榜 | `GET /v1/catalog/{storefront}/charts` | 可接入 |
| Replay | `GET /v1/me/music-summaries?filter[year]=latest` | 最新符合条件年份的汇总，不是任意年份的逐首记录 |
| 收藏与评分 | favorites、ratings 接口 | 按资源类型分别适配；不能把收藏、加入音乐库和评分混为一种操作 |
| 播放、暂停、跳转、队列、音量 | MusicKit JS 播放器 | 官方存在，Windows 应用内完整播放需先实测 |
| MV 播放 | MusicKit Web 视频能力 | 有官方入口，需独立验证视频输出，不能用 MV 搜索成功代替播放验收 |

来源：[搜索](https://developer.apple.com/documentation/applemusicapi/search-for-catalog-resources-(by-type))、[用户地区](https://developer.apple.com/documentation/applemusicapi/get-a-user%27s-storefront)、[个人库搜索](https://developer.apple.com/documentation/applemusicapi/search-for-library-resources)、[个人歌单](https://developer.apple.com/documentation/applemusicapi/get-all-library-playlists)、[新建歌单](https://developer.apple.com/documentation/applemusicapi/create-a-new-library-playlist)、[追加曲目](https://developer.apple.com/documentation/applemusicapi/add-tracks-to-a-library-playlist)、[推荐](https://developer.apple.com/documentation/applemusicapi/get-all-recommendations)、[最近播放](https://developer.apple.com/documentation/applemusicapi/get-recently-played-resources)、[排行榜](https://developer.apple.com/documentation/applemusicapi/charts)、[Replay](https://developer.apple.com/documentation/applemusicapi/get-the-user%27s-replay-data)、[收藏](https://developer.apple.com/documentation/applemusicapi/add-resource-to-favorites)。

不能直接承诺云端歌单任意删除、重排与双向完全同步：本轮确认了读取、新建和追加，未确认这些修改操作的公开 REST 合同。Elixir 自有本地歌单仍可独立管理，界面应区分“本地修改”和“已同步 Apple”。

## 歌词、音质与离线

- **歌词**：公开接口的 `hasLyrics` 仅表示目录有歌词；本轮未找到公开的歌词正文或逐字时间轴接口。不能据此承诺官方同步歌词。第一步可复用本地 LRC 和现有歌词匹配，保留来源；Apple 网页使用的内部歌词接口可作为后续单独调查项，不能当成稳定公开 API。[hasLyrics 定义](https://developer.apple.com/documentation/musickit/song/haslyrics)
- **音质**：原生 MusicKit 文档中的无损、高清无损和空间音频枚举，不能直接证明 Windows MusicKit JS 同样支持。先记录实际播放格式与码率，再决定音质选项。[原生 AudioVariant](https://developer.apple.com/documentation/musickit/audiovariant)
- **均衡器**：需验证受保护音频能否进入当前音效链。播放器能出声不等于本机均衡器已生效。
- **离线与下载**：资料接口中的预览地址不是完整音频地址；不把预览播放当成完整播放，也不承诺读取官方客户端离线文件即可继承播放能力。
- **评论**：本轮未发现 Apple Music 公开歌曲评论读取接口，不为它生成虚构评论区。

## 可借鉴的桌面实现

[Cider 1](https://github.com/ciderapp/Cider) 提供了直接相关的公开先例。其 [package.json](https://github.com/ciderapp/Cider/blob/main/package.json) 声明了 MusicKit 类型依赖、Castlabs Electron `v32.2.6+wvcus` 和 AGPL-3.0 许可；[MusicKit 工具代码](https://github.com/ciderapp/Cider/blob/main/src/renderer/main/musickittools.js) 使用 Developer Token 和 Music User Token。

这说明 Electron + MusicKit 的组合有实际项目采用，不证明当前 Elixir、当前 Apple 服务及特定账号已经兼容。该仓库已归档，也不等于 Cider 2 的现行源码。适合参考授权与播放器组织方式；先独立实现小型验证，不直接整体搬入旧客户端。

Elixir 的 `scripts/prepare_ecs.py` 已固定 Castlabs Electron `44.1.0+wvcus`。可先复用这个运行环境验证 Apple DRM，避免再引入一套桌面运行时。已有 Spotify 播放成功不能替代 Apple 的许可证实测。

无自有开发者密钥时，可单独调查用户自己的官方网页会话是否适合个人使用；本轮未验证这条路线，不把第三方应用的共享令牌、令牌服务或其持续可用性当作 Elixir 的默认依赖。

## 对现有项目的接入位置

1. **后端音乐源**：新增 `AppleMusicProvider`，注册到 `backend/app.py`；复用现有统一歌曲、专辑、歌手和歌单模型。先搜索和读取，再实现已确认的写入操作。
2. **标识规则**：新增 `applemusic` 来源，保存资源类型、目录 ID、个人库 ID 与 storefront。个人库 ID 可含 `.`（如 `i.…`、`p.…`）；现有 `source_of()` 的正则不接受点，需做按来源和资源类型限定的验证，不能直接放开所有平台规则。个人库资源可能来自用户导入，不保证都有目录对应项。[目录与个人库区别](https://developer.apple.com/documentation/applemusicapi)
3. **账号**：SDK 官方授权，令牌通过现有 DPAPI 存储；区分未授权、订阅不可用、地区不可用、令牌失效与网络错误。切换账号时清理该账号缓存。
4. **播放器**：在 `desktop/main.cjs` / `desktop/preload.cjs` 增加独立 MusicKit 适配器，与 React 播放条共享命令及状态模型。由实际播放器事件报告曲目、进度、暂停和结束，不能以“命令已发送”推断已经播放。
5. **歌词同步**：以播放器实际曲目 ID 与位置为准；切歌先清空旧详情，丢弃过期请求。自有队列与 SDK 队列只设一个推进责任方，避免双重切歌。
6. **界面**：账号、搜索平台筛选、云端音乐库与来源标签增加 Apple Music。Apple 主题和 Apple 音乐源保持独立，可在任意主题中使用。

## 有订阅路线的验证顺序（仅作参考）

### A. 先验证真正的应用内播放

使用隔离测试入口，不改动当前三家播放器。核对实际账号地区和订阅，完成官方授权与开发者身份配置；验证登录弹窗、页面来源、SDK 加载和 DRM 许可链。测试：

- 至少三首不同专辑曲目，播放超过预览长度，并验证接近曲末与自然结束；不能只看进度条或登录标记。
- 暂停/继续、拖动、手动切歌和自然下一首；实际声音、当前曲目、进度条一致。
- 保持应用在后台及托盘，关闭再启动后恢复会话；授权失效时明确提示。
- 不启动外部 Apple Music 客户端，也不依赖外部浏览器标签页出声。

本阶段不过，不将“可搜索”“有会员标记”或“能播预览”写成播放已完成。

### B. 再接曲库与个人音乐库

实现歌曲/专辑/歌手/歌单/MV 搜索、详情和分页；读取完整个人歌单。验证本地导入库资源、不同地区、同名版本和多碟专辑。跨平台匹配优先 ISRC，再核对艺人、版本与时长，不能只按歌名替换。

### C. 最后接歌词与扩展能力

完成同步歌词来源、收藏、推荐、最近播放与 Replay；根据实际 SDK 能力开放音质、MV 和音效。云端写入逐项验证后开放，不预先画出没有后端能力的按钮。

本轮只更新此调研文档，未改动音乐库、账号或现有播放链路。按用户最新条件，核心结论是：**免开发者年费与免音乐订阅不是同一件事；目前查到的免开发者年费方案没有解决无订阅完整点播**。A 阶段只有在账号具备实际播放权限时才有验证意义。
