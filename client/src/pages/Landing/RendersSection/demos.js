export const CHART_DEMO = JSON.stringify({
  type: 'area',
  title: 'Returns created per day · last 7 days',
  xKey: 'name',
  data: [
    { name: 'Mon', value: 82 },
    { name: 'Tue', value: 96 },
    { name: 'Wed', value: 121 },
    { name: 'Thu', value: 110 },
    { name: 'Fri', value: 143 },
    { name: 'Sat', value: 68 },
    { name: 'Sun', value: 59 },
  ],
  series: [{ key: 'value', label: 'Returns', color: '#2f9e2c' }],
})

export const CSV_DEMO = `Merchant,Returns (30d),Avg refund (€),Top reason
Acme Apparel,1284,42.50,Wrong size
Northwind Home,872,58.10,Changed mind
Globex Beauty,514,27.90,Damaged
Umbrella Shoes,463,63.40,Wrong size
Initech Living,391,35.20,Not as described`

export const SQL_DEMO = `-- Soporti writes the query for you (read-only)
SELECT m.name AS merchant,
       count(*) AS returns
FROM returns r
JOIN merchants m ON m.id = r.merchant_id
WHERE r.created_at >= now() - interval '30 days'
GROUP BY m.name
ORDER BY returns DESC
LIMIT 5;`
