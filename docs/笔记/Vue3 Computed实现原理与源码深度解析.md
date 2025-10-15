# Vue3 Computed 实现原理与源码深度解析

## 概述

Vue3 的 `computed` 是响应式系统中的核心组件，它具有**双重角色**：既是**订阅者（Sub）**，也是**依赖项（Dependency）**。这种设计使得 computed 能够在响应式数据变化时自动更新，同时为其他 effect 提供响应式数据源。

本文将深入分析 Vue3 中 computed 的实现原理，包括其缓存机制、调度逻辑和性能优化策略。

## 核心设计理念

### 1. 双重角色机制

```typescript
class ComputedRefImpl implements Dependency, Sub {
  // 作为 Dependency：管理订阅者
  subs: Link | undefined        // 订阅者链表头节点
  subsTail: Link | undefined    // 订阅者链表尾节点
  
  // 作为 Sub：管理依赖项
  deps: Link                    // 依赖项链表头节点
  depsTail: Link               // 依赖项链表尾节点
  tracking = false             // 是否正在收集依赖
}
```

**作为订阅者（Sub）**：
- 收集其 getter 函数中访问的所有响应式依赖
- 当依赖变化时，接收通知并重新计算

**作为依赖项（Dependency）**：
- 当 effect 访问 `computed.value` 时，将该 effect 收集为订阅者
- 当自身值变化时，通知所有订阅者更新

### 2. 惰性计算与缓存机制

```typescript
class ComputedRefImpl {
  dirty = true  // 脏标记：true 表示需要重新计算
  _value        // 缓存的计算结果
  
  get value() {
    // 只有在 dirty 为 true 时才重新计算
    if (this.dirty) {
      this.update()
    }
    // 建立与当前 activeSub 的依赖关系
    if (activeSub) {
      link(this, activeSub)
    }
    return this._value
  }
}
```

**核心优势**：
- **惰性计算**：只有在被访问时才执行计算
- **缓存复用**：相同依赖状态下直接返回缓存值
- **按需更新**：只有依赖变化时才标记为 dirty

## 实现细节分析

### 1. computed 函数入口

```typescript
export function computed(getterOptions) {
  let getter, setter
  
  if (isFunction(getterOptions)) {
    // 传入函数：只读 computed
    getter = getterOptions
  } else {
    // 传入对象：可读写 computed
    getter = getterOptions.get
    setter = getterOptions.set
  }
  
  return new ComputedRefImpl(getter, setter)
}
```

**设计特点**：
- 支持函数和对象两种参数形式
- 灵活的 getter/setter 配置
- 统一的 ComputedRefImpl 实现

### 2. 依赖收集机制

```typescript
update() {
  // 保存当前 activeSub，处理嵌套场景
  const prevSub = activeSub
  // 将自己设为 activeSub，开始收集依赖
  setActiveSub(this)
  startTrack(this)
  
  try {
    const oldValue = this._value
    this._value = this.fn()  // 执行 getter，触发依赖收集
    
    // 返回值变化检测，用于优化传播
    return hasChange(oldValue, this._value)
  } finally {
    endTrack(this)           // 清理过期依赖
    setActiveSub(prevSub)    // 恢复之前的 activeSub
  }
}
```

**关键流程**：
1. **上下文保存**：保存当前 activeSub，支持嵌套 computed
2. **依赖收集**：执行 getter 时自动收集访问的响应式数据
3. **值变化检测**：比较新旧值，优化不必要的传播
4. **依赖清理**：移除不再使用的依赖关系

### 3. 调度与传播机制

#### processComputedUpdate 函数

```typescript
export function processComputedUpdate(sub) {
  // 只有值真正发生变化时才继续传播
  if (sub.subs && sub.update()) {
    propagate(sub.subs)  // 通知所有订阅者
  }
}
```

#### propagate 函数的 computed 处理

```typescript
export function propagate(subs) {
  let link = subs
  let queuedEffect = []

  while (link) {
    const sub = link.sub
    
    // 防重复入队：只有非执行中且干净状态的 sub 才处理
    if (!sub.tracking && !sub.dirty) {
      sub.dirty = true  // 标记为脏，防止重复入队
      
      if ('update' in sub) {
        // computed：立即处理并继续传播
        processComputedUpdate(sub)
      } else {
        // effect：加入队列批量处理
        queuedEffect.push(sub)
      }
    }
    
    link = link.nextSub
  }

  // 批量执行 effect
  queuedEffect.forEach(effect => effect.notify())
}
```

**调度策略**：
- **computed**：立即更新并传播（同步）
- **effect**：加入队列批量执行（异步）
- **防重复**：通过 dirty 标记避免同一轮更新中的重复处理

### 4. 脏标记生命周期

```typescript
// 初始状态
dirty = true

// 触发更新时
sub.dirty = true  // 在 propagate 中设置

// 计算完成后
sub.dirty = false // 在 endTrack 中重置
```

**状态转换**：
1. **初始化**：`dirty = true`，需要首次计算
2. **依赖变化**：`dirty = true`，标记需要重新计算
3. **计算完成**：`dirty = false`，进入缓存状态
4. **访问时**：检查 dirty 决定是否重新计算

## 性能优化策略

### 1. 值变化检测优化

```typescript
update() {
  try {
    const oldValue = this._value
    this._value = this.fn()
    
    // 只有值真正变化时才返回 true
    return hasChange(oldValue, this._value)
  } finally {
    // ...
  }
}
```

**优化效果**：
- 避免因依赖变化但结果不变而触发的无效更新
- 减少下游 effect 的不必要执行

### 2. 防重复入队机制

```typescript
if (!sub.tracking && !sub.dirty) {
  sub.dirty = true  // 入队前先标脏
  // 处理逻辑...
}
```

**解决问题**：
- 同一个 effect 在一次更新中多次访问相同依赖
- 多个依赖同时变化触发同一个 effect
- 确保每个 effect 在一轮更新中只执行一次

### 3. 依赖清理优化

```typescript
export function endTrack(sub) {
  sub.tracking = false
  sub.dirty = false  // 重置脏标记
  
  const depsTail = sub.depsTail
  
  // 清理不再需要的依赖关系
  if (depsTail) {
    if (depsTail.nextDep) {
      clearTracking(depsTail.nextDep)
      depsTail.nextDep = undefined
    }
  } else if (sub.deps) {
    clearTracking(sub.deps)
    sub.deps = undefined
  }
}
```

**清理策略**：
- 移除不再访问的依赖关系
- 避免内存泄漏
- 提高后续收集效率

## 完整执行流程示例

### 场景：count → computed → effect

```javascript
const count = ref(0)
const doubled = computed(() => count.value * 2)
effect(() => console.log(doubled.value))

// 1秒后
count.value = 1
```

### 执行流程分析

#### 初始化阶段

1. **创建 computed**：
   ```typescript
   const doubled = new ComputedRefImpl(() => count.value * 2)
   // doubled.dirty = true
   ```

2. **创建 effect**：
   ```typescript
   effect(() => console.log(doubled.value))
   // 立即执行，访问 doubled.value
   ```

3. **首次计算**：
   ```typescript
   // doubled.get value()
   if (this.dirty) {  // true
     this.update()    // 执行计算
   }
   // 建立 effect → doubled 的依赖关系
   link(doubled, effect)
   ```

4. **依赖收集**：
   ```typescript
   // doubled.update()
   setActiveSub(doubled)
   this._value = this.fn()  // count.value * 2
   // 建立 count → doubled 的依赖关系
   ```

#### 更新阶段

1. **触发更新**：
   ```typescript
   count.value = 1  // 触发 count 的 setter
   ```

2. **传播到 computed**：
   ```typescript
   propagate(count.subs)  // 包含 doubled
   // doubled.dirty = true
   processComputedUpdate(doubled)
   ```

3. **computed 重新计算**：
   ```typescript
   doubled.update()
   // oldValue = 0, newValue = 2
   // hasChange(0, 2) = true
   ```

4. **传播到 effect**：
   ```typescript
   propagate(doubled.subs)  // 包含 effect
   effect.notify()  // 执行 effect
   ```

## 高级特性

### 1. 嵌套 computed 支持

```typescript
const a = ref(1)
const b = computed(() => a.value * 2)
const c = computed(() => b.value + 1)
```

**实现机制**：
- 通过 `prevSub` 保存和恢复 `activeSub`
- 支持任意层级的 computed 嵌套
- 正确的依赖链传播

### 2. 可写 computed

```typescript
const fullName = computed({
  get() {
    return `${firstName.value} ${lastName.value}`
  },
  set(value) {
    [firstName.value, lastName.value] = value.split(' ')
  }
})
```

**设计特点**：
- getter 负责计算逻辑
- setter 负责反向更新依赖
- 保持响应式特性

### 3. 错误处理

```typescript
update() {
  try {
    this._value = this.fn()
  } finally {
    endTrack(this)
    setActiveSub(prevSub)
  }
}
```

**容错机制**：
- try-finally 确保清理逻辑执行
- 异常不会破坏响应式系统状态
- 保证 activeSub 正确恢复

## 与 Vue2 的对比

### Vue2 computed 特点
- 基于 Watcher 实现
- 依赖 Dep 和 Watcher 的观察者模式
- 相对简单的缓存机制

### Vue3 computed 优势
- **更精确的依赖追踪**：基于链表的精确依赖管理
- **更好的性能**：优化的脏标记和批量更新
- **更强的类型支持**：TypeScript 原生支持
- **更灵活的调度**：支持自定义调度器

## 最佳实践建议

### 1. 合理使用 computed

```typescript
// ✅ 好的实践：纯计算逻辑
const fullName = computed(() => `${firstName.value} ${lastName.value}`)

// ❌ 避免：副作用操作
const badComputed = computed(() => {
  console.log('side effect')  // 副作用
  return someValue.value
})
```

### 2. 避免循环依赖

```typescript
// ❌ 避免：循环依赖
const a = computed(() => b.value + 1)
const b = computed(() => a.value + 1)  // 循环依赖
```

### 3. 优化计算复杂度

```typescript
// ✅ 好的实践：缓存复杂计算
const expensiveValue = computed(() => {
  return heavyCalculation(data.value)
})

// ❌ 避免：每次都重新计算
const badValue = () => heavyCalculation(data.value)
```

## 总结

Vue3 的 computed 实现体现了现代响应式系统的精妙设计：

1. **双重角色**：既是依赖收集者，也是依赖提供者
2. **惰性计算**：按需计算，避免不必要的开销
3. **精确缓存**：基于脏标记的高效缓存机制
4. **智能调度**：区分 computed 和 effect 的不同处理策略
5. **性能优化**：值变化检测、防重复入队、依赖清理等多重优化

这种设计不仅保证了功能的正确性，更在性能和可维护性方面达到了很好的平衡，是响应式系统设计的典型范例。