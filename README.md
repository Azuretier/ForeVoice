# Discord AI Voice Bot with Gemini 2.0

Gemini 2.0 Flash Multimodal Live API を使用した、リアルタイムで会話ができる Discord ボイスチャット Bot です。低遅延なマルチモーダル体験を Discord 上で提供します。

---

## 🚀 機能
- **リアルタイム音声会話**: Gemini 2.0 Flash の高速なレスポンスを利用したスムーズな対話。
- **Multimodal Live API 対応**: 音声だけでなく、将来的な拡張性も備えた最新の API 構成。
- **TypeScript 構成**: 型安全な開発環境。

## 🛠 準備するもの
- [Node.js](https://nodejs.org/) (v18以上推奨)
- [Discord Bot Token](https://discord.com/developers/applications): BotのMessage Content Intentを有効にする必要があります。
- [Google Gemini API Key](https://aistudio.google.com/app/apikey): Gemini 2.0 Flash が利用可能なキーが必要です。

## 📦 セットアップ

1. **リポジトリをクローン**
   ```bash
   git clone https://github.com/Azuretier/ForeVoice.git
   cd ForeVoice
   ```

2. **依存関係のインストール**
   ```bash
   npm install
   ```

3. **環境変数の設定**
   プロジェクトのルートディレクトリに `.env` ファイルを作成し、以下の項目を設定してください。

   ```env
   # Discord設定
   DISCORD_TOKEN=あなたのDiscordボットトークン

   # Gemini API設定
   GEMINI_API_KEY=あなたのGeminiAPIキー
   ```

## 🏃 起動方法

開発モード（ts-node）で起動する場合：
```bash
npx ts-node src/index.ts
```

## 📝 注意事項
- **トークンの管理**: APIキーやトークンは機密情報です。公開しないようにしましょう。
- **API利用制限**: Gemini 2.0 の利用には Google AI Studio の利用規約が適用されます。

## 📄 ライセンス
[MIT](LICENSE)