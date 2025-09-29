// packages/reactivity/src/effect.ts
var activeSub;
function effect(fn) {
  activeSub = fn;
  fn();
  activeSub = void 0;
}

// packages/reactivity/src/ref.ts
var RefImpl = class {
  _value;
  // 保存实际值
  // ref 标记，证明这是一个 ref 对象
  ["__v_isRef" /* IS_REF */] = true;
  // 订阅者effect链表头节点，指向第一个订阅者
  subs;
  // 订阅者effect链表尾节点，指向最后一个订阅者
  subsTail;
  constructor(value) {
    this._value = value;
  }
  // 收集依赖
  get value() {
    if (activeSub) {
      const newLink = {
        sub: activeSub,
        nextSub: void 0,
        prevSub: void 0
      };
      if (this.subsTail) {
        this.subsTail.nextSub = newLink;
        newLink.prevSub = this.subsTail;
        this.subsTail = newLink;
      } else {
        this.subs = newLink;
        this.subsTail = newLink;
      }
    }
    return this._value;
  }
  // 触发更新
  set value(newValue) {
    this._value = newValue;
    let link = this.subs;
    const queueEffect = [];
    while (link) {
      queueEffect.push(link.sub);
      link = link.nextSub;
    }
    queueEffect.forEach((effect2) => effect2());
  }
};
function ref(value) {
  return new RefImpl(value);
}
function isRef(value) {
  return !!(value && value["__v_isRef" /* IS_REF */]);
}
export {
  activeSub,
  effect,
  isRef,
  ref
};
