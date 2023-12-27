import { flushSync } from "react-dom";
import { useState } from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { exportToPng, exportToSvg } from "../lib/export";
import { ElementTab } from "./ElementTab";
import { useOg } from "./OgPlayground";
import { Button } from "./Button";
import { SvgIcon } from "./icons/SvgIcon";
import { PngIcon } from "./icons/PngIcon";
import { VisibleIcon } from "./icons/VisibleIcon";
import { UndoIcon } from "./icons/UndoIcon";
import { RedoIcon } from "./icons/RedoIcon";

function domToReactLike(element: Element, dynamicTextReplace: string): Record<string, unknown> {
  const props: Record<string, unknown> = {}
  const children = []

  for (const attribute of element.attributes) {
    if (attribute.name === 'style') {
      const style: Record<string, string> = {}
      const declarations = attribute.value.split(/;( |$)/)

      for (const declaration of declarations) {
        const [property, value] = declaration.split(/:(.*)/)

        if (property && value) {
          let finalValue = value.trim()

          if (property === 'box-shadow' && finalValue.startsWith('rgb(')) {
            let rgbValue: string | undefined

            finalValue = finalValue.replace(/rgb\((.*)\)/, (_, rgb) => {
              rgbValue = rgb as string
              return ''
            })

            if (rgbValue) {
              finalValue += ` rgb(${rgbValue})`
            }
          }

          style[property] = finalValue
        }
      }

      props.style = style
      continue
    }
  }

  for (const child of element.children) {
    children.push(domToReactLike(child, dynamicTextReplace))
  }

  if (children.length === 0 && element.textContent) {
    if (element.textContent === '[dynamic text]') {
      children.push(dynamicTextReplace)
    } else {
      children.push(element.textContent)
    }
  }

  return {
    type: element.tagName.toLowerCase(),
    props: {
      ...props,
      children,
    },
  }
}

export function LeftPanel() {
  const { rootRef, elements, setSelectedElement, setElements, undoRedo } = useOg()
  const [ogImage, setOgImage] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  async function getFonts() {
    return Promise.all(elements.filter(element => element.tag === 'p' || element.tag === 'span').map(async element => {
      // @ts-expect-error -- wrong inference
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- wrong inference
      const fontName = element.fontFamily.toLowerCase().replace(' ', '-')
      // @ts-expect-error -- wrong inference
      const data = await fetch(`https://fonts.bunny.net/${fontName}/files/${fontName}-latin-${element.fontWeight}-normal.woff`).then(response => response.arrayBuffer())

      return {
        // @ts-expect-error -- wrong inference
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- wrong inference
        name: element.fontFamily,
        data,
        // @ts-expect-error -- wrong inference
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- wrong inference
        weight: element.fontWeight,
      }
    }))
  }

  async function exportSvg(openInNewTab = true) {
    if (!rootRef.current) {
      return {}
    }

    flushSync(() => {
      setSelectedElement(null)
    })

    const reactLike = domToReactLike(rootRef.current, 'This is a dynamic text')
    const fonts = await getFonts()
    const svg = await exportToSvg(reactLike, fonts)

    if (openInNewTab) {
      const blob = new Blob([svg], { type: 'image/svg+xml' })
      const url = URL.createObjectURL(blob)
      window.open(url)
    }

    return { fonts, svg }
  }

  async function exportPng() {
    const { svg, fonts } = await exportSvg(false)
    const png = await exportToPng(svg ?? '', fonts?.map(font => new Uint8Array(font.data)) ?? [])

    const blob = new Blob([png], { type: 'image/png' })
    const url = URL.createObjectURL(blob)
    window.open(url)
  }

  async function preview() {
    const { svg } = await exportSvg(false)
    setOgImage(svg ?? '')
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over) {
      return;
    }

    if (active.id !== over.id) {
      const oldIndex = elements.findIndex(element => element.id === active.id)
      const newIndex = elements.findIndex(element => element.id === over.id)

      const newElements = arrayMove(elements, oldIndex, newIndex);
      setElements(newElements);
    }
  }

  return (
    <div className="flex flex-col items-start gap-4 p-4">
      <p className="text-xs text-gray-600">Elements</p>
      <div className="flex flex-col-reverse w-full">
        <DndContext collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={handleDragEnd} onDragOver={handleDragEnd} sensors={sensors}>
          <SortableContext items={elements} strategy={verticalListSortingStrategy}>
            {elements.map(element => (
              <ElementTab element={element} key={element.id} />
            ))}
          </SortableContext>
        </DndContext>
      </div>
      <div className="h-[1px] w-full bg-gray-100" />
      <p className="text-xs text-gray-600">Modifications</p>
      <div className="grid grid-cols-2 gap-2 w-full">
        <Button icon={<UndoIcon />} onClick={() => { undoRedo('undo'); }}>Undo</Button>
        <Button icon={<RedoIcon />} onClick={() => { undoRedo('redo'); }}>Redo</Button>
      </div>
      <div className="h-[1px] w-full bg-gray-100" />
      <p className="text-xs text-gray-600">Export</p>
      <div className="grid grid-cols-1 gap-2 w-full">
        <Button icon={<VisibleIcon />} onClick={() => preview()}>Preview</Button>
        <Button icon={<SvgIcon />} onClick={() => exportSvg()}>Export as SVG</Button>
        <Button icon={<PngIcon />} onClick={() => exportPng()}>Export as PNG</Button>
      </div>
      {ogImage ? (
        <div className="absolute top-0 left-0 z-50">
          <div className="w-[1200px] h-[630px] " dangerouslySetInnerHTML={{ __html: ogImage }} />
          <button onClick={() => { setOgImage(null); }} type="button">Close</button>
        </div>
      ) : null}
    </div >
  )
}