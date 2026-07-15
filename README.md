# シン・ワシソダ通知er / SodaCH Discord Notifier

## 概要 / Overview

**曽田すかい@ワシソダch** の更新を Discord に通知するための notifier です。<br>
YouTube RSS と「ライブ」頁を監視し、動画投稿, ショート投稿, ライブ配信, サムネイルの差し替え, メンバーシップ限定配信を Discord に通知します。<br>
また、 [SodaCH Works Classifier](https://github.com/xiang4ri4kui2/SodaCH-works-classifier) と連携して、動画・配信の「作品名」と「作品公式サイト URL 」も、併せて表示します。<br>
更に、CH創設記念日（7/3）、配信開始記念日（7/11）、チャンネル登録者数 1,000 人突破記念日（9/30）、曽田すかい誕生日（10/20）、バ美ソダちゃん誕生日（1/14）の周年通知、及び各記念日のカウントダウン通知にも対応しています。<br>
<br>
This notifier sends updates from the YouTube channel **"曽田すかい@ワシソダch"** to Discord.<br>
It monitors the YouTube RSS feed and the channel's Live page, and notifies Discord about video uploads, Shorts uploads, live stream events, thumbnail changes, and members-only stream events.<br>
It also integrates with [SodaCH Works Classifier](https://github.com/xiang4ri4kui2/SodaCH-works-classifier) to display the work title and official site URL alongside each notification.<br>
Additionally, it supports anniversary and countdown notifications for the channel founding date (July 3), the stream debut date (July 11), the 1,000-subscriber milestone (September 30), SodaSky's birthday (October 20), and BabiSoda-chan's birthday (January 14).

### 対象チャンネル / Target Channel

**曽田すかい@ワシソダch**<br>
https://www.youtube.com/@BabiSodaSky

---

## 機能 / Features

本 notifier は以下の通知に対応しています。

* 動画投稿
* ショート投稿
* ライブ配信枠（配信予定）の作成
* ライブ配信開始
* ライブ配信終了
* メンバーシップ限定配信枠（配信予定）の作成
* メンバーシップ限定配信開始
* メンバーシップ限定配信終了
* サムネイルの差し替え
* CH創設記念日（7/3）, 配信開始記念日（7/11）, チャンネル登録者数 1,000 人突破記念日（9/30）, 曽田すかい誕生日（10/20）, バ美ソダちゃん誕生日（1/14）の周年通知
* 各周年カウントダウン通知（3ヶ月前, 2ヶ月前, 1ヶ月前, 半月前, 3日前, 2日前, 1日前）

Discord 通知では、以下を表示します。

* 日時（※メンバーシップ限定配信を除く）
* タイトル
* 動画 / 配信 URL
* 作品名・作品公式サイト URL （ [SodaCH Works Classifier](https://github.com/xiang4ri4kui2/SodaCH-works-classifier) による分類結果に基づく）
* サムネイル画像

This notifier supports the following notifications:

* Video uploads
* Shorts uploads
* Live stream scheduling
* Live stream starts
* Live stream ends
* Members-only live stream scheduling
* Members-only live stream starts
* Members-only live stream ends
* Thumbnail changes
* Anniversary notifications for the channel founding date (July 3), stream debut date (July 11), 1,000-subscriber milestone (September 30), SodaSky's birthday (October 20), and BabiSoda-chan's birthday (January 14)
* Anniversary countdown notifications (3 months / 2 months / 1 month / 2 weeks / 3 days / 2 days / 1 day before)

Discord notifications include:

* Date and time (except members-only streams)
* Title
* Video / stream URL
* Work title and official site URL (based on classification by [SodaCH Works Classifier](https://github.com/xiang4ri4kui2/SodaCH-works-classifier) )
* Thumbnail image

---

## 実行間隔 / Monitoring Schedule

負荷分散のため、GitHub Actions は **15分間隔（毎時07分, 22分, 37分, 52分）** で実行しています。

To distribute system load, the workflow runs **every 15 minutes** at: **07, 22, 37, and 52 minutes past every hour**.

---

## ステータス / Status

**現在、試験運用中**

**Currently under trial operation.**

---

## 必要要件 / Requirements

| Item / Secret Name | Version / Description |
| ------- | ------- |
| Node.js | 22.x    |
| npm     | latest  |
| `DISCORD_WEBHOOK_URL` | Discord Webhook URL         |
| `YOUTUBE_API_KEY`     | YouTube Data API v3 API Key |

---

## ライセンス / License

This project is currently **not licensed**.

---

## 免責事項 / Disclaimer

本プロジェクトは **非公式のファンメイド** です。<br>
「曽田すかい@ワシソダch」や関係者とは、一切関係ありません。<br>
但し、本 notifier の運用については **「曽田すかい@ワシソダch」より公認** を得ています。<br>
本ツールは、個人的な通知用途を目的として作成されています。<br>
<br>
This project is an **unofficial fan-made project**.<br>
It is not affiliated with, endorsed by, or associated with **"曽田すかい@ワシソダch"** or its related parties.<br>
However, the operation of this notifier has been **officially approved by "曽田すかい@ワシソダch"**.<br>
This tool is intended for personal notification purposes only.
