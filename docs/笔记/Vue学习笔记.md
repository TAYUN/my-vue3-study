# Vue 学习笔记

## 📚 响应式系统

### 核心概念

#### 什么是响应式？

Vue 的响应式系统核心在于**响应式对象的属性与 effect 副作用函数之间建立的依赖关系**。当响应式数据发生变化时，所有依赖该数据的副作用函数会自动重新执行，从而实现数据驱动的视图更新。

**响应式系统的三个核心要素：**

1. **响应式对象（Reactive Object）**：通过 Proxy 代理的对象，能够拦截属性的读取和设置操作
2. **副作用函数（Effect Function）**：依赖响应式数据的函数，当依赖的数据变化时自动重新执行
3. **依赖收集系统（Dependency Collection）**：建立数据属性与副作用函数之间的订阅关系

**响应式工作流程：**

```javascript
// 1. 创建响应式对象
const state = reactive({ count: 0, name: 'Vue' })

// 2. 创建副作用函数，建立依赖关系
effect(() => {
  // 读取 state.count 时，会自动收集依赖
  console.log(`计数器: ${state.count}`)
  // 这个 effect 现在依赖于 state.count
})

effect(() => {
  // 读取 state.name 时，会自动收集依赖
  console.log(`框架名称: ${state.name}`)
  // 这个 effect 现在依赖于 state.name
})

// 3. 数据变化触发依赖更新
state.count++ // 只触发第一个 effect 重新执行
state.name = 'Vue.js' // 只触发第二个 effect 重新执行
```

**依赖关系的建立过程：**

```javascript
// 当 effect 执行时：
effect(() => {
  console.log(state.count) // 触发 get 陷阱
})

// 内部发生的事情：
// 1. effect 开始执行，设置 activeEffect = currentEffect
// 2. 访问 state.count，触发 Proxy 的 get 陷阱
// 3. get 陷阱调用 track(target, 'count')，建立依赖关系
// 4. 将 currentEffect 添加到 count 属性的依赖集合中
// 5. effect 执行完毕，清除 activeEffect

// 当数据变化时：
state.count = 10 // 触发 set 陷阱

// 内部发生的事情：
// 1. 触发 Proxy 的 set 陷阱
// 2. set 陷阱调用 trigger(target, 'count')
// 3. 找到 count 属性的所有依赖 effect
// 4. 逐个执行这些 effect 函数
```

**响应式系统的数据结构：**

```javascript
// 依赖收集的三层映射结构
targetMap: WeakMap {
  target1: Map {
    'count' => Set { effect1, effect2 },
    'name'  => Set { effect3 }
  },
  target2: Map {
    'value' => Set { effect4 }
  }
}

// 这个结构表示：
// - target1.count 被 effect1 和 effect2 依赖
// - target1.name 被 effect3 依赖
// - target2.value 被 effect4 依赖
```

#### 核心 API

**reactive()**

- 创建响应式对象
- 基于 Proxy 实现
- 深度响应式

**effect()**

- 副作用函数
- 自动收集依赖
- 数据变化时重新执行

### reactive实现原理

实现reactive过程中需要处理的问题：

1. 非对象类型的处理问题
2. target是对象，怎么关联依赖关系和触发依赖更新（targetMap和Dep的作用）
3. 访问对象的访问器属性的时候，this的指向问题（receiver的作用）
4. 重复代理同一个对象的问题（reactiveMap的作用）
5. 传入的对象是一个代理对象的问题（reactiveSet的作用）
6. 更新的值没发生变化，不应该触发更新的处理
7. target.a中的值是ref，读取时自动解包和赋值时智能处理的问题
8. 嵌套对象的深度响应式问题（target={a:{b:1}}需要递归处理）

#### 1. reactive函数实现中的8个核心问题及解决方案

**问题1: 非对象类型的处理问题**

```typescript
// 解决方案：在createReactiveObject函数开头进行类型检查
function createReactiveObject(target) {
  if (!isObject(target)) {
    return target // 非对象直接返回，不进行代理
  }
  // ... 后续处理
}
```

**问题2: target是对象，怎么关联依赖关系和触发依赖更新？**

```typescript
// 解决方案：使用三层映射结构 targetMap -> depsMap -> dep
const targetMap = new WeakMap() // target -> Map

export function track(target, key) {
  if (!activeSub) return

  // 获取或创建target对应的依赖映射表
  let depsMap = targetMap.get(target)
  if (!depsMap) {
    depsMap = new Map()
    targetMap.set(target, depsMap)
  }

  // 获取或创建key对应的依赖收集器
  let dep = depsMap.get(key)
  if (!dep) {
    dep = new Dep()
    depsMap.set(key, dep)
  }

  // 建立订阅者与依赖的链接关系
  link(dep, activeSub)
}

export function trigger(target, key) {
  const depsMap = targetMap.get(target)
  if (!depsMap) return

  const dep = depsMap.get(key)
  if (!dep) return

  // 触发所有订阅者更新
  progate(dep.subs)
}
```

**问题3: 访问对象的访问器属性时，this的指向问题（receiver的作用）**

```typescript
// 解决方案：在get和set陷阱中正确传递receiver参数
const mutableHandlers = {
  get(target, key, receiver) {
    track(target, key)
    // 关键：传递receiver确保getter中的this指向代理对象
    const res = Reflect.get(target, key, receiver)
    return res
  },

  set(target, key, newValue, receiver) {
    // 关键：传递receiver确保setter中的this指向代理对象
    const res = Reflect.set(target, key, newValue, receiver)
    // ... 触发更新逻辑
    return res
  },
}
```

**问题4: 重复代理同一个对象的问题（reactiveMap的作用）**

```typescript
// 解决方案：使用WeakMap缓存原始对象到代理对象的映射
const reactiveMap = new WeakMap()

function createReactiveObject(target) {
  // 检查是否已经为这个原始对象创建过代理
  const existingProxy = reactiveMap.get(target)
  if (existingProxy) {
    return existingProxy // 返回缓存的代理对象
  }

  const proxy = new Proxy(target, mutableHandlers)
  // 缓存映射关系
  reactiveMap.set(target, proxy)
  return proxy
}
```

**问题5: 传入的对象是一个代理对象的问题（reactiveSet的作用）**

```typescript
// 解决方案：使用WeakSet标记所有代理对象
const reactiveSet = new WeakSet()

function createReactiveObject(target) {
  // 检查传入的target是否已经是代理对象
  if (reactiveSet.has(target)) {
    return target // 避免对代理对象再次进行代理
  }

  const proxy = new Proxy(target, mutableHandlers)
  // 标记这个对象是代理对象
  reactiveSet.add(proxy)
  return proxy
}
```

**问题6: 更新的值没发生变化，不应该触发更新的处理**

```typescript
// 解决方案：在set陷阱中使用hasChange函数检查值是否真正改变
set(target, key, newValue, receiver) {
  let oldValue = target[key]
  const res = Reflect.set(target, key, newValue, receiver)

  // 只有值真正改变时才触发更新
  if (hasChange(newValue, oldValue)) {
    trigger(target, key)
  }
  return res
}
```

**问题7: target.a中的值是ref，读取时自动解包和赋值时智能处理的问题**

```typescript
// 解决方案：在get和set陷阱中特殊处理ref类型
const mutableHandlers = {
  get(target, key, receiver) {
    track(target, key)
    const res = Reflect.get(target, key, receiver)

    // ref自动解包：如果返回值是ref，直接返回其value
    if (isRef(res)) {
      return res.value
    }
    return res
  },

  set(target, key, newValue, receiver) {
    let oldValue = target[key]
    const res = Reflect.set(target, key, newValue, receiver)

    // ref智能赋值：如果原值是ref且新值不是ref，更新ref.value
    if (isRef(oldValue) && !isRef(newValue)) {
      oldValue.value = newValue
      return res
    }

    if (hasChange(newValue, oldValue)) {
      trigger(target, key)
    }
    return res
  },
}
```

**问题8: 嵌套对象的深度响应式问题（target={a:{b:1}}需要递归处理）**

```typescript
// 解决方案：在get陷阱中对嵌套对象进行懒代理
get(target, key, receiver) {
  track(target, key)
  const res = Reflect.get(target, key, receiver)

  if (isRef(res)) {
    return res.value
  }

  // 懒代理：如果返回值是对象，递归创建响应式代理
  if (isObject(res)) {
    return reactive(res)
  }

  return res
}
```

#### 2. 依赖收集系统

```javascript
// 全局变量存储当前活跃的 effect
let activeEffect = null

// 依赖映射表：target -> key -> effects
const targetMap = new WeakMap()

function track(target, key) {
  if (!activeEffect) return

  let depsMap = targetMap.get(target)
  if (!depsMap) {
    targetMap.set(target, (depsMap = new Map()))
  }

  let dep = depsMap.get(key)
  if (!dep) {
    depsMap.set(key, (dep = new Set()))
  }

  dep.add(activeEffect)
}
```

#### 3. 触发更新

```javascript
function trigger(target, key) {
  const depsMap = targetMap.get(target)
  if (!depsMap) return

  const dep = depsMap.get(key)
  if (dep) {
    dep.forEach(effect => effect())
  }
}
```

### 关键知识点

#### WeakMap vs Map

- **WeakMap**: 键必须是对象，弱引用，可被垃圾回收
- **Map**: 键可以是任意类型，强引用

#### Proxy vs Object.defineProperty

| 特性     | Proxy    | Object.defineProperty |
| -------- | -------- | --------------------- |
| 监听范围 | 整个对象 | 单个属性              |
| 数组支持 | 原生支持 | 需要特殊处理          |
| 新增属性 | 自动监听 | 无法监听              |
| 性能     | 更好     | 较差                  |

### 常见问题

#### Q: 为什么使用 Reflect？

A: Reflect 提供了更规范的对象操作方式，与 Proxy 配合使用可以确保正确的 this 绑定。

#### Q: effect 如何避免无限循环？

A: 通过检查当前执行的 effect 是否已经在依赖集合中来避免。

#### Q: Proxy 中的 receiver 参数有什么作用？

A: receiver 参数确保在访问器属性（getter/setter）中，this 指向代理对象而不是原始对象，这对响应式系统的依赖收集至关重要。

**详细说明：**

1. **保证 this 指向代理对象**

   ```javascript
   const original = {
     name: 'Vue',
     get fullName() {
       // 如果没有receiver，this指向原始对象
       // 如果有receiver，this指向代理对象
       return `Hello ${this.name}`
     },
   }
   ```

2. **确保依赖收集完整**

   ```javascript
   // 不使用receiver的问题
   const proxyWithoutReceiver = new Proxy(original, {
     get(target, key) {
       track(target, key)
       return Reflect.get(target, key) // 缺少receiver
     },
   })

   // 正确使用receiver
   const proxyWithReceiver = new Proxy(original, {
     get(target, key, receiver) {
       track(target, key)
       return Reflect.get(target, key, receiver) // 传入receiver
     },
   })
   ```

3. **实际影响对比**
   ```javascript
   const state = reactive({
     firstName: 'Vue',
     lastName: 'JS',
     get fullName() {
       // 没有receiver：只收集fullName的依赖
       // 有receiver：收集fullName、firstName、lastName的依赖
       return `${this.firstName} ${this.lastName}`
     },
   })
   ```

**关键点：** 在响应式系统中，如果getter内部访问了其他属性，这些访问也需要通过代理来收集依赖。receiver确保了整个访问链都经过代理处理。

### 实践练习

#### 练习1：基础响应式

```javascript
// 实现一个简单的响应式对象
const data = reactive({ name: 'Vue', version: 3 })
effect(() => {
  console.log(`${data.name} ${data.version}`)
})
data.name = 'Vue.js' // 应该触发 effect
```

#### 练习2：嵌套对象

```javascript
// 处理嵌套对象的响应式
const data = reactive({
  user: {
    name: 'John',
    age: 25,
  },
})
effect(() => {
  console.log(data.user.name)
})
data.user.name = 'Jane' // 应该触发 effect
```

## 🔧 开发环境

### 项目结构

```
packages/
├── reactivity/     # 响应式系统
│   ├── src/
│   │   ├── effect.ts
│   │   ├── reactive.ts
│   │   └── index.ts
│   └── examples/
├── shared/         # 共享工具
└── vue/           # 主包
```

### 开发工具

- **TypeScript**: 类型安全
- **Vitest**: 单元测试
- **pnpm**: 包管理器
- **Live Preview**: 实时预览

### 调试技巧

1. 使用 `console.log` 追踪执行流程
2. 在关键位置设置断点
3. 查看 `targetMap` 的结构理解依赖关系
4. 编写单元测试验证功能

## 📝 学习心得

### 今日收获（2025-09-27）

- **完整实现了reactive函数**：从零开始构建了完整的响应式对象创建机制
- **深度理解Proxy和Reflect**：掌握了receiver参数的关键作用和正确使用方式
- **掌握了依赖收集系统**：理解了targetMap三层映射结构的设计原理
- **解决了8个核心实现问题**：从基础类型检查到高级的ref集成和嵌套对象处理
- **学会了缓存优化策略**：使用WeakMap和WeakSet避免重复代理和内存泄漏

### 实现过程中的关键突破

1. **receiver参数的重要性**：理解了为什么需要receiver来确保访问器属性中this的正确指向
2. **懒代理策略**：学会了在get陷阱中对嵌套对象进行按需代理，提高性能
3. **ref自动解包机制**：实现了响应式对象中ref的透明使用体验
4. **缓存机制设计**：通过reactiveMap和reactiveSet解决了重复代理问题

### 遇到的挑战及解决

1. **挑战**: 如何避免对同一个对象重复创建代理？
   **解决**: 使用WeakMap缓存原始对象到代理对象的映射关系

2. **挑战**: 如何处理代理对象被再次代理的问题？
   **解决**: 使用WeakSet标记所有代理对象，避免代理的代理

3. **挑战**: 如何实现ref在响应式对象中的自动解包？
   **解决**: 在get陷阱中检查返回值类型，ref类型直接返回其value属性

### 下次学习计划

- [ ] 深入学习effect系统的链表实现机制
- [ ] 理解activeSub和订阅者管理系统
- [ ] 学习computed的实现原理
- [ ] 研究Vue3源码中的性能优化策略

---

_最后更新：2025-01-20_
