export default function AdminSection({ title, children }) {
  return (
    <section className="admin__section card">
      <h2 className="admin__section-title">{title}</h2>
      {children}
    </section>
  )
}
