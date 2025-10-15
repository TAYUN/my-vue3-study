import { isObject } from '@vue/shared'

import { mutableHandlers } from './baseHandlers'

export function reactive(target) {
  return createReactiveObject(target)
}

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

  const proxy = new Proxy(target, mutableHandlers)
  // 缓存 target 与响应式对象的关联
  reactiveMap.set(target, proxy)

  // 记录该 proxy 已是响应式对象
  reactiveSet.add(proxy)

  return proxy
}

// 判断 target 是否为响应式对象：只要在 reactiveSet 中存在即为 true
export function isReactive(target) {
  return reactiveSet.has(target)
}

// reactive 的基本实现之后，接下来会遇到几种常见且必须处理的情况S（标记S）：

// 1.原始对象传入 Reactive 对象
// 2.Reactive 对象再次传入 Reactive
// 3.对 Reactive 对象重复赋相同数值
// 4.嵌套对象作为 ref 的值 (在ref.ts文件的Ref中处理)
// 5.将包含 ref 的 Reactive 对象进行解构并保持数值同步
// 6.初始化嵌套 Reactive 对象

// 作者：我是日安
// 链接：https://juejin.cn/post/7555405171385417754
// 来源：稀土掘金
// 著作权归作者所有。商业转载请联系作者获得授权，非商业转载请注明出处。
