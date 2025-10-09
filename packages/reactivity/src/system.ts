/**
 * 依赖项 (如 ref)
 */
interface Dep {
  // 订阅者链表头节点
  subs: Link | undefined
  // 订阅者链表尾节点
  subsTail: Link | undefined
}
/**
 * 订阅者 (如 effect)
 */
interface Sub {
  // 依赖项链表头节点
  deps: Link | undefined
  // 依赖项链表尾节点
  depsTail: Link | undefined
}

export interface Link {
  // 订阅者
  sub: Sub
  // 下一个订阅者节点
  nextSub: Link
  // 上一个订阅者节点
  prevSub: Link
  // 依赖项
  dep: Dep

  // 下一个依赖项节点
  nextDep: Link | undefined
}

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

  // 建立新的链表节点
  const newLink: Link = {
    sub, // 指向目前的订阅者 (activeSub)
    dep,
    nextSub: undefined, // 指向下一个节点 (初始化为空)
    prevSub: undefined, // 指向前一个节点 (初始化为空)
    nextDep: undefined, // 下一个依赖项节点 (初始化为空)
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

/* * 传播更新的函数
 */
export function propagate(subs) {
  let link = subs
  let queuedEffect = []

  while (link) {
    queuedEffect.push(link.sub)
    link = link.nextSub
  }

  queuedEffect.forEach(effect => effect.notify())
}
