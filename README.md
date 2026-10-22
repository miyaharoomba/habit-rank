# HabitBase

継続時間の記録、履歴補正、ランキング、称号・XP、DM、掲示板、Web Push、ミニゲーム（Stack Tower / Pulse Runner）を備えた Next.js + Supabase アプリ。

## 開発

Node.js 24 を使用。npm の依存解決は package-lock.json を正とする。
本番ビルドは Webpack を使い、Windows 上の Turbopack 子プロセス不具合を回避する。Geist フォントも同梱パッケージを使い、ビルド時の外部フォント取得をなくした。

```sh
npm ci
# .env.example を .env.local にコピーし、自分の開発用 Supabase を設定
npm run dev
```

サービスロールキー、VAPID 秘密鍵、配信シークレットはサーバー専用。NEXT_PUBLIC_ を付けない。
本番 DB を使うと開発中の操作も本番データを変更する。通常は別の Supabase プロジェクトを使用する。

## DB の再構築

2026-10-22 に実 DB のスキーマから基準マイグレーションを作成した。
個人データ、管理者権限の所属、メッセージ、Storage のファイル、認証情報は含まない。

新しい空の Supabase プロジェクトでは、次を順に SQL Editor で実行する。

1. supabase/migrations/20261022000000_baseline.sql
2. supabase/migrations/20261022120000_atomic_corrections_and_push_claims.sql
3. supabase/migrations/20261022130000_verified_game_rewards.sql
4. supabase/seed.sql（36 種の初期バッジ設定。既存タイトルは上書きしない）

Supabase 管理の auth / storage / extensions スキーマが前提。
旧 SQL は supabase/legacy-migrations に履歴として保存した。実行順の欠落・日付バージョンの重複があるため、新環境に再適用しない。
Supabase CLI を既に使っている環境は、実 DB と基準を比較してから migration repair で基準を適用済みに登録する。既存履歴を無条件に書き換えない。

### 既存本番への更新

**baseline.sql は既存 DB に絶対に実行しない。seed.sql も通常の更新では不要。**
バックアップを確保し、120000 と 130000 の変更用 SQL だけを順番に適用してからアプリをデプロイする。
いずれもトランザクション内で実行し、既存の記録は削除しない。
新 RPC がない環境へ先にアプリだけ配信すると、履歴補正・ゲーム保存・Push 配信が失敗する。

管理者は既存管理者、またはプロジェクト所有者が public.admin_users に明示的に登録する。
公開の新規登録から管理者になる経路は用意しない。
Realtime を使用する場合は必要なテーブルを publication に追加し、各テーブルの RLS を確認する。通知・チャットにはポーリングのフォールバックもある。
Storage のバケット設定は基準 SQL に含まれる。実際の画像・添付ファイルは別途復元する。

## 認証設定

Supabase Auth の Site URL と許可 Redirect URLs に公開 URL と開発 URL を登録する。
確認メールは token_hash + type を /auth/confirm に渡すテンプレート、または PKCE の code フローを使う。
メールの配信には本番用 SMTP を設定し、送信上限と Auth ログを確認する。
アプリ側のメッセージ変更は、メールサービスの送信上限自体を解除するものではない。

Failed to fetch の場合は通信だけでなく、Supabase の停止・復元待ち・DNS・環境変数・CORS を確認する。
GET /api/health は認証サービスと DB 到達性を確認し、200 / 503 と状態のみを返す。キーやデータ行は返さない。
自動監視サービスはこのリポジトリだけでは作成されない。必要に応じてこの URL を監視先に設定する。

## 主な実装の境界

- lib/supabase: cookie ベース認証とページのセッション更新。各 API も利用者を認証する。
- lib/http/publicHtml.ts: リンクプレビュー。DNS の全解決先を検査し、接続 IP を固定。リダイレクト先も再検証し、時間・サイズ・キャッシュ数を制限。
- correct_streak_session RPC: 所有権確認、補正、監査ログを一括コミット。途中失敗時は全ロールバック。
- finalize_minigame_run RPC: サービスロールのみ。日次報酬の枠と保存を直列化し、同一リプレイの再送で二重報酬を防ぐ。
- profiles: 名前などだけ編集可能。獲得 XP・レベルの直接更新を拒否する。
- app/games/pulse-runner/gameEngine.ts: ブラウザとサーバー共通の 120Hz 判定。画面の描画 fps は記録を変えない。旧 v10 記録は保持するが v11 ランキングとは分ける。
- app/games/stack/gameEngine.ts: 操作履歴をサーバー再生。1024 操作で完了扱いとし、100 段を超えても保存できる。
- lib/push: outbox の期限付き担当確保、端末別送信済み記録、5 秒の送信タイムアウト、失効端末無効化、最大 8 試行の指数バックオフ。
- public/sw.js: notificationId ごとの重複通知抑制。配信はネットワーク上の完全な exactly-once を保証するものではない。

通知はリクエスト完了後の Next.js after() で送信を試みる。耐久性のある DB outbox は先に保存される。
GitHub Actions の Push Dispatch が 5 分ごとの回収を担当する。Repository Secret の CRON_SECRET を Vercel 側と一致させる。
GitHub の cron は遅延することがある。失敗・8 試行到達・期限切れ lease は push_outbox と配信ログを確認する。
既存の /api/push/dispatch、/api/push/send-now、/api/corn/push-dispatch は同じワーカーを使う。

## 検証

```sh
npm test
npm run lint
npm run typecheck
npm run build
npm audit --omit=dev
npm run audit:check
```

テストには実際の API ハンドラー、PGlite 上のアプリ用 SQL、補正の失敗注入、RLS/権限、通知の担当・端末再送、ゲームの全コース再生が含まれる。
PGlite テストは Supabase 管理スキーマの最小スタブを使う。実際のメール送信、Web Push、端末の向きや実機の音声は別途確認が必要。
CI は push / pull request 時に秘密鍵なしで依存監査・テスト・警告ゼロのlint・ビルドを実行する。

コース変更時は node --import tsx scripts/plan-pulse-course.mjs で通過可能な操作履歴を探索できる。
生成した fixture を更新し、通常速度・長押し・変身・空中ジャンプの回帰テストも確認する。

## 依存パッケージの注意

2026-10-22 時点で本番依存の npm audit は 0 件。
開発依存の braces には修正版が公開されていない高深度パターンによる DoS が残る（GHSA-vfj7-8cjw-p6xm）。
これは関連パッケージへの波及を含めて 7 件。未修正であり、監査結果を 0 件とは扱わない。
ブラウザ向け API が利用者のパターンをこのライブラリへ渡す実装はない。信頼できないリポジトリ内のパターンをビルドする際は注意する。
信頼できないコードやファイルを本番の権限・秘密鍵を持つ環境でビルドしない。
`npm run audit:check` は本番の全指摘と新しい開発依存の指摘で失敗する。
例外はこの advisory、確認済みの開発依存 7 パッケージの場所、braces 3.0.3 に限定し、2026-11-21 UTC に失効する。
失効時は上流の修正版を再確認し、更新・テストする。自動延長しない。通信失敗も成功扱いにしない。
確認先: https://github.com/advisories/GHSA-vfj7-8cjw-p6xm と https://github.com/micromatch/braces/issues/84 。
audit fix --force による Next のダウングレードや Tailwind の無検証なメジャー更新はしない。
postcss-selector-parser は overrides で修正版を固定し、実ビルドで互換性を検証する。

lint の外部 API 同期・SSR 後初期化の限定除外には理由を記載している。規則全体は無効化しない。
画像は next/image を使用し、固定アバターの表示寸法を予約する。
private / 署名付き添付画像・外部 OGP 画像は unoptimized とし、公開の画像最適化サーバーへ転送しない。
添付画像は自然な縦横比を反映し、拡大表示は object-contain で全体を表示する。

## リリース前の確認

1. 開発用 DB でマイグレーションとテストを確認。
2. 本番バックアップと変更用 SQL の適用を確認。
3. テスト・lint・型検査・ビルド成功を確認。
4. デプロイ後に /api/health、ログイン、履歴補正、ゲーム記録、通知を確認。
5. 問題時は前のデプロイへ戻す。追加列・RPC は旧コードと共存するため、DB の削除による巻き戻しは不要。
