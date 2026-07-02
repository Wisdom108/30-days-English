import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// Our custom type-scale utilities (text-body / text-h1 / text-meta …) are
// font-sizes, but tailwind-merge doesn't know that by default — it lumps them
// with text-<color> and drops one when both appear on the same element (which
// made e.g. `text-brand-fg text-body` collapse to white-on-white buttons).
// Register the scale names in the font-size group so colors and sizes coexist.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        {
          text: [
            'display', 'hero', 'title', 'h1', 'h2', 'h3',
            'body-lg', 'body', 'sm', 'meta', 'label', 'read',
          ],
        },
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
