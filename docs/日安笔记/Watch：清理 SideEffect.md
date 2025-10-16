# 从零到一打造 Vue3 响应式系统 Day 25 - Watch：清理 SideEffect

`watch` 的一个核心用途，是在响应式数据发生变化时执行 **副作用（Side Effect）**。

然而，当副作用是异步的或需要手动清理时，就会出现一个常见问题：  
如果监听的数据在短时间内多次变更，前一次的副作用可能没有被正确清理，导致与下一次副作用冲突或造成 **资源泄漏**。

```jsx
<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8" />
  <title>Document</title>
  <style>
    #app,#div{
      width: 100px;
      height: 100px;
      background-color: red;
      margin-bottom: 10px;
    }
    #div{
      background-color: blue;
    }
  </style>
</head>

<body>
  <div id="app"></div>
  <div id="div"></div>
  <button id="button">按钮</button>
  <script type="module">
    import { ref, watch } from '../dist/reactivity.esm.js'

    const flag = ref(true)

    watch(flag, (newVal, oldVal) => {
      const dom = newVal ? app : div

      function handler () {
        console.log(newVal ? '点击 app' : '点击 div')
      }

      dom.addEventListener('click', handler)
    }, 
    { immediate: true })

    button.onclick = () => {
      flag.value = !flag.value
    }

  </script>
</body>
</html>

```

上面的例子展示了一个典型的资源泄漏问题。 页面上有两个色块，点击 app 会触发事件，点击 div 没反应。 当你点击按钮，使 flag 从 true 变为 false 时，此时点击 div 会被触发，但你再点 app，控制台依然有输出。

这是因为之前在 app 元素上注册的 click 监听器并没有被移除。 逻辑上它已经“失效”，但事件监听器依旧残留在内存中并继续响应点击。

官方解决方案：onCleanup Vue 官方提供了一个 onCleanup 回调函数来解决这个问题。

```jsx
<body>
  <div id="app"></div>
  <div id="div"></div>
  <button id="button">按钮</button>
  <script type="module">
    import { ref, watch } from '../../../node_modules/vue/dist/vue.esm-browser.js'

    const flag = ref(true)

    watch(flag, (newVal, oldVal, onCleanup) => {
      const dom = newVal ? app : div

      function handler () {
        console.log(newVal ? '点击 app' : '点击 div')
      }

      dom.addEventListener('click', handler)

      
      onCleanup(() => {
        dom.removeEventListener('click', handler)
      })
    }, 
    { immediate: true })

    button.onclick = () => {
      flag.value = !flag.value
    }
  </script>
</body>

```

在监听时绑定事件，并通过 onCleanup 注册一个回调函数，在其中执行清理逻辑（例如移除事件监听器）。

onCleanup 注册的回调会在 下一次 watch 回调即将执行之前 被调用， 这能确保在新的副作用开始之前，旧的副作用已被安全清除。

![](https://p6-xtjj-sign.byteimg.com/tos-cn-i-73owjymdk6/d19b80bb93cc4c58b89664befa8c4854~tplv-73owjymdk6-jj-mark-v1:0:0:0:0:5o6Y6YeR5oqA5pyv56S-5Yy6IEAg5oiR5piv5pel5a6J:q75.awebp?rk3s=f64ab15b&x-expires=1760581261&x-signature=lu9gCCyDouoj4D819zCyfWbxBkI%3D)

你会发现再次点击 app 时，它不会被触发了，说明旧的事件监听已被移除。

实现原理
----

```jsx
export function watch(source, cb, options) {
  ...
  let cleanup = null

  function onCleanup(cb) {
    cleanup = cb
  }

  function job() {
    if (cleanup) {
      
      cleanup()
      cleanup = null
    }

    
    const newValue = effect.run()

    cb(newValue, oldValue, onCleanup)

    oldValue = newValue
  }
  ...
}

```

我们把外部传入的 onCleanup 回调保存到变量中， 并在每次执行 job 前检查： 若存在旧的清理函数，则优先执行它，确保之前的副作用被清理。

总结
--

`onCleanup` 是 watch API 中一个非常重要但容易被忽视的特性。 它为开发者提供了一个标准化的机制，用于处理 副作用清理 的两大场景：

资源泄漏：例如事件监听器未被移除、定时器未被清除

异步竞争：例如旧的网络请求结果覆盖了新的请求

通过 `onCleanup`，我们可以优雅地管理副作用的生命周期， 保证每次响应式变化都在一个干净的环境中执行。

* * *

想了解更多 Vue 的相关知识，抖音、B站搜索我师父「远方os」，一起跟日安当同学。