import AdminSection from '../AdminSection/AdminSection.jsx'

export default function AdminSectionStatus({ title, error }) {
  if (error) {
    return (
      <AdminSection title={title}>
        <p className="alert alert--error">{error}</p>
      </AdminSection>
    )
  }

  return (
    <AdminSection title={title}>
      <p className="admin__muted">Loading...</p>
    </AdminSection>
  )
}
