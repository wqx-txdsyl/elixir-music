# 平台标识

歌曲、歌手、专辑、歌单和媒体文件的标识属于不同对象。跨平台匹配优先参考 ISRC，并核对艺人、版本和时长。

| 来源 | 歌曲主键 | 注意事项 |
| --- | --- | --- |
| 网易云音乐 | `netease:<songId>` | 与 artistId、albumId、playlistId 分开保存 |
| QQ 音乐 | `qqmusic:<songmid>` | songid、songmid、media_mid 含义不同；歌手和专辑另有 ID/MID |
| Spotify | `spotify:<trackId>` | 保留原始 ID、地区替代版本与 ISRC；队列上下文标识不是歌曲主键 |
| 本地音乐 | `local:<path-hash>` | 标签与路径描述本地文件，在线关联需要匹配确认 |

公开搜索是否可见、详情是否存在、是否能播放、歌词和评论是否开放，是独立状态。缓存的历史条目不能视为平台的全量下架数据库。用户本地音乐也不能作为官方曲库记录。

Apple Music 的目录 ID、个人库 ID 和 storefront 规则见 [接入调研](applemusic.md)；当前尚未注册为可用音乐源。
