import { initGrid } from './table.js'

function init (rootElement) {
  const myGridDiv = document.createElement('div')
  rootElement.replaceWith(myGridDiv)
  initGrid(myGridDiv)
}

export {
  init
}