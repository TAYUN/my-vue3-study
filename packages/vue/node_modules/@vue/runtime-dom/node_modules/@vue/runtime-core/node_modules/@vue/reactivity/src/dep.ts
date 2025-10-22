import { Link, link, propagate } from './system'
import { activeSub } from './effect'

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
  const targetIsArray = Array.isArray(target)
  // 此处处理修改 lenght 导致的副作用
  if (targetIsArray && key === 'length') {
    const newLength = target.length
    /**
     * 一开始：['a', 'b', 'c', 'd'] length = 4
     * 更新后：['a', 'b'] length = 2
     */
    depsMap.forEach((dep, depKey) => {
      // 这里depKey可能是字符串数字 depKey >= newLength会隐式转成数字进行比较
      if (depKey === 'length' || depKey >= newLength) {
        // 通知更新
        //  疑问：这里会不会有多次触发点问题，一次循环，多次触发，有必要吗
        // propagete中有脏标记dirty，能确保同一个effect在同一轮循环中只执行一次
        propagate(dep.subs)
      }
    })
  } else {
    // 看一下之前有没有收集过这个 key
    let dep = depsMap.get(key)

    if (!dep) {
      //  如果这个 key 没收集过，直接返回
      return
    }

    // 通知更新
    propagate(dep.subs)
  }
}
