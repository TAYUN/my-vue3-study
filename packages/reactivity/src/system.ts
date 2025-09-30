import { ReactiveEffect } from './effect'

export interface Link {
  sub: ReactiveEffect
  nextSub: Link
  prevSub: Link
}

/* * 建立链表关系
 * dep 是依赖项，例如 ref/computed/reactive
 * sub 是订阅者，例如 effect
 * 当依赖项(ref)变化时，需要通知订阅者(effect)
 */
export function link(dep , sub : ReactiveEffect){
    // 建立新的链表节点
    const newLink: Link = {
      sub,              // 指向目前的订阅者 (activeSub)
      nextSub: undefined, // 指向下一个节点 (初始化为空)
      prevSub: undefined  // 指向前一个节点 (初始化为空)
    }

    // 如果 dep 已经有尾端订阅者 (代表链表不是空的)
    if(dep.subsTail){
      // 把尾端节点的 next 指向新的节点
      dep.subsTail.nextSub = newLink
      // 新节点的 prev 指向原本的尾端
      newLink.prevSub = dep.subsTail
      // 更新 dep 的尾端指标为新节点
      dep.subsTail = newLink
    } else { 
      // 如果 dep 还没有任何订阅者 (第一次建立链表)
      dep.subs = newLink       // 链表的头指向新节点
      dep.subsTail = newLink   // 链表的尾也指向新节点
    }
}

/* * 传播更新的函数
 */
export function propagate(subs){
  let link = subs
  let queuedEffect = []

  while (link){
    queuedEffect.push(link.sub)
    link = link.nextSub
  }

  queuedEffect.forEach(effect => effect.notify())
}
