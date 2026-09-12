import { onBeforeUnmount } from 'vue'
import * as echarts from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

// 按需注册，而不是 import 'echarts' 全量引入 —— 后者会多打进去近 1MB
echarts.use([
  BarChart,
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  CanvasRenderer,
])

/**
 * 把 echarts 实例的生命周期绑到组件上。
 *
 * 用 ResizeObserver 而不是监听 window.resize：PC ↔ 移动端切换时
 * 是容器尺寸在变，窗口尺寸可能根本没变，只听 window 会漏掉这种情况。
 */
export function useChart(elRef) {
  let chart = null
  let observer = null

  function setOption(option) {
    if (!elRef.value) return

    if (!chart) {
      chart = echarts.init(elRef.value)
      observer = new ResizeObserver(() => chart?.resize())
      observer.observe(elRef.value)
    }
    chart.setOption(option)
  }

  onBeforeUnmount(() => {
    observer?.disconnect()
    observer = null
    chart?.dispose()
    chart = null
  })

  return { setOption }
}
