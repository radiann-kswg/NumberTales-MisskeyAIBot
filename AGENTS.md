# NumberTales-MisskeyAIBot — Agent Instructions

## プロジェクト概要

このリポジトリは、創作キャラクター「[ナンバーテールズ0番機 000(チトセ)](https://database.numbertales-radiann.net/pages/characters.html?work=Works_NumberTales&db=Primary&num=000&idx=000&idxKey=Num&q=)」を模した生成AIを用いた **Misskey AI Bot** の開発・アイディア整理を行うプロジェクトです。

- **Bot主人公キャラクター**: ナンバーテールズ0番機 000(チトセ) — 中性的な気質を持つ若手エンジニア肌のポータブルヒューマノイド
- **プラットフォーム**: [Misskey](https://misskey-hub.net/)（分散型SNS）
- **AI基盤**: ChatGPT / Gemini 等の生成AI API

## リポジトリ構成

```
_roleplay-datas/       # ロールプレイ用プロンプト・AI連携情報
  roleplay-prompt.md   # 000(チトセ)のキャラクター設定・命令文
  ai-link.md           # 連携中のAIサービスリンク
_rough-idea/           # アイディア検討メモ（ChatGPT/Geminiとの対話ログ）
_creations-db/         # サブモジュール: 百花繚乱研究所 創作DB
  data/                # キャラクターJSONデータ
  api/                 # 擬似API
  docs/                # ドキュメント
```

## 重要なリファレンス

- **創作DB (サブモジュール)**: [`_creations-db/`](./_creations-db/) — キャラクターデータはここのJSONを参照
- **キャラクターDB UI**: https://database.numbertales-radiann.net/pages/characters.html
- **ナンバーテールズ公式サイト**: https://www.numbertales-radiann.com/
- **000(チトセ) キャラクターページ**: https://database.numbertales-radiann.net/pages/characters.html?work=Works_NumberTales&db=Primary&num=000&idx=000&idxKey=Num&q=
- **AI連携リンク集**: [\_roleplay-datas/ai-link.md](./_roleplay-datas/ai-link.md)

## キャラクター・世界観の注意事項

- **ナンバーテールズ**は「百花繚乱研究所」制作の妖獣型ポータブルヒューマノイドシリーズ（著作権者: RadianN_kswg/ラジアン）
- キャラクターに関するコード・プロンプト生成時は [ロールプレイ設定](./_roleplay-datas/roleplay-prompt.md) を参照すること
- ガイドライン遵守が必須: 反社会的・性的表現・ヘイト行為・公式設定からの著しい逸脱は禁止
- 創作DBのライセンスは **CC BY-NC 4.0** — 商用利用不可

## Bot開発に関するコンテキスト

### 検討中のBot機能アイデア

詳細は [`_rough-idea/`](./_rough-idea/) を参照:

- **ゆる会話系**: 深夜雑談・インスタンス文化学習
- **創作支援系**: お題生成・キャラ設定補助・世界観深掘り
- **リアクション特化系**: カスタム絵文字感情妖精・リアクションBot
- **000(チトセ)固有**: 球体型/人型のモード切り替え・開発者代行キャラとしての振る舞い

### Misskey Bot実装上の注意

- 投稿文字数: インスタンスにより異なるが最大3000文字程度
- 日常会話は100文字以内を目安とし、詳細はCW(注釈)内に
- カスタム絵文字を積極活用
- ユーザー個人情報の永続保存は行わない

## サブモジュールの更新方法

```bash
# 最新データを取得する場合
git submodule update --remote _creations-db
```

## 開発スタイル

- アイディア検討は `_rough-idea/` 以下にマークダウンで記録
- ロールプレイ用プロンプトの改善は `_roleplay-datas/` 以下で管理
- キャラクターデータへの直接編集は行わず、サブモジュール経由で参照のみ行う
