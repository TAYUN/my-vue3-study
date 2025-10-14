// packages/reactivity/src/system.ts
var linkPool;
function link(dep, sub) {
  const currentDep = sub.depsTail;
  const nextDep = currentDep === void 0 ? sub.deps : currentDep.nextDep;
  if (nextDep && nextDep.dep === dep) {
    sub.depsTail = nextDep;
    return;
  }
  let newLink;
  if (linkPool) {
    newLink = linkPool;
    linkPool = linkPool.nextDep;
    newLink.nextDep = nextDep;
    newLink.sub = sub;
    newLink.dep = dep;
  } else {
    newLink = {
      sub,
      // 指向目前的订阅者 (activeSub)
      dep,
      nextDep,
      // 下一个依赖项节点
      nextSub: void 0,
      // 指向下一个节点 (初始化为空)
      prevSub: void 0
      // 指向前一个节点 (初始化为空)
    };
  }
  if (dep.subsTail) {
    dep.subsTail.nextSub = newLink;
    newLink.prevSub = dep.subsTail;
    dep.subsTail = newLink;
  } else {
    dep.subs = newLink;
    dep.subsTail = newLink;
  }
  if (sub.depsTail) {
    sub.depsTail.nextDep = newLink;
    sub.depsTail = newLink;
  } else {
    sub.deps = newLink;
    sub.depsTail = newLink;
  }
}
function propagate(subs) {
  let link2 = subs;
  let queuedEffect = [];
  while (link2) {
    const sub = link2.sub;
    if (!sub.tracking) {
      queuedEffect.push(sub);
    }
    link2 = link2.nextSub;
  }
  queuedEffect.forEach((effect2) => effect2.notify());
}
function startTrack(sub) {
  sub.depsTail = void 0;
  sub.tracking = true;
}
function endTrack(sub) {
  sub.tracking = false;
  const depsTail = sub.depsTail;
  if (depsTail) {
    if (depsTail.nextDep) {
      clearTracking(depsTail.nextDep);
      depsTail.nextDep = void 0;
    }
  } else if (sub.deps) {
    clearTracking(sub.deps);
    sub.deps = void 0;
  }
}
function clearTracking(link2) {
  while (link2) {
    const { prevSub, nextSub, dep, nextDep } = link2;
    if (prevSub) {
      prevSub.nextSub = nextSub;
      link2.nextSub = void 0;
    } else {
      dep.subs = nextSub;
    }
    if (nextSub) {
      nextSub.prevSub = prevSub;
      link2.prevSub = void 0;
    } else {
      dep.subsTail = prevSub;
    }
    link2.dep = link2.sub = void 0;
    link2.nextDep = linkPool;
    linkPool = link2;
    link2 = nextDep;
  }
}

// packages/reactivity/src/effect.ts
var activeSub;
var ReactiveEffect = class {
  // 是否正在执行（收集中）
  constructor(fn) {
    this.fn = fn;
  }
  // 依赖项链表的头节点，指向Link
  deps;
  // 依赖项链表的尾节点，指向Link
  depsTail;
  tracking = false;
  run() {
    const prevSub = activeSub;
    activeSub = this;
    startTrack(this);
    try {
      return this.fn();
    } finally {
      endTrack(this);
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

// packages/shared/src/index.ts
function isObject(obj) {
  return obj && typeof obj === "object" && !Array.isArray(obj) && obj !== null;
}
function hasChange(newValue, oldValue) {
  return !Object.is(newValue, oldValue);
}

// packages/reactivity/src/dep.ts
var Dep = class {
  subs;
  subsTail;
  constructor() {
  }
};
var targetMap = /* @__PURE__ */ new WeakMap();
function track(target, key) {
  if (!activeSub) return;
  let depsMap = targetMap.get(target);
  if (!depsMap) {
    depsMap = /* @__PURE__ */ new Map();
    targetMap.set(target, depsMap);
  }
  let dep = depsMap.get(key);
  if (!dep) {
    dep = new Dep();
    depsMap.set(key, dep);
  }
  link(dep, activeSub);
}
function trigger(target, key) {
  const depsMap = targetMap.get(target);
  if (!depsMap) return;
  const dep = depsMap.get(key);
  if (!dep) return;
  if (dep.subs) {
    propagate(dep.subs);
  }
}

// packages/reactivity/src/baseHandlers.ts
var mutableHandlers = {
  get(target, key, receiver) {
    track(target, key);
    const res = Reflect.get(target, key, receiver);
    if (isRef(res)) {
      return res.value;
    }
    if (isObject(res)) {
      return reactive(res);
    }
    return res;
  },
  set(target, key, newValue, receiver) {
    const oldValue = target[key];
    if (isRef(oldValue) && !isRef(newValue)) {
      oldValue.value = newValue;
      return true;
    }
    const res = Reflect.set(target, key, newValue, receiver);
    if (hasChange(newValue, oldValue)) {
      trigger(target, key);
    }
    return res;
  }
};

// packages/reactivity/src/reactive.ts
function reactive(target) {
  return createReactiveObject(target);
}
var reactiveMap = /* @__PURE__ */ new WeakMap();
var reactiveSet = /* @__PURE__ */ new Set();
function createReactiveObject(target) {
  if (!isObject(target)) return target;
  const existingProxy = reactiveMap.get(target);
  if (existingProxy) {
    return existingProxy;
  }
  if (reactiveSet.has(target)) {
    return reactiveMap.get(target);
  }
  const proxy = new Proxy(target, mutableHandlers);
  reactiveMap.set(target, proxy);
  reactiveSet.add(proxy);
  return proxy;
}
function isReactive(target) {
  return reactiveSet.has(target);
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
    this._value = isObject(value) ? reactive(value) : value;
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
    if (hasChange(newValue, this._value)) {
      this._value = isObject(newValue) ? reactive(newValue) : newValue;
      if (this.subs) {
        triggerRef(this);
      }
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
  createReactiveObject,
  effect,
  isReactive,
  isRef,
  reactive,
  ref,
  trackRef,
  triggerRef
};
