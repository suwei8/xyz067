# Spaceship Domain Scanner

自动扫描 Spaceship.com 上的可用域名，专注于寻找特定价格的 .xyz 域名。

## 功能特性

- 🔍 自动扫描指定范围的 .xyz 域名
- 💰 检测可用域名（显示"is available"）
- 📝 结果保存为 Markdown 格式，支持点击跳转
- 🤖 支持 GitHub Actions 自动化运行
- ⏰ 每小时自动扫描并提交结果
- 🛡️ 内置反检测机制，模拟真实浏览器行为

## 快速开始

### 本地运行

1. 安装依赖：
```bash
npm install
```

2. 运行扫描：
```bash
npm run scan:puppeteer
```

3. 查看结果：
- 扫描结果：`found_0_67.md`
- 错误日志：`errors.log`

### GitHub Actions 自动化

项目配置了 GitHub Actions 工作流，会：
- 每小时自动运行一次扫描
- 自动提交和推送扫描结果
- 运行 6 次后自动停止（约 5.5 小时）
- 重置计数器，准备下一轮扫描

## 配置说明

项目使用 `config.json` 文件进行配置管理。如果配置文件不存在，将使用默认配置。

### 配置文件结构

```json
{
  "scan": {
    "start": 112509,           // 起始域名数字
    "end": 112510,             // 结束域名数字
    "concurrency": 1,          // 并发数（建议保持为1）
    "timeoutMs": 30000,        // 页面加载超时时间
    "targetSnippet": "is available",  // 目标匹配文本
    "saveOk": false            // 是否保存所有OK响应
  },
  "filter": {
    "skipNumbers": ["3", "4"],    // 跳过包含这些数字的域名
    "skipPatterns": [".*13$"],    // 跳过匹配正则模式的域名
  },
  "output": {
    "resultFile": "found_0_67.md",  // 结果文件名
    "errorFile": "errors.log"       // 错误日志文件名
  }
}
```

### 域名过滤功能

- **skipNumbers**: 跳过包含指定数字的域名
  - 例如：`["3", "4"]` 会跳过 112503、112504、112513、112534 等
- **skipPatterns**: 使用正则表达式跳过匹配的域名
  - 例如：`[".*13$"]` 会跳过以13结尾的域名

### 配置示例

参考 `config.example.json` 文件查看完整配置示例。

## 输出格式

扫描结果保存在 `found_0_67.md` 文件中，格式如下：

```markdown
## [112509.xyz](https://www.spaceship.com/domain-search/?query=112509.xyz&beast=false&tab=domains)
```

- 使用二级标题显示，字体较大便于查看
- 点击域名可直接跳转到 Spaceship 购买页面

## 技术实现

- **Node.js 20+** - 运行环境
- **Puppeteer** - 无头浏览器自动化
- **反检测机制** - 模拟真实用户行为
- **GitHub Actions** - 自动化部署和运行

## 许可证

MIT License