declare module 'frappe-gantt' {
  export interface GanttTask {
    id: string
    name: string
    start: string
    end: string
    progress: number
    dependencies?: string
    custom_class?: string
    [key: string]: unknown
  }

  export interface PopupContext {
    task: GanttTask & { _start: Date; _end: Date; actual_duration: number }
    chart: Gantt
    set_title(title: string): void
    set_subtitle(subtitle: string): void
    set_details(details: string): void
  }

  export interface GanttOptions {
    view_mode?: string
    language?: string
    bar_height?: number
    padding?: number
    popup?: (ctx: PopupContext) => void
    popup_on?: string
    readonly?: boolean
    scroll_to?: string
    today_button?: boolean
    view_mode_select?: boolean
    container_height?: string | number
  }

  export default class Gantt {
    constructor(
      element: HTMLElement | string,
      tasks: GanttTask[],
      options?: GanttOptions
    )
    change_view_mode(mode: string): void
    refresh(tasks: GanttTask[]): void
  }
}
