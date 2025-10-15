import { hasChange, isFunction } from '@vue/shared'
import { ReactiveFlags } from './ref'
import { Dependency, Sub, Link, link, startTrack, endTrack } from './system'
import { activeSub, setActiveSub } from './effect'

export function computed(getterOptions) {
  // 传入函数：表示只有 getter（只读）
  // 传入对象：表示同时有 getter 与 setter
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

class ComputedRefImpl implements Dependency, Sub {
  // computed也是ref，返回true
  [ReactiveFlags.IS_REF] = true

  _value //保持fn的返回值
  // 作为订阅者 Dependency，记录关联的subs，等我值更新了，我要通知他们

  // 订阅者链表头节点
  subs: Link | undefined
  // 订阅者链表尾节点
  subsTail: Link | undefined

  // 作为依赖项 Sub。记录哪些dep，被我收集了
  // 依赖项链表的头节点，指向Link
  deps: Link
  // 依赖项链表的尾节点，指向Link
  depsTail: Link
  // 是否正在执行（收集中）
  tracking = false

  // 计算属性是否需要重新计算；为 true 时重新计算
  dirty = true
  constructor(
    public fn, // getter 为了保持和源码一致，叫fn，可能是为了保持和effect一致，computed以前用的是effect，现在自己实现了
    private setter,
  ) {}

  get value() {
    if (this.dirty) {
      this.update()
    }
    if (activeSub) {
      link(this, activeSub)
    }
    return this._value
  }
  set value(newValue) {
    if (this.setter) {
      this.setter(newValue)
    } else {
      console.warn('我是只读的，不能设置值')
    }
  }

  update() {
    /**
     * 作为sub，实现sub的功能，在fn执行期间，收集fn执行过程访问到的响应式数据dep
     */
    // 先将当前的 Effect 存储，用于处理嵌套逻辑
    const prevSub = activeSub
    // 每次执行 fn 之前，把 this 实例放到 activeSub 上
    setActiveSub(this)
    startTrack(this)
    // 注意用try catch
    try {
      const oldValue = this._value // 缓存旧值
      this._value = this.fn()
      // // update 执行完成后，将 dirty 改为 false，表示已缓存 这个判断移到endTrack中了
      // // this.dirty = false
      // 只有当新旧值不同才返回 true
      return hasChange(oldValue, this._value)
    } finally {
      endTrack(this)
      // 执行完毕后，清空 activeSub
      setActiveSub(prevSub)
    }
  }
}
