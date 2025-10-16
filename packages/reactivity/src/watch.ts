import { isRef } from './ref'
import { isReactive } from './reactive'
import { ReactiveEffect } from './effect'
import { isObject, isFunction } from '@vue/shared'
export function watch(source, cb, options) {
  let { immediate, once, deep } = options || {}
  let getter
  if (isRef(source)) {
    getter = () => source.value
  } else if (isReactive(source)) {
    getter = () => source
    if (!deep) {
      deep = true
    }
  } else if (isFunction(source)) {
    getter = source
  }
  let oldValue

  // 要实现 once 功能，可以对用户的 callback 做包装：先缓存原始 callback，再用一个匿名函数替换掉 cb，执行完后立刻调用 stop() 停止监听。
  if (once) {
    const _cb = cb
    cb = (...args) => {
      _cb(...args)
      stop()
    }
  }

  if (deep) {
    const baseGetter = getter
    const depth = deep === true ? Infinity : deep
    getter = () => traverse(baseGetter(), depth)
  }
  
  // 副作用清理
  let cleanup = null
  function onCleanup(cb) {
    cleanup = cb
  }

  function job() {
    if (cleanup) {
      // 执行回调前 清理上一次的 副作用函数 side effect
      cleanup()
      cleanup = null
    }
    // 运行 effect 得到新值，不能直接执行 getter，否则依赖不会收集
    const newValue = effect.run()
    cb(newValue, oldValue, onCleanup)
    oldValue = newValue
  }

  function stop() {
    effect.stop()
  }

  /**
   * 使用 ReactiveEffect 而不是 effect 函数，
   * 因为 effect 没有返回 effect.run() 的返回值, 也就拿不到newValue和oldValue，导致无法调用cb
   */
  const effect = new ReactiveEffect(getter)
  effect.scheduler = job

  // immediate 实现
  if (immediate) {
    job()
  } else {
    oldValue = effect.run()
  }

  return () => {
    stop()
  }
}

function traverse(value, depth = Infinity, seen = new Set()) {
  if (!isObject(value) || depth <= 0) {
    return value
  }
  // 解决循环引用
  if (seen.has(value)) {
    return value
  }

  seen.add(value)
  depth--

  for (const key in value) {
    traverse(value[key], depth, seen)
  }

  return value
}
