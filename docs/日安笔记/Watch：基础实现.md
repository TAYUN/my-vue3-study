# 从零到一打造 Vue3 响应式系统 Day 23 - Watch：基础实现

`watch` 是 Vue 中非常重要的一个 API，它允许开发者在响应式数据发生变化时，执行特定的副作用（side effects）。这些副作用可以是异步行为（例如发起请求），也可以是基于状态变化而执行的复杂逻辑。

在实现之前，我们先回顾一下 `effect` 的实现。当时我们设计了一个 Scheduler（调度器）。而 `watch` 的核心原理正是基于 `effect` 的调度器机制。

调度器的设计目标是：当响应式数据变更时，不直接重新执行 `effect` 主体函数，而是执行一个指定的调度函数。

细节可以参考之前的文章。

核心概念
----

`watch` 本质上是 `effect` 的一种应用。它利用调度器机制，实现了「监听数据变化并执行指定回调函数」的功能。

*   effect：当数据发生变化时，本身会重新执行。
*   watch：当数据发生变化时，不执行本身，而是调用一个自定义函数，并在该函数内部执行用户提供的 callback。

Watch
-----

参数：

*   source：要监听的源
*   cb：回调函数
*   options：配置项，如 `deep`、`immediate`、`once`

返回值：一个函数，用于停止监听。

基础实现
----

我们新建一个 `watch.ts` 文件并导出。

实现 `watch` 时，我们直接使用 `ReactiveEffect` 类，而不是 `effect` 函数。

原因是：`effect` 函数返回的是一个 `runner`，我们无法直接拿到内部 `fn` 的返回值。但通过 `ReactiveEffect` 实例，可以调用 `effect.run()` 来获得返回值。

```jsx
export function effect(fn, options) {

  const e = new ReactiveEffect(fn)

  Object.assign(e, options)

  e.run()

  const runner = e.run.bind(e)

  runner.effect = e

  return runner 
}

```

然而 ReactiveEffect 类需要传入一个函数，但 source 不一定是函数，它可能是一个 ref 对象。因此我们需要用 getter 包装：

```jsx
import { isRef } from './ref'
import { ReactiveEffect } from './effect'

export function watch(source, cb, options) {

  let getter 

  if(isRef(source)) { 
    getter = () => source.value
  }

  
   * 使用 ReactiveEffect 而不是 effect 函数，
   * 因为 effect 没有返回 effect.run() 的返回值
   */
  const effect = new ReactiveEffect(getter) 
}

```

接下来定义 job 函数，它作为 effect 的调度器。当监听的数据变化时，job 被触发，主要步骤如下：

1.  获取新值：调用 effect.run()，执行 getter，得到最新值 newValue。
2.  执行回调：调用用户传入的 cb(newValue, oldValue)。
3.  更新旧值：将 newValue 赋值给 oldValue，为下次更新做准备。

```jsx
import { isRef } from './ref'
import { ReactiveEffect } from './effect'

export function watch(source, cb, options) {

  let getter 

  if(isRef(source)) {
    getter = () => source.value
  }

  let oldValue

  function job() {
    
    const newValue = effect.run()
    cb(newValue, oldValue)

    oldValue = newValue
  }

  const effect = new ReactiveEffect(getter)

  effect.scheduler = job

  oldValue = effect.run() 

  return () => {} 
}

```

在 `index.html` 测试：

```jsx
複製程式碼
<body>
  <div id="app"></div>
  <script type="module">
    import { ref, watch } from '../dist/reactivity.esm.js'

    const count = ref(0)

    watch(count, (newVal, oldVal) => {
      console.log('newVal, oldVal', newVal, oldVal)
    })

    setTimeout(() => {
      count.value = 1
    }, 1000)

  </script>
</body>

```

![](https://p6-xtjj-sign.byteimg.com/tos-cn-i-73owjymdk6/2880464b9d8943f593e3f6e4acd34621~tplv-73owjymdk6-jj-mark-v1:0:0:0:0:5o6Y6YeR5oqA5pyv56S-5Yy6IEAg5oiR5piv5pel5a6J:q75.awebp?rk3s=f64ab15b&x-expires=1760573338&x-signature=WRWYHyLBzyzN%2FiTOtSxvqNG%2FQrI%3D)

### 初始化过程

*   watch 内部创建一个 `effect` 来监听 count
*   effect 会立即执行一次，主要目的：
    1.  注册依赖：访问 `count.value`，让 watch 开始追踪 count 的后续变化
    2.  获取初始值：读取当前值 0 并存储到 oldValue
*   注意：`console.log` 在此阶段不会执行。

### 更新时（1 秒后 setTimeout）

*   `count.value` 被更新为 1
*   触发内部 effect，执行的是自定义的 scheduler
*   scheduler 即 job 函数，运行逻辑：
    1.  调用 `effect.run()` 拿到新值 1
    2.  执行用户传入的回调，传入 `(newValue: 1, oldValue: 0)`
    3.  输出 `newVal, oldVal 1 0`
    4.  更新 `oldValue = 1`

停止监听
----

之前返回的 `stop` 还没实现，现在补上：

```jsx
<body>
  <div id="app"></div>
  <script type="module">
    import { ref, watch } from '../dist/reactivity.esm.js'

    const count = ref(0)

    const stop = watch(count, (newVal, oldVal) => {
      console.log('newVal, oldVal', newVal, oldVal)
    })

    setTimeout(() => {
      count.value = 1
      setTimeout(() => {
        stop()
        count.value = 2
      }, 1000)
    }, 1000)

  </script>
</body>

```

![](https://p6-xtjj-sign.byteimg.com/tos-cn-i-73owjymdk6/d7cfb292dbf94e2d9bf1188be5b77b57~tplv-73owjymdk6-jj-mark-v1:0:0:0:0:5o6Y6YeR5oqA5pyv56S-5Yy6IEAg5oiR5piv5pel5a6J:q75.awebp?rk3s=f64ab15b&x-expires=1760573338&x-signature=VbiHuuLtIM8gjyfC97uWY2V7fuM%3D)

如果我们希望第二次更新不再触发，需要实现 `stop` 方法。

给 effect 增加 active 标记

*   在 `run` 方法里，如果没有 `active` 标记，就只返回 fn 的值，不收集依赖。
*   在类中增加 `stop` 方法：
    *   核心：清理当前 `effect` 上收集的所有依赖
    *   做法：调用 `startTrack(this)` 再 `endTrack(this)`，清除所有依赖
    *   最后将 `active = false`，彻底停止追踪

![](https://p6-xtjj-sign.byteimg.com/tos-cn-i-73owjymdk6/0181c8d71d554e40abe8ab4299b1e210~tplv-73owjymdk6-jj-mark-v1:0:0:0:0:5o6Y6YeR5oqA5pyv56S-5Yy6IEAg5oiR5piv5pel5a6J:q75.awebp?rk3s=f64ab15b&x-expires=1760573338&x-signature=1QZskOIGyh099ckpcXdiKpEoLHY%3D)
 effect.ts

```jsx
export class ReactiveEffect implements Sub {

  active = true 
  
  run() {
    if(!this.active) {
      return this.fn()
    }
    ...
  }

  stop() {
    if(this.active) {
      startTrack(this)
      endTrack(this)
      this.active = false
    }
  }
}

```

在 `watch.ts` 返回 stop：

```jsx
export function watch(source, cb, options) {
  ...
  function stop() {
    effect.stop()
  }
  return () => {
    stop()
  }
}

```

这样就能正确停止监听。

### 总结

我们通过 ReactiveEffect 类及其调度器机制，实现了一个基础版的 watch。

关键点：

1.  job 拦截更新，调用 `effect.run()` 获取新旧值
2.  调用用户回调 `(newValue, oldValue)`
3.  增加 `stop` 方法，实现手动停止监听

下一篇会探讨 watch 的 options 配置实现。

* * *

想了解更多 Vue 的相关知识，抖音、B站搜索我师父「远方os」，一起跟日安当同学。