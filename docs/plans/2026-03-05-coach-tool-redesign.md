# Coach Tool Redesign — Design Document
Date: 2026-03-05

## Overview

Redesign `app/page.js` from a student-facing upload tool into a coach-facing editing and copy tool. Admin pages remain unchanged.

## Scope

- **Changed**: `app/page.js` only
- **Unchanged**: `/admin`, `/admin/students`, `/admin/students/[id]` and all related API routes

## Layout

Split-panel layout on desktop. Stacked vertically on mobile (input above, results below).

### Left Panel — Input Form

| Field | Details |
|-------|---------|
| 学籍ID / Student ID | Text input, alphanumeric, max 20 chars |
| 音声ファイル | File picker, accepts MP3/MP4/M4A up to 50MB |
| 重点ポイント | Optional textarea for focus feedback |
| 分析するボタン | Triggers transcription + analysis pipeline |

### Right Panel — Results & Editing

Shown after processing completes. Empty state shown before first run.

| Section | Behavior |
|---------|---------|
| Stats bar | WPM / 語数 / 発話時間 — read-only |
| 文字起こし | Collapsible — read-only |
| 修正ポイント | `original → revised` display (unchanged visually); explanation field is editable `<input>` |
| コーチコメント | Full editable `<textarea>` |
| [📋 LINEにコピー] | Copies formatted LINE message to clipboard |
| [リセット] | Clears all state, returns left panel to input |
| 全修正リスト | Read-only — all corrections from AI |
| 詳細フィードバック | Read-only — structure / content / improvement / recurring mistakes |

## Correction Point Design

Visual format (unchanged from current):
```
original → revised
explanation text   ← editable input
```

No × or ○ symbols. Arrow `→` between original and revised. Only the explanation is editable.

## LINE Copy Format

When coach clicks [📋 LINEにコピー], the following is copied to clipboard:

```
📌 修正ポイント
① original
  → revised
  explanation（編集後）

② ...

💬 コーチコメント
（編集後のテキスト）
```

- Header, student ID, and stats are NOT included
- Uses edited explanation and coach comment (not original AI output)
- Corrections numbered with ①②③④

## Data & Persistence

- On AI processing completion, result is auto-saved to Supabase (raw AI output)
- Coach edits are for copy only — not persisted back to Supabase
- Student is auto-registered via upsert (same as current behavior)

## States

```
idle → processing → result
                 ↓
              [reset] → idle
```

- `idle`: Left panel active, right panel shows empty state
- `processing`: Progress bar shown in right panel
- `result`: Right panel shows all sections; left panel inputs are disabled
