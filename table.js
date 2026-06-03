import { createGrid, themeQuartz, iconSetMaterial, ModuleRegistry } from 'ag-grid-community';
// import { AllEnterpriseModule } from 'ag-grid-enterprise';
import { AllEnterpriseModule } from './main.esm.js';
import { AG_GRID_LOCALE_SE } from 'https://esm.sh/@ag-grid-community/locale@35.2.0/es2022/locale.mjs?exports=AG_GRID_LOCALE_SE'
import { AgChartsEnterpriseModule } from 'ag-charts-enterprise';


import state from './state.json' with { type: 'json' }
import tables from './schema.js'
import { queryBuilder } from './query-builder.js';

// to use myTheme in an application, pass it to the theme grid option
const myTheme = themeQuartz
    .withParams({
        headerVerticalPaddingScale: 0.32,
        backgroundColor: "#1f2836",
        browserColorScheme: "dark",
        chromeBackgroundColor: {
            ref: "foregroundColor",
            mix: 0.07,
            onto: "backgroundColor"
        },
        foregroundColor: "#FFF"
    });

/**
 * @template T
 * @param {T} value
 * @returns {NonNullable<T>} `value` unchanged
 */
function nn(value) {
  return /** @type {NonNullable<T>} */ (value);
}

/**
 * Parse a free-form text input into unique numeric IDs.
 * Any non-digit character is treated as a separator.
 * @param {string | number | null | undefined} input
 * @returns {number[]}
 */
function parseIdList(input) {
  const text = String(input ?? '')
  const matches = text.match(/\d+/g) || []
  return [...new Set(matches.map(Number).filter(Number.isFinite))]
}

const GRID_VIEWS_STORAGE_KEY = 'rekyl.gridViews'
const ACTIVE_GRID_VIEW_STORAGE_KEY = 'rekyl.activeGridView'
const LEGACY_GRID_STATE_STORAGE_KEY = 'gridState'

/** @returns {Record<string, any>} */
function getStoredGridViews() {
  try {
    const parsed = JSON.parse(localStorage.getItem(GRID_VIEWS_STORAGE_KEY) || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

/** @param {Record<string, any>} views */
function setStoredGridViews(views) {
  localStorage.setItem(GRID_VIEWS_STORAGE_KEY, JSON.stringify(views))
}

/** @returns {string} */
function getActiveGridViewName() {
  return localStorage.getItem(ACTIVE_GRID_VIEW_STORAGE_KEY) || ''
}

/** @param {string} name */
function setActiveGridViewName(name) {
  if (name) {
    localStorage.setItem(ACTIVE_GRID_VIEW_STORAGE_KEY, name)
  } else {
    localStorage.removeItem(ACTIVE_GRID_VIEW_STORAGE_KEY)
  }
}

function migrateLegacyGridState() {
  if (localStorage.getItem(GRID_VIEWS_STORAGE_KEY)) return

  const legacyState = localStorage.getItem(LEGACY_GRID_STATE_STORAGE_KEY)
  if (!legacyState) return

  try {
    const parsedState = JSON.parse(legacyState)
    setStoredGridViews({ Default: parsedState })
    if (!getActiveGridViewName()) {
      setActiveGridViewName('Default')
    }
  } catch {
    // Ignore invalid legacy state and fall back to the bundled default state.
  }
}

let salesman = new Map();
let projects = new Map();

// Register the module
ModuleRegistry.registerModules([
  AllEnterpriseModule,
  // AgChartsEnterpriseModule,
]);

// Helper to convert ISO strings to Date objects during JSON parsing
const dateReviver = (key, value) => {
  const isISO = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value);
  return isISO ? new Date(value) : value;
};

// 2. Dynamically generate AG Grid column definitions based on the first row's data types
// function generateColumnDefs(firstRow, parentKey = '') {
//     if (!firstRow) return [];

//     return Object.keys(firstRow).map(key => {
//         const value = firstRow[key];
//         const colDef = {
//           field: parentKey ? `${parentKey}.${key}` : key,
//           headerName: key
//         };

//         if (parentKey) {
//           colDef.headerValueGetter = params => params.location === 'advancedFilter' ? colDef.field : key;
//         }

//         if (typeof value === 'number') {
//           colDef.filter = 'agNumberColumnFilter';
//           colDef.type = 'numericColumn';
//         } else if (value instanceof Date) {
//           colDef.filter = 'agDateColumnFilter';
//         } else if (typeof value === 'string') {
//           colDef.filter = 'agTextColumnFilter';
//         } else if (typeof value === 'object' && value !== null) {
//           // create nested column definitions for object properties
//           colDef.children = generateColumnDefs(value, colDef.field);
//         }
//         return colDef;
//     });
// }

const progress = nn(document.getElementById('progress'))

const client = {
  request (url, options = {}) {
    return fetch(`https://api.rekyl.nu/8399/v1/${url}`, {
      credentials: 'include',
      ...options
    })
  }
}

/** @param {string} url */
async function fetchJson(url) {
  progress.max += 1
  const res = await client.request(url + '?page=1&rows=1000')
  const text = await res.text()
  const data = JSON.parse(text, dateReviver)

  progress.value += 1
  const allRows = data.rows || data
  if (data.pageCount > 1) {
    progress.max += data.pageCount - 1
    for (let i = 2; i <= data.pageCount; i++) {
    // for (let i = 2; i <= 3; i++) {
      const res = await client.request(url + `?page=${i}&rows=1000`)
      const text = await res.text()
      progress.value += 1
      const pageData = JSON.parse(text, dateReviver)
      allRows.push(...pageData.rows)
    }
  }

  if (data.rows) {
    const allKeys = Object.keys(allRows[0])
    for (const key of allKeys) {
      if (allRows.every(row => !row[key])) {
        allRows.forEach(row => delete row[key])
      }
    }
  }

  if (progress.value === progress.max) {
    progress.max = 1
    progress.value = 1
  }

  return allRows
}

// Create a indexedDB
async function initDB() {
  const request = indexedDB.open('rekyl-data', 1)

  request.onupgradeneeded = event => {
    const db = event.target.result
    db.createObjectStore('workorder', { keyPath: 'id' })
    db.createObjectStore('project', { keyPath: 'id' })
    db.createObjectStore('salesman', { keyPath: 'id' })
    db.createObjectStore('company', { keyPath: 'id' })
    db.createObjectStore('localConfig', { keyPath: 'key' })
  }

  await transaction(request)

  return request.result
}

/**
 * @param {IDBRequest<any>} request
 */
function transaction (request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function kv(db, key, val) {
  const tx = db.transaction('localConfig', 'readwrite')
  const store = tx.objectStore('localConfig')

  if (val === undefined) {
    return transaction(store.get(key)).then(res => res?.value)
  } else {
    return transaction(store.put({ key, value: val }))
  }
}

async function sync () {
  const db = await initDB()

  const lastSync = new Date(await kv(db, 'lastSync') || new Date(0))
  const tables = ['workorder', 'project', 'salesman']

  // return early if last sync was less than 30 minutes ago
  if (Date.now() - lastSync.getTime() < 5 * 60 * 1000) {
    console.log('Last sync was less than 30 minutes ago, skipping sync')
    return
  }

  const query = queryBuilder({
    rows: 1000,
    // @ts-ignore
    filters: lastSync.getTime() ? [{
      field: 'modified',
      op: 'gt',
      value: lastSync.toISOString()
    }] : []
  })

  for (const table of tables) {
    const res = await client.request(table + '?' + query)
    const text = await res.text()
    const data = JSON.parse(text, dateReviver)
    const allRows = data.rows || data

    // insert or update rows in indexedDB
    const tx = db.transaction(table, 'readwrite')
    const store = tx.objectStore(table)
    for (const row of allRows) {
      await transaction(store.put(row))
    }
    console.log(`Synced ${allRows.length} rows for table ${table} (page 1/${data.pageCount || 1})`)
    console.log(`Synced page 1/${data.pageCount || 1} for table ${table}`)

    if (data.pageCount > 1) {
      for (let i = 2; i <= data.pageCount; i++) {
        console.log(`Fetching page ${i}/${data.pageCount} for table ${table}...`)
        query.set('page', i)
        const res = await client.request(table + '?' + query)
        const text = await res.text()
        const pageData = JSON.parse(text, dateReviver)

        // insert or update rows in indexedDB
        const tx = db.transaction(table, 'readwrite')
        const store = tx.objectStore(table)
        for (const row of pageData.rows) {
          await transaction(store.put(row))
        }
        console.log(`Synced page ${i}/${data.pageCount} for table ${table}`)
      }
      query.delete('page')
    }

    console.log(`Synced ${allRows.length} rows for table ${table}`)
  }

  // Update last sync time
  const tx2 = db.transaction('localConfig', 'readwrite')
  const store2 = tx2.objectStore('localConfig')
  await transaction(store2.put({ key: 'lastSync', value: new Date() }))

  console.log('Sync complete')
}

await sync()

const company = new Map()

class ClickableStatusBarComponent  {
    params;
    eGui;
    eButton;
    buttonListener;

    init(params) {
        this.params = params;
        console.log(this.params)
        this.eGui = document.createElement('div');
        this.eGui.className = 'ag-status-name-value';

        const label = document.createElement('span');
        label.textContent = 'Status Bar Component ';
        this.eGui.appendChild(label);

        this.eButton = document.createElement('button');

        this.buttonListener = this.onButtonClicked.bind(this);
        this.eButton.addEventListener('click', this.buttonListener);
        this.eButton.textContent = 'Click Me';

        this.eGui.appendChild(this.eButton);
    }

    getGui() {
        return this.eGui;
    }

    destroy() {
        this.eButton.removeEventListener('click', this.buttonListener);
    }

    onButtonClicked() {
        console.log('Selected Row Count: ' + gridApi.getSelectedRows());
    }
}

// 3. Initialize the Grid
async function initGrid (gridDiv) {
  // const p = Promise.all([
  //   fetchJson('workorder'),
  //   fetchJson('salesman'),
  //   fetchJson('project'),
  // ])

  const db = await initDB()

  const p = Promise.all([
    'workorder',
    'salesman',
    'project',
  ].map(table => {
    const tx = db.transaction(table, 'readonly')
    const store = tx.objectStore(table)
    return transaction(store.getAll())
  }))

  const [data, salesmenData, projectsData] = await p;

  salesmenData.forEach(row => salesman.set(row.id, row));
  projectsData.forEach(row => {
    projects.set(row.id, row)
    projects.set(row.projectNumber, row)
  })

  for (const row of data) {
    // row.project = projects.get(row.projectNumber) || row.project;
    // delete row.projectNumber
    // delete row.project0
    // delete row.project1
    // delete row.project2

    if (!company.has(row.company)) {
      if (!row.company) {
        console.log('Row has no company:', row)
        continue
      }
      await fetchJson('company/' + row.company).then(data => {
        if (data) {
          company.set(row.company, data)
        }
      }, () => {})
    }
    // row.company = comp[row.company]
    // row.supervisor = salesman.get(row.supervisor)
    // row.salesman = salesman.get(row.salesman)
    // row.manager = salesman.get(row.manager)
  }

  // build column definitions based on table schema
  const table = new Map([
    ['workorder', { columnDefs: [], data: new Map(data.map(row => [row.id, row])) }],
    ['project', { columnDefs: [], data: projects }],
    ['salesman', { columnDefs: [], data: salesman }],
    ['company', { columnDefs: [], data: company }],
  ])

  // Maps source column name -> target table name (for Proxy resolution)
  const refMap = new Map()

  for (const [tableName, tableInfo] of Object.entries(tables)) {
    const { schema, view } = tableInfo
    const t = table.getOrInsertComputed(tableName, () => ({ columnDefs: [], data: new Map() }))
    for (const [columnName, column] of Object.entries(schema)) {
      const colDef = {
        field: `${tableName}.${columnName}`,
        headerName: column.label || columnName,
        ...(column.ag || {})
      }

      // if (column.required) {
      //   colDef.filterParams = {
      //     suppressAndEmptyHelpers: true, // Tar bort "Blanks" från listan
      //   }
      // }

      if (view && column.primary) {
        colDef.cellRenderer = (params) => {
          const val = params.value
          if (val === undefined || val === null) return ''
          // Get the referenced object: field is like "manager.name",
          // so the first segment is the source column on the row proxy
          const sourceCol = params.colDef.field.split('.')[0]
          const refData = params.data[sourceCol]
          const link = document.createElement('a')
          link.href = view(refData || {})
          link.target = '_blank'
          link.textContent = val
          return link
        }
      }

      if (column.type === 'number') {
        colDef.filter = 'agNumberColumnFilter';

        if (columnName === 'id') {
          colDef.filter = 'agTextColumnFilter';
          colDef.filterParams = {
            filterOptions: [
              'equals',
              'notEqual',
              'lessThan',
              'lessThanOrEqual',
              'greaterThan',
              'greaterThanOrEqual',
              'inRange',
              {
                displayKey: 'inIdList',
                displayName: 'Finns i ID-lista',
                numberOfInputs: 1,
                predicate: ([filterText], cellValue) => {
                  if (cellValue === null || cellValue === undefined || cellValue === '') {
                    return false
                  }

                  const ids = parseIdList(filterText)
                  if (!ids.length) return false

                  const numericCellValue = Number(cellValue)
                  if (!Number.isFinite(numericCellValue)) return false

                  return ids.includes(numericCellValue)
                }
              },
            ],
          }
        }
      } else if (column.type === 'enum') {
        colDef.filter = 'agSetColumnFilter';
        const valueFormatter = params => {
          const val = params.value
          if (val === undefined || val === null) return ''
          return column.values[val] || val
        }
        colDef.valueFormatter = valueFormatter
        colDef.cellEditor = 'agRichSelectCellEditor';
        colDef.filterParams = {
          valueFormatter,
          values: column.values.map((label, value) => value),
        }
        colDef.cellEditorParams = {
          values: column.values.map((label, value) => value),
        }
      } else if (column.type === 'date' || column.type === 'datetime') {
        colDef.filter = 'agDateColumnFilter';
      } else if (column.type === 'string') {
        colDef.filter = 'agTextColumnFilter';
      } else if (column.type === 'reference') {
        const refTableName = column.ref.split('|')[0]
        table.getOrInsertComputed(refTableName, () => ({ columnDefs: [], data: new Map() }))
        refMap.set(columnName, refTableName)
        colDef._refTableName = refTableName
        colDef._sourceColumn = columnName
      }
      t.columnDefs.push(colDef)
    }
  }

  // Second pass: create unique children for each reference column.
  // Reverse iteration ensures leaf tables are resolved first so nested
  // references (e.g. manager -> salesman -> company) get their children too.
  for (const [, tableEntry] of [...table].reverse()) {
    for (const colDef of tableEntry.columnDefs) {
      if (colDef._refTableName) {
        const refEntry = table.get(colDef._refTableName)
        if (refEntry) {
          const src = colDef._sourceColumn
          const refTable = colDef._refTableName
          colDef.children = refEntry.columnDefs.map(({ _refTableName, _sourceColumn, ...rest }) => ({
            ...rest,
            field: rest.field.replace(refTable + '.', src + '.'),
          }))
        }
        delete colDef._refTableName
        delete colDef._sourceColumn
      }
    }
  }

  // Hide loader
  // nn(document.getElementById('loader')).hidden = true
    const columnDefs = table.get('workorder').columnDefs
  const notesStore = {}

    migrateLegacyGridState()
    // const showThis = [
    //   'start',
    //   'project',
    //   'id',
    //   'status',
    //   'salesman',
    //   'customText14',
    //   'manager',
    //   'assignerSeparate',
    //   'orderType',
    //   'custom4',
    //   'workingsite',
    //   'hours',
    // ]

    // showThis.forEach(field => {
    //   const col = columnDefs.find(col => col.field === `workorder.${field}`)
    //   if (col) col.hide = false
    // })
    // table.get('project').columnDefs.find(col => col.field === 'project.projectNumber').hide = false
    // table.get('company').columnDefs.find(col => col.field === 'company.name').hide = false
    // table.get('salesman').columnDefs.find(col => col.field === 'salesman.name').hide = false

    // change the order of columnDefs based on the order of keys in overrides
    // const orderedFields = Object.keys(overrides)
    // columnDefs.sort((a, b) => {
    //   const aIndex = orderedFields.indexOf(a.field)
    //   const bIndex = orderedFields.indexOf(b.field)
    //   if (aIndex === -1 && bIndex === -1) return 0
    //   if (aIndex === -1) return 1
    //   if (bIndex === -1) return -1
    //   return aIndex - bIndex
    // })

    // for (const [field, settings] of Object.entries(overrides)) {
    //   Object.assign(columnMap.get(field), settings)
    // }

    // const proj = columnMap.get('project').children.find(col => col.field.endsWith('.projectNumber'))
    // proj.hide = false
    // proj.cellRenderer = (params, a) => {
    //   if (!params.value) return '';
    //   const link = document.createElement('a')
    //   link.href = `https://app.rekyl.nu/v5/8399/details/project/${params.data?.project.id}`
    //   link.target = '_blank'
    //   link.textContent = params.value
    //   return link
    // }

    // columnMap.get('salesman').children.find(col => col.field.endsWith('.name')).hide = false
    // columnMap.get('manager').children.find(col => col.field.endsWith('.name')).hide = false
    // columnMap.get('company').children.find(col => col.field.endsWith('.name')).hide = false

    progress.style.display = 'none'

    // Add lat/long to workorders based on their project,
    // b/c some workorders don't have lat/long but their projects do,
    // and we want to be able to do map visualizations and distance calculations.
    // This allows us to do map visualizations and distance calculations.
    for (const order of data) {
      if (!order.latitude) {
        const p = projects.get(order.projectNumber)
        order.latitude = p?.latitude || null
        order.longitude = p?.longitude || null
      }
    }

    let gridApi

    const applyGridState = (nextState, viewName = '') => {
      if (!nextState) return false

      try {
        gridApi.setState(nextState)
        if (viewName) {
          setActiveGridViewName(viewName)
        }
        return true
      } catch (error) {
        console.warn('Failed to apply grid state', error)
        return false
      }
    }

    const saveCurrentGridView = () => {
      const suggestedName = getActiveGridViewName()
      const input = window.prompt('Save grid view as:', suggestedName || '')
      const viewName = input?.trim()

      if (!viewName) return

      const views = getStoredGridViews()
      views[viewName] = gridApi.getState()
      setStoredGridViews(views)
      setActiveGridViewName(viewName)
      refreshToolbar()
    }

    const restoreGridView = (viewName) => {
      const nextState = getStoredGridViews()[viewName]
      if (!nextState) return

      if (applyGridState(nextState, viewName)) {
        refreshToolbar()
      }
    }

    const getGridViewMenuItems = () => {
      const activeViewName = getActiveGridViewName()
      const views = Object.entries(getStoredGridViews())
        .sort(([left], [right]) => left.localeCompare(right, 'sv'))

      const items = [{
        name: 'Save Current View...',
        action: () => saveCurrentGridView(),
      }]

      if (!views.length) {
        items.push('separator', {
          name: 'No saved views',
          disabled: true,
        })
        return items
      }

      items.push('separator', ...views.map(([viewName]) => ({
        name: viewName,
        checked: viewName === activeViewName,
        action: () => restoreGridView(viewName),
      })))

      return items
    }

    const buildToolbar = () => ({
      items: [
        'agQuickFilterToolbarItem',
        'separator',
        'agFindToolbarItem',
        'separator',
        {
          label: 'Fit Columns To Grid',
          icon: 'maximize',
          alignment: 'right',
          action: (params) => params.api.sizeColumnsToFit(),
        },
        {
          key: 'grid-views-menu',
          toolbarItem: 'agMenuToolbarItem',
          icon: 'menu',
          alignment: 'right',
          label: 'Views',
          tooltip: 'Save or restore grid views',
          toolbarItemParams: {
            menuItems: getGridViewMenuItems(),
          },
        },
        {
          toolbarItem: 'agMenuToolbarItem',
          icon: 'save',
          alignment: 'right',
          label: 'Download',
          tooltip: 'Download as CSV or Excel',
          toolbarItemParams: {
            menuItems: ['csvExport', 'excelExport'],
          },
        },
      ],
    })

    const refreshToolbar = () => {
      if (!gridApi) return
      gridApi.setGridOption('toolbar', buildToolbar())
    }

    const gridOptions = {
      localeText: AG_GRID_LOCALE_SE,
      enableCharts: !true,
      cellSelection: {
        enableColumnSelection: true,
        enableRowSelection: true,
      },
      hidePaddedHeaderRows: true,
      rowNumbers: false,

      // show row grouping at the top
      // rowGroupPanelShow: "always",
      theme: myTheme,
      rowData: data.map(row => new Proxy(row, {
        get(target, prop) {
          if (prop === 'workorder') return target
          // e.g. prop='manager' -> look up target.manager in the 'salesman' table
          const refTableName = refMap.get(prop)
          if (refTableName) {
            return table.get(refTableName)?.data.get(Reflect.get(target, prop))
          }
          return table.get(prop)?.data.get(Reflect.get(target, prop)) || target
        }
      })),
      statusBar: {
        statusPanels: [
          // {
          //   key: 'ClickableStatusBarComponent',
          //   statusPanel: ClickableStatusBarComponent,
          //   align: 'left'
          // },
          // { statusPanel: "agTotalRowCountComponent" },
          { statusPanel: "agTotalAndFilteredRowCountComponent" },
          // { statusPanel: "agFilteredRowCountComponent" },
          { statusPanel: "agSelectedRowCountComponent" },
          { statusPanel: "agAggregationComponent" },
        ],
      },
      columnDefs,
      // groupDisplayType: 'groupRows', // Visar gruppen som en hel rad ovanför barnen
      includeHiddenColumnsInAdvancedFilter: true,
      // Default settings applied to all columns
      defaultColDef: {
        flex: 1,
        // minWidth: 150,
        filter: true,
        hide: true,
        sortable: true,
        resizable: true,
        enableRowGroup: true,
        enableValue: true,

        // wrapText: true, // Wrap Text
        // autoHeight: true, // Adjust Cell Height to Fit Wrapped Text
        // floatingFilter: true // Shows the filter input directly under the header
      },

      // Pagination config
      pagination: true,
      paginationPageSize: 50,
      paginationPageSizeSelector: [25, 50, 100, 500, 1000],
    toolbar: buildToolbar(),

      // enableAdvancedFilter: true,

      // add column editor on the right
      sideBar: {
        toolPanels: [
          'columns',
          {
            id: "filters-new",
            labelDefault: "Filters",
            labelKey: "filters",
            iconKey: "filter",
            toolPanel: "agNewFiltersToolPanel",
            toolPanelParams: {
              buttons: ["cancel", "apply"],
            },
          },
        ],
        defaultToolPanel: "filters-new",
      },
      enableFilterHandlers: true,
      // autoGroupColumnDef: {
      //   minWidth: 200,
      // },
      // groupDefaultExpanded: 1,

      rowSelection: {
        mode: 'multiRow',
        groupSelects: 'descendants',
        // checkboxLocation: 'autoGroupColumn',
      },
      // treeDataDisplayType: 'custom',

      getRowId ({data}) {
        return `${data.workorder.id}`
      },

      noteTrigger: 'hover',
      notesDataSource: {
        getNote: ({ rowNode, column }) => notesStore[rowNode.id]?.[column.getColId()],
        setNote: ({ rowNode, column, note }) => {
            const row = (notesStore[rowNode.id] ??= {});

            if (note === undefined) {
                delete row[column.getColId()];
            } else {
                row[column.getColId()] = note;
            }
        },
    },
    }

    gridApi = createGrid(gridDiv, gridOptions)

    console.log(globalThis.gridApi = gridApi)

    // Global Quick Search
    // nn(document.getElementById('global-search')).addEventListener('input', (e) => {
    //   gridApi.setGridOption('quickFilterText', e.target.value);
    // })

    const activeViewName = getActiveGridViewName()
    const savedViews = getStoredGridViews()

    if (!applyGridState(savedViews[activeViewName], activeViewName)) {
      applyGridState(state)
    }

    refreshToolbar()
}


export {
  initGrid
}