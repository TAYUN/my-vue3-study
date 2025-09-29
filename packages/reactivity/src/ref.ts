import { activeSub } from './effect'

enum ReactiveFlags {
  IS_REF = '__v_isRef',
}

interface Link {
  // 保存effect, 订阅者
  sub: Function
  // 保存下一个订阅者
  nextSub: Link
  // 保存上一个订阅者
  prevSub: Link
}

class RefImpl {
  _value; // 保存实际值
  // ref 标记，证明这是一个 ref 对象
  [ReactiveFlags.IS_REF] = true

  // 订阅者effect链表头节点，指向第一个订阅者
  subs: Link

  // 订阅者effect链表尾节点，指向最后一个订阅者
  subsTail: Link
  constructor(value) {
    this._value = value
  }

  // 收集依赖
  get value() {
    // 当有人访问时，可以获取 activeSub
    if (activeSub) {
      // 当存在 activeSub 时存储它，以便更新后触发
      const newLink: Link = {
        sub: activeSub,
        nextSub: undefined,
        prevSub: undefined,
      }
      /**
       * 关联链表关系
       * 1. 如果存在尾节点，表示链表中已有节点，在链表尾部新增。
       * 2. 如果不存在尾节点，表示这是第一次关联链表，第一个节点既是头节点也是尾节点。
       */
      if (this.subsTail) {
        this.subsTail.nextSub = newLink
        newLink.prevSub = this.subsTail
        this.subsTail = newLink
      } else {
        this.subs = newLink
        this.subsTail = newLink
      }
    }
    return this._value
  }

  // 触发更新
  set value(newValue) {
    this._value = newValue
    // 通知 effect 重新执行，获取最新的 value
    let link = this.subs
    const queueEffect = []
    // 遍历整个链表的每一个节点
    // 把每个节点里的 effect 函数放进数组
    // 注意不是放入节点本身，而是放入节点里的 sub 属性（即 effect 函数）
    while (link) {
      queueEffect.push(link.sub)
      link = link.nextSub
    }
    queueEffect.forEach(effect => effect())
  }
}

export function ref(value) {
  return new RefImpl(value)
}

export function isRef(value) {
  return !!(value && value[ReactiveFlags.IS_REF])
}
