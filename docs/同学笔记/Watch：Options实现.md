# 从零到一打造 Vue3 响应式系统 Day 24 - Watch：Options

 `Watch` 常用的选项有：

*   `immediate`：初始化立即执行一次
*   `deep`：深度监听
*   `once`：只执行一次，执行后自动停止监听

我们先写一个函数，接受三个参数，默认值是空对象。

```jsx
export function watch(source, cb, options) {
  const { immediate, once, deep } = options || {}
  ...
}

```

### immediate

当 `immediate` 为 `true` 时，`watch` 会在初始化时立即执行一次 `job`，此时 callback 中的 `oldValue` 为 `undefined`。  
如果 `immediate` 为 `false`（或未提供），则初始化阶段只会执行 `effect.run()` 收集依赖并拿到 `oldValue`，但不会触发回调。

```scss
export function watch(source, cb, options) {
  const { immediate, once, deep } = options || {}
  ...
  if(immediate) {
    job() 
  } else {
    oldValue = effect.run() 
  }
  ...
}

```

### once

要实现 `once` 功能，可以对用户的 callback 做包装：  
先缓存原始 callback，再用一个匿名函数替换掉 cb，执行完后立刻调用 `stop()` 停止监听。

```scss
export function watch(source, cb, options) {
  const { immediate, once, deep } = options || {}

  if(once) {
    const _cb = cb
    cb = (...args) => {
      _cb(...args)
      stop()
    }
  }
  ...
}

```

### deep

深度监听（`deep: true`）的原理：在依赖收集阶段，递归访问被监听对象的所有嵌套属性。  
访问时会触发 getter，把所有属性都收集为依赖，一旦任意深层属性变化，`watch` 就能收到通知。

```javascript
import { isObject } from '@vue/shared'

export function watch(source, cb, options) {
  const { immediate, once, deep } = options || {}
  ...
  if(deep){
    const baseGetter = getter
    getter = () => traverse(baseGetter())
  }
}

function traverse(value) {
  if(!isObject(value)) return
  for(const key in value) {
    traverse(value[key])
  }
  return value
}

```

不过这样可能会遇到循环引用，所以要加一个 `Set` 来记录访问过的对象：

```scss
function traverse(value, seen = new Set()) {
  if(!isObject(value)) return value
  if(seen.has(value)) return value 

  seen.add(value)
  for(const key in value) {
    traverse(value[key], seen)
  }
  return value
}

```

这样就能避免递归爆栈。

* * *

Vue 3.5 对 `deep` 新增了**层级控制**功能：可以用数字指定监听深度。  
比如下面例子：

```xml
<body>
  <div id="app"></div>
  <script type="module">
    import { ref, watch } from '../dist/reactivity.esm.js'

    const state = ref({
      a: {
        b: 1,
        c: {
          d: 1
        }
      }
    })

    watch(state, (newVal, oldVal) => {
      console.log('newVal, oldVal', newVal, oldVal)
    }, { deep: 2 })

    setTimeout(() => {
      state.value.a.c.d = 2
      console.log('更新了')
    }, 1000)
  </script>
</body>

```

当 `deep` 是数字时，代表递归的层级深度：

*   `deep: 2` → 监听到第二层，修改 `a.b` 会触发
*   修改更深的 `a.c.d` 不会触发

![](https://p9-xtjj-sign.byteimg.com/tos-cn-i-73owjymdk6/9b813428b04540a4b21f0dda707dabf6~tplv-73owjymdk6-jj-mark-v1:0:0:0:0:5o6Y6YeR5oqA5pyv56S-5Yy6IEAg5oiR5piv5pel5a6J:q75.awebp?rk3s=f64ab15b&x-expires=1760659125&x-signature=tKXWx4SCo1umbPHcwERYGoRW8z0%3D)

官方源码里也是这样，超出层级就不会输出：

![](https://p9-xtjj-sign.byteimg.com/tos-cn-i-73owjymdk6/52a78b6217144084909247d3fc574437~tplv-73owjymdk6-jj-mark-v1:0:0:0:0:5o6Y6YeR5oqA5pyv56S-5Yy6IEAg5oiR5piv5pel5a6J:q75.awebp?rk3s=f64ab15b&x-expires=1760659125&x-signature=swj8q5i%2FtnscsF%2BFGXqWJw%2BJE%2Bs%3D)

实现：

```scss
if(deep){
  const baseGetter = getter
  const depth = deep === true ? Infinity : deep
  getter = () => traverse(baseGetter(), depth)
}

function traverse(value, depth = Infinity, seen = new Set()) {
  if(!isObject(value) || depth <= 0) return value
  if(seen.has(value)) return value

  seen.add(value)
  depth--

  for(const key in value) {
    traverse(value[key], depth, seen)
  }
  return value
}

```

通过 `depth--` 控制递归深度。

* * *

### reactive 与 function 处理

当我们把 source 改成 `reactive` 对象时，控制台会报错：

![](https://p9-xtjj-sign.byteimg.com/tos-cn-i-73owjymdk6/95ec27622c704eafb3bd92608101061f~tplv-73owjymdk6-jj-mark-v1:0:0:0:0:5o6Y6YeR5oqA5pyv56S-5Yy6IEAg5oiR5piv5pel5a6J:q75.awebp?rk3s=f64ab15b&x-expires=1760659125&x-signature=KWwd72HdwTPvVSNZflBQaWqzGKI%3D)

查看官方源码：当监听源是 `reactive` 时，`deep` 默认就是 `true`。

![](https://p9-xtjj-sign.byteimg.com/tos-cn-i-73owjymdk6/434244a714224c969fc31a10ba905124~tplv-73owjymdk6-jj-mark-v1:0:0:0:0:5o6Y6YeR5oqA5pyv56S-5Yy6IEAg5oiR5piv5pel5a6J:q75.awebp?rk3s=f64ab15b&x-expires=1760659125&x-signature=gZ5WTNxXXfybQBAkaMePrI2W7ic%3D)

所以要调整 getter 初始化逻辑：

*   如果是 `ref` → getter = `() => source.value`
*   如果是 `reactive` → getter = `() => source`，并且默认 `deep = true`
*   如果是函数 → 直接作为 getter

```scss
if(isRef(source)) {
  getter = () => source.value
}else if(isReactive(source)){
  getter = () => source
  if(!deep) deep = true
}else if(isFunction(source)){
  getter = source
}

```

这样就能兼容 `ref`、`reactive` 和函数。

* * *

总结
--

我们给 `watch` 增加了三个选项：

*   `immediate`：初始化立即执行一次
*   `once`：只执行一次后自动停止
*   `deep`：支持深度监听，支持层级递归控制，并解决循环引用问题

同时调整了 getter 初始化逻辑，使其兼容 `ref`、`reactive`、函数三种情况。

这样 `watch` 的基础功能和常用配置就完成了

* * *

想了解更多 Vue 的相关知识，抖音、B站搜索我师父「远方os」，一起跟日安当同学。