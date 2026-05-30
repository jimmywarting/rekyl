const script = document.createElement('script')
script.type = 'importmap'
script.textContent = JSON.stringify({
  "imports": {
    "ag-grid-community": "https://cdn.jsdelivr.net/npm/ag-grid-community@35.2.0/dist/package/main.esm.min.mjs",
    "ag-grid-enterprise": "https://cdn.jsdelivr.net/npm/ag-grid-enterprise@35.2.0/dist/package/main.esm.min.mjs"
  }
})

document.head.append(script)
script.remove()

async function init (rootElement) {
  const myGridDiv = document.createElement('div')
  myGridDiv.append(Object.assign(document.createElement('progress'), {
    id: 'progress',
    max: "0.0001"
  }))
  rootElement.replaceWith(myGridDiv)

  const { initGrid } = await import('./table.js')
  initGrid(myGridDiv)
}

export {
  init
}