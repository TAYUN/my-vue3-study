# 从零到一打造 Vue3 响应式系统 Day 21 - Computed：即时更新基础实现

今天我们要在**保持既有链表架构不变**的前提下，实现 `computed` 的**惰性计算 + 缓存（dirty 旗标）**与**调度**逻辑。

示例演示
----

```jsx
<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8" />
  <title>Document</title>
  <style>
    body {
      padding: 150px;
    }
  </style>
</head>

<body>
  <div id="app"></div>
  <script type="module">
    import { ref, computed, effect } from '../../../node_modules/vue/dist/vue.esm-browser.js'
    

    const count = ref(0)

    const c = computed(() => {
      return count.value + 1
    })

    effect(() => {
      console.log(c.value)
    })

    setTimeout(() => {
      console.log(count.value)
    }, 1000)

  </script>
</body>

</html>

```

先看官方代码的效果：

![](https://p9-xtjj-sign.byteimg.com/tos-cn-i-73owjymdk6/fbba334520d74f8085fb564f181edf6f~tplv-73owjymdk6-jj-mark-v1:0:0:0:0:5o6Y6YeR5oqA5pyv56S-5Yy6IEAg5oiR5piv5pel5a6J:q75.awebp?rk3s=f64ab15b&x-expires=1760493187&x-signature=EAdHN7dDuAQ1qO%2BNeCUY7wEEHM0%3D)

可以看到控制台会先输出 `1`，再输出 `2`，其中的 `computed` 只在**需要时**重算（惰性）。

执行顺序如下：

### 初始化

*   初始化变量：`count`、`c`
*   初始化 `effect`，立即执行 `console.log(c.value)`
*   收集 `computed` 依赖，触发计算函数 `() => count.value + 1`
*   读取 `count.value`，函数返回 `0 + 1`，结果为 `1`，输出 `1`

### 一秒之后

*   执行 `count.value = 1`
    
*   Vue 侦测到 `count` 的值从 `0` 变为 `1`
    
*   当 `count.value` 被修改时，会通知所有订阅它的对象，此处包含 `c`
    
*   `c` 接到通知后，**重新计算**自己的值，并接着**通知**所有订阅 `c` 的对象（即 `effect`），最终触发 `effect` 重新执行
    
*   `effect` 收到通知，自动重新执行其内部函数：`() => console.log(c.value)`
    
    *   `effect` 再次读取 `c.value`
    *   重新执行计算函数 `() => count.value + 1`
    *   此时 `count.value` 已为 `1`
    *   `c` 计算出新值 `1 + 1 = 2`，输出 `2`

在这个过程中，`computed` 扮演的角色如下图所示：

![](https://p9-xtjj-sign.byteimg.com/tos-cn-i-73owjymdk6/fc225f8fd17a401a9ab4b6d4cd101d61~tplv-73owjymdk6-jj-mark-v1:0:0:0:0:5o6Y6YeR5oqA5pyv56S-5Yy6IEAg5oiR5piv5pel5a6J:q75.awebp?rk3s=f64ab15b&x-expires=1760493187&x-signature=9QpQT4C%2F0BtEoZLA89rYr7Wm3%2FY%3D)

设计核心
----

首先，`computed` 具有**双重角色**：

*   **订阅者（Sub）** ：会收集其执行函数（getter）中访问到的所有响应式依赖。
    
*   **依赖项（Dep）** ：当 `effect` 访问 `computed.value` 时，`computed` 会把这个 `effect` 收集起来，建立关联。
    
*   `computed` 的入参既可能是**函数**，也可能是**对象**：
    
    *   若为函数：只有 `getter`（只读 `computed`）
    *   若为对象：同时包含 `getter` 与 `setter`

什么是 Sub？什么是 Dep？可参考我们之前定义的接口：

```typescript

 * 依赖项
 */
export interface Dependency {
  
  subs: Link | undefined
  
  subsTail: Link | undefined
}

 * 订阅者
 */
export interface Sub {
  
  deps: Link | undefined
  
  depsTail: Link | undefined
  
  tracking: boolean
}

```

**Sub 特征**

*   有 `deps` 头节点
*   有 `depsTail` 尾节点
*   有“是否正在收集依赖”的标记

**Dep 特征**

*   有 `subs` 头节点
*   有 `subsTail` 尾节点
*   必定是响应式实体（`ref` 或 `reactive`）

实现
--

先在 `@vue/shared` 新增一个类型判断函数：

```javascript
export function isFunction(value) {
  return typeof value === 'function'
}

```

由于 `computed` 的入参可能是函数或对象，我们新增 `computed.ts` 并导出 `computed` 函数，用来判定入参类型：

*   传入函数：表示只有 getter（只读）
*   传入对象：表示同时有 getter 与 setter

```objectivec
export function computed(getterOptions) {
  let getter
  let setter
  if (isFunction(getterOptions)) {
    getter = getterOptions
  } else {
    getter = getterOptions.get
    setter = getterOptions.set
  }

  
  return new ComputedRefImpl(getter, setter)
}

```

接着实现 `ComputedRefImpl` 类，并把 Dep 与 Sub 所需的属性加上：

```kotlin
class ComputedRefImpl implements Dependency, Sub {
  
  [ReactiveFlags.IS_REF] = true

  
  _value

  
  subs: Link
  subsTail: Link

  
  deps: Link
  depsTail: Link
  tracking = false

  constructor(
    public fn, 
    private setter
  ) { }
  get value() {
    this.update()
    return this._value
  }
  set value(newValue) {
    
    if (this.setter) {
      this.setter(newValue)
    } else {
      console.warn('computed is readonly')
    }
  }

  update(){
    this._value = this.fn()
  }
}

```

运行这段代码，表面看能正确计算结果：

![](https://p9-xtjj-sign.byteimg.com/tos-cn-i-73owjymdk6/25dcbedef0184ffc9603203355f58a62~tplv-73owjymdk6-jj-mark-v1:0:0:0:0:5o6Y6YeR5oqA5pyv56S-5Yy6IEAg5oiR5piv5pel5a6J:q75.awebp?rk3s=f64ab15b&x-expires=1760493187&x-signature=fx0VPluVbr0sQLiaGygoEX%2BEIf4%3D)

但目前 `get value()` **每次读取都会直接 `update()`** ，尚未引入缓存/dirty。多次读值或多个 `effect` 时会反复计算。

我们刚才提到 `computed` 有双重角色；那如何让 `computed` 同时扮演 **Dep** 与 **Sub** 呢？回顾先前的链表/依赖逻辑：

当 `Computed` 作为 Dep
-------------------

![](https://p9-xtjj-sign.byteimg.com/tos-cn-i-73owjymdk6/32e14af81f844c2dbc2d993cf79048d0~tplv-73owjymdk6-jj-mark-v1:0:0:0:0:5o6Y6YeR5oqA5pyv56S-5Yy6IEAg5oiR5piv5pel5a6J:q75.awebp?rk3s=f64ab15b&x-expires=1760493187&x-signature=PlSPrCZKYlhhNlKg%2F3%2Bo%2B8HetZ0%3D)

先在 `get value()` 里与当前的 `activeSub` 建立关联（`link(this, activeSub)`），并**仅在 dirty 时**调用 `update`，避免每次读值都重算。

```kotlin
class ComputedRefImpl implements Dependency, Sub {
 ...
 ...
  get value() {
    this.update()
    if(activeSub){
      link(this,activeSub)
    }
    console.log('computed',this)
    return this._value
  }
  ...
  ...
}

```

接着在控制台确认是否正常收集到 `fn`：

![](https://p9-xtjj-sign.byteimg.com/tos-cn-i-73owjymdk6/9f16c33371c1435397288f97fded567a~tplv-73owjymdk6-jj-mark-v1:0:0:0:0:5o6Y6YeR5oqA5pyv56S-5Yy6IEAg5oiR5piv5pel5a6J:q75.awebp?rk3s=f64ab15b&x-expires=1760493187&x-signature=ZtSwsqeM4dS%2BBUg0f7QQm75%2F6pM%3D)

看起来已正确保存 `fn`，表明关联关系已建立。  
我们已完成下图红色区域的链接：

![](https://p9-xtjj-sign.byteimg.com/tos-cn-i-73owjymdk6/272b8c604758430e8f3e98b70decac68~tplv-73owjymdk6-jj-mark-v1:0:0:0:0:5o6Y6YeR5oqA5pyv56S-5Yy6IEAg5oiR5piv5pel5a6J:q75.awebp?rk3s=f64ab15b&x-expires=1760493187&x-signature=xoLz7wKMlrUjqmS%2FdGjTsrbFY2Q%3D)

当 `Computed` 作为 Sub
-------------------

![](https://p9-xtjj-sign.byteimg.com/tos-cn-i-73owjymdk6/d96db1447079498f8fc1a4f6c8b71e7e~tplv-73owjymdk6-jj-mark-v1:0:0:0:0:5o6Y6YeR5oqA5pyv56S-5Yy6IEAg5oiR5piv5pel5a6J:q75.awebp?rk3s=f64ab15b&x-expires=1760493187&x-signature=OUL2gt1sAONswHEFmzaV0b3w67w%3D)

在 `fn` 执行期间需要收集访问到的响应式依赖。我们沿用此前的 `setActiveSub` / `startTrack` / `endTrack` 机制，无需改动 `effect` 架构；只需在 `ComputedRefImpl.update()` 内部包一层收集区段。

（回顾 effect 运行逻辑）

```javascript
export function setActiveSub(sub) {
  activeSub = sub
}

export class ReactiveEffect {
...
run() {
    const prevSub = activeSub
    setActiveSub(this)
    startTrack(this)

    try {

      return this.fn()

    } finally {
      endTrack(this)
      setActiveSub(prevSub)
    }
  }
...
...
}

```

通过 `setActiveSub` 重新赋值 `activeSub`，在 `computed.ts` 引入并使用：

```kotlin
import { activeSub, setActiveSub } from './effect'
...
...
update(){

    
    const prevSub = activeSub
    setActiveSub(this)
    startTrack(this)

    try {
      this._value =  this.fn()

    } finally {
      endTrack(this)
      setActiveSub(prevSub)
      console.log(this)
    }
  }
...
...

```

在控制台中可以看到 dep 也被成功保存：

![](https://p9-xtjj-sign.byteimg.com/tos-cn-i-73owjymdk6/92035b51e4454ce5baa7e6192b1c76c1~tplv-73owjymdk6-jj-mark-v1:0:0:0:0:5o6Y6YeR5oqA5pyv56S-5Yy6IEAg5oiR5piv5pel5a6J:q75.awebp?rk3s=f64ab15b&x-expires=1760493187&x-signature=4A0aPgJ7bdXlRGZ4fuaz%2BKhfdEI%3D)

因此，下图红圈处也已完成：

![](https://p9-xtjj-sign.byteimg.com/tos-cn-i-73owjymdk6/5625f361d20443169a4f72b317320836~tplv-73owjymdk6-jj-mark-v1:0:0:0:0:5o6Y6YeR5oqA5pyv56S-5Yy6IEAg5oiR5piv5pel5a6J:q75.awebp?rk3s=f64ab15b&x-expires=1760493187&x-signature=MYfOx6l1pRA2zkv%2BJ%2FtFnLk0W4I%3D)

报错
--

但你会发现一个错误：

![](https://p9-xtjj-sign.byteimg.com/tos-cn-i-73owjymdk6/d07370e0fdf34e85a6dd537274697e06~tplv-73owjymdk6-jj-mark-v1:0:0:0:0:5o6Y6YeR5oqA5pyv56S-5Yy6IEAg5oiR5piv5pel5a6J:q75.awebp?rk3s=f64ab15b&x-expires=1760493187&x-signature=dEefzy%2BSQegbq12DfJQfGUVRbXw%3D)

原因是 `Ref` 在 `setTimeout` 触发更新时会执行 `setter`：

```scss
...
...
set value(newValue) {
    if(hasChanged(newValue, this._value)){
      this._value = isObject(newValue) ? reactive(newValue) : newValue
      triggerRef(this)
    }
}
...

```

然而执行到 `propagate` 函数时：

```ini
export function propagate(subs) {
  let link = subs
  let queuedEffect = []

  while (link) {
    const sub = link.sub

    // 只有不在执行中的才加入队列
    if(!sub.tracking){
      queuedEffect.push(sub)
    }
    link = link.nextSub
  }

  queuedEffect.forEach(effect =>effect.notify())
}

```

`propagate` 预期所有 `sub` 都有 `run()`（或可调度的接口），但我们的 `ComputedRefImpl` 并没有这个方法。

目前我们已分别完成两段链路：

*   让 `computed` 成为 `count` 的订阅者（Sub）
*   让 `computed` 成为 `effect` 的依赖项（Dep）

![](https://p9-xtjj-sign.byteimg.com/tos-cn-i-73owjymdk6/adf136a67abb45f682224a80d86d662e~tplv-73owjymdk6-jj-mark-v1:0:0:0:0:5o6Y6YeR5oqA5pyv56S-5Yy6IEAg5oiR5piv5pel5a6J:q75.awebp?rk3s=f64ab15b&x-expires=1760493187&x-signature=5rmbx0I60m5TnkLj3n8Xsi0MZkU%3D)

![](https://p9-xtjj-sign.byteimg.com/tos-cn-i-73owjymdk6/d4fef32221e040698295eaf29f218cee~tplv-73owjymdk6-jj-mark-v1:0:0:0:0:5o6Y6YeR5oqA5pyv56S-5Yy6IEAg5oiR5piv5pel5a6J:q75.awebp?rk3s=f64ab15b&x-expires=1760493187&x-signature=xHtgjbfDhUP2KvNOwyeWWb1zaaI%3D)

接下来需要把这两段**串起来**，形成完整的更新流程。

解决问题
----

![](https://p9-xtjj-sign.byteimg.com/tos-cn-i-73owjymdk6/21cbbf83407b40c1ae30920961272312~tplv-73owjymdk6-jj-mark-v1:0:0:0:0:5o6Y6YeR5oqA5pyv56S-5Yy6IEAg5oiR5piv5pel5a6J:q75.awebp?rk3s=f64ab15b&x-expires=1760493187&x-signature=9UGtdYGlpQDpyhTGItsj%2BSwVqiQ%3D)

触发更新时的流程应为：

*   `ref` 触发更新
*   通过 Sub 找到 `computed`
*   `computed` 执行自身更新
*   `computed` 再通过**自身的 sub 链表**
*   找到所有下游 Sub（例如 effect）并重新执行

因此我们需要：

1.  处理 `computed` 的更新
2.  让 `computed` 通过自己的 sub 链表通知其他 Sub 更新

回顾我们原本在 `computed` 内如何执行更新：

![](https://p9-xtjj-sign.byteimg.com/tos-cn-i-73owjymdk6/0bb17180b0bc4cd0852ebc1b6bcf95f0~tplv-73owjymdk6-jj-mark-v1:0:0:0:0:5o6Y6YeR5oqA5pyv56S-5Yy6IEAg5oiR5piv5pel5a6J:q75.awebp?rk3s=f64ab15b&x-expires=1760493187&x-signature=HrceJBr1xwC1BAg7AFnLdUnc5dE%3D)

此前我们在 `ComputedRefImpl` 中定义了 `update` 方法，可以用它来更新 `computed` 的值。我们增加一个辅助：

```perl
export function processComputedUpdate(sub) {
  // 通知 computed 更新
  sub.update()
  // 通知其 sub 链表中的其他 sub 更新
  propagate(sub.subs)
}

export function propagate(subs) {
  let link = subs
  let queuedEffect = []

  while (link) {
    const sub = link.sub

    if(!sub.tracking){
      // 如果 link.sub 有 update 方法，说明传入的是 computed
      if('update' in sub){
        processComputedUpdate(sub)
      }else{
        queuedEffect.push(sub)
      }
    }
    link = link.nextSub
  }

  queuedEffect.forEach(effect =>effect.notify())
}


```

这样我们就能通过“是否存在 `update` 方法”来判断 Sub 是否是 `computed`：

*   若是 `computed`：除了触发其更新函数外，还需**继续向下**通知它的 sub 链表
*   若是普通 `effect`：加入执行队列并按原逻辑 `notify()`

运行后表面上结果正确，但如果 `index.html` 这样写：

```javascript
const count = ref(0)
const c = computed(() => {
  console.count('computed')
  return count.value + 1
})

effect(() => {
  console.log(c.value)
})

setTimeout(() => {
  count.value = 1
}, 1000)

```

你会发现它触发了**三次**：

![](https://p9-xtjj-sign.byteimg.com/tos-cn-i-73owjymdk6/6a12ac6fbbaa47899b47a15e6e858761~tplv-73owjymdk6-jj-mark-v1:0:0:0:0:5o6Y6YeR5oqA5pyv56S-5Yy6IEAg5oiR5piv5pel5a6J:q75.awebp?rk3s=f64ab15b&x-expires=1760493187&x-signature=Gz3N7%2FgZE6%2FxgptmhYNpM1FrfoY%3D)

而用官方示例，实际只会执行**两次**：

![](https://p9-xtjj-sign.byteimg.com/tos-cn-i-73owjymdk6/03b18d338ede4b5380f385052fc5db61~tplv-73owjymdk6-jj-mark-v1:0:0:0:0:5o6Y6YeR5oqA5pyv56S-5Yy6IEAg5oiR5piv5pel5a6J:q75.awebp?rk3s=f64ab15b&x-expires=1760493187&x-signature=ORaAt2e6w4LYlUTkjk7WK27WBJU%3D)

问题根源在于 `get value()` 的实现：每次访问 `.value` 都**直接**触发 `update()`，没有实现**缓存**：

```csharp
 get value() {
    this.update()
    ...
    ...
  }

```

今天我们将加入**缓存与 `dirty` 标记**，并以 `notify()` 充当简易调度器：**上游变更只标脏，下游读取时才重算**。  
下篇我们会补充“同一 tick 多次读值只计算一次”以及“多层 computed 链”的范例，来确认性能与语义。

`computed` 完整代码如下（当前版本，未加 `dirty` 优化前）：

```kotlin
    import { ReactiveFlags } from './ref'
    import { Dependency, Sub, Link, link, startTrack, endTrack } from './system'
    import { isFunction } from '@vue/shared'
    import { activeSub, setActiveSub } from './effect'

    class ComputedRefImpl implements Dependency, Sub {
      
      [ReactiveFlags.IS_REF] = true
      
      _value
      
      subs: Link
      subsTail: Link

      
      deps: Link
      depsTail: Link
      tracking = false
      constructor(
        public fn, 
        private setter
      ) { }
      get value() {
        this.update()
        
        if(activeSub){
          link(this,activeSub)
        }
        return this._value
      }
      set value(newValue) {
        if (this.setter) {
          this.setter(newValue)
        } else {
          console.warn('computed is readonly')
        }
      }

      update(){
        
         * 收集依赖
         * 为了在 fn 执行期间，收集访问到的响应式
         */

        const prevSub = activeSub
        setActiveSub(this)
        startTrack(this)

        try {

          this._value =  this.fn()

        } finally {
          endTrack(this)
          setActiveSub(prevSub)
        }
      }
    }

    export function computed(getterOptions) {
      let getter
      let setter
      if (isFunction(getterOptions)) {
        getter = getterOptions
      } else {
        
        getter = getterOptions.get
        setter = getterOptions.set
      }

      return new ComputedRefImpl(getter, setter)
    }


```

* * *

想了解更多 Vue 的相关知识，抖音、B站搜索我师父「远方os」，一起跟日安当同学。