# Vue3 Effect函数执行问题分析与解决方案

## 问题描述

在实现Vue3响应式系统的过程中，我们发现了一个关键问题：当响应式数据更新时，`effect`函数的执行次数呈指数级增长。具体表现为：每次点击按钮（触发响应式数据更新）时，`console.log('effect')`的打印次数会成倍增加。

测试代码如下：

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Title</title>
    <style>
      body {
        padding: 150px;
      }
    </style>
  </head>
  <body>
    <button id="btn">按钮</button>
    <script type="module">
      import { ref, effect } from '../dist/reactivity.esm.js'

      const flag = ref(true)

      effect(() => {
        flag.value
        console.count('effect')
      })

      btn.onclick = () => {
        flag.value = !flag.value
      }
    </script>
  </body>
</html>
```

## 问题分析

### 执行流程分析

#### 初始化阶段
1. 页面加载时，`effect`函数执行一次
2. 执行过程中读取`flag.value`，触发getter进行依赖收集
3. 系统创建一个`link1`节点，将`effect`与`flag`关联起来

#### 第一次点击按钮
1. `flag.value`从`true`变为`false`，触发setter
2. setter内的`propagate`函数遍历`flag`的依赖链表
3. `propagate`执行`link1`中存储的`effect.run()`
4. **问题出现**：`effect`函数重新执行，又读取了`flag.value`，再次触发getter
5. 系统创建了新的`link2`节点并添加到链表尾部

#### 第二次点击按钮
1. 链表上已有两个节点(`link1`和`link2`)
2. `propagate`先执行`link1`中的`effect.run()`，创建新的`link3`节点
3. `propagate`接着执行`link2`中的`effect.run()`，创建新的`link4`节点
4. 链表长度从2变为4

#### 后续点击
每次点击，链表长度都会翻倍，导致`effect`执行次数呈指数级增长。

### 根本原因

1. **重复依赖收集**：每次`effect`执行时都会重新收集依赖，而没有检查该`effect`是否已经在依赖链表中
2. **没有清理旧依赖**：在`effect`重新执行前，没有清理之前收集的依赖
3. **链表无限增长**：导致依赖链表在每次更新时都会成倍增长

## 解决方案（单一依赖）

要解决这个问题，我们采用了两大步骤：

### 1. 建立反向依赖链表

创建一个新的链表，让effect知道自己已经订阅过哪些ref。这样形成一个双向的追踪关系：
- Ref知道哪些effect依赖它（通过subs链表）
- Effect知道它依赖哪些ref（通过deps链表）

#### 三个关键角色

**Effect**
- `effect.deps`链表：通过link，记录该effect依赖了哪些ref
- `effect.depsTail`：记录链表尾部，以便可以快速增加新的链表节点

**Ref**
- `ref.subs`链表：通过link，记录有哪些effect订阅了此ref
- `ref.subsTail`：记录链表尾部，以便可以快速增加新的链表节点

**Link：双向桥梁节点**
- 核心属性：
  - `link.sub`：指向发起的订阅者(effect)
  - `link.dep`：指向被订阅的ref
- 在Effect链表中的位置：
  - `link.nextDep`：指向effect.deps链表的下一个节点
- 在Ref链表中的位置：
  - `link.nextSub/prevSub`：指向ref.subs链表的下/上一个节点

### 2. 实现节点复用机制

每次effect重新执行时，我们需要判断是"第一次执行"还是"重新执行"，并复用已有的链表节点。

#### 状态标记

我们利用effect上的头节点deps与尾节点depsTail来设定三种状态：

1. **初始状态**（从未执行过依赖收集）：effect的deps链表是空的，deps和depsTail都是undefined
2. **重新执行中**（需要复用节点）：我们将depsTail临时设为undefined，但保留deps头节点
3. **执行完成**（链表更新完成）：deps和depsTail都有值（指向Link节点）

#### 关键代码实现

**在effect.ts中设置重新执行状态**：
```typescript
run() {
  const prevSub = activeSub
  activeSub = this

  // 开始执行，将尾节点设为undefined，进入"重新收集"状态
  this.depsTail = undefined
  
  try {
    return this.fn()
  } finally {
    // ...
  }
}
```

**在system.ts中实现节点复用（初始版本）**：
```typescript
export function link(dep, sub) {
  /**
   * 复用节点
   * 如果sub.depsTail是undefined，并且存在sub.deps头节点，表示需要复用
   */
  if (sub.depsTail === undefined && sub.deps) {
    let currentDep = sub.deps
    // 遍历effect的旧依赖链表
    while(currentDep){
      // 如果当前遍历到的旧依赖link所连接的ref，与当前要连接的ref相等
      if (currentDep.dep === dep) {
        // 表示之前已经收集过此依赖，直接复用
        sub.depsTail = currentDep // 移动尾节点指针，指向刚刚复用的节点
        return  // 直接返回，不再新增节点
      }
      currentDep = currentDep.nextDep
    }
  }
  
  // 创建新节点的逻辑...
}
```

## 多依赖问题与优化

### 多依赖场景下的问题

当effect函数依赖多个响应式变量时，我们发现上述解决方案仍然存在问题。例如：

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Title</title>
    <style>
      body {
        padding: 150px;
      }
    </style>
  </head>
  <body>
    <button id="btn">按钮</button>
    <script type="module">
      import { ref, effect } from '../dist/reactivity.esm.js'

      const flag = ref(true)
      const count = ref(0)

      effect(() => {
        flag.value
        count.value
        console.count('effect')
      })

      btn.onclick = () => {
        count.value++
      }
    </script>
  </body>
</html>
```

在这个例子中，effect函数同时依赖flag和count两个响应式变量。当点击按钮触发count更新时，依赖收集再次出现了指数级增长。

### 问题分析

初始版本的link函数存在以下问题：

1. **检查范围过小**：复用逻辑只检查并比对依赖链表的第一个节点(sub.deps)
2. **状态提前改变**：一旦第一个依赖（例如flag）复用成功，depsTail就被赋值，导致后续依赖（例如count）在检查时跳过了复用检查，直接创建新的Link节点

### 优化解决方案

我们需要将depsTail从一个简单的"尾部标记"升级为"遍历进度指针"，用于标记当前复用检查进行到了链表的哪个位置。

#### 优化后的link函数实现：

```typescript
export function link(dep, sub) {
  // 复用节点
  const currentDep = sub.depsTail
  // 核心逻辑：根据currentDep是否存在，来决定下一个要检查的节点
  const nextDep = currentDep === undefined ? sub.deps : currentDep.nextDep
  // 如果nextDep存在，且nextDep.dep等于我当前要收集的dep
  if (nextDep && nextDep.dep === dep) {
    sub.depsTail = nextDep // 移动指针
    return
  }
  
  // 创建新节点的逻辑...
}
```

### 执行流程（多依赖场景）

1. **初始化**：
   - effect执行，depsTail = undefined
   - 读取flag.value，调用link()
   - nextDep = sub.deps（因为depsTail为undefined）
   - 创建新的Link1节点（因为是首次执行）
   - depsTail = Link1
   - 读取count.value，调用link()
   - nextDep = Link1.nextDep（因为depsTail为Link1）
   - 创建新的Link2节点（因为Link1.nextDep为undefined）
   - depsTail = Link2

2. **点击按钮更新count**：
   - effect重新执行，depsTail被设为undefined
   - 读取flag.value，调用link()
   - nextDep = sub.deps（因为depsTail为undefined）
   - 复用Link1节点（因为Link1.dep === flag）
   - depsTail = Link1
   - 读取count.value，调用link()
   - nextDep = Link1.nextDep = Link2（因为depsTail为Link1）
   - 复用Link2节点（因为Link2.dep === count）
   - depsTail = Link2

通过这种方式，我们成功解决了多依赖场景下的指数级增长问题。

## 过期依赖清理问题

在解决了链表节点指数级增长的问题后，我们还需要关注依赖的有效性。Effect的执行路径可能因为条件判断或程序逻辑不同而改变，导致某些依赖在本次执行中已经不再需要。如果这些"过期依赖"没有被清理，会带来以下问题：

1. **内存泄漏**：不需要的链表节点一直被保留
2. **不必要的更新**：Effect虽然已经不依赖某个ref，但这个ref的变化仍然会触发effect
3. **性能下降**：随着时间累积，无效链表节点越来越多，增加整体执行成本

### 场景一：条件型依赖

考虑以下代码：

```html
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
  <button id="flagBtn">update flag</button>
  <button id="nameBtn">update name</button>
  <button id="ageBtn">update age</button>
  <script type="module">
    import { ref, effect } from '../dist/reactivity.esm.js'

    const flag = ref(true)
    const name = ref('姓名')
    const age = ref(18)

    effect(() => {
      console.count('effect')

      if(flag.value){
        app.innerHTML = name.value
      } else {
        app.innerHTML = age.value
      }
    })

    flagBtn.onclick = () => {
      flag.value = !flag.value
    }
    nameBtn.onclick = () => {
      name.value = '姓名' + Math.random()
    }
    ageBtn.onclick = () => {
      age.value++
    }
  </script>
</body>
</html>
```

#### 预期行为

- 如果flag是true，点击name按钮会触发更新，点击age按钮不会触发更新
- 如果flag是false，点击age按钮会触发更新，点击name按钮不会触发更新

#### 实际情况

- 初始化：输出effect: 1，此时flag是true
- 点击update flag：effect更新，输出effect: 2，此时flag变为false
- 点击update name：我们期望它没有反应，但effect仍然被更新，输出effect: 3

#### 问题分析

1. 初始化时，effect依赖了flag和name
2. 点击update flag后，effect重新执行，此时只依赖flag和age
3. 但name的订阅者链表中仍然保留着对effect的引用
4. 导致name更新时，仍然会触发effect执行

### 场景二：提前返回 (Early Return)

考虑以下代码：

```javascript
const flag = ref(true)
const name = ref('姓名')
const age = ref(18)
let count = 0

effect(() => {
  console.count('effect')

  if(count > 0) return
  count++

  if(flag.value){
    app.innerHTML = name.value
  } else {
    app.innerHTML = age.value
  }
})
```

#### 预期行为

effect只会触发两次（因为count > 0会返回，之后无论如何点击按钮都不应再触发）

#### 实际情况

即使遇到return，点击name按钮，console.count('effect')仍然一直触发更新

#### 问题分析

1. 初始化时，effect依赖了flag和name
2. 第一次更新后，count变为1
3. 之后的更新中，effect函数体内的if(count > 0)会导致提前返回
4. 但由于没有清理过期依赖，flag和name的变化仍然会触发effect执行

## 分支切换依赖清理的实现方案

为了解决上述过期依赖问题，我们实现了一个完整的依赖清理机制，主要通过以下三个关键函数：

### 1. startTrack 和 endTrack 函数

在effect.ts中，我们在run方法中添加了startTrack和endTrack的调用：

```typescript
run() {
  const prevSub = activeSub
  activeSub = this
  
  // 开始追踪依赖，将depsTail设为undefined
  startTrack(this)
  
  try {
    return this.fn()
  } finally {
    // 结束追踪，清理过期依赖
    endTrack(this)
    activeSub = prevSub
  }
}
```

### 2. system.ts中的实现

在system.ts中，我们实现了startTrack、endTrack和clearTracking三个核心函数：

```typescript
// 开始追踪，将depsTail设为undefined，进入"重新收集"状态
export function startTrack(sub){
  sub.depsTail = undefined
}

// 结束追踪，清理过期依赖
export function endTrack(sub) {
  const depsTail = sub.depsTail

  /**
   * 情况一：depsTail存在，并且depsTail的nextDep存在
   * 表示后续链表节点应该移除（这些节点在本次执行中没有被访问到）
   */
  if (depsTail) {
    if (depsTail.nextDep) {
      clearTracking(depsTail.nextDep)
      depsTail.nextDep = undefined
    }
  // 情况二：depsTail不存在，但旧的deps头节点存在
  // 清除所有节点（本次执行中没有访问任何依赖）
  } else if (sub.deps) {
    clearTracking(sub.deps)
    sub.deps = undefined
  }
}

/**
 * 清理依赖函数链表
 */
function clearTracking(link: Link){
  while(link){
    const { prevSub, nextSub, dep, nextDep} = link

    /**
     * 1. 如果上一个节点存在，就把它的nextSub指向当前节点的下一个节点
     * 2. 如果没有上一个节点，表示是头节点，那就把dep.subs指向当前节点的下一个节点
     */
    if(prevSub){
      prevSub.nextSub = nextSub
      link.nextSub = undefined
    }else{
      dep.subs = nextSub
    }

    /**
     * 1. 如果下一个节点存在，就把它的prevSub指向当前节点的上一个节点
     * 2. 如果没有下一个节点，表示是尾节点，那就把dep.subsTail指向当前节点的上一个节点
     */
    if(nextSub){
      nextSub.prevSub = prevSub
      link.prevSub = undefined
    }else{
      dep.subsTail = prevSub
    }

    // 清除引用，帮助垃圾回收
    link.dep = link.sub = undefined
    link.nextDep = undefined

    // 移动到下一个节点
    link = nextDep
  }
}
```

### 3. 清理机制的工作原理

1. **标记阶段**：
   - 在effect执行前，startTrack将depsTail设为undefined
   - 执行过程中，通过link函数复用或创建新的依赖节点，并更新depsTail

2. **清理阶段**：
   - 执行结束后，endTrack检查依赖链表状态
   - 如果depsTail存在，清理depsTail之后的所有节点（这些节点在本次执行中没有被访问到）
   - 如果depsTail不存在但deps存在，清理整个deps链表（本次执行没有访问任何依赖）

3. **节点移除**：
   - clearTracking函数负责从链表中移除节点
   - 同时维护双向链表的完整性，更新前后节点的引用
   - 清除节点的引用，帮助垃圾回收

### 4. 应用场景示例

#### 条件分支场景

```javascript
effect(() => {
  if(flag.value){
    app.innerHTML = name.value  // 分支1
  } else {
    app.innerHTML = age.value   // 分支2
  }
})
```

- 初始化时flag为true，依赖链表为：flag → name
- 点击flagBtn后flag变为false，执行分支2
- 新的依赖链表为：flag → age
- endTrack检测到name不再被依赖，从name的订阅者链表中移除effect
- 此后name变化不会再触发effect执行

#### 提前返回场景

```javascript
effect(() => {
  if(count > 0) return
  count++
  // 后续代码...
})
```

- 第二次执行时，遇到return提前返回
- 没有访问任何依赖，depsTail保持undefined
- endTrack检测到deps存在但depsTail不存在，清理整个deps链表
- 此后任何依赖变化都不会触发effect执行

## 对象池优化（Object Pool）

在完成了依赖清理机制后，我们发现了一个新的性能问题：当依赖频繁变化时，系统需要不断地创建和销毁Link节点。每次建立依赖关系都会触发内存分配，频繁的分配/释放会导致：

1. **垃圾回收(GC)压力增大**：GC执行得越频繁，就越可能造成应用程序的短暂卡顿
2. **内存碎片化**：频繁处理和释放小块内存，可能导致内存空间中出现大量不连续的内存碎片
3. **性能下降**：内存管理本身的开销

### Object Pool设计模式

对象池（Object Pool）是一种设计模式，用于管理和复用对象，以避免频繁创建和销毁对象带来的性能损耗。

与其在需要时创建、在用完时销毁，不如将可复用的对象统一管理起来，实现循环利用。这个对象池就像一个"仓库"，预先存放一批可以重复使用的对象。当需要对象时从池中取出，使用完毕后放回到池中，而不是销毁它。

这样可以达到：
- **复用已分配的内存**：避免了大量的内存分配操作
- **减少垃圾回收次数**：降低对主线程的干扰

### LinkPool实现

LinkPool采用单向链表结构，并且依照后进先出（LIFO）的原则。主要是因为入池、出池都只需要对头节点进行操作，时间复杂度为O(1)，效率很高。

#### LinkPool生命周期

1. **初始化**：linkPool池是空的，什么都还没运行，没有可回收的节点
2. **移除Link2节点**：通过endTrack(sub)判定有"尾段过期"→调用clearTracking(Link2)，Link2被回收到池中
3. **移除Link1节点**：通过endTrack(sub)再次判定有"尾段过期"→调用clearTracking(Link1)，Link1被回收到池中，并排在Link2前面
4. **复用Link1**：执行link(dep, sub)，这次if(linkPool)为true，走复用分支，从池中取出Link1进行复用

#### 关键代码实现

**在link函数中添加对象池逻辑**：

```typescript
export function link(dep, sub) {
  const currentDep = sub.depsTail
  const nextDep = currentDep === undefined ? sub.deps : currentDep.nextDep
  if (nextDep && nextDep.dep === dep) {
    sub.depsTail = nextDep
    return
  }

  let newLink: Link

  /**
   * 查看linkPool是否存在，如果存在，表示有可复用的节点
   */
  if (linkPool) {
    newLink = linkPool
    linkPool = linkPool.nextDep // 池指针后移
    newLink.nextDep = nextDep
    newLink.dep = dep
    newLink.sub = sub
  } else {
    /**
     * 如果linkPool不存在，表示没有可复用的节点，那就创建一个新节点
     */
    newLink = {
      sub,
      dep,
      nextDep,
      nextSub: undefined,
      prevSub: undefined
    }
  }

  // 后续链表操作保持不变...
}
```

**在clearTracking函数中添加回收逻辑**：

```typescript
function clearTracking(link: Link) {
  while (link) {
    const { prevSub, nextSub, dep, nextDep } = link

    // 从双向链表中移除节点的逻辑...
    if (prevSub) {
      prevSub.nextSub = nextSub
      link.nextSub = undefined
    } else {
      dep.subs = nextSub
    }

    if (nextSub) {
      nextSub.prevSub = prevSub
      link.prevSub = undefined
    } else {
      dep.subsTail = prevSub
    }

    // 清除引用
    link.dep = undefined
    link.sub = undefined

    /**
     * 把不再需要的节点放回linkPool中，以备复用
     */
    link.nextDep = linkPool
    linkPool = link

    // 移动到下一个节点
    link = nextDep
  }
}
```

### 对象池的优势

1. **内存复用**：避免频繁的内存分配和释放操作
2. **减少GC压力**：降低垃圾回收的频率，减少应用卡顿
3. **提高性能**：O(1)时间复杂度的入池和出池操作
4. **减少内存碎片**：重复使用相同大小的内存块

通过对象池机制，Link节点的生命周期从"用完即毁"变成了"循环再生"，从根本上解决了因动态依赖而产生的频繁内存分配与回收问题。

## 总结

Vue3响应式系统中的effect函数执行问题是由于依赖收集机制不完善导致的。我们通过四步优化解决了这个问题：

1. **建立双向依赖链表**：让effect知道它依赖哪些ref，同时让ref知道哪些effect依赖它
2. **实现节点复用机制**：
   - 初始版本：仅检查链表头节点，解决单一依赖场景
   - 优化版本：使用depsTail作为遍历进度指针，解决多依赖场景
3. **过期依赖清理**：
   - 通过startTrack和endTrack标记依赖收集的开始和结束
   - 使用clearTracking函数移除不再需要的依赖
   - 解决条件型依赖和提前返回场景下的问题
4. **对象池优化**：
   - 通过LinkPool实现Link节点的复用
   - 采用LIFO结构，提供O(1)时间复杂度的操作
   - 减少内存分配/释放，降低GC压力

这些优化确保了响应式系统的高效运行，避免了不必要的性能开销和内存泄漏，是Vue3响应式系统设计中的关键优化点。