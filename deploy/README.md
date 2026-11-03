# 用 Cloudflare Tunnel 把 Folio 挂到一个固定域名

目标：`https://folio.你的子域.eu.org` 长期固定，HTTPS 由 Cloudflare 终止，本机不开放任何端口。

代价说清楚：**隧道和在线版都跑在这台 Mac 上**，合盖睡眠、断网、重启都会中断。适合「自己手机/平板随时打开」，不适合「给别人做稳定服务」。

---

## 0. 已经准备好的部分

- `~/.local/bin/cloudflared`（2026.10.7，Cloudflare Inc. 签名）
- 在线版已验证可用：`npm run cloud` → 4319，单账号密码登录
- 本目录的 launchd 模板 + `install.sh`，域名到手后一条命令装成开机自启

---

## 1. 拿到一个免费固定域名（阻塞项，需你操作）

[eu.org](https://nic.eu.org) 免费，但**人工审核，可能几天到几周**。流程：

1. 打开 <https://nic.eu.org/arf/en/>，选 *New domain*；
2. 填表（这就是要提交的内容）：

| 字段 | 填什么 |
|---|---|
| Domain name | `你的名字.eu.org`（比如 `folio-chen.eu.org`，只能用字母数字和连字符） |
| Complete domain name | 同上 |
| Owner | 你的真实姓名拼音 |
| Email | 常用邮箱（会收到确认信，**必须点信里的链接**） |
| Country | CN |
| Nameservers | 先填 `ns1.he.net`、`ns2.he.net`（通过审核后再改成 Cloudflare 给的两个 NS） |

3. 提交后等邮件；收到「accepted」后再往下做。

> 不想等：在阿里云/腾讯云买一个 `.top`（首年常见 9–30 元）或 `.xyz`，**立刻可用**，后面步骤完全一样。审核周期是这个方案唯一的真实成本。

---

## 2. 把域名交给 Cloudflare（免费套餐）

1. 注册/登录 <https://dash.cloudflare.com>，*Add a site* → 填 `你的子域.eu.org` → 选 Free；
2. Cloudflare 会给你两个 NS，例如 `ada.ns.cloudflare.com` / `bob.ns.cloudflare.com`；
3. 回到 eu.org 的域名管理页，把 Nameservers 改成这两个，等生效（几分钟到几小时）；
4. Cloudflare 面板显示 *Active* 后再继续。

---

## 3. 建命名隧道并绑定域名

```bash
# 一次性授权（会开浏览器，选你的域名）
cloudflared tunnel login

# 建隧道，记下输出的 TUNNEL_ID
cloudflared tunnel create folio

# 绑定子域名（在 Cloudflare 里自动建 CNAME）
cloudflared tunnel route dns folio folio.你的子域.eu.org

# 生成实例配置
cp deploy/cloudflared/config.example.yml deploy/cloudflared/config.yml
# 把 config.yml 里的 TUNNEL_ID 和域名换成实际值
```

---

## 4. 让在线版认识这个域名

`FOLIO_PUBLIC_URL` 必须与你访问的地址完全一致，否则服务端会以 `Host not allowed` 拒绝：

```bash
sed -i '' 's|^FOLIO_PUBLIC_URL=.*|FOLIO_PUBLIC_URL=https://folio.你的子域.eu.org|' .env.cloud
```

---

## 5. 装成开机自启

```bash
chmod +x deploy/install.sh
./deploy/install.sh tunnel      # 同时装在线版 + 隧道
```

卸载：`./deploy/install.sh uninstall`

日志：`~/Library/Logs/folio-cloud.log`、`~/Library/Logs/folio-tunnel.log`

---

## 6. 验收清单

```bash
curl -s https://folio.你的子域.eu.org/healthz          # {"ok":true}
curl -sI https://folio.你的子域.eu.org/ | head -3      # 303 → /login.html
```

然后在手机上打开同一个地址，登录后应能看到项目列表。

---

## 7. 安全与维护（对外前逐条确认）

- [ ] 暴露的是 **4319 在线版**，不是 4318 开发版（开发版无登录）
- [ ] `.env.cloud` 里 `FOLIO_SESSION_SECRET`、`FOLIO_PASSWORD_HASH` 已是随机值（`npm run cloud:setup` 生成）
- [ ] 登录密码存在密码管理器；忘记就删 `.env.cloud` 重新生成（会清空登录态，不影响数据）
- [ ] 数据在 `artifacts/cloud-data`，是唯一副本 → 定期备份整目录
- [ ] 飞书授权在**这台机器**上做过一次即可（`lark-cli auth login --domain all`）
- [ ] `deploy/cloudflared/config.yml` 和 `*.json` 已在 `.gitignore`，不要提交
- [ ] 睡眠会断：系统设置 → 电池/电源 → 接电源时关闭「自动睡眠」，或用 `caffeinate` 保持

## 8. 它做不到什么

- 不能 7×24：Mac 关机即断
- 不能多实例：存储是文件版本，只有单个进程能写
- 大陆访问 Cloudflare 的稳定性不由你控制，慢的时候换 Wi-Fi/蜂窝对比
- 想要真正常驻，换一台云服务器（见 `DEPLOYMENT.md`）
