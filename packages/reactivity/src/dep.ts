import { Link, link, propagate } from "./system"
import { activeSub } from "./effect"

class Dep {
  subs: Link
  subsTail: Link
  constructor() {}
}

const targetMap = new WeakMap()

export function track(target, key) {
  if (!activeSub) return
  // 通过 targetMap 获取 target 的依赖合集 (depsMap)
  let depsMap = targetMap.get(target)

  // 首次收集依赖，如果之前没有收集过，就新建一个
  // key: target (obj) / value: depsMap (new Map())
  if (!depsMap) {
    depsMap = new Map()
    targetMap.set(target, depsMap)
  }

  // 获取属性对应的 Dep，如果不存在则新建一个
  let dep = depsMap.get(key)
  // key: key (property name) / value: new Dep()
  if (!dep) {
    dep = new Dep()
    depsMap.set(key, dep)
  }

  link(dep, activeSub)
}

export function trigger(target, key) {
  const depsMap = targetMap.get(target)
  // 如果 depsMap 不存在，表示没有任何依赖被收集过，直接返回
  if (!depsMap) return

  const dep = depsMap.get(key)
  // 如果 dep 不存在，表示这个 key 没有在 effect 中被使用过，直接返回
  if (!dep) return

  // 找到依赖，触发更新
  if (dep.subs) {
    propagate(dep.subs)
  }
}

