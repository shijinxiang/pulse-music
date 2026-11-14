# PULSE 音乐网站

采用电光绿与冰青色的暗色音乐界面，统一浮动导航、圆角卡片、音块和播放器。

[打开音乐网站](https://shijinxiang.github.io/pulse-music/)

- 播放四首原创合成电子音乐，支持切歌、进度控制、音量调节、随机和循环。
- 按风格筛选、搜索和收藏曲目，也能导入本地音频。
- 使用 A、S、D、F、G、H 弹奏六个琴键，体验音符粒子和沉浸声场。
- 频谱圆环实时分析实际播放的音乐，本地音频同样适配，静音后收敛。
- 鼠标移动时留下七彩音符，停止后约 0.3 秒淡出。组件采用统一圆角，大标题使用电光切割字形。
- 鼠标在曲目卡片和音块上移动时，局部聚光随位置变化。支持键盘操作、触屏与减少动态效果设置。

设计参考了 [StyleKit Neon Gradient](https://www.stylekit.top/styles/neon-gradient) 与 [Spotlight Card](https://www.stylekit.top/animations/spotlight-card)，交互使用原生 JavaScript 实现。

页面使用 HTML、CSS 和 JavaScript，字体与图片随仓库提供。字体许可证保留在 `assets/fonts/`。

本地预览可在仓库目录运行以下命令，然后打开浏览器显示的本地地址。

```sh
python -m http.server 8080
```

GitHub Pages 从 `main` 分支的根目录发布。
