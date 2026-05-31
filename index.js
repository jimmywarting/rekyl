const script = document.createElement('script')
script.type = 'importmap'
script.textContent = JSON.stringify({
  "imports": {
    "ag-grid-community": "https://cdn.jsdelivr.net/npm/ag-grid-community@35.2.0/dist/package/main.esm.mjs",
    "ag-charts-enterprise": "https://cdn.jsdelivr.net/npm/ag-charts-enterprise@13.3.0/+esm",
    "ag-grid-enterprise": "http://localhost:3846/main.esm.mjs"
  }
})

document.head.append(script)
script.remove()

async function init (rootElement) {
  const myGridDiv = document.createElement('div')
  myGridDiv.innerHTML = `
    <progress id="progress" max="0.0001"></progress>
    <style>
      .shadow-actionbarless {
        display: none !important;
      }
    </style>
  `

  rootElement.replaceWith(myGridDiv)
  myGridDiv.style.flex = '1'

  const { initGrid } = await import('./table.js')
  initGrid(myGridDiv)
}

export {
  init
}