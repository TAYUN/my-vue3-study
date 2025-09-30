// packages/reactivity/src/effect.ts
var activeSub;
var ReactiveEffect = class {
  constructor(fn) {
    this.fn = fn;
  }
  run() {
    const prevSub = activeSub;
    activeSub = this;
    try {
      return this.fn();
    } finally {
      activeSub = prevSub;
    }
  }
  /*
   * 如果依赖数据发生变化，由此方法通知更新。
   */
  notify() {
    this.scheduler();
  }
  /*
   * 默认的调度器，直接调用 run 方法。
   * 如果用户传入了自定义的 scheduler，它会作为实例属性覆盖掉这个原型方法。
   */
  scheduler() {
    this.run();
  }
};
function effect(fn, options) {
  const e = new ReactiveEffect(fn);
  Object.assign(e, options);
  e.run();
  const runner = e.run.bind(e);
  runner.effect = e;
  return runner;
}

// packages/reactivity/src/system.ts
function link(dep, sub) {
  const newLink = {
    sub,
    // 指向目前的订阅者 (activeSub)
    nextSub: void 0,
    // 指向下一个节点 (初始化为空)
    prevSub: void 0
    // 指向前一个节点 (初始化为空)
  };
  if (dep.subsTail) {
    dep.subsTail.nextSub = newLink;
    newLink.prevSub = dep.subsTail;
    dep.subsTail = newLink;
  } else {
    dep.subs = newLink;
    dep.subsTail = newLink;
  }
}
function propagate(subs) {
  let link2 = subs;
  let queuedEffect = [];
  while (link2) {
    queuedEffect.push(link2.sub);
    link2 = link2.nextSub;
  }
  queuedEffect.forEach((effect2) => effect2.notify());
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
      trackRef(this);
    }
    return this._value;
  }
  // 触发更新
  set value(newValue) {
    this._value = newValue;
    if (this.subs) {
      triggerRef(this);
    }
  }
};
function ref(value) {
  return new RefImpl(value);
}
function isRef(value) {
  return !!(value && value["__v_isRef" /* IS_REF */]);
}
function trackRef(dep) {
  link(dep, activeSub);
}
function triggerRef(dep) {
  propagate(dep.subs);
}
export {
  ReactiveEffect,
  activeSub,
  effect,
  isRef,
  ref,
  trackRef,
  triggerRef
};
