import GridPattern from '../../../common/GridPattern/GridPattern.jsx'

export default function AdminNotice({ title, children }) {
  return (
    <div className="admin admin--centered">
      <GridPattern />
      <div className="card card--floating admin__card">
        <h1 className="admin__title">{title}</h1>
        {children}
      </div>
    </div>
  )
}
