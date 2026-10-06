/**
 * 数据采集事件总线。
 * api 层在采集开始/完成/失败时发布事件，
 * 状态提示条与各页面订阅事件以刷新 UI。
 */

export const SCRAPE_EVENTS = {
  START: 'start',
  COMPLETE: 'complete',
  ERROR: 'error',
}

const listeners = new Map()

export function onScrapeEvent(type, callback) {
  if (!listeners.has(type)) listeners.set(type, new Set())
  listeners.get(type).add(callback)
  return () => listeners.get(type)?.delete(callback)
}

export function emitScrapeEvent(type, payload) {
  listeners.get(type)?.forEach((cb) => cb(payload))
}

// 全局进行中的采集任务数（api 层维护，供状态条在任意页面挂载时同步）
let activeScrapes = 0

export function incActiveScrapes() {
  activeScrapes += 1
}

export function decActiveScrapes() {
  activeScrapes = Math.max(0, activeScrapes - 1)
}

export function getActiveScrapeCount() {
  return activeScrapes
}
