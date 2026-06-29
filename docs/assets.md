# アセット仕様（イベント画面の差し替えガイド）

イベント画面は **背景 + 立ち絵 + テキストボックス** の3層構造（`src/ui/render.ts` の `sceneModal`）。
現状はSVGプレースホルダだが、**AI生成PNGに差し替えるのはマニフェスト1ファイルの編集だけ**で済む。

## 差し替え手順
1. 生成した画像を `public/assets/` 配下に置く（例: `public/assets/chars/ryo.png`）。
2. `src/ui/assets.ts` の対応パスを書き換える（拡張子を `.png` に変えるだけ）。
   ```ts
   export const CHAR_SRC = { RYO: `${base}assets/chars/ryo.png`, ... };
   ```
3. コード変更は不要。`npm run dev` で即反映。

## 立ち絵スペック
| 項目 | 推奨 |
|---|---|
| 形式 | PNG（**背景透過**必須） |
| サイズ | 縦長 720×1120px 程度（表示は高さ基準でスケール） |
| 構図 | 全身〜膝上の立ち姿。**正面〜やや斜め**、足元が下端 |
| 余白 | 上下に少し余白。キャラを中央寄せ |
| 比率 | 2〜3頭身のデフォルメ（パワプロ寄り）。本格頭身でも可だが統一する |

### キャラ別の見た目（一貫性のため固定）
| メンバー | パート | 髪/色 | 小物 |
|---|---|---|---|
| RYO | Vo | 黒スパイキー＋ピンク差し色 | マイク |
| KEN | Gt | 茶ロング＋金ヘッドバンド | フライングVギター |
| MIO | Ba | 紺ロングストレート | ベース |
| GO | Dr | 短髪＋緑キャップ | ドラムスティック |

### 表情差分（任意・あると良い）
シーンは `mood: normal / fired / happy / sad` を持つ。差分PNGを用意するなら
`ryo_normal.png` `ryo_fired.png` … のように分け、`assets.ts` を表情キー対応に拡張する。
※現状はmoodをCSSエフェクト（発光・揺れ・グレースケール）で表現しているので、差分なしでも動く。

## 背景スペック
| キー | 用途 | サイズ |
|---|---|---|
| `studio` | 練習シーン | 1920×1080（16:9） |
| `street` | 路上ライブ等 | 同上 |
| `venueSmall` | 小〜中規模ライブ | 同上 |
| `venueBig` | 大規模ライブ/フェス | 同上 |
| `backstage` | 開演前 | 同上 |

## キャラDNA & プロンプト生成（推奨ワークフロー）
キャラの一貫性とバージョン管理は **`dna/` 配下のYAML** で行う。

```
dna/
  _style.yaml      # 全キャラ共通の画風・品質・ネガティブ・出力スペック
  _template.yaml   # 新キャラ用テンプレート（コピー元）
  ryo.yaml ...     # 各キャラのDNA（不変の核 identity ＋ 衣装/小物/表情差分）
  prompts.generated.md / .json   # 自動生成（編集禁止）
```

- DNAの各フィールドは **そのままプロンプトに組み込まれる英語断片**。
- `npm run prompts` で `dna/*.yaml` → 完成プロンプト（＋ネガティブ＋出力ファイル名）を再生成。
- **一貫性**: `identity` は不変の核。`generation.seed`/`model` を固定して再生成すれば同じキャラが出る。
- **バージョニング**: 見た目を変えたら `version` を上げる。出力名は `{id}.v{version}.{expression}.png`（例 `ryo.v2.fired.png`）。過去verの画像を残せばロールバック可能。
- 生成した画像を `public/assets/chars/` に置き、`src/ui/assets.ts` のパスをそのファイル名に更新（バージョン付きを指す）。

### 例（`npm run prompts` の出力）
`dna/ryo.yaml` の identity/outfit/props/expressions が、共通styleと連結されて
`ryo.v1.fired.png` 用のプロンプト1本に組み上がる。全文は `dna/prompts.generated.md` を参照。

---

## AI生成プロンプト雛形（手動で書く場合の参考）
キャラの一貫性を保つため、**同一の画風・体型指定**を共通プレフィックスにし、メンバー固有部分だけ差し替える。

> 共通: `2.5-head chibi anime character, full body standing pose, front view, flat color cel shading, thick clean outline, transparent background, centered, game character sprite, metal band member`

- **RYO (Vo)**: `+ spiky black hair with a pink streak, dark studded jacket over a hot-pink shirt, holding a microphone, confident grin`
- **KEN (Gt)**: `+ long brown hair, gold headband, sleeveless, holding a gold Flying-V guitar`
- **MIO (Ba)**: `+ long straight navy hair, calm expression, blue accent outfit, holding a bass guitar`
- **GO (Dr)**: `+ short hair with a green cap, green tank top, holding drumsticks raised`

> 背景: `metal concert {stage/studio/backstage}, anime game background, no characters, 16:9, atmospheric stage lighting`

ネガティブ例: `realistic photo, extra limbs, text, watermark, cropped, background clutter`

> 一貫性のコツ: 同じseed＋同じ共通プレフィックスで4人を生成。表情差分は「同じキャラ、表情だけ変更」で追加生成する。
