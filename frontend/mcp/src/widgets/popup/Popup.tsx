import type { PopupModel } from "./popupTemplate"

import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card"
import { Button } from "../../components/ui/Button"

type Props = {
  model: PopupModel
  onClose: () => void
  onPrev: () => void
  onNext: () => void
  canPrev: boolean
  canNext: boolean
  positionLabel: string
}

export function Popup(props: Props) {
  const { model } = props

  return (
    <div className="flex flex-col items-center">
      <Card className="w-[320px] max-w-[85vw] max-h-[30vh] flex flex-col shadow-lg border-zinc-200">
        <CardHeader className="p-3 pb-2 bg-zinc-50/80 border-b border-zinc-200">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-sm font-semibold leading-tight pr-1">{model.title}</CardTitle>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 -mr-1 -mt-1 text-zinc-500 hover:text-zinc-900"
              title="Fechar"
              onClick={props.onClose}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="h-4 w-4"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Button>
          </div>
        </CardHeader>

        <CardContent className="min-h-0 flex-1 overflow-auto p-3 space-y-1 bg-white">
          {model.rows.map((row, i) => (
            <div
              key={i}
              className={"flex gap-2 rounded-md px-2 py-1.5 " + (i % 2 === 0 ? "bg-white" : "bg-zinc-50")}
            >
              <div className="w-24 shrink-0 text-xs font-medium text-zinc-500">{row.label}</div>
              <div className="min-w-0 flex-1 break-words text-sm text-zinc-900">{row.value}</div>
            </div>
          ))}
          {model.rows.length === 0 && (
            <div className="text-sm text-zinc-500">Sem campos configurados no popupTemplate.</div>
          )}
        </CardContent>

        <div className="shrink-0 flex items-center justify-between gap-2 border-t border-zinc-200 px-2 py-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-zinc-600 disabled:opacity-40"
            title="Anterior"
            onClick={props.onPrev}
            disabled={!props.canPrev}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="h-4 w-4"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </Button>

          <div className="text-[11px] text-zinc-500 select-none">{props.positionLabel}</div>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-zinc-600 disabled:opacity-40"
            title="Próximo"
            onClick={props.onNext}
            disabled={!props.canNext}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="h-4 w-4"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </Button>
        </div>
      </Card>

      {/* Speech-bubble pointer */}
      <div className="pointer-events-none relative -mt-px">
        <div className="h-0 w-0 border-x-[12px] border-x-transparent border-t-[12px] border-t-zinc-200" />
        <div className="absolute left-1/2 top-0 h-0 w-0 -translate-x-1/2 -translate-y-px border-x-[11px] border-x-transparent border-t-[11px] border-t-white" />
      </div>
    </div>
  )
}
