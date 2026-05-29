// @ts-ignore

function queryBuilder ({ page = 1, rows = 50, filters = [], orderby = [], select = [] }) {
  const params = new URLSearchParams()

  // @ts-ignore
  params.set('page', page)
  // @ts-ignore
  params.set('rows', rows)

  if (filters.length) {
    const f = filters
      .map(f => {
        if (f.op === 'contains') {
          return `contains(${f.field}, '${f.value}')`
        }
        return `${f.field} ${f.op} ${
          typeof f.value === 'string' ? `'${f.value}'` :
          f.value instanceof Date ? f.value.toISOString() :
          f.value
        }`
      })
      .join(' and ')
    params.set('$filter', f)
  }

  if (orderby.length) {
    params.set('$orderby', orderby.map(o => `${o.field} ${o.dir}`).join(', '))
  }

  if (select.length) {
    params.set('$select', select.join(','))
  }

  return params
}

export {
  queryBuilder
}