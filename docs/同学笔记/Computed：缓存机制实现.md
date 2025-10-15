# 从零到一打造 Vue3 响应式系统 Day 22 - Computed：缓存机制实现

在上一篇文章中，我们提到将通过「缓存」机制来解决 `computed` 在访问时重复执行的问题。

在 Vue 3 的源码里，`computed` 是靠一个「脏值标记（dirty flag）」来判断是否需要重新计算的。

Computed 缓存解决方案
---------------

核心逻辑
----

在 computed 中记录脏标记：当脏标记为 true，才需要进行更新；当脏标记为 false，则表示可以走缓存。

```jsx
class ComputedRefImpl implements Dependency, Sub {
  ...
  ...
  tracking = false

  
  dirty = true

  ...
  ...
  get value() {
    if (this.dirty) {
      this.update()
    }
    ...
    ...
  }

  update() {
    ...
    ...
    try {
      this._value = this.fn()
      
      this.dirty = false
    } finally {
      endTrack(this)
      setActiveSub(prevSub)
    }
  }
}

```

回到示例，现在已经有了缓存，只执行两次。但我们又发现另一个问题：如果你把 `index.html` 设置为以下内容：

```xml
<body>
  <div id="app"></div>
  <script type="module">
    
    import { ref, computed, effect } from '../dist/reactivity.esm.js'

    const count = ref(0)

    const c = computed(() => {
      console.log('computed')
      return count.value + 1
    })

    
    
    

    console.log(c.value)
    count.value = 1

  </script>
</body>

```

你会发现 `count.value` 数值变更之后，它还是访问了 `computed`；但当依赖 `computed` 的值被变更时，我们不一定会当场访问 `computed`。

看一下官方实现，`count.value` 数值变更后，如果没有访问 `computed`，`computed` 并不会立刻求值。

![](https://p9-xtjj-sign.byteimg.com/tos-cn-i-73owjymdk6/02e73abe050b40078d3c03a7bcdd7d5e~tplv-73owjymdk6-jj-mark-v1:0:0:0:0:5o6Y6YeR5oqA5pyv56S-5Yy6IEAg5oiR5piv5pel5a6J:q75.awebp?rk3s=f64ab15b&x-expires=1761091314&x-signature=Z29erg0uD9B4whfxAOn9%2Bw4BFpE%3D)

而我们的版本会再访问一次 `computed`：

![](https://p9-xtjj-sign.byteimg.com/tos-cn-i-73owjymdk6/073f0b784fd946cf81b80493f8a0919f~tplv-73owjymdk6-jj-mark-v1:0:0:0:0:5o6Y6YeR5oqA5pyv56S-5Yy6IEAg5oiR5piv5pel5a6J:q75.awebp?rk3s=f64ab15b&x-expires=1761091314&x-signature=ujIQKC7uxAv%2FBCESv8iuBnHNtos%3D)

遇到这种情况怎么处理？可以仅做脏标记，**等下次 `computed` 被 effect 访问时再执行更新**。

```perl
// system.ts
...
...
export function processComputedUpdate(sub) {
  // 只有存在 sub.subs（effect 链表的头节点）时，才进行更新与传播
  if (sub.subs) {
    sub.update()
    propagate(sub.subs)
  }
}

export function propagate(subs) {
  let link = subs
  const queuedEffect = []

  while (link) {
    const sub = link.sub

    if (!sub.tracking) {
      if ('update' in sub) {
        // 被 effect 再次访问，计算属性需要重新计算：改脏标记
        sub.dirty = true
        processComputedUpdate(sub)
      } else {
        queuedEffect.push(sub)
      }
    }
    link = link.nextSub
  }

  queuedEffect.forEach(effect => effect.notify())
}
...
...


```

这样即可解决缓存时机的问题。但我们又发现了新的问题。

Effect 重复执行问题
-------------

```xml
<body>
  <div id="app"></div>
  <script type="module">
    
    import { ref, computed, effect } from '../dist/reactivity.esm.js'

    const count = ref(0)

    const c = computed(() => {
      console.log('computed')
      return count.value * 0
    })

    effect(() => {
      console.log(c.value)
    })

    setTimeout(() => {
      count.value = 1
    }, 1000)

  </script>
</body>

```

![](https://p9-xtjj-sign.byteimg.com/tos-cn-i-73owjymdk6/bea12607c9d94f759c58780e8650c8d9~tplv-73owjymdk6-jj-mark-v1:0:0:0:0:5o6Y6YeR5oqA5pyv56S-5Yy6IEAg5oiR5piv5pel5a6J:q75.awebp?rk3s=f64ab15b&x-expires=1761091314&x-signature=YW%2BkLWRFc8K3ZhCG9YwvaAsLMR0%3D)

现在我们看到，`computed` 执行了两次，这没问题；但 **effect 的输出值没有变化，它却也执行了两次**。如果数值没变，应只执行一次。

![](https://p9-xtjj-sign.byteimg.com/tos-cn-i-73owjymdk6/3e275b15a9224b3cb8ebb998ada1c429~tplv-73owjymdk6-jj-mark-v1:0:0:0:0:5o6Y6YeR5oqA5pyv56S-5Yy6IEAg5oiR5piv5pel5a6J:q75.awebp?rk3s=f64ab15b&x-expires=1761091314&x-signature=VKPH4uJbFkcL%2B3hpgc0OS6ZSm6M%3D)

回顾我们在 `Ref` 的实现：触发更新时，**只有新旧值不相同时**才会继续通知订阅者。在这里也用同样做法。

```kotlin

import { hasChanged } from '@vue/shared'
...
...
class ComputedRefImpl implements Dependency, Sub {
  ...
  ...
  update() {
    ...
    ...
    try {
      
      const oldValue = this._value
      
      this._value = this.fn()
      this.dirty = false
      
      return hasChanged(oldValue, this._value)
    } finally {
      endTrack(this)
      setActiveSub(prevSub)
    }
  }
}

```

保存更新前的值，用 `hasChanged` 判断数值是否改变，并用 `update` 的返回值来控制传播：

```vbscript
// system.ts
export function processComputedUpdate(sub) {
  // update 返回 true 表示数值发生变化，才继续向下触发 effect
  if (sub.subs && sub.update()) {
    propagate(sub.subs)
  }
}

```

得到期望结果：`computed` 执行两次、`effect` 仅执行一次。

![](https://p9-xtjj-sign.byteimg.com/tos-cn-i-73owjymdk6/d507b92d53c1469d81a77e44e7d6fa42~tplv-73owjymdk6-jj-mark-v1:0:0:0:0:5o6Y6YeR5oqA5pyv56S-5Yy6IEAg5oiR5piv5pel5a6J:q75.awebp?rk3s=f64ab15b&x-expires=1761091314&x-signature=9HjusEbcaMRKHEwsvzcnjv56Zto%3D)

看起来问题解决了，但这其实只是**片面的**。因为当 **effect 在一次运行中多次访问相同依赖** 时，仍会重复触发。

Effect 访问相同依赖重复触发问题
-------------------

```xml
<body>
  <div id="app"></div>
  <script type="module">
    
    import { ref, computed, effect } from '../dist/reactivity.esm.js'

    const count = ref(0)

    effect(() => {
      console.count('effect')
      console.log(count.value)
      count.value
    })

    setTimeout(() => {
      count.value = 1
    }, 1000)

  </script>
</body>

```

![](https://p9-xtjj-sign.byteimg.com/tos-cn-i-73owjymdk6/7c7318b98529468b8174414d6108aeeb~tplv-73owjymdk6-jj-mark-v1:0:0:0:0:5o6Y6YeR5oqA5pyv56S-5Yy6IEAg5oiR5piv5pel5a6J:q75.awebp?rk3s=f64ab15b&x-expires=1761091314&x-signature=vLaegYwDgw4%2FLvMhjmP8n%2BDxCR8%3D)

可以看到触发了三次。如果你查看 `count`：

```javascript
effect(() => {
  console.count('effect')
  console.log(count.value)
  count.value
})
console.log(count)

```

![](https://p9-xtjj-sign.byteimg.com/tos-cn-i-73owjymdk6/d3dbfb54653c4161b49a0d78d6e059f1~tplv-73owjymdk6-jj-mark-v1:0:0:0:0:5o6Y6YeR5oqA5pyv56S-5Yy6IEAg5oiR5piv5pel5a6J:q75.awebp?rk3s=f64ab15b&x-expires=1761091314&x-signature=n7ZZY%2BNOwdkk46bp%2BQZwlt18N34%3D)

![](https://p9-xtjj-sign.byteimg.com/tos-cn-i-73owjymdk6/88dc64694ee64edf935d32bca622e1b5~tplv-73owjymdk6-jj-mark-v1:0:0:0:0:5o6Y6YeR5oqA5pyv56S-5Yy6IEAg5oiR5piv5pel5a6J:q75.awebp?rk3s=f64ab15b&x-expires=1761091314&x-signature=nxitY8jh3mJJXLsFktY4Zj0EAJo%3D)

会发现它把同一个依赖收集了**两次**。如何解决？

![](https://p9-xtjj-sign.byteimg.com/tos-cn-i-73owjymdk6/29b911a686ae48ce92f17df1edc194e5~tplv-73owjymdk6-jj-mark-v1:0:0:0:0:5o6Y6YeR5oqA5pyv56S-5Yy6IEAg5oiR5piv5pel5a6J:q75.awebp?rk3s=f64ab15b&x-expires=1761091314&x-signature=mfEXifzVLuZCN92aTr%2FToP6qYQA%3D)

在源码中，`link` 函数里，每次建立关联之前都会遍历链表，确认是否已经建立过关联。

方法一：在 `link` 函数判断是否已建立关联
------------------------

```perl
export function link(dep, sub) {
  /**
   * 复用节点
   * sub.depsTail 为 undefined 且 sub.deps 存在时，尝试复用
   */
  const currentDep = sub.depsTail
  const nextDep = currentDep === undefined ? sub.deps : currentDep.nextDep
  // 如果 nextDep.dep 等于当前要收集的 dep，则只移动指针
  if (nextDep && nextDep.dep === dep) {
    sub.depsTail = nextDep  // 移动指针
    return
  }

  /**
   * 若 dep 与 sub 之间已建立过关联，则直接返回，避免重复收集
   */
  let existingLink = sub.deps
  while (existingLink) {
    if (existingLink.dep === dep) {
      // 已经建立过关联，直接返回
      return
    }
    existingLink = existingLink.nextDep
  }

  ...
  ...
}

```

要点：

*   先尝试“复用节点”，**再**做“是否已建立过依赖”的遍历检查；
*   如果把“已建立依赖检查”放在前面直接 return，可能导致 `depsTail` 长期保持 `undefined`，从而被错误清理。

方法二：重构脏标记（推荐更简洁）
----------------

换一种更简单的思路：**不去管是否重复建立依赖**，而是确保 **effect 在一次更新周期内只入队执行一次**。做法是对 effect 加统一的脏标记控制。

```arduino

export class ReactiveEffect {
  ...
  ...
  dirty = true 
  ...
}

```

在触发更新与结束追踪时，加入脏标记逻辑：

```perl
// system.ts
export function propagate(subs) {
  ...
  ...
  // 仅当不在执行中，且目前是“干净状态”（dirty=false）时，才入队
  if (!sub.tracking && !sub.dirty) {
    // 入队前先设置为“脏”（避免同一轮事件循环被重复入队）
    sub.dirty = true
    if ('update' in sub) {
      processComputedUpdate(sub)
    } else {
      queuedEffect.push(sub)
    }
  }
  ...
  ...
}

export function endTrack(sub) {
  sub.tracking = false // 执行结束，取消执行中标记
  const depsTail = sub.depsTail
  sub.dirty = false   // 本次 fn 执行完毕，复位为“干净”
  ...
  ...
}

```

这样，如果**多个依赖同时触发同一个 effect**，它也只会被加入队列一次：因为一旦 `dirty` 被设为 `true`，后续 `!sub.dirty` 就为 `false`，不会再次入队。`endTrack` 中把 `dirty` 复位为 `false`，表示该 effect 已经完成了本轮的最新计算。

同时，删除 `computed.ts` 中对脏标记的重复初始化，避免两边打架：

```kotlin

..
..
update() {
  ...
  ...
  try {
    const oldValue = this._value
    this._value = this.fn()
    this.dirty = false 
    return hasChanged(oldValue, this._value)
  } finally {
    endTrack(this)
    setActiveSub(prevSub)
  }
}
..
..

```

![](https://p9-xtjj-sign.byteimg.com/tos-cn-i-73owjymdk6/f8e9589eb8bc4237b0c446dd33dd4cd5~tplv-73owjymdk6-jj-mark-v1:0:0:0:0:5o6Y6YeR5oqA5pyv56S-5Yy6IEAg5oiR5piv5pel5a6J:q75.awebp?rk3s=f64ab15b&x-expires=1761091314&x-signature=bzAlf37aRXxkPzaLoJ7DzWHzA0c%3D)

### 脏标记的判断与运行流程

1.  **初始化**：一个 `effect` 在执行完毕后，`dirty` 会被设为 `false`，表示「当前是最新状态，不需要再次执行」。
2.  **触发更新**：当依赖变更时，`propagate` 会检查该 `effect` 是否为 `dirty: false`。
3.  **入队前**：只有当 `dirty` 为 `false` 时，才会将其**先置为 `true`**，然后再把 `effect` 加入待执行队列。
4.  **防重复**：由于入队前已设为 `true`，同一事件循环中即便有多个依赖触发，也只会入队一次，避免不必要的重复执行。

* * *

想了解更多 Vue 的相关知识，抖音、B站搜索我师父「远方os」，一起跟日安当同学。