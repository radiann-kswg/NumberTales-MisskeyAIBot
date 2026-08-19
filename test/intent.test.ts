import { describe, it, expect } from 'vitest';
import { classifyIntent } from '../dist/bot/classifier/intent.js';

/**
 * 実機バグ（2026-07-21）で判明したタスク意図分類の取りこぼしに対する回帰ガード。
 * 実際に投稿された4文面が正しく task-add / task-list に分類され、かつ紛らわしい文面が
 * 誤爆しないことを固定化する。
 */
describe('classifyIntent — タスク意図分類の回帰ガード', () => {
  const cases: [string, string][] = [
    // 実機で報告された文面（修正前は chat に落ちていた）
    ['タスク「ナンバーテールズの会話パターン追加」を優先度「中」難易度「普通」期限「無し」で追加して', 'task-add'],
    ['あと、タスク「Botの新機能実装」も優先度「高」難易度「難」期限「今週金曜終日まで」で追加して', 'task-add'],
    ['タスクの一覧は確認できる？', 'task-list'],
    ['タスク一覧を教えて', 'task-list'],
    // 誤爆しないこと（質問・否定形・完了・キャンセル・タスク非関連の追加・既存list・無関係intent）
    ['タスク追加のやり方を教えて', 'chat'],
    ['そのタスクはもう追加しなくていいよ', 'chat'],
    ['資料をまとめるのが終わった', 'task-done'],
    ['タスク3番をキャンセル', 'task-cancel'],
    ['写真をアルバムに追加して', 'chat'],
    ['進捗を教えて', 'task-list'],
    ['ポーカーやって', 'game-poker'],
    // F-14 親密度照会
    ['78とどれくらい仲良し？', 'affinity-check'],
    ['仲良し度ランキングを教えて', 'affinity-check'],
    ['誰と一番仲良し？', 'affinity-check'],
    // F-16 計算問題チャレンジ。素の式計算（calculate）に吸われないことを固定化する
    ['計算問題出して', 'game-calc-quiz'],
    ['むずかしい計算問題出して', 'game-calc-quiz'],
    ['計算チャレンジ', 'game-calc-quiz'],
    ['連続正解チャレンジやろう', 'game-calc-quiz'],
    ['ナンバーテールズ計算問題', 'game-calc-quiz'],
    ['暗算問題', 'game-calc-quiz'],
    ['12+5を計算して', 'calculate'],
  ];

  it.each(cases)('%s → %s', (text, expected) => {
    expect(classifyIntent(text).intent).toBe(expected);
  });
});
