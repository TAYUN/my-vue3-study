// packages/runtime-dom/src/nodeOps.ts
var nodeOps = {
  // 插入节点
  insert(el, parent, anchor) {
    parent.insertBefore(el, anchor || null);
  },
  // 创建元素
  createElement(type) {
    return document.createElement(type);
  },
  // 移除元素
  remove(el) {
    const parentNode = el.parentNode;
    if (parentNode) {
      parentNode.removeChild(el);
    }
  },
  // 设置元素的 text
  setElementText(el, text) {
    el.textContent = text;
  },
  // 创建文本节点
  createText(text) {
    return document.createTextNode(text);
  },
  // 设置 nodeValue
  setText(node, text) {
    return node.nodeValue = text;
  },
  // 获取到父节点
  parentNode(el) {
    return el.parentNode;
  },
  // 获取到下一个兄弟节点
  nextSibling(el) {
    return el.nextSibling;
  },
  // dom 查询
  querySelector(selector) {
    return document.querySelector(selector);
  }
};

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

// packages/shared/src/utils.ts
function isObject(value) {
  return typeof value === "object" && value !== null;
}
function hasChange(newValue, oldValue) {
  return !Object.is(newValue, oldValue);
}
function isFunction(value) {
  return typeof value === "function";
}
function isString(value) {
  return typeof value === "string";
}
function isNumber(value) {
  return typeof value === "number";
}
var isArray = Array.isArray;

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
var ObjectRefImpl = class {
  constructor(_object, _key) {
    this._object = _object;
    this._key = _key;
  }
  ["__v_isRef" /* IS_REF */] = true;
  get value() {
    return this._object[this._key];
  }
  set value(newValue) {
    this._object[this._key] = newValue;
  }
};
function toRef(target, key) {
  return new ObjectRefImpl(target, key);
}
function toRefs(object) {
  const res = {};
  for (const key in object) {
    res[key] = toRef(object, key);
  }
  return res;
}
function unref(ref2) {
  return isRef(ref2) ? ref2.value : ref2;
}
function proxyRefs(target) {
  return new Proxy(target, {
    get(target2, key, receiver) {
      const res = Reflect.get(target2, key, receiver);
      return unref(res);
    },
    set(target2, key, newValue, receiver) {
      if (isRef(target2[key]) && !isRef(newValue)) {
        target2[key].value = newValue;
        return true;
      }
      return Reflect.set(target2, key, newValue, receiver);
    }
  });
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

// packages/runtime-core/src/vnode.ts
var Text2 = Symbol("v-text");
function normalizeVNode(vnode) {
  if (isString(vnode) || isNumber(vnode)) {
    return createVNode(Text2, null, String(vnode));
  }
  return vnode;
}
function isVNode(value) {
  return value?.__v_isVNode;
}
function isSameVNodeType(n1, n2) {
  return n1.type === n2.type && n1.key === n2.key;
}
function createVNode(type, props, children) {
  let shapeFlag = 0;
  if (isString(type)) {
    shapeFlag = 1 /* ELEMENT */;
  }
  if (isString(children)) {
    shapeFlag = 8 /* TEXT_CHILDREN */;
  } else if (isArray(children)) {
    shapeFlag = 16 /* ARRAY_CHILDREN */;
  }
  const vnode = {
    __v_isVNode: true,
    type,
    props,
    children,
    key: props?.key,
    el: null,
    shapeFlag
  };
  return vnode;
}

// packages/runtime-core/src/h.ts
function h(type, propsOrChildren, children) {
  let l = arguments.length;
  if (l === 2) {
    if (isArray(propsOrChildren)) {
      return createVNode(type, null, propsOrChildren);
    }
    if (isObject(propsOrChildren)) {
      if (isVNode(propsOrChildren)) {
        return createVNode(type, null, [propsOrChildren]);
      }
      return createVNode(type, propsOrChildren, children);
    }
    return createVNode(type, null, propsOrChildren);
  } else {
    if (l > 3) {
      children = [...arguments].slice(2);
    } else if (isVNode(children)) {
      children = [children];
    }
    return createVNode(type, propsOrChildren, children);
  }
}

// packages/runtime-core/src/apiCreateApp.ts
function createAppAPI(render2) {
  return function createApp2(rootComponent, rootProps) {
    const app = {
      _container: null,
      mount(container) {
        const vnode = h(rootComponent, rootProps);
        render2(vnode, container);
        app._container = container;
      },
      unmount() {
        render2(null, app._container);
      }
    };
    return app;
  };
}

// packages/runtime-core/src/renderer.ts
function createRenderer(options) {
  const {
    createElement: hostCreateElement,
    setElementText: hostSetElementText,
    insert: hostInsert,
    setText: hostSetText,
    remove: hostRemove,
    createText: hostCreateText,
    patchProp: hostPatchProp
  } = options;
  const render2 = (vnode, container) => {
    const unmountChildren = (children) => {
      for (let i = 0; i < children.length; i++) {
        unmount(children[i]);
      }
    };
    const unmount = (vnode2) => {
      const { type, shapeFlag, children } = vnode2;
      if (shapeFlag & 16 /* ARRAY_CHILDREN */) {
        unmountChildren(children);
      }
      hostRemove(vnode2.el);
    };
    const mountChildren = (children, el) => {
      for (let i = 0; i < children.length; i++) {
        const child = children[i] = normalizeVNode(children[i]);
        patch(null, child, el);
      }
    };
    const mountElement = (vnode2, container2, anchor) => {
      const { type, props, children, shapeFlag } = vnode2;
      const el = hostCreateElement(type);
      vnode2.el = el;
      if (props) {
        for (const key in props) {
          hostPatchProp(el, key, null, props[key]);
        }
      }
      if (shapeFlag & 8 /* TEXT_CHILDREN */) {
        hostSetElementText(el, children);
      } else if (shapeFlag & 16 /* ARRAY_CHILDREN */) {
        mountChildren(children, el);
      }
      hostInsert(el, container2, anchor);
    };
    const patchChildren = (n1, n2) => {
      const el = n2.el;
      const prevShapeFlag = n1.shapeFlag;
      const shapeFlag = n2.shapeFlag;
      if (shapeFlag & 8 /* TEXT_CHILDREN */) {
        if (prevShapeFlag & 16 /* ARRAY_CHILDREN */) {
          unmountChildren(n1.children);
        }
        if (n1.children !== n2.children) {
          hostSetElementText(el, n2.children);
        }
      } else {
        if (prevShapeFlag & 8 /* TEXT_CHILDREN */) {
          hostSetElementText(el, "");
          if (shapeFlag & 16 /* ARRAY_CHILDREN */) {
            mountChildren(n2.children, el);
          }
        } else {
          if (prevShapeFlag & 16 /* ARRAY_CHILDREN */) {
            if (shapeFlag & 16 /* ARRAY_CHILDREN */) {
              patchKeyedChildren(n1.children, n2.children, el);
            } else {
              unmountChildren(n1.children);
            }
          } else {
            if (shapeFlag & 16 /* ARRAY_CHILDREN */) {
              mountChildren(n2.children, el);
            }
          }
        }
      }
    };
    const patchKeyedChildren = (c1, c2, container2) => {
      let i = 0;
      let e1 = c1.length - 1;
      let e2 = c2.length - 1;
      while (i <= e1 && i <= e2) {
        const n1 = c1[i];
        const n2 = c2[i] = normalizeVNode(c2[i]);
        if (isSameVNodeType(n1, n2)) {
          patch(n1, n2, container2);
        } else {
          break;
        }
        i++;
      }
      while (i <= e1 && i <= e2) {
        const n1 = c1[e1];
        const n2 = c2[e2] = normalizeVNode(c2[e2]);
        if (isSameVNodeType(n1, n2)) {
          patch(n1, n2, container2);
        } else {
          break;
        }
        e1--;
        e2--;
      }
      if (i > e1) {
        const nextPos = e2 + 1;
        const anchor = nextPos < c2.length ? c2[nextPos].el : null;
        while (i <= e2) {
          patch(null, c2[i] = normalizeVNode(c2[i]), container2, anchor);
          i++;
        }
      } else if (i > e2) {
        while (i <= e1) {
          unmount(c1[i]);
          i++;
        }
      } else {
        let s1 = i;
        let s2 = i;
        const keyToNewIndexMap = /* @__PURE__ */ new Map();
        const newIndexToOldIndexMap = new Array(e2 - s2 + 1);
        newIndexToOldIndexMap.fill(-1);
        for (let j = s2; j <= e2; j++) {
          const n2 = c2[j] = normalizeVNode(c2[j]);
          keyToNewIndexMap.set(n2.key, j);
        }
        let pos = -1;
        let moved = false;
        for (let j = s1; j <= e1; j++) {
          const n1 = c1[j];
          const newIndex = keyToNewIndexMap.get(n1.key);
          if (newIndex != null) {
            if (newIndex > pos) {
              pos = newIndex;
            } else {
              moved = true;
            }
            newIndexToOldIndexMap[newIndex] = j;
            patch(n1, c2[newIndex], container2);
          } else {
            unmount(n1);
          }
        }
        const newIndexSequence = moved ? getSequence(newIndexToOldIndexMap) : [];
        const sequenceSet = new Set(newIndexSequence);
        for (let j = e2; j >= s2; j--) {
          const n2 = c2[j];
          const anchor = c2[j + 1]?.el || null;
          if (n2.el) {
            if (moved) {
              if (!sequenceSet.has(j)) {
                hostInsert(n2.el, container2, anchor);
              }
            }
          } else {
            patch(null, n2, container2, anchor);
          }
        }
      }
    };
    const patchProps = (el, oldProps, newProps) => {
      if (oldProps) {
        for (const key in oldProps) {
          hostPatchProp(el, key, oldProps[key], null);
        }
      }
      if (newProps) {
        for (const key in newProps) {
          hostPatchProp(el, key, oldProps?.[key], newProps[key]);
        }
      }
    };
    const patchElement = (n1, n2) => {
      const el = n2.el = n1.el;
      const oldProps = n1.props;
      const newProps = n2.props;
      patchProps(el, oldProps, newProps);
      patchChildren(n1, n2);
    };
    const processElement = (n1, n2, container2, anchor = null) => {
      if (n1 == null) {
        mountElement(n2, container2, anchor);
      } else {
        patchElement(n1, n2);
      }
    };
    const processText = (n1, n2, container2, anchor) => {
      if (n1 == null) {
        const el = hostCreateText(n2.children);
        n2.el = el;
        hostInsert(el, container2, anchor);
      } else {
        n2.el = n1.el;
        if (n1.children != n2.children) {
          hostSetText(n2.el, n2.children);
        }
      }
    };
    const patch = (n1, n2, container2, anchor = null) => {
      if (n1 === n2) {
        return;
      }
      if (n1 && !isSameVNodeType(n1, n2)) {
        n1 = null;
      }
      const { shapeFlag, type } = n2;
      switch (type) {
        case Text:
          processText(n1, n2, container2, anchor);
          break;
        default:
          if (shapeFlag & 1 /* ELEMENT */) {
            processElement(n1, n2, container2, anchor);
          }
      }
    };
    if (vnode == null) {
      if (container._vnode) {
        unmount(container._vnode);
      }
    } else {
      patch(container._vnode || null, vnode, container);
    }
    container._vnode = vnode;
  };
  return {
    render: render2,
    createApp: createAppAPI(render2)
  };
}
function getSequence(arr) {
  const result = [];
  const map = /* @__PURE__ */ new Map();
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (item === -1 || item === void 0) continue;
    if (result.length === 0) {
      result.push(i);
      continue;
    }
    const lastIndex = result[result.length - 1];
    const lastItem = arr[lastIndex];
    if (item > lastItem) {
      result.push(i);
      map.set(i, lastIndex);
      continue;
    }
    let left = 0;
    let right = result.length - 1;
    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      const midItem = arr[result[mid]];
      if (midItem < item) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }
    if (arr[result[left]] > item) {
      if (left > 0) {
        map.set(i, result[left - 1]);
      }
      result[left] = i;
    }
  }
  let l = result.length;
  let last = result[l - 1];
  while (l > 0) {
    l--;
    result[l] = last;
    last = map.get(last);
  }
  return result;
}

// packages/runtime-dom/src/modules/patchClass.ts
function patchClass(el, value) {
  if (value == void 0) {
    el.removeAttribute("class");
  } else {
    el.className = value;
  }
}

// packages/runtime-dom/src/modules/patchStyle.ts
function patchStyle(el, prevValue, nextValue) {
  const style = el.style;
  if (nextValue) {
    for (const key in nextValue) {
      style[key] = nextValue[key];
    }
  }
  if (prevValue) {
    for (const key in prevValue) {
      if (nextValue?.[key] == null) {
        style[key] = null;
      }
    }
  }
}

// packages/runtime-dom/src/modules/events.ts
function createInvoker(value) {
  const invoker = (e) => {
    invoker.value(e);
  };
  invoker.value = value;
  return invoker;
}
var veiKey = Symbol("_vei");
function patchEvent(el, rawName, nextValue) {
  const name = rawName.slice(2).toLowerCase();
  const invokers = el[veiKey] ??= {};
  const existingInvoker = invokers[rawName];
  if (nextValue) {
    if (existingInvoker) {
      existingInvoker.value = nextValue;
      return;
    }
    const invoker = createInvoker(nextValue);
    invokers[rawName] = invoker;
    el.addEventListener(name, invoker);
  } else {
    if (existingInvoker) {
      el.removeEventListener(name, existingInvoker);
      invokers[rawName] = void 0;
    }
  }
}

// packages/runtime-dom/src/modules/patchAttr.ts
function patchAttr(el, key, value) {
  if (value == void 0) {
    el.removeAttribute(key);
  } else {
    el.setAttribute(key, value);
  }
}

// packages/runtime-dom/src/patchProp.ts
function patchProp(el, key, prevValue, nextValue) {
  if (key === "class") {
    return patchClass(el, nextValue);
  }
  if (key === "style") {
    return patchStyle(el, prevValue, nextValue);
  }
  if (/^on[A-Z]/.test(key)) {
    return patchEvent(el, key, nextValue);
  }
  patchAttr(el, key, nextValue);
}

// packages/runtime-dom/src/index.ts
var renderOptions = { patchProp, ...nodeOps };
var renderer = createRenderer(renderOptions);
function render(vnode, container) {
  renderer.render(vnode, container);
}
function createApp(rootComponent, rootProps) {
  const app = renderer.createApp(rootComponent, rootProps);
  const _mount = app.mount.bind(app);
  function mount(selector) {
    let el = selector;
    if (isString(selector)) {
      el = document.querySelector(selector);
    }
    _mount(el);
  }
  app.mount = mount;
  return app;
}
export {
  ReactiveEffect,
  ReactiveFlags,
  Text2 as Text,
  activeSub,
  computed,
  createApp,
  createReactiveObject,
  createRenderer,
  createVNode,
  effect,
  h,
  isReactive,
  isRef,
  isSameVNodeType,
  isVNode,
  normalizeVNode,
  proxyRefs,
  reactive,
  ref,
  render,
  renderOptions,
  setActiveSub,
  toRef,
  toRefs,
  trackRef,
  triggerRef,
  unref,
  watch
};
