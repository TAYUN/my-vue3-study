# Vue3 Watch实现原理与源码深度解析

## 📖 概述

`watch` 是 Vue3 响应式系统中的核心 API，它允许开发者在响应式数据发生变化时执行特定的副作用（side effects）。本文档深入解析 `watch` 的实现原理，从基础实现到高级配置选项，全面剖析其设计思想和技术细节。

## 🎯 核心设计理念

### 1. 基于 Effect 的调度机制

`watch` 本质上是 `effect` 的一种特殊应用：

- **effect**：当数据发生变化时，重新执行自身
- **watch**：当数据发生变化时，不执行自身，而是调用用户提供的回调函数

这种设计通过调度器（Scheduler）机制实现，当响应式数据变更时，不直接重新执行 `effect` 主体函数，而是执行指定的调度函数。

### 2. 监听源的多样性

`watch` 支持多种类型的监听源：
- **ref 对象**：监听 `ref.value` 的变化
- **reactive 对象**：监听整个响应式对象的变化
- **getter 函数**：监听函数返回值的变化
- **数组**：同时监听多个源的变化

## 🔧 基础实现原理

### 1. 核心架构设计

```typescript
export function watch(source, cb, options) {
  let getter 
  
  // 根据 source 类型创建对应的 getter
  if(isRef(source)) {
    getter = () => source.value
  } else if(isReactive(source)) {
    getter = () => source
    if(!deep) deep = true  // reactive 默认深度监听
  } else if(isFunction(source)) {
    getter = source
  }
  
  let oldValue
  
  // 副作用清理机制
  let cleanup = null
  function onCleanup(cb) {
    cleanup = cb
  }
  
  // 调度函数：数据变化时的执行逻辑
  function job() {
    if (cleanup) {
      // 执行回调前清理上一次的副作用函数
      cleanup()
      cleanup = null
    }
    
    const newValue = effect.run()        // 获取新值
    cb(newValue, oldValue, onCleanup)    // 执行用户回调，传入 onCleanup
    oldValue = newValue                  // 更新旧值
  }
  
  // 创建 ReactiveEffect 实例
  const effect = new ReactiveEffect(getter)
  effect.scheduler = job
  
  // 初始化：收集依赖并获取初始值
  oldValue = effect.run()
  
  // 返回停止函数
  return () => effect.stop()
}
```

### 2. 为什么使用 ReactiveEffect 而不是 effect 函数？

关键原因是**返回值获取**：
- `effect` 函数返回的是 `runner`，无法直接获取内部 `fn` 的返回值
- `ReactiveEffect` 实例可以通过 `effect.run()` 直接获得返回值

这对于 `watch` 获取新旧值至关重要。

### 3. 依赖收集与调度流程

#### 初始化阶段
1. 创建 `ReactiveEffect` 实例，传入 `getter` 函数
2. 设置 `scheduler` 为 `job` 函数
3. 执行 `effect.run()` 进行依赖收集并获取初始值
4. 将初始值存储为 `oldValue`

#### 更新阶段
1. 监听的响应式数据发生变化
2. 触发依赖更新，执行 `scheduler`（即 `job` 函数）
3. `job` 函数调用 `effect.run()` 获取新值
4. 执行用户回调 `cb(newValue, oldValue)`
5. 更新 `oldValue = newValue`

### 4. 停止监听机制

```typescript
// ReactiveEffect 类中的 stop 方法
export class ReactiveEffect implements Sub {
  active = true
  
  run() {
    if(!this.active) {
      return this.fn()  // 不收集依赖，只返回值
    }
    // ... 正常的依赖收集逻辑
  }
  
  stop() {
    if(this.active) {
      startTrack(this)   // 开始清理
      endTrack(this)     // 清除所有依赖
      this.active = false // 标记为非活跃
    }
  }
}
```

停止监听的核心是：
1. 清理当前 `effect` 收集的所有依赖关系
2. 设置 `active = false`，后续 `run()` 不再收集依赖
3. 彻底断开与响应式数据的连接

## ⚙️ 高级配置选项

### 1. immediate - 立即执行

```typescript
if(immediate) {
  job()  // 立即执行一次，oldValue 为 undefined
} else {
  oldValue = effect.run()  // 只收集依赖，不执行回调
}
```

**实现原理**：
- `immediate: true` 时，初始化后立即调用 `job()` 函数
- 此时 `oldValue` 为 `undefined`，`newValue` 为当前值
- `immediate: false` 时，只进行依赖收集，不触发回调

### 2. once - 单次执行

```typescript
if(once) {
  const _cb = cb
  cb = (...args) => {
    _cb(...args)  // 执行原始回调
    stop()        // 立即停止监听
  }
}
```

**实现原理**：
- 包装用户的原始回调函数
- 在执行完用户回调后，立即调用 `stop()` 停止监听
- 确保回调只执行一次

### 3. onCleanup - 副作用清理

`onCleanup` 是 `watch` 回调函数的第三个参数，用于注册清理函数，解决副作用冲突和资源泄漏问题。

#### 问题场景

当监听的数据在短时间内多次变更时，可能出现以下问题：

1. **资源泄漏**：事件监听器、定时器等未被正确清理
2. **异步竞争**：旧的异步操作结果覆盖新的操作结果

```html
<!-- 问题示例：事件监听器泄漏 -->
<script>
const flag = ref(true)

watch(flag, (newVal) => {
  const dom = newVal ? app : div
  
  function handler() {
    console.log(newVal ? '点击 app' : '点击 div')
  }
  
  dom.addEventListener('click', handler)
  // 问题：旧的事件监听器没有被移除！
})
</script>
```

#### 解决方案

```typescript
watch(flag, (newVal, oldVal, onCleanup) => {
  const dom = newVal ? app : div
  
  function handler() {
    console.log(newVal ? '点击 app' : '点击 div')
  }
  
  dom.addEventListener('click', handler)
  
  // 注册清理函数
  onCleanup(() => {
    dom.removeEventListener('click', handler)
  })
}, { immediate: true })
```

#### 实现原理

```typescript
// 副作用清理机制
let cleanup = null

function onCleanup(cb) {
  cleanup = cb  // 保存清理函数
}

function job() {
  if (cleanup) {
    // 执行新回调前，先清理上一次的副作用
    cleanup()
    cleanup = null
  }
  
  const newValue = effect.run()
  cb(newValue, oldValue, onCleanup)  // 传入 onCleanup 函数
  oldValue = newValue
}
```

#### 执行时序

1. **首次执行**：执行回调，可能注册清理函数
2. **数据变化**：
   - 检查是否有待清理的函数
   - 如果有，先执行清理函数
   - 然后执行新的回调
   - 新回调可能注册新的清理函数

#### 典型应用场景

**1. 事件监听器清理**
```typescript
watch(activeElement, (newEl, oldEl, onCleanup) => {
  function handleClick() { /* ... */ }
  
  newEl.addEventListener('click', handleClick)
  
  onCleanup(() => {
    newEl.removeEventListener('click', handleClick)
  })
})
```

**2. 定时器清理**
```typescript
watch(interval, (newInterval, oldInterval, onCleanup) => {
  const timer = setInterval(() => {
    // 定时任务
  }, newInterval)
  
  onCleanup(() => {
    clearInterval(timer)
  })
})
```

**3. 异步请求取消**
```typescript
watch(searchQuery, async (query, oldQuery, onCleanup) => {
  const controller = new AbortController()
  
  onCleanup(() => {
    controller.abort()  // 取消上一次请求
  })
  
  try {
    const result = await fetch(`/api/search?q=${query}`, {
      signal: controller.signal
    })
    // 处理结果
  } catch (error) {
    if (error.name !== 'AbortError') {
      // 处理其他错误
    }
  }
})
```

### 4. deep - 深度监听

#### 基础深度监听

```typescript
if(deep) {
  const baseGetter = getter
  getter = () => traverse(baseGetter())
}

function traverse(value, seen = new Set()) {
  if(!isObject(value)) return value
  if(seen.has(value)) return value  // 防止循环引用
  
  seen.add(value)
  for(const key in value) {
    traverse(value[key], seen)  // 递归访问所有属性
  }
  return value
}
```

**实现原理**：
- 在依赖收集阶段，递归访问对象的所有嵌套属性
- 访问时触发 getter，将所有深层属性都收集为依赖
- 使用 `Set` 记录已访问对象，避免循环引用导致的递归爆栈

#### 层级控制（Vue 3.5 新特性）

```typescript
if(deep) {
  const baseGetter = getter
  const depth = deep === true ? Infinity : deep
  getter = () => traverse(baseGetter(), depth)
}

function traverse(value, depth = Infinity, seen = new Set()) {
  if(!isObject(value) || depth <= 0) return value
  if(seen.has(value)) return value
  
  seen.add(value)
  depth--  // 递减深度
  
  for(const key in value) {
    traverse(value[key], depth, seen)
  }
  return value
}
```

**层级控制特性**：
- `deep: true` → 无限深度监听
- `deep: 2` → 只监听到第二层
- 超出指定层级的属性变化不会触发回调

### 5. 多种 Source 类型处理

```typescript
// 完整的 source 类型判断逻辑
if(isRef(source)) {
  getter = () => source.value
} else if(isReactive(source)) {
  getter = () => source
  if(!deep) deep = true  // reactive 默认深度监听
} else if(isFunction(source)) {
  getter = source
} else if(isArray(source)) {
  // 多源监听（简化版）
  getter = () => source.map(s => isRef(s) ? s.value : s)
}
```

**设计考虑**：
- **ref**：监听 `.value` 属性的变化
- **reactive**：默认开启深度监听，因为 reactive 对象通常需要监听内部属性
- **function**：直接作为 getter，监听函数返回值的变化
- **array**：支持同时监听多个源

## 🚀 性能优化策略

### 1. 惰性计算
- 只有在数据真正变化时才执行回调
- 通过调度器机制避免不必要的计算

### 2. 依赖精确收集
- 只收集实际访问的属性作为依赖
- 避免过度依赖导致的性能问题

### 3. 深度监听优化
- 层级控制减少不必要的深层遍历
- 循环引用检测避免无限递归

### 4. 内存管理
- 提供 `stop` 方法主动清理依赖
- 防止内存泄漏

## 📊 完整执行流程示例

```typescript
// 示例代码：包含 onCleanup 的完整示例
const flag = ref(true)
const stop = watch(flag, (newVal, oldVal, onCleanup) => {
  const dom = newVal ? app : div
  
  function handler() {
    console.log(newVal ? '点击 app' : '点击 div')
  }
  
  dom.addEventListener('click', handler)
  
  // 注册清理函数
  onCleanup(() => {
    dom.removeEventListener('click', handler)
    console.log('清理了事件监听器')
  })
}, { immediate: true })

// 执行流程分析
```

### 初始化阶段
1. **创建 getter**：`() => flag.value`
2. **创建 ReactiveEffect**：传入 getter 函数
3. **设置调度器**：`effect.scheduler = job`
4. **immediate 执行**：立即调用 `job()`
   - `cleanup` 为 `null`，跳过清理
   - `newValue = effect.run()` → `true`
   - `cb(true, undefined, onCleanup)` → 执行回调
     - 在 `app` 元素上添加事件监听器
     - 调用 `onCleanup()` 注册清理函数
   - `oldValue = true`

### 数据更新阶段
```typescript
flag.value = false  // 触发更新
```

1. **触发依赖**：`flag.value` 的 setter 被调用
2. **执行调度器**：调用 `job` 函数而不是重新执行 effect
3. **清理副作用**：
   - 检查 `cleanup` 不为 `null`
   - 执行 `cleanup()` → 移除 `app` 上的事件监听器
   - 输出 "清理了事件监听器"
   - 重置 `cleanup = null`
4. **获取新值**：`effect.run()` → `false`
5. **执行回调**：`cb(false, true, onCleanup)` → 执行新回调
   - 在 `div` 元素上添加事件监听器
   - 调用 `onCleanup()` 注册新的清理函数
6. **更新旧值**：`oldValue = false`

### 停止监听
```typescript
stop()  // 调用返回的停止函数
```

1. **清理依赖**：调用 `effect.stop()`
2. **标记非活跃**：`effect.active = false`
3. **断开连接**：后续数据变化不再触发回调

## 🔍 与其他响应式 API 的关系

### watch vs effect
- **effect**：自动重新执行，用于副作用
- **watch**：执行用户回调，用于监听变化

### watch vs computed
- **computed**：计算属性，有缓存，返回计算结果
- **watch**：监听器，无返回值，执行副作用

### watch vs watchEffect
- **watch**：需要明确指定监听源，可获取新旧值
- **watchEffect**：自动收集依赖，类似 effect 但支持异步

## 💡 最佳实践建议

### 1. 选择合适的监听源类型
```typescript
// ✅ 推荐：明确的监听目标
watch(() => user.name, (newName) => {
  // 只监听 name 属性
})

// ❌ 避免：过度监听
watch(user, (newUser) => {
  // 监听整个对象的所有变化
}, { deep: true })
```

### 2. 合理使用 deep 选项
```typescript
// ✅ 推荐：指定监听深度
watch(state, callback, { deep: 2 })

// ✅ 推荐：只监听需要的属性
watch(() => state.user.profile.name, callback)
```

### 3. 及时清理监听器
```typescript
// ✅ 推荐：组件卸载时清理
onUnmounted(() => {
  stop()
})

// ✅ 推荐：条件性停止
if (someCondition) {
  stop()
}
```

### 4. 避免在回调中修改监听的数据
```typescript
// ❌ 避免：可能导致无限循环
watch(count, (newVal) => {
  count.value = newVal + 1  // 危险！
})

// ✅ 推荐：使用其他数据或添加条件判断
watch(count, (newVal) => {
  if (newVal < 10) {
    otherValue.value = newVal + 1
  }
})
```

### 5. 正确使用 onCleanup 清理副作用
```typescript
// ✅ 推荐：清理事件监听器
watch(element, (newEl, oldEl, onCleanup) => {
  const handler = () => { /* ... */ }
  newEl.addEventListener('click', handler)
  
  onCleanup(() => {
    newEl.removeEventListener('click', handler)
  })
})

// ✅ 推荐：清理定时器
watch(delay, (newDelay, oldDelay, onCleanup) => {
  const timer = setTimeout(() => { /* ... */ }, newDelay)
  
  onCleanup(() => {
    clearTimeout(timer)
  })
})

// ✅ 推荐：取消异步请求
watch(query, async (newQuery, oldQuery, onCleanup) => {
  const controller = new AbortController()
  
  onCleanup(() => {
    controller.abort()
  })
  
  try {
    await fetch(`/api?q=${newQuery}`, { signal: controller.signal })
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.error(error)
    }
  }
})
```

## 🎉 总结

Vue3 的 `watch` 实现展现了响应式系统的精妙设计：

1. **架构清晰**：基于 `ReactiveEffect` 和调度器的设计，职责分离明确
2. **功能完备**：支持多种监听源类型和丰富的配置选项
3. **副作用管理**：通过 `onCleanup` 机制优雅处理资源清理和异步竞争问题
4. **性能优化**：惰性计算、精确依赖收集、层级控制等优化策略
5. **易于使用**：简洁的 API 设计，强大的功能支持

通过深入理解 `watch` 的实现原理，我们可以更好地：
- 选择合适的监听策略
- 避免常见的性能陷阱
- 编写更高效的响应式代码
- 理解 Vue3 响应式系统的设计哲学

这种"推拉结合"的设计模式（推送变化通知 + 拉取最新值）不仅保证了响应性的正确性，也实现了性能的最优化，是现代前端框架响应式系统的典型代表。

---

*本文档基于 Vue3 响应式系统的学习实践，深入分析了 watch 的实现细节和设计思想，为深入理解 Vue3 提供参考。*