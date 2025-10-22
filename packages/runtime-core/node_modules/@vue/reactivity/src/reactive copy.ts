// reactive未抽离的完整直观版本
import { hasChange, isObject } from '@vue/shared'
import { activeSub } from './effect'
import { Link, link, propagate } from './system'
import { isRef } from './ref'

export function reactive(target) {
  return createReactiveObject(target)
}
const targetMap = new WeakMap()

/**
 * S情况1：
 * 存储 target 与响应式对象的关联关系
 * key: target / value: proxy
 */
const reactiveMap = new WeakMap()

/**
 * S情况2：
 * 保存所有使用 reactive 创建的响应式对象
 * 用于检查是否被重复 reactive
 */
const reactiveSet = new Set()

// createReactiveObject 本身的限制，以及我们的需求：
// 它只能接收对象类型，所以我们要去判断它的类型。
// reactive 的核心是使用一个 Proxy 对象来处理。
// Proxy 对象中会需要 get 和 set 处理器来收集依赖、触发更新。
// 收集依赖：target 的每个属性都是一个依赖，因此我们需在收集依赖时，把 target 的属性跟 effect (也就是 sub) 建立关联关系。
// 触发更新：通知之前为该属性收集的依赖，让它们重新执行。

export function createReactiveObject(target) {
  // 不是对象, 原路返回
  if (!isObject(target)) return target
  // S情况一：原始对象传入 Reactive 对象
  // 如果这个 target 已经被 reactive 过了，直接返回已创建的 proxy
  const existingProxy = reactiveMap.get(target)
  if (existingProxy) {
    return existingProxy
  }
  // S情况二：Reactive 对象传入 Reactive
  if (reactiveSet.has(target)) {
    return reactiveMap.get(target)
  }

  const proxy = new Proxy(target, {
    get(target, key, receiver) {
      // 收集依赖：绑定 target 的属性与 effect 的关系
      track(target, key)
      const res = Reflect.get(target, key, receiver)

      // S情况五1：将包含 ref 的 Reactive 对象解构并保持同步
      if (isRef(res)) {
        // ref 传入 reactive 后，当 reactive 更新同名字段时，ref.value 也要同步更新
        return res.value
      }

      // S情况六：初始化嵌套 Reactive 对象
      if (isObject(res)) {
        // 如果 res 是对象，则将其转为响应式对象（惰性转换）
        return reactive(res)
      }
      return res
    },
    set(target, key, newValue, receiver) {
      // S情况三：Reactive 对象重复赋相同数值
      const oldValue = target[key]

      // S情况五2：将包含 ref 的 Reactive 对象解构并保持同步
      // 若把 state.a 直接换成一个新的 ref，原有变量 a 不应被动同步（这是预期的非同步）
      /**
       * const a = ref(0)
       * target = { a }
       * 当执行 target.a = 1 时，本质上是 a.value = 1
       */
      // todo 还有疑问，这里
      if (isRef(oldValue) && !isRef(newValue)) {
        oldValue.value = newValue
        // 更新了 ref 的值，ref那边已经触发了依赖effect更新，reactive这里不用再触发
        // 直接返回，避免下方 trigger 再触发一次（双重触发）
        return true
      }

      const res = Reflect.set(target, key, newValue, receiver)
      if (hasChange(newValue, oldValue)) {
        // 仅当值确实变化时才触发更新
        trigger(target, key)
      }
      return res
    },
  })
  // 缓存 target 与响应式对象的关联
  reactiveMap.set(target, proxy)

  // 记录该 proxy 已是响应式对象
  reactiveSet.add(proxy)

  return proxy
}

class Dep {
  subs: Link
  subsTail: Link
  constructor() {}
}
function track(target, key) {
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

function trigger(target, key) {
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

// 判断 target 是否为响应式对象：只要在 reactiveSet 中存在即为 true
export function isReactive(target) {
  return reactiveSet.has(target)
}

/**
 * ==================== Vue3 Reactive 核心场景处理 ====================
 * 
 * reactive 基本实现完成后，需要处理以下六种核心场景：
 */

/**
 * 【核心场景列表】
 * 1. 原始对象传入 Reactive 对象
 * 2. Reactive 对象再次传入 Reactive  
 * 3. 对 Reactive 对象重复赋相同数值
 * 4. 嵌套对象作为 ref 的值 (在 ref.ts 文件的 Ref 中处理)
 * 5. 将包含 ref 的 Reactive 对象进行解构并保持数值同步
 * 6. 初始化嵌套 Reactive 对象
 */

/**
 * 【设计原则与优化策略】
 * 
 * 🔄 缓存机制：避免重复代理与依赖分裂
 * 🏷️  身份识别：区分原始对象、代理对象与 ref
 * ⚡ 性能优化：仅在值发生变化时触发更新
 * 🎯 API 体验：在 reactive 中自动解构 ref.value，让读取更直觉
 * 🚀 惰性策略：按需把嵌套对象转为响应式，提升初始化性能
 * 🏗️  工程化：抽离 handlers，提高复用性与可维护性
 */

/**
 * 参考资料：
 * @author 我是日安
 * @link https://juejin.cn/post/7555405171385417754
 * @source 稀土掘金
 */