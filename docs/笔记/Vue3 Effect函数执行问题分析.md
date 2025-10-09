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

## 解决方案

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

**在system.ts中实现节点复用**：
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

## 完整执行流程

### 第一次执行
1. effect初始化：deps = undefined, depsTail = undefined
2. 执行run()：进入run方法，depsTail保持undefined
3. 读取ref.value，调用link()
4. link()判断：因为deps是undefined，不满足复用条件 → 创建新的Link1节点
5. 执行结束：deps指向Link1, depsTail也指向Link1

### 第二次执行（点击按钮）
1. 执行前：deps = Link1, depsTail = Link1
2. 执行run()：进入run方法，depsTail被设为undefined，进入"重新收集"状态
3. 读取ref.value，调用link()
4. link()判断：
   - 条件满足：depsTail === undefined且deps存在
   - 开始遍历deps链表，发现deps(即Link1)的.dep属性就是当前的ref
   - 复用成功！将depsTail重新指向Link1，然后return，不再创建新节点
5. 执行结束：deps依然是Link1, depsTail也恢复为Link1

## 总结

通过建立双向依赖链表和实现节点复用机制，我们成功解决了effect函数执行次数呈指数级增长的问题。这种设计体现了Vue3响应式系统的精妙之处：

1. **双向追踪**：不仅让响应式对象知道哪些effect依赖它，也让effect知道它依赖哪些响应式对象
2. **状态标记**：通过巧妙设置depsTail状态来标记effect的执行阶段
3. **节点复用**：避免重复创建链表节点，保持依赖关系的稳定性

这种实现方式确保了响应式系统的高效运行，避免了不必要的性能开销，是Vue3响应式系统设计中的一个关键优化点。