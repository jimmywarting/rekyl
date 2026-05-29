import { initGrid } from './table.js'
const date = new Date()

function init (rootElement) {
  const myGridDiv = document.createElement('div')
  rootElement.replaceWith(myGridDiv)
  initGrid(myGridDiv)
}

export {
  init
}