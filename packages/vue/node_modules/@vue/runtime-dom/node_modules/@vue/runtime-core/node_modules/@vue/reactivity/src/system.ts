/**
 * 依赖项 (如 ref)
 */
export interface Dependency {
  // 订阅者链表头节点
  subs: Link | undefined
  // 订阅者链表尾节点
  subsTail: Link | undefined
}
/**
 * 订阅者 (如 effect)
 */
export interface Sub {
  // 依赖项链表头节点
  deps: Link | undefined
  // 依赖项链表尾节点
  depsTail: Link | undefined
  // 是否正在收集依赖
  tracking: boolean
}

export interface Link {
  // 订阅者
  sub: Sub
  // 下一个订阅者节点
  nextSub: Link
  // 上一个订阅者节点
  prevSub: Link
  // 依赖项
  dep: Dependency

  // 下一个依赖项节点
  nextDep: Link | undefined
}
// 复用节点池
let linkPool: Link

/** 建立链表关系
 * dep 是依赖项，例如 ref/computed/reactive
 * sub 是订阅者，例如 effect
 * 当依赖项(ref)变化时，需要通知订阅者(effect)
 */
export function link(dep, sub) {
  // 复用节点
  const currentDep = sub.depsTail
  // 核心逻辑：根据 currentDep 是否存在，来决定下一个要检查的节点
  const nextDep = currentDep === undefined ? sub.deps : currentDep.nextDep
  // 如果 nextDep 存在，且 nextDep.dep 等于我当前要收集的 dep
  if (nextDep && nextDep.dep === dep) {
    sub.depsTail = nextDep // 移动指针
    return
  }

  let newLink: Link

  // todo 疑问：为什么每次拿第一个节点刚好就是我想要复用的节点
  // 复用节点 （优化重复删除创建）
  if (linkPool) {
    /**
     * 如果 linkPool 存在，表示有可复用的节点，那就从 linkPool 中取出第一个节点
     */
    newLink = linkPool
    linkPool = linkPool.nextDep // 池指针后移
    newLink.nextDep = nextDep
    newLink.sub = sub
    newLink.dep = dep
  } else {
    /**
     * 如果 linkPool 不存在，表示没有可复用的节点，那就创建一个新节点
     */
    newLink = {
      sub, // 指向目前的订阅者 (activeSub)
      dep,
      nextDep, // 下一个依赖项节点
      nextSub: undefined, // 指向下一个节点 (初始化为空)
      prevSub: undefined, // 指向前一个节点 (初始化为空)
    }
  }

  // 如果 dep 已经有尾端订阅者 (代表链表不是空的)
  if (dep.subsTail) {
    // 把尾端节点的 next 指向新的节点
    dep.subsTail.nextSub = newLink
    // 新节点的 prev 指向原本的尾端
    newLink.prevSub = dep.subsTail
    // 更新 dep 的尾端指标为新节点
    dep.subsTail = newLink
  } else {
    // 如果 dep 还没有任何订阅者 (第一次建立链表)
    dep.subs = newLink // 链表的头指向新节点
    dep.subsTail = newLink // 链表的尾也指向新节点
  }

  /**
   * 将链表节点跟 sub (effect) 建立关联关系
   * 1. 如果存在尾节点，表示链表中已有节点，在链表尾部新增。
   * 2. 如果不存在尾节点，表示这是第一次关联链表，第一个节点既是头节点也是尾节点。
   */

  if (sub.depsTail) {
    sub.depsTail.nextDep = newLink
    sub.depsTail = newLink
  } else {
    sub.deps = newLink
    sub.depsTail = newLink
  }
}
export function processComputedUpdate(sub) {
  // update 返回 true 表示数值发生变化，才继续向下触发 effect
  if (sub.subs && sub.update()) {
    // 通知其 sub 链表中的其他 sub（effect） 更新
    propagate(sub.subs)
  }
}

/* * 传播更新的函数
 */
export function propagate(subs) {
  let link = subs
  let queuedEffect = []

  while (link) {
    const sub = link.sub
    // 只有不在执行中的 effect，且目前是“干净状态”（dirty=false）时，才入队
    if (!sub.tracking && !sub.dirty) {
      // 入队前先设置为“脏”（避免同一轮事件循环被重复入队）
      sub.dirty = true
      if ('update' in sub) {
        processComputedUpdate(sub)
      } else {
        queuedEffect.push(sub)
      }
    }

    link = link.nextSub
  }

  queuedEffect.forEach(effect => effect.notify())
}

export function startTrack(sub) {
  sub.depsTail = undefined
  sub.tracking = true // 是否正在执行（收集中）
}

export function endTrack(sub) {
  sub.tracking = false // 执行结束，取消标记
  const depsTail = sub.depsTail
  sub.dirty = false // 本次 fn 执行完毕，复位为“干净”

  /**
   *
   * 情况一解法： depsTail 存在，并且 depsTail 的 nextDep 存在，表示后续链表节点应该移除
   */
  if (depsTail) {
    if (depsTail.nextDep) {
      clearTracking(depsTail.nextDep)
      depsTail.nextDep = undefined
    }
    // 情况二：depsTail 不存在，但旧的 deps 头节点存在，清除所有节点
  } else if (sub.deps) {
    clearTracking(sub.deps)
    sub.deps = undefined
  }
}

/**
 * 清理依赖函数链表
 */

function clearTracking(link: Link) {
  while (link) {
    const { prevSub, nextSub, dep, nextDep } = link

    /**
     * 1. 如果上一个节点存在 sub，就把它的 nextSub 指向当前节点的下一个节点
     * 2. 如果没有 sub，表示是头节点，那就把 dep.subs 指向当前节点的下一个节点
     */
    if (prevSub) {
      prevSub.nextSub = nextSub
      link.nextSub = undefined
    } else {
      dep.subs = nextSub
    }

    /**
     * 1. 如果下一个节点存在 sub，就把它的 prevSub 指向当前节点的上一个节点
     * 2. 如果没有 sub，表示是尾节点，那就把 dep.subsTail 指向当前节点的上一个节点
     */

    if (nextSub) {
      nextSub.prevSub = prevSub
      link.prevSub = undefined
    } else {
      dep.subsTail = prevSub
    }

    link.dep = link.sub = undefined

    /**
     * 把不再需要的节点放回 linkPool 中，以备复用
     */
    link.nextDep = linkPool
    linkPool = link

    link = nextDep
  }
}

/**
 * ### 3. 具体执行流程示例
假设依赖链表是： count → name → age

清理过程 ：

1. 1.
   第1次循环 ：处理count节点
   
   - 清理count节点的双向链表连接
   - count.nextDep = linkPool （此时linkPool为空）
   - linkPool = count
   - link = name （移动到下一个）
2. 2.
   第2次循环 ：处理name节点
   
   - 清理name节点的双向链表连接
   - name.nextDep = linkPool （指向count）
   - linkPool = name
   - link = age （移动到下一个）
3. 3.
   第3次循环 ：处理age节点
   
   - 清理age节点的双向链表连接
   - age.nextDep = linkPool （指向name）
   - linkPool = age
   - link = undefined （结束）
最终结果 ： linkPool = age → name → count

### 4. 为什么这样设计？
1. 1.
   遍历效率 ：从前往后遍历是最自然的链表遍历方式
2. 2.
   LIFO复用 ：后清理的节点先复用，这样能更好地匹配依赖收集的顺序
3. 3.
   内存局部性 ：最近清理的节点更可能被立即复用
### 5. 关键理解
- 清理遍历 ：从前往后（count → name → age）
- 放入池子 ：LIFO顺序（age → name → count）
- 从池取出 ：LIFO顺序（age ← name ← count）
 */
