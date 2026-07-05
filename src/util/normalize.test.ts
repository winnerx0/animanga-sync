import { describe, expect, test } from 'bun:test';
import { normalizeTitle, similarity } from './normalize.ts';

describe('normalizeTitle', () => {
  test('lowercases and strips punctuation', () => {
    expect(normalizeTitle('Re:ZERO -Starting Life in Another World-')).toBe('re zero starting life in another world');
  });
  test('collapses whitespace', () => {
    expect(normalizeTitle('  hello   world  ')).toBe('hello world');
  });
});

describe('similarity', () => {
  test('identical strings → 1', () => {
    expect(similarity('Naruto', 'Naruto')).toBe(1);
  });
  test('near-match → high', () => {
    expect(similarity('Attack on Titan', 'Attack on Titan!')).toBeGreaterThan(0.95);
  });
  test('different → low', () => {
    expect(similarity('Naruto', 'Bleach')).toBeLessThan(0.5);
  });
});
