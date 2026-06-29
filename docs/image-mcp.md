# 画像生成MCP（Nano Banana / Gemini）セットアップ

DNAプロンプト → 画像生成 → 立ち絵PNG保存 → マニフェスト更新 を **Claude Code内で一気通貫**にするための、
ローカルMCPサーバ。Google Gemini の画像モデル（Nano Banana 2 = Gemini 3 Pro Image など）を直接叩く。

```
tools/image-mcp/
  server.mjs     # MCPサーバ本体（generate_image ツールを公開）
  package.json   # 依存: @google/genai, @modelcontextprotocol/sdk
.mcp.json        # Claude Code への登録（プロジェクトスコープ）
```

## なぜNano Bananaか
Nano Banana系（Gemini画像）は**キャラクターの一貫性**と**参照画像での編集/合成**が非常に強く、
`dna/` のキャラ設定を保ったまま複数表情・複数メンバーを揃えるのに向く。`generate_image` は
`referenceImagePaths` を渡せるので、確定した1枚を参照に他の差分を生成して一貫性をさらに高められる。

## セットアップ手順（ローカル）
1. **APIキー取得**: [Google AI Studio](https://aistudio.google.com/apikey) で `GEMINI_API_KEY` を発行。
2. **依存インストール**:
   ```bash
   cd tools/image-mcp && npm install && cd ../..
   ```
3. **キーを環境変数に**（Claude Codeを起動するシェルで）:
   ```bash
   export GEMINI_API_KEY="ya29...."        # ご自身のキー
   # 任意: モデルIDを明示（Nano Banana 2 の正確なIDをAI Studioで確認して上書き可）
   # export IMAGE_MODEL="gemini-3-pro-image-preview"
   ```
   > `.mcp.json` は `${GEMINI_API_KEY}` を参照するだけ。**キーはリポジトリに入りません**。
4. **Claude Codeを再起動**（このプロジェクトで）。起動時に `image-gen` MCPサーバの利用承認を求められるので許可。
   - 確認: `/mcp` で `image-gen` が `connected` になっていればOK。

## 使い方
セットアップ後、私（Claude Code）にこう頼めば一気通貫で生成します：

> 「`npm run prompts` を最新化して、RYO/KEN/MIO/GO の normal 表情を生成して `public/assets/chars/` に保存、`assets.ts` をPNGに差し替えて」

内部的には `dna/prompts.generated.json` のプロンプトを使い、`image-gen` の `generate_image` を
`outPath: public/assets/chars/ryo.v1.normal.png` のように呼び出す。一貫性重視なら、まず各メンバーの
基準1枚を作り、それを `referenceImagePaths` に渡して残りの表情を生成する。

## モデルIDについて
`IMAGE_MODEL` 既定は `gemini-3-pro-image-preview`（Nano Banana 2 / Gemini 3 Pro Image）。
IDは更新されることがあるので、エラー時はAI Studioで現行IDを確認して `IMAGE_MODEL` を差し替える。
旧Nano Banana（安定）は `gemini-2.5-flash-image`。

## 透過背景の注意
Geminiの透過出力は安定しないことがある。当面は「plain solid background」で生成し、必要なら
背景除去（後段で `rembg` 等の工程を追加）で透過化する想定。立ち絵は中央・全身・足元下端で生成する。
