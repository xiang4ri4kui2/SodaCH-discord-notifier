# シン・ワシソダ通知er / SodaCH Discord Notifier

## 概要 / Overview

**曽田すかい@ワシソダch** の更新を Discord に通知するための notifier です。<br>
YouTube RSS を監視し、動画投稿, ショート投稿, ライブ配信を Discord に通知します。<br>
現在、試験運用中です。<br>
<br>
This notifier sends updates from the YouTube channel **"曽田すかい@ワシソダch"** to Discord.<br>
It monitors the YouTube RSS feed and notifies Discord about video uploads, Shorts uploads, live stream scheduling, stream start, and stream end events.<br>
Currently under trial operation.<br>
<br>
### 対象チャンネル / Target Channel

**曽田すかい@ワシソダch**<br>
https://www.youtube.com/@BabiSodaSky

---

## 機能 / Features

本 notifier は以下の通知に対応しています。

* 動画投稿通知
* ショート投稿通知
* ライブ配信枠（配信予定）の作成通知
* ライブ配信開始通知
* ライブ配信終了通知

Discord 通知では、以下を表示します。

* 日時
* タイトル
* 動画 / 配信 URL
* サムネイル画像

This notifier supports the following notifications:

* Video upload notifications
* Shorts upload notifications
* Live stream scheduled notifications
* Live stream start notifications
* Live stream end notifications

Discord notifications include:

* Date and time
* Title
* Video / stream URL
* Thumbnail image

---

## 実行間隔 / Monitoring Schedule

負荷分散のため、GitHub Actions は **15分間隔（毎時07分, 22分, 37分, 52分）** で実行しています。

To distribute system load, the workflow runs every **15 minutes** at: **07, 22, 37, and 52 minutes past every hour**.

---

## ステータス / Status

**現在、試験運用中（Test Operation）**

**Currently under trial operation.**

---

## Requirements

| Item / Secret Name | Version / Description |
| ------- | ------- |
| Node.js | 22.x    |
| npm     | latest  |
| `DISCORD_WEBHOOK_URL` | Discord Webhook URL         |
| `YOUTUBE_API_KEY`     | YouTube Data API v3 API Key |

---

## License

This project is currently **not licensed**.

---

## Disclaimer

本プロジェクトは **非公式のファンメイド** です。<br>
「曽田すかい@ワシソダch」や関係者とは一切関係ありません。<br>
但し、本 notifier の運用については **「曽田すかい@ワシソダch」より公認** を得ています。<br>
本ツールは個人的な通知用途を目的として作成されています。<br>
<br>
This project is an **unofficial fan-made project**.<br>
It is not affiliated with, endorsed by, or associated with **"曽田すかい@ワシソダch"** or its related parties.<br>
However, the operation of this notifier has been **officially approved by "曽田すかい@ワシソダch"**.<br>
This tool is intended for personal notification purposes only.
