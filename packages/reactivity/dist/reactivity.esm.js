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
function processComputedUpdate(sub) {
  if (sub.subs && sub.update()) {
    propagate(sub.subs);
  }
}
function propagate(subs) {
  let link2 = subs;
  let queuedEffect = [];
  while (link2) {
    const sub = link2.sub;
    if (!sub.tracking && !sub.dirty) {
      sub.dirty = true;
      if ("update" in sub) {
        processComputedUpdate(sub);
      } else {
        queuedEffect.push(sub);
      }
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
  sub.dirty = false;
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
function setActiveSub(sub) {
  activeSub = sub;
}
var ReactiveEffect = class {
  // 是否启用监听
  constructor(fn) {
    this.fn = fn;
  }
  // 依赖项链表的头节点，指向Link
  deps;
  // 依赖项链表的尾节点，指向Link
  depsTail;
  tracking = false;
  // 是否正在执行（收集中）
  dirty = false;
  // 是否需要重新计算（用于控制入队）
  active = true;
  run() {
    if (!this.active) {
      return this.fn();
    }
    const prevSub = activeSub;
    setActiveSub(this);
    startTrack(this);
    try {
      return this.fn();
    } finally {
      endTrack(this);
      setActiveSub(prevSub);
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
  stop() {
    if (this.active) {
      startTrack(this);
      endTrack(this);
      this.active = false;
    }
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
function isObject(value) {
  return typeof value === "object" && value !== null;
}
function hasChange(newValue, oldValue) {
  return !Object.is(newValue, oldValue);
}
function isFunction(value) {
  return typeof value === "function";
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
  const targetIsArray = Array.isArray(target);
  if (targetIsArray && key === "length") {
    const newLength = target.length;
    depsMap.forEach((dep, depKey) => {
      if (depKey === "length" || depKey >= newLength) {
        propagate(dep.subs);
      }
    });
  } else {
    let dep = depsMap.get(key);
    if (!dep) {
      return;
    }
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
    const targetIsArray = Array.isArray(target);
    const oldLength = targetIsArray ? target.length : 0;
    if (isRef(oldValue) && !isRef(newValue)) {
      oldValue.value = newValue;
      return true;
    }
    const res = Reflect.set(target, key, newValue, receiver);
    if (hasChange(newValue, oldValue)) {
      trigger(target, key);
    }
    const newLength = targetIsArray ? target.length : 0;
    if (targetIsArray && newLength !== oldLength && key !== "length") {
      trigger(target, "length");
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
var ReactiveFlags = /* @__PURE__ */ ((ReactiveFlags2) => {
  ReactiveFlags2["IS_REF"] = "__v_isRef";
  return ReactiveFlags2;
})(ReactiveFlags || {});
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

// packages/reactivity/src/computed.ts
function computed(getterOptions) {
  let getter;
  let setter;
  if (isFunction(getterOptions)) {
    getter = getterOptions;
  } else {
    getter = getterOptions.get;
    setter = getterOptions.set;
  }
  return new ComputedRefImpl(getter, setter);
}
var ComputedRefImpl = class {
  constructor(fn, setter) {
    this.fn = fn;
    this.setter = setter;
  }
  // computed也是ref，返回true
  ["__v_isRef" /* IS_REF */] = true;
  _value;
  //保持fn的返回值
  // 作为订阅者 Dependency，记录关联的subs，等我值更新了，我要通知他们
  // 订阅者链表头节点
  subs;
  // 订阅者链表尾节点
  subsTail;
  // 作为依赖项 Sub。记录哪些dep，被我收集了
  // 依赖项链表的头节点，指向Link
  deps;
  // 依赖项链表的尾节点，指向Link
  depsTail;
  // 是否正在执行（收集中）
  tracking = false;
  // 计算属性是否需要重新计算；为 true 时重新计算
  dirty = true;
  get value() {
    if (this.dirty) {
      this.update();
    }
    if (activeSub) {
      link(this, activeSub);
    }
    return this._value;
  }
  set value(newValue) {
    if (this.setter) {
      this.setter(newValue);
    } else {
      console.warn("\u6211\u662F\u53EA\u8BFB\u7684\uFF0C\u4E0D\u80FD\u8BBE\u7F6E\u503C");
    }
  }
  update() {
    const prevSub = activeSub;
    setActiveSub(this);
    startTrack(this);
    try {
      const oldValue = this._value;
      this._value = this.fn();
      return hasChange(oldValue, this._value);
    } finally {
      endTrack(this);
      setActiveSub(prevSub);
    }
  }
};

// packages/reactivity/src/watch.ts
function watch(source, cb, options) {
  let { immediate, once, deep } = options || {};
  let getter;
  if (isRef(source)) {
    getter = () => source.value;
  } else if (isReactive(source)) {
    getter = () => source;
    if (!deep) {
      deep = true;
    }
  } else if (isFunction(source)) {
    getter = source;
  }
  let oldValue;
  if (once) {
    const _cb = cb;
    cb = (...args) => {
      _cb(...args);
      stop();
    };
  }
  if (deep) {
    const baseGetter = getter;
    const depth = deep === true ? Infinity : deep;
    getter = () => traverse(baseGetter(), depth);
  }
  let cleanup = null;
  function onCleanup(cb2) {
    cleanup = cb2;
  }
  function job() {
    if (cleanup) {
      cleanup();
      cleanup = null;
    }
    const newValue = effect2.run();
    cb(newValue, oldValue, onCleanup);
    oldValue = newValue;
  }
  function stop() {
    effect2.stop();
  }
  const effect2 = new ReactiveEffect(getter);
  effect2.scheduler = job;
  if (immediate) {
    job();
  } else {
    oldValue = effect2.run();
  }
  return () => {
    stop();
  };
}
function traverse(value, depth = Infinity, seen = /* @__PURE__ */ new Set()) {
  if (!isObject(value) || depth <= 0) {
    return value;
  }
  if (seen.has(value)) {
    return value;
  }
  seen.add(value);
  depth--;
  for (const key in value) {
    traverse(value[key], depth, seen);
  }
  return value;
}
export {
  ReactiveEffect,
  ReactiveFlags,
  activeSub,
  computed,
  createReactiveObject,
  effect,
  isReactive,
  isRef,
  reactive,
  ref,
  setActiveSub,
  trackRef,
  triggerRef,
  watch
};
